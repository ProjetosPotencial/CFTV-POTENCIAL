"""Dashboard, histórico, alertas, configurações, relatórios e ações do monitor."""
from __future__ import annotations

import csv
import datetime as dt
import io

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from .. import db
from ..monitor import alerts
from ..monitor.discovery import ws_discovery
from ..monitor.engine import monitor
from ..security import require_admin, require_read
from ..settings_store import load as load_settings, public as public_settings, save as save_settings
from .serial import event_out

router = APIRouter(prefix="/api")


@router.get("/health")
async def health():
    try:
        await db.pool().fetchval("SELECT 1")
        ok = True
    except Exception:
        ok = False
    return {"ok": ok, "monitor": monitor.running}


@router.get("/summary", dependencies=[Depends(require_read)])
async def summary():
    p = db.pool()
    d = await p.fetchrow("""SELECT count(*)::int AS devices,
        count(*) FILTER (WHERE status='ONLINE')::int AS online, count(*) FILTER (WHERE status='OFFLINE')::int AS offline,
        count(*) FILTER (WHERE status='NAO_VERIFICADO')::int AS unverified, count(*) FILTER (WHERE status='INSTAVEL')::int AS unstable,
        count(*) FILTER (WHERE status='ERRO_AUTENTICACAO')::int AS auth_error FROM devices""")
    c = await p.fetchrow("""SELECT count(*)::int AS channels,
        count(*) FILTER (WHERE status='TRANSMITINDO')::int AS ch_transmitting, count(*) FILTER (WHERE status='SEM_VIDEO')::int AS ch_no_video,
        count(*) FILTER (WHERE status='OFFLINE')::int AS ch_offline, count(*) FILTER (WHERE status='NAO_VERIFICADO')::int AS ch_unverified,
        count(*) FILTER (WHERE status='ERRO_AUTENTICACAO')::int AS ch_auth_error FROM channels WHERE enabled""")
    stores = await p.fetchval("SELECT count(*)::int FROM stores")
    alerts_open = await p.fetchval("SELECT count(*)::int FROM incidents WHERE ended_at IS NULL")
    return {"stores": stores, **dict(d), **dict(c), "active_alerts": alerts_open, "monitor": monitor.status()}


def _parse_ts(v: str | None) -> dt.datetime | None:
    if not v:
        return None
    try:
        t = dt.datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, f"Data inválida: {v} (use AAAA-MM-DD ou ISO 8601)")
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone(dt.timedelta(hours=-3)))


@router.get("/events", dependencies=[Depends(require_read)])
async def list_events(limit: int = Query(200, ge=1, le=5000), store_id: int | None = None, device_id: int | None = None,
                      channel_id: int | None = None, type: str = "", since: str | None = None, until: str | None = None,
                      store: str = "", serial: str = "", open: bool | None = None, format: str = "json"):
    rs = await db.pool().fetch(
        """SELECT * FROM events WHERE ($1::int IS NULL OR store_id=$1) AND ($2::int IS NULL OR device_id=$2)
             AND ($3::int IS NULL OR channel_id=$3) AND ($4='' OR type=ANY(string_to_array($4, ',')))
             AND ($5::timestamptz IS NULL OR ts >= $5) AND ($6::timestamptz IS NULL OR ts < $6)
             AND ($7='' OR store_name ILIKE '%'||$7||'%') AND ($8='' OR serial ILIKE '%'||$8||'%')
             AND ($9::bool IS NULL OR open=$9)
           ORDER BY ts DESC, id DESC LIMIT $10""",
        store_id, device_id, channel_id, type.upper(), _parse_ts(since), _parse_ts(until), store.strip(), serial.strip(), open, limit)
    items = [event_out(dict(r)) for r in rs]
    if format == "csv":
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";")
        w.writerow(["Data", "Loja", "DVR", "Canal", "Evento", "Descrição", "Duração (s)", "Recuperação", "Aberto"])
        for e in items:
            w.writerow([e["ts"].isoformat(), e["store"], e["serial"], e["channel_number"] or "", e["type"], e["description"],
                        e["duration_s"] or "", e["recovered_at"].isoformat() if e["recovered_at"] else "", "sim" if e["open"] else ""])
        return StreamingResponse(iter(["﻿" + buf.getvalue()]), media_type="text/csv; charset=utf-8",
                                 headers={"Content-Disposition": "attachment; filename=historico-cftv.csv"})
    return items


@router.get("/incidents", dependencies=[Depends(require_read)])
async def list_incidents(open_only: bool = True, limit: int = Query(500, ge=1, le=5000)):
    rs = await db.pool().fetch(
        """SELECT i.*, s.name AS store, d.serial, d.store_id, c.number AS channel_number, c.name AS channel_name,
                  extract(epoch FROM coalesce(i.ended_at, now()) - i.started_at)::int AS duration_s
           FROM incidents i JOIN devices d ON d.id=i.device_id JOIN stores s ON s.id=d.store_id
           LEFT JOIN channels c ON c.id=i.channel_id
           WHERE (NOT $1 OR i.ended_at IS NULL) ORDER BY i.started_at DESC LIMIT $2""", open_only, limit)
    return [dict(r) for r in rs]


@router.get("/settings", dependencies=[Depends(require_read)])
async def get_settings():
    return public_settings(await load_settings(force=True))


@router.put("/settings", dependencies=[Depends(require_admin)])
async def put_settings(body: dict = Body(...)):
    try:
        s = await save_settings(body)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return public_settings(s)


@router.post("/slack/test", dependencies=[Depends(require_admin)])
async def slack_test():
    ok, msg = await alerts.post("🧪 *Potencial CFTV*: mensagem de teste do monitoramento.")
    await db.pool().execute("INSERT INTO events(type, description, slack) VALUES('SLACK_TESTE', $1, $2)", msg, ok)
    if not ok:
        raise HTTPException(503, msg)
    return {"ok": True, "message": msg}


@router.post("/monitor/run", dependencies=[Depends(require_admin)])
async def run_now():
    return await monitor.run_now()


@router.get("/monitor/status", dependencies=[Depends(require_read)])
async def monitor_status():
    s = await load_settings()
    q = await db.pool().fetchrow(
        """SELECT count(*) FILTER (WHERE coalesce(host,'')<>'')::int AS with_host,
                  count(*) FILTER (WHERE coalesce(host,'')='')::int AS without_host,
                  count(*) FILTER (WHERE coalesce(host,'')<>'' AND username='')::int AS without_credentials FROM devices""")
    return {**monitor.status(), **dict(q), "settings": public_settings(s)}


@router.post("/onvif/scan", dependencies=[Depends(require_admin)])
async def onvif_scan(seconds: float = Query(3, ge=1, le=10)):
    found = await ws_discovery(seconds)
    known = {r["host"]: r["id"] for r in await db.pool().fetch("SELECT id, host FROM devices WHERE host IS NOT NULL")}
    for f in found:
        f["device_id"] = known.get(f["host"])
    return {"found": found, "note": "WS-Discovery só alcança a rede local do servidor. DVRs de outras lojas devem ser descobertos pelo IP (VPN)."}


# ----------------------------------------------------------------------------- relatórios
@router.get("/reports/availability", dependencies=[Depends(require_read)])
async def report_availability(start: str | None = Query(None, alias="from"), end: str | None = Query(None, alias="to"),
                              store_id: int | None = None, format: str = "json"):
    t1 = _parse_ts(end) or dt.datetime.now(dt.timezone.utc)
    t0 = _parse_ts(start) or (t1 - dt.timedelta(days=7))
    if t0 >= t1:
        raise HTTPException(400, "Período inválido.")
    p = db.pool()
    devs = await p.fetch(
        """SELECT d.id, d.serial, d.model, d.store_id, s.name AS store, d.status,
                  count(a.id)::int AS samples, count(a.id) FILTER (WHERE a.status IN ('ONLINE','INSTAVEL'))::int AS up,
                  avg(a.latency_ms)::int AS latency_ms
           FROM devices d JOIN stores s ON s.id=d.store_id
           LEFT JOIN availability a ON a.device_id=d.id AND a.channel_id IS NULL AND a.ts >= $1 AND a.ts < $2
           WHERE ($3::int IS NULL OR d.store_id=$3) GROUP BY d.id, s.name ORDER BY s.name, d.serial""", t0, t1, store_id)
    chans = await p.fetch(
        """SELECT c.device_id, count(a.id)::int AS samples, count(a.id) FILTER (WHERE a.status='TRANSMITINDO')::int AS up
           FROM channels c LEFT JOIN availability a ON a.channel_id=c.id AND a.ts >= $1 AND a.ts < $2
           GROUP BY c.device_id""", t0, t1)
    chmap = {r["device_id"]: r for r in chans}
    inc = await p.fetch(
        """SELECT device_id, (channel_id IS NOT NULL) AS is_channel, type, count(*)::int AS n,
                  sum(extract(epoch FROM least(coalesce(ended_at, now()), $2) - greatest(started_at, $1)))::int AS down_s
           FROM incidents WHERE started_at < $2 AND coalesce(ended_at, now()) > $1 GROUP BY 1,2,3""", t0, t1)
    incmap: dict[int, dict] = {}
    for r in inc:
        m = incmap.setdefault(r["device_id"], {"incidents": 0, "dvr_down_s": 0, "channel_down_s": 0, "by_type": {}})
        m["incidents"] += r["n"]
        m["by_type"][r["type"]] = m["by_type"].get(r["type"], 0) + r["n"]
        if r["is_channel"]:
            m["channel_down_s"] += r["down_s"] or 0
        elif r["type"] in ("DVR_OFFLINE", "AUTH_FALHA"):
            m["dvr_down_s"] += r["down_s"] or 0
    rows = []
    for d in devs:
        ch = chmap.get(d["id"])
        m = incmap.get(d["id"], {"incidents": 0, "dvr_down_s": 0, "channel_down_s": 0, "by_type": {}})
        rows.append({
            "store_id": d["store_id"], "store": d["store"], "device_id": d["id"], "serial": d["serial"], "model": d["model"],
            "status": d["status"], "samples": d["samples"],
            "uptime_pct": round(100 * d["up"] / d["samples"], 2) if d["samples"] else None,
            "channel_uptime_pct": round(100 * ch["up"] / ch["samples"], 2) if ch and ch["samples"] else None,
            "latency_ms": d["latency_ms"], **m})
    stores: dict[int, dict] = {}
    for r in rows:
        s = stores.setdefault(r["store_id"], {"store_id": r["store_id"], "store": r["store"], "devices": 0, "incidents": 0,
                                              "dvr_down_s": 0, "channel_down_s": 0, "_up": [], "_chup": []})
        s["devices"] += 1
        s["incidents"] += r["incidents"]
        s["dvr_down_s"] += r["dvr_down_s"]
        s["channel_down_s"] += r["channel_down_s"]
        if r["uptime_pct"] is not None:
            s["_up"].append(r["uptime_pct"])
        if r["channel_uptime_pct"] is not None:
            s["_chup"].append(r["channel_uptime_pct"])
    store_rows = []
    for s in stores.values():
        up, chup = s.pop("_up"), s.pop("_chup")
        s["uptime_pct"] = round(sum(up) / len(up), 2) if up else None
        s["channel_uptime_pct"] = round(sum(chup) / len(chup), 2) if chup else None
        store_rows.append(s)
    store_rows.sort(key=lambda s: (-s["incidents"], s["store"]))
    if format == "csv":
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";")
        w.writerow(["Loja", "DVR", "Modelo", "Status atual", "Disponibilidade DVR (%)", "Disponibilidade canais (%)",
                    "Incidentes", "DVR indisponível (min)", "Canais sem vídeo (min)", "Latência média (ms)"])
        for r in rows:
            w.writerow([r["store"], r["serial"], r["model"], r["status"], r["uptime_pct"] if r["uptime_pct"] is not None else "",
                        r["channel_uptime_pct"] if r["channel_uptime_pct"] is not None else "", r["incidents"],
                        round(r["dvr_down_s"] / 60), round(r["channel_down_s"] / 60), r["latency_ms"] or ""])
        return StreamingResponse(iter(["﻿" + buf.getvalue()]), media_type="text/csv; charset=utf-8",
                                 headers={"Content-Disposition": "attachment; filename=disponibilidade-cftv.csv"})
    return {"from": t0, "to": t1, "stores": store_rows, "devices": rows}


@router.get("/reports/incidents-timeline", dependencies=[Depends(require_read)])
async def report_timeline(days: int = Query(30, ge=1, le=365)):
    rs = await db.pool().fetch(
        """SELECT date_trunc('day', started_at AT TIME ZONE 'America/Sao_Paulo')::date AS day, type, count(*)::int AS n
           FROM incidents WHERE started_at >= now() - make_interval(days => $1) GROUP BY 1,2 ORDER BY 1""", days)
    out: dict[str, dict] = {}
    for r in rs:
        out.setdefault(r["day"].isoformat(), {})[r["type"]] = r["n"]
    return [{"day": k, **v} for k, v in out.items()]
