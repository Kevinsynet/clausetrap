"""Explicit one-time download; normal API inference uses local cache only."""
from sentence_transformers import SentenceTransformer
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from app.models import EMBEDDING, NLI, EMBEDDING_REVISION, NLI_REVISION
SentenceTransformer(EMBEDDING, revision=EMBEDDING_REVISION)
AutoTokenizer.from_pretrained(NLI, revision=NLI_REVISION)
AutoModelForSequenceClassification.from_pretrained(NLI, revision=NLI_REVISION)
print('Embedding and NLI models cached. Set CLAUSETRAP_ADVANCED=1 and restart the backend.')
