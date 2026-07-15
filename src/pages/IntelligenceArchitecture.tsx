// Intelligence Architecture — public, shareable page documenting how Canopy
// stores, retrieves, and learns from agency + client data. The visual twin of
// docs/intelligence/ (keep both in sync). Route: /architecture
import { Link } from "react-router-dom";
import { CanopyMark } from "@/components/shell";

/* ── tiny local primitives (page is public; keep it dependency-light) ─── */

type Status = "live" | "partial" | "planned";

const STATUS_STYLE: Record<Status, { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-green-soft text-pass" },
  partial: { label: "Partial", cls: "bg-amber-soft text-warn" },
  planned: { label: "Planned", cls: "border border-cloud-line bg-white text-slate" },
};

function StatusPill({ status }: { status: Status }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}

function SectionLabel({ swatch, color, children }: { swatch: string; color: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="inline-block h-2 w-2 rounded-[2px]" style={{ backgroundColor: swatch }} />
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color }}>
        {children}
      </span>
    </div>
  );
}

/* ── content data ──────────────────────────────────────────────────────── */

const LOOP_STEPS = [
  { n: "1", title: "Capture", body: "Approvals, refine feedback, gap answers, deck picks — logged as append-only events at the moment they happen.", status: "planned" as Status },
  { n: "2", title: "Distill", body: "At project close, the event stream + render records are distilled into proposed learnings with provenance.", status: "partial" as Status },
  { n: "3", title: "Approve", body: "A human reviews every proposed entry. Nothing auto-extracted reaches generation unapproved.", status: "live" as Status },
  { n: "4", title: "Retrieve", body: "Scope-weighted retrieval: structured facts injected deterministically, semantic entries ranked by relevance × confidence × recency.", status: "partial" as Status },
  { n: "5", title: "Generate", body: "Elements, renders, and decks are produced with the full weight of client + agency memory — and their outcomes feed step 1.", status: "live" as Status, generative: true },
];

const TABLES = [
  {
    name: "brand_intelligence",
    status: "live" as Status,
    purpose: "The client memory core. Per-client knowledge entries with categories, confidence, provenance, and the human approval gate.",
    fields: ["client_id", "category ×6", "source", "confidence_score", "is_approved", "source_project_id"],
    planned: "embedding · use_count · supersedes_id · scope",
  },
  {
    name: "brand_guidelines",
    status: "live" as Status,
    purpose: "Structured brand facts — colors, typography, logo rules, tone, photography. Injected deterministically, never left to a similarity race.",
    fields: ["color_system", "typography", "tone_of_voice", "photography_style", "materials_finishes"],
  },
  {
    name: "knowledge_documents + embeddings",
    status: "live" as Status,
    purpose: "The RAG corpus. Uploaded briefs, RFPs, and playbooks — chunked, embedded (pgvector), retrieved with agency / client / project scope weighting.",
    fields: ["embedding (pgvector)", "scope weighting", "auto-tag", "auto-summary"],
  },
  {
    name: "project_images.prompt_artifacts",
    status: "live" as Status,
    purpose: "Outcome ↔ input linkage. Every render stores the exact prompt, references, config, and approvals that produced it.",
    fields: ["prompt", "negative", "geometry", "references", "configKey", "hangingApproved"],
  },
  {
    name: "Agency-scope data",
    status: "live" as Status,
    purpose: "Knowledge that crosses clients: show costs per venue and size, rate data, agency playbook documents, company profile.",
    fields: ["show_costs", "pricing", "agency knowledge docs"],
  },
  {
    name: "learning_events",
    status: "planned" as Status,
    purpose: "The missing piece — an append-only signal log. Every judgment a user makes becomes history instead of being discarded.",
    fields: ["event_type", "payload jsonb", "client_id", "project_id", "created_at"],
  },
];

const SIGNALS = [
  { signal: "Brand pull / brand-book extraction", teaches: "Baseline brand system", status: "live" as Status },
  { signal: "Gap answers in Review (venue, hex codes)", teaches: "Ground-truth corrections to parsing", status: "partial" as Status },
  { signal: "Element regeneration + feedback text", teaches: "What the concept got wrong, in the user's words", status: "planned" as Status },
  { signal: "Hero version approved vs. regenerated", teaches: "Which render direction won", status: "partial" as Status },
  { signal: "Hanging-element refine feedback", teaches: "Structured design critique", status: "partial" as Status },
  { signal: "Featured-render selection for decks", teaches: "Which images represent the project", status: "planned" as Status },
  { signal: "Deck register choice (Pitch / Executive / …)", teaches: "Client presentation taste", status: "planned" as Status },
  { signal: "Materials edited in Spatial", teaches: "Real material preferences vs. generated", status: "planned" as Status },
  { signal: "Final budget vs. estimate", teaches: "Estimate calibration per client & venue", status: "planned" as Status },
  { signal: "Project-close learning extraction", teaches: "Distilled lessons → intelligence entries", status: "live" as Status },
];

const PHASES = [
  { n: "01", title: "Capture", status: "planned" as Status, body: "Create learning_events; write events at every judgment call site. Zero behavior change — everything downstream depends on this history existing." },
  { n: "02", title: "Distill & propose", status: "planned" as Status, body: "extract-learnings reads the event stream at project close and proposes entries with provenance. Proposals land unapproved in the existing review queue." },
  { n: "03", title: "Retrieve & reinforce", status: "planned" as Status, body: "Embeddings on intelligence entries; relevance × confidence × recency under a token budget. Entries gain confidence when reused in approved work; contradictions supersede." },
  { n: "04", title: "Agency flywheel", status: "planned" as Status, body: "Client-agnostic agency-scope entries — what wins pitches, materials that survive the shop, freight reality — plus estimate calibration from final budgets." },
];

/* ── page ──────────────────────────────────────────────────────────────── */

export default function IntelligenceArchitecture() {
  return (
    <div className="min-h-screen bg-cloud text-navy" style={{ colorScheme: "light" }}>
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-cloud-line bg-white px-6 py-4 md:px-12">
        <div className="flex items-center gap-3">
          <CanopyMark size={26} />
          <span className="text-[15px] font-bold tracking-[0.22em] text-navy">CANOPY</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-slate-faint sm:inline">
            Intelligence architecture · living document
          </span>
        </div>
        <Link to="/" className="text-[13px] font-semibold text-link">
          canopy.gofightwin.co →
        </Link>
      </header>

      {/* Hero — ink band */}
      <section className="bg-navy px-6 py-14 text-white md:px-12">
        <div className="mx-auto max-w-5xl">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.08em] text-grad-a">
            The intelligence layer
          </p>
          <h1 className="text-[34px] font-bold leading-[40px] tracking-[-0.015em] md:text-[42px] md:leading-[48px]">
            Memory that compounds.
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-[23px] text-white/72">
            Canopy stores, retrieves, and learns from agency and client data — so every new
            activation starts with the context of everything that came before it, and every
            user judgment makes the next project smarter.
          </p>
          <div className="mt-8 flex flex-col gap-4 md:flex-row">
            <div className="flex-1 rounded-[14px] p-5" style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#8FD3F4" }}>Client memory</p>
              <p className="mt-2 text-[13px] leading-[19px] text-white/72">
                A client's third brief starts smarter than its first: locked brand system,
                approved voice, and what their reviewers rejected last time.
              </p>
            </div>
            <div className="flex-1 rounded-[14px] p-5" style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#F472B6" }}>Agency memory</p>
              <p className="mt-2 text-[13px] leading-[19px] text-white/72">
                Knowledge that crosses clients: what wins pitches, real freight costs,
                which materials survive the shop.
              </p>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-6 py-12 md:px-12">
        {/* The loop */}
        <SectionLabel swatch="#8FD3F4" color="#22729C">The learning loop</SectionLabel>
        <h2 className="text-[20px] font-bold leading-[26px] tracking-[-0.01em]">Five stages, one flywheel</h2>
        <p className="mt-1 text-[13px] text-slate">Outcomes feed back into capture — the loop closes on itself.</p>
        <div className="mt-6 grid gap-3 md:grid-cols-5">
          {LOOP_STEPS.map((s) => (
            <div key={s.n} className="flex flex-col gap-2 rounded-[14px] border border-cloud-line bg-white p-4">
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-[26px] w-[26px] items-center justify-center rounded-[7px] font-mono text-[12px] font-semibold ${s.generative ? "text-white" : "bg-navy text-white"}`}
                  style={s.generative ? { background: "linear-gradient(135deg, #4F6BE8, #7C3AED)" } : undefined}
                >
                  {s.generative ? "✦" : s.n}
                </span>
                <StatusPill status={s.status} />
              </div>
              <p className="text-[14px] font-semibold text-navy">{s.title}</p>
              <p className="text-[12px] leading-[17px] text-slate">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-[10px] bg-pink-soft px-4 py-3">
          <p className="text-[13px] leading-[19px]">
            <span className="font-semibold text-pink-deep">Two invariants: </span>
            <span className="text-charcoal">
              nothing auto-extracted reaches generation without human approval, and client
              scope is a wall — one client's learnings never appear in another client's work.
            </span>
          </p>
        </div>

        {/* Data model */}
        <div className="mt-14">
          <SectionLabel swatch="#6FA8FF" color="#4F6BE8">Data model</SectionLabel>
          <h2 className="text-[20px] font-bold leading-[26px] tracking-[-0.01em]">The memory substrate</h2>
          <p className="mt-1 text-[13px] text-slate">
            Supabase end-to-end: pgvector for semantic retrieval, JSONB for structured payloads. No external vector database.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {TABLES.map((t) => (
              <div key={t.name} className="rounded-[14px] border border-cloud-line bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-mono text-[13px] font-semibold text-navy">{t.name}</p>
                  <StatusPill status={t.status} />
                </div>
                <p className="mt-2 text-[13px] leading-[19px] text-charcoal">{t.purpose}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {t.fields.map((f) => (
                    <span key={f} className="rounded-[4px] bg-cloud px-2 py-0.5 font-mono text-[10px] text-slate">
                      {f}
                    </span>
                  ))}
                </div>
                {t.planned && (
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.05em] text-slate-faint">
                    Planned: {t.planned}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Signals */}
        <div className="mt-14">
          <SectionLabel swatch="#A78BFA" color="#6D4BC7">Learning signals</SectionLabel>
          <h2 className="text-[20px] font-bold leading-[26px] tracking-[-0.01em]">Every judgment is training data</h2>
          <p className="mt-1 text-[13px] text-slate">User actions that encode taste and truth — and whether we keep them yet.</p>
          <div className="mt-6 overflow-hidden rounded-[14px] border border-cloud-line bg-white">
            {SIGNALS.map((s, i) => (
              <div key={s.signal} className={`flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:gap-4 ${i > 0 ? "border-t border-cloud-line" : ""}`}>
                <p className="flex-1 text-[13px] font-semibold text-navy">{s.signal}</p>
                <p className="flex-1 text-[13px] text-slate">{s.teaches}</p>
                <StatusPill status={s.status} />
              </div>
            ))}
          </div>
        </div>

        {/* Roadmap */}
        <div className="mt-14">
          <SectionLabel swatch="#F472B6" color="#DB2777">Roadmap</SectionLabel>
          <h2 className="text-[20px] font-bold leading-[26px] tracking-[-0.01em]">Build order</h2>
          <p className="mt-1 text-[13px] text-slate">Capture first — everything downstream depends on the history existing.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {PHASES.map((p) => (
              <div key={p.n} className="rounded-[14px] border border-cloud-line bg-white p-5">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[12px] font-semibold text-slate-faint">PHASE {p.n}</p>
                  <StatusPill status={p.status} />
                </div>
                <p className="mt-1 text-[15px] font-semibold text-navy">{p.title}</p>
                <p className="mt-2 text-[13px] leading-[19px] text-charcoal">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-cloud-line bg-white px-6 py-6 md:px-12">
        <div className="mx-auto flex max-w-5xl flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-faint">
            Maintained alongside the code in docs/intelligence · Canopy by Exhibitus
          </p>
          <Link to="/" className="text-[12px] font-semibold text-link">Back to Canopy →</Link>
        </div>
      </footer>
    </div>
  );
}
