# Data Model

The memory substrate, table by table. ✅ = live in production · 🟡 = exists, partially used · ⬜ = planned.

## ✅ `brand_intelligence` — the client memory core
Per-client knowledge entries. This is the table everything distills into.

| Column | Notes |
|---|---|
| `client_id` | Scope wall — every read/write is client-scoped |
| `category` | `visual_identity` · `strategic_voice` · `vendor_material` · `process_procedure` · `cost_benchmark` · `past_learning` |
| `title` / `content` / `tags` | The entry itself |
| `source` | `manual` · `ai_extracted` · `feedback` — provenance class |
| `confidence_score` | 0–1; extraction sets ~0.85, manual = 1.0 |
| `is_approved` / `approved_at` | **The gate.** Only approved entries reach generation |
| `source_project_id` | Which project taught us this (null for URL/PDF extraction) |

Written by: `deep-dive-brand` (URL/brand-book extraction), `extract-learnings` (project close), manual entry (client library UI).
Read by: `generate-element` (buildBrandIntelligenceBlock), PromptGenerator context assembly, brand-compliance-check.

⬜ Planned columns: `embedding vector` (semantic retrieval instead of “first 40 rows”), `use_count`, `last_used_at` (reinforcement), `supersedes_id` (contradiction handling — new learning replaces, not coexists), `scope` (`client` | `agency`) to let agency-level playbook entries live in the same pipeline.

## ✅ `brand_guidelines` — structured brand facts (one row per client)
JSONB fields: `color_system`, `typography`, `logo_rules`, `tone_of_voice`, `photography_style`, `materials_finishes`. Deterministic injection (not RAG) — facts this structural should never lose a similarity race. Written by `deep-dive-brand`; read at generation time.

## ✅ `knowledge_documents` + embeddings — the RAG corpus
Uploaded docs (briefs, RFPs, inspiration, playbooks) chunked and embedded (pgvector). Retrieved by `rag-retrieve` with **scope weighting** (agency / client / project — see FRD §6.3 reference in `supabase/functions/rag-retrieve/index.ts`). Auto-tagged (`auto-tag-document`) and summarized (`summarize-document`) on upload.

## ✅ `project_images.prompt_artifacts` — outcome ↔ input linkage
Every render stores the full generation record: exact prompt, negative, geometry summary, references, model, config key, hanging approval. This is what makes outcome learning possible — we can always answer “what inputs produced the render the client approved?”

## ✅ Agency-scope data
`show_costs` (venue/size baselines), `pricing` rate data, agency knowledge docs, `company_profiles`. Read into generation (`generate-element` payload) and the Pricing engine.

## ⬜ `learning_events` — the missing piece (Phase 1)
Append-only signal log. No behavior change; just stop discarding signal.

```sql
create table learning_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  client_id uuid,
  project_id uuid,
  event_type text not null,      -- see signals.md
  payload jsonb not null,        -- event-specific; keep small, reference storage paths not blobs
  created_at timestamptz default now()
);
```

> ⚠️ **Migrations gotcha:** hand-authored files in `supabase/migrations/` are NOT applied
> to the hosted DB. Schema changes here must go through Lovable or the dashboard SQL
> editor. (This bit us on `prompt_artifacts` — see the 2026-07-02 incident.)
