# ClauseTrap: evidence-grounded cross-clause review

## Problem and aim

Contracts distribute responsibilities, amounts and timing across sections. ClauseTrap aims to produce a traceable obligation register and identify pairs worth checking, while retaining the wording and page references needed for human review. It is a reproducible research prototype, not a legally validated decision system.

## Research context and verified references

1. **LegalAI Across Languages: A Comprehensive Survey on Tasks, Methodologies and Challenges.** IEEE, *2025 1st International Conference on AIML-Applications for Engineering & Technology (ICAET)*, conference dates 16–17 January 2025; added to IEEE Xplore 26 March 2025. DOI: **10.1109/ICAET63349.2025.10932297**. [IEEE publisher record](https://ieeexplore.ieee.org/document/10932297/). Title, venue, dates and DOI were verified from the publisher's indexed metadata; direct page retrieval presented a JavaScript verification gate. Authors are intentionally omitted because they were not verified. This survey maps multilingual legal NLP tasks, methods and dataset challenges. It supplies contextual motivation; this project does not replicate its experiments or claim its results.
2. Amrita Singh, Aditya Joshi, Jiaojiao Jiang and Hye-young Paik. **A survey of classification tasks and approaches for legal contracts.** *Artificial Intelligence Review* 58, article 380 (2025), published 17 October 2025. DOI: **10.1007/s10462-025-11359-8**. [Publisher article](https://link.springer.com/article/10.1007/s10462-025-11359-8). This is a verified 2025 contract-specific survey, **not an IEEE publication**. It motivates separating classification tasks, datasets and evaluation criteria.
3. [Sentence Transformers NLI model card](https://huggingface.co/cross-encoder/nli-deberta-v3-small): pretrained on SNLI and MultiNLI, with label order contradiction / entailment / neutral. We use the trained sequence-classification head, not random weights or an embedding model masquerading as a classifier. Published general-domain model scores are not ClauseTrap results.
4. [MiniLM model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2): semantic retrieval model; similarity is not a contradiction probability.

The project aligns with evidence traceability, classification transparency and domain-evaluation concerns in recent research. No IEEE endorsement or research novelty is claimed.

## Architecture and implemented algorithms

```text
React upload / sample
        ↓ multipart HTTP (local Vite proxy)
FastAPI validation → PyMuPDF page text
        ↓
Numbered / nested section segmentation + source page sets
        ↓
Keyword category baseline + spaCy NER + obligation rules
        ↓
TF-IDF or MiniLM similarity → shared actor/action/condition/scope gates
        ↓
Normalized numeric / timing / polarity checks + optional pretrained NLI
        ↓
Pydantic JSON → evidence explorer, register, timeline, pair inspector, exports
```

**Extraction and segmentation.** Read each PDF page in geometric reading order. Recognize numeric section starts and dotted subsections. Keep stable internal IDs separately from original references, retain newlines and track all contributing pages. Unnumbered text is retained in a section/preamble. No OCR, layout model, table parser or cross-reference resolver is implemented.

**Categories.** Deterministic ordered patterns classify termination, penalty, confidentiality, payment, deadline, obligation and other. The first matching category wins; a payment clause may still contain an obligation. It is explicitly a single-label keyword baseline, with no confidence score. The order is fixed in `pipeline.py` and evaluated below.

**Entities and obligations.** Cached `en_core_web_sm` supplies trained NER and sentence segmentation. Regex rules supplement money, ISO/month-name dates and numerical durations. Explicit modal constructions (`shall`, `must`, `agrees to`, `is required to`) produce actor, action, object, polarity, timing, condition, clause and page records. Actor extraction currently assumes capitalized actors; party aliases and pronouns are not resolved. Actions and objects are linguistic-rule spans, not learned semantic roles. A blank spaCy tokenizer is available only as a clearly disclosed fallback if the trained pipeline is missing.

**Related pairs.** Baseline retrieval uses TF-IDF cosine similarity. Advanced retrieval uses normalized MiniLM sentence embeddings. Pairs require similarity ≥0.25, an exact actor/action/condition match, and the same normalized object wording. Numeric money/date/duration spans are replaced for scope matching. This conservative gate sacrifices recall to reduce unrelated-obligation comparisons. It cannot establish true legal scope equivalence.

**Review checks.** Compare stated amounts, timing terms and positive/prohibited polarity within the gated scope. Normalize numeric formatting and unambiguous calendar days/weeks; preserve business-day distinctions and avoid inferring ambiguous currency symbols. Different upper-bound deadlines may both be satisfiable: these are *review candidates*, not proven logical contradictions.

**Advanced NLI.** `cross-encoder/nli-deberta-v3-small` evaluates the original clause pair, softmaxing actual logits. Contradiction ≥0.8 adds a review reason. Thresholds are heuristic, not calibrated. Rules can raise a finding even when NLI is neutral. A maximum of 100 eligible pairs runs through NLI, in retrieval-similarity order; each pair truncates at 512 tokens. The model checks one premise/hypothesis direction. Domain shift and truncation can undermine the result. NLI never overrides the scope gate.

Models are loaded once per process and strictly from the local cache during inference. Explicit download commands cache pinned repository revisions recorded in `models.py`. Analysis never calls a hosted model API.

## Datasets and experimental protocol

Implemented evaluation uses `data/evaluation.json`: **28 category examples** (four per label) and **14 review pairs** (seven positive, seven negative). The examples include altered actors, scopes and conditions, missed paraphrases, unseen modal verbs and equivalent calendar durations. Labels were written by the implementer. Review labels indicate whether comparison is warranted, not legal contradiction.

Run `backend/evaluate.py` as documented in README. The script computes per-class and macro precision/recall/F1 with scikit-learn, plus positive-class pair metrics and every pair prediction. Advanced mode evaluates both the TF-IDF/rules baseline and MiniLM/NLI/rules hybrid on exactly the same cases. No clause-category model is trained in this project.

**These examples were inspected during development and used to improve scope gates and calendar normalization. They are a diagnostic/regression set, not an unseen test set.** There is no train/test performance claim. No legal experts adjudicated labels, no confidence intervals are estimated, and no statistical significance claim is made. The sample contract is separate but closely related to these templates. Model pretraining may overlap broad task patterns; contamination cannot be excluded.

## Measured results

See the table below and the machine-readable `data/evaluation-results.json`. Values are actual local executions, not estimates. Pair evaluation measures the end-to-end gated finding decision rather than NLI in isolation.

| Method | Examples | Precision | Recall | F1 |
|---|---:|---:|---:|---:|
| Clause classification (macro average) | 28 | 0.826 | 0.750 | 0.770 |
| TF-IDF and scope rules | 14 | 1.000 | 0.714 | 0.833 |
| MiniLM, NLI and scope rules | 14 | 0.833 | 0.714 | 0.769 |

Both pair methods found five of seven positive cases. Both missed the paraphrased action and the unseen modal verb. The hybrid additionally flagged “4 weeks” versus “28 days” despite their calendar equivalence. The interface defaults to the baseline, which had higher precision on this fixture.

The two-page demonstration yielded 14 numbered clauses plus a preamble, 11 obligations and three evidence-linked review pairs. Both inference modes ran on this PDF.

## Limitations and error analysis

The category baseline misses implicit or synonymous wording and overpredicts keyword-bearing clauses. Single-label precedence loses overlapping categories. Structured extraction misses `will`, lower-case actor names, passive voice, joint actors and implicit duties; it can retain heading text in sentence evidence. Modal `may` termination permissions remain visible as termination clauses but are not mandatory obligations. All extracted durations are displayed as timing terms; event anchoring is not reliably inferred.

Exact action/scope gates miss paraphrased contradictions and unresolved aliases. Numerical differences do not themselves prove incompatible duties. Business calendars, cumulative fees, precedence clauses, exceptions, negation scope and governing law need expert review. NLI is trained on general-domain inference; its softmax scores are not calibrated probabilities of legal inconsistency. The advanced method should not be presumed superior to the baseline.

PDF headers and footers can enter clause text. Multi-column PDFs, tables, atypical numbering, multilingual documents and scanned pages can segment poorly. Mixed text/image PDFs may hide information despite warnings. The system does not provide page-image highlighting or verify page text against rendering. Exported JSON includes source text and page references, enabling manual checking.

## Implemented versus proposed

**Implemented:** local PDF/API/UI workflow, typed schemas, section/page provenance, evaluated baseline categories, spaCy NER/rules, obligation records, lexical/semantic retrieval, pretrained NLI, conservative review checks, model/cache disclosure, document limits, filter/search, actor-linked register, source-order timing view, penalty list, evidence dialogs, JSON/CSV export, synthetic evaluation and error-path tests.

**Proposed, not implemented:** train a multi-label legal classifier; evaluate on [CUAD](https://www.atticusprojectai.org/cuad) and [ContractNLI](https://stanfordnlp.github.io/contract-nli/); create expert-adjudicated clause-pair annotations split by contract; measure extraction span/slot F1 and retrieval recall@k; calibrate NLI thresholds on a development set; run ablations separating embeddings, gates, rules and NLI; resolve actor aliases and cross-references; add OCR/layout parsing and page-image evidence highlighting. Dataset licenses and annotation definitions must be checked before incorporation. These external datasets were not downloaded or evaluated here.
