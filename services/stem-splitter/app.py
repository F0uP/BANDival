"""Bandival stem splitter – optional, self-hosted source separation with Demucs.

No cloud, no external AI API: the model runs on your own server (CPU is fine, a GPU is faster).

Protocol (used by web/src/lib/stem-separation.ts):
  POST   /jobs                      multipart "file", "model"  -> 202 {"id": ...}
  GET    /jobs/{id}                 -> {"status": queued|running|done|failed, "stems": [...], "error": ...}
  GET    /jobs/{id}/stems/{name}    -> audio/mpeg
  DELETE /jobs/{id}
  GET    /health
"""
import os
import queue
import shutil
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse

DATA = Path(os.environ.get("DATA_DIR", "/data"))
TOKEN = os.environ.get("STEM_SEPARATION_TOKEN", "")
DEFAULT_MODEL = os.environ.get("DEMUCS_MODEL", "htdemucs")
ALLOWED_MODELS = {"htdemucs", "htdemucs_ft", "htdemucs_6s", "mdx_extra"}
MAX_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "300")) * 1024 * 1024
JOB_TTL_SECONDS = int(os.environ.get("JOB_TTL_HOURS", "6")) * 3600
WORKERS = max(1, int(os.environ.get("WORKERS", "1")))

DATA.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="Bandival stem splitter", docs_url=None, redoc_url=None)
jobs: dict[str, dict] = {}
lock = threading.Lock()
work: "queue.Queue[tuple[str, Path, str]]" = queue.Queue()


def check_auth(authorization: str | None) -> None:
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized")


def worker() -> None:
    while True:
        job_id, source, model = work.get()
        with lock:
            job = jobs.get(job_id)
            if not job:
                continue
            job["status"] = "running"
        out = DATA / job_id / "out"
        try:
            subprocess.run(
                [sys.executable, "-m", "demucs", "-n", model, "--mp3", "--mp3-bitrate", "256", "-o", str(out), str(source)],
                check=True,
                capture_output=True,
                timeout=3 * 3600,
            )
            track_dir = next((out / model).iterdir())
            stems = sorted(path.stem for path in track_dir.glob("*.mp3"))
            with lock:
                job.update(status="done", stems=stems, dir=str(track_dir))
        except subprocess.CalledProcessError as error:
            message = (error.stderr or b"").decode(errors="ignore").strip().splitlines()
            with lock:
                job.update(status="failed", error=(message[-1] if message else "Demucs failed")[:400])
        except Exception as error:  # noqa: BLE001 - report anything to the client
            with lock:
                job.update(status="failed", error=str(error)[:400])
        finally:
            source.unlink(missing_ok=True)


def janitor() -> None:
    while True:
        time.sleep(600)
        cutoff = time.time() - JOB_TTL_SECONDS
        with lock:
            expired = [job_id for job_id, job in jobs.items() if job["created"] < cutoff]
            for job_id in expired:
                jobs.pop(job_id, None)
        for job_id in expired:
            shutil.rmtree(DATA / job_id, ignore_errors=True)


for _ in range(WORKERS):
    threading.Thread(target=worker, daemon=True).start()
threading.Thread(target=janitor, daemon=True).start()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "queued": work.qsize(), "model": DEFAULT_MODEL}


@app.post("/jobs", status_code=202)
async def create_job(file: UploadFile = File(...), model: str = Form(DEFAULT_MODEL), authorization: str | None = Header(None)) -> dict:
    check_auth(authorization)
    if model not in ALLOWED_MODELS:
        raise HTTPException(status_code=400, detail=f"unknown model, use one of {sorted(ALLOWED_MODELS)}")
    job_id = uuid.uuid4().hex
    folder = DATA / job_id
    folder.mkdir(parents=True)
    suffix = Path(file.filename or "audio").suffix.lower()[:8] or ".audio"
    source = folder / f"input{suffix}"
    size = 0
    with source.open("wb") as target:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_BYTES:
                shutil.rmtree(folder, ignore_errors=True)
                raise HTTPException(status_code=413, detail="file too large")
            target.write(chunk)
    with lock:
        jobs[job_id] = {"status": "queued", "stems": [], "error": None, "created": time.time()}
    work.put((job_id, source, model))
    return {"id": job_id}


def get_job(job_id: str) -> dict:
    with lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@app.get("/jobs/{job_id}")
def job_status(job_id: str, authorization: str | None = Header(None)) -> dict:
    check_auth(authorization)
    job = get_job(job_id)
    return {"status": job["status"], "stems": job.get("stems", []), "error": job.get("error")}


@app.get("/jobs/{job_id}/stems/{name}")
def job_stem(job_id: str, name: str, authorization: str | None = Header(None)) -> FileResponse:
    check_auth(authorization)
    job = get_job(job_id)
    if job["status"] != "done" or name not in job.get("stems", []):
        raise HTTPException(status_code=404, detail="stem not found")
    return FileResponse(Path(job["dir"]) / f"{name}.mp3", media_type="audio/mpeg", filename=f"{name}.mp3")


@app.delete("/jobs/{job_id}")
def delete_job(job_id: str, authorization: str | None = Header(None)) -> dict:
    check_auth(authorization)
    with lock:
        jobs.pop(job_id, None)
    shutil.rmtree(DATA / job_id, ignore_errors=True)
    return {"ok": True}
