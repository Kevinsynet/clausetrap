// A list heading can supply the actor for several subsequent numbered items.
export function responsibilityHeading(line:string):string|null {
  const match=line.match(/^(?:[a-z][.)]\s*)?(?:responsibilities|obligations|duties)\s+(?:of|for)\s+(.+?)\s*:?$/i);
  if(!match)return null;
  const name=match[1].trim().replace(/^the\s+/i,'');
  const role=name.match(/\(([^)]+)\)$/)?.[1];
  return role || name;
}

type Duty={actor:string;action:string;object:string;source:string;polarity:string};
const excluded=/^(?:this|the|such)\s+(?:mou|agreement|document|contract|memorandum|clause|section)\b|^(?:all registrations|no claims|any disputes|registrations|claims|parties affirm)$/i;
const roleWords='organis(?:er|ing team)|organiz(?:er|ing team)|sponsor|client|supplier|contractor|vendor|service provider|both parties';
export function readDuties(raw:string,owner?:string):Duty[] {
  const text=raw.trim();
  if(!text || /^(?:optional|may elect|at (?:its|their) discretion)\b/i.test(text))return [];
  if(owner){
    const source=text.replace(/\s+/g,' ').trim();
    const modal=source.match(/^(.+?)\s+(?:must|shall|will)\s+(not\s+)?([a-z]+)\s+(.+)$/i);
    if(modal && !/^all registrations$/i.test(modal[1])){
      return [{actor:owner,action:modal[3],object:modal[4],source,polarity:modal[2]?'prohibited':'required'}];
    }
    // Keep the wording of noun phrases, permissions and conditional benefits.
    return [{actor:owner,action:'Listed responsibility',object:source,source,polarity:'listed'}];
  }
  const duties:Duty[]=[];
  for(const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z])/)){
    // Match at a subject boundary; case-insensitive named-actor matching must
    // not consume arbitrary lowercase prose before the modal.
    const joined=sentence.replace(/^[\s●•▪]+/,'').replace(/\s+/g,' ').trim();
    const m=joined.match(/(?:^|[,;:]\s+)((?:[Tt]he\s+)?[\w&-]+(?:\s+[\w&-]+){0,5})\s+(?:shall|must|agrees? to|is required to)\s+(not\s+)?([a-z]+)\s+(.+)$/i);
    if(!m)continue;
    let actor=m[1].trim();
    const known=actor.match(new RegExp('(?:^|\\s)(?:the\\s+)?('+roleWords+')$','i'));
    if(known)actor=known[1];
    else if(excluded.test(actor)||!/^([A-Z][\w&-]*)(?:\s+[A-Z][\w&-]*)*$/.test(actor))continue;
    if(excluded.test(actor)||(m[3]==='be'&&/^liable\b/i.test(m[4])&&m[2]))continue;
    actor=actor[0].toUpperCase()+actor.slice(1);
    const responsible=m[3].toLowerCase()==='be' && m[4].match(/^((?:solely\s+)?responsible for)\s+(.+)$/i);
    duties.push({actor,action:responsible?'be '+responsible[1]:m[3],object:responsible?responsible[2]:m[4],source:joined,polarity:m[2]?'prohibited':'required'});
  }
  return duties;
}
