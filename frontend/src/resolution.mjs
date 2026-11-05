// A draft is possible only when replacing one source phrase reconciles both duties.
const fields = [
  { label: 'Fee or amount', pattern: /(?:\b(?:USD|EUR|GBP)\s*|[$€£]\s*)\d[\d,]*(?:\.\d+)?/gi,
    question: 'Which amount did the parties agree to for this obligation? Check the approved fee schedule before choosing.' },
  { label: 'Timing', pattern: /\b(?:\d+\s+(?:(?:business|calendar)\s+)?(?:days?|weeks?|months?|years?)|\d{4}-\d{2}-\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/gi,
    question: 'Do both limits apply to the same event? A shorter deadline can satisfy both. If the parties intended one deadline, confirm it against the agreed schedule.' },
  { label: 'Required or prohibited action', pattern: /\b(?:shall|must|agrees to|is required to)\s+(?:not\s+)?[a-z]+\b/gi,
    question: 'Should this actor perform the action or refrain from it? Check whether a consent requirement or an exception explains the difference.' },
];
const normalize = text => text.toLowerCase().replace(/\s+/g, ' ').trim();

function dutyText(o) {
  const escaped = o.actor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = o.source.search(new RegExp('\\b' + escaped + '\\s+(?:shall|must|agrees to|is required to)\\b', 'i'));
  return start < 0 ? '' : o.source.slice(start);
}

export function resolutionFor(finding, obligations) {
  const [leftId, rightId] = finding.clause_ids;
  const left = obligations.filter(o => o.clause_id === leftId);
  const right = obligations.filter(o => o.clause_id === rightId);
  if (left.length !== 1 || right.length !== 1) return null;
  const a = left[0], b = right[0];
  if (normalize(a.actor) !== normalize(b.actor) || a.action !== b.action || normalize(a.condition) !== normalize(b.condition)) return null;
  const texts = [dutyText(a), dutyText(b)];
  if (texts.some(t => !t)) return null;
  for (const field of fields) {
    const matches = texts.map(t => [...t.matchAll(field.pattern)]);
    for (const lhs of matches[0]) for (const rhs of matches[1]) {
      const parts = [lhs, rhs];
      if (normalize(lhs[0]) === normalize(rhs[0])) continue;
      const frames = texts.map((t,i) => normalize(t.slice(0,parts[i].index) + '<term>' + t.slice(parts[i].index + parts[i][0].length)));
      if (frames[0] !== frames[1]) continue;
      const spans = parts.map((m,i) => {
        const clause = finding.evidence[i];
        const start = clause.indexOf(texts[i]);
        if (start < 0 || start !== clause.lastIndexOf(texts[i])) return null;
        return {start:start + m.index, term:m[0]};
      });
      if (spans.some(s => !s)) return null;
      return {label:field.label, question:field.question, spans, drafts:parts.map((m,i) => {
        const other = 1-i, n = parts[other];
        return texts[other].slice(0,n.index) + m[0] + texts[other].slice(n.index+n[0].length);
      })};
    }
  }
  return null;
}
