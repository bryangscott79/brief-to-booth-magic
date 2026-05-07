// exportDesignedDeck — turn an array of HTML slides into a downloadable
// PDF or PPTX file. Each slide is rendered offscreen at 1920×1080, captured
// to canvas via html2canvas, then assembled into the final document.
//
// Why this approach: the slides are designed-as-HTML so the highest-fidelity
// export keeps that design intact. Both PDF and PPTX exports embed each
// slide as a full-bleed image — the deck looks IDENTICAL to the in-app
// preview when opened in Acrobat, Keynote, or PowerPoint. Tradeoff: the
// PPTX is non-editable text (it's an image), but for client decks that's
// the right default — they're meant to be sent, not edited.

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import PptxGenJS from "pptxgenjs";

export interface DesignedSlide {
  id: string;
  title: string;
  slideType: string;
  html: string;
}

const SLIDE_WIDTH = 1920;
const SLIDE_HEIGHT = 1080;

/**
 * Render a single HTML slide string into an HTMLCanvasElement at 1920×1080.
 * Uses an offscreen iframe so the slide's <style> is fully scoped.
 */
async function renderSlideToCanvas(html: string): Promise<HTMLCanvasElement> {
  // Create an off-screen container for the iframe.
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-100000px";
  host.style.top = "0";
  host.style.width = `${SLIDE_WIDTH}px`;
  host.style.height = `${SLIDE_HEIGHT}px`;
  host.style.overflow = "hidden";
  host.style.pointerEvents = "none";
  document.body.appendChild(host);

  const iframe = document.createElement("iframe");
  iframe.style.width = `${SLIDE_WIDTH}px`;
  iframe.style.height = `${SLIDE_HEIGHT}px`;
  iframe.style.border = "0";
  // No sandbox here — we trust Claude's output (we asked for inline-only),
  // and we need same-origin so html2canvas can read the rendered DOM.
  // Inject a defensive CSS reset BEFORE the slide's own <style>. This is
  // the fix for the "EstablishRedBullas" kerning bug — when html2canvas
  // re-renders the iframe DOM, web fonts loaded via @import sometimes
  // fall back to system fonts with different metrics. If the slide HTML
  // also used negative letter-spacing on display text, words run together.
  // Forcing a minimum word-spacing keeps space characters from collapsing
  // to zero width regardless of which font ends up rendering.
  const HARDEN_CSS = `
    <style id="canopy-export-hardening">
      /* Keep words separated even when fonts fall back during canvas
         capture. The slide's own letter-spacing is preserved; we only
         enforce a non-negative floor on word-spacing so spaces never
         collapse below visible width. */
      * { word-spacing: max(0.05em, var(--ws, 0.05em)); }
      /* Prevent display headlines from rendering below their natural
         line-height — html2canvas occasionally clips when line-height
         is set in unitless values that depend on font metrics. */
      h1, h2, h3, h4, .display, .headline { line-height: 1.05; }
      /* Critical for kerning: even if the slide overrode font-feature-settings,
         disable discretionary ligatures that can fuse 'a c' into 'æ' etc. */
      * { font-feature-settings: "kern" 1, "liga" 0, "dlig" 0, "calt" 0; }
    </style>
  `;
  // Inject our reset into the <head> — slide's own styles still win except
  // where we use !important-equivalent (max() floor on word-spacing).
  const hardenedHtml = html.replace(
    /<head([^>]*)>/i,
    (_match, attrs) => `<head${attrs}>${HARDEN_CSS}`,
  );
  iframe.srcdoc = hardenedHtml.includes("canopy-export-hardening")
    ? hardenedHtml
    // No <head> tag in the slide HTML — wrap with a synthetic one.
    : html.replace(
        /<html([^>]*)>/i,
        (_m, attrs) => `<html${attrs}><head>${HARDEN_CSS}</head>`,
      );
  host.appendChild(iframe);

  // Wait for iframe load and embedded fonts.
  await new Promise<void>((resolve) => {
    if ((iframe as any).contentDocument?.readyState === "complete") {
      resolve();
    } else {
      iframe.addEventListener("load", () => resolve(), { once: true });
    }
  });

  // Give Google Fonts (@import) and any images a moment to load. Without
  // this delay, html2canvas captures partially-loaded slides.
  const doc = iframe.contentDocument;
  if (doc) {
    try {
      // Wait for font face set readiness when supported.
      const fontReady = (doc as any).fonts?.ready;
      if (fontReady) await fontReady;
    } catch {
      /* ignore */
    }
    // Wait for images to load.
    const imgs = Array.from(doc.images);
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete && img.naturalWidth > 0) {
              resolve();
            } else {
              const cleanup = () => resolve();
              img.addEventListener("load", cleanup, { once: true });
              img.addEventListener("error", cleanup, { once: true });
              // Hard stop in case the image hangs.
              setTimeout(cleanup, 5000);
            }
          }),
      ),
    );
  }

  // Bigger settle delay — Google Fonts via @import can take 500-1000ms
  // to actually paint. The 150ms we used to wait was sometimes capturing
  // mid-swap where the fallback font was on screen.
  await new Promise((r) => setTimeout(r, 600));

  // Run html2canvas against the iframe's body. Scale 1 — body is already
  // 1920x1080 so we get full resolution. useCORS lets remote images render
  // when the host serves CORS headers (Supabase Storage does).
  const target = iframe.contentDocument?.body as HTMLElement;
  if (!target) {
    document.body.removeChild(host);
    throw new Error("Slide failed to render — empty body.");
  }

  const canvas = await html2canvas(target, {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    windowWidth: SLIDE_WIDTH,
    windowHeight: SLIDE_HEIGHT,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    scale: 1,
    logging: false,
    foreignObjectRendering: false,
  });

  document.body.removeChild(host);
  return canvas;
}

export interface ExportProgress {
  slideIndex: number;
  total: number;
  slideTitle: string;
}

export async function exportDesignedDeckToPDF(
  slides: DesignedSlide[],
  filename: string,
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  if (slides.length === 0) throw new Error("No slides to export");

  // 16:9 PDF using points (PowerPoint widescreen is 13.333" × 7.5" = 960×540 pt).
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: [960, 540],
  });

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]!;
    onProgress?.({ slideIndex: i, total: slides.length, slideTitle: slide.title });
    const canvas = await renderSlideToCanvas(slide.html);
    // PNG keeps gradients clean; quality > size for pitch decks.
    const dataUrl = canvas.toDataURL("image/png");
    if (i > 0) pdf.addPage([960, 540], "landscape");
    pdf.addImage(dataUrl, "PNG", 0, 0, 960, 540, undefined, "FAST");
  }

  pdf.save(filename);
}

export async function exportDesignedDeckToPPTX(
  slides: DesignedSlide[],
  filename: string,
  meta: { author?: string; title?: string } = {},
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  if (slides.length === 0) throw new Error("No slides to export");

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.333 × 7.5 in
  if (meta.author) pptx.author = meta.author;
  if (meta.title) pptx.title = meta.title;

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]!;
    onProgress?.({ slideIndex: i, total: slides.length, slideTitle: slide.title });
    const canvas = await renderSlideToCanvas(slide.html);
    const dataUrl = canvas.toDataURL("image/png");
    const pptxSlide = pptx.addSlide();
    // Full-bleed: pptxgenjs widescreen layout = 13.333 × 7.5 inches.
    pptxSlide.addImage({
      data: dataUrl,
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
    });
    if (slide.title) {
      // Hidden title (off-slide) so PowerPoint's outline view + speaker
      // notes still find a title — useful for accessibility and handouts.
      pptxSlide.addText(slide.title, {
        x: 0.1, y: 7.6, w: 13, h: 0.1,
        fontSize: 1, color: "FFFFFF",
      });
    }
  }

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
