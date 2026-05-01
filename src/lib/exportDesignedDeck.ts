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
  iframe.srcdoc = html;
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

  // Small extra tick for layout settle.
  await new Promise((r) => setTimeout(r, 150));

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
