import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SaveImageRequest {
  projectId: string;
  angleId: string;
  angleName: string;
  imageDataUrl: string; // data:image/png;base64,...
  /**
   * Canonical model id that produced the image (e.g.
   * "openai/gpt-image-2", "google/gemini-3-pro-image-preview").
   * Persisted into project_images.prompt_artifacts so the
   * "Canopy 2.0" / "Canopy Lite" badge survives reload — without
   * this, the badge only shows for renders generated in the
   * current session.
   */
  modelUsed?: string;
  /**
   * When the render fell back to Gemini, gpt-image-2's actual error
   * chain. Persisted so the hover-tooltip survives reload too.
   */
  primaryError?: string;
  /**
   * Footprint config (booth size) this render was generated for, as a
   * sanitized key (e.g. "20x40"). Optional — older clients / single-
   * config flows omit it and behave exactly as before. When present it
   * is persisted into prompt_artifacts AND used to prefix the storage
   * filename so renders are organized per size.
   */
  configKey?: string;
  /** Human label for the config (raw footprintSize, e.g. "20x40"). */
  configLabel?: string;
  /**
   * Prompt-transparency payload built client-side by
   * buildRenderPromptArtifacts: the exact prompt sent to the image
   * model, negative prompt, geometry summary, compliance list, labeled
   * reference URLs, model id, and generation timestamp. Merged into
   * prompt_artifacts alongside the badge/config fields. Optional —
   * older clients omit it and behave exactly as before.
   */
  promptArtifacts?: Record<string, unknown>;
}

/**
 * Row-size guard for the client-supplied artifacts payload. The client
 * already caps the prompt text and never sends base64, but defend
 * against misbehaving callers: reject non-objects and anything that
 * serializes past ~100 KB (a composed prompt is a few KB).
 */
function sanitizePromptArtifacts(
  input: unknown,
): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  try {
    if (JSON.stringify(input).length > 100_000) {
      console.warn("promptArtifacts payload too large; dropping it (render still saves)");
      return null;
    }
  } catch {
    return null;
  }
  return input as Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create client with user's token to get user ID
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { projectId, angleId, angleName, imageDataUrl, modelUsed, primaryError, configKey, configLabel, promptArtifacts: clientArtifacts }: SaveImageRequest = await req.json();

    if (!projectId || !angleId || !angleName || !imageDataUrl) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let binaryData: Uint8Array;
    let imageType = "png";

    // Handle base64 data URL
    const base64Match = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (base64Match) {
      imageType = base64Match[1];
      const base64Data = base64Match[2];
      binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    } else if (imageDataUrl.startsWith("http")) {
      // Handle regular URL — fetch the image
      console.log("Fetching image from URL:", imageDataUrl.substring(0, 80));
      const imgResponse = await fetch(imageDataUrl);
      if (!imgResponse.ok) throw new Error(`Failed to fetch image: ${imgResponse.status}`);
      const contentType = imgResponse.headers.get("content-type") || "image/png";
      imageType = contentType.split("/")[1] || "png";
      const arrayBuffer = await imgResponse.arrayBuffer();
      binaryData = new Uint8Array(arrayBuffer);
    } else {
      return new Response(JSON.stringify({ error: "Invalid image data — must be base64 data URL or HTTP URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client for storage operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique filename. When the client tags the render with a
    // footprint config, prefix the filename with the config key so files
    // in storage group per booth size. Sanitize defensively — the key is
    // already file-safe when produced by the current client, but older
    // or third-party callers could send anything.
    const timestamp = Date.now();
    const safeConfigKey = configKey
      ? configKey.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "")
      : "";
    const storagePath = `${projectId}/${safeConfigKey ? `${safeConfigKey}_` : ""}${angleId}_${timestamp}.${imageType}`;

    // Upload to storage
    const { error: uploadError } = await adminClient.storage
      .from("project-images")
      .upload(storagePath, binaryData, {
        contentType: `image/${imageType}`,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = adminClient.storage
      .from("project-images")
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // Mark previous images for this angle as not current
    await adminClient
      .from("project_images")
      .update({ is_current: false })
      .eq("project_id", projectId)
      .eq("angle_id", angleId)
      .eq("user_id", user.id);

    // Insert record. The prompt_artifacts JSON merges (in override
    // order): the client's prompt-transparency payload (exact prompt,
    // negative, geometry summary, compliance, labeled reference URLs,
    // model, timestamp), then the badge fields (modelUsed /
    // primaryError), then the booth-size config tags. Badge + config
    // fields come from the same request, so they win on key collisions.
    // (The column already exists in prod; no migration needed. The
    // PGRST204 retry below still guards drifted environments.)
    const safeArtifacts = sanitizePromptArtifacts(clientArtifacts);
    const promptArtifacts: Record<string, unknown> | null =
      (safeArtifacts || modelUsed || primaryError || configKey || configLabel)
        ? {
            ...(safeArtifacts ?? {}),
            ...(modelUsed ? { modelUsed } : {}),
            ...(primaryError ? { primaryError } : {}),
            ...(configKey ? { configKey } : {}),
            ...(configLabel ? { configLabel } : {}),
          }
        : null;

    const insertPayload: Record<string, unknown> = {
      project_id: projectId,
      user_id: user.id,
      angle_id: angleId,
      angle_name: angleName,
      storage_path: storagePath,
      public_url: publicUrl,
      is_current: true,
      ...(promptArtifacts ? { prompt_artifacts: promptArtifacts } : {}),
    };

    let { data: record, error: insertError } = await adminClient
      .from("project_images")
      .insert(insertPayload)
      .select()
      .single();

    // Schema-drift guard: if the production DB is missing the
    // prompt_artifacts column (migration 20260514000000 not applied —
    // Lovable's migration pipeline is unreliable), PostgREST rejects
    // the ENTIRE insert with PGRST204. That silently killed every
    // render save: the image uploaded to storage but no project_images
    // row was ever written, so renders vanished on reload and Files
    // stayed empty. Retry without the optional field — losing badge
    // metadata is far better than losing the render.
    if (
      insertError &&
      promptArtifacts &&
      (insertError.code === "PGRST204" ||
        /prompt_artifacts/i.test(insertError.message ?? ""))
    ) {
      console.warn(
        "prompt_artifacts column missing in project_images; retrying insert without it. Apply migration 20260514000000_prompt_artifacts.sql to restore badge persistence.",
        insertError.message,
      );
      delete insertPayload.prompt_artifacts;
      ({ data: record, error: insertError } = await adminClient
        .from("project_images")
        .insert(insertPayload)
        .select()
        .single());
    }

    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error(`Failed to save image record: ${insertError.message}`);
    }

    console.log(`Saved image for ${angleName} to ${storagePath}`);

    return new Response(
      JSON.stringify({
        success: true,
        image: record,
        publicUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error saving image:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to save image",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
