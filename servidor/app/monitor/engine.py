"""Motor de monitoramento em segundo plano (asyncio, não bloqueia a API).

- Laço de DVRs: TCP (timeout + tentativas) → autenticação (ONVIF ou RTSP DESCRIBE) → status.
- Laço de canais: FFmpeg por canal, só para DVR acessível, no máximo 1 fluxo por DVR e
  `rtsp_concurrency` fluxos no total.
- Limpeza: alerta de falha prolongada, lembretes e retenção das amostras.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import hashlib
import logging
import time

from .. import db
from ..config import get_config
from ..security import CredentialError, decrypt_secret, mask_text
from ..settings_store import MonitorSettings, load as load_settings
from . import alerts, onvif, rtsp_describe, rtsp_probe, state, tcp, urls

log = logging.getLogger("cftv.monitor")

DEVICE_SQL = """SELECT d.*, s.name AS store_name FROM devices d JOIN stores s ON s.id=d.store_id"""
AUTH_BACKOFF_S = 1800
CHANNEL_RETRY_DELAY_S = 5   # reconexão: um canal com falha é testado de novo antes de mudar de status   # não insiste em senha errada (DVRs Intelbras/Dahua bloqueiam a conta após falhas)
P2P_DETAIL = ("Sem IP/hostname acessível pelo servidor. Conexão {mode} (P2P/Relay) só funciona pelo app do fabricante; "
              "cadastre o IP da VPN/Tailscale/MikroTik para monitorar.")


def _uses_onvif(dev: dict) -> bool:
    return "onvif" in (dev.get("protocol") or "").lower()


def _uses_rtsp(dev: dict) -> bool:
    p = (dev.get("protocol") or "").lower()
    return "rtsp" in p or p in ("", "a confirmar")


def _cred_fp(dev: dict) -> str:
    return hashlib.sha1(f"{dev.get('username')}|{dev.get('password_enc')}|{dev.get('host')}".encode()).hexdigest()


class Monitor:
    def __init__(self) -> None:
        self._tasks: list[asyncio.Task] = []
        self._dev_inflight: set[int] = set()
        self._ch_inflight_dev: set[int] = set()
        self._auth_block: dict[int, tuple[float, str]] = {}
        self._force_all = asyncio.Event()
        self.started_at: dt.datetime | None = None
        self.last_device_cycle: dt.datetime | None = None
        self.last_channel_cycle: dt.datetime | None = None
        self.running = False

    # ------------------------------------------------------------------ ciclo de vida
    def start(self) -> None:
        if self.running:
            return
        self.running = True
        self.started_at = state.now()
        self._tasks = [asyncio.create_task(self._loop(self._device_tick, 5), name="dvr-loop"),
                       asyncio.create_task(self._loop(self._channel_tick, 10), name="canal-loop"),
                       asyncio.create_task(self._loop(self._housekeeping_tick, 60), name="limpeza")]
        log.info("monitor iniciado")

    async def stop(self) -> None:
        self.running = False
        for t in self._tasks:
            t.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks = []

    async def _loop(self, fn, every: float) -> None:
        while self.running:
            try:
                await fn()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("erro no laço %s", fn.__name__)
            try:
                await asyncio.wait_for(self._force_all.wait(), timeout=every) if fn is self._device_tick else await asyncio.sleep(every)
            except asyncio.TimeoutError:
                pass

    def status(self) -> dict:
        return {"running": self.running, "started_at": self.started_at, "last_device_cycle": self.last_device_cycle,
                "last_channel_cycle": self.last_channel_cycle, "devices_in_check": len(self._dev_inflight),
                "channels_in_check": len(self._ch_inflight_dev)}

    # ------------------------------------------------------------------ DVRs
    async def _device_tick(self) -> None:
        s = await load_settings()
        force = self._force_all.is_set()
        self._force_all.clear()
        p = db.pool()
        devs = [dict(r) for r in await p.fetch(DEVICE_SQL + " ORDER BY d.last_check NULLS FIRST")]
        due = []
        nowt = state.now()
        for d in devs:
            if d["id"] in self._dev_inflight:
                continue
            if not (d.get("host") or "").strip():
                if d["status"] != "NAO_VERIFICADO" or d["last_check"] is None:
                    await self._apply_device(d, "NAO_VERIFICADO", P2P_DETAIL.format(mode=d.get("mode") or "sem rota"), None, False, s, [], [])
                continue
            interval = d.get("poll_interval") or s.poll_interval
            if force or d["last_check"] is None or (nowt - d["last_check"]).total_seconds() >= interval:
                due.append(d)
        if due:
            await self.check_devices(due, s)
        self.last_device_cycle = state.now()

    async def check_devices(self, devs: list[dict], s: MonitorSettings) -> list[dict]:
        sem = asyncio.Semaphore(s.concurrency)
        changes: list[dict] = []
        notices: list[alerts.Notice] = []

        async def one(d):
            async with sem:
                self._dev_inflight.add(d["id"])
                try:
                    status, detail, lat, reach, _ = await self.check_device(d, s)
                    await self._apply_device(d, status, detail, lat, reach, s, changes, notices)
                except Exception:
                    log.exception("falha verificando DVR %s", d["id"])
                finally:
                    self._dev_inflight.discard(d["id"])
        await asyncio.gather(*(one(d) for d in devs))
        await alerts.dispatch(notices)
        return changes

    async def _apply_device(self, d, status, detail, lat, reach, s, changes, notices) -> None:
        async with db.pool().acquire() as conn:
            async with conn.transaction():
                await state.apply_device(conn, d, status, detail, lat, reach, s, changes, notices)

    async def _flaps(self, device_id: int, s: MonitorSettings) -> int:
        rs = await db.pool().fetch(
            "SELECT status FROM availability WHERE device_id=$1 AND channel_id IS NULL AND ts >= now() - make_interval(mins => $2) ORDER BY ts",
            device_id, s.unstable_window_minutes)
        ups = [r["status"] != "OFFLINE" for r in rs]
        return sum(1 for a, b in zip(ups, ups[1:]) if a != b)

    async def check_device(self, d: dict, s: MonitorSettings, manual: bool = False):
        """Retorna (status, detalhe, latência, alcançável, passos)."""
        steps: list[dict] = []
        host = (d.get("host") or "").strip()
        if not host:
            msg = P2P_DETAIL.format(mode=d.get("mode") or "sem rota")
            steps.append({"ok": False, "text": msg})
            return "NAO_VERIFICADO", msg, None, False, steps
        res = await tcp.tcp_check(host, d["port"], s.timeout_s, s.retries, stop_on_success=True)
        port_used = d["port"]
        if not res.ok and d.get("rtsp_port") and d["rtsp_port"] != d["port"]:
            steps.append({"ok": False, "text": f"TCP {host}:{d['port']} sem resposta ({', '.join(sorted(set(res.errors)))})"})
            res2 = await tcp.tcp_check(host, d["rtsp_port"], s.timeout_s, 1)
            if res2.ok:
                res, port_used = res2, d["rtsp_port"]
        if not res.ok:
            err = ", ".join(sorted(set(res.errors))) or "sem resposta"
            steps.append({"ok": False, "text": f"TCP {host}:{port_used} sem resposta após {res.attempts} tentativa(s): {err}"})
            return "OFFLINE", f"sem resposta TCP em {host}:{port_used} ({err})", None, False, steps
        steps.append({"ok": True, "text": f"TCP {host}:{port_used} respondeu em {res.latency_ms} ms"
                      + (f" (após {res.attempts - 1} falha(s))" if res.partial else "")})
        status, detail = "ONLINE", f"responde em {res.latency_ms} ms"

        auth_status = await self._auth_check(d, s, steps, manual)
        if auth_status == "ERRO_AUTENTICACAO":
            return "ERRO_AUTENTICACAO", "usuário/senha recusados pelo DVR", res.latency_ms, True, steps

        flaps = await self._flaps(d["id"], s)
        if res.partial or flaps >= s.unstable_changes:
            status = "INSTAVEL"
            detail = (f"respondeu só na {res.attempts}ª tentativa" if res.partial
                      else f"{flaps} quedas/retornos nos últimos {s.unstable_window_minutes} min")
            steps.append({"ok": None, "text": "Conexão instável: " + detail})
        return status, detail, res.latency_ms, True, steps

    async def _auth_check(self, d: dict, s: MonitorSettings, steps: list[dict], manual: bool) -> str | None:
        user = d.get("username") or ""
        if not user:
            steps.append({"ok": None, "text": "Sem usuário cadastrado: autenticação e vídeo não podem ser verificados."})
            return None
        fp = _cred_fp(d)
        blocked = self._auth_block.get(d["id"])
        if blocked and not manual and blocked[1] == fp and time.monotonic() - blocked[0] < AUTH_BACKOFF_S:
            steps.append({"ok": False, "text": "Autenticação falhou recentemente; aguardando antes de tentar de novo (evita bloqueio da conta)."})
            return "ERRO_AUTENTICACAO"
        try:
            pw = decrypt_secret(d.get("password_enc"))
        except CredentialError as e:
            steps.append({"ok": False, "text": str(e)})
            return None
        result = None
        if _uses_onvif(d):
            try:
                async with onvif.OnvifClient(d["host"], d["onvif_port"], user, pw, timeout=s.timeout_s) as c:
                    await c.sync_clock()
                    info = await c.device_information()
                steps.append({"ok": True, "text": f"ONVIF: autenticado ({info.get('manufacturer', '')} {info.get('model', '')})".strip()})
                result = "ok"
            except onvif.OnvifError as e:
                if e.kind == "auth":
                    steps.append({"ok": False, "text": "ONVIF recusou usuário/senha"})
                    result = "auth"
                else:
                    steps.append({"ok": None, "text": "ONVIF: " + mask_text(e.reason, pw)})
        if result is None and _uses_rtsp(d):
            url = urls.public_url(d, {"number": 1, "rtsp_path": ""}, s.rtsp_substream)
            r = await rtsp_describe.describe(url, user, pw, timeout=s.timeout_s)
            if r.auth_failed:
                steps.append({"ok": False, "text": f"RTSP recusou usuário/senha ({r.code})"})
                result = "auth"
            elif r.code is not None:
                steps.append({"ok": True, "text": f"RTSP {d['rtsp_port']}: autenticação aceita (resposta {r.code})"})
                result = "ok"
            else:
                steps.append({"ok": None, "text": f"RTSP {d['rtsp_port']}: {r.error}"})
        if result == "auth":
            self._auth_block[d["id"]] = (time.monotonic(), fp)
            return "ERRO_AUTENTICACAO"
        self._auth_block.pop(d["id"], None)
        return None

    # ------------------------------------------------------------------ canais
    async def _channel_tick(self) -> None:
        s = await load_settings()
        rs = await db.pool().fetch(
            """SELECT c.* FROM channels c JOIN devices d ON d.id=c.device_id
               WHERE c.enabled AND coalesce(d.host,'')<>'' AND d.username<>'' AND d.status IN ('ONLINE','INSTAVEL')
                 AND (c.last_check IS NULL OR c.last_check <= now() - make_interval(secs => $1))
               ORDER BY c.last_check NULLS FIRST, c.id LIMIT 200""", float(s.rtsp_interval))
        picked: list[dict] = []
        devs_taken: set[int] = set()
        for r in rs:
            if r["device_id"] in self._ch_inflight_dev or r["device_id"] in devs_taken:
                continue   # um fluxo por DVR por vez, para não saturar o link da loja
            devs_taken.add(r["device_id"])
            picked.append(dict(r))
            if len(picked) >= s.rtsp_concurrency:
                break
        if picked:
            await self.check_channels(picked, s)
        self.last_channel_cycle = state.now()

    async def check_channels(self, chans: list[dict], s: MonitorSettings) -> list[dict]:
        sem = asyncio.Semaphore(s.rtsp_concurrency)
        changes: list[dict] = []
        notices: list[alerts.Notice] = []

        async def one(c):
            async with sem:
                self._ch_inflight_dev.add(c["device_id"])
                try:
                    d = dict(await db.pool().fetchrow(DEVICE_SQL + " WHERE d.id=$1", c["device_id"]))
                    st, detail, extra, _ = await self.check_channel(d, c, s)
                    async with db.pool().acquire() as conn:
                        async with conn.transaction():
                            await state.apply_channel(conn, d, c, st, detail, extra, s, changes, notices)
                except Exception:
                    log.exception("falha verificando canal %s", c["id"])
                finally:
                    self._ch_inflight_dev.discard(c["device_id"])
        await asyncio.gather(*(one(c) for c in chans))
        await alerts.dispatch(notices)
        return changes

    async def check_channel(self, d: dict, c: dict, s: MonitorSettings):
        """Retorna (status, detalhe, extras, passos)."""
        steps: list[dict] = []
        if not (d.get("host") or "").strip():
            steps.append({"ok": False, "text": "DVR sem rota direta (P2P/Relay): não é possível abrir o RTSP."})
            return "NAO_VERIFICADO", "DVR sem IP acessível", {}, steps
        if d["status"] == "OFFLINE":
            steps.append({"ok": False, "text": "DVR offline: o canal não pode ser testado."})
            return "OFFLINE", "DVR offline", {}, steps
        if not d.get("username"):
            steps.append({"ok": False, "text": "Cadastre usuário e senha do DVR para testar o vídeo."})
            return "NAO_VERIFICADO", "sem credenciais", {}, steps
        try:
            pw = decrypt_secret(d.get("password_enc"))
        except CredentialError as e:
            steps.append({"ok": False, "text": str(e)})
            return "NAO_VERIFICADO", str(e), {}, steps
        url = urls.channel_url(d, c, d["username"], pw, s.rtsp_substream)
        shown = urls.public_url(d, c, s.rtsp_substream)
        steps.append({"ok": None, "text": f"ffprobe/ffmpeg RTSP (TCP) {shown}"})
        cfg = get_config()
        r = await rtsp_probe.probe(url, s.rtsp_timeout_s, s.freeze_detection, c.get("frame_hash") or "", cfg.ffmpeg_bin)
        if r.status in ("SEM_VIDEO", "OFFLINE") and r.status != "ERRO_AUTENTICACAO":
            steps.append({"ok": False, "text": mask_text(r.detail, pw) + " · nova tentativa em 5 s"})
            await asyncio.sleep(CHANNEL_RETRY_DELAY_S)
            r = await rtsp_probe.probe(url, s.rtsp_timeout_s, s.freeze_detection, c.get("frame_hash") or "", cfg.ffmpeg_bin)
        detail = mask_text(r.detail, pw, d["username"] if len(d["username"]) > 3 else None)
        if r.codec or r.resolution:
            steps.append({"ok": True, "text": f"Stream {r.codec} {r.resolution}" + (f" @ {r.fps:g} fps" if r.fps else "")})
        steps.append({"ok": r.status == "TRANSMITINDO", "text": detail})
        return r.status, detail, {"resolution": r.resolution, "fps": r.fps, "codec": r.codec, "frame_hash": r.frame_hash}, steps

    # ------------------------------------------------------------------ limpeza / ações
    async def _housekeeping_tick(self) -> None:
        s = await load_settings()
        changes: list[dict] = []
        notices: list[alerts.Notice] = []
        async with db.pool().acquire() as conn:
            async with conn.transaction():
                await state.housekeeping(conn, s, changes, notices)
        await alerts.dispatch(notices)

    async def run_now(self, wait_s: float = 50) -> dict:
        """Verifica todos os DVRs com IP agora (usado por 'Verificar agora'); canais entram na fila."""
        s = await load_settings(force=True)
        devs = [dict(r) for r in await db.pool().fetch(DEVICE_SQL + " WHERE coalesce(d.host,'')<>''")]
        devs = [d for d in devs if d["id"] not in self._dev_inflight]
        await db.pool().execute("UPDATE channels SET last_check=NULL WHERE enabled AND device_id IN (SELECT id FROM devices WHERE coalesce(host,'')<>'')")
        try:
            changes = await asyncio.wait_for(asyncio.shield(self.check_devices(devs, s)), timeout=wait_s)
            return {"checked": len(devs), "changes": changes, "pending": False}
        except asyncio.TimeoutError:
            return {"checked": len(devs), "changes": [], "pending": True}


monitor = Monitor()
