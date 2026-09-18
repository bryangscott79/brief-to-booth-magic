// export-storage-manifest — read-only inventory of every storage object.
//
// Guarded by a shared token (header x-export-token === EXPORT_TOKEN secret),
// not by JWT, so an external migration script can call it. Uses the service
// role key to walk every bucket recursively and sign a 6h download URL per
// object. It NEVER writes, moves or deletes anything.
//
// Response { buckets: string[], count: number,
//            objects: Array<{bucket, path, size, signedUrl}> }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-export-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SIGN_SECONDS = 6 * 60 * 60;
const PAGE = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const expected = Deno.env.get("EXPORT_TOKEN");
    const provided = req.headers.get("x-export-token");
    if (!expected || !provided || provided !== expected) {
      return json({ error: "Unauthorized" }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: buckets, error: bucketErr } = await admin.storage.listBuckets();
    if (bucketErr) return json({ error: bucketErr.message }, 500);

    const objects: Array<{ bucket: string; path: string; size: number; signedUrl: string | null }> =
      [];

    for (const bucket of buckets ?? []) {
      // Breadth-first walk: storage.list() only returns one level at a time.
      const queue: string[] = [""];
      const filePaths: Array<{ path: string; size: number }> = [];

      while (queue.length > 0) {
        const prefix = queue.shift()!;
        let offset = 0;
        for (;;) {
          const { data: entries, error } = await admin.storage
            .from(bucket.name)
            .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
          if (error) {
            console.error(`[export-storage-manifest] list ${bucket.name}/${prefix}`, error.message);
            break;
          }
          if (!entries || entries.length === 0) break;

          for (const entry of entries) {
            const full = prefix ? `${prefix}/${entry.name}` : entry.name;
            // Folders come back with a null id and no metadata.
            if (entry.id === null) queue.push(full);
            else {
              filePaths.push({
                path: full,
                size: Number((entry.metadata as Record<string, unknown> | null)?.size ?? 0),
              });
            }
          }

          if (entries.length < PAGE) break;
          offset += PAGE;
        }
      }

      // Sign in batches — createSignedUrls takes many paths at once.
      for (let i = 0; i < filePaths.length; i += 100) {
        const slice = filePaths.slice(i, i + 100);
        const { data: signed, error } = await admin.storage
          .from(bucket.name)
          .createSignedUrls(slice.map((f) => f.path), SIGN_SECONDS);
        if (error) {
          console.error(`[export-storage-manifest] sign ${bucket.name}`, error.message);
        }
        slice.forEach((f, idx) => {
          objects.push({
            bucket: bucket.name,
            path: f.path,
            size: f.size,
            signedUrl: signed?.[idx]?.signedUrl ?? null,
          });
        });
      }
    }

    return json({
      buckets: (buckets ?? []).map((b) => b.name),
      count: objects.length,
      objects,
    });
  } catch (err) {
    console.error("[export-storage-manifest]", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
