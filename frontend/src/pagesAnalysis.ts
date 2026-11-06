import {responsibilityHeading,readDuties} from './responsibility';
import {getDocument, GlobalWorkerOptions} from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {resolutionFor} from './resolution.mjs';
import type {Analysis,Clause,Obligation,Finding} from './types';

GlobalWorkerOptions.workerSrc = worker;
const months = 'January February March April May June July August September October November December'.split(' ').join('|');
const datePattern = new RegExp('\\b(?:\\d{4}-\\d{2}-\\d{2}|(?:'+months+')\\s+\\d{1,2},?\\s+\\d{4})\\b','gi');
const durationPattern = /\b\d+\s+(?:(?:business|calendar)\s+)?(?:days?|weeks?|months?|years?)\b/gi;
const moneyPattern = /(?:USD|GBP|EUR|[$£€])\s*\d[\d,]*(?:\.\d+)?/gi;
const categories:[string,RegExp][] = [
  ['termination',/\b(terminat\w*|cancel\w*|rescission)\b/i],
  ['penalty',/\b(penalt\w*|late fee|liquidated damages)\b/i],
  ['confidentiality',/\b(confidential\w*|disclose|non-disclosure)\b/i],
  ['payment',/\b(pay\w*|invoice\w*|fees?|USD|GBP|EUR)\b|[$£€]/i],
  ['deadline',/\b(deadline|due date|no later than)\b/i],
  ['obligation',/\b(must|shall|required to|agrees to)\b/i]
];

export async function analyzeInBrowser(upload?:File):Promise<Analysis> {
  const bytes=upload ? await upload.arrayBuffer() : await fetch(import.meta.env.BASE_URL+'sample-contract.pdf').then(r=>{
    if(!r.ok)throw new Error('The sample PDF could not be loaded.');
    return r.arrayBuffer();
  });
  if(bytes.byteLength>10*1024*1024)throw new Error('Maximum PDF size is 10 MB.');
  const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false});
  try {
    const pdf=await task.promise;
    if(pdf.numPages>100)throw new Error('The maximum is 100 pages per PDF.');
    const clauses:Clause[]=[];
    const obligations:Obligation[]=[];
    const findings:Finding[]=[];
    const page_texts:{page:number;text:string}[]=[];
    let size=0;
    let activeOwner:string|undefined;
    const owners=new Map<string,string>();
    for(let page=1;page<=pdf.numPages;page++){
      const content=await (await pdf.getPage(page)).getTextContent();
      const lines=content.items.map(item=>'str' in item ? item.str+(item.hasEOL?'\n':' ') : '').join('').split('\n');
      page_texts.push({page,text:lines.join('\n')});
      for(const raw of lines){
        const line=raw.replace(/[\u200b-\u200d\ufeff]/g,'').trim();
        if(!line)continue;
        size+=line.length;
        if(size>300000)throw new Error('Extracted text exceeds 300,000 characters.');
        const heading=line.match(/^(?:Section\s+)?(\d+(?:\.\d+)*)(?:[.)]|\s)\s*(.+)$/);
        const role=responsibilityHeading(line);
        if(role)activeOwner=role;
        if(heading && /^[A-Z][A-Z &/-]{4,}$/.test(heading[2]))activeOwner=undefined;
        if(heading||role||!clauses.length){
          if(clauses.length>=300)throw new Error('Split PDFs with more than 300 clauses.');
          clauses.push({id:'C'+String(clauses.length+1).padStart(3,'0'),reference:heading?.[1]||'Preamble',text:heading?.[2]||line,pages:[page],category:'other',entities:{}});
          if(activeOwner && heading)owners.set(clauses[clauses.length-1].id,activeOwner);
        }else{
          const c=clauses[clauses.length-1];c.text+='\n'+line;if(!c.pages.includes(page))c.pages.push(page);
        }
      }
    }
    if(size<30)throw new Error('Too little readable text. Scanned PDFs need OCR before upload.');
    for(const c of clauses){
      c.category=categories.find(([,pattern])=>pattern.test(c.text))?.[0]||'other';
      c.entities={parties:[],amounts:c.text.match(moneyPattern)||[],dates:c.text.match(datePattern)||[],durations:c.text.match(durationPattern)||[]};
      const owner=owners.get(c.id);
      const lines=c.text.split('\n');
      const body=!owner && lines.length>1 && lines[0].length<75 && !/\b(?:must|shall|agrees?)\b/i.test(lines[0]) ? lines.slice(1).join('\n') : c.text;
      for(const d of readDuties(body,owner)){
        if(!c.entities.parties.includes(d.actor))c.entities.parties.push(d.actor);
        obligations.push({...d,id:'O'+(obligations.length+1),clause_id:c.id,pages:c.pages,
          deadline:[...(d.source.match(datePattern)||[]),...(d.source.match(durationPattern)||[])],
          condition:d.source.match(/\b(?:if|unless|provided that|after|upon|when|subject to|basis registration count)\b[\s\S]*/i)?.[0]||''});
      }
    }
    const groups=new Map<string,Obligation[]>();
    for(const o of obligations){
      const group=groups.get(o.clause_id)||[];group.push(o);groups.set(o.clause_id,group);
    }
    for(let i=0;i<clauses.length;i++)for(let j=i+1;j<clauses.length&&findings.length<100;j++){
      const a=clauses[i], b=clauses[j], left=groups.get(a.id),right=groups.get(b.id);
      if(left?.length!==1||right?.length!==1||left[0].actor!==right[0].actor||left[0].action!==right[0].action)continue;
      const f:Finding={id:'F'+String(findings.length+1).padStart(3,'0'),clause_ids:[a.id,b.id],evidence:[a.text,b.text],kind:'Potential inconsistency',status:'Human review required',method:'Browser text comparison',scores:{},explanation:''};
      const guide=resolutionFor(f,[left[0],right[0]]);
      if(!guide)continue;
      f.explanation=guide.label+' differs for the same obligation: “'+guide.spans[0].term+'” versus “'+guide.spans[1].term+'”.';
      findings.push(f);
    }
    return {page_texts,filename:upload?.name||'sample-contract.pdf',pages:pdf.numPages,clauses,obligations,findings,methods:{classification:'Browser keyword rules',extraction:'PDF.js and explicit obligation patterns',contradiction:'Single-term text differences in matching obligations'},warnings:['GitHub Pages runs the browser rules baseline. The Python edition includes spaCy and optional embedding/NLI models.','Only single-obligation pairs differing in a supported term are flagged. Equivalent expressions can be flagged and paraphrases missed.','Scanned pages require OCR. Review the original PDF for completeness.']};
  } finally {await task.destroy();}
}
