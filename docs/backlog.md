# Backlog

Designs we've talked through but haven't built yet. Each entry is a
"thinking-already-done" parking spot — pick one up, the scope is
worked out, just needs to be executed.

---

## Post-pitch flow: feedback → iterate → approve → production package

**Status:** designed, paused 2026-05-12

**Why we want this:** The platform today is brief-to-deck. Once the
pitch lands, feedback happens offline and the next round of creative
is built from memory. Approval is verbal. The handoff to 3D/CAD and
ops is ad-hoc. We want the platform to own the entire
brief → pitch → iterate → approve → production-package handoff —
project management itself stays in whatever the production team
already uses.

### Slice A — Review link + commenting (foundation)

Build first; every later step needs feedback to attach to.

- **Schema:**
  - `project_review_links` — shareable token, `is_active`,
    `expires_at`, optional `label`, `view_count`, `last_viewed_at`
  - `project_feedback` — anchor (`render` / `slide` / `zone` /
    `general`), `anchor_id`, optional pin coords (`pin_x` / `pin_y`,
    0-100 %), author (name + email + optional `author_user_id`),
    severity (`love` / `change` / `blocker`), category tags
    (free-form: `color`, `scale`, `materials`, `brand`, `hero`,
    `traffic`, `copy`), body, status (`open` / `addressed` /
    `dismissed`), `addressed_note`, `round_label`
  - RLS: owners CRUD their own. Public INSERT goes through edge
    function so we can validate the token before service-role write.

- **Edge functions (both `verify_jwt = false`):**
  - `resolve-pitch-link` — POST `{ token }` → returns project name,
    brand name, hero render URL, standard-view render URLs, deck
    snippets, existing comments. Increments `view_count`.
  - `submit-feedback` — POST `{ token, anchor_type, anchor_id,
    pin_x, pin_y, author_name, author_email, severity, category,
    body, round_label }` → validates token, inserts feedback.

- **Routes / UI:**
  - **Public** `/pitch/:token` — read-only pitch view. Hero render
    with click-to-add-pin overlay. Each pin opens a popover with
    severity radio + category chips + free text + author field
    (autosaved to localStorage). Comments list per artifact with
    severity icons.
  - **Agency** — in PromptGenerator:
    - "Share for review" button → dialog that generates / lists /
      revokes review links. Copy-to-clipboard, optional label /
      round name.
    - "Feedback inbox" panel listing comments grouped by anchor.
      Each row shows author + severity + body + age. Actions:
      mark addressed (with note) / dismiss. Filter by severity +
      open/addressed.

- **WIP migration sketch** I drafted then discarded — recreate when
  picking this up. Schema rationale lived in its header comment.

### Slice B — Apply feedback (AI-assisted iteration)

After slice A is live and has comments flowing in.

- New "Feedback" step in the project nav (between Prompts and Export).
- AI consumes the comment list grouped by anchor and proposes
  directive changes:
  - Color feedback → `material_id` binding edits + `featureDescription`
  - Scale / layout feedback → spatial geometry edits (suggested zone
    moves, hero expansion factor)
  - Hero feedback → updated `customPromptOverride` on hero
  - Brand feedback → updated brand intelligence entries
- User accepts / rejects / edits each suggestion, then clicks
  "Apply & regenerate" → spawns a new **Round** (R2, R3, …) with
  changes captured.
- Rounds are first-class objects. Previous round stays viewable as
  an immutable snapshot. Show R1 → R2 diff: "hero expanded 20%,
  lounge canopy added, materials updated."
- Edge function: `apply-feedback` — given a feedback ID list,
  returns proposed changes structured as `{ target: zone_id|hero|
  materials, op: 'override'|'replace'|'add', payload: {...} }`.

### Slice C — Approval gate

After iteration loop is solid.

- New project state: `Approved`. Transitions:
  `Draft → In Review → Revisions → Approved → Production Ready`
- "Approve this round" action captures approver name + email +
  timestamp + which round + optional signed PDF receipt.
- Locks the design: `production_snapshot` JSONB column on projects
  table = immutable copy of spatial geometry, materials catalog,
  features, prompts, render URLs, costs.
- Design surfaces become read-only with a banner:
  "Approved as of [date]. Unlock to make further changes (creates
  R-prime)."

### Slice D — Production package export

The handoff document. One button on an approved project.

- Generates a downloadable ZIP:
  - **Production Brief PDF** — cover page, approved renders,
    dimensioned floor plan, per-zone breakdown (function, structural
    form, dimensions, height, materials, intent), feature
    callouts, materials master list with quantities, brand
    application notes (colors with hex, fonts, logo placements),
    show compliance flags, approver signature receipt.
  - **Spatial data JSON** — full `BoothGeometry` + features +
    materials catalog. Downstream CAD operator imports as starting
    point.
  - **High-res render exports** — all angles at print resolution.
  - **Assets folder** — brand logos, reference images, material
    sample links.
- This IS the boundary. The platform doesn't track what happens
  next — that's Rhino / AutoCAD / vendor RFQ / Asana, wherever the
  production team already lives.

### Order of build

1. Slice A (review link + comments)
2. Slice B (apply feedback → rounds)
3. Slice C (approval)
4. Slice D (production package)

Each slice is 1-2 weeks of focused work. After Slice A ships the
team can already use the platform for client review — every step
after compounds.
