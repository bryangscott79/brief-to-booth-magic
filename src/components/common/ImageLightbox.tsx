// ImageLightbox — full-screen image viewer for generated booth renders.
//
// Click any render thumbnail / hero image → opens a near-fullscreen
// modal that fits the image to the viewport with a quick toggle to
// view at native pixel size. Designed for VIEWING, not downloading —
// the download affordance lives elsewhere and stays on the cards.
//
// Why a custom component instead of the shadcn Dialog directly:
//   • DialogContent's base class caps width at max-w-lg and adds 6
//     units of padding, which fights the "show this image as big as
//     possible" goal. We override the className entirely.
//   • We want a click on the overlay OR on the image's empty matte
//     area to close, but clicks on the image itself should be silent
//     (so users can copy-image without triggering close).
//   • Mounting it inside Dialog gives us the focus trap, ESC handler,
//     and portal for free.

import {
  Dialog,
  DialogContent,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";
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
  // Local zoom state — "fit" centers the image inside the viewport
  // with object-contain; "actual" shows it at natural pixel size and
  // enables horizontal/vertical scroll for very large renders. The
  // toggle defaults back to "fit" each time the lightbox reopens so
  // the user always starts with the full image in view.
  const [zoomMode, setZoomMode] = useState<"fit" | "actual">("fit");
  useEffect(() => {
    if (open) setZoomMode("fit");
  }, [open, src]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-black/85 backdrop-blur-sm" />
        {/*
          We bypass the default DialogContent base class and render
          our own near-fullscreen surface so the image gets the
          space it deserves. Custom className means none of the
          width/padding caps from the original apply.
        */}
        <DialogContent
          className={cn(
            "fixed inset-0 z-50 w-screen h-screen max-w-none translate-x-0 translate-y-0 top-0 left-0",
            "bg-transparent border-0 p-0 shadow-none rounded-none",
            "flex flex-col",
            // Hide the built-in close X — we render our own top-right
            // control with the zoom toggle so they live as a pair.
            "[&>button:last-child]:hidden",
          )}
          // Click-outside the image (the matte area) closes the lightbox.
          // The image itself swallows the click so users can right-click
          // / drag-to-copy without dismissing.
          onClick={onClose}
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

          {/* Image surface. Scroll container so 100% mode can pan
              past the viewport. Centered with flex. */}
          <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-6">
            <img
              src={src}
              alt={alt ?? "Generated render"}
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

          {/* Caption strip — thin, optional. The model never sees
              this; it's user-facing context like the angle name. */}
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
        </DialogContent>
      </DialogPortal>
    </Dialog>
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
