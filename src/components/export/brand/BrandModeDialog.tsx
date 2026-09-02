// BrandModeDialog — choose which brand the deck renders in.
//
// Three option cards (Agency / Client / Blend), each with a live mini-preview
// built by resolveBrandKit for that mode: lead logo, the two palette swatches,
// and an "Aa" sample in the deck heading face. Modes with blocking gaps
// (gapsBlockingMode) are disabled with a "Missing: …" note and a Fix-now
// affordance that hands off to the brand kit panel. Confirming persists
// { brandMode } into the project deck settings and returns the resolved kit.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useBrandSources, useFontLibraryPreview } from "@/hooks/useBrandKit";
import { useProjectDeck, useSaveProjectDeck } from "@/hooks/useProjectDeck";
import {
  gapsBlockingMode,
  resolveBrandKit,
  type BrandGap,
  type BrandKit,
  type BrandMode,
} from "@/lib/brandKit";
import { cn } from "@/lib/utils";

// ─── option metadata ─────────────────────────────────────────────────────────

const MODE_META: Record<BrandMode, { label: string; blurb: (agencyName: string | null, clientName: string | null) => string }> = {
  agency: {
    label: "Agency brand",
    blurb: (a) => `${a ?? "Your agency"}'s logo, palette, and typefaces throughout.`,
  },
  client: {
    label: "Client brand",
    blurb: (_a, c) => `${c ?? "The client"}'s logo and palette lead every slide.`,
  },
  blend: {
    label: "Blend",
    blurb: (a, c) =>
      `${c ?? "Client"} palette leads, ${a ?? "your agency"} co-brands cover and footers.`,
  },
};

const MODE_ORDER: BrandMode[] = ["agency", "client", "blend"];

// ─── mini preview strip ──────────────────────────────────────────────────────

function PreviewStrip({ kit }: { kit: BrandKit }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-border bg-white">
        {kit.leadLogoUrl ? (
          <img src={kit.leadLogoUrl} alt={kit.leadName ?? "Lead logo"} className="max-h-7 max-w-[85%] object-contain" />
        ) : (
          <span className="font-mono text-[10px] text-slate-faint">
            {(kit.leadName ?? "?").slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <span aria-hidden="true" className="h-9 w-5 rounded-[4px]" style={{ background: kit.primary }} />
      <span aria-hidden="true" className="h-9 w-5 rounded-[4px]" style={{ background: kit.secondary }} />
      <span
        className="text-[20px] leading-none text-navy"
        style={{ fontFamily: `'${kit.heading.family}', ${kit.heading.pptxFallback}` }}
      >
        Aa
      </span>
      {kit.coLogoUrl && (
        <div className="ml-auto flex h-7 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-border bg-cloud">
          <img src={kit.coLogoUrl} alt={kit.coName ?? "Co-brand logo"} className="max-h-5 max-w-[85%] object-contain" />
        </div>
      )}
    </div>
  );
}

// ─── dialog ──────────────────────────────────────────────────────────────────

export interface BrandModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null | undefined;
  clientId: string | null | undefined;
  /** Called with the resolved kit after the choice is persisted. */
  onConfirm: (kit: BrandKit) => void;
  /** "Fix now" on a blocked card — open the brand kit panel. */
  onFixGaps?: () => void;
}

export function BrandModeDialog({
  open,
  onOpenChange,
  projectId,
  clientId,
  onConfirm,
  onFixGaps,
}: BrandModeDialogProps) {
  useFontLibraryPreview();
  const { toast } = useToast();
  const { agency, client, gaps, isLoading } = useBrandSources(clientId);
  const { data: deck } = useProjectDeck(projectId);
  const saveDeck = useSaveProjectDeck(projectId);

  const [mode, setMode] = useState<BrandMode>("agency");

  // Preselect the persisted choice (or the first non-blocked mode) on open.
  useEffect(() => {
    if (!open) return;
    const saved = deck?.settings?.brandMode;
    if (saved && MODE_ORDER.includes(saved) && gapsBlockingMode(gaps, saved).length === 0) {
      setMode(saved);
      return;
    }
    const firstOpen = MODE_ORDER.find((m) => gapsBlockingMode(gaps, m).length === 0);
    if (firstOpen) setMode(firstOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deck?.settings?.brandMode, isLoading]);

  const blockingFor = (m: BrandMode): BrandGap[] => gapsBlockingMode(gaps, m);
  const selectedBlocked = blockingFor(mode).length > 0;

  const handleConfirm = async () => {
    if (selectedBlocked) return;
    const kit = resolveBrandKit(mode, agency, client);
    try {
      await saveDeck.mutateAsync({ settings: { brandMode: mode } });
      onConfirm(kit);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Couldn't save brand choice",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Deck brand</DialogTitle>
          <DialogDescription>
            Choose whose identity the deck renders in — logos, palette, and typefaces follow.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-4 w-4 animate-spin text-slate-faint" />
          </div>
        ) : (
          <div className="space-y-2.5">
            {MODE_ORDER.map((m) => {
              const meta = MODE_META[m];
              const blocking = blockingFor(m);
              const disabled = blocking.length > 0;
              const active = mode === m && !disabled;
              const kit = resolveBrandKit(m, agency, client);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => !disabled && setMode(m)}
                  aria-pressed={active}
                  aria-disabled={disabled}
                  className={cn(
                    "w-full rounded-lg border px-4 py-3 text-left transition-colors",
                    active
                      ? "border-navy bg-cloud"
                      : disabled
                        ? "cursor-not-allowed border-border bg-cloud/40 opacity-80"
                        : "border-border bg-white hover:border-navy/40",
                  )}
                >
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className={cn("text-[13px] font-semibold", disabled ? "text-slate" : "text-navy")}>
                      {meta.label}
                    </span>
                    {active && (
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-navy">
                        Selected
                      </span>
                    )}
                  </div>
                  {disabled ? (
                    <p className="text-[12px] leading-[17px] text-warn">
                      Missing: {blocking.map((g) => g.label).join(", ")} — fix in Brand kit.
                      {onFixGaps && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            onFixGaps();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              onFixGaps();
                            }
                          }}
                          className="ml-1.5 cursor-pointer font-semibold text-navy underline underline-offset-2"
                        >
                          Fix now
                        </span>
                      )}
                    </p>
                  ) : (
                    <>
                      <PreviewStrip kit={kit} />
                      <p className="mt-2 text-[12px] leading-[17px] text-slate">
                        {meta.blurb(agency.name, client.name)}
                      </p>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading || selectedBlocked || saveDeck.isPending}>
            {saveDeck.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Use {MODE_META[mode].label.toLowerCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
