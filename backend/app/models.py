"""Explicit optional pretrained inference. No network access during analysis."""
from functools import lru_cache
import os

EMBEDDING = 'sentence-transformers/all-MiniLM-L6-v2'
NLI = 'cross-encoder/nli-deberta-v3-small'
EMBEDDING_REVISION = '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'
NLI_REVISION = 'fa2804872c3b4bd748f38c0185cc85775361e735'

@lru_cache(maxsize=1)
def linguistic_model():
    import spacy
    try:
        return spacy.load('en_core_web_sm'), 'spaCy en_core_web_sm NER + rules'
    except OSError:
        nlp = spacy.blank('en')
        nlp.add_pipe('sentencizer')
        return nlp, 'spaCy tokenizer + rules (trained NER unavailable)'

@lru_cache(maxsize=1)
def advanced_models():
    if os.environ.get('CLAUSETRAP_ADVANCED') != '1':
        return None, 'Advanced models disabled; set CLAUSETRAP_ADVANCED=1 after downloading.'
    try:
        from sentence_transformers import SentenceTransformer
        from transformers import AutoTokenizer, AutoModelForSequenceClassification
        embed = SentenceTransformer(EMBEDDING, revision=EMBEDDING_REVISION, local_files_only=True)
        tokenizer = AutoTokenizer.from_pretrained(NLI, revision=NLI_REVISION, local_files_only=True)
        model = AutoModelForSequenceClassification.from_pretrained(NLI, revision=NLI_REVISION, local_files_only=True)
        model.eval()
        return (embed, tokenizer, model), ''
    except Exception as exc:
        return None, f'Advanced models unavailable ({type(exc).__name__}); explicit lexical baseline in use.'

def nli_scores(pair, bundle):
    import torch
    _, tokenizer, model = bundle
    inputs = tokenizer(pair[0], pair[1], return_tensors='pt', truncation=True, max_length=512)
    with torch.inference_mode():
        probabilities = model(**inputs).logits.softmax(dim=-1)[0].tolist()
    # Published model card specifies 0=contradiction, 1=entailment, 2=neutral.
    return dict(zip(['contradiction', 'entailment', 'neutral'], probabilities))
