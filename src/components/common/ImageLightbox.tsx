// ImageLightbox — full-screen image viewer for generated renders.
//
// Click any render thumbnail → opens a fullscreen modal that fits the
// image to the viewport, with a quick toggle to native pixel size.
// View-only: no download button (that affordance stays on the cards).
//
// Why a custom portal instead of shadcn Dialog: Radix Dialog's
// pointer-event capture + outside-click detection was sometimes
// closing the lightbox on the same synthetic click that opened it
// (the trigger click being treated as "outside" before the portal
// had finished mounting). A small custom portal sidesteps that
// entirely and lets us own focus + ESC + backdrop-click directly.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { X, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ImageLightboxProps {
  /** Image URL to display. */
  src: string;
  /** Alt text for accessibility. */
  alt?: string;
  /** Open/close controlled by the parent. */
  open: boolean;
  /** Called when the user closes the lightbox. */
  onClose: () => void;
  /** Optional caption rendered as a thin banner under the image. */
  caption?: string;
}

export function ImageLightbox({
  src,
  alt,
  open,
  onClose,
  caption,
}: ImageLightboxProps) {
  // Local zoom state — "fit" centers + object-contains, "actual"
  // shows at native pixel size with scroll. Resets each time the
  // lightbox opens so the user always starts on Fit.
  const [zoomMode, setZoomMode] = useState<"fit" | "actual">("fit");
  useEffect(() => {
    if (open) setZoomMode("fit");
  }, [open, src]);

  // ESC closes. Add the listener only while open so we don't have a
  // dangling document handler when the lightbox isn't mounted.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while the lightbox is open so the page behind
  // doesn't scroll when the user scrolls the actual-size image.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col"
      // Clicking the matte (anywhere except the image / controls) closes.
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      {/* Top controls — zoom + close. Pinned top-right with a
          translucent backdrop so they read against any image. */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1 rounded-md bg-black/60 backdrop-blur-sm p-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-white hover:bg-white/15 hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            setZoomMode((m) => (m === "fit" ? "actual" : "fit"));
          }}
          title={
            zoomMode === "fit"
              ? "View at 100% (actual pixel size)"
              : "Fit to viewport"
          }
        >
          {zoomMode === "fit" ? (
            <>
              <Maximize2 className="h-3.5 w-3.5 mr-1" />
              100%
            </>
          ) : (
            <>
              <Minimize2 className="h-3.5 w-3.5 mr-1" />
              Fit
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Image surface. Scroll container so 100% mode can pan past
          the viewport. Centered with flex. */}
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-6">
        <img
          src={src}
          alt={alt ?? "Generated render"}
          // Don't close when the user clicks the image itself —
          // they may want to right-click / drag-copy.
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "shadow-2xl rounded-md transition-all duration-200",
            zoomMode === "fit"
              ? "max-w-[95vw] max-h-[88vh] object-contain"
              : "max-w-none max-h-none",
          )}
          draggable={false}
        />
      </div>

      {/* Caption strip — thin, optional. */}
      {caption && (
        <div className="shrink-0 px-6 pb-4 text-center">
          <p
            className="inline-block rounded-full bg-black/60 backdrop-blur-sm px-4 py-1.5 text-xs text-white/90"
            onClick={(e) => e.stopPropagation()}
          >
            {caption}
          </p>
        </div>
      )}
    </div>,
    document.body,
  );
}

/**
 * Companion hook — small bit of state for the common "click an image
 * to expand" pattern. Call sites do:
 *
 *   const lightbox = useImageLightbox();
 *   <img onClick={() => lightbox.open(url, alt, caption)} ... />
 *   <ImageLightbox {...lightbox.props} />
 */
export function useImageLightbox() {
  const [state, setState] = useState<{
    src: string;
    alt?: string;
    caption?: string;
  } | null>(null);
  return {
    open: (src: string, alt?: string, caption?: string) =>
      setState({ src, alt, caption }),
    close: () => setState(null),
    /** Spread into <ImageLightbox {...lightbox.props} />. */
    props: {
      src: state?.src ?? "",
      alt: state?.alt,
      caption: state?.caption,
      open: state !== null,
      onClose: () => setState(null),
    } satisfies ImageLightboxProps,
  };
}
