import type {Analysis, Clause} from './types';

export type SummaryLine = {text:string; clause:Clause};

function sentences(clause:Clause):string[] {
  const lines=clause.text.trim().split(/\n+/);
  // Numbered section titles are often isolated on a line above the duty.
  if(lines.length>1 && lines[0].length<65 && !/[.!?]$|\b(?:shall|must|agreement is|agrees to)\b/i.test(lines[0])) lines.shift();
  return lines.join(' ').replace(/\s+/g,' ').split(/(?<=[.!?])\s+(?=[A-Z"“])/)
    .map(t=>t.trim()).filter(t=>t.length>=25 && t.length<=340 && !/demonstration only|fictional research example/i.test(t));
}

export function documentSummary(data:Analysis):SummaryLine[] {
  const flagged=new Set(data.findings.flatMap(f=>f.clause_ids));
  const candidates=data.clauses.flatMap(clause=>sentences(clause).map(text=>{
    let score=0;
    if(/\b(commissions?|engages?|hires?|retains?|purpose of|scope of work|agreement (?:is|covers|governs)|entered into between)\b/i.test(text)) score+=6;
    if(/\b(to (?:prepare|develop|design|provide|deliver)|shall (?:deliver|provide|develop|design))\b/i.test(text)) score+=3;
    if(/\b(shall|must|agrees to)\b/i.test(text)) score+=1;
    if(flagged.has(clause.id)) score-=5;
    return {text,clause,score};
  }));
  candidates.sort((a,b)=>b.score-a.score);
  const first=candidates[0];
  if(!first)return [];
  const result:SummaryLine[]=[first];
  // A second short excerpt adds a distinct term while avoiding disputed facts.
  const second=candidates.find(c=>c.clause.id!==first.clause.id && c.text!==first.text && c.score>0 && !flagged.has(c.clause.id) && c.text.length+first.text.length<=380);
  if(second)result.push(second);
  return result;
}
