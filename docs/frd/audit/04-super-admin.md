I have everything needed. Here is the full audit.

---

# CANOPY — Super-Admin / Platform-Owner Surfaces
**Functional audit (read-only), repo `/Users/bryanscott/Desktop/Brief to Booth`**

**Role model (foundation for everything below)**
- Roles live in `public.user_roles` as `admin` (agency admin) and `super_admin` (platform owner). `src/hooks/useAdminRole.tsx` exposes `useIsAdmin()` (either role) and `useIsSuperAdmin()` (super_admin only), both cached 5 min.
- Server-side guard is `public.is_super_admin(_user_id)` (SECURITY DEFINER, `supabase/migrations/20260423155547_*.sql`), used by every platform RPC via `public._require_super_admin()`.
- There is **no impersonation/act-as mechanism**. "Preview mode" is a client-only boolean (see §7).

---

### 1. `/admin` — Platform Admin (super-admin branch of AdminSettings)
`src/pages/AdminSettings.tsx`

**Route & access** — `/admin`, wrapped in `ProtectedRoute` (auth + onboarding + access gate only). **No role guard on the page itself.** The component branches on `isPlatformView = isSuperAdmin && !previewMode`; any authenticated non-admin who navigates to `/admin` gets the full **Agency Settings** surface (the else-branch), not a redirect.

**Intent** — Give the platform owner a single console for platform-wide accounts and the shared defaults every agency inherits, explicitly excluding agency-scoped data (the comment at lines 55–59 states agency data is reachable only via Preview Mode).

**UI anatomy** — `PageHeader` (amber Crown, eyebrow "Platform · Accounts & defaults") + a 6-tab `Tabs`:

| Tab | Component | Function |
|---|---|---|
| **All Accounts** (`accounts`) | `UserAccountsManager` | Every user on the platform; role grants; platform invite ledger |
| **Activation Types** | `ActivationTypeManager` | CRUD on activation/project types (built-ins + custom) |
| **Venues & Shows** | `VenueIntelligenceManager` | Show/venue intelligence records (design tips, traffic, union labor, booth sizes) |
| **Image Models** | `PlatformImageModelManager` | Per-agency image-generation model routing — the only place provider IDs are exposed |
| **AI Usage** | `AiUsageManager` | Fleet cost/usage: date-range chips, 6 fleet stats, agency leaderboard, cross-agency user leaderboard, feature × model breakdown |
| **Invites & Team** | `TeamManager` | Invite/manage team members |

The agency branch (same route, non-super-admin or preview mode) shows a different 5-tab set: Project Types, Clients & Brand Intelligence, Agency Knowledge Base, KB Health, Team.

**Inputs**
- `useIsSuperAdmin()` → `user_roles`.
- `usePlatformOwner()` → `previewMode`.
- **All Accounts**: `useAdminProfiles()` → RPC `get_all_user_profiles()` (returns `user_id, email, display_name, avatar_url, is_admin, is_super_admin, created_at`; the SQL `WHERE` clause self-gates to admin *or* super_admin) + a full `projects` select grouped client-side by `user_id`; `useAiUsageByUser(30d)` for inline spend; `usePlatformInvites()` → `platform_invites` table.
- **Image Models**: `agencies.image_model` column + `src/lib/imageModels.ts` registry.
- **AI Usage**: RPCs from `20260507214400_*.sql` (`_from`/`_to`, columns `calls / total_tokens / cost_usd`).

**Workflows (All Accounts tab)**
1. **Search** — client-side filter over email / display name / user_id / project titles.
2. **Stat cards** — Total accounts, Total projects, Agency Admins, Platform Owners.
3. **Row click** → `navigate('/account/:userId')` (see §5).
4. **Make/Remove Agency Admin** (hover button, shown only when `currentUserIsSuperAdmin && !isSelf && !profile.is_super_admin`) → `useManageAdminRole()` → `supabase.functions.invoke("admin-manage-role", { target_user_id, action: "grant_admin"|"revoke_admin" })` with bearer token. The edge function (`supabase/functions/admin-manage-role/index.ts`) re-checks caller roles with a service-role client, upserts/deletes `user_roles`, blocks `revoke_super_admin` on self, and requires `super_admin` for the two super-admin actions.
5. **Invite User** dialog → role select (`member` / `admin` / `super_admin` — the last only rendered when `isSuperAdmin`) → `useInviteUser()` → edge function `admin-invite-user`: checks existing auth users, either records an already-accepted `platform_invites` row + upserts `profiles`, or calls `auth.admin.inviteUserByEmail(email, { data: { invited_role: role }, redirectTo: origin + "/auth" })`, inserts a `platform_invites` row, and pre-creates the profile.
6. **Invitations sub-tab** — lists `platform_invites` with derived state Accepted / Expired (`expires_at < now`) / Pending. Read-only: no resend, no revoke.

**Outputs & side effects** — writes to `user_roles`, `platform_invites`, `profiles`; Supabase Auth invite email; navigation to `/account/:userId`. Query invalidation on `admin-all-profiles`, `is-admin`, `is-super-admin`, `admin-platform-invites`.

**Current-state gaps**
- **Blank first paint for super admins.** `useState(isPlatformView ? "accounts" : "project-types")` is evaluated on the first render, when `useIsSuperAdmin()` data is still `undefined`. The tab state initializes to `"project-types"`, which matches no trigger in the platform `TabsList` — a super admin landing on `/admin` sees the platform tab bar with **no tab selected and an empty body** until they click one.
- **No feature-flag tab exists at `/admin`.** Feature flags are per-agency only, inside `/admin/agencies` (§2). There is no platform-wide flag surface.
- **`admin-invite-user` cannot be called by a pure super admin.** It gates on `.eq("role", "admin").maybeSingle()` — a user holding only `super_admin` gets 403. Contrast with `admin-manage-role`, which accepts either role.
- **The `super_admin` option in the invite dialog does nothing.** `admin-invite-user` only records `role` in `platform_invites` and stuffs `invited_role` into auth metadata; **no code path reads `invited_role`** to grant the role. Super-admin granting only actually works via `/admin/super-admins` (`pending_invites` + `accept_pending_invite`) or the `grant_super_admin` action (which no UI calls).
- **"Venues & Shows" is not platform-scoped.** `useVenueIntelligence()` filters on `user_id` — the tab shows only the signed-in super admin's own venue rows, not a platform corpus.
- **"Invites & Team" is not platform-scoped either.** `TeamManager` uses `useTeamMembers()` from `src/hooks/useTeam.tsx`, which reads the legacy `team_members` table filtered by `team_owner_id.eq.<me> OR user_id.eq.<me>` — a personal team list, and it's the *same* component rendered in the agency branch. Its invite flow also inserts a placeholder `user_id = owner id` "until the invite is accepted" (comment at `useTeam.tsx:70-73`).
- **No revoke/resend on `platform_invites`**, and no cross-check between `platform_invites` (legacy) and `pending_invites` (current) — two parallel invite systems.

---

### 2. `/admin/agencies` — Agency lifecycle console
`src/pages/AdminAgencies.tsx` (893 lines) · `src/hooks/useAccessControl.tsx` · `supabase/migrations/20260427120000_agency_access_control.sql`

**Route & access** — `/admin/agencies`. Guarded in-component: `useIsSuperAdmin()` → spinner while loading, `<Navigate to="/projects" replace />` if not super admin. Server side, every RPC calls `_require_super_admin()`.

**Intent** — The commercial control plane: see every agency's health at a glance and suspend, disable, trial-window, feature-flag, quota, re-industry, and annotate any of them, with a full audit trail.

**UI anatomy**
- Header (Crown, "Platform · N agencies") + search box (name / slug / owner email).
- **5 summary tiles**: Total, Active, Trial, Suspended (counts `suspended` **+** `trial_expired`), Disabled.
- **Agency list** — one row per agency: building icon, name, `StatusPill`, slug, owner email, "N members · N projects", inline 30-day AI spend (hidden when `$0`, `lg:` breakpoint only), "Active <relative time>", gear icon. Row click opens the drawer.
- **Detail drawer** (`Sheet`, `sm:max-w-xl`) with 5 tabs: **Status · Industries · Features · Quotas · Log**.

**Inputs**
- `useAdminAgencies()` → RPC `list_agencies_for_admin()`: id, name, slug, owner_user_id, owner_email (joined from `auth.users`), `access_status`, `effective_status` (via `agency_effective_status()` which flips `trial`→`trial_expired` past `trial_ends_at`), trial_ends_at, suspension_reason, suspended_at, feature_flags, quotas, admin_notes, member/client/project counts, `last_activity_at` = `GREATEST(agencies.updated_at, MAX(projects.updated_at))`. Ordered by last activity desc. `staleTime` 30 s.
- `useAgencyAccessLog(agencyId, 50)` → RPC `get_agency_access_log()` (readable by super admins **or** the owning agency's owner).
- `useAiUsageByAgency(rangeFromPreset("30d"))`, indexed by agency id; fails silently.
- Industries tab: direct `agencies.select("primary_industry, industries")` + `useIndustries()` (`industries` table).

**Workflows** — each button → `wrapAction(label, mutation)` → toast on success/failure; all RPCs `SECURITY DEFINER`, all log to `agency_access_log`.

| Action | RPC + payload | DB effect |
|---|---|---|
| **Suspend** (disabled if already suspended/disabled) | `suspend_agency(_agency_id, _reason)` | `access_status='suspended'`, `suspension_reason`, `suspended_at=now()`, `suspended_by=auth.uid()`; log `suspended` |
| **Disable** (behind an `AlertDialog` confirm) | `disable_agency(_agency_id, _reason)` | `access_status='disabled'`, same suspension fields; log `disabled` |
| **Reactivate** (disabled when already active) | `reactivate_agency(_agency_id)` | `access_status='active'`, clears reason/suspended_at/suspended_by; log `reactivated` |
| **Set trial** (`<input type="date">`) | `set_agency_trial(_agency_id, _ends_at)` — client sends `new Date(yyyy-mm-dd).toISOString()`, or `null` for open-ended | `access_status='trial'`, `trial_ends_at`, clears suspension fields; log `trial_set` with metadata |
| **Save feature flags** (JSON textarea, parse-validated) | `update_agency_feature_flags(_agency_id, _flags)` | replaces `agencies.feature_flags` wholesale; log `feature_flags_updated` |
| **Quick toggles** (Switches for `generate`, `export`, `rag`, `image_polish`, `video`; `checked` = `flags[flag] !== false`, i.e. absent ⇒ on) | same RPC with `{...existing, [flag]: v}` | immediate write, own toast |
| **Save quotas** (JSON textarea; hint `{max_seats, max_projects, ai_compute_monthly}`) | `update_agency_quotas(_agency_id, _quotas)` | replaces `agencies.quotas`; log `quotas_updated` |
| **Save notes** ("private to super admins") | `update_agency_admin_notes(_agency_id, _notes)` | sets `agencies.admin_notes`; **no log entry written** |
| **Save industries** (primary radio-grid + multi-select chips; primary auto-included and locked in the chip list; Save disabled unless dirty) | `admin_set_agency_industries(_agency_id, _primary_industry, _industries)` | admin escape hatch — agencies cannot change their own industries (locked at trigger level per `20260427233000_lock_industry_isolation.sql`); invalidates `activation-types` |

**Status tab also shows** three read-only count tiles (Members / Clients / Projects) and the "Suspension reason (visible to the agency)" textarea, which is the *input* consumed by both suspend and disable.

**Log tab** — append-only feed: humanized `action`, relative time, `performer_email`, quoted `reason`. `before_state`/`after_state` snapshots are stored by the RPCs but **not rendered**.

**Outputs & side effects** — writes to `agencies` (status/trial/flags/quotas/notes/industries) and `agency_access_log`; invalidates `["admin","agencies"]`, `["agency"]`, `["admin","agency-access-log",id]`, `["activation-types"]`. No navigation.

**Current-state gaps**
- The `useMemo` at line 150 is used as a side-effecting reset (`setReason`/`setTrialEndsAt`/… inside a memo keyed on `agency?.id`) — a `useEffect` pattern shoehorned into `useMemo`.
- **Trial date is timezone-lossy**: `new Date("2026-08-12")` parses as UTC midnight, so the effective expiry can land a day early for users west of UTC.
- **No "clear trial" affordance** — leaving the date blank and clicking "Set trial" sends `null` which the RPC treats as open-ended trial, but the button is also the only way to *enter* trial state; there's no way to go trial → active except "Reactivate".
- **Feature flags are written but never read anywhere in the app.** Grep shows no consumer of `agencies.feature_flags` outside this admin screen — the quick toggles are currently inert with respect to product behavior.
- **Quotas are likewise never enforced.** No reader of `agencies.quotas` exists in `src/`.
- `update_agency_admin_notes` doesn't write an audit entry, unlike every sibling RPC.
- Industries picker depends on `useIndustries()` which has **no fallback** to `BUILTIN_INDUSTRIES` — if the `industries` table is missing, the tab renders an empty picker and Save is unreachable (whereas `/admin/industries` does fall back).
- The summary tile labeled "Suspended" silently folds in `trial_expired`, so the numbers don't reconcile with the status pills in the list.

---

### 3. `/admin/industries` + `/admin/industries/:slug` + built-in registry

#### 3a. `/admin/industries` — Industry list
`src/pages/AdminIndustries.tsx` · `src/hooks/useAdminIndustries.tsx`

**Route & access** — `/admin/industries`; in-component `useIsSuperAdmin()` guard → `<Navigate to="/projects" />`.

**Intent** — Manage the verticals Canopy serves. An industry is the top-level taxonomy that determines an agency's vocabulary, which activation/project types they see, which brief sections render, and which global KB documents enter RAG.

**UI anatomy** — Header (Crown, search, "New industry"); optional **`SchemaSetupBanner`**; 4 summary tiles (Industries, Built-in, Custom, Total project types); "All industries" card listing rows.

**Row anatomy** — gradient icon (from `ICON_MAP`: Sparkles/Building2/TreePine/Film/Sofa/Speaker/Layers), label, "Built-in" star badge, slug, "N <vocabulary.project_types>", "N agencies (M primary)", "N KB docs" — the whole block is a `<Link>` to the detail page — plus a trash icon opening a delete `AlertDialog`.

**Inputs** — `useAdminIndustries()` returns `{ rows, isSchemaReady }` with a three-stage fallback:
1. RPC `list_industries_for_admin()` (single round-trip incl. `project_type_count`, `agency_count`, `primary_agency_count`, `knowledge_doc_count`) → `isSchemaReady: true`.
2. Direct `industries` table select; missing-table error (regex on "could not find the table / does not exist / undefined_table / relation … does not exist") → constants + `isSchemaReady: false`.
3. Table exists but empty, or exists without the RPC → constants / synthesized rows with **zero counts**, `isSchemaReady: true`.

**Workflows**
1. **Auto-seed on first super-admin visit** — a `useEffect` guarded by `ensuredRef`, `isSuper`, `!isLoading`, `isSchemaReady`, and "no real rows yet" upserts all `BUILTIN_INDUSTRIES` into `industries` (`onConflict: "slug", ignoreDuplicates: true`), then invalidates `["admin","industries"]` and `["industries"]`. Failures are `console.warn`-only.
2. **New industry** dialog — slug (auto-slugified to `[a-z0-9_]`), label, description, vocabulary JSON (pre-filled with the 4 project keys) → `useCreateIndustry()` → RPC `admin_create_industry(_slug, _label, _description, _icon, _vocabulary, _sort_order=100)` → success toast, then **`window.location.href = /admin/industries/<slug>`** (full page reload, not a router navigate).
3. **Delete** — `AlertDialog` warns with the live agency count when `agency_count > 0`, then calls `useDeleteIndustry({ slug, force: true })` → RPC `admin_delete_industry(_slug, _force)`.
4. **Schema setup banner** — Copy setup SQL (from `src/lib/industriesSetupSql.ts`) to clipboard, Show/Hide SQL, deep link to the Supabase SQL editor.

**Outputs & side effects** — writes to `industries` (upsert/create/delete); invalidates `admin/industries`, `industries`, `activation-types`.

**Current-state gaps**
- **The auto-seed is dead in the exact case it exists for.** `BUILTIN_PLACEHOLDER_UUIDS` (`useAdminIndustries.tsx:17-23`) has only 5 entries and **omits `interior_design`**, so that fallback row gets id `00000000-0000-0000-0000-000000000000`. The guard `industries.some(i => !i.id.startsWith("00000000-0000-4000-8000"))` therefore evaluates `true` on the constants-fallback set and returns early — the upsert never runs when the table is empty.
- The registry has **6** industries but the code comments, the banner copy ("the 5 verticals below"), and the placeholder map all say 5.
- **Delete always passes `force: true`**, so the `_force` parameter is never exercised as a safety valve; the confirm dialog is the only guard against detaching live agencies. Built-in industries are deletable with no extra friction.
- Create dialog exposes no `icon` or `sort_order` field despite the RPC accepting both (sort_order silently defaults to 100).
- Post-create uses `window.location.href`, discarding the SPA state and all react-query cache.

#### 3b. `/admin/industries/:slug` — Industry dashboard
`src/pages/AdminIndustryDashboard.tsx`

**Route & access** — `/admin/industries/:slug`; super-admin guard; "Industry not found" card when the slug isn't in the list.

**Intent** — Configure everything an industry contributes platform-wide: identity/ordering, which activation types belong to it, its globally-curated knowledge corpus, and its vocabulary swaps.

**UI anatomy** — Back link → PageHeader (icon, label, "Built-in" chip, description) → 4 stat tiles (`<vocab.project_types>` count, Total agencies, As primary, KB documents) → 4 tabs.

| Tab | Contents | Writes |
|---|---|---|
| **Overview** | Label, Sort order (number), Description, Icon (free-text Lucide name; falls back to `Layers`). Save disabled unless dirty. | `admin_update_industry(_slug, _label, _description, _icon, _vocabulary=null, _sort_order)` |
| **Project Types** | List of activation types tagged to this industry (label, Built-in badge, slug, category, "also in: …"); `X` to untag. "Add existing" toggles a searchable picker of all untagged types; clicking one tags it. | `admin_set_activation_type_industries(_activation_type_id, _industries)` — the client computes the new array (union to add, filter to remove) |
| **Knowledge** | `<KnowledgeBasePanel scope="industry" scopeId={industry.id} />` — "Global, super-admin curated knowledge. Every agency working in this industry sees these documents in their RAG retrieval." | `knowledge_documents` with `scope='industry'`, `agency_id IS NULL`; storage path `industry/<id>/<ts>_<file>` in the `knowledge-documents` bucket |
| **Vocabulary** | JSON textarea + a reference card of the 9 recognized keys (`project_type`, `project_types`, `project`, `projects`, `deliverable`, `render`, `spatial_plan`, `brief`, `client`) with per-key hints. | `admin_update_industry(_slug, _vocabulary)` |

**Inputs** — `useAdminIndustries()` (finds by slug), `useActivationTypesByIndustry(slug)` → RPC `list_activation_types_by_industry`, `useAllActivationTypes()` → direct `activation_types` select ordered builtin-first/category/label, `useKnowledgeDocuments({scope:"industry", scopeId})`.

**Current-state gaps**
- **`ICON_MAP` here omits `Sofa`** (present in `AdminIndustries.tsx`), so Interior Design renders the generic `Layers` icon on its own detail page but the correct sofa icon in the list.
- **KB uploads can attach to a fake industry id.** When the schema isn't ready, `industry.id` is a placeholder UUID (or all-zeros for `interior_design`), and the Knowledge tab still renders and accepts uploads against it.
- Project Types tab can only *cross-tag existing* types; the empty state directs the user to "the agency-side Activation Types page" to create new ones — there's no create affordance here.
- No delete/rename of the industry from its own dashboard (only from the list row).

#### 3c. Built-in industries registry
`src/lib/builtinIndustries.ts` (+ `src/lib/industryFields.ts`, tested by `builtinIndustries.test.ts`)

Six canonical verticals shipped as a TS constant so the platform never depends on migration timing: **experiential** (Experiential & Trade Show, sort 10), **architecture** (20), **landscape** (30), **interior_design** (35), **entertainment** (40), **audio_visual** (50).

Each entry declares four things that shape product behavior:
1. **`vocabulary`** — the 9-key term swap (e.g. experiential renders "Activation / Activations / Booth render / Floor plan"; audio_visual renders "Install / Installs / Equipment list & layout / Scope of work"). Resolved at runtime by `useVocabulary()` from the agency's `primary_industry`, defaulting to experiential.
2. **`briefSections`** — which `BriefSectionId`s appear in Brief Review for the vertical (e.g. `existing-space` only for architecture/interior_design; `hero-installation`/`hanging-elements` only for experiential/entertainment; `furniture-inventory` only for interior_design).
3. **`inputMode`** — `spatial-canvas` | `existing-space-photo` | `hybrid`; drives which Spatial-step UI mounts at project creation.
4. **`defaultRenderAngles`** — seeds the Prompts step's view list (`hero_34`, `front`, `iso`, `wide_shot`, `before_after`, …).

Note `briefSections`, `inputMode`, and `defaultRenderAngles` **exist only in the TS constant** — they are not columns on `industries`, not exposed in the admin dashboard, and not editable for custom industries. A super admin who creates a new industry via the UI gets vocabulary only; the brief schema, input mode, and render angles fall to whatever the code defaults are.

**Related public surface** — `/industries/:slug` (`src/pages/IndustryDetail.tsx`) is the public marketing deep-dive, reading the live `industries` table with a `BUILTIN_INDUSTRIES` fallback for anonymous visitors. Its `HERO_BY_SLUG` map has **5 images and omits `interior_design`**, so that vertical's landing page renders without a hero.

---

### 4. `/admin/super-admins` — Super Admin roster
`src/pages/SuperAdmins.tsx` · `src/hooks/useSuperAdmins.tsx`

**Route & access** — `/admin/super-admins`; spinner while `useIsSuperAdmin()` resolves, then `<Navigate to="/projects" replace />` for non-super-admins.

**Intent** — Grant and revoke platform-level administrator access, which confers visibility into (and RLS bypass over) every agency.

**UI anatomy** — Header (Crown, "Platform · N accounts", "Invite super admin" button) → **Active** card (list of current super admins) → **Pending invites** card (dashed-border rows) → an amber warning card: "Super admins can view and impersonate any agency. Grant this role with care." → invite `Dialog` (single email field).

**Inputs**
- `useSuperAdmins()` → RPC `list_super_admins()` (`user_id`, `email` from `profiles`, `created_at`; self-gated by `AND public.is_super_admin()` in the SQL, ordered oldest-first).
- `useSuperAdminInvites()` → `pending_invites` where `invite_type='super_admin' AND status='pending'`, newest first.

**Workflows**
1. **Invite** — `useInviteSuperAdmin(email)` lowercases/trims, validates `includes("@")`, inserts `pending_invites { email, invite_type:'super_admin', invited_by: me, agency_id: null, role: null }`. RLS (`agency_admins_can_invite_members`) permits `invite_type='super_admin'` only for super admins. Toast: "*<email>* will become a super admin on sign-up."
2. **Cancel invite** — hard `DELETE` from `pending_invites` by id; no confirmation.
3. **Revoke** — `window.confirm` with two variants (self: "Revoke YOUR own super admin access?…"; other: "Revoke super admin access for *<email>*?"), then RPC `revoke_super_admin(_target_user_id)` which re-checks `is_super_admin()` and deletes the `user_roles` row.

**Safeguards observed**
- Server: `list_super_admins` and `revoke_super_admin` both self-gate on `is_super_admin()`; RLS gates `pending_invites` inserts.
- Client: revoke button `disabled` when `admins.length === 1`, with tooltip "Cannot revoke the last super admin"; self-revoke gets a distinct scarier confirm; a "You" badge marks your own row.

**Outputs & side effects** — writes/deletes `pending_invites`, deletes `user_roles` rows; invalidates `super-admins` / `super-admin-invites`. No navigation, no sign-out of the revoked user.

**Current-state gaps**
- **The last-super-admin protection is client-only.** `revoke_super_admin()` has no `COUNT(*) > 1` check — a direct RPC call (or two concurrent revokes) can empty the roster and permanently lock the platform out of every super-admin surface. Compare `admin-manage-role`, which at least blocks self-revocation server-side; this path allows it.
- **The invite copy is aspirational.** "Users become super admins automatically when they sign up with these emails" is not implemented: there is no `apply_pending_invites` trigger in `supabase/migrations/` (it is only *mentioned* in a comment in `20260427150000_mandatory_agency_onboarding.sql:8`). The role is granted only when the invitee reaches `/onboarding/create-agency`, which calls `useMyPendingInvites()`/`useAcceptInvite()` → `accept_pending_invite()`. A super-admin invitee who already belongs to an agency never hits that page and never gets the role.
- **No email is sent.** The row is inserted directly from the browser; nothing notifies the invitee.
- Pending invites show no `expires_at` (14-day default) and there is no resend; expired invites remain in the "pending" list until the `status` filter excludes them (nothing sets `status='expired'`).
- No audit trail for grant/revoke of super admin (unlike agency actions, which log to `agency_access_log`).

---

### 5. `/account/:userId` — User account drill-in
`src/pages/AgencyAccount.tsx`

**Route & access** — `/account/:userId` under `ProtectedRoute`. **No role guard in the component** — access control is entirely delegated to `get_all_user_profiles()`, whose `WHERE` clause returns zero rows for non-admins, causing the page to throw "User not found" and render the "Account not found." state.

**Intent** — Give the platform owner a single-user dossier: who they are, what role they hold, which agency they own, their roster, their project activity, and (eventually) their plan.

**UI anatomy**
1. "Back to Accounts" ghost button → `navigate("/admin")`.
2. **Header** — 14×14 avatar (amber+Crown for super admin, primary for admin, muted otherwise), display name, **role badge** computed as: `is_super_admin` → "Platform Owner" · owns an agency → "Agency Owner" · `is_admin` → "Agency Admin" · else "Member"; email + "Joined <Month Year>"; owned-agency line with slug badge. Right-aligned **"Preview as Agency Admin"** button.
3. **4 StatCards** — Projects (sub: N complete), Team Members (sub: "<agency> roster" or "No agency"), Last Active (relative to newest project `updated_at`), Member Since.
4. **Subscription card** — 5 pills (Free / Starter / Professional / Agency / Enterprise) + "Billing integration coming soon".
5. **Team Roster card** — per member: initials avatar, email (or `User …<last6>`), "Account owner for <agency>" sub-line, role badge (`owner` when `is_primary_owner`, else `member.role`), a hardcoded green "Active".
6. **Recent Projects card** — first 8 projects: name, status pill (draft/reviewed/generating/complete color map), activation/project type, `updated_at` date.

**Inputs** — one composite `useQuery(["agency-account", userId])`:
- RPC `get_all_user_profiles()`, then `.find(p => p.user_id === userId)` client-side.
- `projects` where `user_id = :userId`, ordered `updated_at` desc.
- `agencies` where `owner_user_id = :userId`, `limit 1` — i.e. **only agencies this user owns**.
- If an owned agency exists: RPC `list_agency_members(_agency_id)` → `user_id, email, role, joined_at, is_primary_owner`.

**Workflows** — exactly one mutation-free action: **Preview as Agency Admin** → `setPreviewMode(true)` → `navigate("/projects")` → sonner toast "Preview mode active — browsing as Agency Admin / Your navigation has switched to agency view. Use the banner to exit."

**Outputs & side effects** — no DB writes at all. Navigation to `/admin` or `/projects`; mutation of the in-memory `previewMode` flag.

**Current-state gaps**
- **The subscription tier selector is a decorative stub.** The five pills are `<button>`s with no `onClick`; the "selected" state is hardcoded (`tier.id === "free"`) with the comment "For now default to 'free' — this will be wired to real billing later". There is no subscription column being read or written.
- **No access-status surface.** Suspension state, trial window, feature flags, and quotas of the user's agency are not shown here even though the drill-in is the natural place for them — you must cross-reference `/admin/agencies`.
- **"Owned agencies" is singular and owner-only.** `limit(1)` on `owner_user_id`; a user who is an *admin* or *member* of an agency (rather than owner) shows "No agency" and an empty roster, and multi-agency owners show only one.
- **No role controls.** Grant/revoke admin exists only on the list row in `UserAccountsManager`, not on the detail page.
- "Active" on every roster member is a literal string, not a computed status.
- The Preview button does **not** bind to this user's agency (see §7) — despite the toast implying you're now browsing as them.
- `is_admin` from the RPC is a global `user_roles` fact, while `agency_members.role` is the per-agency fact; the badge mixes the two vocabularies ("Agency Admin" derived from a platform-level role row).

---

### 6. Platform invites (`/platform-invites`)

**Route & access** — **The route does not exist.** `src/App.tsx` defines no `/platform-invites` path; it falls through to `<Route path="*" element={<NotFound />} />`.

**The dead link** — `src/components/layout/AppSidebar.tsx:57` lists it in `platformOwnerNavItems`:
```ts
{ path: "/platform-invites", label: "Invites", icon: Mail },
```
So every super admin sees an **"Invites" item in the platform sidebar that renders the 404 page**. This is the only broken entry in either nav set — the other four (`/admin`, `/admin/agencies`, `/admin/industries`, `/admin/super-admins`) all resolve.

**What the surface would have shown** — the data layer is fully built and is currently reachable only as a sub-tab inside `/admin` → All Accounts → **Invitations**:
- `usePlatformInvites()` (`useAdminRole.tsx:160`) → `platform_invites` table, ordered `created_at` desc, enabled when `useIsAdmin()`.
- `InvitesTab` in `UserAccountsManager.tsx` renders the list with Accepted / Expired / Pending derivation and a "New Invite" button.

**Invite tables & functions — there are two parallel systems**

| | `platform_invites` | `pending_invites` |
|---|---|---|
| Created in | `20260322000633_*.sql` | `20260423155547_*.sql` |
| Columns | `id, email, role, invited_by, accepted_at, expires_at (default now()+7d), created_at` | `id, email, invite_type ('agency_member'\|'super_admin'), agency_id, role, invited_by, status ('pending'\|'accepted'\|'revoked'\|'expired'), created_at, accepted_at, expires_at (default now()+14d)` |
| RLS | "Admins can manage platform invites" — `FOR ALL` to `has_role(admin)` OR `has_role(super_admin)` (widened in `20260323193024_*.sql`) | Per-operation policies; `agency_admins_can_invite_members` (INSERT) additionally requires `agency_has_access(agency_id)` so suspended agencies can't invite |
| Written by | edge function `admin-invite-user` (service role) | client inserts from `useSuperAdmins` / `useAgencyTeam` |
| Consumed by | `usePlatformInvites()` — display only | RPCs `my_pending_invites()`, `accept_pending_invite(_invite_id)` (grants `agency_members` row or `user_roles.super_admin`) |

**Edge functions**
- `supabase/functions/admin-invite-user/index.ts` — auth-header required → `auth.getUser()` → role check (`role='admin'` only, see gap in §1) → dedupe against `auth.admin.listUsers()` → either record already-accepted invite + upsert profile, or `auth.admin.inviteUserByEmail(email, { data: { invited_role }, redirectTo: <origin>/auth })` + insert `platform_invites` + pre-create profile. Returns `{ message, user_id }`.
- `supabase/functions/admin-manage-role/index.ts` — the four role actions (§1 workflow 4).
- There is **no** dedicated invite-acceptance edge function; acceptance is the `accept_pending_invite` RPC.

**Current-state gaps**
- Dead sidebar link → 404 (above).
- Two invite tables with no reconciliation, different expiry defaults (7d vs 14d), different lifecycle vocabularies (`accepted_at` nullable vs a `status` enum), and only one of them (`pending_invites`) actually grants anything.
- Nothing ever transitions a `pending_invites` row to `status='expired'`; expiry is enforced only by the `expires_at > now()` predicate inside `my_pending_invites()`/`accept_pending_invite()`.
- `platform_invites` has no revoke/resend UI, and its `accepted_at` is set eagerly to `now()` for pre-existing users (so the ledger reads "Accepted" for people who were never actually invited).
- `AcceptInvite.tsx` at `/invite/:token` is an unrelated **project-level** invite flow (`useAcceptInvite` from `useTeam.tsx`, `project_invites.token`), branded "BriefEngine" rather than Canopy — not connected to either platform invite table.

---

### 7. Preview-as-agency mode
`src/contexts/PlatformOwnerContext.tsx` (24 lines) · `AppSidebar.tsx` · `AdminSettings.tsx` · `AgencyAccount.tsx`

**Route & access** — Not a route. A React context boolean provided app-wide in `App.tsx` (`<PlatformOwnerProvider>` wraps the router).

**Intent** — Let a platform owner flip their own shell from the platform console into the agency-operator experience, to see what agency users see.

**Mechanics — the entire implementation**
```ts
const [previewMode, setPreviewMode] = useState(false);
```
There is no agency id, no target user, no session storage, no server call, no JWT change. Only three files consume it:
1. `AppSidebar.tsx` — `showPlatformNav = isSuperAdmin && !previewMode` chooses `platformOwnerNavItems` vs `agencyNavItems`; swaps the Crown logo for the Canopy mark; drops the "Platform Admin" eyebrow; changes the workspace caption from "Platform" to `agency?.name`; adds an "Admin Settings" item when `isSuperAdmin && previewMode`.
2. `AdminSettings.tsx` — `isPlatformView = isSuperAdmin && !previewMode` selects the 6-tab platform surface vs the 5-tab agency surface.
3. `AgencyAccount.tsx` — the "Preview as Agency Admin" button sets it to `true`.

**Entering** — two affordances, both `setPreviewMode(true); navigate("/projects")`:
- Sidebar footer button "Preview as Agency Admin" (dashed-border, expanded; eye icon with tooltip, collapsed) — rendered only when `isSuperAdmin && !previewMode`.
- `/account/:userId` header button (adds the 5-second sonner toast).

**Exiting** — `setPreviewMode(false); navigate("/admin")` from either the amber "Preview Mode" banner's "Exit" link (expanded sidebar) or the amber eye button with tooltip "Exit Preview Mode" (collapsed sidebar). Both live in `SidebarContent`, so they're only present on `AppLayout` pages.

**What is read-only vs writable in preview** — **Nothing is read-only.** The sidebar banner reads "Read-only agency view", but no query, mutation, RLS policy, or component consults `previewMode`. A super admin in preview mode retains full `is_super_admin()` RLS bypass on `clients`, `projects`, `knowledge_documents`, `agency_members`, and every other gated table, and every Create/Edit/Delete control in the agency surfaces is live.

**Current-state gaps**
- **The label is factually wrong**: "Read-only agency view" describes an enforcement that does not exist anywhere in the codebase.
- **Preview is not scoped to any agency.** Because `useAgency()` resolves the *current user's own* highest-role `agency_members` row, entering preview from `/account/:userId` shows the super admin's own agency (or nothing if they have no membership) — not the account they drilled into. The toast "browsing as Agency Admin" and the `/account/:userId` placement both imply a per-account impersonation that isn't implemented.
- **State is not persisted.** A refresh, a hard navigation (`window.location.href`, used by the industry create flow), or a new tab silently drops preview mode and snaps the shell back to the platform nav.
- **Exit is unreachable outside `AppLayout`.** Any page not wrapped in `AppLayout` (e.g. `/access-suspended`, `/onboarding/*`, `/pricing` sub-flows without the shell) has no sidebar and therefore no exit affordance; the only recovery is navigating back to a shell page.
- A super admin with **no** agency membership entering preview mode sees an agency nav pointed at empty data, with the workspace caption falling back to "Workspace".
- `ProtectedRoute`'s onboarding gate exempts super admins unconditionally (`!isSuperAdmin`), so preview mode never triggers the onboarding redirect — but it also means a super admin can't preview the onboarding experience.

---

### 8. Suspension / disable enforcement path

**Admin action → DB state** (from §2): `suspend_agency` / `disable_agency` / `set_agency_trial` write `agencies.access_status` ∈ `{active, trial, suspended, disabled}` plus `trial_ends_at`, `suspension_reason`, `suspended_at`, `suspended_by`, and append to `agency_access_log`.

**Server-side enforcement (authoritative)** — `public.agency_has_access(_agency_id)` returns true only when `access_status IN ('active','trial') AND (trial_ends_at IS NULL OR trial_ends_at > now())`. It is embedded in the `FOR ALL` RLS policies (both `USING` and `WITH CHECK`) on:
- `public.clients` — `agency_members_can_write_clients`
- `public.projects` — `agency_members_can_write_projects`
- `public.knowledge_documents` — `agency_members_can_write_knowledge_documents`
- `public.pending_invites` (INSERT) — so a suspended agency cannot invite new members

Each policy short-circuits on `is_super_admin(auth.uid())` first, so platform owners always bypass.

**Client-side derivation** — `deriveAccessState()` in `src/hooks/useAgency.tsx` reads `agencies.access_status` + `trial_ends_at` off the embedded agency row from `agency_members` and computes:
- `effectiveStatus` — flips `trial` → `trial_expired` once `trial_ends_at <= Date.now()`
- `canWrite` = active, or unexpired trial
- `isLockedOut` = `disabled` **or** `trial_expired`
- `isRestricted` = anything other than `active`
- `suspensionReason`, `trialEndsAt`, `trialDaysRemaining` (`Math.ceil` of ms/day)

**What the suspended user experiences**

| Effective status | Route gate (`ProtectedRoute`) | Banner (`SuspensionBanner`, top of every `AppLayout` page) | Writes |
|---|---|---|---|
| `active` | pass | none | allowed |
| `trial` (>14 days left) | pass | none | allowed |
| `trial` (≤14 days) | pass | amber "Trial: N days remaining / Convert to a paid plan…" + CheckCircle icon | allowed |
| `suspended` | **pass** — `isLockedOut` is false | red "Your access is currently suspended." + the admin-authored `suspension_reason` + "Details" link → `/access-suspended` | **blocked by RLS** (writes fail with a policy error) |
| `trial_expired` | **redirect** → `/access-suspended` | amber "Your trial has ended." | blocked |
| `disabled` | **redirect** → `/access-suspended` | red "Your access has been disabled." | blocked |

`ProtectedRoute` skips the gate entirely for super admins and for the `/access-suspended` path itself (and `enforceAccessGate={false}` is set on `/access-suspended` and `/onboarding/create-agency` to prevent redirect loops).

**`/access-suspended` landing** (`src/pages/AccessSuspended.tsx`) — bounces back to `/projects` via `window.location.href` if access is no longer restricted. Otherwise renders: Canopy logo, status icon (Lock/AlertTriangle/Clock), title ("Account disabled" / "Access suspended" / "Trial ended"), headline, "<Agency> can no longer create or modify data in Canopy.", a **Reason** panel echoing `suspension_reason`, a **Trial ended** panel with the relative expiry, reassurance that data is preserved, a `mailto:hello@exhibitus.com` contact link, and Home / Sign out buttons.

**Current-state gaps**
- **`suspended` is a soft state with a hard failure mode.** The route gate treats only `disabled` and `trial_expired` as lockout, so a suspended user browses the whole app normally and only discovers the restriction when a save silently fails with a Postgres RLS error — no `canWrite` check disables a single button anywhere (`canWrite` is computed and never consumed).
- **The comment in `disable_agency` overstates behavior**: "agency members are signed out (frontend)". No sign-out is triggered; the user is merely redirected and can still hold a valid session indefinitely.
- **RLS coverage is partial.** Only `clients`, `projects`, `knowledge_documents`, and `pending_invites` carry `agency_has_access()`. Other agency-scoped tables (e.g. `activation_type_overrides`, `agencies` itself via `useUpdateAgency`, pricing tables) are not gated, so a suspended agency can still mutate them.
- **Trial expiry is not proactive.** `access_status` stays literally `'trial'` in the DB forever; expiry is recomputed on every read (`agency_effective_status()` server-side, `deriveAccessState()` client-side). There is no scheduled job, no notification, and no audit-log entry when a trial lapses.
- **Enforcement uses the *primary* agency only.** `useAgency()` picks the highest-role membership (`owner > admin > member > viewer`); a user who belongs to both a suspended and an active agency is gated by whichever one wins that sort, not by the agency whose data they're touching.
- `SuspensionBanner` uses dark-theme token classes (`text-red-200`, `text-amber-100`) inside what the codebase describes as a "Flow C light everywhere" shell — likely low-contrast in practice.
- `AccessSuspended.tsx` performs its redirect with a raw `window.location.href` inside render rather than a router `<Navigate>`.

---

## Cross-cutting observations for the FRD

1. **Two admin concepts share one route.** `/admin` is both Platform Admin and Agency Settings, disambiguated by a client-side boolean. There is no dedicated platform-admin component, no role guard on the route, and the initial tab state race (§1) means the default landing is currently broken for super admins.
2. **The dedicated platform pages (`/admin/agencies`, `/admin/industries*`, `/admin/super-admins`) are consistently guarded** — in-component `useIsSuperAdmin()` + `<Navigate to="/projects">` + server-side `_require_super_admin()`. `/admin` and `/account/:userId` are the two exceptions, relying entirely on RPC-level filtering.
3. **Configuration written by admins is largely not yet consumed.** `feature_flags`, `quotas`, and the subscription tier have complete authoring UIs and zero readers. The FRD should treat these as authoring-only today.
4. **Three separate invite mechanisms** coexist: `platform_invites` (edge function, display-only ledger), `pending_invites` (agency member + super admin, actually grants via `accept_pending_invite`), and `project_invites` (token links at `/invite/:token`). Only the middle one grants roles.
5. **Preview mode is a nav skin, not an access mode.** Any FRD requirement around "view as agency" needs to specify agency binding, persistence, and actual read-only enforcement — none of which exist.
6. **The `interior_design` industry is a consistent second-class citizen**: missing from the placeholder-UUID map (which breaks auto-seed), missing from the detail-page icon map, missing from the public hero-image map, and contradicted by "5 industries" copy throughout.