import re
from datetime import datetime
from itertools import combinations
import fitz
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from .schemas import Analysis, Clause, Obligation, Finding
from .models import linguistic_model, advanced_models, nli_scores

CATEGORIES = {
 'termination': r'\b(terminat\w*|cancel\w*|rescission)\b',
 'penalty': r'\b(penalt\w*|late fee|liquidated damages|interest on overdue)\b',
 'confidentiality': r'\b(confidential\w*|non-disclosure|disclose)\b',
 'payment': r'\b(pay\w*|invoice\w*|fee\w*|USD|EUR|GBP)\b|[$€£]',
 'deadline': r'\b(deadline|due date|no later than)\b',
 'obligation': r'\b(shall|must|required to|agrees to)\b',
}
AMOUNT = r'(?:USD|EUR|GBP|\$|€|£)\s*\d[\d,]*(?:\.\d{2})?'
DURATION = r'\b\d+\s+(?:(?:business|calendar)\s+)?(?:days?|weeks?|months?|years?)\b'
DATE = r'\b(?:\d{4}-\d{2}-\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b'
CONDITION = r'\b(?:if|unless|provided that|subject to|when|upon|after)\b.*'

def classify(text):
    return next((label for label, pattern in CATEGORIES.items() if re.search(pattern, text, re.I)), 'other')

def extract_pdf(data):
    try:
        doc = fitz.open(stream=data, filetype='pdf')
    except Exception as exc:
        raise ValueError('Malformed PDF: the document could not be opened.') from exc
    with doc:
        if doc.needs_pass:
            raise ValueError('Password-protected PDFs are unsupported. Upload an unlocked copy.')
        if len(doc) > 100:
            raise ValueError('PDF exceeds the 100-page limit.')
        pages = [(i + 1, page.get_text(sort=True)) for i, page in enumerate(doc)]
    if not pages or sum(len(t.strip()) for _, t in pages) < 30:
        raise ValueError('No readable text. Scanned or empty PDFs need OCR before upload.')
    if sum(len(t) for _, t in pages) > 300000:
        raise ValueError('Extracted text exceeds 300,000 characters.')
    return pages

def segment(pages):
    clauses, text, refs, page_ids = [], [], 'Preamble', []
    def flush():
        if text:
            value = '\n'.join(text).strip()
            clauses.append(Clause(id=f'C{len(clauses)+1:03}', reference=refs, pages=sorted(set(page_ids)), text=value, category=classify(value)))
    for page, content in pages:
        for line in content.splitlines():
            line = line.strip()
            if not line:
                continue
            match = re.match(r'^(?:Section\s+)?(\d+(?:\.\d+)*)(?:[.)]|\s)\s*(.+)$', line)
            if match:
                flush()
                refs, text, page_ids = match[1], [match[2]], [page]
            else:
                text.append(line)
                page_ids.append(page)
    flush()
    if len(clauses) > 300:
        raise ValueError('More than 300 clauses. Split this contract into smaller documents.')
    return clauses

def extract(clause, nlp):
    doc = nlp(clause.text)
    entities = {'amounts': re.findall(AMOUNT, clause.text), 'dates': re.findall(DATE, clause.text),
                'durations': re.findall(DURATION, clause.text, re.I), 'parties': []}
    for ent in doc.ents:
        key = {'ORG': 'parties', 'PERSON': 'parties', 'DATE': 'dates', 'MONEY': 'amounts'}.get(ent.label_)
        if key and ent.text not in entities[key]:
            entities[key].append(ent.text)
    result = []
    for sentence in doc.sents:
        source = sentence.text.strip()
        match = re.search(r'\b([A-Z][\w&-]*(?:[ \t]+[A-Z][\w&-]*)*)\s+(shall|must|agrees to|is required to)\s+(not\s+)?([a-z]+)\s+(.+)', source)
        if not match:
            continue
        actor, _, neg, action, obj = match.groups()
        condition = re.search(CONDITION, obj, re.I)
        if actor not in entities['parties']:
            entities['parties'].append(actor)
        result.append(Obligation(id=f'{clause.id}-O{len(result)+1}', clause_id=clause.id, actor=actor,
            action=action.lower(), object=obj, deadline=re.findall(DATE, source)+re.findall(DURATION, source, re.I),
            condition=condition[0].rstrip('.') if condition else '', polarity='prohibited' if neg else 'required', source=source, pages=clause.pages))
    clause.entities = entities
    return result

def signature(obligation):
    value = obligation.object.lower()
    value = re.sub(AMOUNT, '<amount>', value, flags=re.I)
    value = re.sub(DATE, '<date>', value, flags=re.I)
    value = re.sub(DURATION, '<duration>', value, flags=re.I)
    return re.sub(r'[^a-z<> ]', '', value).strip()

def timing_key(value):
    """Normalize only unambiguous calendar equivalents; retain business-day units."""
    value = value.lower().strip()
    duration = re.fullmatch(r'(\d+)\s+(?:(business|calendar)\s+)?(days?|weeks?|months?|years?)', value)
    if duration:
        amount, qualifier, unit = duration.groups()
        if qualifier != 'business' and unit.startswith(('day', 'week')):
            return ('calendar-days', int(amount) * (7 if unit.startswith('week') else 1))
        return (qualifier or 'calendar', unit.rstrip('s'), int(amount))
    for fmt in ('%Y-%m-%d', '%B %d, %Y', '%B %d %Y'):
        try:
            return ('date', datetime.strptime(value, fmt).date().isoformat())
        except ValueError:
            pass
    return ('literal', value)

def amount_key(value):
    value = value.replace(',', '').replace(' ', '').upper()
    # Currency symbols can be ambiguous (e.g. $); do not infer a currency.
    match = re.fullmatch(r'(USD|EUR|GBP|[$€£])(\d+(?:\.\d+)?)', value)
    return (match[1], float(match[2])) if match else value


def compare(clauses, obligations, bundle):
    if len(clauses) < 2:
        return []
    texts = [c.text for c in clauses]
    if bundle:
        matrix = bundle[0].encode(texts, normalize_embeddings=True)
        similarities = matrix @ matrix.T
    else:
        try:
            similarities = cosine_similarity(TfidfVectorizer(stop_words='english').fit_transform(texts))
        except ValueError:
            return []
    by_clause = {c.id: [o for o in obligations if o.clause_id == c.id] for c in clauses}
    findings = []
    candidates = sorted(combinations(range(len(clauses)), 2), key=lambda ij: float(similarities[ij[0], ij[1]]), reverse=True)
    nli_calls = 0
    for i, j in candidates:
        a, b = clauses[i], clauses[j]
        matches = [(x, y) for x in by_clause[a.id] for y in by_clause[b.id]
                   if x.actor.lower() == y.actor.lower() and x.action == y.action
                   and x.condition.lower() == y.condition.lower() and signature(x) == signature(y)]
        if not matches or similarities[i, j] < .25:
            continue
        reasons = []
        for x, y in matches:
            if signature(x) != signature(y):
                continue
            ax, ay = re.findall(AMOUNT, x.source), re.findall(AMOUNT, y.source)
            if ax and ay and [amount_key(v) for v in ax] != [amount_key(v) for v in ay]:
                reasons.append('Different stated amounts for the same actor, action and textual scope.')
            if x.deadline and y.deadline and [timing_key(v) for v in x.deadline] != [timing_key(v) for v in y.deadline]:
                reasons.append('Different timing terms for the same actor, action and textual scope; overlapping limits may still be compatible.')
            if x.polarity != y.polarity:
                reasons.append('One clause requires an action that the other prohibits in the same textual scope.')
        scores = {}
        if bundle and nli_calls < 100:
            scores = nli_scores((a.text, b.text), bundle)
            nli_calls += 1
        if scores.get('contradiction', 0) >= .8:
            reasons.append('Pretrained NLI flagged a possible contradiction; scope and exceptions need human verification.')
        if reasons:
            findings.append(Finding(id=f'F{len(findings)+1:03}', clause_ids=[a.id,b.id], kind='Potential inconsistency',
                explanation=' '.join(dict.fromkeys(reasons)), evidence=[a.text,b.text],
                method='rules + NLI' if scores else 'scope-matched rules', scores=scores))
        if len(findings) >= 100:
            break
    return findings

def analyze(data, filename):
    pages = extract_pdf(data)
    clauses = segment(pages)
    nlp, ner_method = linguistic_model()
    bundle, warning = advanced_models()
    obligations = [o for c in clauses for o in extract(c, nlp)]
    warnings = [warning] if warning else []
    if 'unavailable' in ner_method:
        warnings.append('Trained spaCy NER is unavailable; extraction uses explicitly identified linguistic rules.')
    if bundle:
        warnings.append('NLI evaluates at most 100 retrieved, actor/action/condition-matched pairs; inputs truncate at 512 tokens. Scores are not calibrated legal probabilities.')
    warnings.append('English text PDFs only. Findings are review candidates, not legal conclusions. Unnumbered text is retained as one section.')
    if any(len(t.strip()) < 30 for _, t in pages):
        warnings.append('Some pages contain little or no text and may require OCR.')
    return Analysis(page_texts=[{'page': p, 'text': t} for p, t in pages], filename=filename, pages=len(pages), clauses=clauses, obligations=obligations,
        findings=compare(clauses, obligations, bundle), warnings=warnings,
        methods={'classification':'Ordered keyword baseline (no confidence score)', 'extraction':ner_method,
                 'retrieval':'MiniLM sentence embeddings + shared actors' if bundle else 'TF-IDF cosine + shared actors',
                 'contradiction':'DeBERTa NLI + conservative rules' if bundle else 'Conservative scope-matched rules; NLI not run'})
