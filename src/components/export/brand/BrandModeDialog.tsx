// BrandModeDialog — choose which brand the deck renders in, and in which
// style.
//
// Three brand-mode cards (Agency / Client / Blend), each with a live
// mini-preview built by resolveBrandKit for that mode: lead logo, the two
// palette swatches, and an "Aa" sample in the deck heading face. Modes with
// blocking gaps (gapsBlockingMode) are disabled with a "Missing: …" note and a
// Fix-now affordance that hands off to the brand kit panel.
//
// Beneath them, a row of four compact style cards (deckStyle.DECK_STYLES) —
// Pitch / Executive / Editorial / Tactical — each with a tiny CSS-drawn cover
// silhouette. Confirming persists { brandMode, style } into the project deck
// settings and returns the resolved kit + style id.

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
import { DECK_STYLES, DEFAULT_DECK_STYLE, isDeckStyleId, type DeckStyleId } from "@/lib/deckStyle";
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

// ─── style thumbnails ────────────────────────────────────────────────────────

/** Abstract cover silhouette per style, drawn with CSS in the chosen kit's
 *  palette (64×36, 16:9). Reads as the cover treatment each style uses:
 *  field / quiet / editorial / grid — see deckStyle.ts. */
function StyleThumb({ id, primary, secondary }: { id: DeckStyleId; primary: string; secondary: string }) {
  const frame = "relative h-9 w-16 shrink-0 overflow-hidden rounded-[3px]";
  switch (id) {
    case "pitch":
      return (
        <div aria-hidden="true" className={frame} style={{ background: primary }}>
          <span className="absolute -right-3 -top-4 h-9 w-9 rounded-full" style={{ background: secondary, opacity: 0.45 }} />
          <span className="absolute left-[7px] top-[13px] h-[2px] w-[9px]" style={{ background: secondary }} />
          <span className="absolute left-[7px] top-[18px] h-[5px] w-[30px] rounded-[1px] bg-white" />
          <span className="absolute left-[7px] top-[26px] h-[2px] w-[20px] bg-white/60" />
        </div>
      );
    case "executive":
      return (
        <div aria-hidden="true" className={cn(frame, "border border-border bg-white")}>
          <span className="absolute left-[7px] right-[7px] top-[9px] h-px" style={{ background: primary }} />
          <span className="absolute left-[7px] top-[17px] h-[4px] w-[26px] rounded-[1px]" style={{ background: primary }} />
          <span className="absolute left-[7px] top-[24px] h-[2px] w-[18px] bg-slate-faint/70" />
        </div>
      );
    case "editorial":
      return (
        <div aria-hidden="true" className={cn(frame, "border border-border bg-white")}>
          <span className="absolute left-[7px] top-[5px] h-[1.5px] w-[10px] bg-slate-faint/80" />
          <span className="absolute left-[7px] right-[7px] top-[9px] h-px bg-navy" />
          <span className="absolute left-[7px] top-[13px] h-[7px] w-[44px] rounded-[1px] bg-navy" />
          <span className="absolute left-[7px] top-[22px] h-[7px] w-[32px] rounded-[1px] bg-navy" />
          <span className="absolute left-[7px] top-[31px] h-[1.5px] w-[6px]" style={{ background: secondary }} />
        </div>
      );
    case "tactical":
    default:
      return (
        <div aria-hidden="true" className={cn(frame, "border border-border bg-white")}>
          <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: primary }} />
          <span className="absolute left-[7px] top-[9px] h-[4px] w-[26px] rounded-[1px]" style={{ background: primary }} />
          <span className="absolute left-[7px] right-[7px] top-[19px] h-px" style={{ background: primary }} />
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="absolute top-[23px] h-[7px] w-[10px] rounded-[1px]"
              style={{ left: 7 + i * 13, background: primary, opacity: 0.16 }}
            />
          ))}
        </div>
      );
  }
}

// ─── dialog ──────────────────────────────────────────────────────────────────

export interface BrandModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null | undefined;
  clientId: string | null | undefined;
  /** Called with the resolved kit + chosen style after the choice is persisted. */
  onConfirm: (kit: BrandKit, style: DeckStyleId) => void;
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
  const [style, setStyle] = useState<DeckStyleId>(DEFAULT_DECK_STYLE);

  // Preselect the persisted choices (or the first non-blocked mode) on open.
  useEffect(() => {
    if (!open) return;
    const savedStyle = deck?.settings?.style;
    setStyle(isDeckStyleId(savedStyle) ? savedStyle : DEFAULT_DECK_STYLE);
    const saved = deck?.settings?.brandMode;
    if (saved && MODE_ORDER.includes(saved) && gapsBlockingMode(gaps, saved).length === 0) {
      setMode(saved);
      return;
    }
    const firstOpen = MODE_ORDER.find((m) => gapsBlockingMode(gaps, m).length === 0);
    if (firstOpen) setMode(firstOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deck?.settings?.brandMode, deck?.settings?.style, isLoading]);

  const blockingFor = (m: BrandMode): BrandGap[] => gapsBlockingMode(gaps, m);
  const selectedBlocked = blockingFor(mode).length > 0;
  const selectedKit = resolveBrandKit(mode, agency, client);

  const handleConfirm = async () => {
    if (selectedBlocked) return;
    const kit = resolveBrandKit(mode, agency, client);
    try {
      await saveDeck.mutateAsync({ settings: { brandMode: mode, style } });
      onConfirm(kit, style);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Couldn't save deck settings",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Deck brand &amp; style</DialogTitle>
          <DialogDescription>
            Choose whose identity the deck renders in — logos, palette, and typefaces follow — and the style it's set in.
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

            {/* Style row */}
            <div className="pt-1.5">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate">Style</span>
                <span className="text-[11px] text-slate-faint">Same content, same brand — different dress.</span>
              </div>
              <div role="radiogroup" aria-label="Deck style" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {DECK_STYLES.map((s) => {
                  const active = style === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setStyle(s.id)}
                      className={cn(
                        "flex flex-col gap-2 rounded-lg border px-2.5 py-2.5 text-left transition-colors",
                        active ? "border-navy bg-cloud" : "border-border bg-white hover:border-navy/40",
                      )}
                    >
                      <StyleThumb id={s.id} primary={selectedKit.primary} secondary={selectedKit.secondary} />
                      <span className="text-[12px] font-semibold leading-[15px] text-navy">{s.label}</span>
                      <span className="text-[11px] leading-[14px] text-slate">{s.blurb}</span>
                    </button>
                  );
                })}
              </div>
            </div>
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
