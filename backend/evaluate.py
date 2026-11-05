"""Run a disclosed synthetic diagnostic set. No training or threshold fitting."""
import json
from pathlib import Path
from sklearn.metrics import precision_recall_fscore_support, classification_report
from app.pipeline import classify, segment, extract, compare
from app.models import linguistic_model, advanced_models

root=Path(__file__).resolve().parents[1]
data=json.loads((root/'data/evaluation.json').read_text())
truth=[r['label'] for r in data['classification']]
pred=[classify(r['text']) for r in data['classification']]
report={'dataset':'Author-written synthetic diagnostic set v1; not independent legal validation',
        'classification':classification_report(truth,pred,zero_division=0,output_dict=True)}
nlp,_=linguistic_model()
bundle,warning=advanced_models()

def evaluate_pairs(model):
    actual=[];predicted=[]
    for row in data['pairs']:
        clauses=segment([(1,'1. '+row['a']+'\n2. '+row['b'])])
        obligations=[o for c in clauses for o in extract(c,nlp)]
        actual.append(row['review'])
        predicted.append(bool(compare(clauses,obligations,model)))
    p,r,f,_=precision_recall_fscore_support(actual,predicted,average='binary',zero_division=0)
    return {'precision':p,'recall':r,'f1':f,'n':len(actual),'labels':actual,'predictions':predicted}

report['scope_rules_tfidf']=evaluate_pairs(None)
report['advanced_hybrid']=evaluate_pairs(bundle) if bundle else {'status':'not run','reason':warning}
(root/'data/evaluation-results.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
