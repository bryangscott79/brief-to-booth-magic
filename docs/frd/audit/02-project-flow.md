I have everything I need. Here is the full report.

---

# CANOPY — Functional Audit: Six-Step Project Flow + Files + Knowledge Base

Scope: `/upload`, `/review`, `/generate`, `/spatial`, `/prompts`, `/export`, plus `/files`, `/knowledge-base`, `/rhino`. All findings read from source.

**Cross-cutting facts that apply to every step:**
- Every step page is wrapped in `AppLayout` → `ProjectHeader` (`/Users/bryanscott/Desktop/Brief to Booth/src/components/layout/ProjectHeader.tsx`), which renders the project breadcrumb, a derived spec pill (`parsed_brief.booth_size · budget`), the units dropdown, `SuiteContextBar`, and `StepPillNav`.
- Project identity is carried entirely in the `?project=<uuid>` query param. `useProjectSync` (`src/hooks/useProjectSync.tsx`) reads it, fetches the `projects` row via React Query key `["project", id]`, and hydrates the zustand `useProjectStore`. Changing project id wipes the store and evicts `["project"]` and `["kb-files"]` caches.
- All step-to-step navigation uses `useProjectNavigate` (`src/hooks/useProjectNavigate.tsx`), which re-appends `?project=`.
- Persistence helper: `saveProjectField(projectId, column, value)` — a bare `projects` UPDATE with no error surfacing (console.error only).

---

### 01 — Brief · `/upload`

**Route & access**
`/upload?project=<id>` inside `<ProtectedRoute>` (auth + access gate + onboarding gate). `src/pages/Upload.tsx` + `src/components/brief/BriefUpload.tsx`. Also accepts `?suite=true` to switch copy and redirect target to `/suite`. Reachable without a `project` param — `BriefUpload.ensureDbProject()` creates the row on first parse.

**Intent**
Capture the source brief (uploaded file, pasted text, or a guided Q&A) and convert it into a structured `ParsedBrief`, while collecting the supporting project context — brand website, brand logo, inspiration imagery, and project knowledge-base documents — that every downstream generation step reads.

**UI anatomy**
- `WorkSheet` eyebrow "Step 01 / 06"; `headerRight` StatusChip = "Brief captured" if any of `brief_text | brief_file_url | parsed_brief` exists, else "Awaiting brief".
- Mode chooser (only shown when no brief content exists): two cards — *Upload a brief* → `BriefUpload`; *Build from scratch* → `GuidedBriefBuilder`. A back-link returns to the chooser.
- `BriefUpload` has its own internal 3-step bar: **Upload → AI Extraction → Confirm Details**.
  - *Upload*: tab toggle Upload File / Paste Text. Dropzone accepts PDF, DOCX, TXT only, `maxFiles: 1`, disabled outside step "upload". TXT under 20 chars is rejected client-side.
  - *Parsing*: blocking full-panel spinner with a fake six-item checklist.
  - *Confirm*: an "AI extracted N data fields" summary grid (Brand, Objectives, Events, Footprints, Budget, Audiences, Creative Direction, Visual Identity, Deliverables, Winning Criteria); **Project Type** section (AI-inferred, collapsible `ProjectTypeSelector` incl. custom types); **Client** section (auto-matched pill row, "New client detected" banner with a *Capture brand intelligence* switch, or free-form new-client input); `BrandGuidePrompt` shown when a matched existing client has thin brand intelligence.
- Below the sheet, only in `mode === "upload"` with a `projectId`: `BrandWebsiteCard`, `BrandLogoUpload`, `InspirationIntake`, `ProjectKnowledgeBase`.
- **Blocking state / gating:** the primary "Continue to Review" CTA is lifted out of `BriefUpload` (via `hideContinueCTA` + `onContinueStateChange`) and rendered by `Upload.tsx` *below* the logo/inspiration/KB cards — deliberately, so users capture context before advancing. It only appears once `step === "confirm"`, and is disabled unless `selectedType` is set or while saving.
- Right rail `BrandProfileRail`: read-only client name, primary/secondary colors, typeface + tone from `useBrandGuidelines`, approved/pending brand-intelligence counts, with a footer link to `/clients/:id`.

**Inputs**
- User: dropped file or pasted text; project type; client selection/creation; brand website URL; brand logo file; inspiration images and pasted URL list; KB document uploads.
- Data loaded: `projects` row (`useProject`), `clients` (`useClients`), `brand_guidelines` + `brand_intelligence` (`useBrandGuidelines`, `useBrandIntelligence`), `custom_project_types` (`useCustomProjectTypes`), `knowledge_documents` scope=`project` (`useKnowledgeDocuments`).
- Stores: `useProjectStore` (`setActiveStep`, `loadFromDb`).

**Workflows**
1. **Parse a brief** — `startParsing()`:
   - `ensureDbProject(name)` → INSERT `projects {user_id, name, status:"draft", project_type:"trade_show_booth"}` if no `?project=`.
   - If a real file: upload to storage bucket **`briefs`** at `${user.id}/${dbProjectId}/original.${ext}` (`upsert: true`), then `createSignedUrl` with a **1-year TTL** → `briefFileUrl`.
   - Raw `fetch` (not `functions.invoke`) POST to `${VITE_SUPABASE_URL}/functions/v1/parse-brief` with `{briefText}` or `{fileBase64, fileType, briefText?}`, 90 s `AbortController` timeout. Edge fn uses `google/gemini-2.5-flash` with a forced `parse_brief` tool call (PDFs escalate to `gemini-2.5-pro` vision, falling back to text extraction). The tool schema includes `hangingElements`.
   - Post-parse client-side inference: `inferProjectType(parsed)` (regex over brand category/objectives/show names → film_premiere / game_release_activation / live_brand_activation / permanent_installation / architectural_brief / trade_show_booth) and `fuzzyMatchClient(brand.name, clients)` (normalized substring match).
2. **Create client from brief** — `handleConfirmNewClient()` → `useUpsertClient` with `{name, industry: brand.category, description: brand.pov, primary_color: visualIdentity.colors[0]}`.
3. **Confirm & continue** — `handleConfirmAndContinue()`:
   - UPDATE `projects` set `brief_text, brief_file_name, brief_file_url, parsed_brief, status:"reviewed", project_type, client_id`, plus `brand_website_url` when the brief carried a website and the project had none.
   - Primes the React Query cache for `["project", id]` **before** navigation (explicit fix for a stale-hydration bug that made Review render "No brief data"), then invalidates.
   - If a client is linked and capture is enabled: `extractBrandIntelligence(parsed, clientId, projectId)` → `useBatchCreateIntelligence` → INSERT rows in `brand_intelligence`.
   - `loadFromDb()` into the store with all eight elements reset to `pending`; `setActiveStep("review")`; navigate to `/review?project=` (or `/suite` in suite mode).
4. **Guided builder** (`GuidedBriefBuilder.tsx`) — six sections (project, brand, show & venue, objectives/audience, creative direction, budget/timeline/success). Per-field ✨ suggest calls edge fn **`suggest-brief-field`** `{fieldLabel, fieldHelp, priorAnswers}`. Submit calls **`synthesize-brief`** `{answers}` → returns `{parsed, briefText}`; then INSERT/UPDATE `projects` with `status:"reviewed"`, keyword-maps the free-text project type onto a `ALL_PROJECT_TYPES` id, matches-or-creates the client, captures brand intelligence, hydrates the store, navigates to `/review`. Section advance is gated on all non-optional fields being non-empty.
5. **Brand website** (`BrandWebsiteCard`) — persists `projects.brand_website_url`; when a client is linked it also invokes **`deep-dive-brand`**.
6. **Brand logo** (`BrandLogoUpload` → `useBrandLogo`) — uploads into the RAG KB (`knowledge_documents`, scope=`project`) with `user_tags: ["brand-logo"]`; consumed later as a signed-URL reference image on every render.
7. **Inspiration intake** (`InspirationIntake`) — images ≤25 MB uploaded one-by-one via `useKnowledgeDocuments.uploadDocument` with `user_tags: ["inspiration","image"]`; a pasted URL list is serialized into a generated `inspiration-links-<stamp>.md` File and uploaded with `["inspiration","links"]`.
8. **Project KB** (`ProjectKnowledgeBase` → `KnowledgeBasePanel` scope=`project`) — see the Knowledge Base section below.

**Outputs & side effects**
- Tables: `projects` (insert + update), `clients` (insert), `brand_intelligence` (batch insert), `custom_project_types`, `knowledge_documents` (+ `document_chunks` via `embed-document`).
- Storage: bucket `briefs` (`{userId}/{projectId}/original.ext`); bucket `knowledge-documents` (`{agencyId}/project/{projectId}/{ts}_{name}`).
- Step status: `projects.status` moves `draft → reviewed`; store `activeStep` = `"review"`.

**Current-state gaps**
- The brief file's signed URL is baked into `brief_file_url` with a 1-year expiry — it will silently 404 after that, and there is no refresh path.
- `parse-brief` is called with a hand-rolled `fetch` + anon-key header rather than `supabase.functions.invoke`, so it diverges from the error-unwrapping used everywhere else.
- `onDrop`'s `useCallback` deps (`[user, projectId, clients]`) omit the fuzzy-match inputs it closes over; a stale `clients` list can miss an auto-match.
- Only PDF/DOCX/TXT are accepted; no `.doc`, `.rtf`, `.pages`, or image briefs.
- Brand-intelligence capture is silently swallowed on failure (`console.warn` only).
- `mode` initial state is computed once from `hasBriefContent`; if the project loads after mount the chooser can be shown for a project that already has a brief.

---

### 02 — Review · `/review`

**Route & access**
`/review?project=<id>`, `ProtectedRoute`. `src/pages/Review.tsx` + `src/components/brief/BriefReview.tsx`.

**Intent**
Let the user verify and correct every field the parser extracted — and close the specific data gaps the prompt composer needs — before any generation spends tokens.

**UI anatomy**
- `WorkSheet` eyebrow "Step 02 / 06"; StatusChip "Brief parsed" / "Not parsed".
- Empty state: "No brief data to review" + an *Upload a Brief* button routing to `/upload`.
- Top-right primary action: **Confirm & Generate Elements**.
- `BriefClarificationContainer` — inline gap Q&A cards (blocking gaps sorted first, cap 5 visible with a "show all" toggle, per-field "Saved ✓ — value" state with Edit).
- Six editable `Section` cards in a 2-col grid, each with a confidence icon (green check = high, amber "!" = medium) and a pencil→Save/X inline editor: **Brand Information, Business Objectives, Events & Shows, Footprints, Target Audiences, Budget**. Only Budget's confidence is data-driven (medium when no range and no perShow).
- `BriefExistingSpace` — conditionally rendered only when the **agency's** `primary_industry` maps to a builtin industry with `inputMode === "existing-space-photo"`.
- `BriefHangingCard` — always rendered; per-element name, physical form, **creative direction** (labelled as EXACT instructions), shape, suspension drop, width/depth, materials/surfaces/lighting/printed tag lists.
- **Creative Direction** card — Embrace / Avoid tag lists that commit immediately on change.
- Read-only: Required Deliverables, Timeline, Contacts (rendered only when present), and `OriginalBrief` (raw text + the stored file link).
- Right rail `FromTheBriefRail`: brand name/personality/category, primary objective, secondary count, primary footprint, formatted budget, and **Venue** rendered in the pink `MISSING` attention tone when absent.

**Inputs**
- User: inline edits to each section, tag add/remove, hanging-element authoring, existing-space photo + polygon annotations, clarification answers/skips.
- Data loaded: `useProjectStore.currentProject.parsedBrief` with a defensive fallback to `dbProject.parsed_brief` (and a hydrating effect if the store is empty); `useProject`; `useAgency` (for `primary_industry` → `BUILTIN_INDUSTRIES` inputMode).

**Workflows**
- **Gap detection** — `validateParsedBriefForReview(parsedBrief)` (`src/lib/normalizedBrief.ts`) synthesizes a placeholder geometry from `spatial.footprints[0].size` (defaults 30×30 imperial), runs `normalizeBrief` + `validateBrief`, and returns gaps only — the geometry-dependent constraints collapse to neutral because there are no zones yet. The gap catalog: `brand.colors.hex` (helpful, fires only when the **primary** color lacks a hex), `context.venue.name` (**blocking**), `context.audience` (helpful, options), `hero.physicalForm` (helpful, requires ≥10 chars), `hanging.elements` (helpful, Yes/No, suppressed by `_dismissedGaps`), `hero.dimensions` (**blocking**, only when hero_scale_ok fails).
- **Answer/skip a gap** — `applyGapAnswer(brief, field, value, writeBack)` maps dot-paths back onto `ParsedBrief`: venue → `events.shows[0].location`; audience → `audiences[0].name`; hero form → `experience.hero.description` (explicitly re-pointed from `creative.designPhilosophy`, which the normalizer never read — the old infinite-save bug); hanging "Yes" seeds a rich default ring element and clears the dismissal, anything else clears `hangingElements` and pushes `"hanging.elements"` into `_dismissedGaps`; hex is encoded into the color string as `"orange (#E67E22)"` for the normalizer to parse back. Unknown fields log and no-op. Skip applies `gap.fallback`.
- **Section save** — `commitSection({...brief, ...draft})` → `setParsedBrief` + `saveProjectField(projectId, "parsed_brief", …)`, clearing the draft.
- **Hanging + existing-space edits** — deliberately routed through *sibling* commit paths (`commitHangingSection`, `commitExistingSpaceSection`) that never touch `draft`, debounced ~400 ms, flushed on unmount, with cross-flush ordering so a "Replace photo" (immediate commit) can't clobber still-debounced hanging edits.
- **Existing-space photo** — uploads to bucket **`project-images`** at `${projectId}/existing-space/${ts}.${ext}` (project id must be the first path segment for the RLS policy), commits an optimistic empty block, then async-invokes **`analyze-existing-space`**, merging the returned analysis over a ref-tracked latest value so in-flight user edits survive.
- **Confirm** — `handleConfirm()` sets `activeStep = "generate"` and navigates to `/generate`. **No validation gate** — blocking gaps do not prevent advancing.

**Outputs & side effects**
- Tables: `projects.parsed_brief` (repeatedly overwritten in full).
- Storage: `project-images` (existing-space photos).
- Step status: store only (`activeStep`). No DB column is written by this step beyond `parsed_brief`.

**Current-state gaps**
- Blocking gaps (`context.venue.name`, `hero.dimensions`) are labelled blocking but block nothing — the Confirm button is always enabled.
- `industryInputMode` resolves off the **agency's** `primary_industry` because `projects` has no industry column; a comment flags this as temporary. Every project in an agency inherits the same input mode.
- `deriveHangingElements` synthesizes placeholder `dimensions {3,3,1}`, `suspensionDropFt: 3`, `position {0,0}` on every read and never round-trips them; the authoring card lets you edit width/depth/drop but `handleHangingChange` writes only name/form/shape/materials/surfaces/lighting/printed/creativeDirection back — **dimension and drop edits made here are discarded**.
- Confidence badges are hardcoded `"high"` for five of six sections.
- Timeline/Contacts are read-only and accessed via `(brief as any)` — not in the typed `ParsedBrief`.
- Every section save writes the whole `parsed_brief` blob; concurrent editors last-write-wins.

---

### 03 — Concept · `/generate`

**Route & access**
`/generate?project=<id>`, `ProtectedRoute`. `src/pages/Generate.tsx` + `src/components/elements/ElementDashboard.tsx` + `ElementDetailPanel.tsx` + `IntelligenceSelector.tsx`.

**Intent**
Generate the eight strategic concept elements from the parsed brief plus weighted context (brand intelligence, RAG, company profile, show costs, project KB), and let the user read, inline-edit, and regenerate each with feedback.

**UI anatomy**
- `WorkSheet` eyebrow "Step 03 / 06"; header right shows a pass chip when all 8 are complete, else a mono `N/8 complete`.
- Empty state when `parsedBrief` is missing: "No brief data available" + *Upload a Brief*.
- Toolbar: progress line, **Generate All with AI / Regenerate All** (variant `generative`), and — only when all 8 are complete — **Continue to Spatial**.
- `IntelligenceSelector` (shown when the client has ≥1 approved intelligence entry): per-entry checkboxes + select-all; only checked entries are sent.
- Linear progress bar, then a 4-column grid of 8 `ElementCard`s. Card status badge: `pending | generating | complete | error`; complete cards are clickable and show a 3-line preview (`getPreviewText` per element type); non-complete cards show a per-card Generate/Retry button.
- Clicking a complete card swaps the whole panel for `ElementDetailPanel` — a Back button, a Regenerate button, a feedback textarea toggle, and per-element rich editable views (`EditableText` bound to dot-paths like `hero.name`, `designPrinciples.0.description`).
- Right rail `WeightedContextRail`: approved brand-intelligence count, past-learning count, show-cost count, and count of project KB docs with extracted text.

**Inputs**
- User: Generate All / per-element Generate / Retry; intelligence entry selection; regeneration feedback; inline field edits.
- Data loaded: `useProjectStore.currentProject` (brief, elements, clientId, hierarchy.parentId, projectType); `useKnowledgeBase(projectId)` (legacy `knowledge_base_files`, filtered to rows with `extracted_text`); `useCompanyProfile`; `useShowCosts`; `useBrandIntelligence(clientId)`; `useClient(clientId)`; `useBrandRAG({clientId, projectId, parentId, showName})` → `brandContext` + `suiteContext` strings.

**Workflows**
- **Auto-generate on arrival** — an effect fires once per project (`hasAutoGenerated` ref) when `parsedBrief` exists and all 8 elements are `pending` and no module-level job is active, with a 300 ms delay.
- **Batch generation** — `runGenerationJob()` creates a *module-level* `activeJob` that survives unmount so generation continues in the background; any prior job is marked `aborted`. It iterates `ELEMENT_ORDER` **sequentially**, setting status `generating`, invoking **`generate-element`**, then `setElementData` + `saveProjectField(projectId, ELEMENT_DB_KEYS[type], data)` immediately per element.
- **Payload to `generate-element`**: `{elementType, briefData (=parsedBrief), existingData, feedback?, knowledgeBaseContent: [{fileName, content}], companyProfile: {companyName, industry, defaultBoothSizes, notes}, showCosts: [{showName, city, venue, boothCostPerSqft, drayagePerCwt, laborRatePerHr, electricalPerOutlet, internetCost, unionRequired}], brandIntelligence: [{category,title,content,tags}], clientData: {name, industry, description, primaryColor, secondaryColor, website}, projectType, brandContext, suiteContext}`.
- **Edge behavior** (`supabase/functions/generate-element/index.ts`): `google/gemini-2.5-pro` with a forced `generate_<elementType>` tool call; temperature 0.4 for the "structured-heavy" pair (`budgetLogic`, `spatialStrategy`), 1.2 on regeneration, else 0.9. For `spatialStrategy` it injects explicit per-footprint sq-ft arithmetic and hard rules (positions are 0–100 percentages, x=0 left, y=0 aisle-front, no overlap, one config per footprint, hex color codes), then post-processes zones: 0–1 ratios are scaled ×100, width/height clamped to 5–100, x/y clamped to keep zones in bounds. Optional RAG retrieval when `agency_id` is present.
- **Reliability wrapper** — `invokeGenerateElementWithRetry`: hard timeout (180 s for `spatialStrategy`/`budgetLogic`, 90 s otherwise) plus one retry with a 2 s backoff; a 200 with an empty `data.data` is treated as retryable. Final failure sets status `error`.
- **Regenerate with feedback** — `handleRegenerateFromDetail` calls `generateElement(type, feedback)`, then auto-captures the feedback as a `brand_intelligence` row (`category: "past_learning"`, `source: "feedback"`, `is_approved: true`, tags `[elementType, "regen_feedback"]`, `source_project_id`).
- **Continue** — `setActiveStep("spatial")` + navigate `/spatial`.

**Outputs & side effects**
- Tables: `projects` columns `big_idea`, `experience_framework`, `interactive_mechanics`, `digital_storytelling`, `human_connection`, `adjacent_activations`, `spatial_strategy`, `budget_logic` (per `ELEMENT_DB_KEYS`); `brand_intelligence` (feedback capture).
- No storage writes.
- Step status: element `status` is derived at hydration purely from column non-nullness (`useProjectSync`); `"generating"`/`"error"` are runtime-only and lost on reload.

**Current-state gaps**
- **Inline edits in `ElementDetailPanel` are never persisted.** `handleUpdateField` calls only `setElementData` (store); there is no `saveProjectField`. Any manual edit to an element is lost on reload.
- A background job survives unmount but is tracked in a module-level singleton keyed only by projectId; two tabs on the same project will fight, and a page reload orphans the in-flight job (statuses stuck at `generating` are re-derived as `pending`/`complete` from the DB).
- The auto-generate effect depends on `currentProject?.id` only, with `generateAllElements` referenced before definition inside the effect (works via hoisting, but the eslint deps are suppressed).
- `useKnowledgeBase` here reads the **legacy** `knowledge_base_files` table, while the Upload step writes the **new** `knowledge_documents` RAG table — so documents added on the Upload page do **not** appear in `knowledgeBaseContent` for element generation (they reach the model only through the RAG path when `agency_id` is present).
- `getPreviewText` uses `data.x?.slice(0,120) + "..." || ""` — the `||` binds after concatenation, so the fallback never fires.
- Timeouts don't actually cancel the underlying fetch (documented in-code); a "timed out" element can still complete and write later.

---

### 04 — Spatial · `/spatial`

**Route & access**
`/spatial?project=<id>`, `ProtectedRoute`. `src/pages/Spatial.tsx` + `src/components/spatial/SpatialPlanner.tsx` (+ `SpatialCanvas`, `SpatialCanvasTopDown`, `SpatialCanvasIso`, `ZoneDetailPanel`, `ConstraintPanel`, `CostEstimator`, `LayoutMetrics`, `LayoutVariations`, `PromptIngredientsEditor`, `FlowOverlay`).

**Intent**
Turn the AI's percentage-based zone allocation into real-unit, drag-editable booth geometry — the ground truth every render is composed against — and enrich each zone with structural form, intent, materials, and sculptural features.

**UI anatomy**
- `WorkSheet` eyebrow "Step 04 / 06"; header right = active config label.
- **Blocking empty state**: if `spatial_strategy.configs` / the active config / the derived layout / metrics are missing, the whole planner is replaced by "No spatial data available" + *Generate Elements First* → `/generate`.
- Header row: mono spec line (`footprintLabel · scaleDescription · N% zone coverage`), an **Export SVG** button, and **Generate Prompts** (primary).
- `ValidationPanel` shown whenever the layout is invalid or has warnings — lists errors (destructive) and warnings (amber).
- `ConfigSizeChips` — booth-size selector, hidden for single-config projects.
- **Materials & Mood** card, deliberately placed above the canvas.
- Hanging toolbar: **+ Hanging element** (inserts a ring at booth center sized ⅓ × ⅓ of the footprint, 3 ft drop) and a local **Show/hide hanging** visibility toggle that does not mutate persisted geometry.
- `SpatialCanvas` — top-down drag/resize grid plus an optional 3-D isometric preview, with a toolbar: **Suggest layout** (AI enrichment), **Auto-arrange**, **Add feature** menu, **Flow** overlay, **Heatmap** overlay, **Show AI input** (renders the exact floor-plan PNG that will be sent to the image model), **3D** toggle, **Expand** (fullscreen dialog). Per-zone selection exposes shape (`rect | L | circle | diamond`), height, structural form, materials, and a **per-zone prompt override** editor (`customPromptOverride`).
- Tab strip below the canvas: **Layout** (BriefReadinessPanel + LayoutVariations + LayoutReasoning + Zone Allocation legend), **Metrics** (`LayoutMetrics`), **Validate** (`ConstraintPanel` with ADA/sizing/sightline/utility checks and a one-click **Auto-fix**), **Costs** (`CostEstimator` with quality tier + budget gauge).
- Dialogs: `ZoneDetailPanel`, `PromptIngredientsEditor`, and a "Layout Changed — render this layout?" confirmation.
- Right rail `ZoneProgramRail` — recomputes zones and validation with the *same* pure utilities (`calculateBoothDimensions`, `normalizeZones`, `validateSpatialLayout`) so it always agrees with the canvas; shows per-zone sqft/%, error/warning counts, allocated %.

**Inputs**
- User: zone drag/resize/shape/height/form/material edits, feature add/edit, hanging-element add/move, layout-variation selection, config chip selection, constraint auto-fix, quality-tier change, per-zone prompt override.
- Data loaded: `currentProject.elements.spatialStrategy.data` (configs, zones, features, hangingElements, materialsAndMood, ceilingHeightFt, activeConfigKey), `parsedBrief`, `bigIdea`, `interactiveMechanics.data.hero`, `useMeasurementSystem`, `useBrandIntelligence`, `useProjectImages`, `useActiveSpatialConfig`.

**Workflows**
- **Active-config selection** — `useActiveSpatialConfig` (`src/hooks/useActiveSpatialConfig.tsx`) resolves: local click → persisted `spatial_strategy.activeConfigKey` → `configs[0]`. Selecting persists `activeConfigKey = sanitizeConfigKey(footprintSize)` onto the `spatial_strategy` blob root (no new column) and is **shared with the Prompts step**.
- **Legacy ⇄ absolute round-trip** — `boothGeometryFromLegacy({...boothDimensions, measurementSystem}, normalizedZones, 12, {features, materialsCatalog, hangingElements})` produces a `BoothGeometry` in real units (`src/lib/geometryModel.ts`). Canvas edits come back through `handleCanvasGeometryChange`, which maps each `AbsoluteZone` via `normalizedFromAbsoluteZone` back to the legacy percentage shape, spreads the original zone to preserve untracked fields (notes, requirements, adjacencies), and re-attaches canvas-owned fields (`customPromptOverride, heightFt, shape, shapeParams, structuralForm, featureDescription, intent, materialIds`).
- **Persistence** — one write: `setElementData("spatialStrategy", updatedSpatial)` (optimistic) + `saveProjectField(projectId, "spatial_strategy", updatedSpatial)`. `configs[activeIndex].zones` gets the zones; `ceilingHeightFt`, `features[]`, and `hangingElements[]` live at the **root** of `spatial_strategy` so they survive footprint switching.
- **Layout variations** — `generateLayoutVariations(...)` produces alternates, each pre-run through `fixNormalizedLayoutAutomatically` so they satisfy size/percentage minimums before the user clicks. `handleVariationSelect` is idempotent (clicking the active variation is a no-op, preventing compounding multiplicative transforms), treats `"balanced"` as identity, and merges only `position/percentage/sqft` from the variant while keeping all zone metadata.
- **AI enrichment ("Suggest layout")** — `handleEnrichSpatial()` invokes **`enrich-spatial`** with `{parsedBrief, bigIdea, heroInstallation, spatialStrategy, boothDimensions}`. The edge fn (`gemini-2.5-pro`, forced `spatial_enrichment` tool) returns `{zones:[{id, structuralForm, featureDescription, intent, materialIds}], features:[…]}`. The client merges zone metadata by id (preserving user shape/height edits), **replaces features wholesale**, then runs `fixLayoutAutomatically` and reports whether positions actually changed. Writes through the same `handleCanvasGeometryChange` path.
- **2-D floor-plan render** — `handleGenerateFloorPlan` builds a long text prompt (scale context, variation strategy, per-zone position descriptions, brand-color/material/style/layout blocks from `PromptIngredientsEditor`, annotation feedback, regeneration feedback) and invokes **`generate-view`** with `{viewPrompt, viewName:"Floor Plan 2D", aspectRatio, angleId:"floor_plan_2d", projectId, boothSize}`, saving via `useSaveRenderImage`.
- **Per-zone prompt preview** — `getZoneDefaultPrompt(zoneId)` calls `generatePrompt("zone_interior_<id>", promptParams)` so the Spatial step shows the same base prompt the Prompts step will use; edits save as `customPromptOverride` and **both** steps respect them.
- **Continue** — `setActiveStep("prompts")` + `navigate("/prompts")`.

**Outputs & side effects**
- Tables: `projects.spatial_strategy` (whole blob); `project_images` (only via the floor-plan path, `angle_id: "floor_plan_2d"`).
- Storage: `project-images` (floor-plan render, via `save-render-image`).
- Step status: none written; progression is store-only.

**Current-state gaps**
- **`Export SVG` has no `onClick`** — a dead button.
- **`enrich-spatial` always reads `spatialStrategy.configs[0]`** (hard-coded server-side), while the client sends `boothDimensions` for the **active** config. On a multi-config project with a non-first config selected, the AI enriches the wrong zone set and the merge is by id, so mismatched ids silently produce a no-op.
- The floor-plan render UI was removed but its state (`floorPlanView`, `floorPlanImage`, `floorPlanAnnotations`, `PromptIngredientsEditor`, the layout-change confirmation dialog, `handleGenerateFloorPlan`) is all still mounted and reachable only through the pending-variation dialog — a half-wired feature.
- `useMemo` is used as a side-effecting hook in two places (hydrating `floorPlanImage` and `floorPlanAnnotations`) — calls `setState` during render.
- Hanging elements added here land on `spatial_strategy.hangingElements` and are drawn on the canvas, but **never reach the render prompt** — the composer reads only `parsed_brief.hangingElements`. This is explicitly flagged as a KNOWN GAP in `PromptGenerator.tsx` (lines ~369–388).
- Layout validation errors never block navigation to Prompts.

---

### 05 — Render · `/prompts`

**Route & access**
`/prompts?project=<id>`, `ProtectedRoute`. `src/pages/Prompts.tsx` + `src/components/prompts/PromptGenerator.tsx` (2,889 lines) + `HangingElementCheck`, `PromptInspector`, `PromptVersionTabs`, `PreflightChecklist`, `PromptDebugPanel`, `ModelBadge`, `AttachReference`, `BriefClarification`, `RenderPromptDialog`, `ConfigSizeChips`.

**Intent**
Compose the exact prompt from the normalized brief + canvas geometry, render a hero 3/4 view first, let the user iterate on it conversationally (and approve its hanging element), then fan out to every other view and zone interior — with the exact prompt for every image preserved and reviewable.

**UI anatomy** — three phases driven by `renderStore.phase`.

*Persistent header (`versionsHeader`, all phases):* `ConfigSizeChips` (disabled during any generation), the "Generate all sizes" confirm dialog, the per-config batch-progress dialog, `PromptVersionTabs` (select/create/rename/delete versions), and an amber **orphaned render sets** recovery banner.

*Phase `prompt` / `hero-generation`:*
- Booth info card (footprint label, area in native units, zone count).
- `PreflightChecklist` — collapsible, six rows with ok/warn/info status and deep-link edit buttons: Brand identity (name+category+colors, colors falling back to the client brand book, deep-linking to `/clients/:id?tab=brand`), Brief & objectives, Dimensions & units, Spatial strategy, Brand logo, Visual references.
- `AttachReference` for `hero_34`.
- `BriefClarification` (safety-net mount of the same gap cards as Review).
- **Two-step generation:** `Generate Hero Prompt` composes the text without spending a render; then `PromptInspector` (review / copy / edit / reset, with an "Edited" badge) + `Generate Hero Image` + a `Re-compose` link.
- `Generate all sizes (N)` when >1 config; `PromptDebugPanel` showing the composer's five output stages.

*Phase `hero-review`:*
- Hero image (click-to-lightbox), `ModelBadge` (Canopy 2.0 / Canopy Lite with the gpt-image-2 failure reason on hover), `PromptInspector` for the prompt that produced it.
- **Conversation thread** — every render appends a turn; each turn's thumbnail is clickable to set that image as current (branching).
- Chat-style refinement textarea (⌘/Ctrl+Enter to send), **Send refinement**, a from-scratch refresh button, **Download**, and **Approve & Generate All Views**.
- `HangingElementCheck` (only when the brief carries hanging elements) — canonical spec lines per element, an editable "Creative direction (treated as EXACT instructions)" field committed on blur, an amber "not approved" warning, **Looks right — approve**, and **Refine hanging element** with quick-chips (Smaller / Larger / Hang higher / Hang lower / Material / Lighting / Remove printing) + free text.

*Phase `all-views`:*
- `BriefReadinessPanel` (score + top-3 gaps, each routing to the owning step), header actions (Generate all sizes, Regenerate All, **All Images (N)** gallery dialog with per-size filter chips and per-render Expand/Download/**Prompt**, Export Package).
- Progress card during generation; a "Style Reference (3/4 Hero View)" card with booth specs + zone allocation.
- **Standard Views** grid (top, front, left, right, back, detail_hero, detail_lounge) and **Zone Interior Views** grid — each card has the image or a pending/generating/error/never-generated state, `ModelBadge`, `PromptInspector`, Download, Regenerate, and `AttachReference`.

*Right rail `PreFlightRail`:* geometry reference captured?, brand logo present (pink MISSING if not), active config + footprint sqft, and hanging-element approval state (`Approved` / `Awaiting check` / `Pending hero` / `None`).

**Inputs**
- User: prompt edits, hero feedback, per-view reference attachments, version selection/creation, config chip selection, hanging approve/refine/creative-direction, clarification answers.
- Data loaded: store `currentProject` (brief, spatialStrategy, bigIdea, all elements); `useRenderStore`; `useProjectImages` + `useSaveRenderImage`; `usePromptVersions`; `useActiveSpatialConfig`; `useBrandIntelligence` + `useClient`; `useBrandRAG`; `useMeasurementSystem`; `useBrandLogo`; `useAgencyImageModel` + `useAgency`; `useRenderReferences`; `useProjectVisualReferences`; `useGeometryReferences`; `useKnowledgeDocuments`.

**Workflows**

*Prompt composition (client-owned, `src/lib/normalizedBrief.ts`):*
1. `normalizeBrief({project:{id,name,projectType,industrySlug}, parsedBrief, geometry, elements})` → canonical `NormalizedBrief`. `safeBrief()` back-fills every required field. Colors are parsed out of `"name (#HEX)"` strings and role-tagged primary/secondary/accent. Zones map to functional purposes via `zoneNameToPurpose` keyword matching. Hero `physicalForm` precedence: `interactiveMechanics.data.hero.physicalForm.structure` → `parsedBrief.experience.hero.description`. Signage is derived (wordmark from brand name; descriptor from tagline). Budget tier + $/sqft is inferred. `existingSpace` is left **undefined** when absent — its presence is the discriminator for the interior-design path. `hangingElements` normalize from `parsedBrief.hangingElements` only.
2. `validateBrief(normalized)` → `{failures, gaps}`. Hard constraints: `footprint_match`, `open_sides_clear`, `signage_present`, `descriptor_present`, `hero_scale_ok` (≤30 % of footprint), `forbidden_items_absent`, plus normalize-time `hanging_elements_aloft` (status `unknown` — no automated verifier exists).
3. `composePrompt(normalized)` → `{briefJson, geometrySummary, renderer, negative, compliance}`. It dispatches on the industry `inputMode`: `existing-space-photo` (or `hybrid` with a photo) → `composeExistingSpacePrompt`, else `rendererPrompt`. `_dismissedGaps` is stripped before emitting `briefJson`.
   - **`rendererPrompt` sections, in order:** `# SCENE` · `# SPACE` (rectangular carpet allocation, max height, open sides, human scale, min circulation, plus an explicit "design organically *above the floor*, the carpet stays rectangular" instruction) · `# HANGING ELEMENTS` (only when present; per-element form, geometry with the position phrase and drop, materials/surfaces/lighting/printed, and `Creative direction (EXACT — follow precisely)` treated as a lock, not inspiration) · `# STRUCTURAL APPROACH` · `# ZONE PROGRAM` (deduped functional purposes only — the old explicit coordinate grid was deliberately removed because it produced formulaic rectangular pavilions) · `# BRAND` · `# BUDGET REALITY` · `# CONTEXT` · `# ENVIRONMENT` (always emitted) · `# DESIGN INTENT` · `# HARD CONSTRAINTS` · `# NEGATIVE` (appended inline because gpt-image-2 has no separate negative input).
   - **`composeExistingSpacePrompt` sections:** `# SCENE` · `# EXISTING SPACE` · `# REGIONS TO PRESERVE` · `# REGIONS TO REDESIGN` · `# REDESIGN INTENT` · `# HARD CONSTRAINTS` · `# NEGATIVE`. `# SPACE` and `# ZONE PROGRAM` are deliberately omitted.
   - Negative list: forbidden items + no overlaid annotations + no zone/room labels on fascia + no dimension callouts + no flat rectangular fascia/generic truss + no cartoon/over-saturation/AI artifacts + the void-ban (blank background / white void / studio backdrop / isolated product shot / floating booth with no floor).
4. `composeViewPrompt(heroSnapshot, angle, {zoneId})` — deliberately **terse** (~80–150 tokens): one camera instruction (`front | side_left | side_right | back | top | interior | detail`), a consistency guard ("treat the reference image as canonical… only the camera angle changes"), and a restriction line. The rationale is documented: long structured blocks made gpt-image-2 treat the call as a fresh generation instead of an edit.

*Hero generation* — `handleGenerateHeroImage()`:
- Merges hero attachments + project-wide visual references (deduped).
- `captureGeometryRefs()` → `renderFloorPlanForExport(geometry)` rasterized to a data URL, uploaded via `useGeometryReferences` into `knowledge_documents` tagged `geometry-reference`, resolved to a signed URL; cached by geometry hash. The isometric capture is now explicitly `null`.
- `buildExistingSpaceParams()` → for interior-design projects, `rasterizePolygonMask(photoUrl, annotations.change)` (failure is non-fatal — renders without the mask).
- `renderStore.generateHeroImage({composedPrompt:{renderer,negative,artifacts}, prompt, feedback, previousImageUrl, projectId, boothSize, boothDimensions, geometryReferences, projectType, brandIntelligence, brandContext, suiteContext, brandLogoUrl, imageModel, extraReferenceUrls, existingSpacePhotoUrl, maskDataUrl, onSave})` → invokes **`generate-hero`** with `project_id` (which gates the server-side storage upload; without it the function returns multi-MB base64 and the save silently drops).
- **Edge branch priority** (`supabase/functions/generate-hero/index.ts`): (1) `composedPrompt.renderer` used **verbatim**; (2) EDIT MODE (`previousImageUrl` + `feedback`, no composedPrompt) → the "IMAGE EDIT TASK — NOT A REGENERATION" template; (3) legacy edge-side structured builder. Reference images: existing-space photo is exclusive; otherwise `[previousImageUrl?, brandLogoUrl?, ...extras]` with SVGs stripped (they 400 the image models). Floor-plan/iso PNGs are deliberately **not** attached (label-bleed bug). Data-URL results are uploaded server-side to bucket `project-images` and returned as a short URL. Response echoes `promptUsed`, `modelUsed`, and `primaryError`.
- On success the store appends a `HeroTurn`, sets `phase: "hero-review"`, builds `promptArtifacts` via `buildRenderPromptArtifacts` (prompt capped at 20 KB, `data:` URLs never persisted, references deduped and labelled), and calls `onSave("hero_34", "3/4 Hero View", url, meta)`.

*Hanging-element hero-first approval flow:*
- Gate key = `hangingApprovalKey(activeConfigKey, heroImage)` — scoped to *this hero image within this config*, so any refine/regenerate produces a new URL and approval automatically resets; switching size chips never bleeds approval.
- **Approve** → `renderStore.setHangingApproval(key, true)` + a direct `project_images` UPDATE writing `prompt_artifacts.hangingApproved = true` on the row whose `public_url` matches the hero; re-hydrated on reload by an effect that scans `savedImages`.
- **Refine** → `buildHangingEditInstruction(elements, feedback, units)` (`src/lib/hangingRefinement.ts`) produces an instruction that locks booth/floor/furnishings/people/environment/lighting/camera, restates the canonical spec, appends the refinement request, and reasserts suspension + the EXACT creative-direction contract. It is sent through `generateHeroImage` with `previousImageUrl` + `feedback` and **deliberately no `composedPrompt`** so the edge function takes the EDIT-MODE branch. `threadMessage` carries the user's own words so the conversation stays readable. Result saves as a new hero version in the same config stack.
- **Creative direction edit** → writes `parsed_brief.hangingElements[i].creativeDirection` via `setParsedBrief` + `saveProjectField`.
- **Gate is advisory:** `handleGenerateAllViews` fires a toast when unapproved but does not block.

*All-views generation* — `renderStore.generateAllViews`: splits exteriors then interiors (interiors run only after all exteriors finish so they can anchor to a finished exterior — preference order `front, left, right, hero_34`), runs `Promise.allSettled` in batches of **3** (documented as the ceiling before gpt-image-2 rate-limit symptoms), invokes **`generate-view`** per angle with `{project_id, referenceImageUrl, viewPrompt, viewName, aspectRatio, boothSize, boothDimensions, geometryReferences, brandIntelligence, brandContext, suiteContext, brandLogoUrl, extraReferenceUrls, imageModel, heroPromptText, existingSpacePhotoUrl, maskDataUrl, consistencyTokens?, designContext?, composedPrompt?}`, with one retry on transient `BOOT_ERROR | WORKER_RESOURCE_LIMIT | 503` after 1.5–3 s jitter. One failed view does not abort the batch.

*Per-config versioning scheme* (`src/lib/promptVersions.ts`):
- Angle id format: `hero_34` (legacy) → `hero_34__v__<versionId>` → `hero_34__v__<versionId>__cfg__<configKey>`. The config suffix is outermost and stripped first by `parseVersionedAngleId`.
- `sanitizeConfigKey(label)` lowercases and slugs to `[a-z0-9.]`, defaulting to `"size"`.
- Version metadata (`PromptVersionMeta`: id, preset, label, customEmphasis, createdAt, updatedAt, notes, `claimsUnversioned`, imageModel) persists to `projects.prompt_versions` (JSONB) with a **localStorage mirror** (`canopy:prompt-versions:<projectId>`), because that column may not exist — `isMissingColumnError` swallows the failure. It is not in the generated Supabase types.
- Hydration filters saved images **config-first, then version**: an image belongs to the active size when its config key matches, or when it's untagged and the active size is `configs[0]`. If the active version has no images, it falls back to all images *for this booth size* — never across sizes.
- `findOrphanedVersions` detects version suffixes with no metadata (plus a synthetic `LEGACY_VERSION_ID` bucket for unsuffixed renders) and drives the one-click recovery banner.
- Save handler is a **factory** (`makeSaveHandler(configKey, configLabel)`) so the "Generate all sizes" batch binds each render to the config it was generated for, regardless of which chip is active when the render lands.

*"Generate all sizes"* — `runBatchAllSizes()`: strictly sequential, one hero per config. For each config it re-derives dimensions → zones → geometry → a fresh `normalizeBrief`/`composePrompt` → the config's own floor-plan reference → its own save handler. Afterwards it resets the render store so the page re-hydrates the active size.

*Per-image prompt transparency* — every save carries `promptArtifacts` (exact prompt, negative, geometry summary, compliance list, labelled reference URLs, model, timestamp). `RenderPromptDialog` (`src/components/common/RenderPromptDialog.tsx`) renders these in copyable sections (Prompt / Negative prompt / Geometry / Reference images / Hard constraints + meta chips + Copy all), with an explicit "Prompt not recorded (generated before prompt tracking)" state for legacy rows. Mounted from both the Prompts gallery and the Files lightbox.

**Outputs & side effects**
- Tables: `project_images` (one row per render, previous rows for the same `angle_id` flipped `is_current:false` by `save-render-image`); `projects.prompt_versions`; `projects.parsed_brief` (creative-direction edits + clarification answers); `project_images.prompt_artifacts` (hangingApproved patch); `knowledge_documents` (geometry references, render references).
- Storage: `project-images` at `{projectId}/{configKey_}{angleId}_{ts}.{ext}`; `knowledge-documents` for geometry/render references.
- Step status: none written to `projects`. `phase` and all render state live in `useRenderStore` (memory-only, reset on project switch, version switch, and config switch).

**Current-state gaps**
- **Documented KNOWN GAP** (PromptGenerator ~L369): hanging elements authored on the spatial canvas (`spatial_strategy.hangingElements`) never reach the prompt — only `parsed_brief.hangingElements` does. The two stores are never merged.
- **Style presets are effectively dead on the composed path.** `applyStylePresetToPrompt` is only applied to `buildPrompt(...)` output, but `handleComposeHeroPrompt` prefers `composerOutput.renderer`, and both edge functions prefer `composedPrompt.renderer` verbatim. So a version's chosen preset changes nothing for hero or view renders whenever composition succeeds.
- `PreflightChecklist` reads `spatialData?.configs?.[0]?.zones` — the **first** config, not the active one. On multi-config projects it can report the wrong zone count.
- `projectIndustrySlug` falls back to the **agency's** `primary_industry` (same limitation as Review) — every project in an agency shares an input mode, which decides whether the existing-space renderer path fires at all.
- `renderStore` is a whole-store subscription (`const renderStore = useRenderStore()`), forcing several `eslint-disable` deps to avoid React #185 update loops — fragile.
- `designContext` is built and pushed to the store on every change and sent to both edge functions, but the composed-prompt branch ignores it — redundant payload.
- `heroThread` / `heroIterations` are memory-only; the conversation history is lost on reload (only the images survive, re-seeded as thread-less iterations).
- Hero prompt overrides (`renderStore.heroPrompt`) are not persisted; navigating away drops the edit.
- Interior views pick their reference from `get().generatedImages` mid-batch — with `BATCH_SIZE = 3` the chosen exterior depends on completion timing.
- The hanging gate warns but never blocks; `hanging_elements_aloft` compliance status is permanently `"unknown"` (no post-render CV check exists).
- `save-render-image` carries a PGRST204 fallback that drops `prompt_artifacts` entirely if the column is missing — prompt transparency silently degrades in drifted environments.

---

### 06 — Export · `/export`

**Route & access**
`/export?project=<id>`, `ProtectedRoute`. `src/pages/Export.tsx` + `src/components/export/ExportPackage.tsx` (+ `DesignedDeck`, `ProposalExport`, `DeckEditor`, `DeckSlideEditor`, `DeckPreview`, `DeckPreflightChecklist`, `FigmaExportPanel`, `SaveLearningsButton`).

**Intent**
Package the brief, the eight strategy elements, and every current render into client-facing deliverables — an AI-designed deck, a classic PPTX/PDF proposal, a Figma spec, a materials/cost list, a 3-D modeling brief, and a full ZIP — and feed the project's learnings back into client intelligence.

**UI anatomy**
- `WorkSheet` eyebrow "Step 06 / 06"; header right = mono render count.
- Blocking empty state when `parsedBrief` or `elements` is missing: "No project data to export" + *Start a New Project* → `/upload`.
- `DesignedDeck` — the primary path (Claude designs each slide as HTML+CSS; slide list, preview, per-slide regenerate, inline HTML editing, Export PDF / Export PPTX via offscreen `html2canvas`, plus a `ping` diagnostic that probes the Anthropic key and reports `valid | invalid | configured | missing`).
- `ProposalExport` — the classic `pptxgenjs`/PDF path with an inline `DeckEditor` and section toggles.
- **Download All Assets** ZIP card.
- **Package Summary** (project name, `N/8` elements complete, current render count).
- **Materials & Cost Estimate** — Generate/Regenerate + CSV download; renders categories, per-item qty/unit/total, grand total, notes.
- **3D Modeling Brief & Meshy.ai Prompts** — Generate/Regenerate + `.md` download; renders Meshy prompts (with style tokens and material hints) and the modeling brief (dimensions, scale, layers, materials, construction notes).
- `FigmaExportPanel` — generates a Figma-importable JSON spec (frames, text nodes, image refs, color tokens, typography scale) and downloads it.
- **3D Design Renders** card (polished Rhino renders, click-to-lightbox) — shown only when at least one has `polish_status === "complete"`.
- `SaveLearningsButton`.
- Right rail `PackageRail`: agency logo on file (link to `/company` if MISSING), client logo (link to `/clients/:id`), concept element completeness, render count.

**Inputs**
- User: generate/regenerate deck, per-slide regenerate, slide HTML edits, section toggles, export format choice, materials/3D/Figma generation, learning selection.
- Data loaded: store `currentProject` (brief + elements + clientId + renderPrompts), `useProjectImages`, `useRhinoRenders`, `useBrandIntelligence` (approved only), `useCompanyProfile`, `useAgency`, `useDesignedDeck`.

**Workflows**
- **Designed deck** — `useDesignedDeck.generate/regenerateSlides` invoke **`generate-presentation`** with `{mode: "designed-deck", parsedBrief, elements, projectName, imageUrls, brandColor, secondaryColor, agencyName, stylePreset, deckOverrides, agency_id, project_id}` (+ `regenerateSlideIds` and `existingSlides` on regeneration, spliced back by slide id). Errors are unwrapped via `unwrapInvokeError` to surface the real cause (e.g. "invalid x-api-key").
- **Materials** — **`generate-materials`** with `{parsedBrief, spatialStrategy, budgetLogic, boothSize: footprints[0].size ?? "30x30", agency_id, client_id, activation_type_id, project_id}` → `data.materials` held in component state; CSV built client-side.
- **3D brief** — **`generate-3d-brief`** with `{parsedBrief, spatialStrategy, renderPrompts, imageUrls: current renders, boothSize, agency_id, client_id, activation_type_id, project_id}` → `data.brief`; markdown built client-side.
- **ZIP** — dynamic `import("jszip")`; fetches every `is_current` render into `renders/`, every polished Rhino pair into `rhino-renders/`, writes `content.md` (brand overview, objectives, audiences, events, spatial, budget, all eight elements as fenced JSON, render manifest) and `content.json` (structured mirror), then triggers a blob download named `{brand}_Export_Package.zip`.
- **Learnings** — `SaveLearningsButton` builds element summaries + a brief summary and invokes **`extract-learnings`** `{clientName, projectName, projectType, boothSize, briefSummary, elements, feedbackLog}`; the returned entries are shown with all selected by default and saved into `brand_intelligence`.

**Outputs & side effects**
- Files created locally: `.zip`, `.pptx`, `.pdf`, `_materials.csv`, `_3d_brief.md`, Figma `.json`.
- Tables: `brand_intelligence` (learnings). Deck state is persisted **only to localStorage** (`useDesignedDeck` `LS_PREFIX` cache keyed by projectId).
- Step status: **nothing** is written — `projects.status` never becomes `"completed"`.

**Current-state gaps**
- **No completion write.** `Projects.tsx` pipeline step "Exported" checks `p.status === "completed"`, but no code path ever sets that value. The step can never turn green.
- The designed deck lives only in localStorage — not shared across devices or teammates, and lost on cache clear.
- Materials, 3-D brief, and Figma spec are held in React state only; navigating away discards them with no persistence and no regeneration memory.
- Every export uses `footprints[0].size` / `configs[0]` — the active footprint config chosen on Spatial/Prompts is ignored, so a multi-size project always exports the first size's spec.
- `generate-3d-brief` is sent `currentProject.renderPrompts`, which is always `null` (see below).
- ZIP image fetches are sequential and failures are only `console.warn`ed — a partially-empty package downloads silently.
- `FigmaExportPanel` receives `clientLogo: null` hardcoded despite the rail checking for a client logo.
- `activationTypeId` is read via two speculative `(currentProject as any)` keys that the `Project` type does not define — effectively always `null`.

---

### Files · `/files`

**Route & access**
`/files?project=<id>`, `ProtectedRoute`. `src/pages/Files.tsx`. Reachable from `StepPillNav` (rendered as pill **#6**, between Prompts and Export).

**Intent**
The project asset library: every saved render (all versions, all booth sizes), 3-D Rhino uploads with AI polish, and video generation from selected images.

**UI anatomy**
- `PageHeader` with an asset count eyebrow (no step eyebrow). Empty state when no `?project=`.
- Three tabs: **Images** (count badge), **3D Renders** (count badge), **Video**.
- *Images*: angle filter chip row (All angles + one chip per distinct `angle_name`, each with counts), a **Current only** toggle, and a **Select** toggle. Select mode adds a bar with select-all/deselect-all, a selection count, and **Make Video (N)** which programmatically clicks the video tab.
- Grid cards show the render, a hover gradient with angle name + date, a **Current** badge, and a booth-size badge (replaced by a checkbox in select mode). When renders span more than one booth size, the grid is split into per-size sections (project-config order first, then orphaned config keys, then "Earlier renders" for untagged/legacy) — otherwise a flat grid.
- Custom fullscreen lightbox with prev/next walking the flattened display order, angle name, Current badge, timestamp, **Download**, and **View prompt** (→ shared `RenderPromptDialog`).
- *3D Renders*: `RhinoUploadPanel` + `RhinoGallery`.
- *Video*: `FilesVideoPanel`, pre-seeded with the images selected on the Images tab.

**Inputs**
`useProjectImages(projectId)` (`project_images`), `useRhinoRenders(projectId)` (`rhino_renders`), `useProjectStore` for `spatialStrategy.data.configs` (to map config keys → human labels) and `clientId`. Size tagging reads `parseVersionedAngleId(angle_id).configKey` first, then `prompt_artifacts.configKey/configLabel`.

**Workflows**
- Filter (angle + current-only) → group by booth size → flatten for lightbox navigation.
- Download builds an `<a download>` with `{angle_name}_{created_at_ms}.png`.
- View prompt opens `RenderPromptDialog` against the row's `prompt_artifacts`.
- Rhino polish (`useRhinoRenders`) sets `polish_status: "processing"`, invokes **`polish-rhino-render`**, and writes `"error"` + `polish_feedback` on failure.
- Video generation runs through `useVideoStore` → **`generate-video`**.

**Outputs & side effects**
Read-mostly. Writes come from the Rhino panel (`rhino_renders` + storage) and the video panel. No `projects` writes, no step status.

**Current-state gaps**
- `/files` occupies step slot **6** in `StepPillNav` while Export is slot **7**, contradicting every WorkSheet eyebrow ("Step 06 / 06" on Export). The step model in the header and the step model on the sheets disagree.
- The download always names the file `.png` regardless of the actual stored extension.
- The "Make Video" handoff uses `document.querySelector('[data-value="video"]')?.click()` — a DOM escape hatch that will break if the Tabs implementation changes its attributes.
- Angle chips are computed from all saved images while the size grouping applies only to `filtered`, so a chip can show a count that no visible group contains.
- Files has its own bespoke lightbox rather than the shared `ImageLightbox` used elsewhere.
- No delete, rename, tag, or "set as current" action on renders — the library is read-only aside from Rhino/video.

---

### Knowledge Base · `/knowledge-base` (project-scoped)

**Route & access**
`/knowledge-base?project=<id>`, `ProtectedRoute`. `src/pages/KnowledgeBase.tsx`. **No navigation link anywhere** — not in `AppSidebar`, not in `StepPillNav`. Reachable only by typing the URL.

**Intent**
Attach project reference material (previous projects, inspiration, pricing docs, specs) with editable extracted text that gets injected into element generation.

**UI anatomy**
`PageHeader` with a document count; empty state when no `?project=`. Dropzone accepting **any** file type up to 20 MB. Per-file card: type icon, filename, size, date, a "Has content" badge, an expand chevron revealing a "Content / Notes (included in AI generation)" textarea + **Save Notes**, and a delete `AlertDialog`.

**Inputs / Workflows**
`useKnowledgeBase(projectId)` (`src/hooks/useKnowledgeBase.tsx`) against the **legacy** `knowledge_base_files` table. Upload: `extractTextFromFile(file)` (client-side text read for txt/csv/md/html/json/xml/yaml/log only; everything else returns `null`) → `supabase.storage.from("knowledge-base").upload("{userId}/{projectId}/{ts}_{name}")` → `getPublicUrl` → INSERT `knowledge_base_files {project_id, user_id, file_name, file_type, storage_path, public_url, extracted_text, file_size_bytes}`. Delete removes the storage object then the row. `updateExtractedText` patches the row.

**Outputs & side effects**
Table `knowledge_base_files`; storage bucket `knowledge-base`. Consumed by `ElementDashboard.getContextPayloads()` as `knowledgeBaseContent: [{fileName, content}]` (rows without `extracted_text` are dropped) and by `Generate.tsx`'s Weighted Context rail.

**Current-state gaps**
- **Two parallel knowledge bases exist.** This page writes `knowledge_base_files` / bucket `knowledge-base`; the Upload step's `ProjectKnowledgeBase` → `KnowledgeBasePanel` writes `knowledge_documents` / bucket `knowledge-documents` with embeddings + auto-tagging. They do not see each other. `migrate-legacy-kb` exists as an edge function but nothing in this UI calls it.
- The page is **orphaned** — no link reaches it.
- Non-text files land with `extracted_text: null` and are therefore invisible to element generation until a human manually pastes the content.
- Files are stored with `getPublicUrl` on the `knowledge-base` bucket (public reads) while the newer `knowledge-documents` bucket is private and signed — inconsistent access posture.

**The RAG-backed panel** (`src/components/knowledge/KnowledgeBasePanel.tsx`, used at project scope from `/upload`): dropzone restricted to PDF/DOC/DOCX/XLS/XLSX/PPT/PPTX/TXT/MD/CSV/PNG/JPG/WEBP up to 50 MB; per-doc rows with embedding status, auto-tags + user tags, pin/unpin, re-embed, preview (signed URL, 1 h), download, delete; search by filename/title/tag once >3 docs. Upload path: storage `{agencyId}/{scope}/{scopeId}/{ts}_{safeName}` → INSERT `knowledge_documents` with `status: "pending"` → invoke **`embed-document`** → **`auto-tag-document`** on a 3 s `setTimeout`. Tag conventions drive downstream consumers: `brand-logo`, `inspiration`+`image`, `inspiration`+`links`, `render-reference`, `geometry-reference`.

*Gap:* the auto-tag call is a fire-and-forget `setTimeout` racing text extraction; embed failure is swallowed with only a console error and the row left at `pending`/`failed`.

---

### Rhino · `/rhino`

**Route & access**
`/rhino?project=<id>`, `ProtectedRoute`. `src/pages/Rhino.tsx`. **No navigation link anywhere** — orphaned like `/knowledge-base`.

**Intent / anatomy**
Upload Rhino/SketchUp/3-D screenshots and have AI polish them into photorealistic renders. The page is a thin shell: header, `RhinoUploadPanel`, `RhinoGallery` — the exact same two components the Files page mounts in its "3D Renders" tab.

**Workflows / outputs**
`useRhinoRenders(projectId)` → table `rhino_renders`. Polish sets `polish_status: "processing"` + `polish_prompt`, invokes **`polish-rhino-render`**, and writes `polish_status: "error"` + `polish_feedback` on failure or when no image is returned. Polished renders (`polish_status === "complete"` with `polished_public_url`) flow into the Export step's ZIP, proposal, and Figma spec.

**Current-state gaps**
Fully duplicated by the Files → 3D Renders tab, unreachable via UI, and unlike Files it lacks the video tab and the surrounding library context. It is dead surface area kept alive by the router.

---

## Step gating & status model

**There are four independent, partly-contradictory notions of "where am I":**

**1. Header pill nav — purely positional, not data-driven.**
`ProjectHeader.tsx` builds `stepPills` from a hardcoded `PROJECT_STEPS` array of **seven** entries (Brief, Review, Generate, Spatial, Prompts, **Files**, Export). Status is computed as: `location.pathname === step.path ? "active" : idx < currentStepIndex ? "complete" : "pending"`. It never reads project data. Consequences: everything left of the current URL renders with a green check regardless of whether it was done; deep-linking to `/export` marks all six prior steps complete; `StepPillNav`'s `"blocked"` status (the red 6 px dot) is **never produced by any caller** — the visual state exists but is dead code. The sheets say "Step NN / 06" while the nav shows seven pills, so Files is #6 in the nav and Export is #7 but titled "Step 06 / 06".

**2. `useProjectStore.activeStep` — advisory, never read for gating.**
A union of `"upload" | "review" | "generate" | "spatial" | "prompts" | "export"`. Set on hydration by `loadFromDb` using a cascading heuristic (`parsedBrief` → `review`; any element complete → `generate`; `renderPrompts` → `prompts`) and imperatively by each step's Continue handler. Nothing reads it to decide what to render or whether a route is permitted.

**3. Per-screen data guards — the *only* real gating, and each one is a soft redirect.**
- `/review`: `!brief` → "No brief data to review" + button to `/upload`.
- `/generate`: `!currentProject?.parsedBrief` → "No brief data available" + button to `/upload`.
- `/spatial`: missing `spatial_strategy.configs` / active config / layout / metrics → "No spatial data available" + button to `/generate`.
- `/prompts`: `!brief || !spatialData || !bigIdea` → "Generate all elements first" + button to `/generate`.
- `/export`: `!brief || !elements` → "No project data to export" + button to `/upload`.
All are advisory dead-ends, not redirects; the user can always navigate directly via the pill rail and simply lands on the empty state. Nothing prevents forward navigation from a step with unresolved blocking gaps.

**4. Persisted status — thin and incomplete.**
- `projects.status` is a free-text string. Only two values are ever written: `"draft"` on project creation (`BriefUpload.ensureDbProject`, `useProjects`) and `"reviewed"` on brief confirmation (`BriefUpload.handleConfirmAndContinue`, `GuidedBriefBuilder.handleSubmit`). `"parsing"`, `"generating"`, and `"completed"` are read (by `Projects.handleOpenProject`'s route map and the pipeline checks) but **never written**.
- The real progress signal is **column presence**, evaluated by `PIPELINE_STEPS` in `src/pages/Projects.tsx`: brief (`brief_text | brief_file_url | brief_file_name`), review (`parsed_brief.brand.name` **and** an objective or a show), elements (`big_idea` **and** one of experience/interactive/digital), spatial (`spatial_strategy.configs.length | zones.length | scalingStrategy`), prompts (`render_prompts` non-null), export (`status === "completed"`).
- **Two of those six can never be satisfied.** `setRenderPrompts` exists on the store but is called from nowhere, and `projects.render_prompts` is only ever *read* — so "Render Prompts Ready" is permanently false even after a full render sweep. And nothing writes `status: "completed"`, so "Exported" is permanently false. The `hero_prompt` and `hero_style_confirmed` columns are likewise read but never written.
- Element status is not stored as status at all — `useProjectSync` derives `"complete"` vs `"pending"` purely from whether the element's JSON column is non-null. Runtime `"generating"` and `"error"` states are memory-only and vanish on reload.
- Render-phase state (`renderStore.phase`, hero thread, prompts, progress) is entirely in memory, reset on project switch, prompt-version switch, and booth-size switch; the only durable render state is the `project_images` rows, re-hydrated by scanning for a current `hero_34` under the active version+config.
- The one genuine per-step approval gate in the product is the **hanging-element check**, keyed `hangingApprovalKey(configKey, heroImageUrl)`, held in `renderStore.hangingApprovals` and persisted to `project_images.prompt_artifacts.hangingApproved` — and even that only warns rather than blocking view generation.
- Two per-project selections persist outside the schema: `spatial_strategy.activeConfigKey` (rides the existing JSONB blob) and the measurement system (localStorage `canopy:project-measurement-system:<projectId>`, resolution order: explicit user choice → unit detected from the brief → imperial).