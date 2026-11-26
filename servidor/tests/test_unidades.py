import asyncio
import os

import pytest

from app.monitor import onvif, rtsp_describe, rtsp_probe, tcp, urls
from app.security import decrypt_secret, encrypt_secret, mask_text, mask_url, strip_credentials, with_credentials
from tests.fakes import FakeRtspDvr, onvif_handler


# ---------------------------------------------------------------- segurança
def test_criptografia_ida_e_volta():
    tok = encrypt_secret("s3nh@ forte")
    assert "s3nh@" not in tok
    assert decrypt_secret(tok) == "s3nh@ forte"


def test_mascara_credenciais():
    url = with_credentials("rtsp://10.0.0.5:554/cam/realmonitor?channel=1&subtype=1", "admin", "p@ss:w/rd")
    assert url.startswith("rtsp://admin:p%40ss%3Aw%2Frd@10.0.0.5:554/")
    assert mask_url(url) == "rtsp://***@10.0.0.5:554/cam/realmonitor?channel=1&subtype=1"
    assert "p@ss" not in mask_text(f"erro abrindo {url} com senha p@ss:w/rd", "p@ss:w/rd")
    assert strip_credentials("rtsp://u:p@1.2.3.4:554/a?b=1") == "rtsp://1.2.3.4:554/a?b=1"


def test_urls_por_fabricante():
    d = {"host": "10.1.1.1", "rtsp_port": 554, "manufacturer": "Intelbras", "rtsp_template": ""}
    assert urls.public_url(d, {"number": 3, "rtsp_path": ""}) == "rtsp://10.1.1.1:554/cam/realmonitor?channel=3&subtype=1"
    d["manufacturer"] = "Hikvision"
    assert urls.public_url(d, {"number": 2, "rtsp_path": ""}, substream=False).endswith("/Streaming/Channels/201")
    assert urls.public_url(d, {"number": 2, "rtsp_path": "/cam/realmonitor?channel=2&subtype=0"}).endswith("subtype=1")


# ---------------------------------------------------------------- análise de quadros
def test_quadros_uniformes_sao_sem_video():
    raw = bytes([16]) * rtsp_probe.FRAME * 3
    st, detail, n, _ = rtsp_probe.analyse_frames(raw, True)
    assert st == "SEM_VIDEO" and "preta" in detail and n == 3


def test_quadros_identicos_sao_congelados():
    frame = os.urandom(rtsp_probe.FRAME)
    st, detail, _, _ = rtsp_probe.analyse_frames(frame * 3, True)
    assert st == "SEM_VIDEO" and "congelada" in detail
    st, _, _, _ = rtsp_probe.analyse_frames(frame * 3, False)
    assert st == "TRANSMITINDO"


def test_quadros_vivos():
    raw = b"".join(os.urandom(rtsp_probe.FRAME) for _ in range(3))
    assert rtsp_probe.analyse_frames(raw, True)[0] == "TRANSMITINDO"
    assert rtsp_probe.analyse_frames(b"", True)[0] == "SEM_VIDEO"


@pytest.mark.parametrize("stderr,status", [
    ("[rtsp @ 0x1] method DESCRIBE failed: 401 Unauthorized", "ERRO_AUTENTICACAO"),
    ("[rtsp @ 0x1] method DESCRIBE failed: 404 Not Found", "SEM_VIDEO"),
    ("rtsp://x: Connection refused", "OFFLINE"),
    ("rtsp://x: Connection timed out", "OFFLINE"),
])
def test_classifica_erros_ffmpeg(stderr, status):
    assert rtsp_probe._classify_error(stderr)[0] == status


def test_le_info_do_fluxo():
    s = "  Stream #0:0: Video: h264 (High), yuvj420p(pc, bt709, progressive), 1920x1080, 15 fps, 15 tbr, 90k tbn"
    assert rtsp_probe._stream_info(s) == ("H.264", "1920x1080", 15.0)


@pytest.fixture
def lavfi(monkeypatch):
    """Troca a entrada RTSP por fontes sintéticas do FFmpeg (mesmo pipeline de decodificação)."""
    sources = {
        "vivo": "testsrc2=size=640x360:rate=10",
        "preto": "color=c=black:size=640x360:rate=10",
        "congelado": "testsrc2=size=640x360:rate=10,trim=end_frame=1,loop=loop=-1:size=1",
    }
    monkeypatch.setattr(rtsp_probe, "input_args", lambda url, t: ["-re", "-f", "lavfi", "-i", sources[url]])
    return sources


async def test_ffmpeg_transmitindo(lavfi):
    r = await rtsp_probe.probe("vivo", 10)
    assert r.status == "TRANSMITINDO", r.detail
    assert r.resolution == "640x360" and r.frames == 3 and r.frame_hash


async def test_ffmpeg_tela_preta(lavfi):
    r = await rtsp_probe.probe("preto", 10)
    assert r.status == "SEM_VIDEO" and "preta" in r.detail


async def test_ffmpeg_congelado(lavfi):
    r = await rtsp_probe.probe("congelado", 10)
    assert r.status == "SEM_VIDEO" and "congelada" in r.detail


async def test_ffmpeg_grava_foto_na_mesma_conexao(lavfi, tmp_path):
    foto = tmp_path / "1.tmp.jpg"
    r = await rtsp_probe.probe("vivo", 10, snapshot_path=str(foto))
    assert r.status == "TRANSMITINDO", r.detail
    data = foto.read_bytes()
    assert data[:2] == b"\xff\xd8" and len(data) > 1000   # JPEG
    sem = await rtsp_probe.probe("vivo", 10)
    assert sem.status == "TRANSMITINDO"
    assert "image2" not in rtsp_probe.build_args("vivo", 5)


async def test_ffmpeg_rtsp_sem_servidor():
    r = await rtsp_probe.probe("rtsp://127.0.0.1:9/cam", 3)
    assert r.status == "OFFLINE"


# ---------------------------------------------------------------- RTSP DESCRIBE / TCP
async def test_rtsp_describe_digest():
    dvr = await FakeRtspDvr().start()
    try:
        url = f"rtsp://127.0.0.1:{dvr.port}/cam/realmonitor?channel=1&subtype=1"
        assert (await rtsp_describe.describe(url, "admin", "senha123", 3)).code == 200
        bad = await rtsp_describe.describe(url, "admin", "errada", 3)
        assert bad.code == 401 and bad.auth_failed
    finally:
        await dvr.stop()
    off = await rtsp_describe.describe("rtsp://127.0.0.1:9/x", "a", "b", 2)
    assert off.code is None and off.error


async def test_tcp_check():
    dvr = await FakeRtspDvr().start()
    try:
        r = await tcp.tcp_check("127.0.0.1", dvr.port, 2, 3, pause=0, stop_on_success=True)
        assert r.ok and r.attempts == 1 and r.latency_ms is not None
    finally:
        await dvr.stop()
    r = await tcp.tcp_check("127.0.0.1", 9, 1, 2, pause=0)
    assert not r.ok and r.attempts == 2


# ---------------------------------------------------------------- ONVIF
async def test_onvif_descoberta():
    async with onvif.OnvifClient("10.0.0.5", 80, "admin", "senha123", transport=onvif_handler()) as c:
        res = await c.discover()
    assert res.info["manufacturer"] == "Intelbras" and res.info["serialnumber"] == "OSVH2005814WJ"
    assert len(res.profiles) == 8
    mains = onvif.main_profiles(res.profiles)
    assert [p.channel for p in mains] == [1, 2, 3, 4]
    assert mains[0].resolution == "1920x1080" and mains[0].rtsp_path == "/cam/realmonitor?channel=1&subtype=0"
    assert res.media_url == "http://10.0.0.5:80/onvif/media_service"   # IP interno anunciado foi trocado


async def test_onvif_senha_errada():
    with pytest.raises(onvif.OnvifError) as e:
        async with onvif.OnvifClient("10.0.0.5", 80, "admin", "errada", transport=onvif_handler()) as c:
            await c.discover()
    assert e.value.kind == "auth"
