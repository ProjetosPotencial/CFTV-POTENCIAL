"""Pool asyncpg, schema dedicado e migrações (somente aditivas)."""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path

import asyncpg

from .config import get_config

log = logging.getLogger("cftv.db")
_pool: asyncpg.Pool | None = None
MIGRATIONS = Path(__file__).parent / "migrations"


async def _init_conn(conn: asyncpg.Connection) -> None:
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def connect() -> asyncpg.Pool:
    global _pool
    cfg = get_config()
    schema = cfg.db_schema
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", schema):
        raise RuntimeError("DB_SCHEMA inválido")
    _pool = await asyncpg.create_pool(
        cfg.database_url, min_size=1, max_size=10, init=_init_conn,
        server_settings={"search_path": schema, "application_name": "potencial-cftv-monitor", "timezone": "UTC"},
    )
    await migrate(_pool, schema)
    return _pool


async def close() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Banco não conectado")
    return _pool


async def migrate(p: asyncpg.Pool, schema: str) -> None:
    async with p.acquire() as conn:
        # trava para dois containers não migrarem ao mesmo tempo
        await conn.execute("SELECT pg_advisory_lock(742311)")
        try:
            await conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
            await conn.execute(f'SET search_path TO "{schema}"')
            await conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())")
            done = {r["name"] for r in await conn.fetch("SELECT name FROM schema_migrations")}
            for f in sorted(MIGRATIONS.glob("*.sql")):
                if f.name in done:
                    continue
                sql = f.read_text(encoding="utf-8")
                if re.search(r"\b(DROP|TRUNCATE)\b", re.sub(r"--[^\n]*", "", sql), re.I):
                    raise RuntimeError(f"Migração {f.name} contém DROP/TRUNCATE; recusada por segurança.")
                async with conn.transaction():
                    await conn.execute(sql)
                    await conn.execute("INSERT INTO schema_migrations(name) VALUES($1)", f.name)
                log.info("migração aplicada: %s", f.name)
        finally:
            await conn.execute("SELECT pg_advisory_unlock(742311)")


def row(r: asyncpg.Record | None) -> dict | None:
    return dict(r) if r is not None else None


def rows(rs) -> list[dict]:
    return [dict(r) for r in rs]
