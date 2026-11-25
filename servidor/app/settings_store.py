"""Parâmetros do monitoramento guardados no banco (tabela settings), com limites validados."""
from __future__ import annotations

import time
from typing import Any

from pydantic import BaseModel, Field

from . import db
from .config import get_config

NOTIFY_TYPES = ["DVR_OFFLINE", "DVR_ONLINE", "CANAL_SEM_VIDEO", "CANAL_VOLTOU", "AUTH_FALHA", "SEM_COMUNICACAO"]


class MonitorSettings(BaseModel):
    poll_interval: int = Field(60, ge=15, le=3600)          # s entre verificações de DVR
    timeout_s: float = Field(5, ge=1, le=60)                # timeout TCP/ONVIF
    retries: int = Field(3, ge=1, le=10)                    # tentativas por verificação
    concurrency: int = Field(10, ge=1, le=100)              # DVRs verificados em paralelo
    rtsp_interval: int = Field(300, ge=60, le=86400)        # s entre testes de vídeo por canal
    rtsp_timeout_s: float = Field(10, ge=3, le=60)
    rtsp_concurrency: int = Field(4, ge=1, le=16)           # fluxos RTSP simultâneos (global)
    rtsp_substream: bool = True                             # usa substream (mais leve) quando o modelo permite
    freeze_detection: bool = True
    offline_alert_minutes: int = Field(30, ge=5, le=1440)   # alerta "sem comunicação prolongada"
    slack_repeat_minutes: int = Field(60, ge=5, le=1440)    # lembrete da mesma falha aberta
    unstable_changes: int = Field(3, ge=2, le=20)           # trocas de status na janela => INSTÁVEL
    unstable_window_minutes: int = Field(30, ge=5, le=1440)
    retention_days: int = Field(180, ge=7, le=3650)         # amostras de disponibilidade
    slack_notify: dict[str, bool] = Field(default_factory=lambda: {t: True for t in NOTIFY_TYPES})


_cache: tuple[float, MonitorSettings] | None = None


async def load(force: bool = False) -> MonitorSettings:
    global _cache
    if not force and _cache and time.monotonic() - _cache[0] < 5:
        return _cache[1]
    r = await db.pool().fetchrow("SELECT value FROM settings WHERE key='monitor'")
    data: dict[str, Any] = dict(r["value"]) if r else {}
    s = MonitorSettings(**{k: v for k, v in data.items() if k in MonitorSettings.model_fields})
    _cache = (time.monotonic(), s)
    return s


async def save(patch: dict[str, Any]) -> MonitorSettings:
    cur = await load(force=True)
    merged = cur.model_dump()
    for k, v in patch.items():
        if k in MonitorSettings.model_fields:
            if k == "slack_notify" and isinstance(v, dict):
                merged[k] = {**merged[k], **{t: bool(b) for t, b in v.items() if t in NOTIFY_TYPES}}
            else:
                merged[k] = v
    s = MonitorSettings(**merged)  # valida limites
    await db.pool().execute(
        "INSERT INTO settings(key, value) VALUES('monitor', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        s.model_dump())
    global _cache
    _cache = (time.monotonic(), s)
    return s


def public(s: MonitorSettings) -> dict:
    out = s.model_dump()
    out["slack_configured"] = bool(get_config().slack_webhook_url)
    return out
