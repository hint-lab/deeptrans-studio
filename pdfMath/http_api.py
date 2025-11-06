from __future__ import annotations

import asyncio
import json
import logging
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from pdf2zh_next.config import ConfigManager
from pdf2zh_next.config.cli_env_model import CLIEnvSettingsModel
from pdf2zh_next.config.model import SettingsModel
from pdf2zh_next.high_level import do_translate_async_stream, TranslationError

logger = logging.getLogger(__name__)


class SubmitRequest(BaseModel):
    data: dict[str, Any] | None = None


class JobState(BaseModel):
    id: str
    state: str  # PENDING|PROGRESS|SUCCESS|ERROR|CANCELLED
    info: dict[str, Any] | None = None
    error: str | None = None
    mono_pdf_path: str | None = None
    dual_pdf_path: str | None = None
    glossary_path: str | None = None


app = FastAPI(title="PDFMathTranslate Next REST API", version="1.0.0")

# In-memory job store
_jobs: dict[str, JobState] = {}
_job_tasks: dict[str, asyncio.Task] = {}
_base_output = Path("pdf2zh_jobs").resolve()
_base_output.mkdir(parents=True, exist_ok=True)


async def _build_settings(tmp_pdf_path: Path, data: dict[str, Any] | None) -> SettingsModel:
    """Build SettingsModel from provided data dict and temp file path."""
    config_manager = ConfigManager()
    # Start from defaults derived from CLI/env/config files to honor existing behavior
    base_cli = config_manager.initialize_cli_config()
    # Ensure non-GUI, single-file mode
    base_cli.basic.gui = False
    base_cli.basic.input_files = {str(tmp_pdf_path)}
    # Apply overrides from request body (if any)
    if data:
        # Accept flat keys matching CLI/env names
        # For convenience, allow nested style keys like translation.lang_in
        flat_data: dict[str, Any] = {}
        for key, value in data.items():
            if "." in key:
                # Map dotted path to top-level dict for CLIEnvSettingsModel constructor
                root, child = key.split(".", 1)
                flat_data.setdefault(root, {})
                # Support simple one-level nesting only
                flat_data[root][child] = value
            else:
                flat_data[key] = value
        try:
            # Merge dict into model by creating new instance
            base_cli = CLIEnvSettingsModel(**{**base_cli.model_dump(mode="json"), **flat_data})
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid parameters: {e}") from e
    settings = base_cli.to_settings_model()
    # Ensure output directory per job
    job_dir = _base_output / tmp_pdf_path.stem
    job_dir.mkdir(parents=True, exist_ok=True)
    settings.translation.output = job_dir.as_posix()
    # Validate before running
    try:
        settings.validate_settings()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return settings


async def _run_job(job_id: str, settings: SettingsModel, input_pdf_path: Path) -> None:
    state = _jobs[job_id]
    state.state = "PROGRESS"
    _jobs[job_id] = state
    mono_path: Path | None = None
    dual_path: Path | None = None
    glossary_path: Path | None = None
    try:
        async for event in do_translate_async_stream(settings, input_pdf_path):
            if event["type"] in ("progress_start", "progress_update", "progress_end"):
                state.info = {
                    "stage": event.get("stage"),
                    "overall_progress": event.get("overall_progress"),
                    "part_index": event.get("part_index"),
                    "total_parts": event.get("total_parts"),
                    "stage_current": event.get("stage_current"),
                    "stage_total": event.get("stage_total"),
                }
            elif event["type"] == "finish":
                result = event["translate_result"]
                mono_path = result.mono_pdf_path
                dual_path = result.dual_pdf_path
                glossary_path = result.auto_extracted_glossary_path
                break
            elif event["type"] == "error":
                raise TranslationError(event.get("error", "Unknown error"))
        state.state = "SUCCESS"
        state.info = None
        state.mono_pdf_path = mono_path.as_posix() if mono_path and mono_path.exists() else None
        state.dual_pdf_path = dual_path.as_posix() if dual_path and dual_path.exists() else None
        state.glossary_path = glossary_path.as_posix() if glossary_path and glossary_path.exists() else None
        _jobs[job_id] = state
    except asyncio.CancelledError:
        state.state = "CANCELLED"
        _jobs[job_id] = state
        raise
    except TranslationError as e:
        state.state = "ERROR"
        state.error = str(e)
        _jobs[job_id] = state
    except Exception as e:
        logger.exception("Job failed")
        state.state = "ERROR"
        state.error = str(e)
        _jobs[job_id] = state


@app.post("/v1/translate")
async def submit_translate(
    file: UploadFile = File(...),
    data: str | None = Form(default=None, description="JSON string of parameters"),
):
    """
    Submit a translation job.
    - file: PDF file to translate (multipart/form-data)
    - data: JSON string for parameters (optional). Examples:
      {"translation.lang_in":"en","translation.lang_out":"zh","google":true, "google_settings.api_key":"..."}
    """
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    # Save to temp dir first, then move into job dir
    tmp_dir = Path(tempfile.mkdtemp(prefix="pdf2zh_"))
    tmp_pdf_path = tmp_dir / (Path(file.filename or "input").stem + ".pdf")
    with tmp_pdf_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    # Parse data
    parsed: dict[str, Any] | None = None
    if data:
        try:
            parsed = json.loads(data)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid data JSON: {e}") from e
    # Build settings
    settings = await _build_settings(tmp_pdf_path, parsed)
    # Create job
    job_id = str(uuid.uuid4())
    # Move input into job dir (named by job id)
    job_dir = _base_output / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    job_pdf_path = job_dir / tmp_pdf_path.name
    shutil.move(tmp_pdf_path.as_posix(), job_pdf_path.as_posix())
    # Update input file path in settings
    settings.basic.input_files = {job_pdf_path.as_posix()}
    settings.translation.output = job_dir.as_posix()
    _jobs[job_id] = JobState(id=job_id, state="PENDING")
    # Launch background task
    task = asyncio.create_task(_run_job(job_id, settings, job_pdf_path))
    _job_tasks[job_id] = task
    return JSONResponse({"id": job_id})


@app.get("/v1/translate/{job_id}")
async def get_status(job_id: str):
    state = _jobs.get(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job not found")
    return JSONResponse(state.model_dump())


@app.delete("/v1/translate/{job_id}")
async def cancel_job(job_id: str):
    state = _jobs.get(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job not found")
    task = _job_tasks.get(job_id)
    if task and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    state = _jobs[job_id]
    state.state = "CANCELLED"
    _jobs[job_id] = state
    return JSONResponse({"ok": True})


@app.get("/v1/translate/{job_id}/mono")
async def download_mono(job_id: str):
    state = _jobs.get(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job not found")
    if state.state != "SUCCESS" or not state.mono_pdf_path:
        raise HTTPException(status_code=409, detail="Mono output not ready")
    path = Path(state.mono_pdf_path)
    if not path.exists():
        raise HTTPException(status_code=410, detail="File not found")
    return FileResponse(path, media_type="application/pdf", filename=path.name)


@app.get("/v1/translate/{job_id}/dual")
async def download_dual(job_id: str):
    state = _jobs.get(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job not found")
    if state.state != "SUCCESS" or not state.dual_pdf_path:
        raise HTTPException(status_code=409, detail="Dual output not ready")
    path = Path(state.dual_pdf_path)
    if not path.exists():
        raise HTTPException(status_code=410, detail="File not found")
    return FileResponse(path, media_type="application/pdf", filename=path.name)


@app.get("/v1/translate/{job_id}/glossary")
async def download_glossary(job_id: str):
    state = _jobs.get(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job not found")
    if state.state != "SUCCESS" or not state.glossary_path:
        raise HTTPException(status_code=409, detail="Glossary output not ready")
    path = Path(state.glossary_path)
    if not path.exists():
        raise HTTPException(status_code=410, detail="File not found")
    return FileResponse(path, media_type="text/csv", filename=path.name)


def cli():
    """Run REST API server with uvicorn."""
    import uvicorn

    uvicorn.run("pdf2zh_next.http_api:app", host="0.0.0.0", port=7861, reload=False)


if __name__ == "__main__":
    cli()
