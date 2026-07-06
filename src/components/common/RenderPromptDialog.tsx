// RenderPromptDialog — the "View prompt" surface for any saved render.
//
// Every image save now persists a prompt-transparency payload into
// project_images.prompt_artifacts (see buildRenderPromptArtifacts).
// This dialog reads that payload and shows it in copyable sections:
// Prompt, Negative, Geometry, References, Compliance, Model/time,
// Config. Legacy images (saved before prompt tracking) get an explicit
// "Prompt not recorded" state instead of an empty dialog.
//
// Mounted from the Prompts-step gallery cards and the Files page
// lightbox — one shared component so both surfaces stay in sync.

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, FileText, ImageIcon } from "lucide-react";
import type { ProjectImage } from "@/hooks/useProjectImages";

interface ComplianceEntry {
  id?: string;
  status?: string;
  message?: string;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** Copy button with a transient "Copied" state. */
function CopyChip({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can fail in unfocused tabs — non-critical.
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
      onClick={handleCopy}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function Section({
  title,
  copyText,
  children,
}: {
  title: string;
  copyText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </h4>
        {copyText && <CopyChip text={copyText} />}
      </div>
      {children}
    </div>
  );
}

export interface RenderPromptDialogProps {
  /** The saved render whose prompt to show. null = closed. */
  image: ProjectImage | null;
  onClose: () => void;
}

export function RenderPromptDialog({ image, onClose }: RenderPromptDialogProps) {
  const artifacts = image?.prompt_artifacts ?? null;

  const prompt = asString(artifacts?.prompt);
  const negative = asString(artifacts?.negative);
  const geometrySummary = asString(artifacts?.geometrySummary);
  const model = asString(artifacts?.model) ?? asString(artifacts?.modelUsed);
  const generatedAt = asString(artifacts?.generatedAt) ?? image?.created_at ?? null;
  const configLabel = asString(artifacts?.configLabel) ?? asString(artifacts?.configKey);
  const references = Array.isArray(artifacts?.references)
    ? (artifacts!.references as Array<{ label?: string; url?: string }>).filter(
        (r) => typeof r?.url === "string" && r.url.length > 0,
      )
    : [];
  const compliance = Array.isArray(artifacts?.compliance)
    ? (artifacts!.compliance as ComplianceEntry[])
    : [];

  // One blob for the "Copy all" button — readable plaintext with the
  // same section order as the dialog.
  const copyAllText = [
    prompt ? `PROMPT\n${prompt}` : null,
    negative ? `NEGATIVE\n${negative}` : null,
    geometrySummary ? `GEOMETRY\n${geometrySummary}` : null,
    references.length > 0
      ? `REFERENCES\n${references.map((r) => `- ${r.label ?? "Reference"}: ${r.url}`).join("\n")}`
      : null,
    compliance.length > 0
      ? `HARD CONSTRAINTS\n${compliance
          .map((c) => `- ${c.id ?? "constraint"}: ${c.status ?? "unknown"}${c.message ? ` — ${c.message}` : ""}`)
          .join("\n")}`
      : null,
    [
      model ? `Model: ${model}` : null,
      generatedAt ? `Generated: ${new Date(generatedAt).toLocaleString()}` : null,
      configLabel ? `Booth size: ${configLabel}` : null,
    ]
      .filter(Boolean)
      .join("\n") || null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Prompt — {image?.angle_name ?? "Render"}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            <span>Exactly what the image model received for this render.</span>
          </DialogDescription>
        </DialogHeader>

        {!prompt ? (
          <div className="py-10 text-center space-y-2">
            <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">
              Prompt not recorded (generated before prompt tracking).
            </p>
            {(model || configLabel) && (
              <div className="flex items-center justify-center gap-2 pt-1">
                {model && (
                  <Badge variant="outline" className="text-[10px]">
                    {model}
                  </Badge>
                )}
                {configLabel && (
                  <Badge variant="secondary" className="text-[10px]">
                    {configLabel}
                  </Badge>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Meta chips + copy-all */}
            <div className="flex items-center gap-2 flex-wrap">
              {model && (
                <Badge variant="outline" className="text-[10px]">
                  {model}
                </Badge>
              )}
              {configLabel && (
                <Badge variant="secondary" className="text-[10px]">
                  {configLabel}
                </Badge>
              )}
              {generatedAt && (
                <span className="text-[11px] text-muted-foreground">
                  {new Date(generatedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
              <div className="ml-auto">
                <CopyChip text={copyAllText} label="Copy all" />
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0 pr-3 -mr-1">
              <div className="space-y-4 pb-2">
                <Section title="Prompt" copyText={prompt}>
                  <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 text-xs font-mono leading-relaxed">
                    {prompt}
                    {artifacts?.promptTruncated ? "\n\n[… truncated for storage]" : ""}
                  </pre>
                </Section>

                {negative && (
                  <Section title="Negative prompt" copyText={negative}>
                    <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 text-xs font-mono leading-relaxed">
                      {negative}
                    </pre>
                  </Section>
                )}

                {geometrySummary && (
                  <Section title="Geometry" copyText={geometrySummary}>
                    <p className="rounded-md border border-border bg-muted/30 p-3 text-xs font-mono leading-relaxed">
                      {geometrySummary}
                    </p>
                  </Section>
                )}

                {references.length > 0 && (
                  <Section
                    title="Reference images"
                    copyText={references
                      .map((r) => `${r.label ?? "Reference"}: ${r.url}`)
                      .join("\n")}
                  >
                    <ul className="space-y-1">
                      {references.map((r, i) => (
                        <li key={`${r.url}-${i}`} className="flex items-baseline gap-2 text-xs">
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {r.label ?? "Reference"}
                          </Badge>
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-primary underline-offset-2 hover:underline"
                            title={r.url}
                          >
                            {r.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {compliance.length > 0 && (
                  <Section
                    title="Hard constraints"
                    copyText={compliance
                      .map(
                        (c) =>
                          `${c.id ?? "constraint"}: ${c.status ?? "unknown"}${c.message ? ` — ${c.message}` : ""}`,
                      )
                      .join("\n")}
                  >
                    <ul className="space-y-1">
                      {compliance.map((c, i) => (
                        <li key={`${c.id ?? "c"}-${i}`} className="flex items-baseline gap-2 text-xs">
                          <Badge
                            variant="outline"
                            className={
                              c.status === "fail"
                                ? "text-[10px] shrink-0 border-destructive/40 bg-destructive/10 text-destructive"
                                : c.status === "pass"
                                  ? "text-[10px] shrink-0 border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                                  : "text-[10px] shrink-0"
                            }
                          >
                            {c.status ?? "unknown"}
                          </Badge>
                          <span className="text-muted-foreground">
                            {c.id ?? "constraint"}
                            {c.message ? ` — ${c.message}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
