## CANOPY — Domain Audit: Application Shell, Access Control & Public Surfaces

Read-only audit. All findings verified against source at `/Users/bryanscott/Desktop/Brief to Booth`.

---

# 1. Routing Map (`src/App.tsx`)

**Provider stack (outermost → innermost):** `AppErrorBoundary` → `QueryClientProvider` → `AuthProvider` → `CacheClearGuard` (`useClearCacheOnUserChange`) → `PlatformOwnerProvider` → `TooltipProvider` → `Toaster` + `Sonner` → `BrowserRouter` → `Suspense(LazyFallback)` → `Routes`. Vercel `Analytics` + `SpeedInsights` mount alongside the router.

**Eager (in main bundle):** `Index`, `Auth`, `NotFound`. Everything else is `React.lazy` code-split.

| Path | Component | Guard | Load | Reachable by |
|---|---|---|---|---|
| `/` | `Index` | none | eager | anyone (public) |
| `/auth` | `Auth` | none | eager | anyone (public) |
| `/architecture` | `IntelligenceArchitecture` | none | lazy | anyone (public) |
| `/invite/:token` | `AcceptInvite` | none (self-guards) | lazy | anyone; self-redirects to `/auth` if signed out |
| `/industries/:slug` | `IndustryDetail` | none | lazy | anyone (public) |
| `/projects` | `Projects` | `ProtectedRoute` (full) | lazy | authed + agency + not locked out |
| `/upload` `/review` `/generate` `/spatial` `/prompts` `/files` `/export` | `Upload` `Review` `Generate` `Spatial` `Prompts` `Files` `Export` | `ProtectedRoute` (full) | lazy | as above |
| `/pricing` | `Pricing` | `ProtectedRoute` | lazy | as above (per-project BOM editor, `?project=`) |
| `/agency/pricing` | `AgencyPricing` | `ProtectedRoute` | lazy | as above |
| `/rhino` | `Rhino` | `ProtectedRoute` | lazy | as above — **no nav entry point anywhere** |
| `/knowledge-base` | `KnowledgeBase` | `ProtectedRoute` | lazy | as above — **no nav entry point anywhere** |
| `/company` | `CompanyProfile` | `ProtectedRoute` | lazy | as above |
| `/admin` | `AdminSettings` | `ProtectedRoute` only | lazy | **any authed user** — no role guard in the route; the page self-branches on `isSuperAdmin && !previewMode` |
| `/account/:userId` | `AgencyAccount` | `ProtectedRoute` only | lazy | **any authed user** (no role check found) |
| `/team` | `Team` | `ProtectedRoute` | lazy | as above — **no nav entry point** (superseded by `/agency/team`) |
| `/clients` | `Clients` | `ProtectedRoute` | lazy | as above |
| `/clients/:clientId` | `ClientDashboard` | `ProtectedRoute` | lazy | as above |
| `/agency/knowledge` | `AgencyKnowledge` | `ProtectedRoute` | lazy | as above |
| `/agency/activation-types` | `ActivationTypes` | `ProtectedRoute` | lazy | as above |
| `/agency/activation-types/:typeId` | `ActivationTypeDashboard` | `ProtectedRoute` | lazy | as above |
| `/agency/team` | `AgencyTeam` | `ProtectedRoute` | lazy | as above |
| `/admin/super-admins` | `SuperAdmins` | `ProtectedRoute` + **page-level** `if (!isSuperAdmin) <Navigate to="/projects">` | lazy | super admins |
| `/admin/agencies` | `AdminAgencies` | `ProtectedRoute` only | lazy | **any authed user client-side**; server RPCs enforce super-admin |
| `/admin/industries` | `AdminIndustries` | `ProtectedRoute` only | lazy | any authed user client-side |
| `/admin/industries/:slug` | `AdminIndustryDashboard` | `ProtectedRoute` only | lazy | any authed user client-side |
| `/access-suspended` | `AccessSuspended` | `ProtectedRoute enforceAccessGate={false} enforceOnboarding={false}` | lazy | any authed user |
| `/onboarding/create-agency` | `OnboardingCreateAgency` | `ProtectedRoute` both gates off | lazy | any authed user |
| `/suite` | `Suite` | `ProtectedRoute` (full) | lazy | as above; entered only via `SuiteContextBar` |
| `*` | `NotFound` | none | eager | anyone |

**Commented-out / dead routes:**
- `const Explore = lazy(...)` (line 54) and the `/explore` `<Route>` block (lines 363–368) are commented out: "360° Explorer hidden — kept for future re-enable". `src/pages/Explore.tsx` and `src/components/explore/{BoothExplorer,PanoramaViewer}.tsx` still ship in the repo but are unreferenced. The matching step is also commented out in `ProjectHeader.tsx` (`Compass` icon import + `/explore` step).
- `Calculator`/pricing is commented out of `PROJECT_STEPS` with a note that pricing is now agency-level, not a project step.

**Dead nav target:** `AppSidebar.platformOwnerNavItems` includes `{ path: "/platform-invites", label: "Invites" }` — **no such route exists**, so a super admin clicking "Invites" lands on the 404 page. (The invites UI actually lives inside `/admin` → "Invites & Team" tab, and query keys `admin-platform-invites` exist in `useAdminRole`.)

**Error/reload behavior (`AppErrorBoundary` + `main.tsx`):** distinguishes chunk-load failures (stale bundle → auto-reload once per 10s cooldown keyed on `sessionStorage["canopy:stale-chunk-reload-attempted"]`, plus a cache-busting `?_canopy_reload=` manual refresh) from render errors (offers "Try again" soft reset and "Go to dashboard"). `main.tsx` duplicates this for `vite:preloadError` and `unhandledrejection` before React mounts.

---

# 2. Screens

### `/` — Landing (`src/pages/Index.tsx`)

**Route & access** · Public, eager-loaded, no guard. Dark theme (`canopy-dark`).

**Intent** · Top-of-funnel marketing page positioning Canopy as "a spatial operating system for environment design" — sell the multi-industry, RAG-grounded brief→render→deck pipeline and push visitors into `/projects` (which bounces them to sign-in) or `/auth`.

**UI anatomy** (top → bottom)
1. **Fixed glass header** — `CanopyLogo` (horizontal, byline) → `/`; anchor nav `#showcase` "Work", `#industries` "Industries", `#system` "System", `#intelligence` "Intelligence"; "Sign in" ghost → `/auth`; "Enter" primary → `/projects`. Nav is `hidden md:flex` — **no mobile menu at all**.
2. **Hero** — 13-image cross-fading background (`HERO_ROTATION`, 5.5s interval, parallax via `useScrollY`), pill eyebrow, H1 "Design the space / before you build it.", body paragraph, CTAs "Start a project" → `/projects` and "See the work" → `#showcase`, plus a 3-item trust bar: "Multi-tenant for agencies + teams", "4-scope RAG with pgvector", "AI skills on every upload".
3. **`#showcase`** — 6-tile bento grid (`SHOWCASE`): Uber, Samsung, Tesla, Topps + two generic (Energy/Sport, Hospitality). Copy explicitly disclaims: examples are experiential-vertical; other verticals "coming online".
4. **`#system`** — 4 `PILLARS` cards: Spatial intelligence, 5-scope RAG engine, AI skills built-in, Brief to render in a day.
5. **`#industries`** — 5 image cards linking to `/industries/:slug` (experiential, architecture, landscape, entertainment, audio_visual) + a dashed "Beyond the launch verticals" placeholder tile (themed entertainment, retail, hospitality, sports venues, public art).
6. **Spatial planning feature** — 3D-tilted floorplan image with animated scan line and 4 floating metric chips ("Demo · 142 sqft", "Reception · flow A+", "VIP Lounge · 96 sqft", "Meeting · adj ✓" — all hardcoded decoration), plus a 4-item checklist.
7. **`#intelligence`** — RAG network image with a 5-scope weight strip (Industry 0.70, Agency 1.00, Project Type 0.92, Client Brand 0.85, Project 1.00) + 4 `INTELLIGENCE` cards (Brand intelligence, Project type playbooks, Brand compliance audit, Cost intelligence).
8. **`#workflow`** — 6-step rail: Brief → Parse → Ground → Generate → Plan → Deliver.
9. **Stats strip** — `< 24h` brief-to-first-render · `5` knowledge scopes · `5` industries · `60+` project types.
10. **Parallax gallery band** — 8 scrolling render images.
11. **Final CTA** — "Upload your first brief" → `/projects`; "Sign in" → `/auth`.
12. **Footer** — logo, tagline, links to `/auth` and `/projects` ("Dashboard").

**Inputs** · Zero user input, zero data loading. All content is module-level constants (`SHOWCASE`, `PILLARS`, `INDUSTRIES`, `WORKFLOW`, `INTELLIGENCE`, `STATS`) plus static `@/assets` imports. Only reactive state: `mounted` (60 ms entrance delay), `heroIdx` (rotation), `useScrollY()`.

**Workflows** · Anchor scrolls; "Enter"/"Start a project"/"Upload your first brief"/"Dashboard" → `/projects` → `ProtectedRoute` → `/auth` for anonymous visitors; "Sign in" → `/auth`; industry card → `/industries/:slug`.

**Outputs & side effects** · None. No DB, no storage, no edge functions. Vercel Analytics/Speed Insights fire globally from `App`.

**Current-state gaps**
- **Claim inconsistency on the same page:** hero trust bar says "**4**-scope RAG with pgvector"; pillars say "**5**-scope RAG engine"; stats say "**5** Knowledge scopes"; intelligence section lists 5 scopes. `index.html` OG description also says "4-scope RAG" and "**Claude** skills built-in" (product copy elsewhere says "AI skills").
- The landing never links to `/architecture` — that public page is effectively unlisted/share-by-URL only.
- Anonymous CTAs point at `/projects`, so the primary CTA path is CTA → guard redirect → `/auth`, not a direct sign-up. Combined with invite-only auth, "Start a project" is not actually actionable for a new visitor.
- No mobile navigation (`hidden md:flex`), so on phones the header has no Sign in / Enter affordance.
- Stats ("5 industries", "60+ project types") are hardcoded and can drift from the `industries` / `activation_types` tables that `IndustryDetail` reads live.

---

### `/industries/:slug` — Industry Detail (`src/pages/IndustryDetail.tsx`)

**Route & access** · Public, lazy. Renders for anonymous visitors via a constants fallback.

**Intent** · Per-vertical marketing deep-dive that proves Canopy "speaks your industry's language" — vocabulary swap, capabilities, deliverables, supported project types.

**UI anatomy** · Fixed glass header (logo, "All industries" → `/#industries`, Sign in, Enter) · Hero (industry image, icon pill "Canopy for {label}", tagline H1, pitch, CTAs) · **Vocabulary grid** (one card per `vocabulary` key/value) · **Capabilities / What you ship** two-column lists · **Project types** grid (count + cards) · CTA band with `Badge "Built for {label}"` · Footer ("© Canopy — A spatial OS for environment design", back to home).

**Inputs**
- Route param `slug`.
- Live read: `industries` table (`slug, label, description, icon, vocabulary`, `.maybeSingle()`).
- Live read: `activation_types` where `industries @> [slug]` and `is_builtin = true`, ordered by label.
- Fallback: `BUILTIN_INDUSTRIES` from `src/lib/builtinIndustries.ts` when the DB read returns nothing (anonymous visitors — the `industries` table is RLS-gated to authenticated users).
- Static: `NARRATIVE` map (tagline/pitch/capabilities/deliverables per slug for all 5 verticals), `HERO_BY_SLUG` images, `ICON_MAP`.

**Workflows** · Copy interpolates vocabulary: CTA reads "Start a {vocab.project}", "Bring us a {vocab.brief}". Unknown slug → minimal "Industry not found" screen with a Back-to-home button (not the global 404). CTAs → `/projects`, `/auth`, `/#industries`.

**Outputs & side effects** · Read-only Supabase selects. Mutates `document.title` and injects/updates a `meta[name=description]` tag for SEO.

**Current-state gaps**
- SEO title/description are set but never reset on unmount, so navigating back to `/` leaves the industry title in place (SPA, no head manager).
- For anonymous visitors the **project-types section silently disappears** (RLS blocks the read, `projectTypes` stays empty) — the vertical looks thinner to the exact audience the page targets.
- Trailing `void cn;` at line 508 with a comment admitting `cn` is imported only "defensively" — dead import.
- `NARRATIVE` is hardcoded per slug; a new industry seeded in the DB renders with no tagline/capabilities/deliverables and no hero image.

---

### `/architecture` — Intelligence Architecture (`src/pages/IntelligenceArchitecture.tsx`)

**Route & access** · Public, lazy, no guard, no auth. Light theme (`bg-cloud text-navy`, forced `colorScheme: light`).

**Intent** · A shareable "living document" that explains how Canopy stores, retrieves, and learns from agency/client data — explicitly the visual twin of `docs/intelligence/`, intended for prospects/stakeholders and honest about what is live vs. planned.

**UI anatomy** · Top bar (CanopyMark + "CANOPY" + "Intelligence architecture · living document", link "canopy.gofightwin.co →" → `/`) · Navy hero band ("Memory that compounds") with two cards: Client memory, Agency memory · **The learning loop** — 5 cards (Capture *planned*, Distill *partial*, Approve *live*, Retrieve *partial*, Generate *live*, marked generative ✦) + a pink invariants callout ("nothing auto-extracted reaches generation without human approval"; "client scope is a wall") · **Data model** — 6 table cards with status pills and field chips: `brand_intelligence` (live), `brand_guidelines` (live), `knowledge_documents + embeddings` (live), `project_images.prompt_artifacts` (live), Agency-scope data (live), `learning_events` (**planned**) · **Learning signals** — 10-row table (signal → what it teaches → status; 4 live/partial, several planned) · **Roadmap** — 4 phases, all *planned* · Footer ("Maintained alongside the code in docs/intelligence · Canopy by Exhibitus", back to Canopy).

**Inputs** · None — entirely static local constants (`LOOP_STEPS`, `TABLES`, `SIGNALS`, `PHASES`). Deliberately "dependency-light" with local `StatusPill` / `SectionLabel` primitives instead of the shell kit.

**Workflows / outputs** · Two links back to `/`. No writes, no reads, no side effects.

**Current-state gaps**
- Publicly exposes internal schema names, roadmap, and "planned" gaps to anyone with the URL, with no `noindex` and no access control.
- Content is manually duplicated from `docs/intelligence/` — the file header itself instructs "keep both in sync", i.e. drift is unmanaged.
- It defines its own `SectionLabel` that shadows the shell-kit `SectionLabel` (different API: `swatch`/`color` vs `accent`).
- Unreachable from any nav or footer in the app or on the landing page.

---

### `/auth` — Sign In / Recovery / Beta Waitlist (`src/pages/Auth.tsx`)

**Route & access** · Public, eager. Single-card surface with four mutually exclusive modes.

**Intent** · The only login door. Account creation is **invite-only** by design (explicit comment: `signUp` is deliberately *not* destructured; the public sign-up path was retired in favor of a beta waitlist).

**UI anatomy** · Dark ambient background (grid pattern + two `CanopyAmbientGlow` orbs) · `CanopyLogo` (stacked, byline) → `/` · one `canopy-panel` card rendering one of:
1. **Recovery** (`?type=recovery`): "Set a new password" — New password, Confirm password, "Update password".
2. **Forgot password** (`showForgotPassword`): back-link, Email, "Send reset link".
3. **Beta request** (`showBetaRequest`): back-link, Work email (required), Your name, Agency or company, "What kind of work are you bringing to Canopy?" (textarea, `maxLength 1000`), "Request access"; on success swaps to a "You're on the list" confirmation panel.
4. **Sign in** (default): `Badge "Invite-only beta"`, Email, Password with "Forgot?" toggle, "Sign in", and "Don't have an account? Request beta access".
· Footer line: "By continuing you agree to Canopy's terms and privacy policy." (plain text — **not linked**).

**Inputs** · `useSearchParams().get("type")`; uncontrolled `FormData` on every form; `useAuth().signIn`; direct `supabase.auth.resetPasswordForEmail` / `updateUser`; `supabase.from("beta_waitlist").insert`.

**Workflows**
- **Sign in** → `signIn(email, password)` → on error, destructive toast "Sign in failed" + `error.message`; on success toast "Welcome back" and `navigate("/projects")` — **unconditionally**, ignoring any intended destination.
- **Forgot** → `resetPasswordForEmail(email, { redirectTo: origin + "/auth?type=recovery" })` → "Check your email" toast, returns to sign-in.
- **Recovery** → client-side validation (match + min length 6) → `supabase.auth.updateUser({ password })` → toast + `navigate("/projects")`.
- **Beta request** → insert `{ email, name, agency, reason, source: "auth_page" }` into `beta_waitlist`; Postgres `23505` (unique-violation on `lower(email)`) is treated as success ("You're already on the list").

**Outputs & side effects** · Supabase Auth session (persisted by the client, picked up by `AuthProvider.onAuthStateChange`, which then upserts `profiles`); `beta_waitlist` row insert (RLS: `INSERT` granted to `anon, authenticated`; `SELECT/UPDATE/DELETE` super-admin only, per `20260515000001_beta_waitlist.sql`); navigation to `/projects`.

**Current-state gaps**
- **Post-login destination is hardcoded.** `ProtectedRoute` sends `state: { from: location }` and `AcceptInvite` sends `?redirect=/invite/:token` — Auth reads **neither**. Deep links are always lost; invite acceptance after sign-in is broken (user lands on `/projects` and must re-open the invite URL).
- No password strength rules beyond `length >= 6`; no rate limiting or captcha on the waitlist insert (anon-writable table).
- Beta waitlist has **no notification path** — the code comment states submissions are only visible by polling the Supabase dashboard; a Resend/edge-function notification to `bryan@gofightwin.co` is noted as a future enhancement.
- `useAuth.signUp` is still exported and implemented (`emailRedirectTo: window.location.origin`) but has zero call sites — dead code that contradicts the invite-only posture.
- Terms/privacy referenced but no documents or links exist.
- No email-verification, MFA, or SSO/OAuth path anywhere.

---

### `/invite/:token` — Project Invite Acceptance (`src/pages/AcceptInvite.tsx`)

**Route & access** · Public route; **not** wrapped in `ProtectedRoute` — it self-redirects unauthenticated users. Intentionally outside the onboarding/access gates.

**Intent** · Redeem a tokenized **project collaboration** invite link and drop the accepter straight into the project.

**UI anatomy** · Centered card: Link2 icon well, title "Project Invite", description "You've been invited to collaborate on a project in **BriefEngine**", and one of three bodies — idle (explainer + "Accept Invite" button), success (green check, "Invite accepted!", "Redirecting to project..."), error (red X, message, "Go to Projects" button).

**Inputs** · `useParams().token`; `useAuth()` for gating; `useAcceptInvite()` from `src/hooks/useTeam.tsx` → RPC `accept_project_invite(_token)` (server-side token lookup; returns a `ProjectInvite` row with `project_id` and `scope`: `upload_only | view_comment | full_edit`).

**Workflows** · If `!authLoading && !user` → `navigate('/auth?redirect=/invite/' + token)`. "Accept Invite" → `mutateAsync(token)` → success toast from the hook ("You now have {scope} access…") → `setTimeout(1500)` → `navigate('/upload?project=' + invite.project_id)`. Button is disabled after first attempt (`hasAttempted`).

**Outputs & side effects** · Server-side invite redemption via RPC (marks accepted, grants project access); navigation to `/upload?project=…`.

**Current-state gaps**
- **Stale branding:** the card says "BriefEngine", not Canopy — the only place in the shell that still uses the old product name.
- The `?redirect=` param it constructs is **never honored** by `/auth` → the invite flow dead-ends for signed-out invitees.
- **Two parallel invite systems coexist:** token-based *project* invites (`accept_project_invite`, this page, `useTeam`, `ProjectInviteManager`) and id-based *agency member / super-admin* invites (`pending_invites`, `accept_pending_invite`, `useAgencyTeam`, surfaced only on the onboarding page). There is no email link that lands on a page for the second kind.
- Legacy `useTeam.useInviteTeamMember` writes a `team_members` row with the **inviter's own** `user_id` as a placeholder and a code comment that the accept flow will fix it — no such accept flow exists for `team_members`.
- No unauthenticated preview of what project/agency the invite is for; no expiry messaging beyond the generic error string.

---

### `/onboarding/create-agency` — Mandatory Agency Onboarding (`src/pages/OnboardingCreateAgency.tsx`)

**Route & access** · `ProtectedRoute enforceAccessGate={false} enforceOnboarding={false}` — authenticated users only; both gates disabled because the page *is* the gate. Every non-super-admin without an agency is force-redirected here.

**Intent** · Guarantee the tenancy invariant: every signed-in user belongs to an agency. Either accept a pending agency invitation or create your own agency (becoming its owner), which also backfills any orphaned data the user created before agencies existed.

**UI anatomy**
1. Ambient dark background, `CanopyLogo` → `/`.
2. **Pending invitations panel** (only if agency-type invites exist) — "You have N invitation(s)", one clickable row per invite showing agency name, "Joining as {role}", and relative invited-at (`formatDistanceToNow`), chevron affordance.
3. **Create-agency `CanopyPanel`** — eyebrow flips between "One last step" and "Or start fresh"; H1 "Create your agency"; explainer that you'll be owner.
   - **Agency name** (required, 2–80 chars, autofocus)
   - **Logo URL** (optional, `type=url`)
   - **Industry picker** — 2-col grid of live industries with icon, label, description, selected check; warning copy: "This is **locked once your agency is created** — contact platform support to change later."
   - **Extra industries** — multi-select chips for cross-vertical agencies, "rare", also locked after onboarding.
   - **Primary / Secondary brand color** — native color inputs + hex text fields (defaults `#A78BFA`, `#0B1B2B`).
   - Submit "Create agency →".
4. Footer strip: "Signed in as {email}" + Sign out.

**Inputs** · `useOnboardingState()` (hasAgency/isLoading), `useMyPendingInvites()` → RPC `my_pending_invites()` (matches `lower(auth.jwt()->>'email')`, `status='pending'`, not expired), `useIndustries()` → `industries` table, `useAuth()`.

**Workflows**
- Mount effect: if `hasAgency` → `navigate("/projects", { replace: true })`.
- **Accept invite** → `useAcceptInvite` (agency variant) → RPC `accept_pending_invite(_invite_id)` → inserts `agency_members(agency_id, auth.uid(), role)` (or `user_roles.super_admin` for super-admin invites), marks the invite accepted → toast → `/projects`.
- **Create agency** → client validation (trimmed name ≥ 2) → `useCreateMyAgency` → RPC `create_my_agency(_name, _logo_url, _brand_colors, _primary_industry, _industries)`; server creates the agency, makes the caller owner, backfills orphaned projects/clients/KB docs → invalidates `agency`, `clients`, `projects`, `my-pending-invites` → toast "Welcome to Canopy, {name}" → `/projects`.
- **Sign out** → `signOut()` → `/`.

**Outputs & side effects** · DB: `agencies` insert + `agency_members` owner row + backfill of orphaned rows (all inside the SECURITY DEFINER RPC); or `agency_members` insert via invite acceptance. Navigation to `/projects`.

**Current-state gaps**
- **Logo is a URL text field, not an upload** — despite the file header claiming "optionally upload a logo". No validation that the URL resolves.
- Industry lock is enforced at the DB trigger level (`20260427233000_lock_industry_isolation.sql`) with the only escape hatch being `admin_set_agency_industries` (super admin, via `useAdminSetAgencyIndustries`) — but the page gives the user no in-product way to request that change beyond "contact platform support".
- `useCreateMyAgency` passes 5 args while the migration's `GRANT`/`COMMENT` reference a 3-arg `create_my_agency(text, text, jsonb)` signature — the industry-aware overload comes from a later migration; worth verifying only one signature is live.
- Brand colors are collected here but there is no preview of where they're applied.
- No "leave/decline invite" action — invites can only be accepted or ignored.

---

### `/access-suspended` — Access Suspended Landing (`src/pages/AccessSuspended.tsx`)

**Route & access** · `ProtectedRoute` with **both** gates disabled, so locked-out users can actually reach it without a redirect loop.

**Intent** · Give a suspended / disabled / trial-expired agency a clear, non-punitive dead end: what happened, why, that their data is safe, and how to get unblocked.

**UI anatomy** · Ambient background + `CanopyLogo` → `/` · Panel with state-dependent icon (Lock / AlertTriangle / Clock) and label ("Account disabled" / "Access suspended" / "Trial ended") · Headline · "{Agency} can no longer create or modify data in Canopy." · **Reason block** (when `suspensionReason` present) · **Trial ended** block with `formatDistanceToNow(trialEndsAt)` · Reassurance paragraph (state-specific: data preserved / convert to paid) · `mailto:hello@exhibitus.com` · Footer actions: "Home" → `/` and "Sign out".

**Inputs** · `useAgency()` → `{ agency, access, isLoading }` (from `agency_members` join `agencies`); `useAuth().signOut`.

**Workflows** · If not loading and access is missing or **not restricted**, it hard-redirects via `window.location.href = "/projects"`. Sign out → `signOut()` then `window.location.href = "/"`.

**Outputs & side effects** · No writes. Full-page navigations (not React Router).

**Current-state gaps**
- Contact email is `hello@exhibitus.com`, while the brand elsewhere is Canopy and the operator email is `bryan@gofightwin.co` / `canopy.gofightwin.co` — three different identities across the shell.
- **State mismatch with the gate:** the page renders for any `isRestricted` state, but `ProtectedRoute` only routes users here when `isLockedOut` (disabled / trial_expired). A merely *suspended* agency is never redirected here — it keeps full route access and only sees the banner (see §6).
- No self-serve remediation (no billing/upgrade CTA), no ticket form — email only.
- Uses `window.location.href` instead of router navigation, discarding SPA state.
- Renders outside `AppLayout`, so there's no way back into any read-only view of past work.

---

### `*` — Not Found (`src/pages/NotFound.tsx`)

**Route & access** · Public catch-all, eager.

**Intent** · Terminal 404.

**UI anatomy** · Centered "404" / "Oops! Page not found" / plain `<a href="/">Return to Home</a>` on `bg-muted`.

**Inputs** · `useLocation().pathname` only.

**Workflows / outputs** · `useEffect` logs `console.error("404 Error: User attempted to access non-existent route:", pathname)`. No telemetry, no DB.

**Current-state gaps**
- Completely off-brand: no CanopyLogo, no shell kit, no theme tokens beyond `bg-muted`; the only page that ignores the design system.
- Uses a raw `<a>` (full page reload) instead of `<Link>`.
- Signed-in users get no route back into the app (no "Go to projects").
- This is where the broken `/platform-invites` sidebar link lands super admins.
- 404s are only `console.error`'d — not reported to Analytics.

---

### `/suite` — Suite Overview (`src/pages/Suite.tsx`)

**Route & access** · `ProtectedRoute` (full gates), lazy. Reached only from `SuiteContextBar` ("Suite Overview" button / parent breadcrumb) — no sidebar or step-nav entry.

**Intent** · Parent-project view for multi-activation "suites": see the parent, its child activations, add another activation, and roll up budget.

**UI anatomy** · Inside `AppLayout` · "All Projects" back button · Parent summary `Card` (name, project type, brand name from `parsed_brief`, status badge from `STATUS_BADGES` map, "N activations" badge) · "Activations" heading + "Add Activation" button + `<SuiteOverview>` grid · **Budget Rollup** card (only when total > 0) · `<AddActivationPanel>` sheet.

**Inputs** · `useProjectSync()` → `projectId` (from `?project=`); `useProject(projectId)`; `useProjectSuite(projectId, null)` → `{ parent, children, siblings }`; `parentProject.budget_logic.totalPerShow`.

**Workflows** · Add Activation → panel → on created → `navigate('/review?project=' + newId)`. Child card click (in `SuiteOverview`) → project routes. Not-found → "Project not found." + back button.

**Outputs & side effects** · Writes happen inside `AddActivationPanel` (new child project row); this page itself only navigates.

**Current-state gaps**
- **Budget rollup is a stub.** The code comment states it plainly: "We'd need full child data for budget_logic — for now use parent if available". The "rollup" sums exactly one number (the parent's), so a suite's children contribute nothing.
- Non-null assertions `projectId!` are passed to `SuiteOverview` / `AddActivationPanel` even though the page can render with a missing id.
- Uses raw shadcn `Card`s rather than the Flow C shell kit (`WorkSheet`, `PageHeader`), so it's visually out of step with the newer pages.
- `STATUS_BADGES` is a locally duplicated status map (also duplicated in project list surfaces).

---

# 3. Auth, Roles & Permissions

### `AuthProvider` / `useAuth` (`src/hooks/useAuth.tsx`)

- **Contract:** `{ user, session, isLoading, signIn, signUp, signOut }`.
- **Session handling:** registers `supabase.auth.onAuthStateChange` **before** calling `getSession()` (deliberate ordering to avoid missing the initial event). Both paths set `session`/`user` and clear `isLoading`.
- **User-switch safety:** tracks `prevUserId` in a ref; when the id changes it calls `useProjectStore.getState().resetProject()`. `signOut()` also resets the store before `supabase.auth.signOut()`. Complemented by `CacheClearGuard` → `useClearCacheOnUserChange`, which calls `queryClient.clear()` on any user-id change (explicitly "prevents data from one user leaking into another user's session").
- **Profile side effect:** on every auth event and on initial session, upserts `profiles { user_id, email, display_name (user_metadata.display_name || full_name), avatar_url }` with `onConflict: user_id`, so admins can see names/emails. `useEnsureProfile` in `useAdminRole` duplicates this.
- **Post-login:** the provider does nothing navigational; `Auth.tsx` hardcodes `/projects`.
- **Gaps:** `signUp` exists but is unused; the `profiles` upsert result is unchecked (failures are silent in `AuthProvider`, only logged in `useEnsureProfile`); no session-expiry UX beyond the guard redirect.

### `useAdminRole` (`src/hooks/useAdminRole.tsx`)

| Hook | What it does | Source |
|---|---|---|
| `useIsAdmin()` | Selects all `user_roles` rows for the user; true if roles include `admin` **or** `super_admin`. 5-min `staleTime`. Errors resolve to `false`. | `user_roles` |
| `useIsSuperAdmin()` | `user_roles` where `role='super_admin'`, `.maybeSingle()` → boolean. 5-min `staleTime`. Errors → `false`. | `user_roles` |
| `useAdminProfiles()` | Gated on `isAdmin`. RPC `get_all_user_profiles()` + all `projects`, grouped by `user_id` into `ProjectSummary[]`. | RPC + `projects` |
| `useAdminUsers()` | Legacy: projects grouped by user. | `projects` |
| `useInviteUser()` | Edge fn `admin-invite-user` with Bearer token. | edge function |
| `usePlatformInvites()` | `platform_invites` list, gated on `isAdmin`. | `platform_invites` |
| `useManageAdminRole()` | Edge fn `admin-manage-role` with `grant_admin \| revoke_admin \| grant_super_admin \| revoke_super_admin`. | edge function |
| `useGrantAdminRole` / `useRevokeAdminRole` | Direct `user_roles` insert/delete, "kept for backward compat". | `user_roles` |
| `useEnsureProfile()` | Idempotent `profiles` upsert, `staleTime: Infinity`. | `profiles` |

**Role model observed:** two orthogonal axes — **platform roles** in `user_roles` (`admin`, `super_admin`) and **agency roles** in `agency_members` (`owner > admin > member > viewer`, priority-ordered in `useAgency`). Nothing in the routing layer consumes agency role; only `useIsAdmin`/`useIsSuperAdmin` affect UI.

**Gaps**
- **`ProtectedRoute` checks no roles at all.** Admin routes (`/admin`, `/admin/agencies`, `/admin/industries`, `/admin/industries/:slug`, `/account/:userId`) are reachable by any authenticated, onboarded, non-locked-out user. Only `/admin/super-admins` self-guards. Defense rests entirely on server RPC/RLS enforcement, so non-privileged users see chrome and empty/erroring panels rather than a clean denial.
- **`admin-invite-user` edge function requires `role = 'admin'` exactly** (`.eq("role","admin").maybeSingle()`), so a pure `super_admin` (no `admin` row) gets `403 Forbidden: admin only` — inconsistent with `useIsAdmin`, which treats super admins as admins.
- Both role queries **swallow errors as `false`**, so an RLS/network failure silently downgrades a super admin to a regular user (they'd be bounced from `/admin/super-admins` and, if agency-less, pushed into onboarding).
- 5-minute `staleTime` means role changes take up to 5 min to reflect unless a mutation invalidates.
- `useGrantAdminRole`/`useRevokeAdminRole` bypass the audited edge function entirely (direct table writes) — parallel, unaudited privilege paths.

### `PlatformOwnerContext` (`src/contexts/PlatformOwnerContext.tsx`) — Preview Mode

- **API:** `{ previewMode: boolean, setPreviewMode }`, backed by plain `useState` in a provider mounted inside `App`. Default context value is a no-op, so consumers outside the provider silently do nothing.
- **Consumers:** `AppSidebar` (nav-set switch, banner, enter/exit buttons), `AdminSettings` (`isPlatformView = isSuperAdmin && !previewMode` chooses between the Platform Admin and Agency Settings tab sets), `AgencyAccount` (`handlePreviewAsAgency` → `setPreviewMode(true)` → `/projects` + an info toast "Preview mode active — browsing as Agency Admin … Use the banner to exit").
- **Intent:** let a super admin see the product the way an agency admin sees it.

**Gaps**
- **Preview mode is presentation-only.** The sidebar banner promises "**Read-only agency view**", but nothing in the codebase consults `previewMode` to disable writes — no mutation, RLS policy, or form is gated by it. A super admin in preview mode has full write privileges.
- **It has no target agency.** Entering preview from `/account/:userId` does not scope anything to that user's agency; the app just shows the super admin's *own* `useAgency()` context. "Preview as Agency Admin" is generic, not impersonation.
- State is not persisted (no localStorage/URL param), so a refresh silently drops the super admin back into Platform Admin nav mid-task.

### `ProtectedRoute` (`src/components/layout/ProtectedRoute.tsx`)

Props: `enforceAccessGate = true`, `enforceOnboarding = true`.

Evaluation order:
1. **Loading** — while `useAuth().isLoading || useAgency().isLoading || useOnboardingState().isLoading`, render a full-screen spinner (blocks paint until *all three* resolve).
2. **Auth gate** — `!user` → `<Navigate to="/auth" state={{ from: location }} replace />`.
3. **Onboarding gate** — if `enforceOnboarding && !isSuperAdmin && !pathname.startsWith("/onboarding") && pathname !== "/access-suspended" && onboarding.needsOnboarding` → `/onboarding/create-agency`.
4. **Access gate** — if `enforceAccessGate && !isSuperAdmin && pathname !== "/access-suspended" && access?.isLockedOut` → `/access-suspended`.

`useOnboardingState()` composes `useAuth` + `useAgency` + `useIsSuperAdmin` + `useMyPendingInvites`; `needsOnboarding = user && !isLoading && !hasAgency && !isSuperAdmin && !hasPendingAgencyInvites` (a pending agency invite defers onboarding so the user accepts rather than creating a duplicate agency).

**Gaps**
- `state.from` is captured but never consumed (see `/auth`).
- **Suspended ≠ locked out:** only `disabled` and `trial_expired` trigger the redirect. A `suspended` agency keeps full navigation (writes fail at RLS, surfaced only as raw errors).
- Super admins bypass **both** gates, so a super admin without an agency browses agency-scoped pages with `agency = null` — several hooks are `enabled: !!agencyId` and will render empty rather than explaining why.
- The three parallel loading dependencies mean four sequential round-trips (auth → agency → super-admin → invites) before any protected page paints.
- No role prop (`requireSuperAdmin` / `requireAgencyAdmin`) exists, which is why role gating is ad hoc per page.

### Agency membership resolution — `useAgency` (`src/hooks/useAgency.tsx`)

- Query key `["agency", user.id]`; selects `agency_members.role, agencies:agency_id(*)` for the user; if zero rows → `{ agency: null, role: null }`.
- Multiple memberships are sorted by `ROLE_PRIORITY` (`owner 0 > admin 1 > member 2 > viewer 3`) and the **highest-priority membership wins** — the app is effectively single-agency per session.
- Normalizes the embedded relation (array or object) into `Tables<"agencies">`.
- `deriveAccessState()` computes the full `AgencyAccessState` (see §6).
- `useUpdateAgency()` — mutation patching the primary agency; invalidates `["agency"]`.

**Gaps:** no agency switcher UI anywhere despite multi-membership being modeled; `refresh()` invalidates only the user-scoped key while `useUpdateAgency` invalidates the whole `["agency"]` prefix (inconsistent); the hook returns `query.isLoading` (not `isFetching`), so background refetches after suspension changes don't show a loading state.

---

# 4. Layout Shell

### `AppLayout` (`src/components/layout/AppLayout.tsx`)
Wraps protected pages: `SidebarProvider` → flex row on `bg-cloud` → `<AppSidebar />` + column of `<SuspensionBanner />`, `<ProjectHeader />`, scrollable `<main>`. Prop `surface?: "dark" | "light"` is **legacy and ignored** — both values render the same Flow C light shell (kept only so existing `surface="light"` call sites compile). Used by 27 pages; not used by Auth, Index, IndustryDetail, IntelligenceArchitecture, AcceptInvite, AccessSuspended, OnboardingCreateAgency, NotFound.

### `AppSidebar` (`src/components/layout/AppSidebar.tsx`)
Collapsible (`collapsible="icon"`) sidebar with tooltip labels when collapsed.

**Nav set A — Agency** (`agencyNavItems`): All Projects `/projects` · Clients `/clients` · Activation Types `/agency/activation-types` · Agency Knowledge `/agency/knowledge` · Pricing `/agency/pricing` · Company Profile `/company` · Team `/agency/team`.

**Nav set B — Platform Owner** (`platformOwnerNavItems`): Accounts `/admin` · Agencies `/admin/agencies` · Industries `/admin/industries` · Super Admins `/admin/super-admins` · Invites `/platform-invites` *(no route → 404)*.

**Selection logic:** `showPlatformNav = isSuperAdmin && !previewMode`. Conditional extra item: "Admin Settings" (`/admin`, Shield) shown when `(isAdmin && !isSuperAdmin) || (isSuperAdmin && previewMode)`.

**Active-state rules (`isActive`)** keep the parent lit on detail routes: `/clients/*`, `/agency/activation-types/*`, `/admin/industries/*`, and `/pricing` keeps `/agency/pricing` active.

**Header:** logo link targets `/admin` for platform nav else `/projects`; super admins in platform mode get an amber Crown tile + "Platform Admin" caps label instead of the `CanopyMark` + "CANOPY" wordmark. Collapse/expand chevron buttons.

**Preview banner (expanded):** amber card with Eye icon, "Preview Mode", "Exit" (EyeOff) → `setPreviewMode(false)` + `navigate("/admin")`, sub-line "**Read-only agency view**". **Collapsed:** amber Eye pill with tooltip "Exit Preview Mode".

**Enter-preview control:** super admin in platform mode gets a dashed "Preview as Agency Admin" button (or icon button when collapsed) → `setPreviewMode(true)` + `navigate("/projects")`.

**Workspace label:** caps-mono line above the nav reading `"Platform"` for platform nav, else `agency?.name ?? "Workspace"`.

**Footer:** avatar (Crown on amber for super admins, else email initial on primary/10) + truncated `user.email` + LogOut icon button → `signOut()` then `navigate("/")`; when collapsed, just the tooltip'd sign-out button.

**Gaps:** dead `/platform-invites` item; "Read-only agency view" is a false claim; no link to `/rhino`, `/knowledge-base`, `/team`, or `/suite`; agency admins have no way to reach the agency-scoped Team page other than `/agency/team` while the orphan `/team` page still exists; no agency switcher for multi-membership users.

### `ProjectHeader` (`src/components/layout/ProjectHeader.tsx`)
Route-aware header rendered by `AppLayout`.

- **Non-project routes:** a 12px-tall bar containing only the `SidebarTrigger`.
- **Project routes** (`PROJECT_STEPS` paths): three stacked rows —
  1. `ProjectBar` (sidebar trigger as `leading`, breadcrumb "Projects / {project.name || 'Untitled Project'}") + a mono **spec pill** derived from `parsed_brief.booth_size ?? boothSize` and `parsed_brief.budget` joined with `·` + a **measurement-system dropdown** (Ruler icon, shows `m`/`ft`, faint dot when auto-detected; options Imperial (ft, sqft) / Metric (m, sqm); "Reset to auto-detect" removes `localStorage["canopy:project-measurement-system:{projectId}"]` and calls `window.location.reload()`).
  2. `<SuiteContextBar />`.
  3. `StepPillNav` over `PROJECT_STEPS`: Brief `/upload` · Review `/review` · Generate `/generate` · Spatial `/spatial` · Prompts `/prompts` · Files `/files` · Export `/export`. Step status is purely positional — index < current = `complete`, current = `active`, else `pending`. Targets carry `?project={id}` when present.
- **Data:** `useProjectSync()` → `dbProject`; `useSearchParams().get("project")`; `useMeasurementSystem(projectId, parsed_brief)`.

**Gaps:** step completion is derived from position in the array, not real project state — steps you've never visited show as "complete" once you're past them, and `StepPillNav`'s `blocked` status is never produced by this caller. Measurement preference persists to **localStorage only** (comment: "DB column when Lovable's pipeline cooperates"), so it doesn't follow the user across devices or teammates. "Reset to auto-detect" does a full page reload. Commented-out `Calculator` (pricing) and `Compass` (360°) steps remain.

### `SuiteContextBar` (`src/components/layout/SuiteContextBar.tsx`)
Renders only when the current project has a parent or children. Child view: parent-name breadcrumb → `/suite?project={parentId}`, current name, and a sibling `Select` that navigates to `/review?project={siblingId}`. Parent view: name + "+ N activations". Always right-aligns a "Suite Overview" button → `/suite?project={parentId ?? projectId}`. Data from `useProjectStore.currentProject.hierarchy.parentId` + `useProjectSuite`.

**Gaps:** sibling switch always lands on `/review` regardless of the step you're on; reads project identity from the Zustand store while `ProjectHeader` reads it from `useProjectSync`/query params (two sources of truth); styled with generic muted tokens rather than the Flow C grammar.

### Shell component kit (`src/components/shell/`)

| Component | Purpose / API |
|---|---|
| `CanopyMark` | Inline SVG brand mark — 8 gradient canopy segments + 8 tip dots, `useId`-scoped gradient. `{ size = 28, className }`. |
| `PageHeader` | Site-level page header: caps-mono `eyebrow`, 28/34 navy `title`, inline `titleAside` chips, one-line `subtitle`, right `actions`, optional `leading` visual. Presentation only. |
| `EmptyState` | Flow C empty-state grammar — cloud icon well, navy title, ≤2 slate lines, primary `action`. `{ icon, title, body?, action?, className? }`. |
| `IconWell` (same file) | Cloud r8 icon container with navy 1.3px glyph; `generative` flips to the action-gradient square with a white glyph (AI contexts). `{ icon, size = 36, generative, className }`. |
| `SectionLabel` | Caps-mono in-page section heading with an 8px gradient swatch; `accent` ∈ sky/blue/violet/purple/pink/slate maps to a bright swatch + contrast-safe text hex. |
| `StatusChip` | Small caps pill encoding the status color grammar: `blocking` (solid red), `warning`, `attention`, `pass`, `generating`, `neutral`. |
| `StatusSquare` | Same grammar in r8 square form for icon/counter tiles. `{ variant, size = 28 }`. |
| `SpecMono` | IBM Plex Mono wrapper — the rule that every spec-like string (dimensions, costs, counts, IDs) renders in mono. |
| `WorkSheet` | The white r20 work sheet: optional cloud header band (`eyebrow`/`title`/`subtitle`/`headerRight`) + hairline + padded body. |
| `InkRail` + `RailTitle`, `RailSection`, `RailRow` | Navy reference drawer pinned right; collapses to a vertical "REFERENCE" tab, open/closed persisted in `localStorage["canopy.inkrail.open"]` (default open). `RailSection` accents by gradient stop; `RailRow` is a label/value row with `mono` and tone (`pass`/`warn`/`attention`) options and a graceful "—" fallback. |
| `StepPillNav` + `StepPill` | White pill rail on cloud: `active` (navy, sky step number), `complete` (green check), `blocked` (6px red dot), `pending`. Steps and targets supplied by the caller; `aria-current="step"` on active. |
| `ProjectBar` | Project chrome row: "Projects /" breadcrumb button (navigates `/projects`), name, optional mono spec pill, `status` text, `leading` and `right` slots. |

`index.ts` re-exports all of the above. **Gaps:** `StatusChip` and `StatusSquare` duplicate their `VARIANT_CLASSES` map; `IntelligenceArchitecture` re-implements `SectionLabel` and status pills locally instead of importing; `StepPillNav` supports a `blocked` status no caller produces; several older pages (`Suite`, `AcceptInvite`, `NotFound`) still use raw shadcn cards, so the kit is only partially adopted.

**Brand components** (`src/components/canopy/`): `CanopyLogo` (PNG lockup, `variant` icon/horizontal/stacked kept for back-compat — all render the full lockup; `showByline` is a no-op since the wordmark is baked into the image), `CanopyAmbientGlow` (blurred gradient orb, `position`/`size`/`tone`/`opacity`/`animate`), `CanopyPanel` (glass surface wrapper over `.canopy-panel`, `bordered`/`interactive`/`padded`), `CanopyNodeField`. `Reveal` (`src/components/landing/Reveal.tsx`) wraps content in an IntersectionObserver-driven opacity/translate reveal (`from`: up/down/left/right/scale, `delay`, `distance`) built on `useScrollReveal`; `useScrollY` drives landing parallax.

---

# 5. Access-Suspension Mechanics — End to End

**1. Data model** (`supabase/migrations/20260427120000_agency_access_control.sql`)
`agencies` gains: `access_status` (`active | trial | suspended | disabled`, default `active`, CHECK-constrained, indexed), `trial_ends_at`, `suspension_reason`, `suspended_at`, `suspended_by`, `feature_flags` jsonb, `quotas` jsonb, `admin_notes`. New append-only `agency_access_log` (agency_id, action, performed_by, reason, metadata, `before_state`/`after_state` snapshots) with RLS: super admins SELECT all, agency owners SELECT their own, `INSERT WITH CHECK (false)` so only SECURITY DEFINER RPCs write.

**2. Server enforcement**
`agency_has_access(_agency_id)` → true when `access_status IN ('active','trial') AND (trial_ends_at IS NULL OR trial_ends_at > now())`. It is wired into the **write** RLS policies (`FOR ALL`, both USING and WITH CHECK) of `clients`, `projects`, `knowledge_documents`, and the `pending_invites` agency-invite INSERT policy. Reads remain permitted so the app can render the banner/reason. `agency_effective_status()` mirrors the trial-expiry computation server-side.

**3. Super-admin operations** — RPCs `suspend_agency`, `reactivate_agency`, `disable_agency`, `set_agency_trial`, `update_agency_feature_flags`, `update_agency_quotas`, `update_agency_admin_notes`, `list_agencies_for_admin`, `get_agency_access_log`, all `_require_super_admin()`-guarded, `GRANT`ed to `authenticated`, each snapshotting before/after into the audit log.

**4. Client hooks** — `useAccessControl.tsx` wraps every RPC in a `useMutation` that invalidates `["admin","agencies"]`, `["agency"]`, and the per-agency access log. `useAdminAgencies()` lists `AgencyAdminRow`s (status, effective status, owner email, member/client/project counts, last activity) with a 30s `staleTime`.

**5. Admin UI** — `/admin/agencies` (`AdminAgencies.tsx`): per-agency detail with **Suspend** (disabled unless `canSuspend`), **Disable** behind an `AlertDialog` confirmation, **Reactivate (set to Active)**, and a **Trial period** date input + "Set trial", plus status filters (Trial / Suspended / Disabled). Page subtitle: "Suspend, disable, set trial windows, and feature-flag every agency on the platform."

**6. Client state derivation** — `deriveAccessState()` in `useAgency`: `effectiveStatus` = raw status, flipped to `trial_expired` when `trial` and `trial_ends_at <= now`; `canWrite` = active or unexpired trial; `isLockedOut` = `disabled || trial_expired`; `isRestricted` = anything ≠ active; plus `suspensionReason`, `trialEndsAt`, `trialDaysRemaining` (ceil of days).

**7. Route gate** — `ProtectedRoute` step 4 redirects to `/access-suspended` when `enforceAccessGate && !isSuperAdmin && access.isLockedOut`. `/access-suspended` and `/onboarding/create-agency` opt out of the gate.

**8. Persistent banner** — `SuspensionBanner` (inside `AppLayout`, above `ProjectHeader`, `sticky top-0 z-40`, `role="alert"`): renders nothing for active agencies or trials with > 14 days left. Tones/icons/headlines by state — disabled (Lock, "Your access has been disabled."), suspended (AlertTriangle, "Your access is currently suspended."), trial_expired (Clock, "Your trial has ended."), trial warning (CheckCircle2, "Trial: N days remaining"). Detail line = `suspensionReason` or a state-specific fallback. A "Details" link → `/access-suspended` appears for the three hard states.

**9. Landing page** — `/access-suspended` as described in §2, with a bounce back to `/projects` when access is no longer restricted.

**Gaps in the suspension chain**
- **`suspended` is a soft state client-side.** `isLockedOut` excludes it, so a suspended agency navigates everywhere and only hits opaque RLS errors on write; the "Details" link is the only path to the explanation page. `AccessSuspended` itself is written to handle `suspended` — the gate just never sends them there.
- **`canWrite` is computed and never used.** No form, button, or mutation anywhere in `src/` reads it (verified by grep) — there is no client-side write-disabling for restricted agencies. Suspension is enforced only by RLS, so users get raw Postgres errors instead of disabled UI.
- **RLS coverage is partial.** `agency_has_access` gates `clients`, `projects`, `knowledge_documents`, and agency-invite inserts only. Other agency-scoped tables (project images, prompt artifacts, pricing/BOM, brand intelligence, activation types, etc.) are not gated by this function in this migration — a suspended agency may still be able to write to them.
- **Edge functions are not gated.** No generation/export function checks `agency_has_access`, so AI spend is not obviously blocked by suspension.
- `feature_flags` and `quotas` are stored, admin-editable, and audited, but **no client code reads them** — no feature is actually flag-gated and no quota is enforced.
- `SuspensionBanner` uses dark-theme token classes (`text-red-200`, `text-amber-100`) inside the light Flow C shell — likely low contrast on white.
- Trial-warning threshold (14 days) and the banner's own 5.5-day-style logic are hardcoded; `trialDaysRemaining` can render "0 days remaining" in the window before expiry flips.
- Super admins bypass the gate entirely, so there is no way to *see* the suspended experience from a platform account (and preview mode doesn't simulate it).

---

# 6. Cross-Cutting Gaps (observed, not inferred)

1. **Redirect-intent loss** — `ProtectedRoute` (`state.from`) and `AcceptInvite` (`?redirect=`) both pass a destination that `Auth.tsx` ignores; every login lands on `/projects`.
2. **Dead nav target** — `/platform-invites` in `platformOwnerNavItems` has no route.
3. **Orphan routes** — `/rhino`, `/knowledge-base`, `/team` are guarded and code-split but have no link anywhere in the app.
4. **Commented-out feature** — `/explore` (360° Explorer) route, lazy import, and step-nav entry all commented out while `Explore.tsx`, `BoothExplorer.tsx`, `PanoramaViewer.tsx` remain in the bundle-eligible tree.
5. **Preview mode advertises read-only but enforces nothing**, targets no specific agency, and is lost on refresh.
6. **No role guard in the routing layer** — five admin/account routes rely on server enforcement only; only `/admin/super-admins` self-guards.
7. **Two invite systems** (token/project vs. id/agency+super-admin) with only one landing page between them, plus a third legacy `team_members` invite path with an unimplemented accept flow.
8. **Brand inconsistency across the shell** — "BriefEngine" on `/invite/:token`; `hello@exhibitus.com` on `/access-suspended`; `canopy.gofightwin.co` on `/architecture`; "Canopy by Exhibitus" in `index.html`.
9. **RAG scope-count claim conflicts** — "4-scope" (hero + OG meta) vs "5-scope" (pillars, stats, intelligence section, `/architecture`).
10. **404 page is off-system** — no branding, raw anchor, no signed-in path back.
11. **Legacy/no-op API surface** — `AppLayout.surface`, `CanopyLogo.showByline`/`variant`, `useAuth.signUp`, `useGrantAdminRole`/`useRevokeAdminRole`, `void cn` in `IndustryDetail`.
12. **Project step completion is positional, not state-driven**, and `StepPillNav`'s `blocked` state is never used.
13. **Measurement-system preference is localStorage-only** with an in-code TODO to move it to a DB column.
14. **Suite budget rollup is an acknowledged stub** that sums only the parent project.