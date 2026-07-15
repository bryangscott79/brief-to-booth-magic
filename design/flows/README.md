# CANOPY — full-flow artboards (Paper import set)

Every screen of the app in the Flow C design language, for both roles, as
self-contained HTML artboards. Continues the Paper file "CANOPY"
(`01KWH4P4TDHVWQFPPSTEHG0FMT`) numbering after artboard 23 (the design-system
boards). Browse them locally via `index.html` (with the dev server running:
`http://localhost:8080/@fs/<repo>/design/flows/index.html`).

## Importing into Paper

For each file, in order: `create_artboard` (name it `NN — Title`, 1440 wide)
then `write_html` with the file's `<body>` contents and the `<style>` block.
The token block in each file matches the tokens already defined in the Paper
file; fonts (Inter, IBM Plex Mono) exist there. See SPEC.md for the design
contract these boards follow.

## Manifest

| # | File | Screen | Role |
|---|------|--------|------|
| 24 | 24-projects-home.html | Projects home (client-grouped rows) | agency |
| 25 | 25-clients.html | Clients | agency |
| 26 | 26-client-dashboard.html | Client dashboard (Samsung) | agency |
| 27 | 27-activation-types.html | Activation types (grid) | agency |
| 28 | 28-activation-type-dashboard.html | Activation type detail | agency |
| 29 | 29-agency-knowledge.html | Agency knowledge | agency |
| 30 | 30-agency-pricing.html | Agency pricing (BOM index) | agency |
| 31 | 31-project-pricing-bom.html | Project pricing / BOM editor | agency |
| 32 | 32-company-profile.html | Company profile | agency |
| 33 | 33-team.html | Team & invites | agency |
| 34 | 34-agency-admin-settings.html | Agency admin settings (project types) | agency admin |
| 35 | 35-step-01-brief.html | Step 01 · Brief | agency |
| 36 | 36-step-02-review.html | Step 02 · Review | agency |
| 37 | 37-step-03-concept.html | Step 03 · Concept | agency |
| 38 | 38-step-04-spatial.html | Step 04 · Spatial | agency |
| 39 | 39-step-05-render.html | Step 05 · Render | agency |
| 40 | 40-step-06-export.html | Step 06 · Export | agency |
| 41 | 41-files.html | Project files | agency |
| 42 | 42-project-knowledge-base.html | Project knowledge base | agency |
| 43 | 43-platform-accounts.html | Platform · Accounts | super admin |
| 44 | 44-admin-agencies.html | Platform · Agencies | super admin |
| 45 | 45-admin-industries.html | Platform · Industries | super admin |
| 46 | 46-industry-dashboard.html | Platform · Industry dashboard | super admin |
| 47 | 47-super-admins.html | Platform · Super admins | super admin |
| 48 | 48-agency-account.html | Platform · Agency account drill-in | super admin |
| 49 | 49-preview-mode.html | Preview mode (agency view + banner) | super admin (preview) |
| 50 | 50-role-nav-matrix.html | Roles & navigation matrix | reference board |

The six project steps (35–40) supersede the earlier exploratory step boards
(Paper artboards 15, 17–21) as the current, implementation-accurate flow;
keep the old ones for history or archive them.
