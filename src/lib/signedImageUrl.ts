// signedImageUrl — resolves stored logo/asset URLs for PRIVATE storage buckets.
//
// company-assets, brand-assets, and feedback-attachments are private (the
// workspace blocks public buckets), so the "public URL" we store alongside a
// row is just a stable identifier — fetching it directly 403s. This module
// turns a stored URL (or bucket+path) into a short-lived signed URL at read
// time, with an in-memory cache so lists don't re-sign on every render.
//
// External URLs (scraped logos, https://cdn...) pass through untouched.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const PRIVATE_BUCKETS = new Set([
  "company-assets",
  "brand-assets",
  "feedback-attachments",
]);

const SIGN_EXPIRY_SECONDS = 6 * 60 * 60; // 6h — long enough for export jobs

interface CacheEntry {
  url: string;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

/** Extract {bucket, path} from a stored value if it points at one of our
 *  private buckets. Accepts public URLs, legacy signed URLs, or bare
 *  "bucket/path" strings. Returns null for anything else. */
export function parseStorageRef(
  stored: string | null | undefined,
): { bucket: string; path: string } | null {
  if (!stored) return null;
  const m = stored.match(
    /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?]+)(?:\?.*)?$/,
  );
  if (m && PRIVATE_BUCKETS.has(m[1])) {
    return { bucket: m[1], path: decodeURIComponent(m[2]) };
  }
  // Bare "bucket/path" form
  const slash = stored.indexOf("/");
  if (slash > 0 && !stored.includes("://")) {
    const bucket = stored.slice(0, slash);
    if (PRIVATE_BUCKETS.has(bucket)) {
      return { bucket, path: stored.slice(slash + 1) };
    }
  }
  return null;
}

/** Resolve a stored URL to something fetchable right now. Private-bucket refs
 *  get a signed URL (cached); everything else returns unchanged. Returns null
 *  if input is null or signing fails. */
export async function resolveImageUrl(
  stored: string | null | undefined,
  expirySeconds: number = SIGN_EXPIRY_SECONDS,
): Promise<string | null> {
  if (!stored) return null;
  const ref = parseStorageRef(stored);
  if (!ref) return stored;

  const key = `${ref.bucket}/${ref.path}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.url;

  try {
    const { data, error } = await supabase.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, expirySeconds);
    if (error || !data?.signedUrl) {
      console.warn(`[signedImageUrl] sign failed for ${key}:`, error?.message);
      return null;
    }
    cache.set(key, {
      url: data.signedUrl,
      expiresAt: Date.now() + expirySeconds * 1000,
    });
    return data.signedUrl;
  } catch (e) {
    console.warn("[signedImageUrl] sign threw:", e);
    return null;
  }
}

/** React hook version for components that render a stored URL directly. */
export function useResolvedImageUrl(stored: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!stored) {
      setResolved(null);
      return;
    }
    // External URLs pass through synchronously.
    if (!parseStorageRef(stored)) {
      setResolved(stored);
      return;
    }
    resolveImageUrl(stored).then((url) => {
      if (!cancelled) setResolved(url);
    });
    return () => {
      cancelled = true;
    };
  }, [stored]);

  return resolved;
}
