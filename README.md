# ClauseTrap

[Open the public GitHub Pages edition](https://kevinsynet.github.io/clausetrap/). Uploaded PDFs stay in the browser. Pages uses PDF.js and matching rules for individual obligations. Run the Python edition below for spaCy and optional NLI. Rebuild the hosted edition with `cd frontend && npm ci && npm run build -- --mode pages --base /clausetrap/`, then copy the contents of dist into docs.

A local, evidence-first contract review mini-project. React + Vite + Tailwind + Lucide frontend; Python 3.11 + FastAPI backend. No accounts, paid API, database, or cloud runtime. Contracts are processed in memory; multipart uploads may use the OS temporary directory and are closed after processing. Refreshing the browser clears the current review.

## Setup

From this directory, with Python 3.11 and Node 20.19+ or 22.12+:

```sh
python3.11 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
.venv/bin/python -m spacy download en_core_web_sm
cd frontend
npm ci
cd ..
./run.sh
```

On macOS, after setup you can also double-click `Start-ClauseTrap.command`. Keep its Terminal window open while using the app. Open http://127.0.0.1:5173. API and interactive OpenAPI schemas: http://127.0.0.1:8017/docs. The backend uses 8017 to avoid another local service found on port 8000. Ctrl+C stops the launcher. The frontend proxies `/api`; no CORS setup is needed. `CLAUSETRAP_PYTHON` can select another existing interpreter.

### Pretrained embedding + NLI mode

Explicit one-time download, then offline inference from the cache:

```sh
export HF_HOME="$PWD/.cache/huggingface"
.venv/bin/python backend/download_models.py
CLAUSETRAP_ADVANCED=1 ./run.sh
```

Default mode uses an evaluated keyword classifier, spaCy NER (when installed), linguistic extraction rules, TF-IDF retrieval and scope-matched checks. Advanced mode adds cached MiniLM sentence embeddings and the genuinely pretrained DeBERTa NLI classifier. Missing model weights produce an explicit warning and named baseline methods; there is no fabricated inference. The clause category classifier remains the keyword baseline in both modes.

The downloaded weights are approximately 500 MB in total. Loading and CPU inference take time. Models are cached once per backend process; restart after downloading or changing mode. No inference request downloads weights. Use `HF_HUB_OFFLINE=1` for an additional offline guard.

## Use

1. Load the included sample or drag an English text PDF onto the upload area.
2. Inspect Overview and its method/limitation disclosure.
3. Search/filter clauses; open an evidence dialog for source pages and entities.
4. Select an actor in the obligation map to filter the register.
5. Review dates, durations, penalties and potential inconsistencies.
6. In Conflicts, open **How to resolve this**. When two obligations differ in a single supported term, select the intended wording to preview a replacement sentence. Complex findings offer manual review guidance. Drafts are temporary browser previews.
7. Export the full analysis as JSON or the obligation register as CSV. CSV cells beginning with formula characters are escaped.

The sample contains 14 numbered clauses plus a preamble, 11 explicit obligations, two actors and three deliberate review pairs: delivery timing (§2/§3), fee amounts (§4/§5), and disclosure/prohibition (§6/§7). §12 and §13 are different-scope/conditional negative controls. Different timing limits can be compatible; the tool flags them for checking rather than declaring a contradiction.

Limits: 10 MB, 100 pages, 300,000 extracted characters and 300 clauses. Encrypted, malformed and textless/scanned PDFs receive actionable errors. OCR is not included. Mixed scanned/text pages raise a warning. Only one analysis runs at a time. NLI is capped at 100 eligible pairs and 512 input tokens per pair. Very long clauses can lose information through truncation. No persistent user tracking, uploads, telemetry or remote fonts.

## Verification

From the project root, run:

```sh
(cd backend && ../.venv/bin/python -m pytest -q)
(cd frontend && npm run build)
(cd backend && ../.venv/bin/python evaluate.py)
# Compare scope-rules baseline to pretrained embedding/NLI hybrid:
(cd backend && HF_HOME="$PWD/../.cache/huggingface" CLAUSETRAP_ADVANCED=1 ../.venv/bin/python evaluate.py)
```

`data/evaluation-results.json` contains actual measurements and predictions. `data/evaluation.json` is a small author-written labeled diagnostic fixture, not a representative benchmark. See `RESEARCH.md` for interpretation, sources and limitations. `backend/requirements-lock.txt` records the tested macOS/Python 3.11 package versions; use broad compatible requirements on other platforms if platform-specific wheels differ. `frontend/package-lock.json` pins frontend dependencies.

## Structure

- `backend/app/main.py`: API, upload validation, concurrency guard.
- `backend/app/pipeline.py`: extraction, segmentation, baseline categories, entities, obligations, pair retrieval and review findings.
- `backend/app/models.py`: cached spaCy, MiniLM and NLI models; explicit method reporting.
- `backend/app/schemas.py`: typed JSON/OpenAPI response models.
- `frontend/src/`: typed React interface, reusable source/evidence interactions and responsive styling.
- `data/`: sample contract, labeled evaluation cases and measured results.

The JSON response contains `clauses`, `obligations`, `findings`, `methods`, and `warnings`. Every obligation has clause IDs, pages and source text; every finding has both source texts and clause IDs. Scores are present only when NLI actually ran. These are uncalibrated model probabilities, not legal risk scores.
