"""Aplica resultados das verificações: status, amostras de disponibilidade, eventos, incidentes e avisos.

Regras:
- Evento só em MUDANÇA de status (nada de evento a cada ciclo).
- Uma falha = um incidente aberto (índice único), então o mesmo problema não gera alertas repetidos.
- Canal com DVR offline vira OFFLINE sem incidente próprio: o alerta é do DVR (diferencia câmera sem vídeo de DVR fora).
"""
from __future__ import annotations

import datetime as dt

import asyncpg

from ..settings_store import MonitorSettings
from .alerts import Notice, fmt_duration, fmt_local

DEVICE_INCIDENT = {"OFFLINE": "DVR_OFFLINE", "ERRO_AUTENTICACAO": "AUTH_FALHA", "INSTAVEL": "DVR_INSTAVEL"}
CHANNEL_INCIDENT = {"SEM_VIDEO": "CANAL_SEM_VIDEO", "ERRO_AUTENTICACAO": "AUTH_FALHA", "OFFLINE": "CANAL_SEM_VIDEO"}
RECOVERY_NOTIFY = {"DVR_OFFLINE", "AUTH_FALHA"}

DESCR = {
    "DVR_OFFLINE": "DVR sem resposta na rede",
    "AUTH_FALHA": "Usuário ou senha recusados",
    "DVR_INSTAVEL": "Respostas intermitentes",
    "CANAL_SEM_VIDEO": "Câmera sem vídeo",
}


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _target(dev: dict, ch: dict | None = None) -> str:
    t = f"DVR {dev['serial']}"
    if ch:
        t += f" · Canal {ch['number']} ({ch['name']})"
    return t


async def _event(conn: asyncpg.Connection, dev: dict, ch: dict | None, type_: str, description: str, *,
                 open_: bool = False, slack: bool = False, duration_s: int | None = None,
                 recovered_at: dt.datetime | None = None, incident_id: int | None = None, ts: dt.datetime | None = None) -> dict:
    r = await conn.fetchrow(
        """INSERT INTO events(ts, store_id, device_id, channel_id, store_name, serial, channel_number, type, description,
                              duration_s, recovered_at, open, slack, incident_id)
           VALUES(coalesce($1, now()), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *""",
        ts, dev.get("store_id"), dev["id"], ch["id"] if ch else None, dev.get("store_name", ""), dev["serial"],
        ch["number"] if ch else None, type_, description, duration_s, recovered_at, open_, slack, incident_id)
    return dict(r)


async def _close_incidents(conn, device_id: int, channel_id: int | None, keep_type: str | None, at: dt.datetime) -> list[dict]:
    rs = await conn.fetch(
        """UPDATE incidents SET ended_at=$4
           WHERE device_id=$1 AND coalesce(channel_id,0)=coalesce($2,0) AND ended_at IS NULL AND ($3::text IS NULL OR type<>$3)
           RETURNING *""", device_id, channel_id, keep_type, at)
    closed = [dict(r) for r in rs]
    for inc in closed:
        dur = int((at - inc["started_at"]).total_seconds())
        inc["duration_s"] = dur
        if inc["open_event_id"]:
            await conn.execute("UPDATE events SET open=false, duration_s=$2, recovered_at=$3 WHERE id=$1",
                               inc["open_event_id"], dur, at)
    return closed


async def _open_incident(conn, kind: str, dev: dict, ch: dict | None, type_: str, description: str,
                         s: MonitorSettings, at: dt.datetime, notify: bool) -> tuple[dict | None, Notice | None]:
    inc = await conn.fetchrow(
        """INSERT INTO incidents(kind, device_id, channel_id, type, started_at, last_notified_at)
           VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING *""",
        kind, dev["id"], ch["id"] if ch else None, type_, at, at if notify else None)
    if inc is None:
        return None, None   # já existia incidente aberto do mesmo tipo: sem novo alerta
    ev = await _event(conn, dev, ch, type_, description, open_=True, slack=notify, incident_id=inc["id"], ts=at)
    await conn.execute("UPDATE incidents SET open_event_id=$2 WHERE id=$1", inc["id"], ev["id"])
    notice = Notice(type_, dev.get("store_name", ""), _target(dev, ch), f"{description}. Desde {fmt_local(at)}.") if notify else None
    return ev, notice


async def apply_device(conn: asyncpg.Connection, dev: dict, status: str, detail: str, latency_ms: int | None,
                       reachable: bool, s: MonitorSettings, changes: list[dict], notices: list[Notice]) -> None:
    at = now()
    prev = dev["status"]
    changed = prev != status
    await conn.execute(
        """UPDATE devices SET status=$2, status_detail=$3, last_check=$4, latency_ms=$5,
               last_seen = CASE WHEN $6 THEN $4 ELSE last_seen END,
               status_since = CASE WHEN status<>$2 THEN $4 ELSE status_since END,
               fail_count = CASE WHEN $6 THEN 0 ELSE fail_count+1 END
           WHERE id=$1""", dev["id"], status, detail[:500], at, latency_ms, reachable)
    if status != "NAO_VERIFICADO":
        await conn.execute("INSERT INTO availability(ts, device_id, status, latency_ms) VALUES($1,$2,$3,$4)",
                           at, dev["id"], status, latency_ms)
    if not changed:
        return
    notify = s.slack_notify
    new_type = DEVICE_INCIDENT.get(status)
    closed = await _close_incidents(conn, dev["id"], None, new_type, at)
    if new_type:
        desc = f"{DESCR[new_type]}: {detail}" if detail else DESCR[new_type]
        ev, notice = await _open_incident(conn, "dvr", dev, None, new_type, desc, s, at,
                                          notify=bool(notify.get(new_type, True)) and new_type != "DVR_INSTAVEL")
        if ev:
            changes.append(ev)
        if notice:
            notices.append(notice)
    serious = [c for c in closed if c["type"] in RECOVERY_NOTIFY]
    if status in ("ONLINE", "INSTAVEL") and serious:
        dur = max(c["duration_s"] for c in serious)
        was_notified = any(c["last_notified_at"] for c in serious)
        send = was_notified and bool(notify.get("DVR_ONLINE", True))
        ev = await _event(conn, dev, None, "DVR_ONLINE", f"DVR voltou a responder após {fmt_duration(dur)}.",
                          slack=send, duration_s=dur, recovered_at=at, ts=at)
        changes.append(ev)
        if send:
            notices.append(Notice("DVR_ONLINE", dev.get("store_name", ""), _target(dev),
                                  f"Voltou a responder após {fmt_duration(dur)}."))
    # Canais acompanham o DVR quando ele não está acessível.
    if status == "OFFLINE":
        await conn.execute(
            """UPDATE channels SET status='OFFLINE', status_detail='DVR offline', status_since=$2
               WHERE device_id=$1 AND enabled AND status<>'OFFLINE'""", dev["id"], at)
    elif status == "ERRO_AUTENTICACAO":
        await conn.execute(
            """UPDATE channels SET status='ERRO_AUTENTICACAO', status_detail='credenciais do DVR recusadas', status_since=$2
               WHERE device_id=$1 AND enabled AND status<>'ERRO_AUTENTICACAO'""", dev["id"], at)
    elif status == "NAO_VERIFICADO":
        await conn.execute(
            """UPDATE channels SET status='NAO_VERIFICADO', status_detail=$3, status_since=$2
               WHERE device_id=$1 AND status<>'NAO_VERIFICADO'""", dev["id"], at, detail[:300])
        await _close_incidents_all_channels(conn, dev["id"], at)
    if status in ("ONLINE", "INSTAVEL") and prev in ("OFFLINE", "ERRO_AUTENTICACAO", "NAO_VERIFICADO"):
        # força teste de vídeo logo após o DVR voltar
        await conn.execute("UPDATE channels SET last_check=NULL WHERE device_id=$1 AND enabled", dev["id"])


async def _close_incidents_all_channels(conn, device_id: int, at: dt.datetime) -> None:
    rs = await conn.fetch("SELECT DISTINCT channel_id FROM incidents WHERE device_id=$1 AND channel_id IS NOT NULL AND ended_at IS NULL", device_id)
    for r in rs:
        await _close_incidents(conn, device_id, r["channel_id"], None, at)


async def apply_channel(conn: asyncpg.Connection, dev: dict, ch: dict, status: str, detail: str, extra: dict,
                        s: MonitorSettings, changes: list[dict], notices: list[Notice]) -> None:
    at = now()
    prev = ch["status"]
    changed = prev != status
    transmitting = status == "TRANSMITINDO"
    await conn.execute(
        """UPDATE channels SET status=$2, status_detail=$3, last_check=$4,
               last_frame = CASE WHEN $5 THEN $4 ELSE last_frame END,
               status_since = CASE WHEN status<>$2 THEN $4 ELSE status_since END,
               resolution = CASE WHEN $6<>'' THEN $6 ELSE resolution END,
               fps = coalesce($7, fps), codec = CASE WHEN $8<>'' THEN $8 ELSE codec END,
               frame_hash = CASE WHEN $9<>'' THEN $9 ELSE frame_hash END
           WHERE id=$1""", ch["id"], status, detail[:500], at, transmitting,
        extra.get("resolution") or "", extra.get("fps"), extra.get("codec") or "", extra.get("frame_hash") or "")
    if status != "NAO_VERIFICADO":
        await conn.execute("INSERT INTO availability(ts, device_id, channel_id, status) VALUES($1,$2,$3,$4)",
                           at, dev["id"], ch["id"], status)
    if not changed:
        return
    notify = s.slack_notify
    # Incidente de canal só quando o DVR está acessível; senão o problema é do DVR.
    dvr_ok = dev["status"] in ("ONLINE", "INSTAVEL")
    new_type = CHANNEL_INCIDENT.get(status) if dvr_ok else None
    closed = await _close_incidents(conn, dev["id"], ch["id"], new_type, at)
    if new_type:
        base = "Canal sem vídeo" if status != "ERRO_AUTENTICACAO" else "RTSP recusou usuário/senha"
        desc = f"{base}: {detail}" if detail else base
        ev, notice = await _open_incident(conn, "canal", dev, ch, new_type, desc, s, at,
                                          notify=bool(notify.get(new_type, True)))
        if ev:
            changes.append(ev)
        if notice:
            notices.append(notice)
    if transmitting and closed:
        dur = max(c["duration_s"] for c in closed)
        was_notified = any(c["last_notified_at"] for c in closed)
        send = was_notified and bool(notify.get("CANAL_VOLTOU", True))
        ev = await _event(conn, dev, ch, "CANAL_VOLTOU", f"Canal voltou a transmitir após {fmt_duration(dur)}.",
                          slack=send, duration_s=dur, recovered_at=at, ts=at)
        changes.append(ev)
        if send:
            notices.append(Notice("CANAL_VOLTOU", dev.get("store_name", ""), _target(dev, ch),
                                  f"Voltou a transmitir após {fmt_duration(dur)}."))


async def housekeeping(conn: asyncpg.Connection, s: MonitorSettings, changes: list[dict], notices: list[Notice]) -> None:
    """Alerta de falha prolongada (uma vez) e lembretes espaçados de incidentes abertos."""
    at = now()
    rs = await conn.fetch(
        """SELECT i.*, d.serial, d.store_id, s.name AS store_name, d.status AS dev_status
           FROM incidents i JOIN devices d ON d.id=i.device_id JOIN stores s ON s.id=d.store_id
           WHERE i.ended_at IS NULL AND i.kind='dvr' AND i.type='DVR_OFFLINE' AND NOT i.prolonged_notified
             AND i.started_at <= $1""", at - dt.timedelta(minutes=s.offline_alert_minutes))
    for r in rs:
        dev = {"id": r["device_id"], "serial": r["serial"], "store_id": r["store_id"], "store_name": r["store_name"]}
        mins = int((at - r["started_at"]).total_seconds() // 60)
        send = bool(s.slack_notify.get("SEM_COMUNICACAO", True))
        ev = await _event(conn, dev, None, "SEM_COMUNICACAO",
                          f"Sem comunicação há {fmt_duration(mins * 60)} (desde {fmt_local(r['started_at'])}).", slack=send, ts=at)
        changes.append(ev)
        await conn.execute("UPDATE incidents SET prolonged_notified=true, last_notified_at=$2 WHERE id=$1", r["id"], at)
        if send:
            notices.append(Notice("SEM_COMUNICACAO", r["store_name"], _target(dev),
                                  f"Sem comunicação há {fmt_duration(mins * 60)}, desde {fmt_local(r['started_at'])}."))
    # lembretes (somente Slack, não duplicam eventos no histórico)
    rs = await conn.fetch(
        """SELECT i.*, d.serial, d.store_id, s.name AS store_name, c.number AS ch_number, c.name AS ch_name
           FROM incidents i JOIN devices d ON d.id=i.device_id JOIN stores s ON s.id=d.store_id
           LEFT JOIN channels c ON c.id=i.channel_id
           WHERE i.ended_at IS NULL AND i.last_notified_at IS NOT NULL AND i.type IN ('DVR_OFFLINE','AUTH_FALHA','CANAL_SEM_VIDEO')
             AND i.last_notified_at <= $1""", at - dt.timedelta(minutes=s.slack_repeat_minutes))
    for r in rs:
        if not s.slack_notify.get(r["type"], True):
            continue
        dev = {"id": r["device_id"], "serial": r["serial"]}
        ch = {"id": r["channel_id"], "number": r["ch_number"], "name": r["ch_name"]} if r["channel_id"] else None
        notices.append(Notice(r["type"], r["store_name"], _target(dev, ch),
                              f"Continua com falha desde {fmt_local(r['started_at'])} ({fmt_duration((at - r['started_at']).total_seconds())}).",
                              reminder=True))
        await conn.execute("UPDATE incidents SET last_notified_at=$2 WHERE id=$1", r["id"], at)
    await conn.execute("DELETE FROM availability WHERE ts < $1", at - dt.timedelta(days=s.retention_days))
