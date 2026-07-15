# Roadmap — active vs. missing

Status legend: ✅ active in production · 🟡 partial · ⬜ not started

## Where the layer stands today

| Capability | Status | Notes |
|---|---|---|
| Per-client brand memory (`brand_intelligence` + approval gate) | ✅ | 6 categories, confidence, provenance class |
| Structured brand facts (`brand_guidelines`) | ✅ | Wired into generation as of 2026-07 |
| Brand extraction from URL / brand-book PDF (`deep-dive-brand`) | ✅ | Auto-triggered URL from brief as of 2026-07 |
| Scope-weighted RAG over documents (`rag-retrieve`, pgvector) | ✅ | agency / client / project scopes |
| Outcome records per render (`prompt_artifacts`) | ✅ | Full prompt + refs + config + approvals |
| Project-close learning extraction (`extract-learnings`) | 🟡 | Manual button; reads elements, not the event stream |
| Learning signal capture (`learning_events`) | ⬜ | Phase 1 |
| Semantic retrieval over intelligence entries (embeddings) | ⬜ | Today: “first 40 approved rows” |
| Reinforcement & decay (use_count / supersedes) | ⬜ | Phase 3 |
| Agency-scope playbook entries in the same pipeline | ⬜ | Phase 4 |
| Estimate calibration from final budgets | ⬜ | Phase 4 |

## Build phases

### Phase 1 — Capture (no-risk, pure upside)
Create `learning_events`; write events at the 🟡/⬜ call sites in [`signals.md`](./signals.md).
Zero behavior change. Everything downstream depends on this history existing.

### Phase 2 — Distill & propose
Extend `extract-learnings` to read the event stream + `prompt_artifacts` at project
close (auto-trigger on deck export, keep the manual button): propose entries **with
provenance** (“rejected 3 renders with visible aisle carpet → prefers seamless
flooring”, `source: feedback`, links to the events). Proposals land unapproved in the
existing review queue — the human gate stays.

### Phase 3 — Retrieve smarter, reinforce
Add `embedding` to intelligence entries; replace “first 40 rows” with relevance ×
confidence × recency under a hard token budget. Add `use_count`/`last_used_at`
(bump on use in an approved project) and `supersedes_id` (contradiction replaces,
never coexists). Surface weighting in the step-rail (“12 approved entries weighted in
· adjust”).

### Phase 4 — Agency flywheel
`scope: agency` entries (client-agnostic by construction: playbooks, what wins
pitches, materials that survive the shop, freight reality per city). Estimate
calibration: compare `budgetLogic` projections to final numbers per venue/size and
feed corrections back as `cost_benchmark` entries.

## Invariants (do not break)
1. Auto-extracted entries never reach generation without human approval.
2. Client scope is a wall — cross-client learning flows only through explicitly
   agency-scoped, client-agnostic entries.
3. Schema changes go through Lovable/dashboard, never hand-authored migration files.
4. Events reference artifacts; they don't duplicate them.
