// DeckSlideEditor — Phase 1 of the in-app deck canvas.
//
// The AI-generated slides are HTML documents authored at 1920×1080. To
// move toward a "Canva-embedded" experience without unsandboxing the
// preview iframe (security), this dialog parses the slide's HTML on
// open, lists every editable text element + every image, and lets the
// user edit them in a side panel. The slide preview re-renders live
// from the same DOM — what you see is exactly what gets saved.
//
// Phase 1 scope:
//   • Text edits: every <h1> / <h2> / <h3> / <h4> / <p> / <li>, plus
//     a few common heading replacements like <span class="display">.
//     Edited via Input or Textarea (multi-line for paragraphs/list items).
//   • Image swaps: every <img> tag. Click "Swap…" to pick from the
//     project's saved renders.
//   • Live preview iframe on the left.
//   • Save persists by calling onSave with the new HTML; the parent
//     route stores it via useDesignedDeck.updateSlideHtml.
//
// Out of scope for Phase 1 (planned for Phase 2+):
//   • Drag/move elements, resize, layer reordering
//   • Color/font/spacing controls
//   • Add brand-new elements (text/images) that weren't in the original

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Image as ImageIcon, Type, Save, RotateCcw, X, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Editable element extraction ────────────────────────────────────────

/**
 * Tags whose text content is treated as a single editable block. Lists
 * (ul/ol) get unfolded into individual <li> entries; everything else
 * is captured by tag.
 */
const EDITABLE_TEXT_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "li", "blockquote",
]);

interface ExtractedText {
  /** Synthetic stable id assigned at parse time (data-slide-edit-id). */
  editId: string;
  /** Lowercased tag name (h1, p, li, etc.). */
  tag: string;
  /** Current text content. */
  text: string;
  /** Display label for the edit field (e.g. "H1", "Bullet 3"). */
  label: string;
  /** True if multi-line input (textarea) is preferable. */
  multiline: boolean;
}

interface ExtractedImage {
  editId: string;
  src: string;
  alt: string;
}

interface ParsedSlide {
  doc: Document;
  texts: ExtractedText[];
  images: ExtractedImage[];
}

/**
 * Walk the slide's <body>, tag every editable element with a
 * data-slide-edit-id, and collect a flat list of text + image
 * descriptors. The Document is mutated so re-serializing is cheap and
 * lossless — we just call `doc.documentElement.outerHTML` to get the
 * new HTML.
 */
function parseSlideHtml(html: string): ParsedSlide {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const texts: ExtractedText[] = [];
  const images: ExtractedImage[] = [];
  let counter = 0;

  // Track per-tag counts so labels read like "Bullet 3" instead of just "Li".
  const tagCounts = new Map<string, number>();

  doc.body.querySelectorAll("*").forEach((node) => {
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "img") {
      counter++;
      const editId = `img-${counter}`;
      el.setAttribute("data-slide-edit-id", editId);
      images.push({
        editId,
        src: el.getAttribute("src") ?? "",
        alt: el.getAttribute("alt") ?? "",
      });
      return;
    }

    if (!EDITABLE_TEXT_TAGS.has(tag)) return;

    // Skip elements whose direct text is empty or which contain other
    // structural children (we'd capture the children individually).
    // We only care about leaf-ish text containers.
    const directText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? "")
      .join("")
      .trim();
    // For headings/paragraphs treat text content as flat string even if
    // it has inline <strong>/<em>/<span>. innerText would be ideal but
    // it's not available on JSDOM-style parsed Documents — innerHTML
    // stripped of tags is good enough for v1.
    const fullText = el.textContent?.trim() ?? "";
    if (!fullText && !directText) return;

    counter++;
    const tagCount = (tagCounts.get(tag) ?? 0) + 1;
    tagCounts.set(tag, tagCount);
    const editId = `txt-${counter}`;
    el.setAttribute("data-slide-edit-id", editId);

    let label: string;
    if (tag === "li") label = `Bullet ${tagCount}`;
    else if (tag === "p") label = `Paragraph ${tagCount}`;
    else if (tag === "blockquote") label = `Quote ${tagCount}`;
    else label = `${tag.toUpperCase()}${tagCount > 1 ? ` ${tagCount}` : ""}`;

    texts.push({
      editId,
      tag,
      text: fullText,
      label,
      multiline: tag === "p" || tag === "blockquote" || fullText.length > 60,
    });
  });

  return { doc, texts, images };
}

/**
 * Apply a draft (text + image edits) to the parsed Document and
 * return the serialized HTML. Iterates by data-slide-edit-id which
 * we set during parse.
 */
function applyDraft(
  parsed: ParsedSlide,
  textEdits: Record<string, string>,
  imageEdits: Record<string, string>,
): string {
  const { doc } = parsed;
  for (const [editId, newText] of Object.entries(textEdits)) {
    const el = doc.querySelector(`[data-slide-edit-id="${editId}"]`);
    if (!el) continue;
    // Replace text content while preserving the element's own attributes.
    // Inline children (strong, em, etc.) are flattened to plain text in
    // v1 — acceptable because the AI rarely uses inline markup.
    el.textContent = newText;
  }
  for (const [editId, newSrc] of Object.entries(imageEdits)) {
    const el = doc.querySelector(`[data-slide-edit-id="${editId}"]`);
    if (!el) continue;
    el.setAttribute("src", newSrc);
  }
  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
}

// ─── Component ──────────────────────────────────────────────────────────

export interface ProjectImageOption {
  angle_id: string;
  angle_name: string;
  public_url: string;
}

export interface DeckSlideEditorProps {
  open: boolean;
  onClose: () => void;
  /** Slide info: stable id, title (for header), current HTML. */
  slide: { id: string; title: string; html: string };
  /** Available render images for the swap picker. */
  projectImages: ProjectImageOption[];
  /** Persist the new HTML. Parent (DesignedDeck) calls updateSlideHtml. */
  onSave: (newHtml: string) => void;
}

export function DeckSlideEditor({
  open,
  onClose,
  slide,
  projectImages,
  onSave,
}: DeckSlideEditorProps) {
  const { toast } = useToast();
  // Parse the slide each time the dialog opens so the edit set reflects
  // the current HTML (which may have been updated since last edit).
  const parsed = useMemo(() => (open ? parseSlideHtml(slide.html) : null), [open, slide.html]);

  // Drafts: keyed by data-slide-edit-id. Empty strings mean "no override".
  // We initialize from the parsed elements so every field shows the
  // current value (which equals the unedited value on first open).
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [imageDrafts, setImageDrafts] = useState<Record<string, string>>({});
  // Image picker state — null when closed; editId of target image when open.
  const [pickerForEditId, setPickerForEditId] = useState<string | null>(null);

  // Re-seed drafts whenever the dialog re-opens or the source slide changes.
  useEffect(() => {
    if (!parsed) return;
    setTextDrafts(
      Object.fromEntries(parsed.texts.map((t) => [t.editId, t.text])),
    );
    setImageDrafts(
      Object.fromEntries(parsed.images.map((i) => [i.editId, i.src])),
    );
  }, [parsed]);

  // Live-rendered HTML: applied draft on every keystroke. Cheap because
  // the DOM is already parsed; we only mutate text + src and serialize.
  const draftHtml = useMemo(() => {
    if (!parsed) return slide.html;
    // Only include diffs (overrides where the value changed) so untouched
    // text passes through verbatim.
    const textDiff: Record<string, string> = {};
    for (const t of parsed.texts) {
      const next = textDrafts[t.editId];
      if (next !== undefined && next !== t.text) textDiff[t.editId] = next;
    }
    const imageDiff: Record<string, string> = {};
    for (const i of parsed.images) {
      const next = imageDrafts[i.editId];
      if (next !== undefined && next !== i.src) imageDiff[i.editId] = next;
    }
    return applyDraft(parsed, textDiff, imageDiff);
  }, [parsed, textDrafts, imageDrafts, slide.html]);

  const isDirty = useMemo(() => {
    if (!parsed) return false;
    if (parsed.texts.some((t) => textDrafts[t.editId] !== undefined && textDrafts[t.editId] !== t.text)) {
      return true;
    }
    if (parsed.images.some((i) => imageDrafts[i.editId] !== undefined && imageDrafts[i.editId] !== i.src)) {
      return true;
    }
    return false;
  }, [parsed, textDrafts, imageDrafts]);

  const handleSave = () => {
    if (!parsed) return;
    onSave(draftHtml);
    toast({
      title: "Slide saved",
      description: `Edits to "${slide.title}" applied. They'll be included in the next export.`,
    });
    onClose();
  };

  const handleReset = () => {
    if (!parsed) return;
    setTextDrafts(
      Object.fromEntries(parsed.texts.map((t) => [t.editId, t.text])),
    );
    setImageDrafts(
      Object.fromEntries(parsed.images.map((i) => [i.editId, i.src])),
    );
  };

  // Iframe scale: full preview is 1920×1080; we want it to fit the
  // dialog's left half (~640px wide).
  const previewWidth = 640;
  const previewScale = previewWidth / 1920;
  const previewHeight = 1080 * previewScale;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[1240px] w-[95vw] h-[92vh] flex flex-col gap-3 p-4">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Edit slide — {slide.title}
            {isDirty && (
              <Badge className="text-[10px] bg-amber-500/15 text-amber-700 border-amber-500/40">
                Unsaved changes
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Edit any text or swap images directly. Edits are saved as overrides
            on this slide; the rest of the deck is untouched. Drag, resize, and
            element-level styling are coming in Phase 2.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[640px,1fr] gap-4 flex-1 min-h-0 overflow-hidden">
          {/* Left: live preview */}
          <div className="flex flex-col gap-2 min-h-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Live preview
            </div>
            <div
              className="relative overflow-hidden rounded-md border border-border bg-neutral-900"
              style={{ width: previewWidth, height: previewHeight }}
            >
              <iframe
                srcDoc={draftHtml}
                sandbox=""
                title="Slide live preview"
                className="border-0 origin-top-left absolute"
                style={{
                  width: 1920,
                  height: 1080,
                  transform: `scale(${previewScale})`,
                }}
              />
            </div>
          </div>

          {/* Right: edit panel — text + images */}
          <div className="flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">
            {parsed && parsed.texts.length > 0 && (
              <Card>
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Type className="h-3.5 w-3.5" />
                    Text · {parsed.texts.length}
                  </div>
                  {parsed.texts.map((t) => (
                    <div key={t.editId} className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{t.label}</span>
                        <Badge variant="outline" className="text-[9px] py-0 px-1 h-4 font-mono">
                          {t.tag}
                        </Badge>
                      </div>
                      {t.multiline ? (
                        <Textarea
                          value={textDrafts[t.editId] ?? t.text}
                          onChange={(e) =>
                            setTextDrafts((d) => ({ ...d, [t.editId]: e.target.value }))
                          }
                          rows={Math.min(6, Math.max(2, Math.ceil((textDrafts[t.editId] ?? t.text).length / 60)))}
                          className="text-xs leading-relaxed"
                        />
                      ) : (
                        <Input
                          value={textDrafts[t.editId] ?? t.text}
                          onChange={(e) =>
                            setTextDrafts((d) => ({ ...d, [t.editId]: e.target.value }))
                          }
                          className="h-8 text-xs"
                        />
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {parsed && parsed.images.length > 0 && (
              <Card>
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Images · {parsed.images.length}
                  </div>
                  {parsed.images.map((img) => {
                    const currentSrc = imageDrafts[img.editId] ?? img.src;
                    const isOriginal = currentSrc === img.src;
                    return (
                      <div
                        key={img.editId}
                        className="flex items-center gap-3 rounded-md border border-border p-2"
                      >
                        <div className="h-14 w-20 shrink-0 rounded overflow-hidden bg-muted">
                          {currentSrc && (
                            <img
                              src={currentSrc}
                              alt={img.alt}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">
                            {img.alt || "Image"}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {currentSrc || "no source"}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!isOriginal && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px]"
                              onClick={() =>
                                setImageDrafts((d) => ({ ...d, [img.editId]: img.src }))
                              }
                              title="Restore original image"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px]"
                            onClick={() => setPickerForEditId(img.editId)}
                            disabled={projectImages.length === 0}
                            title={
                              projectImages.length === 0
                                ? "No render images yet — generate some first"
                                : "Swap with one of your project's saved renders"
                            }
                          >
                            Swap…
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {parsed && parsed.texts.length === 0 && parsed.images.length === 0 && (
              <div className="text-sm text-muted-foreground italic px-3 py-6 text-center border border-dashed rounded-md">
                This slide has no editable text or images that the parser
                recognized. Future Phase-2 element-level editing will surface
                the rest.
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleReset} disabled={!isDirty}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset
          </Button>
          <Button variant="ghost" onClick={onClose}>
            <X className="h-3.5 w-3.5 mr-1.5" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isDirty}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Save edits
          </Button>
        </DialogFooter>

        {/* ── Image picker ──────────────────────────────────────────── */}
        <Dialog
          open={pickerForEditId !== null}
          onOpenChange={(v) => !v && setPickerForEditId(null)}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Swap image</DialogTitle>
              <DialogDescription>
                Pick from this project's saved renders. The selected image
                replaces the current one in this slide only.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto p-1">
              {projectImages.map((img) => (
                <button
                  key={img.angle_id}
                  type="button"
                  onClick={() => {
                    if (pickerForEditId) {
                      setImageDrafts((d) => ({
                        ...d,
                        [pickerForEditId]: img.public_url,
                      }));
                    }
                    setPickerForEditId(null);
                  }}
                  className="rounded-md border border-border overflow-hidden hover:border-primary transition-colors text-left bg-card"
                >
                  <div className="aspect-video bg-muted">
                    <img
                      src={img.public_url}
                      alt={img.angle_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="px-2 py-1.5">
                    <div className="text-xs font-medium truncate">{img.angle_name}</div>
                  </div>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPickerForEditId(null)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
