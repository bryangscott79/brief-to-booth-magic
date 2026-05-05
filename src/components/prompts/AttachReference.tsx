// AttachReference — small file-attach affordance shown next to a view's
// regenerate button. The user picks an image; it's uploaded to the
// project KB tagged "render-reference" and the URL is queued so the
// next regeneration of this angle includes it as a visual reference.
// Cleared after a successful regen.

import { useRef } from "react";
import { Paperclip, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PendingReference } from "@/hooks/useRenderReferences";

interface AttachReferenceProps {
  angleId: string;
  refs: PendingReference[];
  onAttach: (angleId: string, file: File) => Promise<void>;
  onRemove: (angleId: string, refId: string) => void;
  disabled?: boolean;
}

export function AttachReference({
  angleId,
  refs,
  onAttach,
  onRemove,
  disabled,
}: AttachReferenceProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (disabled) return;
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-selecting same file later
    await onAttach(angleId, file);
  };

  if (refs.length === 0) {
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={handleClick}
          disabled={disabled}
          title="Attach a reference image — used on the next regeneration"
        >
          <Paperclip className="h-3 w-3 mr-1" />
          Attach reference
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={handleFile}
        />
      </>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {refs.map((r) => (
        <span
          key={r.id}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px]",
            r.status === "ready"
              ? "border-primary/40 bg-primary/10 text-foreground"
              : r.status === "error"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-muted text-muted-foreground",
          )}
          title={r.status === "error" ? r.errorMsg : r.filename}
        >
          {r.status === "uploading" ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : (
            <Paperclip className="h-2.5 w-2.5" />
          )}
          <span className="max-w-[100px] truncate">{r.filename}</span>
          <button
            type="button"
            onClick={() => onRemove(angleId, r.id)}
            className="opacity-60 hover:opacity-100"
            aria-label="Remove reference"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2"
        onClick={handleClick}
        disabled={disabled}
      >
        <Paperclip className="h-2.5 w-2.5 mr-1" />
        Add another
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
