// FeedbackIntake — the top of the client-feedback flow: one big paste box
// for whatever the client actually sent, plus a dropzone for marked-up
// screenshots and documents. Images preview as thumbnails; everything
// dropped is stored on the round (Flow C: hairlines + whitespace, no
// nested cards).

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SectionLabel, SpecMono } from "@/components/shell";
import { cn } from "@/lib/utils";
import type { FeedbackRoundAttachment } from "@/hooks/useClientFeedback";

const MAX_FILE_MB = 25;

function prettySize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FeedbackIntakeProps {
  value: string;
  onChange: (value: string) => void;
  attachments: FeedbackRoundAttachment[];
  onDropFiles: (files: File[]) => void;
  onRemoveAttachment: (path: string) => void;
  uploading: boolean;
  /** Fires "Read the feedback" — the one generative CTA on this screen. */
  onParse: () => void;
  parsing: boolean;
  /** Number of current renders this round can revise. */
  renderCount: number;
  disabled?: boolean;
}

export function FeedbackIntake({
  value,
  onChange,
  attachments,
  onDropFiles,
  onRemoveAttachment,
  uploading,
  onParse,
  parsing,
  renderCount,
  disabled,
}: FeedbackIntakeProps) {
  const onDrop = useCallback(
    (files: File[]) => {
      const ok = files.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
      if (ok.length > 0) onDropFiles(ok);
    },
    [onDropFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/png": [],
      "image/jpeg": [],
      "image/webp": [],
      "image/gif": [],
      "application/pdf": [],
      "application/msword": [],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [],
      "text/plain": [],
      "text/markdown": [],
    },
    disabled: disabled || uploading,
  });

  const canParse = value.trim().length >= 10 && renderCount > 0 && !parsing && !disabled;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <SectionLabel accent="pink">What the client said</SectionLabel>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={9}
          placeholder="Paste the client's email or notes…"
          className="min-h-[180px] resize-y rounded-square border-cloud-line bg-white text-[13px] leading-[20px] text-charcoal placeholder:text-slate-faint"
        />
        <p className="text-[12px] leading-[17px] text-slate">
          Paste it verbatim — messy is fine. Threads, bullet dumps, and meeting notes all work.
        </p>
      </div>

      <div className="space-y-2">
        <SectionLabel accent="violet">Marked-up files</SectionLabel>
        <div
          {...getRootProps()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-square border border-dashed px-6 py-7 text-center transition-colors",
            isDragActive ? "border-[#A78BFA] bg-violet-soft" : "border-cloud-line bg-cloud",
            (disabled || uploading) && "pointer-events-none opacity-60",
          )}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate" strokeWidth={1.3} />
          ) : (
            <ImagePlus className="h-5 w-5 text-navy" strokeWidth={1.3} />
          )}
          <p className="text-[13px] font-semibold text-navy">
            {isDragActive ? "Drop to attach" : "Drag in marked-up screenshots or documents"}
          </p>
          <SpecMono className="text-slate-faint">
            PNG · JPG · PDF · DOC · TXT — up to {MAX_FILE_MB} MB each
          </SpecMono>
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {attachments.map((a) => (
              <div
                key={a.path}
                className="group relative flex items-center gap-2 rounded-square border border-cloud-line bg-white p-1.5"
              >
                {a.kind === "image" ? (
                  <img
                    src={a.url}
                    alt={a.name}
                    className="h-14 w-20 rounded-tag object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-14 w-20 items-center justify-center rounded-tag bg-cloud">
                    <FileText className="h-5 w-5 text-navy" strokeWidth={1.3} />
                  </span>
                )}
                <span className="max-w-[150px] pr-5">
                  <span className="block truncate text-[12px] font-medium text-charcoal">
                    {a.name}
                  </span>
                  <SpecMono className="text-slate-faint">{prettySize(a.size)}</SpecMono>
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(a.path)}
                  aria-label={`Remove ${a.name}`}
                  className="absolute right-1 top-1 rounded-tag p-0.5 text-slate-faint hover:bg-cloud hover:text-navy"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-cloud-line pt-4">
        <Button variant="generative" onClick={onParse} disabled={!canParse}>
          {parsing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Reading…
            </>
          ) : (
            <>✦ Read the feedback</>
          )}
        </Button>
        <SpecMono className="text-slate">
          {renderCount} {renderCount === 1 ? "render" : "renders"} in scope
        </SpecMono>
      </div>
    </div>
  );
}
