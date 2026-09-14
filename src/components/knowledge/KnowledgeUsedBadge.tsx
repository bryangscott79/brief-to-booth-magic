// "What did the house know about this?" — answered on screen.
//
// Retrieval is invisible when it works and equally invisible when it does
// not, which is how Canopy's knowledge base ran dead for four months while
// every screen claimed to use "weighted context". This badge makes the
// claim checkable: it names the agency's own documents that shaped a
// generation, and it renders nothing at all when none did.

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { BookOpen, Pin } from "lucide-react";
import { knowledgeLabel, SCOPE_LABEL, type KnowledgeUsed } from "@/lib/knowledgeUsed";

export function KnowledgeUsedBadge({
  knowledge,
  className,
}: {
  knowledge: KnowledgeUsed | null | undefined;
  className?: string;
}) {
  // Absent is not the same as zero: an older edge-function deployment omits
  // the field entirely. Either way there is nothing honest to show.
  if (!knowledge || knowledge.chunks === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "mt-1.5 inline-flex items-center gap-1 rounded-tag border border-cloud-line bg-white px-1.5 py-0.5",
            "font-mono text-[10px] font-semibold tracking-tight text-slate",
            "transition-colors hover:border-slate-300 hover:text-charcoal",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/20",
            className,
          )}
        >
          <BookOpen className="h-3 w-3" aria-hidden />
          {knowledgeLabel(knowledge)}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b border-cloud-line px-3 py-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-faint">
            From your knowledge base
          </p>
        </div>

        <ul className="max-h-64 overflow-y-auto py-1">
          {knowledge.sources.map((s) => (
            <li key={s.document_id || s.title} className="flex items-start gap-2 px-3 py-1.5">
              {s.pinned ? (
                <Pin className="mt-[3px] h-3 w-3 shrink-0 text-[#DB2777]" aria-hidden />
              ) : (
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-faint" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="truncate text-[12px] leading-[17px] text-charcoal">{s.title}</p>
                <p className="font-mono text-[10px] text-slate-faint">
                  {SCOPE_LABEL[s.scope]}
                  {s.pinned && " · pinned"}
                </p>
              </div>
            </li>
          ))}

          {knowledge.sources.length === 0 && (
            <li className="px-3 py-2 text-[12px] text-slate-faint">
              {knowledge.chunks} passage{knowledge.chunks === 1 ? "" : "s"} used — the source
              documents could not be named.
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
