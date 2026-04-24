---
name: Activation type knowledge tiers
description: Two-tier knowledge base per activation type — system foundation (super admin) plus agency-specific knowledge that does not leak across agencies
type: feature
---
Each activation type now has two knowledge bases shown side-by-side on the Activation Type Dashboard's Knowledge tab. The agency-scoped KB uses scope `activation_type_agency` (managed by agency admins, isolated by `agencies.id` via existing RLS on `knowledge_documents`); the system-scoped KB uses scope `activation_type` (managed by platform/super admins) and provides foundational quality/metric grounding shared across every agency. Both feed RAG retrieval; agency knowledge ranks higher per the scope-weights map. The `KnowledgeScope` type in `useKnowledgeDocuments` was extended to include `activation_type_agency`. No schema change was needed — the new value just slots into the existing `scope` column.
