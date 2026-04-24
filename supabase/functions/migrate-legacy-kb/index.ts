// migrate-legacy-kb — backfills legacy knowledge_base_files and
// activation_type_kb_files rows into knowledge_documents + triggers embedding.
//
// Idempotent: each source row is logged in kb_migration_log so reruns skip
// already-migrated rows. Conflicts (same agency_id + storage_path) are skipped
// rather than overwritten, so no new-system data is ever clobbered.
//
// Caller must be an authenticated super_admin or agency admin. Edge function
// runs with the service role to bypass RLS during backfill.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface MigrationStat {
  source_table: string;
  total_seen: number;
  migrated: number;
  skipped_already_done: number;
  skipped_conflict: number;
  failed: number;
  errors: { row_id: string; error: string }[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // --- AuthZ: require super_admin OR agency admin in the user's session ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: userRes.user.id });
    if (!isSuper) {
      // Fall back: any agency admin can migrate their own agency's legacy rows.
      // For simplicity (and to match the "operator tool" intent), require super_admin here.
      return new Response(JSON.stringify({ error: "Super admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dryRun === true;
    const limit: number = Math.min(Math.max(Number(body.limit) || 100, 1), 500);

    const stats: MigrationStat[] = [];

    // ── Source 1: knowledge_base_files (project scope) ─────────────────────
    stats.push(
      await migrateSource(admin, {
        sourceTable: "knowledge_base_files",
        scope: "project",
        scopeColumn: "project_id",
        limit,
        dryRun,
      }),
    );

    // ── Source 2: activation_type_kb_files (activation_type scope) ─────────
    stats.push(
      await migrateSource(admin, {
        sourceTable: "activation_type_kb_files",
        scope: "activation_type",
        scopeColumn: "activation_type_id",
        limit,
        dryRun,
      }),
    );

    return new Response(JSON.stringify({ ok: true, dryRun, stats }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("migrate-legacy-kb fatal:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function migrateSource(
  admin: ReturnType<typeof createClient>,
  opts: {
    sourceTable: "knowledge_base_files" | "activation_type_kb_files";
    scope: "project" | "activation_type";
    scopeColumn: "project_id" | "activation_type_id";
    limit: number;
    dryRun: boolean;
  },
): Promise<MigrationStat> {
  const stat: MigrationStat = {
    source_table: opts.sourceTable,
    total_seen: 0,
    migrated: 0,
    skipped_already_done: 0,
    skipped_conflict: 0,
    failed: 0,
    errors: [],
  };

  // Fetch source rows that don't already have a successful migration log.
  const { data: rows, error: rowsErr } = await admin
    .from(opts.sourceTable)
    .select("*")
    .order("created_at", { ascending: true })
    .limit(opts.limit);
  if (rowsErr) throw new Error(`Read ${opts.sourceTable}: ${rowsErr.message}`);

  if (!rows?.length) return stat;
  stat.total_seen = rows.length;

  // Bulk-load existing migration log for these row ids
  const ids = rows.map((r: any) => r.id);
  const { data: logRows } = await admin
    .from("kb_migration_log")
    .select("source_row_id, status")
    .eq("source_table", opts.sourceTable)
    .in("source_row_id", ids);
  const doneSet = new Set(
    (logRows || []).filter((l: any) => l.status === "success").map((l: any) => l.source_row_id),
  );

  for (const row of rows as any[]) {
    if (doneSet.has(row.id)) {
      stat.skipped_already_done++;
      continue;
    }

    try {
      const scopeId = row[opts.scopeColumn];
      if (!scopeId) throw new Error(`Missing ${opts.scopeColumn}`);

      // Resolve agency_id for this row.
      const agencyId = await resolveAgencyId(admin, opts.scope, scopeId, row.user_id);
      if (!agencyId) throw new Error("Could not resolve agency_id");

      // Conflict check: skip if a knowledge_documents row already exists at
      // the same storage_path within this agency.
      const { data: existing } = await admin
        .from("knowledge_documents")
        .select("id")
        .eq("agency_id", agencyId)
        .eq("storage_path", row.storage_path)
        .maybeSingle();

      if (existing) {
        if (!opts.dryRun) {
          await admin.from("kb_migration_log").insert({
            source_table: opts.sourceTable,
            source_row_id: row.id,
            document_id: existing.id,
            status: "success",
            error: "skipped_conflict_existing_doc",
          });
        }
        stat.skipped_conflict++;
        continue;
      }

      if (opts.dryRun) {
        stat.migrated++;
        continue;
      }

      // Insert into knowledge_documents (legacy rows live in 'knowledge-base' bucket).
      const { data: doc, error: insErr } = await admin
        .from("knowledge_documents")
        .insert({
          agency_id: agencyId,
          scope: opts.scope,
          scope_id: scopeId,
          filename: row.file_name,
          title: row.file_name,
          mime_type: row.file_type,
          file_size_bytes: row.file_size_bytes,
          storage_bucket: "knowledge-base",
          storage_path: row.storage_path,
          uploaded_by: row.user_id,
          extracted_text: row.extracted_text,
          doc_type: row.doc_type ?? null,
          user_tags: row.topics ?? [],
          status: row.extracted_text ? "pending" : "pending",
          metadata: { migrated_from: opts.sourceTable, legacy_id: row.id },
        })
        .select("id")
        .single();
      if (insErr) throw new Error(`Insert knowledge_documents: ${insErr.message}`);

      // Trigger embedding (best-effort; failure is logged but doesn't fail row)
      let embedNote: string | null = null;
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/embed-document`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
          },
          body: JSON.stringify({ document_id: doc.id }),
        });
        if (!r.ok) embedNote = `embed-document HTTP ${r.status}`;
      } catch (e) {
        embedNote = `embed-document error: ${String(e?.message ?? e)}`;
      }

      await admin.from("kb_migration_log").insert({
        source_table: opts.sourceTable,
        source_row_id: row.id,
        document_id: doc.id,
        status: "success",
        error: embedNote,
      });

      stat.migrated++;
    } catch (e) {
      stat.failed++;
      const msg = String((e as any)?.message ?? e);
      stat.errors.push({ row_id: row.id, error: msg });
      if (!opts.dryRun) {
        await admin.from("kb_migration_log").insert({
          source_table: opts.sourceTable,
          source_row_id: row.id,
          status: "failed",
          error: msg,
        });
      }
    }
  }

  return stat;
}

async function resolveAgencyId(
  admin: ReturnType<typeof createClient>,
  scope: "project" | "activation_type",
  scopeId: string,
  fallbackUserId: string,
): Promise<string | null> {
  if (scope === "project") {
    // Project owner → their agency membership (prefer owner role).
    const { data: proj } = await admin
      .from("projects")
      .select("user_id")
      .eq("id", scopeId)
      .maybeSingle();
    const ownerId = proj?.user_id ?? fallbackUserId;
    return await firstAgencyForUser(admin, ownerId);
  }
  // activation_type → use the activation_type owner; fallback to caller user
  const { data: at } = await admin
    .from("activation_types")
    .select("user_id, is_builtin")
    .eq("id", scopeId)
    .maybeSingle();
  const ownerId = at?.user_id ?? fallbackUserId;
  if (!ownerId) return null;
  return await firstAgencyForUser(admin, ownerId);
}

async function firstAgencyForUser(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("agency_members")
    .select("agency_id, role, joined_at")
    .eq("user_id", userId)
    .order("role", { ascending: true }) // 'admin'/'owner' tend to sort before 'member'
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.agency_id ?? null;
}
