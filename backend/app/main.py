from pathlib import Path
from threading import Lock
from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.responses import Response
from .pipeline import analyze
from .schemas import Analysis

app = FastAPI(title='ClauseTrap', version='1.0.0')
analysis_lock = Lock()
SAMPLE = Path(__file__).resolve().parents[2] / 'data' / 'sample-contract.pdf'

@app.get('/api/health')
def health():
    return {'status': 'ok'}

def run(data, filename):
    if not analysis_lock.acquire(blocking=False):
        raise HTTPException(429, 'An analysis is already running. Try again shortly.')
    try:
        return analyze(data, filename)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        analysis_lock.release()

@app.post('/api/analyze', response_model=Analysis)
def upload(file: UploadFile):
    try:
        data = file.file.read(10 * 1024 * 1024 + 1)
        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(413, 'Maximum PDF size is 10 MB.')
        if not data.lstrip().startswith(b'%PDF-'):
            raise HTTPException(415, 'Upload a PDF document.')
        return run(data, Path(file.filename or 'contract.pdf').name)
    finally:
        file.file.close()

@app.post('/api/sample', response_model=Analysis)
def sample():
    return run(SAMPLE.read_bytes(), SAMPLE.name)

@app.get('/api/sample.pdf')
def sample_pdf():
    return Response(SAMPLE.read_bytes(), media_type='application/pdf', headers={'Content-Disposition':'attachment; filename="sample-contract.pdf"'})
