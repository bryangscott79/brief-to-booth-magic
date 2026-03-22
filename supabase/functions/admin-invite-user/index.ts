import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate calling user is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Client with calling user's token to check role
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callingUser } } = await userClient.auth.getUser();
    if (!callingUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await userClient
      .from("user_roles")
      .select("id")
      .eq("user_id", callingUser.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, role = "member" } = await req.json();

    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Valid email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client to invite user
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (existingUser) {
      // User already exists — just record the invite and optionally set role
      const { error: inviteErr } = await adminClient
        .from("platform_invites")
        .insert({
          email,
          role,
          invited_by: callingUser.id,
          accepted_at: new Date().toISOString(), // already has account
        });

      if (inviteErr) console.error("Insert invite error:", inviteErr);

      // Ensure profile row exists
      await adminClient.from("profiles").upsert(
        {
          user_id: existingUser.id,
          email: existingUser.email,
          display_name: existingUser.user_metadata?.display_name ?? null,
        },
        { onConflict: "user_id" }
      );

      return new Response(
        JSON.stringify({ message: "User already exists", user_id: existingUser.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Invite new user via Supabase Auth (sends email)
    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { invited_role: role },
        redirectTo: `${req.headers.get("origin") ?? supabaseUrl}/auth`,
      });

    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record invite
    await adminClient.from("platform_invites").insert({
      email,
      role,
      invited_by: callingUser.id,
    });

    // Pre-create profile
    if (inviteData?.user) {
      await adminClient.from("profiles").upsert(
        { user_id: inviteData.user.id, email },
        { onConflict: "user_id" }
      );
    }

    return new Response(
      JSON.stringify({ message: "Invitation sent", user_id: inviteData?.user?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
