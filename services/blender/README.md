# Blender build service — OPTIONAL, NOT WIRED

**Status: parked.** The Model step ships as a *file* deliverable — the app
generates a deterministic Blender Python program client-side
(`src/lib/blenderScript.ts`) and the user downloads it (plus a `.gltf`) and
runs it themselves. **Nothing in the app calls this service**, and the Model
page is fully functional without it.

This directory holds a small reference runner kept for the day hosted builds
are wanted: `server.py` accepts a Blender script, runs `blender -b -P` in a
temp dir, and serves back `booth.blend`, `booth.glb` and the rendered stills
the script wrote. It pairs with `supabase/functions/blender-build/`, which is
likewise unreferenced by the UI and returns a structured
`{ configured: false }` whenever `BLENDER_SERVICE_URL` is unset.

## If you ever do want to run it

```bash
pip install fastapi uvicorn pydantic
BLENDER_SERVICE_KEY=dev-key uvicorn server:app --host 0.0.0.0 --port 8080
```

Requires a `blender` binary on PATH (override with `BLENDER_BIN`). Smoke test:

```bash
curl -s localhost:8080/health
curl -s -X POST localhost:8080/jobs \
  -H 'Authorization: Bearer dev-key' -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"script": open(sys.argv[1]).read(), "name": "booth"}))' booth.py)"
curl -s localhost:8080/jobs/<job_id> -H 'Authorization: Bearer dev-key'
```

To light up the hosted half, deploy this container anywhere that allows long
requests (Fly.io, Cloud Run, Render), then set two Supabase secrets —
`BLENDER_SERVICE_URL` (the service's base URL) and `BLENDER_SERVICE_KEY` (the
same value as `BLENDER_SERVICE_KEY` here) — and build UI on top of the
`blender-build` function. A Dockerfile was deliberately not written: decide the
Blender version and base image at that point rather than shipping a stale one.
