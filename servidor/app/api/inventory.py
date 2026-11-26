"""Cadastro: lojas, DVRs e canais (+ teste, ONVIF e sincronização)."""
from __future__ import annotations

import datetime as dt
import os

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import FileResponse

from .. import db
from ..monitor import onvif as onvif_mod
from ..monitor.engine import DEVICE_SQL, monitor
from ..monitor import snapshots, state
from ..monitor.urls import public_url
from ..schemas import ChannelIn, DeviceIn, StoreIn, SyncIn
from ..security import CredentialError, decrypt_secret, encrypt_secret, mask_text, require_admin, require_read
from ..settings_store import load as load_settings
from .serial import channel_out, device_out

router = APIRouter(prefix="/api")


async def _audit(conn, dev: dict | None, description: str, ch: dict | None = None, store: dict | None = None) -> None:
    await conn.execute(
        """INSERT INTO events(store_id, device_id, channel_id, store_name, serial, channel_number, type, description)
           VALUES($1,$2,$3,$4,$5,$6,'CADASTRO',$7)""",
        (dev or {}).get("store_id") or (store or {}).get("id"), (dev or {}).get("id"), (ch or {}).get("id"),
        (dev or {}).get("store_name") or (store or {}).get("name", ""), (dev or {}).get("serial", ""),
        (ch or {}).get("number"), description)


async def _device(conn, device_id: int) -> dict:
    r = await conn.fetchrow(DEVICE_SQL + " WHERE d.id=$1", device_id)
    if not r:
        raise HTTPException(404, "DVR não encontrado.")
    return dict(r)


# ======================================================================= lojas
@router.get("/stores", dependencies=[Depends(require_read)])
async def list_stores(q: str = "", status: str = ""):
    rs = await db.pool().fetch(
        """SELECT s.*, count(DISTINCT d.id)::int AS devices, count(c.id)::int AS cameras,
                  count(DISTINCT d.id) FILTER (WHERE d.status='ONLINE')::int AS devices_online,
                  count(DISTINCT d.id) FILTER (WHERE d.status IN ('OFFLINE','ERRO_AUTENTICACAO'))::int AS devices_fail,
                  count(DISTINCT d.id) FILTER (WHERE d.status='INSTAVEL')::int AS devices_unstable,
                  count(c.id) FILTER (WHERE c.status='TRANSMITINDO')::int AS cameras_ok,
                  count(c.id) FILTER (WHERE c.status='SEM_VIDEO')::int AS cameras_no_video
           FROM stores s LEFT JOIN devices d ON d.store_id=s.id LEFT JOIN channels c ON c.device_id=d.id AND c.enabled
           WHERE ($1='' OR s.name ILIKE '%'||$1||'%' OR s.code ILIKE '%'||$1||'%' OR s.city ILIKE '%'||$1||'%')
           GROUP BY s.id ORDER BY s.name""", q.strip())
    out = []
    for r in rs:
        x = dict(r)
        x["situation"] = ("SEM_DVR" if not x["devices"] else "CRITICO" if x["devices_fail"] else
                          "ATENCAO" if x["devices_unstable"] or x["cameras_no_video"] else
                          "OK" if x["devices_online"] else "NAO_VERIFICADO")
        if not status or x["situation"] == status.upper():
            out.append(x)
    return out


@router.get("/stores/{store_id}", dependencies=[Depends(require_read)])
async def get_store(store_id: int):
    r = await db.pool().fetchrow("SELECT * FROM stores WHERE id=$1", store_id)
    if not r:
        raise HTTPException(404, "Loja não encontrada.")
    devs = await db.pool().fetch(DEVICE_SQL + " WHERE d.store_id=$1 ORDER BY d.serial", store_id)
    return {**dict(r), "devices": [device_out(dict(d)) for d in devs]}


@router.post("/stores", status_code=201, dependencies=[Depends(require_admin)])
async def create_store(body: StoreIn):
    async with db.pool().acquire() as conn:
        try:
            r = await conn.fetchrow("INSERT INTO stores(name, code, city, notes) VALUES($1,$2,$3,$4) RETURNING *",
                                    body.name, body.code, body.city, body.notes)
        except asyncpg.UniqueViolationError:
            raise HTTPException(409, "Já existe uma loja com esse nome.")
        await _audit(conn, None, f"Loja cadastrada: {body.name}.", store=dict(r))
    return dict(r)


@router.put("/stores/{store_id}", dependencies=[Depends(require_admin)])
async def update_store(store_id: int, body: StoreIn):
    async with db.pool().acquire() as conn:
        try:
            r = await conn.fetchrow("UPDATE stores SET name=$2, code=$3, city=$4, notes=$5, updated_at=now() WHERE id=$1 RETURNING *",
                                    store_id, body.name, body.code, body.city, body.notes)
        except asyncpg.UniqueViolationError:
            raise HTTPException(409, "Já existe uma loja com esse nome.")
        if not r:
            raise HTTPException(404, "Loja não encontrada.")
    return dict(r)


@router.delete("/stores/{store_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_store(store_id: int):
    async with db.pool().acquire() as conn:
        n = await conn.fetchval("SELECT count(*) FROM devices WHERE store_id=$1", store_id)
        if n:
            raise HTTPException(409, f"A loja tem {n} DVR(s) vinculado(s). Remova ou mova os DVRs antes de excluir.")
        r = await conn.fetchrow("DELETE FROM stores WHERE id=$1 RETURNING *", store_id)
        if not r:
            raise HTTPException(404, "Loja não encontrada.")
        await _audit(conn, None, f"Loja excluída: {r['name']}.", store=dict(r))
    return Response(status_code=204)


# ======================================================================= DVRs
@router.get("/devices", dependencies=[Depends(require_read)])
async def list_devices(q: str = "", status: str = "", store_id: int | None = None):
    rs = await db.pool().fetch(
        DEVICE_SQL + """ WHERE ($1='' OR s.name ILIKE '%'||$1||'%' OR d.serial ILIKE '%'||$1||'%' OR d.model ILIKE '%'||$1||'%'
                               OR coalesce(d.host,'') ILIKE '%'||$1||'%' OR d.manufacturer ILIKE '%'||$1||'%')
                          AND ($2='' OR d.status=$2) AND ($3::int IS NULL OR d.store_id=$3)
                        ORDER BY s.name, d.serial""", q.strip(), status.upper(), store_id)
    return [device_out(dict(r)) for r in rs]


@router.get("/devices/{device_id}", dependencies=[Depends(require_read)])
async def get_device(device_id: int):
    async with db.pool().acquire() as conn:
        d = await _device(conn, device_id)
        chs = await conn.fetch("SELECT * FROM channels WHERE device_id=$1 ORDER BY number", device_id)
    out = device_out(d)
    out["channel_list"] = [channel_out(dict(c)) for c in chs]
    return out


async def _ensure_channels(conn, dev: dict, n: int, remove_extra: bool) -> dict:
    existing = {r["number"] for r in await conn.fetch("SELECT number FROM channels WHERE device_id=$1", dev["id"])}
    created = 0
    for i in range(1, n + 1):
        if i not in existing:
            await conn.execute("INSERT INTO channels(device_id, number, name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
                               dev["id"], i, f"Canal {i}")
            created += 1
    removed = 0
    extra = sorted(x for x in existing if x > n)
    if extra and remove_extra:
        removed = len(await conn.fetch("DELETE FROM channels WHERE device_id=$1 AND number>$2 RETURNING id", dev["id"], n))
        await _audit(conn, dev, f"Canais {', '.join(map(str, extra))} excluídos com confirmação do usuário.")
    return {"created": created, "removed": removed, "kept_extra": [] if remove_extra else extra}


@router.post("/devices", status_code=201, dependencies=[Depends(require_admin)])
async def create_device(body: DeviceIn):
    try:
        pw = encrypt_secret(body.password) if body.password else None
    except CredentialError as e:
        raise HTTPException(400, str(e))
    async with db.pool().acquire() as conn:
        async with conn.transaction():
            if not await conn.fetchval("SELECT 1 FROM stores WHERE id=$1", body.store_id):
                raise HTTPException(400, "Loja inexistente.")
            try:
                r = await conn.fetchrow(
                    """INSERT INTO devices(store_id, manufacturer, model, serial, host, port, rtsp_port, onvif_port, mode, protocol,
                                           username, password_enc, channels, poll_interval, rtsp_template)
                       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id""",
                    body.store_id, body.manufacturer, body.model, body.serial, body.host, body.port, body.rtsp_port,
                    body.onvif_port, body.mode, body.protocol, body.username, pw, body.channels, body.poll_interval,
                    body.rtsp_template)
            except asyncpg.UniqueViolationError:
                raise HTTPException(409, "Já existe um DVR com esse número de série.")
            dev = await _device(conn, r["id"])
            await _ensure_channels(conn, dev, body.channels, False)
            await _audit(conn, dev, "DVR cadastrado.")
    return device_out(dev)


@router.put("/devices/{device_id}", dependencies=[Depends(require_admin)])
async def update_device(device_id: int, body: DeviceIn, remove_extra_channels: bool = Query(False)):
    fields = body.model_dump(exclude={"password", "clear_password"})
    async with db.pool().acquire() as conn:
        async with conn.transaction():
            cur = await _device(conn, device_id)
            if not await conn.fetchval("SELECT 1 FROM stores WHERE id=$1", body.store_id):
                raise HTTPException(400, "Loja inexistente.")
            pw_sql, args = "", []
            if body.password:
                try:
                    args.append(encrypt_secret(body.password))
                except CredentialError as e:
                    raise HTTPException(400, str(e))
                pw_sql = ", password_enc=$17"
            elif body.clear_password:
                pw_sql = ", password_enc=NULL"
            try:
                await conn.execute(
                    f"""UPDATE devices SET store_id=$2, manufacturer=$3, model=$4, serial=$5, host=$6, port=$7, rtsp_port=$8,
                           onvif_port=$9, mode=$10, protocol=$11, username=$12, channels=$13, poll_interval=$14,
                           rtsp_template=$15, updated_at=$16 {pw_sql} WHERE id=$1""",
                    device_id, *[fields[k] for k in ("store_id", "manufacturer", "model", "serial", "host", "port", "rtsp_port",
                                                     "onvif_port", "mode", "protocol", "username", "channels", "poll_interval",
                                                     "rtsp_template")], state.now(), *args)
            except asyncpg.UniqueViolationError:
                raise HTTPException(409, "Já existe um DVR com esse número de série.")
            dev = await _device(conn, device_id)
            ch = await _ensure_channels(conn, dev, body.channels, remove_extra_channels)
            changed = [k for k in fields if k != "channels" and cur.get(k) != fields[k]]
            what = ", ".join(changed) if changed else "sem mudança de campos"
            await _audit(conn, dev, f"Cadastro do DVR atualizado ({what})" + (" · senha alterada" if body.password else "") + ".")
            if any(k in changed for k in ("host", "port", "rtsp_port", "onvif_port", "username")) or body.password:
                await conn.execute("UPDATE devices SET last_check=NULL WHERE id=$1", device_id)  # verifica logo
    out = device_out(dev)
    out["channel_changes"] = ch
    return out


@router.delete("/devices/{device_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_device(device_id: int):
    async with db.pool().acquire() as conn:
        async with conn.transaction():
            dev = await _device(conn, device_id)
            n = await conn.fetchval("SELECT count(*) FROM channels WHERE device_id=$1", device_id)
            await conn.execute("UPDATE incidents SET ended_at=now() WHERE device_id=$1 AND ended_at IS NULL", device_id)
            await conn.execute("DELETE FROM devices WHERE id=$1", device_id)
            await _audit(conn, dev, f"DVR excluído com {n} canal(is). O histórico foi mantido.")
    return Response(status_code=204)


@router.post("/devices/{device_id}/test", dependencies=[Depends(require_admin)])
async def test_device(device_id: int):
    s = await load_settings()
    async with db.pool().acquire() as conn:
        dev = await _device(conn, device_id)
    status, detail, lat, reach, steps = await monitor.check_device(dev, s, manual=True)
    changes: list = []
    notices: list = []
    async with db.pool().acquire() as conn:
        async with conn.transaction():
            await state.apply_device(conn, dev, status, detail, lat, reach, s, changes, notices)
    from ..monitor.alerts import dispatch
    await dispatch(notices)
    return {"ok": status in ("ONLINE", "INSTAVEL"), "status": status, "detail": detail, "latency_ms": lat, "steps": steps}


@router.post("/devices/{device_id}/onvif/discover", dependencies=[Depends(require_admin)])
async def discover_onvif(device_id: int):
    s = await load_settings()
    async with db.pool().acquire() as conn:
        dev = await _device(conn, device_id)
    if not dev.get("host"):
        return {"supported": False, "reason": "DVR sem IP acessível. Em P2P/Relay o servidor não alcança o ONVIF; é preciso VPN ou integração do fabricante."}
    try:
        pw = decrypt_secret(dev.get("password_enc"))
    except CredentialError as e:
        return {"supported": False, "reason": str(e)}
    record = {"checked_at": state.now().isoformat()}
    try:
        async with onvif_mod.OnvifClient(dev["host"], dev["onvif_port"], dev["username"], pw, timeout=max(s.timeout_s, 8)) as c:
            res = await c.discover()
    except onvif_mod.OnvifError as e:
        reason = mask_text(e.reason, pw)
        if e.kind == "auth":
            reason += ". Confira usuário e senha (no DVR o usuário precisa ter permissão ONVIF)."
        record.update({"supported": False, "reason": reason, "kind": e.kind})
        await db.pool().execute("UPDATE devices SET onvif=$2::jsonb WHERE id=$1", device_id, record)
        return {"supported": False, "reason": reason, "kind": e.kind}
    mains = onvif_mod.main_profiles(res.profiles)
    info = {"manufacturer": res.info.get("manufacturer", ""), "model": res.info.get("model", ""),
            "firmware": res.info.get("firmwareversion", ""), "serial": res.info.get("serialnumber", ""),
            "hardware": res.info.get("hardwareid", "")}
    profiles = [{"token": p.token, "name": p.name, "channel": p.channel, "encoding": p.encoding, "resolution": p.resolution,
                 "fps": p.fps, "rtsp_path": p.rtsp_path, "rtsp_port": p.rtsp_port} for p in res.profiles]
    record.update({"supported": True, "info": info, "profiles": profiles, "clock_offset_s": res.clock_offset_s})
    async with db.pool().acquire() as conn:
        await conn.execute("UPDATE devices SET onvif=$2::jsonb WHERE id=$1", device_id, record)
        await conn.execute(
            """INSERT INTO events(store_id, device_id, store_name, serial, type, description)
               VALUES($1,$2,$3,$4,'ONVIF',$5)""", dev["store_id"], dev["id"], dev["store_name"], dev["serial"],
            f"ONVIF: {len(mains)} canal(is) e {len(res.profiles)} perfil(is) de mídia encontrados.")
    warn = []
    if info["serial"] and dev["serial"] and info["serial"].upper() != dev["serial"].upper():
        warn.append(f"O serial informado pelo equipamento ({info['serial']}) difere do cadastro ({dev['serial']}).")
    if abs(res.clock_offset_s) > 120:
        warn.append(f"Relógio do DVR difere {int(res.clock_offset_s)} s do servidor (ajuste o NTP do DVR).")
    return {"supported": True, "info": info, "warnings": warn, "all_profiles": len(res.profiles),
            "profiles": [{"token": p.token, "channel": p.channel, "encoding": p.encoding, "resolution": p.resolution,
                          "rtsp": public_url(dev, {"number": p.channel, "rtsp_path": p.rtsp_path}, substream=False)}
                         for p in mains]}


def _area(res: str) -> int:
    try:
        w, h = (res or "").split("x")
        return int(w) * int(h)
    except ValueError:
        return 0


def _main_profile_dicts(profiles: list[dict]) -> list[dict]:
    best: dict[int, dict] = {}
    for p in profiles:
        ch = p.get("channel") or 0
        if ch and (ch not in best or _area(p.get("resolution")) > _area(best[ch].get("resolution"))):
            best[ch] = p
    return [best[k] for k in sorted(best)]


@router.post("/devices/{device_id}/channels/sync", dependencies=[Depends(require_admin)])
async def sync_channels(device_id: int, body: SyncIn):
    async with db.pool().acquire() as conn:
        async with conn.transaction():
            dev = await _device(conn, device_id)
            ov = dev.get("onvif") or {}
            if not ov.get("supported"):
                raise HTTPException(409, "Faça a descoberta ONVIF antes de sincronizar.")
            known = {p["token"]: p for p in ov.get("profiles") or []}
            if body.profiles:
                chosen = [known[t] for t in body.profiles if t in known]
                if not chosen:
                    raise HTTPException(400, "Nenhum dos perfis informados veio da última descoberta ONVIF.")
            else:
                chosen = _main_profile_dicts(list(known.values()))
            created = kept = 0
            for p in chosen:
                if not p.get("channel"):
                    continue
                r = await conn.fetchrow("SELECT id FROM channels WHERE device_id=$1 AND number=$2", device_id, p["channel"])
                if r:
                    # mantém nome e histórico; só atualiza o caminho do fluxo
                    await conn.execute("UPDATE channels SET profile_token=$2, rtsp_path=$3, resolution=CASE WHEN resolution='' THEN $4 ELSE resolution END, last_check=NULL, updated_at=now() WHERE id=$1",
                                       r["id"], p["token"], p.get("rtsp_path") or "", p.get("resolution") or "")
                    kept += 1
                else:
                    await conn.execute(
                        "INSERT INTO channels(device_id, number, name, profile_token, rtsp_path, resolution) VALUES($1,$2,$3,$4,$5,$6)",
                        device_id, p["channel"], f"Canal {p['channel']}", p["token"], p.get("rtsp_path") or "", p.get("resolution") or "")
                    created += 1
            top = await conn.fetchval("SELECT coalesce(max(number),0) FROM channels WHERE device_id=$1", device_id)
            if top > dev["channels"]:
                await conn.execute("UPDATE devices SET channels=$2 WHERE id=$1", device_id, top)
            await _audit(conn, dev, f"Canais sincronizados via ONVIF: {created} criado(s), {kept} mantido(s).")
    return {"created": created, "kept": kept}


@router.get("/devices/{device_id}/availability", dependencies=[Depends(require_read)])
async def device_availability(device_id: int, days: int = Query(7, ge=1, le=365)):
    rs = await db.pool().fetch(
        """SELECT date_trunc('day', ts AT TIME ZONE 'America/Sao_Paulo') AS day, count(*)::int AS samples,
                  count(*) FILTER (WHERE status IN ('ONLINE','INSTAVEL'))::int AS up, avg(latency_ms)::int AS latency_ms
           FROM availability WHERE device_id=$1 AND channel_id IS NULL AND ts >= now() - make_interval(days => $2)
           GROUP BY 1 ORDER BY 1""", device_id, days)
    inc = await db.pool().fetch(
        """SELECT id, type, channel_id, started_at, ended_at,
                  extract(epoch FROM coalesce(ended_at, now()) - started_at)::int AS duration_s
           FROM incidents WHERE device_id=$1 AND coalesce(ended_at, now()) >= now() - make_interval(days => $2)
           ORDER BY started_at DESC LIMIT 500""", device_id, days)
    return {"days": [{"day": r["day"].date().isoformat(), "samples": r["samples"],
                      "uptime_pct": round(100 * r["up"] / r["samples"], 2) if r["samples"] else None,
                      "latency_ms": r["latency_ms"]} for r in rs],
            "incidents": [dict(r) for r in inc]}


# ======================================================================= canais
@router.get("/channels", dependencies=[Depends(require_read)])
async def list_channels(device_id: int | None = None, store_id: int | None = None, status: str = "", q: str = ""):
    rs = await db.pool().fetch(
        """SELECT c.*, d.serial, d.store_id, s.name AS store,
                  CASE WHEN c.status NOT IN ('TRANSMITINDO','NAO_VERIFICADO') THEN extract(epoch FROM now()-coalesce(c.last_frame, c.status_since))::int END AS down_s
           FROM channels c JOIN devices d ON d.id=c.device_id JOIN stores s ON s.id=d.store_id
           WHERE ($1::int IS NULL OR c.device_id=$1) AND ($2::int IS NULL OR d.store_id=$2) AND ($3='' OR c.status=$3)
             AND ($4='' OR s.name ILIKE '%'||$4||'%' OR d.serial ILIKE '%'||$4||'%' OR c.name ILIKE '%'||$4||'%')
           ORDER BY s.name, d.serial, c.number""", device_id, store_id, status.upper(), q.strip())
    return [channel_out(dict(r)) for r in rs]


async def _channel(conn, channel_id: int) -> dict:
    r = await conn.fetchrow("SELECT * FROM channels WHERE id=$1", channel_id)
    if not r:
        raise HTTPException(404, "Canal não encontrado.")
    return dict(r)


@router.post("/channels", status_code=201, dependencies=[Depends(require_admin)])
async def create_channel(body: ChannelIn):
    async with db.pool().acquire() as conn:
        async with conn.transaction():
            dev = await _device(conn, body.device_id)
            try:
                r = await conn.fetchrow("INSERT INTO channels(device_id, number, name, enabled, rtsp_path) VALUES($1,$2,$3,$4,$5) RETURNING *",
                                        body.device_id, body.number, body.name, body.enabled, body.rtsp_path)
            except asyncpg.UniqueViolationError:
                raise HTTPException(409, "Esse DVR já tem um canal com esse número.")
            if body.number > dev["channels"]:
                await conn.execute("UPDATE devices SET channels=$2 WHERE id=$1", dev["id"], body.number)
            await _audit(conn, dev, f"Canal {body.number} cadastrado ({body.name}).", ch=dict(r))
    return channel_out(dict(r))


@router.put("/channels/{channel_id}", dependencies=[Depends(require_admin)])
async def update_channel(channel_id: int, body: ChannelIn):
    async with db.pool().acquire() as conn:
        async with conn.transaction():
            cur = await _channel(conn, channel_id)
            try:
                r = await conn.fetchrow(
                    "UPDATE channels SET number=$2, name=$3, enabled=$4, rtsp_path=$5, updated_at=now() WHERE id=$1 RETURNING *",
                    channel_id, body.number, body.name,
                    body.enabled if "enabled" in body.model_fields_set else cur["enabled"], body.rtsp_path or cur["rtsp_path"])
            except asyncpg.UniqueViolationError:
                raise HTTPException(409, "Esse DVR já tem um canal com esse número.")
    return channel_out(dict(r))


@router.delete("/channels/{channel_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_channel(channel_id: int):
    async with db.pool().acquire() as conn:
        async with conn.transaction():
            ch = await _channel(conn, channel_id)
            dev = await _device(conn, ch["device_id"])
            await conn.execute("UPDATE incidents SET ended_at=now() WHERE channel_id=$1 AND ended_at IS NULL", channel_id)
            await conn.execute("DELETE FROM channels WHERE id=$1", channel_id)
            await _audit(conn, dev, f"Canal {ch['number']} ({ch['name']}) excluído. O histórico foi mantido.", ch=ch)
    snapshots.delete(channel_id)
    return Response(status_code=204)


@router.get("/channels/{channel_id}/snapshot", dependencies=[Depends(require_read)],
            responses={200: {"content": {"image/jpeg": {}}}, 404: {"description": "Canal ainda sem foto"}})
async def channel_snapshot(channel_id: int):
    """Última foto do canal (JPEG), capturada no teste de vídeo. Exige o mesmo token de leitura da API."""
    path = snapshots.path_for(channel_id)
    if not os.path.isfile(path):
        raise HTTPException(404, "Este canal ainda não tem foto: ela aparece depois do primeiro teste de vídeo com sucesso.")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=30"})


@router.post("/channels/{channel_id}/test", dependencies=[Depends(require_admin)])
async def test_channel(channel_id: int):
    s = await load_settings()
    async with db.pool().acquire() as conn:
        ch = await _channel(conn, channel_id)
        dev = await _device(conn, ch["device_id"])
    st, detail, extra, steps = await monitor.check_channel(dev, ch, s)
    changes: list = []
    notices: list = []
    async with db.pool().acquire() as conn:
        async with conn.transaction():
            await state.apply_channel(conn, dev, ch, st, detail, extra, s, changes, notices)
    from ..monitor.alerts import dispatch
    await dispatch(notices)
    return {"ok": st == "TRANSMITINDO", "status": st, "detail": detail, "steps": steps,
            "resolution": extra.get("resolution"), "fps": extra.get("fps"), "codec": extra.get("codec"),
            "checked_at": dt.datetime.now(dt.timezone.utc)}
