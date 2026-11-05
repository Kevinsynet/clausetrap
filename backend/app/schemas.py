from pydantic import BaseModel, Field

class Clause(BaseModel):
    id: str
    reference: str
    pages: list[int]
    text: str
    category: str
    entities: dict[str, list[str]] = Field(default_factory=dict)

class Obligation(BaseModel):
    id: str
    clause_id: str
    actor: str
    action: str
    object: str
    deadline: list[str]
    condition: str
    polarity: str
    source: str
    pages: list[int]

class Finding(BaseModel):
    id: str
    clause_ids: list[str]
    kind: str
    explanation: str
    evidence: list[str]
    status: str = 'Human review required'
    method: str
    scores: dict[str, float] = Field(default_factory=dict)

class Analysis(BaseModel):
    filename: str
    pages: int
    clauses: list[Clause]
    obligations: list[Obligation]
    findings: list[Finding]
    methods: dict[str, str]
    warnings: list[str]
