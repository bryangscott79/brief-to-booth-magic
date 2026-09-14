"""CANOPY headless Blender build service.

A deliberately small job runner: it accepts a Blender Python program, runs it
under `blender -b -P`, and serves back the .blend, the .glb and the rendered
stills the script wrote. It knows nothing about booths — all the geometry
lives in the script, which the app generates deterministically
(src/lib/blenderScript.ts).

Contract (matches supabase/functions/blender-build/index.ts):

    POST /jobs                {script, name?, stills?, metadata?}
                              -> 202 {job_id, status}
    GET  /jobs/{job_id}       -> {job_id, status, blend_url, gltf_url,
                                  stills: [{url, label}], error, log_tail}
    GET  /jobs/{job_id}/files/{filename}  -> the artifact bytes
    GET  /health              -> {ok: true, blender: "..."}

Every route except /health requires `Authorization: Bearer $BLENDER_SERVICE_KEY`
(or `X-API-Key`). Leaving BLENDER_SERVICE_KEY unset disables the check, which
is only sensible on a private network.

Run locally:
    pip install -r requirements.txt
    BLENDER_SERVICE_KEY=dev-key uvicorn server:app --host 0.0.0.0 --port 8080
"""

from __future__ import annotations

import os
import shutil
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

BLENDER_BIN = os.environ.get("BLENDER_BIN", "blender")
SERVICE_KEY = os.environ.get("BLENDER_SERVICE_KEY", "").strip()
JOB_ROOT = Path(os.environ.get("JOB_ROOT", "/tmp/canopy-blender-jobs"))
JOB_TTL_SECONDS = int(os.environ.get("JOB_TTL_SECONDS", 24 * 3600))
BUILD_TIMEOUT_SECONDS = int(os.environ.get("BUILD_TIMEOUT_SECONDS", 900))
MAX_WORKERS = int(os.environ.get("MAX_WORKERS", 1))
MAX_SCRIPT_BYTES = int(os.environ.get("MAX_SCRIPT_BYTES", 2_000_000))

app = FastAPI(title="CANOPY Blender build service", version="1.0")
_executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)
_jobs: Dict[str, Dict[str, Any]] = {}
_lock = threading.Lock()


# ── auth ─────────────────────────────────────────────────────────────────────


def require_key(
    authorization: Optional[str] = Header(default=None),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
) -> None:
    if not SERVICE_KEY:
        return
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    elif x_api_key:
        token = x_api_key.strip()
    if token != SERVICE_KEY:
        raise HTTPException(status_code=401, detail="Invalid service key")


# ── models ───────────────────────────────────────────────────────────────────


class JobRequest(BaseModel):
    script: str = Field(..., description="Blender Python program to execute")
    name: str = "booth"
    stills: int = 3
    metadata: Dict[str, Any] = Field(default_factory=dict)


# ── job plumbing ─────────────────────────────────────────────────────────────


def _job_dir(job_id: str) -> Path:
    return JOB_ROOT / job_id


def _set(job_id: str, **fields: Any) -> None:
    with _lock:
        _jobs.setdefault(job_id, {})["job_id"] = job_id
        _jobs[job_id].update(fields)


def _get(job_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def _sweep_old_jobs() -> None:
    """Drop job directories older than the TTL so a long-lived box doesn't fill."""
    cutoff = time.time() - JOB_TTL_SECONDS
    if not JOB_ROOT.exists():
        return
    for path in JOB_ROOT.iterdir():
        try:
            if path.is_dir() and path.stat().st_mtime < cutoff:
                shutil.rmtree(path, ignore_errors=True)
                with _lock:
                    _jobs.pop(path.name, None)
        except OSError:
            continue


def _run_build(job_id: str, stills: int) -> None:
    job_dir = _job_dir(job_id)
    out_dir = job_dir / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env["CANOPY_OUT_DIR"] = str(out_dir)
    if stills <= 0:
        env["CANOPY_SKIP_RENDER"] = "1"

    _set(job_id, status="running", started_at=time.time())
    try:
        proc = subprocess.run(
            [BLENDER_BIN, "-b", "-noaudio", "-P", str(job_dir / "script.py")],
            cwd=str(job_dir),
            env=env,
            capture_output=True,
            text=True,
            timeout=BUILD_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        _set(
            job_id,
            status="failed",
            error=f"Blender timed out after {BUILD_TIMEOUT_SECONDS}s",
            finished_at=time.time(),
        )
        return
    except FileNotFoundError:
        _set(
            job_id,
            status="failed",
            error=f"Blender binary not found at {BLENDER_BIN!r}",
            finished_at=time.time(),
        )
        return

    log_tail = (proc.stdout or "")[-4000:] + (proc.stderr or "")[-4000:]
    (job_dir / "build.log").write_text(log_tail, encoding="utf-8", errors="replace")

    if proc.returncode != 0:
        _set(
            job_id,
            status="failed",
            error=((proc.stderr or proc.stdout or "").strip()[-2000:] or "Blender exited non-zero"),
            log_tail=log_tail,
            finished_at=time.time(),
        )
        return

    blend = out_dir / "booth.blend"
    gltf = out_dir / "booth.glb"
    still_files = sorted(p for p in out_dir.glob("still_*.png"))

    if not blend.exists():
        _set(
            job_id,
            status="failed",
            error="Blender finished but wrote no booth.blend — check the script's output block",
            log_tail=log_tail,
            finished_at=time.time(),
        )
        return

    _set(
        job_id,
        status="complete",
        blend_url=f"/jobs/{job_id}/files/booth.blend",
        gltf_url=f"/jobs/{job_id}/files/booth.glb" if gltf.exists() else None,
        stills=[
            {
                "url": f"/jobs/{job_id}/files/{p.name}",
                "label": p.stem.replace("still_", "").replace("_", " ").strip().title(),
            }
            for p in still_files
        ],
        log_tail=log_tail,
        error=None,
        finished_at=time.time(),
    )


# ── routes ───────────────────────────────────────────────────────────────────


@app.get("/health")
def health() -> Dict[str, Any]:
    version = "unavailable"
    try:
        proc = subprocess.run(
            [BLENDER_BIN, "--version"], capture_output=True, text=True, timeout=30
        )
        version = (proc.stdout or "").strip().splitlines()[0] if proc.stdout else "unknown"
    except Exception as exc:  # noqa: BLE001 — health must never raise
        version = f"error: {exc}"
    with _lock:
        active = sum(1 for j in _jobs.values() if j.get("status") in ("queued", "running"))
    return {"ok": True, "blender": version, "active_jobs": active}


@app.post("/jobs", status_code=202, dependencies=[Depends(require_key)])
def create_job(req: JobRequest) -> Dict[str, Any]:
    if not req.script.strip():
        raise HTTPException(status_code=400, detail="script is required")
    if len(req.script.encode("utf-8")) > MAX_SCRIPT_BYTES:
        raise HTTPException(status_code=413, detail="script too large")

    _sweep_old_jobs()
    job_id = uuid.uuid4().hex
    job_dir = _job_dir(job_id)
    job_dir.mkdir(parents=True, exist_ok=True)
    (job_dir / "script.py").write_text(req.script, encoding="utf-8")

    _set(
        job_id,
        status="queued",
        name=req.name,
        metadata=req.metadata,
        created_at=time.time(),
        error=None,
        stills=[],
    )
    _executor.submit(_run_build, job_id, req.stills)
    return {"job_id": job_id, "status": "queued"}


@app.get("/jobs/{job_id}", dependencies=[Depends(require_key)])
def get_job(job_id: str) -> Dict[str, Any]:
    job = _get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job")
    return {
        "job_id": job_id,
        "status": job.get("status", "queued"),
        "blend_url": job.get("blend_url"),
        "gltf_url": job.get("gltf_url"),
        "stills": job.get("stills", []),
        "error": job.get("error"),
        "log_tail": (job.get("log_tail") or "")[-2000:],
    }


@app.get("/jobs/{job_id}/files/{filename}", dependencies=[Depends(require_key)])
def get_file(job_id: str, filename: str) -> FileResponse:
    # Never let a filename escape the job's own output directory.
    safe = Path(filename).name
    path = (_job_dir(job_id) / "out" / safe).resolve()
    root = (_job_dir(job_id) / "out").resolve()
    if not str(path).startswith(str(root)) or not path.is_file():
        raise HTTPException(status_code=404, detail="Unknown artifact")
    media = {
        ".png": "image/png",
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".blend": "application/octet-stream",
    }.get(path.suffix, "application/octet-stream")
    return FileResponse(path, media_type=media, filename=safe)


@app.delete("/jobs/{job_id}", dependencies=[Depends(require_key)])
def delete_job(job_id: str) -> Dict[str, Any]:
    shutil.rmtree(_job_dir(job_id), ignore_errors=True)
    with _lock:
        _jobs.pop(job_id, None)
    return {"deleted": job_id}


# Typing import kept meaningful for readers of the artifact list.
JobArtifacts = List[Dict[str, str]]
