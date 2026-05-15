import type { Polygon } from "@/types/brief";

/**
 * Rasterize change polygons to an alpha-mask PNG data URL for
 * gpt-image-2's /v1/images/edits endpoint.
 *
 * OpenAI mask convention: TRANSPARENT pixels are the regions to
 * edit; OPAQUE pixels are preserved. Returns null when no change
 * polygons exist (caller should skip the mask field — the whole
 * photo is editable).
 *
 * The polygon points are normalized photo coordinates (0..1 on each
 * axis). The mask is rasterized at the photo's natural pixel size so
 * gpt-image-2 receives a mask that matches the reference image
 * resolution exactly — mismatched sizes cause the API to reject the
 * request or silently misalign the mask.
 */
export async function rasterizePolygonMask(
  photoUrl: string,
  changePolygons: Polygon[],
): Promise<string | null> {
  if (changePolygons.length === 0) return null;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = (e) => reject(e);
    el.src = photoUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("rasterizePolygonMask: 2d canvas context unavailable");

  // Start fully opaque (everything preserved).
  ctx.fillStyle = "rgba(0, 0, 0, 1)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Punch transparent holes for each change polygon.
  ctx.globalCompositeOperation = "destination-out";
  for (const poly of changePolygons) {
    if (poly.points.length < 3) continue;
    ctx.beginPath();
    poly.points.forEach((pt, i) => {
      const px = pt.x * canvas.width;
      const py = pt.y * canvas.height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
  }

  return canvas.toDataURL("image/png");
}
