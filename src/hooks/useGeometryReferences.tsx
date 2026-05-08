// useGeometryReferences — capture + upload the spatial canvas as PNG
// reference images that get passed to the AI image gen pipeline.
//
// The flow:
//   1. Top-down + iso canvases each expose a capture method (Konva
//      Stage.toDataURL / R3F renderer.domElement.toDataURL).
//   2. We convert the data URLs to Blobs, upload via the existing
//      knowledge-documents pipeline tagged "geometry-reference", and
//      resolve to signed URLs (bucket is private).
//   3. The resulting URLs feed `extraReferenceUrls` on hero/view/regen
//      calls. The image model treats them as visual ground truth.
//
// Caching: we hash the geometry on capture so an identical hash returns
// the cached URLs instead of re-uploading on every render call. Frees
// the user from a slow upload step on incremental regens.

import { useCallback, useRef, useState } from "react";
import { useKnowledgeDocuments } from "@/hooks/useKnowledgeDocuments";
import { signOne } from "@/hooks/useSignedUrls";
import type { BoothGeometry } from "@/lib/geometryModel";

export interface GeometryReferenceUrls {
  /** Top-down floor plan PNG (Konva canvas export). */
  floorplan?: string;
  /** Isometric 3D wireframe PNG (R3F canvas export). */
  isometric?: string;
}

interface CachedReferences extends GeometryReferenceUrls {
  geometryHash: string;
  signedAt: number; // epoch ms
}

/** Convert a `data:image/png;base64,...` URL to a Blob. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(",");
  const mimeMatch = meta.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Stable hash of the geometry shape so we can cache reference uploads.
 * Don't include heightFt-only changes that don't affect the floor plan
 * unless we're capturing iso — but for v1 we just hash everything;
 * cache miss on a height-only change is cheap.
 */
function hashGeometry(geometry: BoothGeometry): string {
  const parts: string[] = [
    `${geometry.width}x${geometry.depth}h${geometry.ceilingHeightFt}@${geometry.measurementSystem}`,
  ];
  for (const z of [...geometry.zones].sort((a, b) => a.id.localeCompare(b.id))) {
    parts.push(
      `${z.id}:${z.x},${z.y},${z.width},${z.depth},${z.heightFt},${z.colorHex}`,
    );
  }
  return parts.join("|");
}

/**
 * Build a unique storage filename. Prefixed with the project id so the
 * KB list view groups them sensibly; suffixed with kind + timestamp.
 */
function buildFilename(projectId: string, kind: "floorplan" | "isometric"): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `geometry-${kind}-${projectId.slice(0, 8)}-${stamp}.png`;
}

export function useGeometryReferences(projectId: string | null | undefined) {
  const { uploadDocument } = useKnowledgeDocuments({
    scope: "project",
    scopeId: projectId ?? undefined,
  });
  const [refs, setRefs] = useState<GeometryReferenceUrls>({});
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<CachedReferences | null>(null);

  /**
   * Upload one PNG (data URL) and resolve to a signed URL.
   * Returns null on failure; the caller decides whether to fall back
   * to text-only prompts or surface an error to the user.
   */
  const uploadOne = useCallback(
    async (dataUrl: string, kind: "floorplan" | "isometric"): Promise<string | null> => {
      if (!projectId) return null;
      try {
        const blob = dataUrlToBlob(dataUrl);
        const file = new File([blob], buildFilename(projectId, kind), {
          type: "image/png",
        });
        const result = await uploadDocument.mutateAsync({
          file,
          title: `Geometry reference — ${kind}`,
          userTags: ["geometry-reference", kind, "image"],
        });
        const url = await signOne(result.storage_bucket, result.storage_path);
        return url ?? null;
      } catch (e) {
        console.error(`[geometry-references] upload failed (${kind}):`, e);
        return null;
      }
    },
    [projectId, uploadDocument],
  );

  /**
   * Capture both views, upload both PNGs, return signed URLs.
   * Uses an in-memory cache keyed by geometry hash so calling this
   * twice in a row with no changes returns the cached URLs without
   * re-uploading. The cache holds the URLs for 50 minutes (signed
   * URLs are 1-hour, leave 10-minute buffer).
   */
  const captureAndUpload = useCallback(
    async (
      geometry: BoothGeometry,
      capturers: {
        captureFloorplan: () => Promise<string | null>;
        captureIsometric: () => Promise<string | null>;
      },
    ): Promise<GeometryReferenceUrls> => {
      const hash = hashGeometry(geometry);
      const cached = cacheRef.current;
      const fiftyMinutes = 50 * 60 * 1000;
      if (
        cached &&
        cached.geometryHash === hash &&
        Date.now() - cached.signedAt < fiftyMinutes &&
        cached.floorplan &&
        cached.isometric
      ) {
        return { floorplan: cached.floorplan, isometric: cached.isometric };
      }

      setIsUploading(true);
      setError(null);
      try {
        const [floorplanData, isometricData] = await Promise.all([
          capturers.captureFloorplan(),
          capturers.captureIsometric(),
        ]);

        // Upload in parallel — both bucket writes are independent.
        const [floorplan, isometric] = await Promise.all([
          floorplanData ? uploadOne(floorplanData, "floorplan") : Promise.resolve(null),
          isometricData ? uploadOne(isometricData, "isometric") : Promise.resolve(null),
        ]);

        const next: GeometryReferenceUrls = {
          ...(floorplan ? { floorplan } : {}),
          ...(isometric ? { isometric } : {}),
        };
        setRefs(next);
        if (next.floorplan && next.isometric) {
          cacheRef.current = {
            ...next,
            geometryHash: hash,
            signedAt: Date.now(),
          };
        }
        return next;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        return {};
      } finally {
        setIsUploading(false);
      }
    },
    [uploadOne],
  );

  /** Clear the cache (e.g. after a project switch). */
  const reset = useCallback(() => {
    cacheRef.current = null;
    setRefs({});
    setError(null);
  }, []);

  return {
    refs,
    isUploading,
    error,
    captureAndUpload,
    uploadOne,
    reset,
  };
}
