import type {Finding, Obligation} from './types';
export type Resolution = {label:string; question:string; spans:{start:number;term:string}[]; drafts:string[]};
export function resolutionFor(finding:Finding, obligations:Obligation[]):Resolution|null;
