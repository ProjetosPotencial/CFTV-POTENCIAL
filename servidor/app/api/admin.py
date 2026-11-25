from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException

from ..config import get_config
from ..legacy_import import fetch_legacy, import_data
from ..security import require_admin

router = APIRouter(prefix="/api/admin")


@router.post("/import-legacy", dependencies=[Depends(require_admin)])
async def import_legacy(dry_run: bool = True, body: dict | None = Body(None)):
    """Sem corpo: lê a API do sistema atual. Com corpo {stores, devices, channels}: importa esse JSON.
    Por padrão é simulação (dry_run=true); envie ?dry_run=false para gravar."""
    try:
        data = body if body else await fetch_legacy(get_config().legacy_api_url)
    except Exception as e:
        raise HTTPException(502, f"Não foi possível ler o sistema atual ({e.__class__.__name__}). Informe LEGACY_API_URL ou envie o JSON.")
    return await import_data(data, dry_run)
