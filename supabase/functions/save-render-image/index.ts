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

    const { projectId, angleId, angleName, imageDataUrl }: SaveImageRequest = await req.json();

    if (!projectId || !angleId || !angleName || !imageDataUrl) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decode base64 image
    const base64Match = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      return new Response(JSON.stringify({ error: "Invalid image data URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageType = base64Match[1];
    const base64Data = base64Match[2];
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    // Use service role client for storage operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique filename
    const timestamp = Date.now();
    const storagePath = `${projectId}/${angleId}_${timestamp}.${imageType}`;

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

    // Insert record
    const { data: record, error: insertError } = await adminClient
      .from("project_images")
      .insert({
        project_id: projectId,
        user_id: user.id,
        angle_id: angleId,
        angle_name: angleName,
        storage_path: storagePath,
        public_url: publicUrl,
        is_current: true,
      })
      .select()
      .single();

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
