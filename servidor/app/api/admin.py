from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException

from ..legacy_import import import_data, load_source
from ..security import require_admin

router = APIRouter(prefix="/api/admin")


@router.post("/import-legacy", dependencies=[Depends(require_admin)])
async def import_legacy(dry_run: bool = True, body: dict | None = Body(None)):
    """Com corpo {stores, devices, channels}: importa esse JSON. Sem corpo: LEGACY_API_URL se definida,
    senão o inventário embutido.
    Por padrão é simulação (dry_run=true); envie ?dry_run=false para gravar."""
    try:
        data = body if body else await load_source()
    except Exception as e:
        raise HTTPException(502, f"Não foi possível ler LEGACY_API_URL ({e.__class__.__name__}). Deixe vazia para usar o inventário embutido.")
    return await import_data(data, dry_run)
