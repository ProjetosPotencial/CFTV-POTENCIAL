"""Configuração por variáveis de ambiente. Segredos nunca ficam no código nem no banco em texto puro."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None or v == "":
        return default
    return v.strip().lower() in {"1", "true", "sim", "yes", "on"}


def _list(name: str, default: str) -> list[str]:
    return [x.strip() for x in os.getenv(name, default).split(",") if x.strip()]


@dataclass(frozen=True)
class Config:
    database_url: str = field(default_factory=lambda: os.getenv(
        "DATABASE_URL", "postgresql://cftv:cftv@potencial-cftv-db:5432/potencial_cftv"))
    db_schema: str = field(default_factory=lambda: os.getenv("DB_SCHEMA", "monitor"))
    # Chave Fernet (base64, 32 bytes) para criptografar senhas dos DVRs.
    secret_key: str = field(default_factory=lambda: os.getenv("CFTV_SECRET_KEY", ""))
    # Tokens de acesso: ADMIN pode alterar; READ só consulta.
    admin_token: str = field(default_factory=lambda: os.getenv("API_ADMIN_TOKEN", ""))
    read_token: str = field(default_factory=lambda: os.getenv("API_READ_TOKEN", ""))
    allow_anonymous_read: bool = field(default_factory=lambda: _bool("ALLOW_ANONYMOUS_READ", False))
    cors_origins: list[str] = field(default_factory=lambda: _list("CORS_ORIGINS", "https://cftv-potencial.vercel.app"))
    slack_webhook_url: str = field(default_factory=lambda: os.getenv("SLACK_WEBHOOK_URL", ""))
    monitor_enabled: bool = field(default_factory=lambda: _bool("MONITOR_ENABLED", True))
    legacy_api_url: str = field(default_factory=lambda: os.getenv("LEGACY_API_URL", ""))
    seed_inventory: bool = field(default_factory=lambda: _bool("SEED_INVENTORY", True))
    ffmpeg_bin: str = field(default_factory=lambda: os.getenv("FFMPEG_BIN", "ffmpeg"))
    panel_dir: str = field(default_factory=lambda: os.getenv("PANEL_DIR", "/app/painel"))
    display_tz: str = field(default_factory=lambda: os.getenv("DISPLAY_TZ", "America/Sao_Paulo"))
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))


_cfg: Config | None = None


def get_config() -> Config:
    global _cfg
    if _cfg is None:
        _cfg = Config()
    return _cfg


def reset_config() -> None:
    """Usado nos testes para reler o ambiente."""
    global _cfg
    _cfg = None
