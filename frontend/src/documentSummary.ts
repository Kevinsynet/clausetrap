import type {Analysis, Clause} from './types';

type Passage = {text:string; clause:Clause; heading:string; order:number};
export type SummaryLine = {label:string; text:string; sources:Clause[]};

const subjects = [
  [/\bregistrations?|sign[ -]?ups?\b/i, 'registration'],
  [/\bpromot\w*|publicity|social media|marketing\b/i, 'promotion'],
  [/\bsponsor\w*\b/i, 'sponsorship'],
  [/\bdeliver\w*|milestones?\b/i, 'delivery'],
  [/\bpay(?:ment|able)?\b|\bfees?\b/i, 'payment'],
  [/\bconfidential\w*|disclos\w*\b/i, 'sharing information'],
  [/\bterminat\w*|cancel\w*\b/i, 'ending the agreement'],
] as const;
const duty=/\b(?:must|shall|agrees? to|will|required to)\b/i;
const participants=/\b(?:between|parties (?:are|include)|commissions?|engages?|hires?|retains?|partners? with|in collaboration with|(?:serves?|acts?|will act|will serve) as (?:the |an? )?(?:official |exclusive )?(?:registration |media |outreach |event )?partner)\b/i;
const purpose=/\b(?:purpose|objective|aims? to|intended to|in order to|to support|to facilitate|to enable|commissions?|engages?|hires?|retains?)\b/i;
const contextHeading=/\b(?:background|purpose|objective|overview|introduction|recitals?|parties|scope|about|project)\b/i;
const boilerplate=/fictional research example|demonstration only|clausetrap (?:presentation|demonstration)|page\s+\d+\s*(?:of|\/)\s*\d+/i;
const docType=/\b(?:agreement|memorandum of understanding|partnership proposal|event brief|policy|guidelines|terms and conditions)\b/i;
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
const list=(items:string[])=>new Intl.ListFormat('en',{style:'long',type:'conjunction'}).format(items);
const unique=<T,>(values:T[])=>[...new Set(values)];
const plain=(t:string)=>t.replace(/\s+shall\s+not\s+/gi,' must not ').replace(/\s+shall\s+/gi,' must ');

function read(clause:Clause):Passage[] {
  const blocks=clause.text.split(/\n+/).map(clean).filter(Boolean);
  let heading='',buffer=''; const result:Passage[]=[];
  const flush=()=>{
    for(const raw of buffer.split(/(?<=[.!?])\s+(?=[A-Z“"(])/)){
      const text=clean(raw);
      if(text.length>=12 && text.length<=650 && !boilerplate.test(text))
        result.push({text,heading,clause,order:0});
    }
    buffer='';
  };
  for(const line of blocks){
    if(boilerplate.test(line)){flush();continue;}
    if(/^(?:(?:\d+(?:\.\d+)?%?\s*)+|Precision|Recall|F1-score|Metric)$/i.test(line)){flush();continue;}
    if(/\b(?:prepared by|presented by|batch|supervisor)\b/i.test(line)){
      flush();result.push({text:line,heading,clause,order:0});continue;
    }
    const isHeading=line.length<=85 && !/[.!?]$/.test(line) && !duty.test(line) &&
      (/^[A-Z][A-Z &/—:–-]{5,}$/.test(line)||docType.test(line)||contextHeading.test(line)||(!buffer && !heading && clause.reference!=='Preamble' && blocks.length>1 && line.split(' ').length<7));
    if(isHeading){flush();heading=line;continue;}
    buffer+=(buffer?' ':'')+line;
    if(/[.!?]["”]?$/.test(line))flush();
  }
  flush();return result;
}

// Reports may quote contract clauses as examples. Use their explanatory prose
// for the overview instead of presenting examples as the document's purpose.
function reportSummary(data:Analysis, passages:Passage[]):SummaryLine[]|null {
  const opening=data.clauses.map(c=>c.text).join(' ').slice(0,7000);
  const wholeText=data.clauses.map(c=>c.text).join(' ');
  if (!/\b(?:prototype|research|project|study)\b/i.test(opening) ||
      !/\b(?:architecture|methodology|pipeline)\b/i.test(wholeText) ||
      !/\b(?:evaluation|results|benchmark|limitations)\b/i.test(wholeText)) return null;
  if (/\b(?:entered into|by and between|hereinafter referred)\b/i.test(opening)) return null;
  const available=passages.filter(p=>!duty.test(p.text) && !/^["“]/.test(p.text) && !/^(?:\d+[.)]?|[→↓])$/.test(p.text));
  const used=new Set<string>();
  const rows:SummaryLine[]=[];
  function select(label:string, pattern:RegExp, limit=2) {
    const selected=available.filter(p=>!used.has(p.text)&&pattern.test(p.text)).slice(0,limit);
    if(!selected.length)return;
    selected.forEach(p=>used.add(p.text));
    rows.push({label,text:selected.map(p=>p.text).join(' '),sources:unique(selected.map(p=>p.clause))});
  }
  select('What this document is about',/\b(?:prototype|system|project|study)\b.*\b(?:that|which|aims|analyzes|analyses|investigates)\b/i,1);
  select('People and organizations',/\b(?:prepared by|presented by|author|batch|department|supervisor)\b/i,1);
  select('Why it matters',/\b(?:challenge|manual|scattered|time pressure|difficult|problem)\b/i,2);
  select('How it works',/\b(?:FastAPI|PDF.js|methodology|architecture)\b/i,2);
  select('Main features',/^(?:Extract|Identify|Detect|Search)\b/i,2);
  select('Results and evaluation',/\b(?:evaluation conducted|outperform|clauses correct|accuracy)\b/i,2);
  select('Limitations and next steps',/\b(?:require OCR|require.*review|may miss|planned|future|multilingual|independent.*dataset)\b/i,2);
  const title=data.clauses[0]?.text.split('\n')[0].trim();
  if(rows[0]?.label==='What this document is about' && title && title.length<90){
    rows[0].text='This document presents “'+title+'”. '+rows[0].text;
    rows[0].sources=unique([data.clauses[0],...rows[0].sources]);
  }
  return rows.length>=2 ? rows : null;
}

export function documentSummary(data:Analysis):SummaryLine[] {
  const passages=data.clauses.flatMap(read).map((p,order)=>({...p,order}));
  if(!passages.length)return [];
  const pageClauses:Clause[]=data.page_texts?.map(p=>({
    id:'P'+p.page,reference:'Page '+p.page,pages:[p.page],text:p.text,category:'source text',entities:{}
  }))||[];
  const reportData=pageClauses.length ? {...data,clauses:pageClauses} : data;
  const report=reportSummary(reportData,reportData.clauses.flatMap(read));
  if(report)return report;
  const used=new Set<string>(),result:SummaryLine[]=[];
  function add(label:string,text:string,items:Passage[]){
    if(!items.length)return;
    items.filter(p=>text.includes(p.text)).forEach(p=>used.add(p.text));
    result.push({label,text,sources:unique(items.map(p=>p.clause))});
  }
  const context=passages.filter(p=>!duty.test(p.text));
  const findBest=(pool:Passage[],score:(p:Passage)=>number)=>pool.map(p=>({p,s:score(p)})).filter(v=>v.s>0).sort((a,b)=>b.s-a.s||a.p.order-b.p.order)[0]?.p;
  const purposeLine=findBest(context,p=> (purpose.test(p.text)?6:0)+(contextHeading.test(p.heading)&&/purpose|objective|background|scope|overview/i.test(p.heading)?4:0)+(participants.test(p.text)&&docType.test(p.text)?2:0));
  const partyLine=findBest(passages,p=> (participants.test(p.text)?6:0)+(/\((?:client|supplier|partner|organiser|organizer|provider|customer)\)/i.test(p.text)?5:0)+(/^parties$/i.test(p.heading)?3:0));
  const title=data.clauses.flatMap(c=>c.text.split('\n').map(text=>({text:clean(text),clause:c,heading:'',order:0})))
    .find(p=>docType.test(p.text)&&p.text.length<85&&!/[.!?]|fictional|demonstration/i.test(p.text)&&!duty.test(p.text));
  const themes=subjects.map(([pattern,name])=>({name,p:passages.find(p=>pattern.test(p.text))})).filter((v):v is {name:typeof v.name;p:Passage}=>!!v.p);
  const intro=[...new Set([purposeLine,partyLine].filter((p):p is Passage=>!!p))];
  if(intro.length)add('Purpose and parties',intro.map(p=>p.text).join(' '),intro);
  else if(themes.length){
    const picked=themes.slice(0,3);
    add('What this document covers',(title?'The document titled “'+title.text+'”':'This document')+' sets out terms for '+list(picked.map(v=>v.name))+'.', [...(title?[title]:[]),...picked.map(v=>v.p)]);
  }else {
    const opening=title||passages[0];add('What this document covers',opening.text,[opening]);
  }
  const flagged=new Set(data.findings.flatMap(f=>f.clause_ids));
  const duties=passages.filter(p=>duty.test(p.text)&&!used.has(p.text));
  const owners=new Set<string>(),topics=new Set<string>(),chosen:Passage[]=[];
  const topic=(p:Passage)=>subjects.find(([re])=>re.test(p.text))?.[1]||p.heading||p.clause.category;
  const owner=(p:Passage)=>clean(p.text.split(duty)[0]).toLowerCase();
  // Cover different responsibilities and actors, including benefits promised by the partner.
  for(const p of [...duties].sort((a,b)=>Number(flagged.has(a.clause.id))-Number(flagged.has(b.clause.id)))){
    if(chosen.length===3)break;
    if(chosen.some(q=>q.text===p.text)||topics.has(topic(p))&&owners.has(owner(p)))continue;
    if(flagged.has(p.clause.id))continue;
    owners.add(owner(p));topics.add(topic(p));chosen.push(p);
  }
  const listed=data.obligations.filter(o=>o.polarity==='listed');
  if(listed.length){
    const actors=unique(data.obligations.map(o=>o.actor)).filter(a=>!/^both parties$/i.test(a));
    const rows=actors.slice(0,3).map(actor=>{
      const items=data.obligations.filter(o=>o.actor===actor && !flagged.has(o.clause_id)).slice(0,2);
      const sources=items.map(o=>data.clauses.find(c=>c.id===o.clause_id)!);
      return {text:items.length?actor+' commitments include: '+items.map(o=>plain(o.source).replace(/[.]$/,'')).join('; ')+'.':'',sources};
    }).filter(r=>r.text);
    if(rows.length)result.push({label:'Who does what',text:rows.map(r=>r.text).join(' '),sources:unique(rows.flatMap(r=>r.sources))});
  }else if(chosen.length)add('Who does what',chosen.map(p=>plain(p.text)).join(' '),chosen);
  const scope=themes.filter(t=>!topics.has(t.name)).slice(0,4);
  if(scope.length&&intro.length)add('Other terms', 'The document also covers '+list(scope.map(v=>v.name))+'.',scope.map(v=>v.p));
  if(data.findings.length){
    const refs=data.findings.slice(0,3).map(f=>f.clause_ids.map(id=>data.clauses.find(c=>c.id===id)).filter((c):c is Clause=>!!c));
    result.push({label:'Points to check',text:'Compare '+list(refs.map(pair=>pair.map(c=>'§ '+c.reference).join(' and ')))+' for potentially inconsistent terms.',sources:unique(refs.flat())});
  }
  return result;
}
