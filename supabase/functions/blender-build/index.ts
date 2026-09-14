// blender-build — the client for a hosted headless Blender service.
//
// STATUS: PARKED — nothing in the app calls this. The Model step ships as a
// file deliverable (the user downloads the generated .py and runs Blender
// themselves), so this function exists only for the day hosted builds are
// wanted. It is safe to leave deployed or undeployed: with
// BLENDER_SERVICE_URL unset every action answers { configured: false }.
//
// Blender cannot run inside Supabase or a browser, so the app sends the
// generated Python out to a small Blender runtime (see services/blender/)
// and brings the results back into the PUBLIC project-images bucket.
//
// The function never generates geometry: src/lib/blenderScript.ts does that
// deterministically on the client and posts the finished script here.
//
// ── Actions ───────────────────────────────────────────────────────────────
//   probe   { action }
//           → { configured, serviceReachable? }
//   submit  { action, projectId, script, configKey?, projectName? }
//           → { configured: true, job }          (row status → "running")
//   poll    { action, jobId? , externalJobId?, projectId? }
//           → { configured: true, job }          (uploads artifacts on completion)
//
// When BLENDER_SERVICE_URL is unset EVERY action returns a structured
// { configured: false, reason } with HTTP 200 — never an error — so the UI
// can fall back to "download the script / download the glTF" instead of
// showing a failure.
//
// ── Service contract (services/blender/server.py implements it) ───────────
//   POST {BLENDER_SERVICE_URL}/jobs
//     Authorization: Bearer {BLENDER_SERVICE_KEY}
//     { script, name, stills, metadata }
//     → { job_id, status }
//   GET  {BLENDER_SERVICE_URL}/jobs/{job_id}
//     Authorization: Bearer {BLENDER_SERVICE_KEY}
//     → { job_id, status: queued|running|complete|failed, error?,
//         blend_url?, gltf_url?, stills?: [{ url, label }], log_tail? }
//   URLs may be absolute or relative to BLENDER_SERVICE_URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FN_VERSION = 1;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify({ ...(body as Record<string, unknown>), fn_version: FN_VERSION }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Hard ceiling on the posted script — a very complex booth is ~200 KB. */
const MAX_SCRIPT_BYTES = 2_000_000;
const BUCKET = "project-images";
/** Give the service time to answer a submit, but never hang the edge runtime. */
const SERVICE_TIMEOUT_MS = 30_000;

const isMissingTable = (message: string) =>
  /does not exist|could not find the table|schema cache/i.test(message ?? "");

function serviceConfig() {
  const url = (Deno.env.get("BLENDER_SERVICE_URL") ?? "").trim().replace(/\/+$/, "");
  const key = (Deno.env.get("BLENDER_SERVICE_KEY") ?? "").trim();
  return { url, key, configured: url.length > 0 };
}

function serviceHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) {
    headers["Authorization"] = `Bearer ${key}`;
    headers["X-API-Key"] = key;
  }
  return headers;
}

async function serviceFetch(
  url: string,
  key: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: Record<string, unknown>; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SERVICE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { ...serviceHeaders(key), ...(init.headers as Record<string, string> ?? {}) },
      signal: controller.signal,
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
    return { ok: res.ok, status: res.status, body, text };
  } finally {
    clearTimeout(timer);
  }
}

/** Service URLs may be relative ("/jobs/abc/files/booth.blend"). */
function absoluteUrl(base: string, candidate: unknown): string | null {
  if (typeof candidate !== "string" || candidate.length === 0) return null;
  if (/^https?:\/\//i.test(candidate)) return candidate;
  return `${base}${candidate.startsWith("/") ? "" : "/"}${candidate}`;
}

/** The slice of the Supabase client mirroring needs — structural so the
 *  generated client types don't have to line up exactly. */
interface StorageCapable {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Uint8Array,
        options: { contentType: string; upsert: boolean },
      ) => Promise<{ error: { message: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
}

/** Copy one service artifact into the public project-images bucket. */
async function mirrorArtifact(
  admin: StorageCapable,
  key: string,
  sourceUrl: string,
  storagePath: string,
  contentType: string,
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, { headers: serviceHeaders(key) });
    if (!res.ok) {
      console.warn(`[blender-build] fetch artifact ${sourceUrl} → ${res.status}`);
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const { error } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType,
      upsert: true,
    });
    if (error) {
      console.warn(`[blender-build] upload ${storagePath} failed: ${error.message}`);
      return null;
    }
    return admin.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
  } catch (err) {
    console.warn(`[blender-build] mirror ${storagePath} threw:`, err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // DB writes go through the user's token so RLS decides what they may
    // touch; storage goes through service role so uploads are allowed.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "probe");
    const { url: serviceUrl, key: serviceKey, configured } = serviceConfig();

    // ── Not configured: a clear, structured answer — never an error. ──────
    if (!configured) {
      return json({
        configured: false,
        reason:
          "BLENDER_SERVICE_URL is not set on this project. Deploy services/blender/ and add the BLENDER_SERVICE_URL + BLENDER_SERVICE_KEY secrets to light up hosted builds.",
        action,
      });
    }

    // ── probe ─────────────────────────────────────────────────────────────
    if (action === "probe") {
      let serviceReachable = false;
      let detail: string | null = null;
      try {
        const res = await serviceFetch(`${serviceUrl}/health`, serviceKey, { method: "GET" });
        serviceReachable = res.ok;
        if (!res.ok) detail = `health check returned ${res.status}`;
      } catch (err) {
        detail = err instanceof Error ? err.message : "unreachable";
      }
      return json({ configured: true, serviceReachable, detail });
    }

    // ── submit ────────────────────────────────────────────────────────────
    if (action === "submit") {
      const projectId = String(body.projectId ?? "");
      const script = String(body.script ?? "");
      const configKey = body.configKey ? String(body.configKey) : null;
      const projectName = String(body.projectName ?? "booth");
      if (!projectId) return json({ error: "projectId required" }, 400);
      if (!script) return json({ error: "script required" }, 400);
      if (script.length > MAX_SCRIPT_BYTES) {
        return json({ error: "script too large" }, 413);
      }

      const submitted = await serviceFetch(`${serviceUrl}/jobs`, serviceKey, {
        method: "POST",
        body: JSON.stringify({
          script,
          name: projectName,
          stills: 3,
          metadata: { project_id: projectId, config_key: configKey, source: "canopy" },
        }),
      });
      if (!submitted.ok) {
        return json(
          {
            configured: true,
            error: `Blender service rejected the job (${submitted.status})`,
            detail: submitted.text.slice(0, 500),
          },
          502,
        );
      }
      const externalJobId = String(
        submitted.body.job_id ?? submitted.body.id ?? submitted.body.jobId ?? "",
      );
      if (!externalJobId) {
        return json({ configured: true, error: "Blender service returned no job id" }, 502);
      }

      // Keep the exact script that produced this build so it is reproducible.
      const scriptPath = `${projectId}/model/${externalJobId}/booth.py`;
      let scriptUrl: string | null = null;
      const { error: scriptErr } = await admin.storage
        .from(BUCKET)
        .upload(scriptPath, new TextEncoder().encode(script), {
          contentType: "text/x-python",
          upsert: true,
        });
      if (!scriptErr) {
        scriptUrl = admin.storage.from(BUCKET).getPublicUrl(scriptPath).data.publicUrl;
      }

      const row = {
        project_id: projectId,
        created_by: user.id,
        config_key: configKey,
        status: "running",
        script,
        script_url: scriptUrl,
        external_job_id: externalJobId,
        error: null,
        preview_urls: [],
      };

      const { data, error } = await userClient
        .from("blender_jobs")
        .insert(row as never)
        .select()
        .single();

      if (error) {
        if (isMissingTable(error.message)) {
          // The migration isn't applied yet — the build is genuinely running,
          // so hand the client everything it needs to poll without a row.
          return json({
            configured: true,
            schemaReady: false,
            job: { ...row, id: null, script: undefined },
          });
        }
        return json({ configured: true, error: error.message }, 400);
      }

      return json({ configured: true, schemaReady: true, job: data });
    }

    // ── poll ──────────────────────────────────────────────────────────────
    if (action === "poll") {
      const jobId = body.jobId ? String(body.jobId) : null;
      let externalJobId = body.externalJobId ? String(body.externalJobId) : null;
      let projectId = body.projectId ? String(body.projectId) : null;
      let schemaReady = true;
      let row: Record<string, unknown> | null = null;

      if (jobId) {
        const { data, error } = await userClient
          .from("blender_jobs")
          .select("*")
          .eq("id", jobId)
          .maybeSingle();
        if (error && !isMissingTable(error.message)) {
          return json({ configured: true, error: error.message }, 400);
        }
        if (error) schemaReady = false;
        if (data) {
          row = data as Record<string, unknown>;
          externalJobId = (row.external_job_id as string) ?? externalJobId;
          projectId = (row.project_id as string) ?? projectId;
        }
      }

      if (!externalJobId) return json({ configured: true, error: "job not found" }, 404);
      if (!projectId) return json({ configured: true, error: "projectId required" }, 400);

      const polled = await serviceFetch(
        `${serviceUrl}/jobs/${encodeURIComponent(externalJobId)}`,
        serviceKey,
        { method: "GET" },
      );
      if (!polled.ok) {
        return json(
          {
            configured: true,
            error: `Blender service poll failed (${polled.status})`,
            detail: polled.text.slice(0, 500),
          },
          502,
        );
      }

      const remoteStatus = String(polled.body.status ?? "running");
      const patch: Record<string, unknown> = {};

      if (remoteStatus === "complete") {
        const blendSource = absoluteUrl(serviceUrl, polled.body.blend_url);
        const gltfSource = absoluteUrl(serviceUrl, polled.body.gltf_url);
        const stills = Array.isArray(polled.body.stills) ? polled.body.stills : [];
        const base = `${projectId}/model/${externalJobId}`;

        const blendUrl = blendSource
          ? await mirrorArtifact(
              admin,
              serviceKey,
              blendSource,
              `${base}/booth.blend`,
              "application/octet-stream",
            )
          : null;
        const gltfUrl = gltfSource
          ? await mirrorArtifact(
              admin,
              serviceKey,
              gltfSource,
              `${base}/booth.glb`,
              "model/gltf-binary",
            )
          : null;

        const previews: Array<{ url: string; label: string }> = [];
        for (let i = 0; i < stills.length && i < 6; i++) {
          const still = stills[i] as { url?: string; label?: string };
          const source = absoluteUrl(serviceUrl, still?.url);
          if (!source) continue;
          const mirrored = await mirrorArtifact(
            admin,
            serviceKey,
            source,
            `${base}/still_${String(i + 1).padStart(2, "0")}.png`,
            "image/png",
          );
          if (mirrored) {
            previews.push({ url: mirrored, label: still?.label ?? `View ${i + 1}` });
          }
        }

        patch.status = "complete";
        patch.blend_url = blendUrl;
        patch.gltf_url = gltfUrl;
        patch.preview_urls = previews;
        patch.error = null;
      } else if (remoteStatus === "failed") {
        patch.status = "failed";
        patch.error =
          String(polled.body.error ?? "The Blender service reported a failed build").slice(0, 4000);
      } else {
        patch.status = remoteStatus === "queued" ? "queued" : "running";
      }

      if (jobId && schemaReady) {
        const { data, error } = await userClient
          .from("blender_jobs")
          .update(patch as never)
          .eq("id", jobId)
          .select()
          .single();
        if (error && !isMissingTable(error.message)) {
          return json({ configured: true, error: error.message }, 400);
        }
        if (data) row = data as Record<string, unknown>;
      }

      return json({
        configured: true,
        schemaReady,
        status: patch.status,
        logTail: typeof polled.body.log_tail === "string" ? polled.body.log_tail : null,
        job: row ? { ...row, ...patch } : { ...patch, external_job_id: externalJobId, project_id: projectId },
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[blender-build]", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
