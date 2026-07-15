# CANOPY Flow C — full-flow artboard spec

Every file in this folder is ONE Paper artboard: a self-contained HTML document
(inline CSS, no external requests) that renders a full app screen at **1440px
wide** in the Flow C design language. These are authored to be pushed into the
Paper file "CANOPY" via `create_artboard` + `write_html` (the artboard number
in the filename continues Paper's numbering from 23), and to render standalone
in any browser for the gallery (`index.html`).

Ground truth is the implemented app, NOT imagination: before authoring a board,
read the real page component in `src/pages/` (and the shell components in
`src/components/shell/`, `src/components/layout/AppSidebar.tsx`) and depict
what the screen actually shows, upgraded to ideal demo data.

## File conventions

- Filename: `NN-slug.html` (NN = Paper artboard number, see README manifest).
- Structure: `<!doctype html><html><head><meta charset><style>…</style></head><body>…</body>`.
- Artboard root: `<div class="artboard">` — width 1440px, min-height 900px,
  `display:flex`, background `var(--cloud)`. No page margins (`body{margin:0}`).
- All colors via CSS custom properties from the token block below — copy it
  verbatim into every file. No other colors, no shadows, no border-radius
  values outside the radius scale.
- Fonts: `font-family:'Inter',-apple-system,sans-serif` base;
  `font-family:'IBM Plex Mono',ui-monospace,monospace` for anything measured.
  Load nothing — system fallbacks are fine in the gallery; Paper has both fonts.
- Icons: small inline SVGs, `stroke-width:1.3`, `stroke:currentColor`,
  `fill:none`, 14–16px. Simple geometric approximations of lucide are fine.
- Each file ends with an HTML comment: `<!-- artboard NN · <title> · role: agency|super-admin -->`.

## Token block (copy verbatim)

```css
:root{
  --navy:#0B1B2B; --charcoal:#1F2937; --slate:#64748B; --slate-faint:#94A3B8;
  --cloud-line:#E2E8F0; --cloud:#F6F8FA; --white:#FFFFFF;
  --sky:#8FD3F4; --blue:#6FA8FF; --violet:#A78BFA; --purple:#C084FC; --pink:#F472B6;
  --pink-deep:#DB2777; --pink-soft:#FDF2F8;
  --red:#D2322A; --red-soft:#FEF2F2;
  --amber:#B25E09; --amber-soft:#FFFBEB; --amber-on-ink:#F5B266;
  --green:#0C7C3F; --green-soft:#F0FDF4; --green-on-ink:#34D399;
  --grad-action:linear-gradient(90deg,#4F6BE8 0%,#7C3AED 55%,#DB2777 100%);
  --grad-brand:linear-gradient(90deg,#8FD3F4,#6FA8FF,#A78BFA,#C084FC,#F472B6);
  --r-chip:4px; --r-btn:6px; --r-well:8px; --r-card:14px; --r-sheet:20px;
}
```

## Color grammar (non-negotiable)

- Solid red = BLOCKING only. Amber = warning. `--pink-deep` = attention /
  urgent action. Green = pass/active. On navy, use the `-on-ink` variants.
- `--grad-action` is reserved for the ONE generative primary CTA per screen
  (the ✦ button). White text is safe on it.
- `--grad-brand` is an accent only (underlines, accent bars, the mark) —
  NEVER under white text.
- Everything else is navy/charcoal/slate on white/cloud with `--cloud-line`
  hairlines. No shadows anywhere.

## Type scale

- Page title: 28px/34px Inter 700, letter-spacing -0.015em, navy.
- Eyebrow: 10px mono, 600, uppercase, +0.08em, `--slate` (e.g. `EXHIBITUS · 15 ACTIVE PROJECTS`).
- Section label: 10px caps 700 +0.08em, colored per gradient stop, preceded by
  an 8px rounded-2px swatch of the same color. On white sheets use darker
  text-safe versions: sky→#0E7490, blue→#1D4ED8, violet→#6D28D9,
  purple→#9333EA, pink→#DB2777 (swatch keeps the pastel stop color).
- Body 13px/19px; hints 12px `--slate`; card titles 16px/600 navy.
- Everything measured (dimensions, counts, costs, dates, percentages) is mono.

## Page anatomy — site-level screen

```
artboard (flex row)
├─ sidebar 224px, white, border-right 1px cloud-line, flex column
│  ├─ header row: CanopyMark 26px + "CANOPY" (13px 700 caps +0.22em navy); border-bottom
│  ├─ workspace label: 10px mono caps slate-faint, px 12 (e.g. "EXHIBITUS")
│  ├─ nav items: 13px, icon 14px stroke 1.3, gap 12, px 12 py 8;
│  │  active = border-left 2px navy + cloud bg + 600 navy; inactive = slate, medium
│  └─ footer (margin-top auto, border-top): 28px round avatar + email 12px slate + sign-out icon
└─ main (flex 1, cloud bg, padding 20px 40px)
   ├─ PageHeader: eyebrow / title (+ inline chips) / one 13px slate subtitle line;
   │  actions right-aligned (search input, selects, buttons)
   └─ content: white cards r14 hairline, tables as open rows with hairline
      dividers, colored SectionLabels between groups
```

### Super-admin sidebar variant
Header swaps the mark for a 36px amber (#F59E0B) square r6 with a white crown
+ "PLATFORM ADMIN" (10px amber-600 caps +0.1em). Workspace label = "PLATFORM".
Nav = Accounts / Agencies / Industries / Super Admins / Invites. Above the
footer: dashed-border button "👁 Preview as Agency Admin" (12px slate).
Footer avatar = amber-tinted circle with crown.

### Preview-mode variant (super admin browsing as agency)
Agency sidebar + an amber banner card above the nav: eye icon,
"Preview Mode" 11px amber-700, "Exit" link right, "Read-only agency view"
10px amber-600/70.

## Page anatomy — project step screen

```
main
├─ project bar: back chevron + project name 15px 600 navy + client · booth size
│  (mono 11px slate) left; step pill nav right
├─ step pill nav: 6 pills in a cloud track r-full; each "01 Brief" 12px;
│  completed = white pill + navy ✓; active = white pill + navy 600 text +
│  2px brand-gradient underline; blocked step shows 6px red dot; upcoming = slate
├─ flex row gap 20
│  ├─ WorkSheet (flex 1): white r20 hairline; header band: cloud bg,
│  │  border-bottom, padding 18px 28px, eyebrow `STEP 0n / 06` + 20px/700
│  │  navy title + right-side status chips; body padding 28px
│  └─ InkRail 372px: navy r20, padding 26px 28px, self-start (hugs content);
│     collapse chevron top-right (white/55); RailTitle 11px caps white +
│     hint 12px white/56; sections: colored caps label (pastel stop + 8px
│     swatch) + hairline dividers rgba(255,255,255,0.14); rows:
│     label white/72 left, value white 500 right (mono when measured);
│     on-ink tones: pass #34D399, warn #F5B266, attention #F472B6
```

## Components quick reference

- **StatusChip**: 11px 600, r4, padding 2px 8px; soft bg + dark text pairs:
  green-soft/green "Active"/"PASS", amber-soft/amber "WARN", red-soft/red
  "BLOCKING" (solid red bg + white text for hard blocking), violet-soft
  (#F5F3FF)/#6D28D9 "BETA"/"Built-in", pink-soft/pink-deep attention.
- **Count pill**: white bg, hairline, r-full, mono 11px navy (`12`).
- **IconWell**: 36px, cloud bg, r8, navy 1.3-stroke icon centered;
  `generative` variant = grad-action bg + white glyph.
- **EmptyState**: centered, 48px IconWell, 16px/600 navy title, 13px slate
  line, then a navy button.
- **Buttons**: primary = navy bg, white 13px 600, r6, padding 8px 16px;
  secondary = white bg hairline navy text; generative = grad-action bg,
  white, "✦ " prefix — max ONE per screen.
- **Inputs**: white bg, hairline, r6, 13px, placeholder slate-faint; search
  gets a 14px magnifier icon inside.
- **CanopyMark** (inline SVG, 26px):

```html
<svg width="26" height="26" viewBox="0 0 100 100">
  <defs><linearGradient id="cm" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#8FD3F4"/><stop offset=".28" stop-color="#6FA8FF"/>
    <stop offset=".55" stop-color="#A78BFA"/><stop offset=".78" stop-color="#C084FC"/>
    <stop offset="1" stop-color="#F472B6"/></linearGradient></defs>
  <g fill="url(#cm)">
    <path d="M50,50 L93.9,52.3 Q83,66 82.7,79.4 Z"/><path d="M50,50 L79.4,82.7 Q66,83 52.3,93.9 Z"/>
    <path d="M50,50 L47.7,93.9 Q34,83 20.6,82.7 Z"/><path d="M50,50 L17.3,79.4 Q17,66 6.1,52.3 Z"/>
    <path d="M50,50 L6.1,47.7 Q17,34 17.3,20.6 Z"/><path d="M50,50 L20.6,17.3 Q34,17 47.7,6.1 Z"/>
    <path d="M50,50 L52.3,6.1 Q66,17 79.4,17.3 Z"/><path d="M50,50 L82.7,20.6 Q83,34 93.9,47.7 Z"/>
  </g>
  <g><circle cx="98" cy="50" r="3" fill="#F472B6"/><circle cx="84" cy="84" r="3" fill="#F472B6"/>
  <circle cx="50" cy="98" r="3" fill="#C084FC"/><circle cx="16" cy="84" r="3" fill="#A78BFA"/>
  <circle cx="2" cy="50" r="3" fill="#8FD3F4"/><circle cx="16" cy="16" r="3" fill="#8FD3F4"/>
  <circle cx="50" cy="2" r="3" fill="#6FA8FF"/><circle cx="84" cy="16" r="3" fill="#6FA8FF"/></g>
</svg>
```

## Demo data (keep consistent across boards)

- Agency: **Exhibitus** (bryan@exhibitus.co). 15 active projects, 8 clients.
- Clients: Samsung (4 projects), Nike (3), Delta Air Lines (2), Patagonia (2),
  Sonos (1), Rivian (1), Figma (1), Chewy (1).
- Flagship project: **Samsung — CES 2027** · Trade Show Booth · configs
  20×40 / 20×20 / 10×20 · budget premium ($185,000) · status In Progress.
- Others: Nike — SXSW Activation House, Delta — Business Travel Show 20×20,
  Patagonia — Outdoor Retailer 10×20 (BLOCKING: missing brand guide),
  Sonos — CEDIA Expo 20×20.
- Activation types: Trade Show Booth (built-in), Conference & Summit (built-in),
  Experiential Pop-Up (built-in), Retail Installation (custom), Mobile Tour
  (custom), Gaming & Esports (custom).
- Platform: 12 agencies, 47 users, 214 projects, 3 super admins;
  agencies incl. Exhibitus, Freeman Digital, Impact XM, George P. Johnson.
- Reference rail content mirrors the parsed brief: goals, audience, budget
  tier, brand pulls (colors/logo), spatial facts (mono ft), blocking items.

## Checklist per board

1. Read the real page component first; depict its actual sections/controls.
2. Exactly one grad-action CTA max; correct chip grammar; mono for measured.
3. Sidebar matches role; correct item active.
4. Realistic demo data from the table above — never lorem ipsum.
5. Self-contained: no external URLs, fonts, or images (SVG/CSS only).
6. Footer comment with artboard number, title, role.
