import { createRoot } from "react-dom/client";
import "./index.css";

const STALE_CHUNK_RELOAD_KEY = "canopy:stale-chunk-reload-attempted";
const STALE_CHUNK_RELOAD_COOLDOWN_MS = 10_000;

function isStaleChunkError(reason: unknown) {
  const message = String(
    reason instanceof Error ? reason.message : (reason as { message?: unknown })?.message ?? reason,
  );

  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
}

function reloadOnceForStaleChunk() {
  const now = Date.now();
  const lastReload = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) ?? 0);
  if (now - lastReload < STALE_CHUNK_RELOAD_COOLDOWN_MS) return;
  sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(now));
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

const rootElement = document.getElementById("root");

function renderStartupError() {
  if (!rootElement) return;
  createRoot(rootElement).render(
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-lg">
        <h1 className="mb-2 text-xl font-semibold">Canopy needs a refresh</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          The app could not load the latest bundle. Refresh to reconnect to the current version.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Refresh app
        </button>
      </div>
    </div>,
  );
}

if (rootElement) {
  import("./App.tsx")
    .then(({ default: App }) => {
      createRoot(rootElement).render(<App />);
    })
    .catch((error) => {
      if (isStaleChunkError(error)) {
        reloadOnceForStaleChunk();
      }
      console.error("App startup failed", error);
      renderStartupError();
    });
}
