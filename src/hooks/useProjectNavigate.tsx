import { useSearchParams, useNavigate } from "react-router-dom";
import { useCallback } from "react";

/**
 * Returns a navigate function that preserves the ?project= query param.
 */
export function useProjectNavigate() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectId = searchParams.get("project");

  const projectNavigate = useCallback(
    (path: string) => {
      const separator = path.includes("?") ? "&" : "?";
      navigate(projectId ? `${path}${separator}project=${projectId}` : path);
    },
    [navigate, projectId]
  );

  return { navigate: projectNavigate, projectId };
}
