// pdfPageRenderer — turn any-size PDF into a set of downsampled JPEGs
// the AI gateway can actually swallow.
//
// Why: Supabase Edge Functions cap request bodies around 6MB and the
// edge worker's RAM is tight enough that even a 6MB PDF can OOM during
// base64 expansion. A 31MB brand book (a real user case) blows every
// limit. But the AI model doesn't need the raw PDF — it needs to
// SEE the pages. Rendering each page to a moderately-sized JPEG via
// pdfjs gives us ~150-300 KB per page; a 20-page brand book lands at
// 3-6MB total which fits.
//
// We deliberately keep this pure (no React, no UI) so it can be unit-
// tested and reused from anywhere — BrandIntelligencePanel, the new-
// client wizard, future flows.

import * as pdfjs from "pdfjs-dist";
// Vite-friendly worker import. pdfjs ships its worker as a separate
// file; using `?url` makes Vite fingerprint and serve it correctly.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Set the worker source ONCE per module load. Module-scope side
// effects are fine here because pdfjs holds the value globally and
// HMR doesn't re-import on hot reload.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface RenderPdfPagesOptions {
  /** Max image width in CSS pixels per page. 1500 is enough for the
   *  vision model to read 10pt body text and color hex codes. */
  maxWidth?: number;
  /** JPEG quality 0-1. 0.72 is the empirical sweet spot — text stays
   *  sharp, color swatches stay accurate, file size stays manageable. */
  quality?: number;
  /** Hard cap on number of pages. Brand books rarely exceed 30 pages
   *  of useful content; capping at 40 protects against pathological
   *  PDFs (300-page corporate decks) without hand-cutting cases. */
  maxPages?: number;
  /** Progress callback fires after each page renders, with the
   *  1-based index and total page count. UI can wire a progress bar. */
  onProgress?: (pageIndex: number, totalPages: number) => void;
}

export interface RenderedPage {
  /** 1-based page number from the source PDF. */
  pageNumber: number;
  /** Base64-encoded JPEG (NO `data:` prefix). The edge function will
   *  re-attach the appropriate media type when handing to Gemini. */
  jpegBase64: string;
  /** Pixel width of the rendered image. */
  width: number;
  /** Pixel height of the rendered image. */
  height: number;
  /** Approximate byte size of the decoded JPEG. */
  bytes: number;
}

export interface RenderPdfPagesResult {
  pages: RenderedPage[];
  /** Total number of pages in the source PDF (may be > pages.length
   *  if maxPages truncated). */
  totalPages: number;
  /** Sum of all rendered page byte sizes — useful for the UI to
   *  estimate whether the payload will fit through the gateway. */
  totalBytes: number;
}

/**
 * Render every page of a PDF File/Blob to a JPEG. Returns the
 * base64-encoded images in source order along with size telemetry.
 *
 * Side note on memory: pdfjs renders to an offscreen canvas. The
 * canvas's getContext("2d") buffer is the heaviest live allocation;
 * we tear it down between pages by reassigning canvas.width = 0
 * to encourage the browser to reclaim. With a 31MB / 40-page brand
 * book the peak RSS is around 200MB — fine on desktop, tight on
 * mobile. We don't currently support this from a mobile browser
 * so that's acceptable.
 */
export async function renderPdfToImages(
  file: File | Blob,
  opts: RenderPdfPagesOptions = {},
): Promise<RenderPdfPagesResult> {
  const {
    maxWidth = 1500,
    quality = 0.72,
    maxPages = 40,
    onProgress,
  } = opts;

  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;
  const totalPages = pdf.numPages;
  const pageCount = Math.min(totalPages, maxPages);

  const pages: RenderedPage[] = [];
  let totalBytes = 0;

  // Each page is rendered serially so we don't blow memory by keeping
  // 40 simultaneous canvases live. Performance is fine — a typical
  // 30-page render takes 2-4 seconds on a M-series Mac.
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    // pdfjs viewport at scale=1 is at 72 DPI (PDF native). Compute the
    // scale needed to land at our target width.
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(maxWidth / baseViewport.width, 3); // never > 3x
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not get 2D canvas context");

    await page.render({
      canvasContext: ctx,
      viewport,
      // Casting because the runtime accepts canvas but the type
      // definitions vary between pdfjs versions.
      canvas: canvas as any,
    } as any).promise;

    // Encode to JPEG. canvas.toDataURL returns "data:image/jpeg;base64,XXX"
    // — we slice off the prefix because the edge function attaches its
    // own when calling Gemini.
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const commaIdx = dataUrl.indexOf(",");
    const jpegBase64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    // Each base64 char encodes 6 bits; raw bytes ≈ len * 3/4 (minus padding).
    const bytes = Math.floor((jpegBase64.length * 3) / 4);
    totalBytes += bytes;

    pages.push({
      pageNumber: i,
      jpegBase64,
      width: canvas.width,
      height: canvas.height,
      bytes,
    });

    // Release the canvas buffer. Some browsers don't reclaim 2D
    // canvas memory until GC sees the canvas as garbage; setting
    // dimensions to 0 forces the underlying buffer to free now.
    canvas.width = 0;
    canvas.height = 0;

    if (onProgress) onProgress(i, pageCount);
  }

  await pdf.destroy();

  return { pages, totalPages, totalBytes };
}

/**
 * Render and immediately upload each page to Supabase Storage as a
 * JPEG, returning the storage paths. Use this when the rendered
 * pages might exceed the edge function's request-body limit (~6MB)
 * even after compression — typical for 50+ page brand books with
 * heavy imagery. Caller passes the bucket + a base path prefix.
 */
export async function renderAndUploadPdfPages(
  file: File | Blob,
  uploadOne: (
    pageNumber: number,
    blob: Blob,
  ) => Promise<{ storagePath: string }>,
  opts: RenderPdfPagesOptions = {},
): Promise<{
  pagePaths: Array<{ pageNumber: number; storagePath: string; bytes: number }>;
  totalPages: number;
  totalBytes: number;
}> {
  const { maxWidth = 1500, quality = 0.72, maxPages = 40, onProgress } = opts;
  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;
  const totalPages = pdf.numPages;
  const pageCount = Math.min(totalPages, maxPages);
  const pagePaths: Array<{ pageNumber: number; storagePath: string; bytes: number }> = [];
  let totalBytes = 0;

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(maxWidth / baseViewport.width, 3);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not get 2D canvas context");

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas: canvas as any,
    } as any).promise;

    // canvas.toBlob is async and gives us a real Blob we can upload
    // without a base64 round-trip — much friendlier on memory.
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        "image/jpeg",
        quality,
      );
    });
    totalBytes += blob.size;

    const { storagePath } = await uploadOne(i, blob);
    pagePaths.push({ pageNumber: i, storagePath, bytes: blob.size });

    canvas.width = 0;
    canvas.height = 0;
    if (onProgress) onProgress(i, pageCount);
  }

  await pdf.destroy();
  return { pagePaths, totalPages, totalBytes };
}
