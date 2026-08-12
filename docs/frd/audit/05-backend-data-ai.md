I have everything I need. Here is the full report.

---

# CANOPY — Backend, Data Model & AI Generation Pipeline Audit

Supabase project: `kjbamfitkaxnfyppplaq`. Generated types at `/Users/bryanscott/Desktop/Brief to Booth/src/integrations/supabase/types.ts` (PostgREST 14.1) are treated as the ground truth for the hosted schema; `supabase/migrations/*.sql` are treated as *intent only* (the repo's own docs state hand-authored migrations are not applied to the hosted DB).

---

### 1. Data model

**34 tables**, one enum (`app_role: admin | member | super_admin`), no views, ~68 RPC functions.

#### Identity / agency / access
| Table | Purpose | Key columns | Relationships |
|---|---|---|---|
| `agencies` | Tenant root. Owns clients, projects, KB, quotas, render-model preference. | `owner_user_id`, `slug`, `access_status` (active/trial/suspended/disabled), `trial_ends_at`, `feature_flags` jsonb, `quotas` jsonb, `image_model`, `industries[]`, `primary_industry`, `brand_colors`, `logo_url`, `suspended_at/_by`, `suspension_reason`, `admin_notes` | referenced by nearly everything |
| `agency_members` | Membership + role within an agency. | `agency_id`, `user_id`, `role`, `invited_by`, `joined_at` | → `agencies` |
| `agency_access_log` | Immutable audit of admin actions on an agency (suspend/reactivate/quota/flag changes). | `action`, `before_state`/`after_state` jsonb, `performed_by`, `reason` | written only by the `_log_agency_access` RPC |
| `user_roles` | Platform-level roles, separate from agency roles. | `user_id`, `role` (`app_role` enum) | — |
| `profiles` | Display name / email / avatar mirror of auth.users. | `user_id`, `email`, `display_name`, `avatar_url` | — |
| `team_members` | Legacy pre-agency team model (owner + invited members). | `team_owner_id`, `user_id`, `role`, `invited_email`, `accepted_at` | superseded by `agency_members`; still read in `src/hooks/useTeam.tsx` |
| `company_profiles` | Per-user agency-branding profile used in exports/decks. | `company_name`, `logo_url`, `logo_dark_url`, `brand_color`, `secondary_color`, `tagline`, `default_booth_sizes[]`, contact fields | — |
| `industries` | Admin-managed industry verticals with a `vocabulary` jsonb. | `slug`, `label`, `is_builtin`, `sort_order`, `vocabulary` | mirrored client-side by `src/lib/builtinIndustries.ts` |

#### Clients & brand
| Table | Purpose | Key columns | Relationships |
|---|---|---|---|
| `clients` | The brand a project is for. | `agency_id`, `name`, `industry`, `website`, `logo_url`, `primary_color`, `secondary_color` | → `agencies` |
| `brand_guidelines` | One structured row per client — deterministic (non-RAG) brand facts. | `client_id`, `color_system`, `typography`, `logo_rules`, `tone_of_voice`, `photography_style`, `materials_finishes` (all jsonb), `guidelines_version` | FK not declared in types (loose `client_id`) |
| `brand_intelligence` | Per-client knowledge entries — **the approval-gated memory core**. | `client_id`, `category`, `title`, `content`, `tags[]`, `source` (`manual`/`ai_extracted`/`feedback`), `confidence_score`, `is_approved`, `approved_at`, `source_project_id` | → `clients` |
| `venue_intelligence` | Show/venue knowledge (design tips, traffic, union labor). | `show_name`, `venue`, `city`, `industry`, `design_tips[]`, `traffic_patterns`, `audience_notes`, `logistics_notes`, `booth_placement_tips`, `typical_booth_sizes[]`, `union_labor_required`, `source`, `source_project_id` | → `projects` |
| `show_costs` | Per-show/city cost baselines. | `show_name`, `city`, `venue`, `estimated_booth_cost_per_sqft`, `estimated_drayage_per_cwt`, `estimated_electrical_per_outlet`, `estimated_labor_rate_per_hr`, `badge_scan_cost`, `union_labor_required`, `is_preset` | — |
| `brand_assets` | **Not in `types.ts`.** Read/written in `src/hooks/useBrandAssets.tsx` via `.from("brand_assets" as any)`. Client brand files in the `brand-assets` bucket. | — | schema drift |

#### Projects & briefs
| Table | Purpose | Key columns | Relationships |
|---|---|---|---|
| `projects` | The central record: brief text + parsed brief + all 8 generated elements as JSONB columns. | `user_id`, `client_id`, `parent_id` (suite hierarchy), `name`, `project_type`, `activation_type`, `status`, `is_suite`, `inherits_brief`, `inherits_brand`, `scale_classification`, `footprint_sqft`, `suite_notes`, `brief_text`, `brief_file_url`/`_name`, `brand_website_url`, `parsed_brief` jsonb, `render_prompts` jsonb, `hero_prompt`, `hero_style_confirmed`, **element columns**: `big_idea`, `experience_framework`, `interactive_mechanics`, `digital_storytelling`, `human_connection`, `adjacent_activations`, `spatial_strategy`, `budget_logic` | self-FK `parent_id`, → `clients` |
| `custom_project_types` | User/AI-authored project types beyond the builtins. | `type_id`, `label`, `short_label`, `render_context`, `spatial_unit`, `default_size`, `is_ai_detected`, `confirmed_by_user`, `source_brief_id` | → `projects` |
| `project_type_configs` | Per-user enable/label/override of a project type. | `project_type_id`, `is_enabled`, `label`, `tagline`, `render_context`, `element_overrides`, `cost_category_overrides`, `sort_order` | no FK |
| `activation_types` | Catalog of activation formats (booth, popup, premiere…). | `slug`, `label`, `category`, `industries[]`, `is_builtin`, `default_scale`, `default_sqft`, `element_emphasis` jsonb, `parent_type_affinity[]`, `render_context_override` | — |
| `activation_type_overrides` | Per-agency template override of an activation type. | `agency_id`, `activation_type_id`, `template` jsonb, `description` | → both |

#### Elements / spatial
There is **no dedicated elements or zones table**. The 8 generated elements are JSONB columns on `projects` (mapped in `src/hooks/useProjectSync.tsx:ELEMENT_DB_KEYS`). Spatial geometry (zones, features, materials catalog, hanging elements) lives inside `projects.spatial_strategy` jsonb, modeled client-side by `src/lib/geometryModel.ts`.

#### Renders / images
| Table | Purpose | Key columns |
|---|---|---|
| `project_images` | Every saved render. **The outcome record.** | `project_id`, `user_id`, `angle_id` (version+config-suffixed), `angle_name`, `storage_path`, `public_url`, `is_current`, `prompt_artifacts` jsonb |
| `rhino_renders` | Uploaded Rhino/3D screenshots + their AI-polished counterpart. | `project_id`, `original_storage_path`/`_public_url`, `polished_storage_path`/`_public_url`, `polish_status`, `polish_prompt`, `polish_feedback`, `view_name`, `notes` |

`project_images.prompt_artifacts` is the union of three payloads (see §3): the client's transparency payload (`prompt`, `negative`, `geometrySummary`, `compliance`, `references[]`, `model`, `generatedAt`), the badge fields (`modelUsed`, `primaryError`), the config tags (`configKey`, `configLabel`), plus `hangingApproved` written later by the approval gate.

#### Pricing / BOM
| Table | Purpose | Key columns |
|---|---|---|
| `plan_items` | The project BOM line items. | `project_id`, `agency_id`, `item_key`, `description`, `quantity`, `unit`, `quality_tier`, `category`, `csi_division`, `uniformat_class`, `manufacturer`, `model_number`, `position` jsonb, `override_unit_price`/`_currency`/`_reason`, `metadata` |
| `pricing_sources` | Rate-card / vendor feed registry. | `agency_id`, `source_type`, `vendor_name`, `region`, `config` jsonb, `is_active`, `last_refreshed_at` |
| `pricing_quotes` | Individual priced rows resolved from a source. | `source_id`, `agency_id`, `item_key`, `unit_price`, `currency`, `unit`, `quality_tier`, `region`, `confidence`, `fetched_at`, `valid_until`, `source_url` |
| `regional_factors` | Cost multipliers per region/category. | `region`, `region_kind`, `category`, `factor`, `effective_at`, `source` |

Resolution order is encoded in the `price_plan(_project_id, _region, _quality_tier)` RPC: `override > agency rate card > global feed > unpriced`, with `regional_factor` applied to non-overrides. `project_pricing_summary` rolls up by `csi_division`. Called from `src/hooks/usePricing.tsx`.

#### Knowledge / RAG
| Table | Purpose | Key columns |
|---|---|---|
| `knowledge_documents` | The RAG corpus. One row per uploaded doc. | `agency_id`, `scope` (`agency`/`client`/`activation_type`/`project`/`industry`), `scope_id`, `filename`, `storage_bucket` (default `knowledge-documents`), `storage_path`, `mime_type`, `file_size_bytes`, `status` (pending/processing/embedded/failed), `processing_error`, `chunk_count`, `extracted_text` (capped 50k), `summary`, `doc_type`, `auto_tags[]`, `user_tags[]`, **`priority_weight`**, **`is_pinned`**, `metadata` |
| `knowledge_chunks` | Chunked + embedded text. | `document_id`, `chunk_index`, `content`, `embedding` (pgvector 768), `scope`, `scope_id`, `agency_id`, `token_count`, `metadata` |
| `rag_query_log` | Retrieval analytics. | `agency_id`, `user_id`, `source`, `query`, `scopes[]`, `scope_ids[]`, `top_k`, `result_chunk_ids[]`, `result_doc_ids[]`, `reranked`, `pinned_doc_ids[]`, `duration_ms` |
| `knowledge_base_files` | **Legacy** per-project KB files (pre-RAG). | `project_id`, `file_name`, `storage_path`, `public_url`, `extracted_text`, `folder`, `layer`, `scope`, `doc_type`, `topics[]` |
| `activation_type_kb_files` | **Legacy** per-activation-type KB files. | same shape, `activation_type_id` |
| `kb_migration_log` | Idempotency ledger for the legacy→`knowledge_documents` backfill. | `source_table`, `source_row_id`, `document_id`, `status`, `error` |

`match_knowledge_chunks(_agency_id, _query_embedding, _query_text, _scopes[], _scope_ids[], _match_count, _vector_weight)` is a SECURITY DEFINER plpgsql function that gates on `is_agency_member() OR is_super_admin()`, then computes
`hybrid_score = (_vector_weight * cosine_similarity + (1 - _vector_weight) * ts_rank_cd(bm25)) * knowledge_documents.priority_weight`
and returns `priority_weight` + `is_pinned` alongside.

#### Invites / admin / telemetry
| Table | Purpose |
|---|---|
| `pending_invites` | Agency-scoped invite (email, `invite_type`, `role`, `expires_at`, `accepted_at`, `status`). Accepted via `accept_pending_invite`, listed by `my_pending_invites`. |
| `platform_invites` | Platform-level invite issued by `admin-invite-user`. |
| `project_invites` | Share-link invite to one project: `token`, `scope`, `label`, `expires_at`, `accepted_by`. Redeemed by `accept_project_invite(_token)`. |
| `ai_usage_events` | AI telemetry: `feature`, `model`, `provider`, `user_id`, `agency_id`, `project_id`, `input_tokens`/`output_tokens`/`total_tokens`, `cost_usd`, `duration_ms`, `status`, `error_message`, `metadata`. Service-role insert only (`_shared/usage-logger.ts`); read via `ai_usage_by_agency/_by_feature/_by_user/_fleet_totals` RPCs. |

#### Storage buckets (referenced in code)
| Bucket | Path convention | Written by |
|---|---|---|
| `project-images` | `{projectId}/{configKey}_{angleId}_{ts}.{ext}` (save-render-image); `{projectId}/hero_34_{ts}_gen.{ext}` and `{projectId}/{safeAngle}_{ts}_gen.{ext}` (server-side pre-upload in generate-hero/view); `{projectId}/existing-space/{ts}.{ext}` (BriefExistingSpace) | edge functions + client |
| `knowledge-documents` | `{agencyId}/{scope}/{scopeId}/{ts}_{safeName}` or `industry/{industryId}/{ts}_{safeName}` | `useKnowledgeDocuments` |
| `knowledge-base` (legacy) | `{userId}/{projectId}/{ts}_{fileName}` | `useKnowledgeBase`, `ActivationTypeKnowledgeBase`, `ClientBrandKnowledgeBase`, `AddClientWizard`, `BrandGuidePrompt`, `BrandIntelligencePanel` (`clients/{clientId}/brand-pdf/{ts}_{name}`) |
| `brand-assets` | `{userId}/{clientId}/{ts}_{safeName}` | `useBrandAssets` |
| `rhino-renders` | per-file name from `useRhinoRenders` | `useRhinoRenders` |
| `company-assets` | `{userId}/logos/{variant}_{ts}.{ext}` | `src/pages/CompanyProfile.tsx` |
| `briefs` | `{userId}/{projectId}/original.{ext}` | `BriefUpload` |

#### Observed data-model gaps
- **`projects.agency_id` is never stamped on insert.** `src/pages/Clients.tsx:36` documents this explicitly ("only backfilled when an agency is created and is never stamped on new project inserts, so filtering on it returned 0 for every client"). It is also absent from `types.ts` entirely, yet `price_plan` does `SELECT p.agency_id FROM projects p` and raises if null — so **`price_plan` will raise `42704` for any project created after agency onboarding**.
- **`projects.prompt_versions` does not exist.** `src/lib/promptVersions.ts` writes to it and silently falls back to `localStorage` on the missing-column error. Prompt versions are therefore **device-local only**.
- Tables in `types.ts` with **no client writers**: `knowledge_chunks`, `rag_query_log`, `ai_usage_events`, `kb_migration_log`, `agency_access_log`, `regional_factors` (edge/RPC only, by design); `pricing_sources` and `pricing_quotes` have **no writer anywhere in the repo** — the pricing engine can only ever resolve `override` or `no_quote`.
- Tables used in code but **absent from `types.ts`** (cast through `as any`/`as never`): `brand_assets`, `beta_waitlist`.
- `brand_intelligence` has **no `key`/`value`/`relevance_weight`/`metadata` columns**, but `summarize-document` inserts rows with exactly those columns and `brand-compliance-check` selects `category, key, value`. Both are broken against the live schema (the insert is best-effort and only warns).
- `activation_type_overrides`, `project_type_configs`, `team_members` are read/written from the UI but are not wired into any generation path.

---

### 2. Edge functions

29 functions. Shared infra lives in `supabase/functions/_shared/`:

- **`ai-gateway.ts`** — `callGemini`, `callAnthropic`, `callOpenAIImage`, `generateImageWithFallback`. Despite the header comment claiming Lovable was replaced, **the Lovable gateway is still the preferred Gemini path**: `_callGeminiInner` uses `https://ai.gateway.lovable.dev/v1/chat/completions` whenever `LOVABLE_API_KEY` is set, and only falls back to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `GOOGLE_AI_API_KEY`. Model-name map: `google/gemini-2.5-flash|flash-lite|pro`, `google/gemini-3-pro-image-preview → gemini-2.0-flash-exp`, `google/gemini-3-flash-preview → gemini-2.0-flash`.
- Image strategy (`generateImageWithFallback`): **gpt-image-2 primary** (`https://api.openai.com/v1/images/generations` with no refs, `/v1/images/edits` multipart with refs, max 4 refs, optional alpha mask, 220 s timeout, one retry on transient errors with 8 s backoff for rate-limit/overloaded and 3 s otherwise) → **Gemini `gemini-3-pro-image-preview` fallback** (100 s timeout, retries once on `gemini-3.1-flash-image-preview` when the response has no image). Returns `modelUsed` + `primaryError`.
- Lovable image path has its own 402 fallback chain: requested model → `google/gemini-3.1-flash-image-preview` → `google/gemini-2.5-flash-image`, plus one retry on "upstream returned empty body".
- Anthropic: `https://api.anthropic.com/v1/messages`, default `claude-sonnet-4-20250514`, key resolved across `ANTHROPIC_API_KEY → LOVABLE_API_KEY → ANTHROPIC_KEY → CLAUDE_API_KEY` with a 401-triggered retry on a *different* candidate key.
- **`rag-helper.ts`** — `buildRagContext`, described in §4.
- **`usage-context.ts` / `usage-logger.ts`** — resolves `user_id` from the JWT and `agency_id` from the first `agency_members` row, then fire-and-forget inserts into `ai_usage_events` with cost estimated from a hardcoded price table in `pricing.ts`.
- **`streaming-response.ts`** — emits a keep-alive space every 20 s to defeat Supabase's 150 s idle timeout, then flushes the JSON body. (`generate-hero` and `generate-view` each inline their own copy; `generate-view`'s pads to 2 KB and sets `X-Accel-Buffering: no`.)
- **`access-gate.ts`** — `checkAgencyAccess()` returns 403 for suspended/disabled/trial-expired/feature-disabled agencies. **It is imported by zero functions** — dead code.

| Function | Purpose | Model | Writes / side effects |
|---|---|---|---|
| `parse-brief` | Extract a full structured brief from raw text / DOCX (JSZip XML walk) / PDF (Gemini vision). Retries 3×, repairs truncated JSON. | `google/gemini-2.5-flash` (text), `google/gemini-2.5-pro` (PDF vision) | none (returns `{data}`) |
| `synthesize-brief` | Turn the guided Q&A wizard answers into the same ParsedBrief shape + narrative `briefText`. | `google/gemini-2.5-flash`, temp 0.7 | none |
| `suggest-brief-field` | One-field autocomplete suggestion in the guided builder. | `google/gemini-2.5-flash-lite`, temp 0.8 | none |
| `generate-element` | Generate any of the 8 strategy elements via forced tool call. Per-element temperature (0.4 for `budgetLogic`/`spatialStrategy`, 1.2 on regenerate, else 0.9). Post-processes `spatialStrategy` zone positions (ratio→%, clamp, bounds). | `google/gemini-2.5-pro` | none (client persists to `projects.<element>`) |
| `enrich-spatial` | Fill `structuralForm`/`featureDescription`/`intent`/`materialIds` per zone and propose 3–6 `BoothFeature`s bound to the materials catalog. | `google/gemini-2.5-pro` | none |
| `generate-hero` | The primary render. Uses the client's `composedPrompt.renderer` verbatim when present; else EDIT MODE (previousImage+feedback) or a legacy edge-side markdown builder. | gpt-image-2 → gemini-3-pro-image-preview, `1536x1024`, quality `high` | Storage `project-images/{projectId}/hero_34_{ts}_gen.{ext}`; returns `imageUrl`, `modelUsed`, `promptUsed`, `primaryError` |
| `generate-view` | Same for one auxiliary angle. Hero image is the single reference in composer mode; multi-anchor only in the legacy path. Requires a Bearer JWT. | same | Storage `project-images/{projectId}/{safeAngle}_{ts}_gen.{ext}` |
| `save-render-image` | Persist a render: upload bytes (base64 or fetched URL) then insert the metadata row and flip previous rows for that angle to `is_current=false`. | none | Storage `project-images`; **writes `project_images`** |
| `generate-panorama` | Ultra-wide interior panorama for the VR/explorer view. No fallback model. | `gpt-image-2` only, `1536x1024` | none |
| `polish-rhino-render` | Turn a Rhino/SketchUp screenshot into a photoreal viz (geometry preserved, materials/lighting/people added). No fallback. | `gpt-image-2` only, `1536x1024` | none |
| `generate-video` | Image→video. Routes on `VIDEO_API_PROVIDER`. | Runway `gen4_turbo`, Kling `kling-v2`, or `google/veo-2` via the gateway | none (returns a poll `taskId`) |
| `generate-materials` | Cost-estimated materials list by category. RAG-enabled (`topK: 8`). | `google/gemini-3-flash-preview` | none |
| `generate-3d-brief` | Meshy.ai prompts + a Rhino/3ds-Max modeling brief (layers, materials, construction notes). RAG-enabled (`topK: 6`). | `google/gemini-3-flash-preview` | none |
| `generate-presentation` | Multi-mode router: `ping` (deep key validation with `claude-3-5-haiku-20241022`), `slides` (pptxgenjs structures), `designed-deck` (standalone 1920×1080 HTML per slide, incl. per-slide regenerate). RAG-enabled. | `claude-sonnet-4-20250514` (16384 max tokens, temp 0.7) | none |
| `analyze-existing-space` | Vision pass over an uploaded room photo → dimensions, features, materials, lighting, summary. Raises 502 on unparseable model JSON. | `google/gemini-2.5-pro`, temp 0.3 | none |
| `deep-dive-brand` | Build a brand profile from a URL (Firecrawl scrape + map for about/mission/values, branding signals merged) **or** a brand-book PDF (inline base64 / Storage download / client-rasterized `pageImages[]` / `pageStoragePaths[]`). Emits `brand_intelligence`-ready entries + a `brand_guidelines` payload + logo/colors. | `google/gemini-2.5-pro`, temp 0.3 | Storage reads only; returns entries for the client to insert |
| `scrape-brand-guidelines` | Thin Firecrawl `branding`+`markdown` scrape. | none | none |
| `scrape-venue-info` | Firecrawl a show/venue page → structured venue intelligence. | `google/gemini-2.5-pro`, temp 0.3 | none (client writes `venue_intelligence`) |
| `extract-learnings` | Project-close distillation into 3–8 categorized intelligence entries; validates against the 6-category enum. | `google/gemini-2.5-flash`, temp 0.4 | none (client inserts `brand_intelligence`) |
| `embed-document` | Extract (unpdf / mammoth / UTF-8 / synthetic image caption), sanitize for PG (NUL, C0, lone surrogates), chunk (~1000 chars, 1500 max, 100 overlap, paragraph-preferred), embed sequentially with 100 ms spacing. Idempotent — deletes prior chunks first. | `gemini-embedding-001`, 768 dims, `RETRIEVAL_DOCUMENT` | **`knowledge_chunks`** insert; **`knowledge_documents`** status/`chunk_count`/`extracted_text`/`processing_error` |
| `rag-retrieve` | Standalone retrieval endpoint: embed → per-scope `match_knowledge_chunks` → scope-weight → dedupe → optional rerank → pin force-include → enrich with doc metadata. | `gemini-embedding-001` + `google/gemini-2.5-flash` (rerank) | **`rag_query_log`** insert |
| `auto-tag-document` | Classify `doc_type` + extract 3–8 tags + one-sentence summary. (Comments say Haiku; code uses Gemini.) | `google/gemini-2.5-flash`, temp 0 | **`knowledge_documents`**: `doc_type`, `auto_tags`, `title`, `summary`, `metadata` |
| `summarize-document` | Rich summary + 5–20 structured key facts with confidence. | `claude-sonnet-4-20250514`, temp 0.2 | **`knowledge_documents`**: `summary`, `metadata`; optional **`brand_intelligence`** insert (schema-mismatched — see gaps) |
| `extract-pricing` | Pull rate-card line items from a KB doc. | `claude-sonnet-4-20250514`, temp 0 | **`knowledge_documents.metadata.pricing`** |
| `brand-compliance-check` | Score a proposed design against `brand_guidelines` + activation-type emphasis → pass/warn/fail + checks + must-have coverage. | `claude-sonnet-4-20250514`, temp 0.1 | none |
| `best-practices-suggest` | Synthesize best practices + pitfalls from up to 20 past agency projects. | `claude-sonnet-4-20250514` | none |
| `migrate-legacy-kb` | Super-admin-only idempotent backfill of `knowledge_base_files` + `activation_type_kb_files` into `knowledge_documents`, then triggers embedding. | none | **`knowledge_documents`**, **`kb_migration_log`** |
| `admin-invite-user` | Admin-gated `auth.admin.inviteUserByEmail`. | none | **`platform_invites`**, **`profiles`** upsert |
| `admin-manage-role` | grant/revoke `admin` / `super_admin`; blocks self-demotion. | none | **`user_roles`** |

**Notable hardening**
- `save-render-image` **PGRST204 retry**: if the insert is rejected because `prompt_artifacts` is missing (migration `20260514000000` not applied), it deletes the field and re-inserts. Rationale is in-code: without it the image uploaded to Storage but no row was written, so renders vanished on reload. It also caps client artifacts at 100 KB via `sanitizePromptArtifacts`.
- `generate-hero` explicitly **removed** its own `project_images.prompt_artifacts` update because it raced `save-render-image` and clobbered the *previous* hero's prompt history.
- Both render functions **deliberately drop the floorplan/isometric PNGs** from the model input — the canvas captures bake zone-name text into pixels which gpt-image-2 reproduced on booth walls. They also strip `.svg` references (image models 400 on them).
- `generate-hero`/`generate-view` upload server-side and return a short URL because multi-MB base64 round-trips were silently failing.
- `generate-element` wraps `budgetLogic`'s schema with only `totalPerShow` + `allocation` required, because 60+ nested required fields caused truncated tool calls read by the UI as "stuck generating".
- `parse-brief` has a bracket-balancing JSON repair for truncated model output.
- `analyze-existing-space` distinguishes upstream model failures (502) from its own (500).

**Never invoked from the client**: `rag-retrieve`, `best-practices-suggest`, `brand-compliance-check`, `extract-pricing`, `summarize-document`. All five are deployed and JWT-gated (`supabase/config.toml`), but no call site exists in `src/`.

---

### 3. Prompt composition pipeline (client side)

**`src/lib/geometryModel.ts`** is the absolute-unit spatial model that replaced the legacy 0–100 % zone shape. `BoothGeometry = { width, depth, ceilingHeightFt, measurementSystem, zones[], features?[], materialsCatalog?[], hangingElements?[] }`. `AbsoluteZone` carries real-unit `x/y/width/depth`, `heightFt`, a footprint `shape` (`rect | L | circle | diamond` + `shapeParams`), a `structuralForm` (`open | enclosed | canopy | alcove | platform | tower`), and `materialIds[]`. `BoothFeature` adds non-zone sculptural objects with `formType` (tower/ribbon/archway/canopy/sculpture/screen/totem/platform/bar/kiosk) and path/polygon shapes. `AbsoluteHangingElement` is center-anchored (unlike zones) with `suspensionDropFt`. Two-way converters (`boothGeometryFromLegacy`, `normalizedFromAbsoluteZone`) keep AI-generated percentage zones working.

**`src/lib/normalizedBrief.ts`** is the single source of truth. `normalizeBrief({project, parsedBrief, geometry, elements})` → `NormalizedBrief`; `validateBrief()` → `{failures, gaps}`; `composePrompt()` → the 5 stages `{briefJson, geometrySummary, renderer, negative, compliance}`.

Normalizer behavior worth noting: `safeBrief()` fills every required field defensively; colors parse an embedded `"orange (#E67E22)"` hex written by the clarification UI; zone names map to *functional purposes* via `zoneNameToPurpose` (hero/lounge/meeting/reception/demo/merch/narrative/service/media/supporting) so poetic zone names never reach the model; hero `physicalForm` falls back from `elements.interactiveMechanics.data.hero.physicalForm.structure` to `parsedBrief.experience.hero.description` (this dual source is what makes the clarification answer actually close the gap); hanging elements preserve incoming ids or mint UUIDs and use **pure geometric defaults** (`ring`, booth center, width/3, 1 ft thick, 3 ft drop) — the parser's `estimatedDimensions`/`suspensionHint` free text is captured but ignored. Fixed constants: `maxObjectSizePctOfFootprint = 0.30`, `minCirculationWidth = 3 ft / 0.9 m`, `humanScale = 5.58 ft / 1.7 m`, staffing hardcoded to `{count: 4, roles: ["sales","engineer"], attire: "business"}`, `timeOfDay: "controlled"`, venue type always `convention_center` / `controlled_indoor`, `interactiveTech: []`.

**Renderer section order (`rendererPrompt`)** — spatial-canvas path:
1. `# SCENE` — from `PROJECT_TYPE_SCENE[type]`; 16:9, eye-level 1.7 m, front-left 45°, per-type photographic lineage (Snøhetta/Foster, Iwan Baan/Hufton+Crow).
2. `# SPACE` — floor footprint stated as an explicitly **RECTANGULAR** carpet allocation (fixes the "oval carpet" bug), max height, open sides, human scale, min circulation, then "above the floor, design organically". **The old `# COORDINATE LAYOUT` per-zone (x,y,w,d) grid was deliberately removed** — it forced a layout-solver mindset producing rectangular pavilions.
3. `# HANGING ELEMENTS` — only when elements exist. Teaches that they hang from venue rigging and are **not** load-borne by the booth. Per element: name, `Form:`, geometry line (w × d in booth units × thickness in **ft**, shape, `positionPhraseFor()` natural-language placement, drop below ceiling), materials, surfaces, lighting, printed. `creativeDirection` is emitted with explicit lock language ("EXACT — follow precisely… NOT inspiration").
4. `# STRUCTURAL APPROACH` — only when `visualLanguage` / `hero.physicalForm` / `embrace` is non-empty. Asserts brand language must be *architecture*, not decoration; adds reference themes, authored hero form, embrace list, an explicit anti-default list, and (when hanging exists) the "open air between them" separation note.
5. `# ZONE PROGRAM` — **deduped functional purposes only**, framed as "what the booth needs to contain — let the design place them organically". Zone coordinates stay on `NormalizedBrief.zones` for docs/views but never enter the image prompt.
6. `# BRAND` — name + descriptor, colors by role with hex, required signage with `visibilityRequirement` (`all_sides` when openSides ≥ 3 and zones exist, else `front_and_back`; tagline → `front_only`).
7. `# BUDGET REALITY` — tier + `~$N/sq ft`, then `BUDGET_TIER_VOCAB`: **standard** = laminate / fabric graphics / vinyl / stock aluminum extrusion / functional lighting; **premium** = custom millwork / backlit SEG fabric / wood veneer / metal trim / integrated AV / designed lighting; **ultra** = sculptural forms / kinetic elements / natural stone / LED-integrated panels / theatrical lighting. Plus the **upsell rule**: one accent moment may hint one tier above, never the whole booth (collapses to "design within the ultra tier" at the top). Tier is inferred by `inferBudgetTier`: ≥ $400/sqft → ultra, ≥ $250 → premium, else standard; **no budget → premium**.
8. `# CONTEXT` — venue, audience, time of day, staffing, interactive tech.
9. `# ENVIRONMENT` — always emitted, per type: convention hall (venue floor, 10 ft aisles, adjacent booths out of focus), festival/outdoor grounds, or real architectural context. Closes with "structure occupies roughly 60-70 % of the frame width".
10. `# DESIGN INTENT` — `creative.designPhilosophy`, capped 300 chars.
11. `# HARD CONSTRAINTS` — exact footprint, open sides, signage strings, hero ≤ 30 % of footprint, forbidden items, hanging-aloft rule.
12. `# NEGATIVE` — appended inline because gpt-image-2 has no negative input: `creative.avoid` + no overlaid annotations + no zone/room labels on fascia + no dimension/percentage callouts + no flat rectangular fascia/truss + no cartoon/oversaturation/AI artifacts + the **void ban** ("blank background, white void, studio backdrop, isolated product shot, floating booth with no floor") which pairs with `# ENVIRONMENT`.

**Existing-space path (`composeExistingSpacePrompt`)** — dispatched by `BUILTIN_INDUSTRIES[industrySlug].inputMode`: `existing-space-photo` always, `hybrid` only when `normalized.existingSpace` is present, otherwise spatial-canvas. Sections: `# SCENE` (reused) → `# EXISTING SPACE` (analysis summary, dimensions, features, materials, natural light) → `# REGIONS TO PRESERVE` → `# REGIONS TO REDESIGN` → `# REDESIGN INTENT` → `# HARD CONSTRAINTS` (same-room, proportions/openings identical) → `# NEGATIVE` (same string, no drift). `# SPACE` and `# ZONE PROGRAM` are intentionally omitted — they describe a void-to-design frame that is wrong here.

**Validation gaps** surfaced to the clarification UI: primary-color hex (helpful; fires only on `colors[0]` so it can actually close), venue name (blocking), audience (helpful), hero physical form (helpful), hanging elements (helpful, with a `_dismissedGaps` sentinel so "No — floor-only booth" doesn't re-fire forever), and hero-scale-exceeds-30 % (blocking). `applyGapAnswer` writes each answer back to the exact `ParsedBrief` field the normalizer reads.

**`src/lib/promptVersions.ts`** — angle-id scheme. Base → `hero_34`; versioned → `hero_34__v__{versionId}`; version+config → `hero_34__v__{versionId}__cfg__{sanitizedFootprint}`. `sanitizeConfigKey` lowercases and dash-collapses ("20x40"). `parseVersionedAngleId` strips `__cfg__` first (outermost), then `__v__`. **Legacy fallback**: ids with no suffix belong to the project's first config (`configs[0]`, the largest) and are claimed by a version flagged `claimsUnversioned` or with id `"legacy"` (`LEGACY_VERSION_ID`). `findOrphanedVersions()` scans saved images for version suffixes with no matching metadata — including a synthetic legacy bucket — so lost versions can be one-click recovered. Version metadata (`preset`, `label`, `customEmphasis`, `imageModel`, `notes`) persists to `projects.prompt_versions` with a **localStorage mirror**; since that column doesn't exist, only the mirror is live.

**`src/lib/renderPromptArtifacts.ts`** — `buildRenderPromptArtifacts()` produces the transparency payload: `prompt` (capped at `MAX_PROMPT_CHARS = 20 000`, flagged `promptTruncated`), `negative`, `geometrySummary`, `compliance[]`, `references[]` (deduped by URL, **`data:` URLs filtered out** so no base64 or rasterized mask ever lands in the row, URLs > 2 000 chars dropped, labels defaulted), `model`, `generatedAt`. Empty optionals are omitted rather than stored blank. Returns null with no prompt text.

**`src/lib/hangingRefinement.ts`** — `hangingApprovalKey(configKey, heroImageUrl)` scopes approval to *this hero image within this booth size*, so refining or regenerating the hero automatically resets approval and switching size chips never bleeds it. `formatHangingSpecLines()` renders the canonical spec. `buildHangingEditInstruction()` builds the EDIT-MODE body: "modify ONLY the suspended element(s); keep booth, floor, furnishings, people, environment, lighting and camera IDENTICAL", followed by the canonical spec block, the user's refinement request, and the suspension/creative-direction reassertion.

#### The consistency model: hero-first → hanging approval → fan-out

1. `PromptGenerator` memoizes `normalizeBrief` → `composePrompt` → `validateBrief` (each wrapped in try/catch so a bad brief can't trip the app error boundary).
2. **Hero.** `handleGenerateHeroImage` captures the geometry PNGs, computes the existing-space mask if applicable, and calls `renderStore.generateHeroImage` with `composedPrompt = { renderer, negative, artifacts: composerOutput }`. The edge function uses `renderer` **verbatim**. On return, the store appends a `HeroTurn` to `heroThread` (branchable conversation), records `heroModelUsed` / `heroPrimaryError`, and calls `onSave` with `buildRenderPromptArtifacts(...)` — preferring the edge function's echoed `promptUsed` over the local renderer text (critical in EDIT MODE, where the edge wraps the feedback in its own template).
3. **Hanging approval gate.** If `normalizedBrief.hanging.elements.length > 0`, the check panel shows the spec next to the hero. *Refine* calls `generateHeroImage` in EDIT MODE — `previousImageUrl` + `feedback` and **deliberately no `composedPrompt`**, because that branch takes priority in the edge function and would regenerate from scratch. Each refine saves a new hero version in the same config stack. *Approve* flips `renderStore.hangingApprovals[key]` and persists `prompt_artifacts.hangingApproved = true` on the hero's `project_images` row so it survives reload. Generating views while unapproved is allowed but warns once — every view inherits the hero's hanging element.
4. **Fan-out.** `composedViewPrompts` builds a `HeroSnapshot { composerOutput, normalizedBrief, imageUrl, generatedAt }` once the hero exists, and runs `composeViewPrompt(snapshot, angle, {zoneId})` for every non-hero angle. View prompts are deliberately **terse (~80–150 tokens)**: one `viewInstruction` sentence + a consistency guard ("treat the reference as canonical… only the camera angle changes") + a restriction line. The in-code rationale: a long structured block made gpt-image-2 treat the request as a *fresh generation* and produce a different booth; short prompt + hero-as-only-reference flips it into edit-mode behavior. `generateAllViews` runs exteriors first then interiors, at **concurrency 3** (down from ~21 min serial to ~9 min; not higher because gpt-image-2 throttles).
5. **Reference-image flow.** Hero: existing-space photo **exclusively** when present (plus optional alpha mask, transparent = editable) — otherwise `[previousImage (edit source), brandLogo, ...extraReferenceUrls]` sliced to 4, SVGs stripped. Views: existing-space photo exclusively; else **hero only** in composer mode; else the legacy multi-anchor list. Geometry PNGs are never forwarded. Per-angle attachments come from `useRenderReferences` and are cleared on success; project-wide visual references (inspiration + brand assets) persist across every view.
6. **Save.** `makeSaveHandler(configKey, configLabel)` is a factory — "Generate all sizes" binds a handler per config so a mid-flight chip switch can't misfile a render. It composes the final angle id (version + config suffixes, or bare for a legacy version), then `save-render-image` uploads, flips prior `is_current`, and inserts the row with merged artifacts.

---

### 4. Brand intelligence & knowledge / RAG

**brand_guidelines / brand_intelligence flow.** `deep-dive-brand` (URL or brand-book PDF) produces `entries[]` mapped into the 6 categories — `strategic_voice` (mission, vision, values, personality, tone, sentiment, target audience, messaging pillars, taglines, competitors), `visual_identity` (colors, typography, logo URL, photography style), `process_procedure` (dos/don'ts) — plus a structured `guidelines` payload (colorSystem/typography/logoRules/photographyStyle). Firecrawl branding signals backfill any color/typeface/logo Gemini left blank. Entries arrive **unapproved**; the client inserts them with `is_approved: false`, `source: "ai_extracted"` (`AddClientWizard`, `ClientsManager`, `BrandIntelligencePanel`). `src/lib/brandIntelligenceExtractor.ts` does the same locally from a parsed brief (`confidence_score: null`). `extract-learnings` produces the same shape at project close.

**The approval gate is real and enforced client-side**: `PromptGenerator.tsx:249` and `ElementDashboard.tsx:274` both filter `e.is_approved` before building the `brandIntelligence` payload. Inside `generate-hero`/`generate-view` a second filter narrows to `visual_identity | vendor_material | strategic_voice` (views drop `strategic_voice`). **`confidence_score` is never read anywhere in generation** — it is display-only.

**Deterministic (non-RAG) brand injection**: `useBrandRAG` + `src/lib/brandRAGBuilder.ts` assemble a plain-text `brandContext` string from `brand_guidelines` + approved `brand_intelligence` + `brand_assets` + `venue_intelligence` + legacy `knowledge_base_files` (agency KB via the sentinel project id `00000000-0000-0000-0000-000000000001` + project KB) + suite context, weighted by an `ELEMENT_CATEGORY_PRIORITY` map and truncated to a token budget. This string is passed as `brandContext`/`suiteContext` to `generate-element`, `generate-hero`, `generate-view` (capped at 600/500 chars in the hero/view prompts).

**pgvector RAG.** Upload → `knowledge-documents` bucket → `knowledge_documents` row (`status: pending`) → `embed-document` (chunk + `gemini-embedding-001` 768-d) → `auto-tag-document` fires 3 s later. Retrieval (`_shared/rag-helper.ts`, mirrored in `rag-retrieve`): embed the query with `RETRIEVAL_QUERY`, call `match_knowledge_chunks` **once per scope in parallel** with `perScopeCount = max(4, ceil(max(topK*3,12)/scopes))` and `vectorWeight 0.7`, apply **scope weights `project 1.0 > client 0.85 > activation_type 0.75 > agency 0.6`** to `hybrid_score`, dedupe by chunk id keeping the highest weighted score, optionally LLM-rerank the top 20 with `gemini-2.5-flash` at temp 0 (JSON array of 0–1 scores), **force-include one chunk per pinned document**, fill remaining slots, group by scope, and format as `─── RETRIEVED KNOWLEDGE BASE CONTEXT ───` with per-scope headers and `★ PINNED` markers that the prompt declares authoritative on conflict. Every retrieval fire-and-forget logs to `rag_query_log`. Failures always degrade to an empty context — retrieval never blocks generation.

**Where retrieved context is injected**: `parse-brief` (system prompt), `generate-element` (system prompt), `generate-hero` (last 600 chars of `# ADDITIONAL CONTEXT` — deliberately at the end because gpt-image-2 weights opening tokens), `generate-view` (last 500 chars), `generate-materials` (topK 8), `generate-3d-brief` (topK 6), `generate-presentation` (both modes; skipped on slide regeneration).

**Critical observed gap — the RAG path is effectively dead in the main flows.** Every `buildRagContext` call site is guarded by `if (agency_id)`, and **no client call site sends `agency_id`** to `parse-brief` (`BriefUpload.tsx` posts only `briefText`/`fileBase64`), `generate-element` (`ElementDashboard.tsx`), `generate-hero`, or `generate-view` (`renderStore.ts` has zero occurrences of `agency_id`). Only `generate-materials`, `generate-3d-brief` (`ExportPackage.tsx:137,168`) and `generate-presentation` (`useDesignedDeck.tsx:143,202`) pass it. `parse-brief` also never receives `brandIntelligence`/`brandContext`, so its cross-reference block is dead too.

#### Stated intent (docs/intelligence/*.md) vs. code

| Capability | Docs claim | Code reality |
|---|---|---|
| `brand_intelligence` + approval gate, 6 categories | ✅ | **LIVE** — gate enforced at both generation call sites |
| `brand_guidelines` structured facts wired into generation | ✅ | **PARTIAL** — injected via `brandRAGBuilder`'s prose block, and read by `brand-compliance-check`, but that function is never called |
| `deep-dive-brand` URL + brand-book extraction | ✅ | **LIVE** (four input modes: URL, inline PDF, Storage PDF, client-rasterized pages) |
| Scope-weighted RAG over documents | ✅ | **PARTIAL** — fully implemented and correct, but unreachable from the brief/element/render flows for lack of `agency_id`; live only for materials / 3D brief / decks |
| `prompt_artifacts` outcome records | ✅ | **LIVE**, with a PGRST204 fallback that silently degrades to no artifacts if the column is missing |
| `extract-learnings` at project close | 🟡 manual button | **matches** — manual only, reads elements, not an event stream |
| `learning_events` capture | ⬜ Phase 1 | **PLANNED** — table does not exist; no writer anywhere |
| Embeddings on intelligence entries | ⬜ | **PLANNED** — no `embedding` column on `brand_intelligence` |
| "first 40 approved rows" retrieval for intelligence | stated as today's behavior | **inaccurate** — the client fetches *all* client-scoped entries (`useClients.tsx` select `*` ordered by category/created_at, no limit) and filters `is_approved` in memory. The `limit(40)` exists only inside `brand-compliance-check`, which is never invoked. |
| `use_count` / `last_used_at` / `supersedes_id` reinforcement | ⬜ Phase 3 | **PLANNED** |
| `scope: agency` on intelligence entries | ⬜ Phase 4 | **PLANNED** — `brand_intelligence` has no `scope` column; agency-scope knowledge only exists in `knowledge_documents` |
| Estimate calibration from final budgets | ⬜ Phase 4 | **PLANNED** |
| Hanging approval as a durable signal | ✅ on the image row | **LIVE** (`prompt_artifacts.hangingApproved`) |
| "Migrations gotcha" warning | documented | **corroborated** — `save-render-image`'s PGRST204 retry and `promptVersions`' localStorage fallback both exist for exactly this reason |

`docs/intelligence/data-model.md` also claims `generate-element` has a `buildBrandIntelligenceBlock`; the function does receive `brandIntelligence` in its body but the named helper exists only in `generate-hero`/`generate-view` (and in `generate-hero` the extracted helper is now dead — the structured builder inlines the filter).

---

### 5. Client state

**Zustand — three stores, none persisted.** No `persist` middleware, no `createJSONStorage`, no `partialize` anywhere.

- **`src/store/projectStore.ts`** (260 lines) — `currentProject` (id, name, projectType, clientId, hierarchy, rawBrief, parsedBrief, the 8 `elements` with `status`/`data`, `renderPrompts`), `projects[]`, `suiteContext`, `isLoading`, `activeStep` (`upload | review | generate | spatial | prompts | export`). `loadFromDb` derives `activeStep` from what's populated (brief → review, any complete element → generate, renderPrompts → prompts). Also exports `ELEMENT_META` for UI labels/icons.
- **`src/store/renderStore.ts`** (1038 lines) — the render orchestrator. Holds `heroPrompt`, `heroImage`, `heroModelUsed`, `heroPrimaryError`, `heroFeedback`, `heroIterations[]`, `heroThread[]` (branchable turns), `generatedPrompts`, `generatedImages` (per-angle `{url, status}`), progress flags, `heroVersion`/`viewVersions` (cache-busting counters), `designContext`, `consistencyTokens`, `hangingApprovals`, `hydratedFromDb`. Async actions `generateHeroImage`, `generateAllViews` (batch 3), `regenerateView`, `cascadeRegenerateViews` call the edge functions directly and invoke an injected `onSave` callback. Every action re-checks `get().projectId !== projectId` before writing, so a project switch mid-flight can't corrupt state. `resetForProject` wipes to `initialState`.
- **`src/store/videoStore.ts`** (337 lines) — `CAMERA_MOTION_PRESETS` + per-angle video generation state.

**React Query** — `new QueryClient()` in `src/App.tsx:56` with **all defaults** (no `staleTime`, no `gcTime`, no retry config). ~30 hooks in `src/hooks/`. Query-key conventions: `["project", id]`, `["project-images", projectId]`, `["kb-files", label, projectId]`, `["knowledge-documents", scope, scopeId, agencyId|"global"]`, `["client-project-counts", agencyId]`. Mutations invalidate their own key on success.

**The bridge**: `useProjectSync` reads `?project=` from the URL, hydrates Zustand from the React Query result exactly once (`hasHydrated` ref), and on project change calls `resetProject()` + `queryClient.removeQueries` for `["project", prev]` and `["kb-files", prev]`. Write-back is one-field-at-a-time via `saveProjectField(projectId, field, value)` → `projects.update({[field]: value})`. Element generation persists immediately after each element so navigation can't lose progress.

**Persistence outside the DB**: `localStorage` holds the Supabase auth session and prompt-version metadata (`canopy:prompt-versions:{projectId}`). There's a `useClearCacheOnUserChange` hook to avoid cross-user cache bleed.

---

### 6. Integrations & config

**AI providers, per task**

| Task | Model | Route |
|---|---|---|
| Brief parse (text), synthesize, learnings | `google/gemini-2.5-flash` | Lovable gateway if `LOVABLE_API_KEY`, else Google direct |
| Field suggestion | `google/gemini-2.5-flash-lite` | same |
| Brief parse (PDF vision), elements, spatial enrichment, brand deep-dive, venue scrape, existing-space analysis | `google/gemini-2.5-pro` | same |
| Materials list, 3D brief | `google/gemini-3-flash-preview` | same |
| Document auto-tagging | `google/gemini-2.5-flash` | same |
| Embeddings | `gemini-embedding-001` (768-d) | Google direct only (`GOOGLE_AI_API_KEY` required — no Lovable path) |
| RAG rerank | `google/gemini-2.5-flash` @ temp 0 | Lovable then Google |
| Decks, doc summarize, pricing extract, compliance, best practices | `claude-sonnet-4-20250514` | Anthropic direct |
| Deck key ping | `claude-3-5-haiku-20241022` | Anthropic direct |
| Hero / view renders | `gpt-image-2` → `gemini-3-pro-image-preview` (→ `gemini-3.1-flash-image-preview`) | OpenAI direct / gateway |
| Panorama, Rhino polish | `gpt-image-2` only, no fallback | OpenAI direct |
| Video | Runway `gen4_turbo` / Kling `kling-v2` / `google/veo-2` | direct or gateway |

**Client-facing model naming** (`src/lib/imageModels.ts`) deliberately hides providers: Signature (`gemini-3-pro-image-preview`), Studio (`gemini-3.1-flash-image-preview`), Draft (`gemini-2.5-flash-image`), Typographic (`gpt-image-2`). `useAgencyImageModel` collapses `agencies.image_model` to the coarse `"gemini" | "openai"` flag the edge functions expect — but **both render functions `void imageModel`** and always run the gpt-image-2-first fallback chain, so the agency preference is currently inert. Its default (`imageModelToProvider` → `"openai"`) disagrees with `DEFAULT_IMAGE_MODEL` (`google/gemini-3-pro-image-preview`).

**Secrets referenced in edge functions**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY` (+ `OPENAI_KEY`, `GPT_IMAGE_API_KEY`), `ANTHROPIC_API_KEY` (+ `ANTHROPIC_KEY`, `CLAUDE_API_KEY`, and `LOVABLE_API_KEY` as an Anthropic candidate), `FIRECRAWL_API_KEY`, `VIDEO_API_KEY`, `VIDEO_API_PROVIDER`.

**Frontend env**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`. `src/integrations/supabase/client.ts` **hardcodes the project URL and anon key as fallbacks** — the app works with no `.env` at all. `.env.example` also lists `GOOGLE_AI_API_KEY` / `ANTHROPIC_API_KEY`, which are server-side only and are not read by the frontend.

**JWT config** (`supabase/config.toml`): `verify_jwt = false` for parse-brief, generate-hero, generate-view, generate-element, save-render-image, generate-materials, enrich-spatial, generate-3d-brief, generate-presentation, generate-video, extract-learnings, polish-rhino-render, generate-panorama, deep-dive-brand. `verify_jwt = true` for scrape-brand-guidelines, embed-document, rag-retrieve, auto-tag-document, summarize-document, extract-pricing, brand-compliance-check, best-practices-suggest, analyze-existing-space. Not listed (default true): admin-invite-user, admin-manage-role, migrate-legacy-kb, scrape-venue-info, suggest-brief-field, synthesize-brief. Several `verify_jwt = false` functions do their own auth: `generate-view` and `generate-panorama` require a Bearer token and call `auth.getUser()`; `save-render-image` requires an auth header and derives `user_id` from it; `generate-hero` does **not** authenticate at all (it only builds a best-effort usage context).

**Webhooks / cron**: none. No `pg_cron`, no `pg_net`, no HTTP triggers in migrations, no Vercel cron in `vercel.json` (which only sets SPA rewrites and asset cache headers). 22 DB triggers exist in migrations (updated_at stamps, agency onboarding backfill). All async work is fire-and-forget invokes from the client or in-function `setTimeout`.

**Cost accounting** is a hardcoded per-model table in `_shared/pricing.ts` (dated 2026-05): Gemini Pro $1.25/$10 per Mtok, Flash $0.075/$0.30, image models priced per-image (`gpt-image-2` $0.19, `gemini-3-pro-image-preview` $0.039), Sonnet $3/$15. Models absent from the table (e.g. `google/veo-2`, `claude-3-5-haiku-20241022`) log `cost_usd = 0`.