import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

/**
 * Clears ALL React Query caches when the authenticated user changes.
 * Prevents data from one user leaking into another user's session.
 */
export function useClearCacheOnUserChange() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const prevUserId = useRef<string | null>(user?.id ?? null);

  useEffect(() => {
    const currentId = user?.id ?? null;
    if (prevUserId.current !== null && prevUserId.current !== currentId) {
      // User changed — nuke all cached queries
      queryClient.clear();
    }
    prevUserId.current = currentId;
  }, [user?.id, queryClient]);
}
