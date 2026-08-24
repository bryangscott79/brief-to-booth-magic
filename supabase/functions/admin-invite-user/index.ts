// admin-invite-user — the unified invite + membership management function.
//
// Actions (POST body `action`, default "invite"):
//
//   invite       { email, role, agency_id? }
//     - agency_id given: invite INTO that agency.
//         · caller must be super admin, OR owner/admin of that agency
//         · existing auth user  -> direct agency_members attach ("smart attach")
//         · new user            -> auth invite email (lands on /auth?type=invite)
//                                  + pending_invites row so onboarding joins
//                                  them to the agency automatically
//     - no agency_id: platform-level invite (legacy behavior).
//         · caller must hold user_roles admin or super_admin
//         · role "super_admin" (super-admin callers only) also writes a
//           pending_invites super_admin row so the grant actually applies
//
//   memberships  { user_id }                      — list a user's agency
//         memberships (super admin only; service-role read)
//
//   remove_member { agency_id, user_id }          — remove a member.
//         Caller: super admin or owner/admin of the agency. Primary owners
//         cannot be removed.
//
//   delete_user  { user_id }                      — delete the auth account
//         (super admin only). Blocked while the user still owns an agency.
//         Cleans profiles / user_roles / agency_members rows.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Platform-level roles (service role read — never blocked by RLS)
    const { data: platformRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const roles = (platformRoles ?? []).map((r: { role: string }) => r.role);
    const isSuper = roles.includes("super_admin");
    const isPlatformAdmin = isSuper || roles.includes("admin");

    /** True when the caller may manage the given agency's roster. */
    const canManageAgency = async (agencyId: string): Promise<boolean> => {
      if (isSuper) return true;
      const { data } = await adminClient
        .from("agency_members")
        .select("role")
        .eq("agency_id", agencyId)
        .eq("user_id", caller.id)
        .in("role", ["owner", "admin"])
        .maybeSingle();
      return !!data;
    };

    const findUserByEmail = async (email: string) => {
      const { data } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      return data?.users?.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase(),
      );
    };

    const body = await req.json();
    const action: string = body.action ?? "invite";

    // ── memberships ─────────────────────────────────────────────────────────
    if (action === "memberships") {
      if (!isSuper) return json({ error: "Forbidden: super admin only" }, 403);
      const userId: string = body.user_id;
      if (!userId) return json({ error: "user_id required" }, 400);
      const { data, error } = await adminClient
        .from("agency_members")
        .select("id, agency_id, role, joined_at, agencies:agency_id(name, slug, owner_user_id)")
        .eq("user_id", userId);
      if (error) return json({ error: error.message }, 500);
      const memberships = (data ?? []).map((m: Record<string, unknown>) => {
        const agency = Array.isArray(m.agencies) ? m.agencies[0] : m.agencies;
        return {
          membership_id: m.id,
          agency_id: m.agency_id,
          role: m.role,
          joined_at: m.joined_at,
          agency_name: (agency as Record<string, unknown>)?.name ?? null,
          agency_slug: (agency as Record<string, unknown>)?.slug ?? null,
          is_primary_owner:
            (agency as Record<string, unknown>)?.owner_user_id === userId,
        };
      });
      return json({ memberships });
    }

    // ── remove_member ───────────────────────────────────────────────────────
    if (action === "remove_member") {
      const { agency_id: agencyId, user_id: userId } = body;
      if (!agencyId || !userId) return json({ error: "agency_id and user_id required" }, 400);
      if (!(await canManageAgency(agencyId))) {
        return json({ error: "Forbidden: not an admin of this agency" }, 403);
      }
      const { data: agency } = await adminClient
        .from("agencies")
        .select("owner_user_id")
        .eq("id", agencyId)
        .maybeSingle();
      if (agency?.owner_user_id === userId) {
        return json({ error: "The primary owner cannot be removed. Transfer ownership first." }, 400);
      }
      const { error } = await adminClient
        .from("agency_members")
        .delete()
        .eq("agency_id", agencyId)
        .eq("user_id", userId);
      if (error) return json({ error: error.message }, 500);
      return json({ message: "Member removed" });
    }

    // ── delete_user ─────────────────────────────────────────────────────────
    if (action === "delete_user") {
      if (!isSuper) return json({ error: "Forbidden: super admin only" }, 403);
      const userId: string = body.user_id;
      if (!userId) return json({ error: "user_id required" }, 400);
      if (userId === caller.id) return json({ error: "You can't delete your own account." }, 400);

      const { data: owned } = await adminClient
        .from("agencies")
        .select("id, name")
        .eq("owner_user_id", userId);
      if ((owned ?? []).length > 0) {
        return json({
          error: `This user still owns ${owned!.length} agenc${owned!.length === 1 ? "y" : "ies"} (${owned!.map((a: { name: string }) => a.name).join(", ")}). Delete or transfer those first.`,
        }, 400);
      }

      // Clean app rows first (no FK cascade from auth.users)
      await adminClient.from("agency_members").delete().eq("user_id", userId);
      await adminClient.from("user_roles").delete().eq("user_id", userId);
      await adminClient.from("profiles").delete().eq("user_id", userId);

      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 500);
      return json({ message: "Account deleted" });
    }

    // ── invite (default) ────────────────────────────────────────────────────
    const email: string = (body.email ?? "").trim();
    const role: string = body.role ?? "member";
    const agencyId: string | null = body.agency_id ?? null;

    if (!email || !email.includes("@")) return json({ error: "Valid email required" }, 400);

    if (agencyId) {
      // Agency-targeted invite
      if (!(await canManageAgency(agencyId))) {
        return json({ error: "Forbidden: not an admin of this agency" }, 403);
      }
      const agencyRole = ["admin", "member", "viewer"].includes(role) ? role : "member";
      const existing = await findUserByEmail(email);

      if (existing) {
        // Smart attach: the account exists — put them straight on the roster.
        const { data: already } = await adminClient
          .from("agency_members")
          .select("id")
          .eq("agency_id", agencyId)
          .eq("user_id", existing.id)
          .maybeSingle();
        if (already) return json({ message: "Already a member of this agency", user_id: existing.id });

        const { error: attachErr } = await adminClient.from("agency_members").insert({
          agency_id: agencyId,
          user_id: existing.id,
          role: agencyRole,
          invited_by: caller.id,
        });
        if (attachErr) return json({ error: attachErr.message }, 500);

        // Settle any matching pending invite so it doesn't linger.
        await adminClient
          .from("pending_invites")
          .update({ status: "accepted", accepted_at: new Date().toISOString() })
          .eq("invite_type", "agency_member")
          .eq("agency_id", agencyId)
          .ilike("email", email)
          .eq("status", "pending");

        return json({ message: "Added to agency", user_id: existing.id, attached: true });
      }

      // New account: auth invite email + a pending agency invite that
      // onboarding applies automatically on first sign-in.
      const { data: inviteData, error: inviteError } =
        await adminClient.auth.admin.inviteUserByEmail(email, {
          data: { invited_role: agencyRole, invited_agency_id: agencyId },
          redirectTo: `${req.headers.get("origin") ?? supabaseUrl}/auth?type=invite`,
        });
      if (inviteError) return json({ error: inviteError.message }, 500);

      const { error: pendingErr } = await adminClient.from("pending_invites").insert({
        email: email.toLowerCase(),
        invite_type: "agency_member",
        agency_id: agencyId,
        role: agencyRole,
        invited_by: caller.id,
      });
      if (pendingErr) console.error("pending_invites insert failed:", pendingErr);

      await adminClient.from("platform_invites").insert({ email, role: agencyRole, invited_by: caller.id });
      if (inviteData?.user) {
        await adminClient.from("profiles").upsert(
          { user_id: inviteData.user.id, email },
          { onConflict: "user_id" },
        );
      }
      return json({ message: "Invitation sent", user_id: inviteData?.user?.id });
    }

    // Platform-level invite (no agency)
    if (!isPlatformAdmin) return json({ error: "Forbidden: admin only" }, 403);
    if (role === "super_admin" && !isSuper) {
      return json({ error: "Forbidden: only super admins can invite super admins" }, 403);
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      if (role === "super_admin") {
        // Existing account: grant directly instead of a dead-letter invite.
        await adminClient
          .from("user_roles")
          .upsert({ user_id: existing.id, role: "super_admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });
        return json({ message: "Existing user granted super admin", user_id: existing.id });
      }
      await adminClient.from("platform_invites").insert({
        email,
        role,
        invited_by: caller.id,
        accepted_at: new Date().toISOString(),
      });
      await adminClient.from("profiles").upsert(
        {
          user_id: existing.id,
          email: existing.email,
          display_name: existing.user_metadata?.display_name ?? null,
        },
        { onConflict: "user_id" },
      );
      return json({ message: "User already exists", user_id: existing.id });
    }

    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { invited_role: role },
        redirectTo: `${req.headers.get("origin") ?? supabaseUrl}/auth?type=invite`,
      });
    if (inviteError) return json({ error: inviteError.message }, 500);

    if (role === "super_admin") {
      // The grant applies via accept_pending_invite at onboarding.
      const { error: pendingErr } = await adminClient.from("pending_invites").insert({
        email: email.toLowerCase(),
        invite_type: "super_admin",
        agency_id: null,
        role: null,
        invited_by: caller.id,
      });
      if (pendingErr) console.error("pending super_admin invite failed:", pendingErr);
    }

    await adminClient.from("platform_invites").insert({ email, role, invited_by: caller.id });
    if (inviteData?.user) {
      await adminClient.from("profiles").upsert(
        { user_id: inviteData.user.id, email },
        { onConflict: "user_id" },
      );
    }
    return json({ message: "Invitation sent", user_id: inviteData?.user?.id });
  } catch (err) {
    console.error(err);
    return json({ error: "Internal server error" }, 500);
  }
});
