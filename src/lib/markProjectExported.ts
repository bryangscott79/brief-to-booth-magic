// markProjectExported — flips a project's pipeline status to "completed"
// once an export deliverable (asset ZIP, deck PPTX, …) has actually been
// handed to the user. This is what lights the final segment of the
// pipeline bar on the Projects page (PIPELINE_STEPS checks
// `p.status === "completed"`).
//
// Rules:
//   - Only ever SETS "completed" — never downgrades or unsets a status.
//   - Best-effort: failures are logged, never thrown, so a status write
//     can't break a download that already succeeded.
//   - Pass a QueryClient (from useQueryClient()) to refresh the
//     ["projects"] list and ["project", id] detail caches so the
//     Projects page pipeline updates without a reload.
//
// Deck/PPTX integrations should call this after their download fires:
//   await markProjectExported(projectId, queryClient);

import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";

export async function markProjectExported(
  projectId: string,
  queryClient?: QueryClient,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("projects")
      .update({ status: "completed" } as any)
      .eq("id", projectId);
    if (error) {
      console.warn("[markProjectExported] status write failed (non-fatal):", error.message);
      return;
    }
    // Partial-key invalidation: matches ["projects", userId, adminMode]
    // and the single-project detail query.
    queryClient?.invalidateQueries({ queryKey: ["projects"] });
    queryClient?.invalidateQueries({ queryKey: ["project", projectId] });
  } catch (e) {
    console.warn("[markProjectExported] status write threw (non-fatal):", e);
  }
}
