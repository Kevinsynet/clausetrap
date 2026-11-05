import fitz
import pytest
from fastapi.testclient import TestClient
from app.main import app, SAMPLE
from app.pipeline import analyze, classify, extract_pdf, segment

client = TestClient(app)

def pdf(text):
    doc=fitz.open();page=doc.new_page();page.insert_textbox(fitz.Rect(40,40,550,700),text)
    return doc.tobytes()

def test_complete_sample():
    result=client.post('/api/sample')
    assert result.status_code==200
    data=result.json()
    assert len(data['clauses'])>=14
    assert len(data['obligations'])>=10
    assert len(data['findings'])==3
    assert all(len(f['evidence'])==2 and not f['scores'] for f in data['findings'])
    assert data['pages']==2
    assert {'Client','Supplier'} <= {o['actor'] for o in data['obligations']}
    assert all(c['pages'] for c in data['clauses'])

def test_uploaded_sample_matches():
    uploaded=client.post('/api/analyze', files={'file':('sample.pdf',SAMPLE.read_bytes(),'application/pdf')})
    assert uploaded.status_code==200
    assert uploaded.json()['findings']==client.post('/api/sample').json()['findings']

@pytest.mark.parametrize('text',[
 '1. Supplier shall deliver the report within 30 days after approval.\n2. Client shall deliver the report within 45 days after approval.',
 '1. Supplier shall deliver the report within 30 days after approval.\n2. Supplier shall deliver the manual within 45 days after approval.',
 '1. Supplier shall deliver the report within 30 days after approval.\n2. Supplier shall deliver the report within 45 days if revisions are requested.',
 '1. Supplier shall deliver the report within 30 days after approval.\n2. Supplier shall deliver the report within 30 days after approval.'
])
def test_avoid_false_positives(text):
    assert not analyze(pdf(text),'test.pdf').findings

def test_polarity_conflict():
    result=analyze(pdf('1. Supplier shall disclose the report to customers.\n2. Supplier shall not disclose the report to customers.'),'test.pdf')
    assert len(result.findings)==1

def test_nested_cross_page_reference():
    clauses=segment([(1,'1. Delivery\n1.1 Supplier shall deliver the report'),(2,'within 30 days.\n2. Payment\nClient must pay USD 40.')])
    assert clauses[1].reference=='1.1'
    assert clauses[1].pages==[1,2]

def test_bad_pdf():
    assert client.post('/api/analyze',files={'file':('x.pdf',b'not a pdf')}).status_code==415
    assert client.post('/api/analyze',files={'file':('x.pdf',b'%PDF-broken')}).status_code==422

def test_empty_and_encrypted():
    assert client.post('/api/analyze',files={'file':('x.pdf',pdf(''))}).status_code==422
    doc=fitz.open();doc.new_page()
    encrypted=doc.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256,owner_pw='secret',user_pw='secret')
    with pytest.raises(ValueError,match='Password'):
        extract_pdf(encrypted)

def test_oversized():
    assert client.post('/api/analyze',files={'file':('x.pdf',b'%PDF-'+b'x'*(10*1024*1024))}).status_code==413

def test_page_limit():
    doc=fitz.open()
    for _ in range(101):doc.new_page()
    with pytest.raises(ValueError,match='100-page'):
        extract_pdf(doc.tobytes())

def test_download():
    assert client.get('/api/sample.pdf').content.startswith(b'%PDF-')

def test_equivalent_calendar_terms_and_amount_format():
    assert not analyze(pdf('1. Supplier shall deliver the report within 4 weeks.\n2. Supplier shall deliver the report within 28 days.'),'same.pdf').findings
    assert not analyze(pdf('1. Client shall pay USD 5,000 for the report.\n2. Client shall pay USD 5000.00 for the report.'),'same.pdf').findings
