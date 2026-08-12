I have everything I need. Here is the full audit.

# CANOPY — Agency Workspace (Site-Level) Functional Audit

Scope: all site-level (non-project-step) agency pages. All routes are wrapped in `ProtectedRoute` (`/Users/bryanscott/Desktop/Brief to Booth/src/components/layout/ProtectedRoute.tsx`), which enforces: auth → onboarding gate (must belong to an agency, else `/onboarding/create-agency`) → access gate (disabled/trial-expired → `/access-suspended`). Super admins bypass both gates. Sidebar nav for this whole surface is defined in `/Users/bryanscott/Desktop/Brief to Booth/src/components/layout/AppSidebar.tsx` (`agencyNavItems`).

---

### 1. Projects — `/projects`
File: `/Users/bryanscott/Desktop/Brief to Booth/src/pages/Projects.tsx` (853 lines)
Components: `/Users/bryanscott/Desktop/Brief to Booth/src/components/projects/ProjectCard.tsx`, `/Users/bryanscott/Desktop/Brief to Booth/src/components/projects/ProjectVisualThumb.tsx`, `/Users/bryanscott/Desktop/Brief to Booth/src/lib/projectDisplay.ts`

**Route & access** — `/projects`, ProtectedRoute (all gates on). Sidebar label "All Projects". Additional admin affordance: an owner-filter toggle ("My Projects" / "All Users") appears only when `useIsAdmin()` is true.

**Intent** — The workspace home: every project the user can see, as a visual grid or a client-grouped table, with pipeline-completion at a glance and a single entry point for creating new projects or suites.

**UI anatomy**
- `PageHeader`: eyebrow `{agency.name} · {n} active projects` (or "projects · all users" in admin mode), title "Your Projects" / "All Projects", action = **New Project** dialog.
- Filter bar: admin owner toggle (My Projects / All Users) · search input · client `Select` (only rendered when `clients.length > 0`, with an X to clear) · grid/table view toggle (right-aligned, persisted to `localStorage["projects:viewMode"]`) · result count.
- Admin notice banner when in "All Users" mode.
- **Grid view**: `ProjectCard` per top-level project. Card anatomy: 16:9 banner (hero render; hover scrub across cursor X indexes into all current renders, with dot indicators; falls back to client-logo-on-brand-gradient, then to project initial), status pill top-right, 3-dot menu top-left, "Suite · N" badge bottom-left; body = client name (title) / activation name (subtitle) / updated-time + Mine|Shared chip / 6-segment pipeline progress bar with per-step tooltips. Suite parents span full width and can expand to a nested child grid.
- **Table view**: projects grouped by client (`SectionLabel` + count chip), rows show `ProjectVisualThumb` (hero → client logo → brand-color gradient with initial → folder icon), activation name, updated-relative time, % complete, Shared marker, status pill, 3-dot menu.
- Empty states: "No results for …" (when searching) vs "No projects yet" with a Create First Project CTA.
- 3-dot menu items: Open suite overview (suite parents only) · Share… · Archive · Delete (own projects only, behind an `AlertDialog`).

**Inputs**
- User: project name, optional brand website URL, "Create Suite instead" toggle, search text, client filter, owner filter, view mode, suite expand/collapse.
- Data: `useProjects(adminMode)` → `projects` table `select *` ordered by `updated_at desc`; non-admin mode additionally `.eq("user_id", user.id)`. `useClients()` → `clients` filtered by `agency_id`. `useProjectThumbnails(projectIds)` → single bulk query on `project_images` (`is_current = true`), bucketed per project and sorted hero-first (`hero_34` → `hero*` → rest), 5-min `staleTime`. `useIsAdmin()` → `user_roles`. `useAgency()` for the header.

**Workflows**
- **Create project** → `createProject.mutateAsync({name, brand_website_url})` inserts into `projects` (`user_id`, `name`, `status: "draft"`, `brand_website_url`) → if "Create Suite", an immediate second `supabase.from("projects").update({is_suite:true})` → `setActiveStep("upload")` → navigate `/upload?project=<id>` (`&suite=true` for suites).
- **Open project** → suite parents (has children OR `is_suite`) → `/suite?project=<id>`; otherwise status-routed: draft/parsing → `/upload`, reviewed → `/review`, generating → `/generate`, completed → `/export`, default `/upload`.
- **Open suite child** (expanded grid) → `/review?project=<childId>`.
- **Delete** → `deleteProject.mutate(id)` → hard `DELETE` on `projects`, invalidates `["projects", user.id]`, toast.
- **Share… / Archive** → toast only ("coming soon"). No mutation.

**Outputs & side effects** — Insert/update/delete on `projects`; localStorage write for view mode; navigation into the project pipeline. No edge functions invoked from this page.

**Current-state gaps**
- **Share and Archive are pure stubs.** Both the card menu (Projects.tsx L793–800) and the table-row menu (L690–713) fire toasts titled "Sharing — coming soon" / "Archive — coming soon". There is no `archived` column and no per-project sharing model.
- **Create-dialog copy over-promises.** The helper text says "We'll scrape colors, logo, fonts, and voice from this URL and pre-load it into brand intelligence for this project" (L414–417), but `createProject` only persists `brand_website_url`. The actual scrape (`deep-dive-brand`) is only triggered later from `BrandWebsiteCard` on the Upload step.
- **Grouping computes but discards `parentIds`.** The `useMemo` at L211–237 builds a `parentIds` set that is never returned or used.
- Search matches on raw `p.user_id` UUID (L250) — placeholder for "search by user"; no email/display-name join exists.
- The client filter is hidden entirely when the agency has zero clients, and grouping in table view buckets unlinked projects under a synthetic `__brand__:<name>` key derived from `parsed_brief.brand.name`, or "Unassigned".
- `deleteProject` is only offered for `isOwn` projects even in admin mode; admins can open but not delete others' projects from this page.
- Non-admin `useProjects` re-applies `.eq("user_id", user.id)` on top of RLS, so agency teammates' projects are invisible on `/projects` even though the ProjectCard has a "Shared" affordance and RLS would permit them.

---

### 2a. Clients — `/clients`
File: `/Users/bryanscott/Desktop/Brief to Booth/src/pages/Clients.tsx` (290 lines)
Hook: `/Users/bryanscott/Desktop/Brief to Booth/src/hooks/useClients.tsx`

**Route & access** — `/clients`, ProtectedRoute. Sidebar "Clients". Sidebar active-state also matches `/clients/:id`.

**Intent** — Roster of the brands the agency designs for; each card is the doorway into that client's brand intelligence, knowledge, and projects.

**UI anatomy** — `PageHeader` (eyebrow `{agency.name} · N clients`, title "Clients", action = **Add client** dialog). Body = 3-column card grid sorted by name; each `ClientCard` shows logo (or 2-letter initials fallback), name, industry, a `{n} projects` mono pill, and an "Open →" link to `/clients/:id`. Empty state = "No clients yet" with an Add-your-first-client CTA.

**Inputs**
- User (Add-client dialog): Name (required), Industry, Website, Logo URL (plain text URL — no upload), Notes.
- Data: `useClients()` → `clients` where `agency_id = agency.id`, ordered by name, `enabled` only when both user and `agency.id` exist. `useClientProjectCounts(agency.id)` → `projects` `select("client_id").not("client_id","is",null)`, tallied client-side.

**Workflows** — **Create client** → `useUpsertClient` inserts into `clients` with `user_id = auth user` and `agency_id` stamped from `useAgency()`; invalidates `["clients"]`, toast "Client saved", closes dialog, resets form.

**Outputs & side effects** — Insert into `clients`. Navigation to the client dashboard.

**The project-count fix (as observed in code)** — `useClientProjectCounts` (L35–59) carries an explicit comment: the count query is *deliberately not* filtered by `projects.agency_id`, "because that column is only backfilled when an agency is created and is never stamped on new project inserts, so filtering on it returned 0 for every client." It now relies on RLS to scope the rows and tallies by `client_id`. This is confirmed by `useProjects.createProject`, which inserts no `agency_id`, and by the `agency_members_can_write_projects` policy in `/Users/bryanscott/Desktop/Brief to Booth/supabase/migrations/20260427120000_agency_access_control.sql` (L520+), which keys off `projects.agency_id`. Same pattern is called out as the precedent used by `AgencyPricing`'s plan-item rollup.

**Current-state gaps**
- The query is still gated on `enabled: !!agencyId` even though it no longer filters by agency — counts silently render 0 for a user with no agency.
- Underlying data issue remains: `projects.agency_id` is not stamped on insert, so any RLS/analytics that keys off it is unreliable for new projects.
- No edit or delete affordance on this page (`useDeleteClient` exists in the hook but is only wired in `ClientsManager`); no logo upload (URL string only); `primary_color` / `secondary_color` are on the `Client` model and consumed by ProjectCard/ProjectVisualThumb but have **no editor on this page or on the client dashboard** — they are only ever populated by the deep-dive.

---

### 2b. Client Dashboard — `/clients/:clientId`
File: `/Users/bryanscott/Desktop/Brief to Booth/src/pages/ClientDashboard.tsx` (496 lines)
Components: `/Users/bryanscott/Desktop/Brief to Booth/src/components/admin/BrandIntelligencePanel.tsx` (781 lines), `/Users/bryanscott/Desktop/Brief to Booth/src/components/knowledge/KnowledgeBasePanel.tsx`

**Route & access** — `/clients/:clientId`, ProtectedRoute. Tab is controlled by `?tab=` (`brand` | `knowledge` | `projects`, else `overview`) so other surfaces can deep-link (the code cites Preflight's "Edit brand" → `?tab=brand`); tab changes `replace` the URL.

**Intent** — The per-client hub: identity, freeform notes, AI-extracted brand intelligence, scoped RAG documents, and the client's project list.

**UI anatomy**
- Back link to `/clients`; `ClientHeader` (`PageHeader` with 64px logo/initials leading, eyebrow "Client · {industry}", title = name, subtitle = clickable website, action = **Edit client**).
- Tabs: **Overview** · **Brand** · **Knowledge** · **Projects**.
- Overview: two stat cards (Projects count; Last activity = `updated_at` relative + created date) + a full-width auto-saving Notes textarea.
- Brand → `BrandIntelligencePanel`: (a) "Brand auto-discovery" card with a Website|Brand-book-PDF mode toggle and Run/Re-run deep dive button; (b) "Brand assets" card showing logo + primary/secondary color swatches; (c) intelligence entries grouped by category card (Strategy & Voice, Visual Identity, Brand Rules, Past Learnings, Vendors & Materials, Cost Benchmarks) with Approved/Pending badges, "From past project" badge, hover Approve/Delete buttons, tag chips, and — for the "Brand Colors" entry — a parsed hex `ColorSwatchRow`.
- Knowledge → `KnowledgeBasePanel` scoped `client` / `scopeId = clientId`.
- Projects → flat list of linked projects, each linking to `/upload?project=<id>` with a status badge and relative updated time.
- `EditClientDialog`: Name, Industry, Website, Logo URL.

**Inputs**
- Data: `useClient(clientId)` → single `clients` row. `useClientProjects(clientId)` → `projects` `select id,name,project_title,status,updated_at,created_at` where `client_id = :id`. `useBrandIntelligence(clientId)` → `brand_intelligence` ordered by category then created_at. `useBrandGuidelines` (via the panel's upsert).
- User: client field edits; notes; website URL or a PDF file for the deep dive; approve/delete on individual intelligence entries; KB document drops.

**Workflows**
- **Edit client** → `useUpsertClient` update on `clients` (re-stamps `agency_id`).
- **Notes** → on blur, direct `supabase.from("clients").update({notes})`, invalidates `["client", id]`, toast "Notes saved".
- **Deep dive (URL)** → persists a changed website first, then `supabase.functions.invoke("deep-dive-brand", { url, clientName, industry })`.
- **Deep dive (PDF)** → three size-tiered payloads to the same function: ≤2 MB inline `{fileBase64, fileType:"pdf", …}`; 2–6 MB uploads to storage bucket `knowledge-base` at `clients/{clientId}/brand-pdf/{ts}_{name}` then sends `{storageBucket, storagePath, …}`; >6 MB rasterizes client-side via `renderPdfToImages` (maxWidth 1500, quality 0.72, **maxPages 40**) and sends `{pageImages: string[]}`. Progress is surfaced ("Rendered page i of N…").
- **Deep-dive persistence** (`persistDeepDiveResult`) → dedupes incoming entries against existing by `category::title`: identical content+tags → skipped; changed content → row `UPDATE` (preserving approval state); new → `useBatchCreateIntelligence` insert with `source: "ai_extracted"`, `is_approved: false`, `confidence_score: 0.85`. Then upserts `brand_guidelines` (non-fatal, logged on failure), then patches the client row with `logo_url` / `primary_color` / `secondary_color` **only when those fields are currently empty**. Toast reports "N added · N updated · N unchanged".
- **Approve entry** → `brand_intelligence.update({is_approved:true, approved_at})`. **Delete entry** → row delete.

**Outputs & side effects** — Writes to `clients`, `brand_intelligence`, `brand_guidelines`, storage bucket `knowledge-base` (large PDFs), plus everything the KnowledgeBasePanel does (see §4). Edge function: `deep-dive-brand`.

**Current-state gaps**
- `SpecMono` is imported but never used (`ClientDashboard.tsx` L37).
- Overview "Projects" stat and the Projects tab both count *all* projects linked to the client with no status/archived filter.
- No delete-client action on the dashboard.
- Brand colors and logo can only be set by the deep dive or the Logo-URL text field; there is no color editor, so `primary_color`/`secondary_color` (used for card gradients) can never be corrected in the UI.
- Deep-dive PDF path silently truncates at 40 pages (a toast warns, but content past page 40 is never analysed).
- Approval state is captured but **not enforced anywhere** — nothing filters `brand_intelligence` by `is_approved` when building generation context.
- `brand_guidelines` upsert failure is swallowed as non-fatal, so the structured projection can silently drift from `brand_intelligence`.

---

### 3a. Activation Types — `/agency/activation-types`
File: `/Users/bryanscott/Desktop/Brief to Booth/src/pages/ActivationTypes.tsx` (392 lines)
Hook: `/Users/bryanscott/Desktop/Brief to Booth/src/hooks/useActivationTypes.tsx`

**Route & access** — `/agency/activation-types`, ProtectedRoute. Sidebar "Activation Types".

**Intent** — The catalogue of formats the agency builds (booths, pop-ups, installations …), mixing platform built-ins with agency-created custom types, so that the AI knows the grammar of each format.

**UI anatomy** — `PageHeader` with vocabulary-driven labels (`useVocabulary()` supplies `project_types` / `project_type` / `projects` per industry), eyebrow `Agency · {visible} of {total} types · {industries}`, action = **New {project type}**. Optional industry filter chip row (only when the agency spans 2+ industries; "All industries" + one chip per industry). Body = types grouped by category (11 categories: engagement, hospitality, support, outdoor, digital, residential, commercial, civic, film, live, themed), each group headed by a colored `SectionLabel` + count chip; cards show label, mono slug, a star favorite toggle, description (1-line clamp), and meta chips `~{defaultSqft} sqft`, `{defaultScale}`, `Built-in`. Create dialog: Name, Category select, Description.

**Inputs**
- Data: `useActivationTypes()` → `activation_types` where `is_builtin = true OR user_id = me`, ordered by category then label, then **merged** with this agency's rows from `activation_type_overrides` (`agency_id = agency.id`). Industry isolation filter: built-ins pass only if their `industries[]` intersects the agency's industries; untagged built-ins are treated as universal; custom types always pass. `useIndustries()` for the filter chips, `useAgency()` for `industries` / `primary_industry`.
- User: label, category, description; industry filter; favorite stars.

**Workflows**
- **Create type** → slug is derived from the label (`lowercase → non-alnum to _ → trim _`) → `useCreateActivationType` inserts into `activation_types` with `is_builtin: false`, `user_id`, and `industries` auto-resolved from the agency's industries (fallback `["experiential"]`). Invalidates `["activation-types"]`.
- **Favorite** → local only: a `Set` in state mirrored to `localStorage["canopy.activationTypes.favorites"]`; sorts favorited types to the front of their category group. No DB write, not shared across users or devices.
- **Open type** → `/agency/activation-types/:typeId`.

**Outputs & side effects** — Insert into `activation_types`; localStorage write for favorites.

**Current-state gaps**
- Favorites are device-local and invisible to teammates (documented as "a local presentation preference (no schema change)").
- The create dialog only captures label/category/description — `default_scale`, `default_sqft`, `parent_type_affinity`, `element_emphasis`, and `render_context_override` are all supported by `useCreateActivationType` but have no field in this UI (they are only editable in the *platform* `ActivationTypeManager`).
- No delete/rename for custom types on this page (`useDeleteActivationType` and `useUpdateActivationType` exist but the list surfaces neither).
- `agencyIndustries` falls back to `["experiential"]` when the agency's `industries[]` is empty — a defensive workaround for an unbackfilled column.
- Duplicate slugs are not checked client-side; a collision surfaces as a raw DB error toast.

---

### 3b. Activation Type Dashboard — `/agency/activation-types/:typeId`
File: `/Users/bryanscott/Desktop/Brief to Booth/src/pages/ActivationTypeDashboard.tsx` (434 lines)

**Route & access** — `/agency/activation-types/:typeId`, ProtectedRoute. Renders "Activation type not found" when the id isn't in the (industry-filtered) list.

**Intent** — Teach the AI one format: what it must include, what it must never include, its size envelope, free-form notes, plus the reference documents that ground generation for it.

**UI anatomy** — Back link; `PageHeader` with `Built-in` and/or `Customized` status chips and a **Restore defaults** action (only when built-in *and* overridden, behind an AlertDialog). Two tabs:
- **Template**: an explainer card for built-ins (different copy depending on whether an override exists) + five cards — Description (textarea) · Must-have elements (input + Add, removable badges) · Must-avoid elements (same, destructive badges) · Typical size range (Min/Max sqft number inputs) · Template notes (textarea, described as "injected into every prompt for this activation type"). Save button, disabled until `dirty`.
- **Knowledge**: two stacked `KnowledgeBasePanel`s — scope `activation_type_agency` ("Your agency's knowledge", agency-private) and, in a dashed card badged "System foundation · Managed by platform admins", scope `activation_type` ("Foundation", platform-wide baseline).

**Inputs** — `useActivationTypes()` (the same merged list; the effective template is `elementEmphasis.template`, which is the override's `template` when present, else the built-in default). User inputs: description, must_have[], must_avoid[], sqft_min, sqft_max, notes, document uploads.

**Workflows**
- **Save (built-in)** → `useUpsertActivationTypeOverride` upserts `activation_type_overrides` on conflict `(agency_id, activation_type_id)` with `{agency_id, activation_type_id, description, template, created_by}`. Toast: "Your customizations are now active for your agency."
- **Save (custom)** → `useUpdateActivationType` updates the `activation_types` row directly (`.eq("user_id", me)`), writing `element_emphasis = {...existing, template}`.
- **Restore defaults** → `useDeleteActivationTypeOverride` deletes the override row for `(agency_id, activation_type_id)`. Copy explicitly notes KB entries are unaffected.

**Outputs & side effects** — Writes to `activation_type_overrides` or `activation_types`; document uploads (see §4).

**Current-state gaps**
- **The `activation_type_agency` scope is a dead end for retrieval.** `rag-retrieve` (`/Users/bryanscott/Desktop/Brief to Booth/supabase/functions/rag-retrieve/index.ts` L55–60, L264–268) and `_shared/rag-helper.ts` both only build scope calls for `agency | client | activation_type | project`, and `SCOPE_WEIGHTS`/`DEFAULT_SCOPE_WEIGHTS` have no `activation_type_agency` entry. Documents uploaded into the "Your agency's knowledge" panel are stored and embedded but never retrieved. Only the DB check constraint (migration `20260430192731…sql` L436) knows the scope exists.
- Built-in *type-level* fields (`default_scale`, `default_sqft`, `render_context_override`, `element_emphasis` emphasis weights, `parent_type_affinity`) cannot be overridden per agency — the override table only carries `description` + `template`.
- The `useEffect` sync depends on `(type as any).updatedAt`, a property that doesn't exist on `ActivationType` (it's `updated_at` on the row and isn't mapped) — the dependency is inert.
- No confirmation of whether template `notes` actually reach prompts is verifiable from this page; the copy asserts injection but the injection point is in the generation functions, not here.
- The platform-managed "Foundation" panel is fully interactive (upload/delete) for agency users; access is enforced only by RLS, not by the UI.

---

### 4. Agency Knowledge — `/agency/knowledge`
Files: `/Users/bryanscott/Desktop/Brief to Booth/src/pages/AgencyKnowledge.tsx` (60 lines), `/Users/bryanscott/Desktop/Brief to Booth/src/components/knowledge/KnowledgeBasePanel.tsx` (564 lines), `/Users/bryanscott/Desktop/Brief to Booth/src/hooks/useKnowledgeDocuments.tsx`

**Route & access** — `/agency/knowledge`, ProtectedRoute. Sidebar "Agency Knowledge". Renders "You aren't a member of an agency yet" when `agency` is null.

**Intent** — The agency-wide document layer: playbooks, rate standards, style references — everything that should influence generation across all clients and projects.

**UI anatomy** — `PageHeader` (eyebrow `{agency.name} · Shared context`) wrapping a single `KnowledgeBasePanel` with `scope="agency"`. Panel anatomy: dropzone ("PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, or images · up to 50 MB") · a search input that appears once >3 documents · document rows. Each row: 48px thumbnail (signed-URL image preview for images, else a type-colored icon), title/filename, AI summary (2-line clamp), status badge (Ready / Processing / Pending / Failed with error tooltip), `doc_type` badge, up-to-5 tag chips (`auto_tags` + `user_tags`) with "+N more", chunk count + relative age, and action buttons: Preview (dialog with image/PDF/text iframe, Open-in-new-tab, Download), Pin/Unpin, Retry embedding (failed docs only), Delete.

**Scopes supported by the panel** — `agency` · `activation_type` · `activation_type_agency` · `client` · `project` · `industry`. Industry-scoped docs are global (`agency_id IS NULL`) and super-admin-managed.

**Inputs** — Files (accept list is MIME-mapped, 50 MB hard cap enforced client-side twice: dropzone `maxSize` and an explicit per-file check with a toast). Data: `knowledge_documents` filtered by `scope`, `scope_id`, and `agency_id` (or `agency_id IS NULL` for industry scope), ordered `created_at desc`.

**Workflows — the upload/processing pipeline**
1. Upload file to storage bucket `knowledge-documents` at `{agency_id}/{scope}/{scope_id}/{timestamp}_{sanitizedName}` (industry scope: `industry/{scopeId}/…`).
2. Insert a `knowledge_documents` row with `status: "pending"`, `uploaded_by`, `mime_type`, `file_size_bytes`, `user_tags`.
3. Invoke edge function **`embed-document`** `{document_id}` (non-blocking; failure is logged, not thrown — the row's status reflects it).
4. After a 3 s `setTimeout`, invoke **`auto-tag-document`** `{document_id}` (fire-and-forget, warn on failure).

**`embed-document`** (`/Users/bryanscott/Desktop/Brief to Booth/supabase/functions/embed-document/index.ts`): sets `status: "processing"` → extracts text (PDF via `unpdf`, DOCX via `mammoth`, images become a *synthetic caption* `"Image asset: {filename}. Reference: {stem}."` — images are never OCR'd or vision-tagged here, TXT/MD/CSV/unknown decoded as UTF-8) → sanitizes for Postgres (NUL bytes, C0 controls, lone surrogates) → chunks at ~1000 chars target / 1500 max / 100 overlap on paragraph boundaries → deletes prior `knowledge_chunks` for idempotency → embeds each chunk sequentially with Gemini `gemini-embedding-001` at 768 dims, `taskType: RETRIEVAL_DOCUMENT`, small inter-chunk delay → inserts `knowledge_chunks` → sets `status: "embedded"`, `chunk_count`. On error: `status: "failed"` + `processing_error`.

**`auto-tag-document`**: Gemini 2.5 Flash tool-call `classify_document` returning `doc_type` (brief | rate_card | research | past_work | brand_guide | spec_sheet | contract | other), 3–8 lowercase `tags`, `confidence`, and a <30-word `summary`; updates the document row in place.

**How docs feed generation (rag-retrieve weighting)** — `/Users/bryanscott/Desktop/Brief to Booth/supabase/functions/_shared/rag-helper.ts` `buildRagContext()` is what generation actually calls (consumers: `parse-brief`, `generate-element`, `generate-hero`, `generate-view`, `generate-materials`, `generate-3d-brief`, `generate-presentation`). Mechanics, mirrored in the standalone `rag-retrieve` function:
1. Embed the query once (`RETRIEVAL_QUERY`, 768 dims).
2. Fan out one `match_knowledge_chunks` RPC per active scope (`agency` always unless disabled; `client`, `activation_type`, `project` when ids are supplied), each with a candidate pool of `max(top_k*3, 12)` split across scopes, `_vector_weight` default **0.7** (hybrid pgvector + BM25).
3. Multiply each row's `hybrid_score` by its **scope weight**: `project 1.0 · client 0.85 · activation_type 0.75 · agency 0.6`. Per-document `priority_weight` is already folded into `hybrid_score` inside SQL.
4. De-dupe by `chunk_id` keeping the highest weighted score.
5. Optional LLM reranker (`rerank: true`, default off) over the top ≤20 candidates via Lovable gateway → Gemini 2.5 Flash fallback, scoring 0–1.
6. **Pinned documents are force-injected** — one chunk per pinned doc is pushed to the front before the top-K fill.
7. Enrich with `filename`/`title`/`doc_type`, group `by_scope`, and fire-and-forget an analytics row into `rag_query_log` (`query`, `scopes`, `scope_ids`, `top_k`, `result_chunk_ids`, `result_doc_ids`, `reranked`, `pinned_doc_ids`, `duration_ms`).

Default `top_k` is 8 in `rag-retrieve`, 6 in `buildRagContext`.

**Outputs & side effects** — Storage object write/delete in `knowledge-documents`; rows in `knowledge_documents` and `knowledge_chunks` (cascade-deleted with the doc); `rag_query_log` rows at retrieval time; two edge-function invocations per upload.

**Current-state gaps**
- **The 3-second `setTimeout` before `auto-tag-document` is a race**, acknowledged in the comment ("Delay briefly so embed-document has a chance to extract text first"). Large PDFs will not have finished extraction, so tagging can run against nothing.
- **`priority_weight` has no UI.** `updateDocument` accepts it and the SQL scores on it, but the panel exposes only Pin/Unpin. Same for `title` and `user_tags` — writable by the hook, no editing control in the row.
- **`summarize-document` is dead code.** The edge function exists and is registered in `supabase/config.toml`, but nothing in `src/` or in any other function invokes it; summaries in the UI come from `auto-tag-document`.
- **`extract-pricing` is also uninvoked** from the app (see §5).
- Images are indexed by a synthetic filename caption only — no vision tagging despite the `image/*` accept list, so visual case studies contribute almost nothing to retrieval.
- `filterTags` is a supported prop on `KnowledgeBasePanel` but no caller passes it.
- Deletion of the storage object is best-effort (`await` without error handling) before the row delete — orphaned blobs are possible.
- Preview signed URLs are minted for 1 hour on every render of an image row (`useSignedUrl` is unconditional for images), so a large list issues one storage call per image.
- Failed docs offer Retry only; there is no bulk re-embed here (that lives in the KB Health tab).

---

### 5a. Agency Pricing — `/agency/pricing`
File: `/Users/bryanscott/Desktop/Brief to Booth/src/pages/AgencyPricing.tsx` (259 lines)

**Route & access** — `/agency/pricing`, ProtectedRoute. Sidebar "Pricing"; the sidebar treats `/pricing` as the same nav item.

**Intent** — Agency-level home base for the pricing engine: explain the model, list every project that already has a bill of materials, and route into the per-project editor.

**UI anatomy** — `PageHeader` with a **Beta** `StatusChip`, eyebrow "Agency · Rate cards & supplier feeds". "How it works" overview card (notes coverage is strongest for architecture/construction/exhibit builds; "CSI MasterFormat divisions are wired in; Uniformat support is partial"). "Projects with a bill of materials" section — one row per project with an `{n} line items` pill and "Updated {relative}", linking to `/pricing?project=<id>`; empty state "No bills of materials yet" → Pick a project. "Coming soon" roadmap grid of four cards: Rate-card import · Estimate with AI · Blueprint → BOM · Live supplier feeds.

**Inputs** — `useProjects()` (own projects) and `usePlanItemRollups()` → `plan_items` `select("project_id, updated_at")` ordered by `updated_at desc`, rolled up client-side; **swallows "table does not exist" errors** so the page still renders before the Phase-1A migration is applied. 30 s `staleTime`.

**Workflows** — Read-only. Navigation to `/pricing?project=<id>` and `/projects`.

**Outputs & side effects** — None.

**Current-state gaps** — Everything in the roadmap section is non-functional marketing copy. Rollups are joined against `useProjects()` (own projects only), so a teammate's BOM disappears from the list even if `plan_items` RLS returns it. No rate-card, supplier-credential, regional-grid, or snapshot UI exists anywhere despite the page's own comments promising them for "Phase 1B".

---

### 5b. Pricing (BOM editor) — `/pricing?project=:id`
Files: `/Users/bryanscott/Desktop/Brief to Booth/src/pages/Pricing.tsx` (838 lines), `/Users/bryanscott/Desktop/Brief to Booth/src/hooks/usePricing.tsx`, `/Users/bryanscott/Desktop/Brief to Booth/supabase/migrations/20260427210000_pricing_engine_phase1a.sql`

**Route & access** — `/pricing`, ProtectedRoute; requires `?project=` or it renders "No project selected".

**Intent** — Per-project bill of materials with live cost roll-up: add line items, pick region + quality tier, and see the best-available unit price per line with its provenance.

**UI anatomy** — `PageHeader` (eyebrow "Pricing engine · N line items") with a quality-tier `Select` (Basic/Standard/Premium/Custom), a free-text Region input (default "US"), and **Add line item**. Four `SummaryTile`s: Grand total (gradient), Line items, Priced, Unpriced (amber when >0). Line-item card grouped by CSI division, each group headed with its subtotal; rows show description + manufacturer/model, category + mono `item_key`, inline-editable quantity, unit price, total (with `×N.NN regional` note when the factor ≠ 1), a color-coded **source badge**, and hover Edit/Delete. Grand-total footer. Optional "Roll-up" card summarizing by CSI division with unpriced counts. Add/Edit dialog: Description* · Quantity · Unit (12 options) · CSI division (21 divisions) · Category (13) · Manufacturer · Model number · Quality tier · Override unit price · Item key (auto-slugified from the description when blank).

**BOM model** — `plan_items` (project_id, agency_id, csi_division, uniformat_class, category, item_key, description, manufacturer, model_number, quantity, unit, quality_tier, position, override_unit_price/currency/reason, notes, metadata).

**Sources of pricing** — the `price_plan(_project_id, _region, _quality_tier)` RPC resolves per item in strict order: **1.** `override_unit_price` on the item (always wins, confidence forced to `high`) → **2.** agency-owned `pricing_quotes` matching `(item_key, quality_tier, agency_id, region|null|'global')`, most recent `fetched_at` → **3.** global quotes (`agency_id IS NULL`) when no agency quote exists → **4.** unpriced (`source = 'no_quote'`). Non-override prices are multiplied by a `regional_factors` lookup (most-specific of zip/metro/state/country; per-category factor beats the category-null factor; default 1.0). Source badge vocabulary in the UI: override, agency_rate_card, agency_inventory, ai_estimate, commodity_feed, vendor_api, rsmeans, subcontractor_quote, manual, no_quote — with the color grammar green = your own data, violet = AI, amber = external feed, red = unpriced.

**Totals & tiers** — `total_price = quantity × unit_price × regional_factor`; grand total is summed client-side from the priced rows; `project_pricing_summary` RPC provides the by-division/by-category subtotals and `unpriced_count`. The page-level tier/region selectors are query parameters to both RPCs; each line item also carries its own `quality_tier` that must match a quote for a price to resolve.

**Workflows** — Create/update/delete `plan_items` via `usePricing` mutations, each invalidating `["plan-items"]`, `["priced-plan"]`, `["pricing-summary"]` for the project. Quantity edits save on blur/Enter. Delete uses a native `confirm()`.

**Outputs & side effects** — Writes to `plan_items` only. Two RPC reads.

**What's real vs roadmap**
- **Real:** BOM CRUD, override pricing, CSI grouping, regional factors, quote resolution, division roll-up, unpriced counting.
- **Not real:** there is **no UI anywhere to create `pricing_sources` or `pricing_quotes`**, so in practice every line resolves to `override` or `no_quote`. Rate-card CSV import, "Estimate with AI", snapshot/version history, and PDF export are named as Phase 1B in the file header and do not exist. `extract-pricing` (which parses rate cards out of knowledge documents into `knowledge_documents.metadata.pricing`) exists as an edge function but is never invoked from the app and never writes into `pricing_quotes`.
- Region is a free-text input with no validation against `regional_factors` values; `uniformat_class` exists on the model with no UI (matching the "Uniformat support is partial" note); `position`, `override_reason`, and `override_currency` are likewise unexposed.
- `ItemDialog` uses `useMemo` for a side-effecting form reset (a `useEffect` in disguise), so the edit form can lag when opening a different row.

---

### 6. Company Profile — `/company`
Files: `/Users/bryanscott/Desktop/Brief to Booth/src/pages/CompanyProfile.tsx` (780 lines), `/Users/bryanscott/Desktop/Brief to Booth/src/hooks/useCompanyProfile.tsx`

**Route & access** — `/company`, ProtectedRoute. Sidebar "Company Profile". Page title renders as "Company Settings".

**Intent** — The agency's own identity (as opposed to a client's): branding used on proposals and exports, contact block, and a show/venue cost database.

**UI anatomy** — `PageHeader` with a single top-right **Save Changes** button, disabled until `profileDirty`. Three tabs:
- **Branding** — Company Information card (Company Name, Tagline, Industry, Default Booth Sizes as a comma-separated string) · Logo Assets card (two `LogoUploader` dropzones, light-background and dark-background variants, showing an "Uploaded" check badge) · Brand Colors card (two `ColorPicker`s = swatch + native color input + hex text field) with a live preview strip (primary button, secondary button, gradient bar).
- **Contact Info** — Primary Contact Name, Email, Phone, Website, Address (textarea), Internal Notes.
- **Show Costs** — "Show & Venue Cost Database" with an **Add Show** button and a table: Show (with a "Preset" badge), City/Venue, Booth $/sqft, Labor $/hr, Drayage $/cwt, Union Y/N, and Edit/Delete actions (Delete hidden for presets). Add/Edit dialog fields: Show Name*, City*, Venue, Industry, Booth $/sqft, Labor $/hr, Drayage $/cwt, Electrical $/outlet, Internet, Lead Retrieval, a Union Labor Required switch, and Notes.

**Fields (model)** — `company_profiles`: company_name, industry, default_booth_sizes (string[]), notes, logo_url, logo_dark_url, brand_color, secondary_color, tagline, contact_name, contact_email, contact_phone, address, website. `show_costs`: show_name, city, venue, industry, estimated_booth_cost_per_sqft, estimated_drayage_per_cwt, estimated_labor_rate_per_hr, estimated_electrical_per_outlet, estimated_internet_cost, estimated_lead_retrieval_cost, badge_scan_cost, union_labor_required, notes, is_preset.

**Inputs** — All of the above from the user. Data: `useCompanyProfile()` → `company_profiles` `.maybeSingle()` (no explicit user filter; relies on RLS). `useShowCosts()` → `show_costs` ordered by show_name.

**Workflows**
- **Logo upload** → 2 MB client-side cap → `supabase.storage.from("company-assets").upload("{user.id}/logos/{light|dark}_{ts}.{ext}", file, {upsert:true})` → `getPublicUrl` → sets local state and marks dirty. **The URL is only persisted when the user then presses Save Changes.**
- **Save Changes** → `upsertProfile` updates the existing `company_profiles` row by id, or inserts one with `user_id` when none exists.
- **Add/Edit show cost** → numeric strings coerced with `parseFloat` or null. Editing a **preset** creates a new custom copy (`addShowCost`) rather than updating it; toast says "Custom copy created from preset". Delete is a plain row delete behind an AlertDialog.

**How these are used downstream**
- `logo_url` / `company_name` → `DesignedDeck` (agency logo + resolved agency name on deck slides), `ProposalExport`, `ExportPackage`, `Export` page.
- `company_name`, `industry`, `default_booth_sizes`, `notes` → packaged as `companyProfile` in `ElementDashboard`'s payload to the **`generate-element`** edge function, which injects it verbatim into the user prompt as a `--- COMPANY PROFILE ---` block.
- `show_costs` → consumed by `Generate.tsx` via `useShowCosts` and passed as `showCosts` into `generate-element`.

**Current-state gaps**
- **`brand_color`, `secondary_color`, `tagline`, and all contact fields are saved but never read by any generation or export code path** — `generate-element` receives only name/industry/booth sizes/notes; the export components read only `logo_url` and `company_name`. The Branding tab's promise ("Colors used in proposal headers, accents, and styling") is aspirational.
- **`logo_dark_url` is written but never consumed** anywhere in `src/`.
- **`badge_scan_cost` is a dead field in the form**: it's in `costForm` state and in the save payload, but no input renders it, so it can only ever be null or a value inherited from an edited row.
- The profile query has no `.eq("user_id", …)` and uses `maybeSingle()`; correctness depends entirely on RLS returning exactly one row.
- This is a **per-user** profile (`company_profiles.user_id`), not per-agency — two members of the same agency maintain separate company profiles and separate `show_costs` lists.
- Logo storage path is keyed on `user.id` with `upsert: true`, but the filename is timestamped, so old logos are never cleaned up.
- Dirty state is not tracked for logo removal (there's no remove/clear affordance at all) and navigating away loses unsaved edits with no guard.

---

### 7a. Agency Team — `/agency/team`
Files: `/Users/bryanscott/Desktop/Brief to Booth/src/pages/AgencyTeam.tsx` (411 lines), `/Users/bryanscott/Desktop/Brief to Booth/src/hooks/useAgencyTeam.tsx`

**Route & access** — `/agency/team`, ProtectedRoute. Sidebar "Team". Write actions gated on `canManage = role === "owner" || role === "admin"` (from `useAgency()`).

**Intent** — The real agency membership surface: who belongs to the agency, at what role, plus outstanding email invitations.

**UI anatomy** — `PageHeader` (eyebrow `{agency.name} · N members`, action **Invite member** for managers). Members card: per-row avatar (Crown for the primary owner, else initial), email, "Joined {relative}" + "· Primary owner", and either a role `Select` (Owner/Admin/Member/Viewer) or a read-only role badge, plus a remove (trash) button. Pending invites card (managers only): dashed rows with a mail icon, email, "Sent {relative} · expires {relative}", role badge, and cancel. Role-reference card explaining Owner/Admin/Member/Viewer and noting only the primary owner can transfer ownership. Non-managers with visible members get a "You don't have permission…" card. Invite dialog: Email + Role select (Admin/Member/Viewer, each with a hint line).

**Inputs**
- `useAgencyTeam(agencyId)` → **SECURITY DEFINER RPC `list_agency_members(_agency_id)`** returning `{id, user_id, email, role, joined_at, is_primary_owner}` (the RPC is what exposes emails).
- `useAgencyInvites(agencyId)` → `pending_invites` where `invite_type = 'agency_member'`, `agency_id = …`, `status = 'pending'`.

**Workflows**
- **Invite** → email lowercased/trimmed and validated for `@` → insert into `pending_invites` `{email, invite_type: "agency_member", agency_id, role, invited_by}`. Toast "Invite sent". **No email is actually dispatched** — the model is "invitations apply automatically when the invitee signs up", and acceptance goes through the `accept_pending_invite(_invite_id)` RPC (surfaced on `/invite/:token` / `AcceptInvite`, listed via the `my_pending_invites` RPC).
- **Change role** → `agency_members.update({role}).eq("id", memberId)`; blocked client-side for the primary owner with a destructive toast.
- **Remove member** → `agency_members.delete()`; blocked for the primary owner; confirmed with a native `confirm()`.
- **Cancel invite** → `pending_invites.delete()`.

**Outputs & side effects** — Writes to `agency_members` and `pending_invites`. One RPC read. No edge functions.

**Current-state gaps**
- The invite dialog's copy ("Invite sent", "They'll automatically join {agency} when they sign up with this email") is accurate only in the sense that a row was created — **nothing sends an email**. The dedicated `admin-invite-user` edge function exists but is only wired to the *platform* invite flow in `useAdminRole.useInviteUser`, not here.
- The member role `Select` offers **Owner** while the invite dialog does not, so ownership can be granted by promotion but there is no explicit transfer flow despite the role-reference card promising one.
- Primary-owner protection is client-side only (two `if (member.is_primary_owner)` toasts); enforcement depends on RLS/DB triggers not visible from this page.
- Expiry is displayed but never enforced in the UI — expired invites still render as "pending" with a negative relative time.
- Removal uses a browser `confirm()` rather than the `AlertDialog` pattern used elsewhere.

---

### 7b. Team — `/team`
Files: `/Users/bryanscott/Desktop/Brief to Booth/src/pages/Team.tsx` (21 lines), `/Users/bryanscott/Desktop/Brief to Booth/src/components/admin/TeamManager.tsx` (294 lines), `/Users/bryanscott/Desktop/Brief to Booth/src/hooks/useTeam.tsx`

**Route & access** — `/team`, ProtectedRoute. **Not in the sidebar** — reachable only by direct URL. The same `TeamManager` component is also mounted as the "Team" tab of the agency-admin `/admin` view and as "Invites & Team" in the platform-admin view.

**Intent** — A legacy, pre-agency team model: an owner adds named collaborators to *their own* workspace with a different role vocabulary.

**UI anatomy** — `PageHeader` ("Agency · Members & roles") + `TeamManager`: header row with **Invite Member**; a card list of owned members (icon by role, display name, Pending/Active badge, invited email, "Added {relative}", a role `Select`, and a delete button behind an AlertDialog); an empty state; and a dashed "You (Owner)" card showing the current user's email. Invite dialog: Display Name, Email, Role.

**Model & differences from `/agency/team`** — This page reads/writes the **`team_members`** table, not `agency_members`. Roles are **admin / designer / viewer** (vs owner/admin/member/viewer). Membership is keyed on `team_owner_id` (a personal workspace), not `agency_id`. The list is filtered client-side to `m.team_owner_id === user.id && m.user_id !== user.id`.

**Workflows**
- **Invite** → inserts a `team_members` row with `user_id` set to **the owner's own id as a placeholder** ("until the invite is accepted"), plus `team_owner_id`, `role`, `display_name`, `invited_email`, `invited_by`. Toast claims "Invitation sent successfully."
- **Change role** → `team_members.update({role})`. **Remove** → row delete.

**Outputs & side effects** — Writes to `team_members` only.

**Current-state gaps**
- **This is a parallel, orphaned team system.** It shares no data with `/agency/team`; a person added here gains nothing in the agency RLS model, and vice versa. Two "Team" surfaces exist with incompatible role vocabularies.
- **The invite never reaches anyone**: no email, no token, no accept flow. `accepted_at` stays null forever, so every member renders as "Pending". The placeholder `user_id = owner.id` means the row is indistinguishable from a self-membership at the DB level.
- `useCurrentRole()` in `useTeam.tsx` derives an app-wide role from this table and would only ever return `"owner"` given that `accepted_at` is never set.
- `useTeam` also carries a fully-built **project-invite** system (`project_invites`, `useCreateInviteLink` with `upload_only`/`view_comment`/`full_edit` scopes and 7-day expiry, `useRevokeInvite`, `useAcceptInvite` via the `accept_project_invite` RPC) that this page does not surface — and which is the natural backing for the Projects page's stubbed "Share…" menu item.
- The page is unlinked from navigation, so it is effectively hidden but still live.

---

### 8. Admin Settings (agency-admin view) — `/admin`
Files: `/Users/bryanscott/Desktop/Brief to Booth/src/pages/AdminSettings.tsx` (155 lines), `/Users/bryanscott/Desktop/Brief to Booth/src/components/admin/ProjectTypeManager.tsx` (388 lines), `/Users/bryanscott/Desktop/Brief to Booth/src/lib/projectTypes.ts` (253 lines)

**Route & access** — `/admin`, ProtectedRoute. The sidebar shows "Admin Settings" when `(isAdmin && !isSuperAdmin) || (isSuperAdmin && previewMode)`. The page itself branches on `isPlatformView = isSuperAdmin && !previewMode`: platform admins get a completely different tab set (All Accounts, Activation Types, Venues & Shows, Image Models, AI Usage, Invites & Team); everyone else gets the agency view. Header changes accordingly ("Platform Admin" + crown vs "Agency Settings" + `Settings2` icon).

**Intent (agency view)** — One place for agency-level configuration: how the AI should think about each project type, client/brand intelligence, agency knowledge, KB telemetry, and team.

**UI anatomy (agency view tabs)**
1. **Project Types** → `ProjectTypeManager`
2. **Clients & Brand Intelligence** → `ClientsManager` (926 lines; a master/detail client browser with `AddClientWizard`, `BrandGuidelinesEditor`, `BrandAssetLibrary`, `ClientBrandKnowledgeBase`, manual intelligence-entry CRUD across the six categories, and a `scrape-brand-guidelines` edge-function call)
3. **Agency Knowledge Base** → `AgencyKnowledgeBase`, a thin wrapper over `KnowledgeBasePanel scope="agency"` — the *same* surface as `/agency/knowledge`
4. **KB Health** → `KnowledgeHealthDashboard`: totals, per-scope distribution (agency/activation_type/client/project), embedding-status breakdown, recent uploads, failed docs with one-click re-embed, and a `migrate-legacy-kb` edge-function trigger
5. **Team** → `TeamManager` (the legacy `team_members` component from §7b)

**ProjectTypeManager anatomy** — Two-pane layout. Left: sticky sidebar listing the six registry types with a resolved lucide icon, `config.label ?? type.shortLabel`, a violet **custom** chip when an override row exists, and a "Disabled" hint. Right: editor with an inline-editable label + Active/Disabled `StatusChip` + tagline + mono type id, an enable/disable `Switch`, Reset and Save buttons that appear only when dirty, a Description textarea, a **Render Context** mono code-well ("injected into every AI image generation prompt"), and a **Strategic Elements** list — eight numbered rows per type that expand into Element Title / Short Description / **AI Guidance** ("system prompt for this element's generation").

**The projectTypes registry** (`/Users/bryanscott/Desktop/Brief to Booth/src/lib/projectTypes.ts`) — the single source of truth, six `ProjectTypeId`s: `trade_show_booth`, `live_brand_activation`, `permanent_installation`, `film_premiere`, `game_release_activation`, `architectural_brief`. Each `ProjectTypeDef` carries label/shortLabel/tagline/description/icon/accentColor, a **`renderContext`** string (the physical scene description used to frame renders — e.g. "trade show exhibit booth on a convention hall floor with carpet, neighboring booths, overhead lighting"), **`spatialDefaults`** (primaryUnit sqft|sqm|linear_ft, defaultSize, sizeLabel), **eight `elements`** (bigIdea, experienceFramework, interactiveMechanics, digitalStorytelling, humanConnection, adjacentActivations, spatialStrategy, budgetLogic — each with a per-type title, description, icon, color, and `aiGuidance` prompt fragment), and **`costCategories`** (5 per type with `typicalPercentage` weights). The file header documents the 3-step process for adding a type (union member → registry entry → DB check-constraint migration).

**Inputs** — `useProjectTypeConfigs()` → `project_type_configs` ordered by `sort_order`. Merged with the registry by `mergeWithConfig()`: config value wins per field, else registry default; `element_overrides` are matched by element `key`.

**Workflows** — **Save** → `useUpsertProjectTypeConfig` upserts `project_type_configs` on conflict `(user_id, project_type_id)` with `{label, tagline, description, render_context, is_enabled, element_overrides}`. Notably, scalar fields are written as **null when unchanged from the registry default** (so only genuine deltas persist), while `element_overrides` is always written as the full 8-element array. **Reset** is local-only — it re-merges with `undefined` config and clears dirty; it does **not** delete the config row.

**Outputs & side effects** — Writes to `project_type_configs`; everything else in the tabs writes through its own component (see §2b, §4).

**What render context / strategic elements do downstream — and the gap**
- **Registry values are live**: `ALL_PROJECT_TYPES` / `DEFAULT_PROJECT_TYPE` drive `ProjectTypeSelector`, `GuidedBriefBuilder`, and `BriefUpload`; `projectTypeRules.ts` (which imports `ProjectTypeId`) feeds `promptBuilder.ts` and `briefReadiness.ts`.
- **The agency's saved overrides are not.** A repo-wide grep shows `useProjectTypeConfigs`, `project_type_configs`, `element_overrides`, and the config-sourced `render_context` are referenced **only inside `ProjectTypeManager.tsx` itself**. No generation path, prompt builder, or edge function reads `project_type_configs`. Editing render context or AI guidance here changes nothing about generated output today — it is a write-only configuration surface.
- Separately, `custom_project_types` (`useCustomProjectTypes`, with its own `render_context`) and `activation_types.render_context_override` are *third* and *fourth* parallel render-context stores, none of which reconcile with `project_type_configs`.

**Other current-state gaps**
- `project_type_configs` is keyed on **`user_id`**, not `agency_id` — "Agency Settings" project-type customization is actually per-user.
- **Two nav paths to the same knowledge surface**: `/agency/knowledge` and the "Agency Knowledge Base" tab render identical panels with different copy.
- **The `/admin` "Team" tab uses the legacy `TeamManager`** (`team_members`), while the sidebar "Team" link goes to `/agency/team` (`agency_members`) — an agency admin sees two unrelated team rosters depending on which door they use.
- `costCategories` and `spatialDefaults` from the registry have no editor in `ProjectTypeManager`, and `cost_category_overrides` exists on the `ProjectTypeConfig` type (`useClients.tsx` L49) with no UI at all.
- "Reset to defaults" is misleading: it clears the form but leaves the persisted override row intact until the user saves.
- Disabling a type (`is_enabled: false`) renders a "Disabled" hint here, but the brief-side selectors import `ALL_PROJECT_TYPES` directly from the registry and never consult the configs, so a disabled type still appears to users.
- Sidebar-level: `platformOwnerNavItems` includes `/platform-invites`, which has **no route** in `App.tsx` — clicking it 404s.

---

## Cross-cutting observations

1. **Four parallel "type" systems.** `PROJECT_TYPE_REGISTRY` (code) → `project_type_configs` (per-user overrides, unread) · `custom_project_types` (AI-detected, per-user) · `activation_types` + `activation_type_overrides` (per-agency). Only the last one is fully wired end-to-end into RAG scoping.
2. **Two parallel team systems** (`agency_members` + `pending_invites` vs `team_members`), both surfaced in the product, only one enforced by RLS.
3. **Scope coverage hole in RAG.** `activation_type_agency` and `industry` scopes accept uploads and get embedded but are never retrieved; only `agency`, `client`, `activation_type`, `project` participate in `buildRagContext`.
4. **`projects.agency_id` is never stamped on insert.** It is only backfilled at agency creation, which is the root cause of the client-count bug that was fixed by dropping the agency filter, and which weakens the `agency_members_can_write_projects` RLS policy for all newer projects.
5. **Three "coming soon" surfaces are shipped as UI:** project Share/Archive, the AgencyPricing roadmap grid, and the pricing engine's quote sources (no way to create a `pricing_source` or `pricing_quote` means everything resolves to override-or-unpriced).
6. **Two registered edge functions are never invoked from the app:** `summarize-document` and `extract-pricing`.