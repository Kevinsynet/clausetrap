export type Clause = {id:string;reference:string;pages:number[];text:string;category:string;entities:Record<string,string[]>};
export type Obligation = {id:string;clause_id:string;actor:string;action:string;object:string;deadline:string[];condition:string;polarity:string;source:string;pages:number[]};
export type Finding = {id:string;clause_ids:string[];kind:string;explanation:string;evidence:string[];status:string;method:string;scores:Record<string,number>};
export type Analysis = {page_texts?: {page:number;text:string}[];filename:string;pages:number;clauses:Clause[];obligations:Obligation[];findings:Finding[];methods:Record<string,string>;warnings:string[]};
