"""Carrega o inventário (31 lojas, 31 DVRs, 141 canais).

Fontes, nesta ordem: JSON enviado; API de um sistema antigo (LEGACY_API_URL, opcional); ou o arquivo
embutido app/data/inventario_inicial.json (padrão, não depende de nenhum outro sistema).
Na primeira subida, com o banco vazio e SEED_INVENTORY=true, o arquivo embutido é carregado sozinho.
É idempotente: só insere o que falta (loja por nome, DVR por serial, canal por DVR+número) e nunca sobrescreve
o que já foi editado aqui. Pode rodar quantas vezes quiser.

Uso: docker exec potencial-cftv-monitor python -m app.legacy_import [--dry-run]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys

import httpx
from pathlib import Path

from . import db
from .config import get_config

log = logging.getLogger("cftv.import")
BUNDLED = Path(__file__).parent / "data" / "inventario_inicial.json"


def bundled_inventory() -> dict:
    return json.loads(BUNDLED.read_text(encoding="utf-8"))


async def load_source() -> dict:
    url = get_config().legacy_api_url
    return await fetch_legacy(url) if url else bundled_inventory()


async def seed_if_empty() -> dict | None:
    """Primeira subida: banco vazio recebe o inventário embutido. Nunca roda se já houver lojas."""
    if await db.pool().fetchval("SELECT count(*) FROM stores"):
        return None
    stats = await import_data(bundled_inventory())
    log.info("inventário inicial carregado: %s lojas, %s DVRs, %s canais", stats["stores"]["created"],
             stats["devices"]["created"], stats["channels"]["created"])
    return stats


async def fetch_legacy(base: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        out = {}
        for k in ("stores", "devices", "channels"):
            r = await c.get(f"{base.rstrip('/')}/api/{k}")
            r.raise_for_status()
            out[k] = r.json()
    return out


async def import_data(data: dict, dry_run: bool = False) -> dict:
    stats = {"stores": {"found": 0, "created": 0}, "devices": {"found": 0, "created": 0, "skipped": []},
             "channels": {"found": 0, "created": 0, "skipped": 0}, "dry_run": dry_run}
    async with db.pool().acquire() as conn:
        tr = conn.transaction()
        await tr.start()
        try:
            store_ids: dict[str, int] = {}
            legacy_store_name: dict[int, str] = {}
            for s in data.get("stores", []):
                stats["stores"]["found"] += 1
                name = (s.get("name") or "").strip()
                if not name:
                    continue
                legacy_store_name[s.get("id")] = name
                sid = await conn.fetchval("SELECT id FROM stores WHERE lower(name)=lower($1)", name)
                if not sid:
                    sid = await conn.fetchval("INSERT INTO stores(name, legacy_id) VALUES($1,$2) RETURNING id", name, s.get("id"))
                    stats["stores"]["created"] += 1
                store_ids[name.lower()] = sid
            dev_ids: dict = {}
            for d in data.get("devices", []):
                stats["devices"]["found"] += 1
                serial = (d.get("serial") or "").strip().upper()
                store_name = (d.get("store") or legacy_store_name.get(d.get("store_id")) or "").strip()
                sid = store_ids.get(store_name.lower())
                if not serial or not sid:
                    stats["devices"]["skipped"].append(serial or f"id {d.get('id')}")
                    continue
                did = await conn.fetchval("SELECT id FROM devices WHERE upper(serial)=$1", serial)
                if not did:
                    mode = d.get("mode") or ""
                    model = d.get("model") or ""
                    did = await conn.fetchval(
                        """INSERT INTO devices(store_id, manufacturer, model, serial, host, port, mode, protocol, channels, legacy_id, status_detail)
                           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id""",
                        sid, "Intelbras" if model.upper().startswith(("MHDX", "HDCVI")) else "", model, serial,
                        (d.get("host") or None), int(d.get("port") or 37777), mode, "A confirmar",
                        int(d.get("channels") or 0) if str(d.get("channels") or "").isdigit() else 0, d.get("id"),
                        "aguardando IP/VPN")
                    stats["devices"]["created"] += 1
                dev_ids[d.get("id")] = did
                dev_ids[serial] = did
            for c in data.get("channels", []):
                stats["channels"]["found"] += 1
                did = dev_ids.get(c.get("device_id")) or dev_ids.get((c.get("serial") or "").strip().upper())
                n = c.get("number")
                if not did or not n:
                    stats["channels"]["skipped"] += 1
                    continue
                r = await conn.fetchval(
                    """INSERT INTO channels(device_id, number, name, legacy_id) VALUES($1,$2,$3,$4)
                       ON CONFLICT (device_id, number) DO NOTHING RETURNING id""",
                    did, int(n), (c.get("name") or f"Canal {n}")[:60], c.get("id"))
                if r:
                    stats["channels"]["created"] += 1
            # canais = maior entre o informado e os cadastrados
            await conn.execute("""UPDATE devices d SET channels = sub.n FROM
                                  (SELECT device_id, max(number) AS n FROM channels GROUP BY device_id) sub
                                  WHERE sub.device_id=d.id AND d.channels < sub.n""")
            if not dry_run:
                await conn.execute(
                    "INSERT INTO events(type, description) VALUES('CADASTRO', $1)",
                    f"Importação do inventário: {stats['stores']['created']} loja(s), {stats['devices']['created']} DVR(s), "
                    f"{stats['channels']['created']} canal(is) novos.")
        except Exception:
            await tr.rollback()
            raise
        if dry_run:
            await tr.rollback()
        else:
            await tr.commit()
    return stats


async def _main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="mostra o que seria importado sem gravar")
    ap.add_argument("--file", help="JSON com {stores, devices, channels} em vez de ler a API")
    ap.add_argument("--url", default=None, help="URL do sistema atual (padrão LEGACY_API_URL)")
    a = ap.parse_args()
    await db.connect()
    try:
        if a.file:
            with open(a.file, encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = await fetch_legacy(a.url) if a.url else await load_source()
        stats = await import_data(data, a.dry_run)
        print(json.dumps(stats, ensure_ascii=False, indent=2))
    finally:
        await db.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_main()))
