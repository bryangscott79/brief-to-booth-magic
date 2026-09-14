# Deploying the knowledge layer

Everything below is committed and pushed. None of it is live: the code is
inert until the migration runs and the edge functions are redeployed.

Verified against production at the time of writing — both defects still
present:

```
GET  /rest/v1/projects?select=agency_id     → 42703  column does not exist
POST /rest/v1/rpc/match_knowledge_chunks    → 42725  is_agency_member(uuid) is not unique
```

---

## Step 1 — SQL editor

Run `supabase/migrations/20260915000000_activate_knowledge_layer.sql`.

It is idempotent; running it twice is safe. It does four things:

| # | Fix |
|---|-----|
| D1 | Drops the one-argument `is_agency_member` / `is_agency_admin` wrappers that made every single-argument call ambiguous, and rewrites `match_knowledge_chunks` to call the two-argument form explicitly so no future overload can break it again |
| D2 | Rewrites the `knowledge_documents` / `knowledge_chunks` policies, which passed `is_agency_member(auth.uid(), agency_id)` — arguments reversed, so agency members could never read their own corpus |
| D4 | Adds `projects.agency_id`, backfills it from agency membership then client, and adds a `BEFORE INSERT` trigger so it can never drift again |

### Then run this

```sql
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_agency_member')          as overloads,
  (select count(*) from information_schema.columns where table_schema = 'public'
     and table_name = 'projects' and column_name = 'agency_id')              as projects_agency_id,
  (select count(*) from public.knowledge_documents)                          as documents,
  (select count(*) from public.knowledge_chunks where embedding is not null) as embedded_chunks;
```

- `overloads` must be **1**. If it is 2, the `DROP` was blocked by a
  dependency and the migration will have logged a NOTICE saying so —
  retrieval still works (the rewritten RPC no longer depends on it), but
  any other single-argument caller stays broken.
- `projects_agency_id` must be **1**.
- **`documents` is the one that decides whether any of this pays off.** If
  it is 0 the corpus is empty, and retrieval will work perfectly while
  returning nothing. Nothing else in this deploy can fix that — the
  knowledge base needs content.

---

## Step 2 — Lovable

Paste this:

```
Deploy these edge functions: parse-brief, synthesize-brief, plan-concepts,
generate-element, generate-hero, generate-view, generate-materials,
generate-3d-brief, generate-presentation, enrich-spatial,
parse-client-feedback.

They all changed, most of them via the shared file
supabase/functions/_shared/rag-helper.ts.

Do not hand-edit src/integrations/supabase/types.ts — regenerate it after
the migration above has been applied, so projects.agency_id is picked up.
```

---

## Step 3 — Confirm it works

Open a project with a client, go to **Plan**, and send a message.

- A **source chip** under the reply means the whole chain works:
  scope resolved → user-scoped client → RPC guard passed → chunks
  retrieved → documents named. Click it to see which of your documents
  were used.
- **No chip** means either the corpus is empty (check `documents` above)
  or something upstream failed. The edge function logs
  `[plan-concepts] RAG:` lines, and `rag_query_log` records every attempt
  with its scope and duration.

The same chip appears on **Generate** beside "N/8 elements ready".

---

## What starts happening automatically after this

Two moments now write back into the knowledge base, filed against the
**client** so they inform the *next* job rather than the one that produced
them:

- **Carrying a direction forward** → an "Approved direction" document
  recording the chosen direction, its prompt, and the directions that were
  dropped.
- **Applying a round of client feedback** → a "Client feedback" document
  recording what they said and which changes were made.

Both are idempotent per project, so a project contributes at most one
document of each kind no matter how many times someone toggles. Everything
written this way is tagged `auto-captured` and appears in the client's
knowledge panel, where it can be reviewed or deleted like any other
document.

If you would rather approve these before they enter the corpus, that is a
small change — say so and it becomes a review queue instead.

---

## Still open (needs a decision, not code)

- **Outcome capture** (won/lost, final budget, built photos). Designed as
  the HALO handoff boundary rather than a Canopy-only field, so it is
  waiting on how much of the launch record HALO owns.
- **Merging Plan + Generate** into one Concept step, with a computed
  constraint block (footprint, budget/sq ft, rigging limits) binding the
  concept renders. Should land together with the approval model, since it
  changes what "done" means for two steps.
