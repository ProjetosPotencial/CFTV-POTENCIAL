"""Fluxo completo pela API, com Postgres real e equipamentos simulados."""
import json
from pathlib import Path

import asyncpg
import httpx
import pytest

from app import db, settings_store
from app.config import get_config, reset_config
from app.main import app
from app.monitor import alerts, onvif, rtsp_probe
from app.monitor.engine import monitor
from tests.fakes import FakeRtspDvr, onvif_handler

ADMIN = {"Authorization": "Bearer admin-token-de-teste"}
READ = {"Authorization": "Bearer read-token-de-teste"}
INVENTARIO = json.loads((Path(__file__).parent / "inventario_atual.json").read_text(encoding="utf-8"))


@pytest.fixture
async def api(monkeypatch):
    reset_config()
    cfg = get_config()
    conn = await asyncpg.connect(cfg.database_url)
    await conn.execute(f'DROP SCHEMA IF EXISTS "{cfg.db_schema}" CASCADE')   # schema só de teste
    # tabela "do sistema atual" no schema public: precisa continuar intacta
    await conn.execute("CREATE TABLE IF NOT EXISTS public.devices_legado_teste (id int, serial text)")
    await conn.execute("TRUNCATE public.devices_legado_teste")
    await conn.execute("INSERT INTO public.devices_legado_teste VALUES (1, 'OSVH2005814WJ')")
    await conn.close()
    settings_store._cache = None
    await db.connect()
    sent: list[str] = []

    async def fake_post(text):
        sent.append(text)
        return True, "ok"
    monkeypatch.setattr(alerts, "post", fake_post)
    monitor._auth_block.clear()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        c.slack = sent
        yield c
    await db.close()


async def test_autenticacao_da_api(api):
    assert (await api.get("/api/health")).status_code == 200
    assert (await api.get("/api/summary")).status_code == 401
    assert (await api.get("/api/summary", headers=READ)).status_code == 200
    r = await api.post("/api/stores", json={"name": "X"}, headers=READ)
    assert r.status_code == 403
    r = await api.post("/api/stores", json={"name": "X"}, headers={"Authorization": "Bearer chute"})
    assert r.status_code == 401


async def test_importa_inventario_atual(api):
    r = await api.post("/api/admin/import-legacy?dry_run=true", json=INVENTARIO, headers=ADMIN)
    assert r.json()["devices"]["created"] == 31
    assert (await api.get("/api/summary", headers=READ)).json()["devices"] == 0   # simulação não grava
    r = await api.post("/api/admin/import-legacy?dry_run=false", json=INVENTARIO, headers=ADMIN)
    st = r.json()
    assert (st["stores"]["created"], st["devices"]["created"], st["channels"]["created"]) == (31, 31, 141)
    r = await api.post("/api/admin/import-legacy?dry_run=false", json=INVENTARIO, headers=ADMIN)
    assert r.json()["devices"]["created"] == 0 and r.json()["channels"]["created"] == 0   # idempotente
    s = (await api.get("/api/summary", headers=READ)).json()
    assert (s["stores"], s["devices"], s["channels"], s["unverified"]) == (31, 31, 141, 31)
    # o painel atual continua com seus dados
    conn = await asyncpg.connect(get_config().database_url)
    assert await conn.fetchval("SELECT count(*) FROM public.devices_legado_teste") == 1
    await conn.close()
    # DVRs sem IP (P2P/Relay) ficam NÃO VERIFICADO com o motivo, sem simular conectividade
    await monitor._device_tick()
    devs = (await api.get("/api/devices", headers=READ)).json()
    assert all(d["status"] == "NAO_VERIFICADO" for d in devs)
    assert "P2P/Relay" in devs[0]["status_detail"]


async def _store_and_device(api, port, **kw):
    sid = (await api.post("/api/stores", json={"name": "Loja Teste"}, headers=ADMIN)).json()["id"]
    body = {"store_id": sid, "manufacturer": "Intelbras", "model": "MHDX 3104", "serial": "teste123", "host": "127.0.0.1",
            "port": port, "rtsp_port": port, "mode": "VPN", "protocol": "RTSP", "username": "admin", "password": "senha123",
            "channels": 3, "rtsp_template": "/ch{n}", "status": "ONLINE", "has_password": False}
    body.update(kw)
    r = await api.post("/api/devices", json=body, headers=ADMIN)
    assert r.status_code == 201, r.text
    return sid, r.json()


async def test_cadastro_protege_senha_e_canais(api):
    dvr = await FakeRtspDvr().start()
    try:
        sid, d = await _store_and_device(api, dvr.port)
        assert d["serial"] == "TESTE123" and d["has_password"] is True
        txt = (await api.get(f"/api/devices/{d['id']}", headers=READ)).text
        assert "senha123" not in txt and "password" not in txt.replace("has_password", "")
        chs = (await api.get(f"/api/channels?device_id={d['id']}", headers=READ)).json()
        assert [c["number"] for c in chs] == [1, 2, 3]
        # reduzir sem confirmação mantém os canais
        upd = {**d, "store_id": sid, "channels": 1}
        r = await api.put(f"/api/devices/{d['id']}", json=upd, headers=ADMIN)
        assert r.json()["channel_changes"]["kept_extra"] == [2, 3]
        assert len((await api.get(f"/api/channels?device_id={d['id']}", headers=READ)).json()) == 3
        # senha não é apagada quando o formulário não manda uma nova
        assert r.json()["has_password"] is True
        r = await api.put(f"/api/devices/{d['id']}?remove_extra_channels=true", json=upd, headers=ADMIN)
        assert r.json()["channel_changes"]["removed"] == 2
        assert (await api.delete(f"/api/stores/{sid}", headers=ADMIN)).status_code == 409
        r = await api.post("/api/devices", json={**upd, "serial": "TESTE123"}, headers=ADMIN)
        assert r.status_code == 409
        r = await api.post("/api/devices", json={**upd, "serial": "OUTRO", "host": "bad host;rm"}, headers=ADMIN)
        assert r.status_code == 422
    finally:
        await dvr.stop()


async def test_monitoramento_completo(api, monkeypatch):
    sources = {"/ch1": "testsrc2=size=640x360:rate=10", "/ch2": "color=c=black:size=640x360:rate=10",
               "/ch3": "testsrc2=size=640x360:rate=10,trim=end_frame=1,loop=loop=-1:size=1"}

    def fake_input(url, t):
        path = "/" + url.split("/")[-1]
        assert "admin:senha123@" in url   # credenciais só chegam aqui, no FFmpeg
        return ["-re", "-f", "lavfi", "-i", sources[path]]
    monkeypatch.setattr(rtsp_probe, "input_args", fake_input)
    monkeypatch.setattr("app.monitor.engine.CHANNEL_RETRY_DELAY_S", 0)
    await settings_store.save({"retries": 1, "timeout_s": 2})

    dvr = await FakeRtspDvr().start()
    sid, d = await _store_and_device(api, dvr.port)
    port = dvr.port

    r = (await api.post("/api/monitor/run", headers=ADMIN)).json()
    assert r["checked"] == 1
    dev = (await api.get(f"/api/devices/{d['id']}", headers=READ)).json()
    assert dev["status"] == "ONLINE" and dev["latency_ms"] is not None

    # vídeo de cada canal (FFmpeg)
    await monitor._channel_tick()   # um fluxo por DVR por vez
    await monitor._channel_tick()
    await monitor._channel_tick()
    chs = {c["number"]: c for c in (await api.get(f"/api/channels?device_id={d['id']}", headers=READ)).json()}
    assert chs[1]["status"] == "TRANSMITINDO" and chs[1]["resolution"] == "640x360" and chs[1]["last_frame"]
    assert chs[2]["status"] == "SEM_VIDEO" and "preta" in chs[2]["status_detail"]
    assert chs[3]["status"] == "SEM_VIDEO" and "congelada" in chs[3]["status_detail"]
    assert len([m for m in api.slack if "Canal perdeu vídeo" in m]) == 2

    # mesma falha não gera novo alerta
    n = len(api.slack)
    await api.post(f"/api/channels/{chs[2]['id']}/test", headers=ADMIN)
    assert len(api.slack) == n

    # canal volta
    sources["/ch2"] = sources["/ch1"]
    r = (await api.post(f"/api/channels/{chs[2]['id']}/test", headers=ADMIN)).json()
    assert r["status"] == "TRANSMITINDO" and all("senha123" not in s["text"] for s in r["steps"])
    assert any("Canal voltou a transmitir" in m for m in api.slack)

    # DVR cai: DVR offline, canais OFFLINE (sem alerta de canal), 1 alerta só
    await dvr.stop()
    n = len(api.slack)
    await api.post("/api/monitor/run", headers=ADMIN)
    await api.post("/api/monitor/run", headers=ADMIN)
    dev = (await api.get(f"/api/devices/{d['id']}", headers=READ)).json()
    assert dev["status"] == "OFFLINE"
    chs = (await api.get(f"/api/channels?device_id={d['id']}", headers=READ)).json()
    assert {c["status"] for c in chs} == {"OFFLINE"}
    new = api.slack[n:]
    assert len(new) == 1 and "DVR offline" in new[0]

    # falha prolongada: avisa uma vez
    pool = db.pool()
    await pool.execute("UPDATE incidents SET started_at = now() - interval '2 hours', last_notified_at = now() WHERE ended_at IS NULL AND type='DVR_OFFLINE'")
    await monitor._housekeeping_tick()
    await monitor._housekeeping_tick()
    assert len([m for m in api.slack if "Sem comunicação prolongada" in m]) == 1

    # volta
    dvr = await FakeRtspDvr().start(port)
    await api.post("/api/monitor/run", headers=ADMIN)
    dev = (await api.get(f"/api/devices/{d['id']}", headers=READ)).json()
    assert dev["status"] == "ONLINE"
    ev = (await api.get(f"/api/events?device_id={d['id']}&type=DVR_ONLINE", headers=READ)).json()
    assert ev and ev[0]["duration_s"] >= 7000
    off = (await api.get(f"/api/events?device_id={d['id']}&type=DVR_OFFLINE", headers=READ)).json()
    assert off[0]["open"] is False and off[0]["recovered_at"]
    assert any("DVR voltou online" in m for m in api.slack)

    # senha errada: ERRO_AUTENTICACAO e o monitor não insiste (evita bloqueio da conta no DVR)
    await pool.execute("UPDATE devices SET password_enc=$2 WHERE id=$1", d["id"],
                       __import__("app.security", fromlist=["x"]).encrypt_secret("errada"))
    await api.post("/api/monitor/run", headers=ADMIN)
    assert (await api.get(f"/api/devices/{d['id']}", headers=READ)).json()["status"] == "ERRO_AUTENTICACAO"
    tries = dvr.auth_attempts
    await api.post("/api/monitor/run", headers=ADMIN)
    assert dvr.auth_attempts == tries
    assert any("Falha de autenticação" in m for m in api.slack)

    # relatórios e histórico
    rep = (await api.get("/api/reports/availability", headers=READ)).json()
    row = next(x for x in rep["devices"] if x["device_id"] == d["id"])
    assert row["incidents"] >= 3 and 0 < row["uptime_pct"] < 100
    csv = await api.get("/api/events?format=csv", headers=READ)
    assert csv.status_code == 200 and "Loja Teste" in csv.text
    tl = (await api.get("/api/reports/incidents-timeline", headers=READ)).json()
    assert tl and "DVR_OFFLINE" in tl[-1]
    av = (await api.get(f"/api/devices/{d['id']}/availability", headers=READ)).json()
    assert av["days"] and av["incidents"]
    s = (await api.get("/api/summary", headers=READ)).json()
    assert s["auth_error"] == 1 and s["active_alerts"] >= 1
    await dvr.stop()


async def test_onvif_descoberta_e_sincronizacao(api, monkeypatch):
    class Mock(onvif.OnvifClient):
        def __init__(self, *a, **kw):
            kw["transport"] = onvif_handler(channels=4)
            super().__init__(*a, **kw)
    monkeypatch.setattr("app.api.inventory.onvif_mod.OnvifClient", Mock)
    sid, d = await _store_and_device(api, 9, protocol="ONVIF + RTSP", channels=2, serial="OSVH2005814WJ", rtsp_template="")
    await api.put(f"/api/channels/{(await api.get(f'/api/channels?device_id={d['id']}', headers=READ)).json()[0]['id']}",
                  json={"device_id": d["id"], "number": 1, "name": "Caixa 1"}, headers=ADMIN)
    r = (await api.post(f"/api/devices/{d['id']}/onvif/discover", headers=ADMIN)).json()
    assert r["supported"] and r["info"]["model"] == "MHDX 3104" and len(r["profiles"]) == 4
    assert all("@" not in p["rtsp"] for p in r["profiles"])
    out = (await api.post(f"/api/devices/{d['id']}/channels/sync", json={"profiles": [p["token"] for p in r["profiles"]]},
                          headers=ADMIN)).json()
    assert out == {"created": 2, "kept": 2}
    chs = (await api.get(f"/api/channels?device_id={d['id']}", headers=READ)).json()
    assert [c["name"] for c in chs][:1] == ["Caixa 1"]          # nome existente preservado
    assert chs[0]["rtsp_path"] == "/cam/realmonitor?channel=1&subtype=0"
    dev = (await api.get(f"/api/devices/{d['id']}", headers=READ)).json()
    assert dev["channels"] == 4 and dev["onvif"]["supported"] and dev["onvif"]["profiles"] == 8


async def test_configuracoes(api):
    r = await api.put("/api/settings", json={"poll_interval": 5}, headers=ADMIN)
    assert r.status_code == 422
    r = await api.put("/api/settings", json={"poll_interval": 120, "slack_notify": {"DVR_ONLINE": False}}, headers=ADMIN)
    s = r.json()
    assert s["poll_interval"] == 120 and s["slack_notify"]["DVR_ONLINE"] is False and s["slack_notify"]["DVR_OFFLINE"] is True
    assert s["slack_configured"] is True and "hooks.slack" not in r.text


async def test_painel_servido_em_modo_api(api):
    r = await api.get("/js/config.js")
    assert 'mode: "api"' in r.text
    r = await api.get("/")
    assert r.status_code == 200 and "Potencial" in r.text


async def test_inventario_embutido_sem_sistema_antigo(api):
    from app.legacy_import import seed_if_empty
    st = await seed_if_empty()
    assert (st["stores"]["created"], st["devices"]["created"], st["channels"]["created"]) == (31, 31, 141)
    assert await seed_if_empty() is None                     # não recarrega com dados existentes
    r = (await api.post("/api/admin/import-legacy?dry_run=false", headers=ADMIN)).json()   # sem corpo, sem LEGACY_API_URL
    assert r["devices"]["found"] == 31 and r["devices"]["created"] == 0
