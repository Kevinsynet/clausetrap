import {useState} from 'react';
import type {Resolution} from './resolution.mjs';

export function EvidenceText({text, span}: {text:string; span?:{start:number; term:string}}) {
  if (!span) return <>{text}</>;
  const end = span.start + span.term.length;
  return <>{text.slice(0,span.start)}<mark>{text.slice(span.start,end)}</mark>{text.slice(end)}</>;
}

export function ResolutionPanel({guide,refs}: {guide:Resolution|null; refs:string[]}) {
  const [choice,setChoice] = useState<number|null>(null);
  return <section className="resolution-panel" aria-label="Resolution guidance">
    <h3>How to resolve this</h3>
    {guide ? <>
      <p><strong>{guide.label}:</strong> § {refs[0]} says “{guide.spans[0].term}”. § {refs[1]} says “{guide.spans[1].term}”.</p>
      <p>{guide.question} If the clauses cover different situations, specify when each applies.</p>
      <fieldset><legend>Preview a change using the agreed term</legend>
        {guide.spans.map((span,i) => <label key={i}><input type="radio" name="resolution-term" checked={choice===i} onChange={()=>setChoice(i)}/>Use “{span.term}” from § {refs[i]}</label>)}
      </fieldset>
      {choice!==null && <div className="draft-preview" aria-live="polite"><strong>Draft sentence for § {refs[1-choice]}</strong><p>{guide.drafts[choice]}</p><small>Review this wording with the parties before updating the contract.</small></div>}
    </> : <p>Compare § {refs[0]} and § {refs[1]} for differences in actor, scope, timing and exceptions. Check whether either clause takes precedence. This pair needs a reviewer to identify the intended change before drafting.</p>}
  </section>;
}
