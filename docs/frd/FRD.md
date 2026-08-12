# CANOPY — Functional Requirements Document

**Version 1.0 · 2026-08-12 · full end-to-end audit of the platform as built**

This document is the master inventory of everything Canopy is: every surface, menu item, workflow, input, and output — what each exists to do (**intent**) and what it actually does today (**current state**). It was produced by a five-domain code audit of the repository (`src/` + `supabase/`), with the hosted schema (`src/integrations/supabase/types.ts`) treated as ground truth. The full per-screen audits live in [`audit/`](audit/) and are the authoritative detail behind every claim here:

| Appendix | Domain |
|---|---|
| [01-shell-access.md](audit/01-shell-access.md) | Routing, auth, roles, layout shell, public/marketing surfaces, suspension mechanics |
| [02-project-flow.md](audit/02-project-flow.md) | The six-step project flow, Files, Knowledge Base, step gating & status model |
| [03-agency-workspace.md](audit/03-agency-workspace.md) | All agency site-level pages |
| [04-super-admin.md](audit/04-super-admin.md) | Platform-owner surfaces, invites, preview mode |
| [05-backend-data-ai.md](audit/05-backend-data-ai.md) | Data model, 29 edge functions, prompt pipeline, RAG, integrations |

**Status vocabulary used throughout:**
`LIVE` works as intended · `PARTIAL` works with real limits · `STUB` UI exists, no behavior · `INERT` written but never read · `LEGACY` superseded system still shipping · `BROKEN` observably defective · `PLANNED` documented intent, no code.

---

## 1. What Canopy is

Canopy is a **spatial operating system for environment design**: a multi-tenant SaaS where experiential/exhibit agencies turn a client brief into a costed, rendered, client-ready activation package in under a day. The core promise chain:

1. **Ingest** a brief (file, paste, or guided Q&A) → structured `ParsedBrief`.
2. **Ground** it in accumulated intelligence: client brand facts (approval-gated), agency knowledge, activation-type playbooks, venue/show data — weighted, retrievable memory that compounds across projects.
3. **Strategize**: eight AI-generated concept elements (big idea → budget logic).
4. **Spatialize**: percentage zones become real-unit, drag-editable booth geometry — the ground truth every render is composed against.
5. **Render**: a hero image first (with a human hanging-element approval gate), then a consistent fan-out to every view — each image carrying the exact prompt that produced it.
6. **Deliver**: AI-designed deck, PPTX/PDF proposal, materials & cost list, 3-D modeling brief, Figma spec, ZIP — and feed learnings back into client intelligence.

**Tenancy:** agency → members (owner/admin/member/viewer) → clients → projects (optionally grouped into multi-activation **suites**). Platform owners (super admins) operate a separate console over all agencies. Six industry verticals swap vocabulary, brief sections, input mode, and default render angles.

**Stack:** React 18 + Vite + TS + Tailwind/shadcn (Flow C design system) · Supabase (Postgres + RLS + pgvector + Storage + 29 edge functions) · Zustand + React Query · AI via Lovable gateway/Google (Gemini family), OpenAI (gpt-image-2), Anthropic (Sonnet for decks), Firecrawl (scraping), Runway/Kling/Veo (video). Deployed via Lovable (pushes to `origin/main` as gpt-engineer-app[bot]); Vercel analytics wired.

---

## 2. Roles & access model

### Intent
Two orthogonal role systems: **platform roles** (`user_roles`: `admin`, `super_admin`) and **agency roles** (`agency_members`: owner > admin > member > viewer). Every signed-in user must belong to an agency (mandatory onboarding). Platform owners administer agencies (suspend/disable/trial/flags/quotas) and can preview the agency experience. Suspended agencies keep read access but lose writes; disabled/expired agencies are locked out.

### Current state
| Requirement | Status | Reality |
|---|---|---|
| Auth (invite-only beta; sign-in, recovery, waitlist) | LIVE | Public sign-up deliberately retired; `beta_waitlist` table captures requests (no notification path — dashboard polling only) |
| Post-login redirect to intended destination | BROKEN | `ProtectedRoute` passes `state.from` and AcceptInvite passes `?redirect=` — `/auth` ignores both; every login lands on `/projects`, which dead-ends the signed-out invite flow |
| Mandatory agency onboarding (accept invite or create agency, industry locked at creation, orphan backfill) | LIVE | `create_my_agency` RPC; industry lock enforced by DB trigger |
| Route-level role guards | PARTIAL | Only `/admin/super-admins`, `/admin/agencies`, `/admin/industries*` self-guard. `/admin` and `/account/:userId` are reachable by any authed user and rely on RPC-level filtering; role hooks swallow errors as `false` (a network blip silently demotes a super admin) |
| Agency membership resolution | PARTIAL | Highest-priority membership wins; multi-agency membership is modeled but there is **no agency switcher**, and suspension gating follows the primary agency, not the agency whose data is touched |
| Suspension lifecycle (suspend/disable/trial → RLS write-block → banner → landing page) | PARTIAL | Server: `agency_has_access()` gates writes on `clients`, `projects`, `knowledge_documents`, invites — but **not** pricing, overrides, agency row, or any edge function (AI spend is not blocked). Client: `canWrite` is computed and **never consumed** — no button disables; suspended users hit raw RLS errors. Only disabled/trial-expired actually redirect to `/access-suspended` |
| Preview-as-agency mode | STUB+ | A single client-side boolean: swaps nav and the `/admin` tab set. The banner's "Read-only agency view" is **false** — nothing consults it for writes; it binds to no target agency (previewing from a user drill-in shows the super admin's *own* agency); state is lost on refresh |
| Audit trail | PARTIAL | `agency_access_log` captures all agency lifecycle actions (except admin-notes edits); super-admin grant/revoke is unaudited |

**Invitation systems — three coexist, one works end-to-end:**
1. `pending_invites` (agency member + super admin) — **LIVE**: RLS-gated insert, accepted via `accept_pending_invite` on the onboarding page. No email is ever sent; "they'll join automatically on sign-up" copy is aspirational (the invite is only applied if the invitee reaches onboarding — an already-onboarded super-admin invitee never gets the role).
2. `platform_invites` + `admin-invite-user` edge function — **PARTIAL**: sends a real Supabase auth email, but its role grant is dead (`invited_role` metadata is read by nothing) and the function 403s for pure super admins (`role='admin'` check).
3. `project_invites` (token share links, `/invite/:token`) — **LIVE** server-side (`accept_project_invite`), but the page still says "**BriefEngine**", and the Projects-page "Share…" menu that should mint links is a toast stub.

---

## 3. Information architecture

### Navigation (intent = final Flow C model; current = shipped)
- **Site-level left sidebar** (always site scope): Agency set — All Projects, Clients, Activation Types, Agency Knowledge, Pricing, Company Profile, Team (+ Admin Settings for agency admins). Platform set (super admins) — Accounts, Agencies, Industries, Super Admins, Invites.
- **Project-level top nav**: breadcrumb + spec pill + measurement-system dropdown + step pill rail.

### Current-state defects in the IA
- **`/platform-invites` is a dead sidebar link** — no route exists; super admins clicking "Invites" get the 404 page (the invites UI actually lives in `/admin` → All Accounts).
- **Orphan routes with no entry point**: `/rhino` (fully duplicated by Files→3D tab), `/knowledge-base` (legacy project KB), `/team` (legacy team model). `/explore` (360° viewer) is commented out but its components still ship.
- **Step model disagreement**: the pill rail has **seven** pills (Files is #6, Export #7) while every sheet says "Step 0n / 06"; pill completion is **positional** (everything left of the current URL shows ✓ regardless of actual state) and the designed `blocked` red-dot state is produced by no caller.
- The public `/architecture` page is unlinked from anywhere (share-by-URL only); the landing page's "4-scope RAG" vs "5-scope" copy conflicts with itself.

### Full route map
See [audit/01-shell-access.md §1](audit/01-shell-access.md) for the complete table (path → component → guard → audience), including eager/lazy split and dead routes.

---

## 4. Public & entry surfaces

| Surface | Intent | Current state |
|---|---|---|
| `/` landing | Top-of-funnel: position the spatial OS, route to sign-in | LIVE (dark theme kept deliberately). Gaps: no mobile nav at all; primary CTA routes anonymous visitors to a guard redirect rather than sign-up; stats hardcoded |
| `/industries/:slug` | Per-vertical marketing deep-dive with live vocabulary | PARTIAL — anonymous visitors lose the project-types section (RLS blocks the read); `interior_design` has no hero image or narrative; new DB industries render empty |
| `/architecture` | Public, honest intelligence-architecture explainer (live vs planned) | LIVE — manually kept in sync with `docs/intelligence/`; exposes schema names publicly by design |
| `/auth` | Invite-only door: sign-in, recovery, beta waitlist | LIVE with the redirect-loss defect (§2); terms/privacy referenced but not linked; no MFA/SSO |
| `/invite/:token` | Redeem project share link | LIVE mechanically; stale "BriefEngine" branding; dead-ends for signed-out users |
| `/onboarding/create-agency` | Mandatory tenancy gate | LIVE; logo is a URL field (not an upload); no decline-invite affordance |
| `/access-suspended` | Non-punitive lockout landing | LIVE; contact email is `hello@exhibitus.com` (brand mismatch); suspended (vs disabled) users are never actually routed here |
| `*` 404 | Terminal not-found | Off-brand: no Canopy styling, raw `<a>`, no route back for signed-in users |

---

## 5. Agency workspace (site-level)

Full per-screen spec: [audit/03-agency-workspace.md](audit/03-agency-workspace.md).

### 5.1 Projects — `/projects`
**Intent:** workspace home; every visible project as a visual grid or client-grouped table with pipeline progress, search/filters, create project/suite.
**Live:** create (with brand URL captured), grid/table toggle (persisted), hover-scrub render thumbnails, client grouping, suite parents with expandable children, status-routed open, delete, admin all-users mode.
**Gaps:** **Share… and Archive are toast stubs** (no `archived` column; the fully-built `project_invites` system is the natural backing for Share but isn't wired). Create-dialog copy promises an immediate brand scrape that actually happens later on Upload. Non-admin query re-filters to `user_id = me`, so teammates' projects are invisible despite RLS permitting them — the "agency workspace" is currently per-user. Pipeline steps "Render Prompts Ready" and "Exported" can never light up (see §6.7).

### 5.2 Clients — `/clients` + `/clients/:clientId`
**Intent:** roster of brands; each client is the container for brand intelligence, brand guidelines, scoped knowledge, and its projects.
**Live:** create/edit client, logo display (URL-based), accurate project counts (fixed to count RLS-visible projects by `client_id` — see the `agency_id` root cause in §9), per-client dashboard with Overview/Brand/Knowledge/Projects tabs and deep-linkable `?tab=`, auto-saving notes, **brand deep-dive** from URL or brand-book PDF (three size-tiered paths incl. client-side rasterization at ≤40 pages), dedupe-aware persistence into `brand_intelligence` (unapproved, confidence 0.85), `brand_guidelines` projection, approve/delete per entry.
**Gaps:** no logo upload (URL string only); brand colors are only ever set by the deep dive (no editor, so wrong colors can't be corrected); no client delete on the dashboard; `brand_guidelines` upsert failures are swallowed; approval is enforced at generation call sites (LIVE) but the *dashboard* surfaces don't communicate that unapproved entries are inert.

### 5.3 Activation Types — `/agency/activation-types` (+ `/:typeId`)
**Intent:** the catalogue of formats the agency builds; each type teaches the AI its grammar (template, must-have/avoid, size envelope) and carries scoped knowledge.
**Live:** built-ins + agency custom types, industry isolation filtering, category grouping, favorites (localStorage), create custom type, per-type dashboard with template editing (override for built-ins via `activation_type_overrides`, direct update for custom), restore defaults, dual knowledge panels (agency-scoped + platform foundation).
**Gaps:** the **`activation_type_agency` knowledge scope is embedded but never retrieved** (rag scope list omits it) — agency-specific type knowledge is a dead end; favorites are device-local; custom types can't set scale/sqft/emphasis from this UI; no delete/rename for custom types; template "injected into every prompt" claim depends on generation paths that read `element_emphasis` (partial).

### 5.4 Agency Knowledge — `/agency/knowledge`
**Intent:** agency-wide document layer feeding all generation.
**Live:** upload → embed (`embed-document`: extract, chunk ~1000 chars, `gemini-embedding-001` 768-d) → auto-tag (`auto-tag-document`: doc_type/tags/summary); status lifecycle with retry; pin/unpin (pins force-inject into retrieval); preview/download/delete; search.
**Gaps:** the 3-second delay before auto-tagging races extraction on large PDFs; `priority_weight`, `title`, `user_tags` are writable by the hook but have no UI; images are indexed by a synthetic filename caption only (no vision); `summarize-document` and `extract-pricing` edge functions are deployed but never invoked. **And the biggest one: retrieval itself rarely runs — see §8.3.**

### 5.5 Pricing — `/agency/pricing` + `/pricing?project=`
**Intent:** agency rate cards + supplier feeds resolving a per-project CSI-division BOM with provenance-labeled prices and regional factors.
**Live:** BOM CRUD (`plan_items`), override pricing, CSI grouping + division roll-up (`project_pricing_summary`), quality tier + region parameters, `price_plan` resolution chain (override > agency quote > global quote > unpriced), the agency-level index of projects-with-BOMs.
**Gaps:** **no UI writes `pricing_sources` or `pricing_quotes` anywhere**, so every line is override-or-unpriced; the four roadmap cards (rate-card import, AI estimate, blueprint→BOM, supplier feeds) are STUB; **`price_plan` raises for any project created after agency onboarding** because `projects.agency_id` is never stamped on insert (§9); region is free text; snapshots/export are absent.

### 5.6 Company Profile — `/company`
**Intent:** the agency's own identity for proposals/exports + a show/venue cost database.
**Live:** profile CRUD, logo uploads (light/dark) to `company-assets`, brand colors, contact block, show-cost CRUD with preset copy-on-edit; `company_name`/`logo_url` reach decks/exports; name/industry/booth-sizes/notes + show costs reach `generate-element`.
**Gaps:** brand colors, tagline, and all contact fields are saved but **read by nothing** (the Branding tab's promise is aspirational); `logo_dark_url` unconsumed; the profile is **per-user, not per-agency** — teammates maintain divergent "agency" profiles; no unsaved-changes guard.

### 5.7 Team — `/agency/team` (LIVE) vs `/team` (LEGACY)
**Intent:** one agency roster with owner/admin/member/viewer roles and email invites.
**Live (`/agency/team`):** member list via `list_agency_members` RPC, role changes, removal, pending `pending_invites` with cancel; primary-owner protections (client-side).
**Legacy (`/team` + the `/admin` "Team" tab):** the pre-agency `team_members` model — invites never email anyone, `accepted_at` is never set (everyone renders "Pending" forever), and the placeholder `user_id = owner` makes rows meaningless. **Two unrelated team systems are both shipping**, reachable through different doors.

### 5.8 Admin Settings (agency view) — `/admin`
**Intent:** agency-level configuration: project-type AI behavior, clients & brand intelligence, knowledge, KB health, team.
**Live:** the ProjectTypeManager editing surface (labels, descriptions, render context, 8 strategic elements with AI guidance, enable/disable), ClientsManager, KB panel, KB health dashboard (re-embed, legacy migration trigger).
**Critical gap:** **`project_type_configs` is write-only.** No generation path, prompt builder, or edge function reads it — editing render context or AI guidance here changes nothing about output. It is also keyed per-user, not per-agency. Four parallel "type" systems exist (code registry → per-user configs (INERT) → AI-detected `custom_project_types` → agency `activation_types`+overrides); only the last is wired end-to-end. Disabled types still appear in brief-side selectors (they read the registry directly).

---

## 6. The project flow (six steps + Files + Knowledge Base)

Full per-step spec: [audit/02-project-flow.md](audit/02-project-flow.md). Project identity rides `?project=<uuid>`; `useProjectSync` hydrates the Zustand store; persistence is per-field `projects` UPDATEs.

### 6.1 Step 01 · Brief — `/upload`
**Intent:** capture the brief (file/paste/guided Q&A) → `ParsedBrief`, plus the supporting context: brand website, brand logo, inspiration, project documents — before advancing.
**Live:** PDF/DOCX/TXT parsing (`parse-brief`: Gemini Flash, PDF-vision escalation to Pro, JSON-repair), guided builder (`synthesize-brief` + per-field `suggest-brief-field`), AI project-type inference + fuzzy client matching + new-client capture with brand-intelligence extraction, brand website persist + deep-dive trigger, brand logo into the KB (`brand-logo` tag → reference image on every render), inspiration images/links, project KB (RAG-backed panel), the deliberately-below-the-fold Continue CTA.
**Gaps:** brief file signed URL has a 1-year TTL with no refresh (silent 404 later); no image/`.doc` brief support; the store's brand-intelligence capture failure is silent.

### 6.2 Step 02 · Review — `/review`
**Intent:** verify/correct every parsed field and close the gaps the prompt composer needs, **before** tokens are spent.
**Live:** six editable section cards with inline editors; gap clarification cards (venue = blocking, hero dimensions = blocking, color hex / audience / hero form / hanging = helpful) writing answers back to the exact fields the normalizer reads; hanging-element authoring (creative direction = EXACT contract); existing-space photo + polygon annotations for interior verticals (`analyze-existing-space` vision merge that preserves in-flight user edits); Creative Direction embrace/avoid.
**Gaps:** **blocking gaps don't block** — Confirm is always enabled; hanging width/depth/drop edits in the card are **discarded** (only qualitative fields round-trip); input mode resolves from the *agency's* industry (no per-project industry column); five of six confidence badges are hardcoded; whole-blob `parsed_brief` writes are last-write-wins.

### 6.3 Step 03 · Concept — `/generate`
**Intent:** generate the eight strategy elements from the brief + weighted context; read, edit, regenerate with feedback.
**Live:** auto-generate on first arrival; sequential batch through `generate-element` (Gemini 2.5 Pro, forced tool calls, element-tuned temperatures, spatial zone post-processing/clamping); per-element persist-on-completion; module-level job survives navigation; retry w/ timeout; regeneration feedback auto-captured as approved `past_learning` intelligence; intelligence entry selector (approved-only); detail panel with dot-path editable fields.
**Gaps:** **manual edits in the detail panel are never persisted** (store-only — lost on reload); the step reads the **legacy** `knowledge_base_files` for context, so documents uploaded on Step 01's RAG panel never reach element generation as inline content; generating/error statuses are memory-only.

### 6.4 Step 04 · Spatial — `/spatial`
**Intent:** AI zone allocation → real-unit drag-editable geometry (the render ground truth), enriched with structural form, intent, materials, features, hanging.
**Live:** the absolute-unit geometry model with legacy round-trip; drag/resize/shape/height/form/material editing; features; hanging elements on canvas; AI enrichment (`enrich-spatial`) preserving user edits; layout variations (idempotent, pre-fixed); validation panel + auto-fix + metrics + cost estimator; per-zone prompt override that both Spatial and Render respect; per-config selection persisted via `activeConfigKey` and shared with Render.
**Gaps:** **Export SVG button has no handler**; `enrich-spatial` always enriches `configs[0]` server-side (wrong zones for non-first configs — silently no-ops on merge); **hanging elements authored here never reach the render prompt** (only `parsed_brief.hangingElements` does — documented KNOWN GAP); the removed floor-plan render feature's state is still half-mounted; validation never blocks progression.

### 6.5 Step 05 · Render — `/prompts`
**Intent:** compose the exact prompt from normalized brief + geometry; hero first; conversational refinement; hanging-element human gate; consistent fan-out; every image keeps its prompt.
**Live:** the full client-side composer (§8.2) with preflight checklist, prompt inspect/edit, two-step compose→render; hero conversation thread with branching; EDIT-MODE refinement (locked instruction template); hanging approval keyed to (config × hero image) and persisted on the image row; per-config versioning (`__v__`/`__cfg__` angle-id scheme, legacy fallback, orphan recovery); "Generate all sizes" sequential batch with per-config save handlers; all-views fan-out (exteriors then interiors, concurrency 3, retry on transients); per-image `prompt_artifacts` + RenderPromptDialog everywhere; geometry reference capture; model fallback chain with a visible model badge + failure reason.
**Gaps:** hanging gate **warns but never blocks**; style presets are dead on the composed path (preference order means they apply only to the legacy builder); preflight reads `configs[0]` zones (wrong on multi-config); hero thread and prompt edits are memory-only (images survive, conversation doesn't); prompt versions persist to localStorage only (`projects.prompt_versions` column doesn't exist); `hanging_elements_aloft` compliance is permanently "unknown" (no post-render check).

### 6.6 Step 06 · Export — `/export`
**Intent:** package everything into client deliverables and close the learning loop.
**Live:** AI-designed deck (Claude Sonnet HTML slides, per-slide regenerate, PDF/PPTX export, key-diagnostic ping); classic PPTX/PDF proposal; materials & cost list (`generate-materials`) + CSV; 3-D modeling brief + Meshy prompts (`generate-3d-brief`) + `.md`; Figma spec JSON; full ZIP (renders + Rhino + content.md/json); Save Learnings (`extract-learnings` → selected entries into `brand_intelligence`).
**Gaps:** **nothing ever writes `status: "completed"`** — the "Exported" pipeline step can never light; decks live in localStorage only (not shared, not durable); materials/3-D/Figma outputs are un-persisted component state; **every export uses `configs[0]`** — the active size selected in Spatial/Render is ignored; `renderPrompts` sent to the 3-D brief is always null.

### 6.7 Step gating & status model (the structural finding)
Four disagreeing notions of progress coexist: (1) the **positional** pill rail; (2) `activeStep` in the store (written, never read for gating); (3) per-screen soft empty-states (the only real gates — advisory dead-ends, never redirects); (4) persisted status — `projects.status` only ever receives `"draft"` and `"reviewed"`, while `"parsing"`, `"generating"`, `"completed"` are read-only fiction, and `render_prompts`/`hero_prompt`/`hero_style_confirmed` are read but never written. Element status is derived from column non-nullness. **Requirement going forward:** one authoritative per-step status model, persisted, driving pills (including the unused `blocked` state), routing, and the Projects-card pipeline.

### 6.8 Files — `/files` · Knowledge Base — `/knowledge-base` · Rhino — `/rhino`
**Files (LIVE):** all renders across versions/sizes with angle filters, current-only, per-size grouping, config labels, lightbox with Download + View prompt; 3-D tab (Rhino upload + AI polish); video tab (Runway/Kling/Veo via `generate-video`) seeded from image selection. Gaps: read-only (no delete/rename/set-current); occupies step slot 6 vs Export's "06" title; downloads always named `.png`.
**Knowledge Base (LEGACY, orphaned):** the pre-RAG `knowledge_base_files` page — no nav link, client-side text extraction only, public-URL storage. Two parallel project KBs exist; `migrate-legacy-kb` exists but no UI calls it from here.
**Rhino (LEGACY, orphaned):** fully duplicated by Files → 3D tab.

---

## 7. Platform (super admin)

Full per-screen spec: [audit/04-super-admin.md](audit/04-super-admin.md).

### 7.1 `/admin` — Platform console
**Intent:** accounts, role grants, platform invite ledger, activation-type CRUD, venue intelligence, per-agency image-model routing, fleet AI usage, invites.
**Live:** account search/stats/drill-in; grant/revoke agency-admin via the audited `admin-manage-role` function; AI usage dashboards (fleet stats, agency + user leaderboards, feature×model breakdown from `ai_usage_events`); activation-type manager; image-model manager.
**Gaps:** **blank first paint for super admins** (initial tab state race selects a tab that doesn't exist in the platform tab set); the "Venues & Shows" and "Invites & Team" tabs are **not platform-scoped** (they show the signed-in admin's personal rows via legacy hooks); the invite dialog's `super_admin` option grants nothing; `admin-invite-user` 403s for pure super admins; no revoke/resend on platform invites.

### 7.2 `/admin/agencies` — Agency lifecycle console
**Intent:** commercial control plane — status, trials, feature flags, quotas, industries, notes, audit log per agency.
**Live:** the full drawer (Status/Industries/Features/Quotas/Log), all lifecycle RPCs audited into `agency_access_log`, effective-status derivation, 30-day AI spend inline, member/client/project counts, last-activity ordering, admin industry re-assignment (the only escape hatch for the creation-time lock).
**Gaps:** **`feature_flags` and `quotas` have zero readers in the product** — complete authoring UIs over inert data; trial date input is timezone-lossy; no trial→active path other than "Reactivate"; the "Suspended" summary tile silently includes trial-expired; notes edits skip the audit log.

### 7.3 `/admin/industries` (+ `/:slug`)
**Intent:** manage verticals: identity/ordering, activation-type tagging, globally-curated industry knowledge, vocabulary.
**Live:** list with live counts (RPC w/ constants fallback + schema-setup banner), create/delete, detail tabs (overview, cross-tagging of activation types, industry-scope KB uploads, vocabulary editor with the 9-key reference).
**Gaps:** the auto-seed of built-ins is **dead in exactly the empty-table case it exists for** (placeholder-UUID guard bug; `interior_design` missing from the map); `briefSections`/`inputMode`/`defaultRenderAngles` exist only in the TS constant — not columns, not editable, so custom industries get vocabulary only; built-ins are deletable with `force: true` always passed; `interior_design` is a consistent second-class citizen (icon map, hero image, "5 verticals" copy).

### 7.4 `/admin/super-admins`
**Intent:** grant/revoke platform-owner access with safeguards.
**Live:** roster via self-gated RPC, invite via `pending_invites`, revoke with self-revoke warning, client-side last-admin lock.
**Gaps:** **the last-super-admin protection is client-only** (a direct RPC call or two concurrent revokes can lock the platform out entirely); invites send no email and only apply at onboarding; no audit trail; nothing expires pending invites.

### 7.5 `/account/:userId`
**Intent:** single-user dossier: identity, role, owned agency, roster, activity, plan.
**Live:** header/role badge, stat cards, roster (owner-only), recent projects, entry to preview mode.
**Gaps:** subscription tier pills are a **decorative stub** ("wired to real billing later"); no access-status surface (must cross-reference `/admin/agencies`); owned-agency is singular/owner-only; no role controls here; "Active" status is a literal.

---

## 8. Backend & AI pipeline

Full detail: [audit/05-backend-data-ai.md](audit/05-backend-data-ai.md).

### 8.1 Data model (34 tables, by domain)
- **Identity/tenancy:** `agencies` (access status, trial, flags, quotas, image model, industries), `agency_members`, `agency_access_log`, `user_roles`, `profiles`, `industries`, `company_profiles`; LEGACY `team_members`.
- **Clients/brand:** `clients`, `brand_guidelines` (structured facts), `brand_intelligence` (approval-gated memory, 6 categories), `venue_intelligence`, `show_costs`; `brand_assets` (**missing from generated types** — accessed via casts).
- **Projects:** `projects` is the central record — brief text/file/parsed JSONB, all **eight element JSONB columns**, `spatial_strategy` (zones/features/materials/hanging/activeConfigKey), suite hierarchy (`parent_id`, `is_suite`, inheritance flags), `render_prompts`/`hero_prompt` (write-orphaned); `custom_project_types`, `project_type_configs` (INERT), `activation_types` + `activation_type_overrides`.
- **Renders:** `project_images` (angle-id versioning, `is_current`, `prompt_artifacts` = prompt/negative/geometry/compliance/references/model/config tags/hangingApproved), `rhino_renders`.
- **Pricing:** `plan_items`, `pricing_sources` + `pricing_quotes` (**no writers exist**), `regional_factors`; RPCs `price_plan`, `project_pricing_summary`.
- **Knowledge/RAG:** `knowledge_documents` (scoped, pinned, priority-weighted) + `knowledge_chunks` (pgvector 768) + `rag_query_log`; LEGACY `knowledge_base_files`, `activation_type_kb_files`, `kb_migration_log`.
- **Invites/telemetry:** `pending_invites`, `platform_invites`, `project_invites`, `ai_usage_events` (+ usage RPCs), `beta_waitlist` (not in types).
- **Storage buckets:** `project-images`, `knowledge-documents` (private/signed), `knowledge-base` (LEGACY, public), `brand-assets`, `rhino-renders`, `company-assets`, `briefs`.

### 8.2 Prompt composition (client-owned, `src/lib/normalizedBrief.ts`)
`normalizeBrief` → `validateBrief` (hard constraints + gap catalog) → `composePrompt`, dispatching on industry input mode:
- **Spatial-canvas renderer**, section order: `# SCENE` (per-type photographic lineage) · `# SPACE` (rectangular carpet allocation; "design organically above the floor") · `# HANGING ELEMENTS` (venue-rigged; creative direction = EXACT lock) · `# STRUCTURAL APPROACH` · `# ZONE PROGRAM` (deduped functional purposes only — coordinates deliberately removed) · `# BRAND` (role-tagged hex, signage visibility rules) · `# BUDGET REALITY` (standard/premium/ultra material vocabulary + the one-accent-upsell rule; no budget → premium) · `# CONTEXT` · `# ENVIRONMENT` (always; the void-ban's positive half) · `# DESIGN INTENT` · `# HARD CONSTRAINTS` · `# NEGATIVE` (inline; includes the blank-background/void ban).
- **Existing-space path** for interior verticals: SCENE / EXISTING SPACE / PRESERVE / REDESIGN / INTENT / CONSTRAINTS / NEGATIVE (SPACE and ZONE PROGRAM deliberately omitted).
- **Consistency model:** hero rendered from the full composed prompt (used **verbatim** by the edge function) → hanging-element human gate (approval keyed to config × hero image, persisted to the image row; refinements go through a locked EDIT-MODE template with no composedPrompt so the edge takes the edit branch) → view fan-out with deliberately **terse** ~100-token prompts + hero-as-only-reference (long prompts made gpt-image-2 regenerate from scratch) → per-config save handlers bind renders to their size.
- **Image chain:** gpt-image-2 primary (edits endpoint with ≤4 refs + optional mask) → Gemini image fallback chain; SVG refs stripped; floor-plan PNGs deliberately never attached (label-bleed); server-side upload returns short URLs; `modelUsed`/`primaryError` surface in the UI.

### 8.3 Knowledge & intelligence retrieval
- **Approval gate (LIVE):** both element and render call sites filter `is_approved` before sending brand intelligence. Confidence scores are display-only.
- **Deterministic brand context (LIVE):** `brandRAGBuilder` assembles guidelines + approved intelligence + assets + venue + legacy KB into a token-budgeted prose block passed to element/hero/view calls (capped 600/500 chars in image prompts, placed last by design).
- **Vector RAG (PARTIAL — the flagship gap):** upload→embed→auto-tag→hybrid retrieval (`match_knowledge_chunks`: 0.7 vector + 0.3 BM25, × per-doc priority, × scope weights project 1.0 > client 0.85 > activation_type 0.75 > agency 0.6, dedupe, optional rerank, pinned force-include, `rag_query_log` analytics) is fully built — **but every `buildRagContext` call is gated on `agency_id`, and the brief/element/hero/view call sites never send it.** Retrieval is live only for materials, 3-D briefs, and decks. The main promise — "every new activation has context of previous and stored data" — is currently only carried by the deterministic brand block, not the document corpus.
- **Learning loop:** capture (PLANNED — no `learning_events`), distill (PARTIAL — manual Save Learnings + regen-feedback capture), approve (LIVE), retrieve (PARTIAL per above), generate (LIVE). Matches `docs/intelligence/` and the public `/architecture` page.

### 8.4 Edge functions (29)
Full table in [audit/05-backend-data-ai.md §2](audit/05-backend-data-ai.md). Highlights: `parse-brief`, `synthesize-brief`, `suggest-brief-field`, `generate-element`, `enrich-spatial`, `generate-hero`/`generate-view`/`save-render-image` (the render triple, with the PGRST204 artifacts fallback and server-side uploads), `generate-panorama`, `polish-rhino-render`, `generate-video`, `generate-materials`, `generate-3d-brief`, `generate-presentation` (Claude designed-deck + pptx + ping), `analyze-existing-space`, `deep-dive-brand`, `scrape-*`, `extract-learnings`, `embed-document`, `auto-tag-document`, `rag-retrieve`, `migrate-legacy-kb`, `admin-invite-user`, `admin-manage-role`.
**Deployed but never invoked from the app:** `rag-retrieve` (standalone), `summarize-document`, `extract-pricing`, `brand-compliance-check`, `best-practices-suggest` — five finished capabilities with no product surface. `summarize-document` and `brand-compliance-check` are additionally **schema-mismatched** against `brand_intelligence` (columns that don't exist).
**Security posture:** ~14 functions run `verify_jwt = false`; several re-auth internally, but `generate-hero` performs no authentication and the shared `access-gate.ts` (suspension check for edge functions) is imported by zero functions.

### 8.5 Models & telemetry
Task→model roster: Gemini 2.5 Flash (parse/synthesize/tag/learnings/rerank), Flash-Lite (field suggestions), 2.5 Pro (elements, enrichment, vision, deep-dive), Gemini 3 Flash preview (materials/3-D), `gemini-embedding-001` (768-d), Claude Sonnet (decks/summaries/compliance), gpt-image-2 → Gemini image previews (renders), Runway/Kling/Veo (video). Client-facing model names (Signature/Studio/Draft/Typographic) hide providers — but **the per-agency image-model preference is INERT** (both render functions `void imageModel`). Every AI call fire-and-forget logs to `ai_usage_events` with a hardcoded price table; the platform AI-usage dashboards read it (LIVE).

---

## 9. Consolidated gap register

The single prioritized list, deduplicated across all five audits. **P0 = broken promise or data-integrity risk · P1 = built-but-disconnected intent · P2 = duplicated/legacy systems to consolidate · P3 = polish.**

### P0 — broken or risky now
1. **`projects.agency_id` never stamped on insert.** Weakens agency RLS for all new projects, broke client counts (worked around), and makes `price_plan` raise for every post-onboarding project. One-line fix at insert + backfill; unlocks pricing and honest agency scoping.
2. **RAG retrieval disconnected from the core flow** — no `agency_id` sent by parse-brief/element/hero/view call sites; the knowledge corpus never reaches briefs, concepts, or renders.
3. **Element edits and deck state are volatile** — detail-panel edits never persist; designed decks are localStorage-only.
4. **Multi-config leaks**: `enrich-spatial` and all Export payloads hardcode `configs[0]`, ignoring the selected size.
5. **Hanging-element split-brain**: canvas-authored hanging elements never reach the prompt; Review discards dimension edits.
6. **Route/auth confusions**: dead `/platform-invites` nav item → 404; blank first paint on `/admin` for super admins; login discards redirect intent (breaks invite links); `revoke_super_admin` can empty the roster server-side; `admin-invite-user` 403s for pure super admins.
7. **Suspension is soft where it matters**: `canWrite` unused (raw RLS errors instead of disabled UI), edge functions unmetered by access status (AI spend continues), RLS coverage partial.
8. **Step/status fiction**: `status:"completed"` and `render_prompts` never written → pipeline UI lies; pill completion positional.
9. Brief file signed URLs expire after one year with no refresh path.

### P1 — authored intent with no effect (wire or remove)
10. `project_type_configs` (render context + AI guidance editor) read by nothing.
11. `agencies.feature_flags` and `quotas` — full admin UI, zero readers.
12. Per-agency image model preference `void`ed by both render functions.
13. Style presets dead on the composed prompt path.
14. Company-profile brand colors/tagline/contacts and `logo_dark_url` unconsumed.
15. Subscription tier pills decorative; no billing model anywhere.
16. Five deployed edge functions never invoked (`rag-retrieve`, `summarize-document`, `extract-pricing`, `brand-compliance-check`, `best-practices-suggest`) — two of them schema-mismatched.
17. `pricing_sources`/`pricing_quotes` have no writers — the provenance chain resolves to override-or-unpriced only.
18. `activation_type_agency` + `industry` KB scopes embedded but never retrieved.
19. Preview mode: no read-only enforcement, no agency binding, no persistence.
20. Invites that never email (`pending_invites` everywhere; super-admin grant only applies at onboarding).

### P2 — parallel systems to consolidate
21. Two project knowledge bases (`knowledge_documents` vs legacy `knowledge_base_files`) — Step 03 reads only the legacy one; `migrate-legacy-kb` exists but is buried.
22. Two team systems (`agency_members` vs `team_members`) — both shipping, different doors.
23. Three invite systems (§2).
24. Four project-type systems (§5.8).
25. Orphan surfaces: `/rhino`, `/knowledge-base`, `/team`, commented `/explore`; duplicated Rhino UI.
26. Per-user vs per-agency confusion: `company_profiles`, `project_type_configs`, venue intelligence — all "agency" concepts keyed to `user_id`.

### P3 — polish
27. Brand identity drift: "BriefEngine" on invite page, `hello@exhibitus.com` on suspension, "4-scope vs 5-scope" copy, off-brand 404, no mobile nav on landing.
28. `interior_design` second-class across icon/hero/copy/seed maps.
29. Dead buttons/fields: Export SVG, badge_scan_cost, Share/Archive toasts (see P0/P1 for their real fixes).
30. Measurement system localStorage-only; prompt versions localStorage-only (schema column missing).
31. Dark-theme token classes on `SuspensionBanner` inside the light shell.

---

## 10. Requirements statement (forward intent)

Condensing the above into the platform's requirement set — each item is already designed and partially built; none requires invention:

1. **One tenancy truth.** Stamp `agency_id` at project insert; migrate per-user "agency" tables (`company_profiles`, `project_type_configs`) to agency scope; one team system (`agency_members`); one invite system with real email delivery and acceptance outside onboarding.
2. **Memory that actually compounds.** Pass agency/client/activation/project scope into every generation call so the built RAG layer runs; merge the legacy KB; retire dead scopes or wire them; land `learning_events` (Phase 1 of `docs/intelligence/roadmap.md`) so capture stops being manual.
3. **One status model.** Persisted per-step status driving pills (incl. `blocked`), routing, and project cards; write `completed`; make blocking gaps block.
4. **Config fidelity end-to-end.** The active booth size selected once must govern enrichment, preflight, renders (already does), exports, and pricing.
5. **Honest enforcement.** `canWrite` consumed by the UI; `access-gate` imported by spend-incurring edge functions; server-side last-super-admin lock; role guards at the routing layer.
6. **Close the authoring↔effect loops.** Either wire `project_type_configs`, feature flags, quotas, image-model preference, style presets, and company branding into their consumers — or remove the editors. A control that does nothing is debt with a UI.
7. **Ship the buried capabilities.** Share links (project_invites → the Share menu), compliance check and best-practices as surfaces, pricing sources/quotes authoring (rate-card import), document summarize/extract-pricing on the KB rows.

---

*Maintained alongside the code in `docs/frd/`. The audit appendices are point-in-time (2026-08-12); update them by re-running the domain audits after major changes. Companion documents: `docs/intelligence/` (intelligence-layer architecture + roadmap), `design/flows/` (Flow C artboards 24–50 + SPEC), the public `/architecture` page.*
