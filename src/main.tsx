import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const STALE_CHUNK_RELOAD_KEY = "canopy:stale-chunk-reload-attempted";

function isStaleChunkError(reason: unknown) {
  const message = String(
    reason instanceof Error ? reason.message : (reason as { message?: unknown })?.message ?? reason,
  );

  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
}

function reloadOnceForStaleChunk() {
  if (sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) === "true") return;
  sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, "true");
  window.location.reload();
}

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnceForStaleChunk();
});

window.addEventListener("unhandledrejection", (event) => {
  if (isStaleChunkError(event.reason)) {
    event.preventDefault();
    reloadOnceForStaleChunk();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
