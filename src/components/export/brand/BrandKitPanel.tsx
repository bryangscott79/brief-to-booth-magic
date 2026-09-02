// BrandKitPanel — the brand preflight surface for the export step.
//
// Two columns (AGENCY / CLIENT), each showing the pieces a deck needs:
// logo, primary + secondary color, and (agency side) the deck typefaces.
// Every gap is fixable inline — drop a logo on the well, pick a color,
// choose fonts — and saves straight back to the agencies / clients rows,
// so the next resolveBrandKit call sees the fix immediately.

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { ImagePlus, Loader2, UserRound } from "lucide-react";
import { EmptyState, SectionLabel, StatusChip } from "@/components/shell";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useBrandSources,
  useUpdateAgencyBrand,
  useUpdateClientBrand,
  useUploadBrandLogo,
  useFontLibraryPreview,
} from "@/hooks/useBrandKit";
import { FONT_LIBRARY, fontById, type BrandGap, type FontChoice } from "@/lib/brandKit";
import { cn } from "@/lib/utils";

// ─── helpers ─────────────────────────────────────────────────────────────────

const normalizeHex = (raw: string): string | null => {
  let v = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(v)) v = v.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;
  return `#${v.toUpperCase()}`;
};

function GapChips({ gaps }: { gaps: BrandGap[] }) {
  if (gaps.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {gaps.map((g) => (
        <StatusChip key={g.key} variant="warning">
          {g.label} missing
        </StatusChip>
      ))}
    </div>
  );
}

// ─── logo well ───────────────────────────────────────────────────────────────

function LogoWell({
  logoUrl,
  label,
  uploading,
  onFile,
}: {
  logoUrl: string | null;
  label: string;
  uploading: boolean;
  onFile: (file: File) => void;
}) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) onFile(accepted[0]);
    },
    [onFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/png": [], "image/jpeg": [], "image/svg+xml": [], "image/webp": [] },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex h-20 cursor-pointer items-center justify-center rounded-[8px] border transition-colors",
        logoUrl ? "border-border bg-white" : "border-dashed",
        isDragActive
          ? "border-navy bg-cloud text-navy"
          : !logoUrl && "border-border bg-cloud/60 text-slate hover:border-navy/40 hover:text-navy",
      )}
      aria-label={`${label} — click or drop an image to ${logoUrl ? "replace" : "upload"}`}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-faint" />
      ) : logoUrl ? (
        <img src={logoUrl} alt={label} className="max-h-14 max-w-[80%] object-contain" />
      ) : (
        <span className="inline-flex items-center gap-2 text-[12px]">
          <ImagePlus className="h-4 w-4" strokeWidth={1.5} />
          {isDragActive ? "Drop logo" : "Drop logo or click · PNG/SVG · 2MB"}
        </span>
      )}
    </div>
  );
}

// ─── color row ───────────────────────────────────────────────────────────────

function ColorRow({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string | null;
  onCommit: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);

  const commit = (raw: string) => {
    const hex = normalizeHex(raw);
    if (!hex) {
      setDraft(value ?? "");
      return;
    }
    setDraft(hex);
    if (hex !== value) onCommit(hex);
  };

  const swatch = normalizeHex(draft) ?? value ?? null;

  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[12px] font-semibold text-navy">{label}</span>
      <span
        aria-hidden="true"
        className={cn("h-6 w-6 shrink-0 rounded-[4px] border border-border", !swatch && "bg-cloud")}
        style={swatch ? { background: swatch } : undefined}
      />
      <input
        type="color"
        aria-label={`${label} picker`}
        value={normalizeHex(draft) ?? "#888888"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        className="h-6 w-8 shrink-0 cursor-pointer rounded-[4px] border border-border bg-white p-0.5"
      />
      <input
        type="text"
        aria-label={`${label} hex`}
        value={draft}
        placeholder="#000000"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
        }}
        className="h-8 w-24 rounded-[6px] border border-border bg-white px-2 font-mono text-[12px] text-charcoal outline-none focus:border-navy"
      />
    </div>
  );
}

// ─── font select ─────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<FontChoice["category"], string> = {
  grotesk: "Grotesk",
  display: "Display",
  serif: "Serif",
  mono: "Mono",
};

const CATEGORY_ORDER: FontChoice["category"][] = ["grotesk", "display", "serif", "mono"];

function FontSelect({
  label,
  fontId,
  onChange,
}: {
  label: string;
  fontId: string | null;
  onChange: (id: string) => void;
}) {
  const chosen = fontId ? fontById(fontId) : null;
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[12px] font-semibold text-navy">{label}</span>
      <Select value={fontId ?? ""} onValueChange={onChange}>
        <SelectTrigger className="h-8 flex-1 text-[12px]">
          <SelectValue placeholder="Choose a typeface">
            {chosen && (
              <span style={{ fontFamily: `'${chosen.family}', ${chosen.pptxFallback}` }}>
                {chosen.label}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {CATEGORY_ORDER.map((cat) => {
            const fonts = FONT_LIBRARY.filter((f) => f.category === cat);
            if (fonts.length === 0) return null;
            return (
              <SelectGroup key={cat}>
                <SelectLabel className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate">
                  {CATEGORY_LABELS[cat]}
                </SelectLabel>
                {fonts.map((f) => (
                  <SelectItem key={f.id} value={f.id} className="text-[13px]">
                    <span style={{ fontFamily: `'${f.family}', ${f.pptxFallback}` }}>{f.label}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── panel ───────────────────────────────────────────────────────────────────

export function BrandKitPanel({
  clientId,
  className,
}: {
  clientId: string | null | undefined;
  className?: string;
}) {
  useFontLibraryPreview();
  const { toast } = useToast();
  const { agency, client, gaps, isLoading } = useBrandSources(clientId);
  const updateAgency = useUpdateAgencyBrand();
  const updateClient = useUpdateClientBrand();
  const uploadLogo = useUploadBrandLogo();

  const [uploadingScope, setUploadingScope] = useState<"agency" | "client" | null>(null);

  const fail = (err: unknown) =>
    toast({
      title: "Couldn't save brand kit",
      description: err instanceof Error ? err.message : "Unknown error",
      variant: "destructive",
    });

  const handleAgencyLogo = async (file: File) => {
    setUploadingScope("agency");
    try {
      const url = await uploadLogo.mutateAsync({ scope: "agency", file });
      await updateAgency.mutateAsync({ logoUrl: url });
      toast({ title: "Agency logo saved" });
    } catch (err) {
      fail(err);
    } finally {
      setUploadingScope(null);
    }
  };

  const handleClientLogo = async (file: File) => {
    if (!clientId) return;
    setUploadingScope("client");
    try {
      const url = await uploadLogo.mutateAsync({ scope: "client", file, clientId });
      await updateClient.mutateAsync({ clientId, logoUrl: url });
      toast({ title: "Client logo saved" });
    } catch (err) {
      fail(err);
    } finally {
      setUploadingScope(null);
    }
  };

  const agencyGaps = gaps.filter((g) => g.scope === "agency");
  const clientGaps = gaps.filter((g) => g.scope === "client");

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <Loader2 className="h-4 w-4 animate-spin text-slate-faint" />
      </div>
    );
  }

  return (
    <div className={cn("grid gap-6 md:grid-cols-2", className)}>
      {/* AGENCY */}
      <section className="max-w-md space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel accent="blue">Agency{agency.name ? ` · ${agency.name}` : ""}</SectionLabel>
        </div>
        <GapChips gaps={agencyGaps} />
        <LogoWell
          logoUrl={agency.logoUrl}
          label="Agency logo"
          uploading={uploadingScope === "agency"}
          onFile={handleAgencyLogo}
        />
        <div className="space-y-2">
          <ColorRow
            label="Primary"
            value={agency.primary}
            onCommit={(hex) => updateAgency.mutateAsync({ primary: hex }).catch(fail)}
          />
          <ColorRow
            label="Secondary"
            value={agency.secondary}
            onCommit={(hex) => updateAgency.mutateAsync({ secondary: hex }).catch(fail)}
          />
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          <FontSelect
            label="Headings"
            fontId={agency.headingFontId}
            onChange={(id) => updateAgency.mutateAsync({ headingFontId: id }).catch(fail)}
          />
          <FontSelect
            label="Body"
            fontId={agency.bodyFontId}
            onChange={(id) => updateAgency.mutateAsync({ bodyFontId: id }).catch(fail)}
          />
        </div>
      </section>

      {/* CLIENT */}
      <section className="max-w-md space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel accent="pink">Client{client.name ? ` · ${client.name}` : ""}</SectionLabel>
        </div>
        {!clientId ? (
          <EmptyState
            icon={UserRound}
            title="No client on this project"
            body="Pick a client in the brief to pull their logo and palette into client and blend decks."
            className="rounded-[8px] border border-dashed border-border py-8"
          />
        ) : (
          <>
            <GapChips gaps={clientGaps} />
            <LogoWell
              logoUrl={client.logoUrl}
              label="Client logo"
              uploading={uploadingScope === "client"}
              onFile={handleClientLogo}
            />
            <div className="space-y-2">
              <ColorRow
                label="Primary"
                value={client.primary}
                onCommit={(hex) => updateClient.mutateAsync({ clientId, primary: hex }).catch(fail)}
              />
              <ColorRow
                label="Secondary"
                value={client.secondary}
                onCommit={(hex) => updateClient.mutateAsync({ clientId, secondary: hex }).catch(fail)}
              />
            </div>
            {client.typographyNote && (
              <p className="border-t border-border pt-3 font-mono text-[11px] text-slate">
                Brand guide typeface: <span className="text-charcoal">{client.typographyNote}</span>
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
