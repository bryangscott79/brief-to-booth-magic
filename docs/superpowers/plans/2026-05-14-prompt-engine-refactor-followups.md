# Prompt Engine Refactor — Deferred Follow-ups

The Phase 3 production go-live shipped via the main refactor commits. A handful of cleanup items from the original plan were deliberately deferred because they touch legacy fallback paths and would carry regression risk without coordinated changes elsewhere.

## Deferred from Task 20

### Delete `src/lib/designContextBuilder.ts`

**Status:** kept in place.

**Reason:** the new pipeline runs alongside the old `designContext` wiring as defensive backup. `PromptGenerator` still computes `designContext` via `buildDesignContext` and pushes it into `renderStore` via `setDesignContext`. Both edge functions accept the field and use it in their legacy structured-prompt builders. Removing the file now would break the fallback path that fires when `composedPrompt` is somehow missing (e.g. an early hero regen before the normalizedBrief memo settles).

**Recommended approach when ready:** wait for one full week of production renders confirming `composedPrompt` is always populated, then remove the file along with the `designContext` field on the edge function request interfaces in one coordinated commit.

### Trim `src/lib/promptBuilder.ts`

**Status:** kept in full.

**Reason:** `generatePrompt`, `generateZoneInteriorPrompt`, and `buildBriefComplianceBlock` are still called from `PromptGenerator.buildPrompt(angleId)`. That function provides the legacy `prompt` field sent to the edge functions alongside `composedPrompt`. Removing it would break the legacy fallback in the edge functions for clients that send `prompt` but not `composedPrompt`.

**Recommended approach when ready:** after `designContextBuilder` is removed, swap `buildPrompt(angleId)` to return `composerOutput.renderer` directly (the legacy path becomes unreachable), then strip the dead exports from `promptBuilder.ts`.

### Update 13 UI surfaces to canonical project_type values

**Status:** untouched.

**Reason:** the DB migration (`20260514000001_normalize_project_types.sql`) maps legacy values forward to the canonical 5. The 13 files that reference legacy strings (`trade_show_booth`, `live_brand_activation`, etc.) continue to work because the new normalizer (`projectTypeOrDefault` in `normalizedBrief.ts`) maps either direction. The legacy `TYPE_SUFFIX` and `TYPE_FEEDBACK_PREFIX` maps in the edge functions also fall through to defaults gracefully.

Files needing label/key updates when ready:

```
src/components/admin/ActivationTypeManager.tsx
src/components/brief/BriefUpload.tsx
src/components/brief/GuidedBriefBuilder.tsx
src/components/explore/BoothExplorer.tsx
src/components/export/SaveLearningsButton.tsx
src/components/rhino/RhinoGallery.tsx
src/hooks/useProjectSync.tsx
src/hooks/useRhinoRenders.tsx
src/lib/projectTypeRules.ts
supabase/functions/generate-hero/index.ts (TYPE_SUFFIX map)
supabase/functions/generate-view/index.ts (camera-direction map)
supabase/functions/parse-brief/index.ts (none currently — no emit)
supabase/functions/polish-rhino-render/index.ts (PROJECT_TYPE_ENVIRONMENTS)
```

**Recommended approach when ready:** one pass per surface, replacing each legacy string with its canonical equivalent. Each surface is a self-contained change.

## Deferred from Task 13

### Manual UI verification on Eqvilent + US Cabinet Depot

Could not be performed inline (requires dev server + browser interaction). Please run:

1. Open Eqvilent project → Prompts → Generate hero. Network tab should show `composedPrompt.renderer` starting with `# SCENE` in the request body.
2. Rendered image: no Z1/Z2/Z3 labels, no "Sanctuary/Hearth/Retreat" wayfinding signs, sculptural form per visual language, brand wordmark + descriptor visible.
3. Generate all views — front/back/sides/details/interiors hold the hero's palette + materials.
4. Repeat on US Cabinet Depot.
5. SQL spot check:
   ```sql
   SELECT angle_id, prompt_artifacts->'compliance'
   FROM project_images
   WHERE project_id = '<id>'
   ORDER BY created_at DESC LIMIT 5;
   ```
   Hero row should have non-null `prompt_artifacts`.
