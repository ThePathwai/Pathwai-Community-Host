import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from auth import get_current_user

router = APIRouter(tags=["uploads"])
# On Railway the container disk is wiped on every deploy: mount a Volume and point UPLOADS_DIR at it.
STORE = Path(os.environ.get("UPLOADS_DIR") or (Path(__file__).resolve().parent.parent / "uploads_data"))
ALLOWED = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf"}
MAX_BYTES = 5 * 1024 * 1024


def init_storage() -> None:
    STORE.mkdir(parents=True, exist_ok=True)


@router.post("/uploads", status_code=201)
async def upload(file: UploadFile = File(...), me: dict = Depends(get_current_user)):
    init_storage()
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (5 MB max)")
    name = f"{uuid.uuid4().hex}{ext}"
    (STORE / name).write_bytes(data)
    return {"url": f"/api/uploads/{name}", "name": name, "bytes": len(data)}


@router.get("/uploads/{name}")
async def get_upload(name: str):
    p = (STORE / Path(name).name)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(p)
