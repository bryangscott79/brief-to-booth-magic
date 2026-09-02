// DeckVersionRail — compact, linear version history for the deck.
//
// One chip per version, oldest → newest: "v1 · Compiled", "v2 · Make the
// cover navy", … Click a chip to PREVIEW that version (the grid, focus view
// and downloads follow it); "Restore" makes it current by appending a fresh
// "Restored vN" version — history is never rewritten. Double-click a chip
// (or its pencil) to label it inline.
//
// Flow C: current = navy chip; the one being viewed = navy ring + pink dot;
// the rest = white hairline chips. Everything measured is mono.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/shell";
import { versionNumber, versionTitle, type DeckVersion } from "@/lib/deckOps";
import { cn } from "@/lib/utils";

export interface DeckVersionRailProps {
  versions: DeckVersion[];
  currentVersionId: string | null;
  /** Version being previewed; null = the current one. */
  viewingId: string | null;
  onView: (id: string | null) => void;
  onRestore: (id: string) => void;
  onRename: (id: string, label: string) => void;
  className?: string;
}

function VersionChip({
  version,
  versions,
  isCurrent,
  isViewing,
  onView,
  onRename,
}: {
  version: DeckVersion;
  versions: DeckVersion[];
  isCurrent: boolean;
  isViewing: boolean;
  onView: () => void;
  onRename: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(version.label ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if ((version.label ?? "") !== draft.trim()) onRename(draft);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      setDraft(version.label ?? "");
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        maxLength={60}
        placeholder={version.message}
        aria-label={`Label for v${versionNumber(versions, version)}`}
        className="h-7 w-[180px] rounded-full border border-navy bg-white px-2.5 font-mono text-[11px] text-navy outline-none"
      />
    );
  }

  return (
    <span className="group relative inline-flex shrink-0 items-center">
      <button
        type="button"
        onClick={onView}
        onDoubleClick={() => setEditing(true)}
        title={`${version.message}${version.summary ? ` — ${version.summary}` : ""}\n${new Date(version.createdAt).toLocaleString()}`}
        aria-pressed={isViewing}
        aria-current={isCurrent ? "true" : undefined}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 pr-6 font-mono text-[11px] font-medium tracking-tight transition-colors",
          isCurrent && !isViewing && "border-navy bg-navy text-white",
          isViewing && "border-navy bg-white text-navy ring-2 ring-navy ring-offset-1",
          !isCurrent && !isViewing && "border-border bg-white text-slate hover:border-navy/40 hover:text-navy",
        )}
      >
        {isViewing && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-pink-deep" />}
        {versionTitle(versions, version)}
      </button>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Rename v${versionNumber(versions, version)}`}
        className={cn(
          "absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100",
          isCurrent && !isViewing ? "text-white/70 hover:text-white" : "text-slate-faint hover:text-navy",
        )}
      >
        <Pencil className="h-3 w-3" strokeWidth={1.5} />
      </button>
    </span>
  );
}

export function DeckVersionRail({
  versions,
  currentVersionId,
  viewingId,
  onView,
  onRestore,
  onRename,
  className,
}: DeckVersionRailProps) {
  if (versions.length === 0) return null;
  const viewing = viewingId && viewingId !== currentVersionId ? versions.find((v) => v.id === viewingId) ?? null : null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-3">
        <SectionLabel accent="blue">Versions</SectionLabel>
        <span className="font-mono text-[11px] text-slate">{versions.length}</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="list" aria-label="Deck versions">
        {versions.map((v) => (
          <span key={v.id} role="listitem">
            <VersionChip
              version={v}
              versions={versions}
              isCurrent={v.id === currentVersionId}
              isViewing={!!viewing && v.id === viewing.id}
              onView={() => onView(v.id === currentVersionId ? null : v.id)}
              onRename={(label) => onRename(v.id, label)}
            />
          </span>
        ))}
      </div>
      {viewing && (
        <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-border bg-cloud/60 px-3 py-2">
          <p className="min-w-0 flex-1 text-[12px] text-charcoal">
            Viewing <span className="font-mono font-semibold text-navy">v{versionNumber(versions, viewing)}</span>
            {viewing.summary ? <span className="text-slate"> — {viewing.summary}</span> : null}. Downloads export this version.
          </p>
          <button type="button" onClick={() => onView(null)} className="text-[12px] text-slate underline-offset-2 hover:text-navy hover:underline">
            Back to current
          </button>
          <Button size="sm" onClick={() => onRestore(viewing.id)} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
            Restore
          </Button>
        </div>
      )}
    </div>
  );
}
