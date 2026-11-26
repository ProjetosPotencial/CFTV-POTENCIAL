"""Potencial CFTV · API de monitoramento (FastAPI).

Sobe junto: migrações do schema `monitor`, o motor de monitoramento em segundo plano e o painel estático (opcional).
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import __version__, db
from .api import admin, inventory, monitoring
from .config import get_config
from .monitor.engine import monitor


class _NoSecrets(logging.Filter):
    """Última barreira: tira credenciais de URLs em qualquer log."""
    def filter(self, record: logging.LogRecord) -> bool:
        from .security import mask_url
        if isinstance(record.msg, str):
            record.msg = mask_url(record.msg)
        if record.args:
            record.args = tuple(mask_url(a) if isinstance(a, str) else a for a in (record.args if isinstance(record.args, tuple) else (record.args,)))
        return True


def _setup_logging() -> None:
    logging.basicConfig(level=get_config().log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    f = _NoSecrets()
    for h in logging.getLogger().handlers:
        h.addFilter(f)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _setup_logging()
    log = logging.getLogger("cftv")
    cfg = get_config()
    if not cfg.secret_key:
        log.warning("CFTV_SECRET_KEY não definida: senhas de DVR não poderão ser salvas nem usadas.")
    if not cfg.admin_token:
        log.warning("API_ADMIN_TOKEN não definido: rotas de alteração ficam bloqueadas.")
    await db.connect()
    if cfg.seed_inventory:
        from .legacy_import import seed_if_empty
        await seed_if_empty()
    if cfg.monitor_enabled:
        monitor.start()
    yield
    await monitor.stop()
    await db.close()


app = FastAPI(title="Potencial CFTV · Monitoramento", version=__version__, lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
cfg = get_config()
app.add_middleware(CORSMiddleware, allow_origins=cfg.cors_origins, allow_credentials=False,
                   allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                   allow_headers=["Authorization", "Content-Type", "X-API-Key"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if request.url.path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    logging.getLogger("cftv").exception("erro em %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Erro interno. Veja o log do container."})


app.include_router(monitoring.router)
app.include_router(inventory.router)
app.include_router(admin.router)


@app.get("/js/config.js", include_in_schema=False)
async def panel_config():
    # Quando o painel é servido por este container, ele já fala com a API da mesma origem.
    js = ('window.PCFTV_CONFIG = { mode: "api", apiBase: "", apiToken: "", refreshSeconds: 30 };\n')
    return Response(js, media_type="application/javascript", headers={"Cache-Control": "no-store"})


if os.path.isdir(cfg.panel_dir):
    app.mount("/", StaticFiles(directory=cfg.panel_dir, html=True), name="painel")
