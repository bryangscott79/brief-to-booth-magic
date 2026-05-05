// useSignedUrls — resolves signed Supabase Storage URLs for a list of
// documents. The knowledge-documents bucket is private, so getPublicUrl()
// returns links that 403; we need signed URLs.
//
// Behavior:
//   - Takes a list of {id, storage_bucket, storage_path}
//   - Resolves each via supabase.storage.from(bucket).createSignedUrl(path, 1hr)
//   - Returns a map keyed by document id
//   - Handles incremental list changes — already-resolved ids are kept,
//     new ids resolve in the background, removed ids drop from the map.
//
// One hour expiry is plenty for both browser thumbnails and edge function
// image fetches (Gemini reads the URL synchronously when the request fires).

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface DocLike {
  id: string;
  storage_bucket: string;
  storage_path: string;
}

const SIGN_EXPIRY_SECONDS = 60 * 60;

export function useSignedUrls(docs: DocLike[] | null | undefined) {
  const [urlsById, setUrlsById] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    if (!docs || docs.length === 0) {
      setUrlsById({});
      return () => {
        cancelled = true;
      };
    }

    // Drop ids that no longer appear in the input.
    setUrlsById((prev) => {
      const next: Record<string, string> = {};
      const liveIds = new Set(docs.map((d) => d.id));
      for (const [id, url] of Object.entries(prev)) {
        if (liveIds.has(id)) next[id] = url;
      }
      return next;
    });

    // Resolve any docs we don't already have a URL for. Fire all at once;
    // they're independent storage calls.
    (async () => {
      // Snapshot the current map so we can avoid re-signing existing ids.
      const existing = await new Promise<Record<string, string>>((resolve) => {
        setUrlsById((prev) => {
          resolve(prev);
          return prev;
        });
      });
      const missing = docs.filter((d) => !existing[d.id]);
      if (missing.length === 0) return;

      const results = await Promise.all(
        missing.map(async (d) => {
          try {
            const { data, error } = await supabase.storage
              .from(d.storage_bucket)
              .createSignedUrl(d.storage_path, SIGN_EXPIRY_SECONDS);
            if (error || !data?.signedUrl) {
              console.warn(
                `[useSignedUrls] sign failed for ${d.storage_bucket}/${d.storage_path}:`,
                error?.message,
              );
              return null;
            }
            return [d.id, data.signedUrl] as const;
          } catch (e) {
            console.warn("[useSignedUrls] sign threw:", e);
            return null;
          }
        }),
      );

      if (cancelled) return;
      setUrlsById((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r) next[r[0]] = r[1];
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [docs]);

  return urlsById;
}

/**
 * One-shot signed URL resolver — used by code that doesn't have a hook
 * lifecycle (mutations after upload, edge function payload assembly).
 */
export async function signOne(
  bucket: string,
  path: string,
  expirySeconds: number = SIGN_EXPIRY_SECONDS,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expirySeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
