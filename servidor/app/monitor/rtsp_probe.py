"""Verificação de vídeo real de um canal via FFmpeg.

Abre o fluxo RTSP (TCP), decodifica poucos quadros reduzidos (160x90, tons de cinza, 1 fps) e decide:
  TRANSMITINDO        quadros decodificados e com conteúdo
  SEM_VIDEO           conectou mas não veio quadro, ou imagem uniforme (tela de "sem sinal"), ou congelada
  OFFLINE             RTSP sem rota/sem resposta
  ERRO_AUTENTICACAO   401/403
A URL com credenciais só existe em memória e nunca é logada (ver security.mask_text).
"""
from __future__ import annotations

import asyncio
import hashlib
import re
import statistics
from dataclasses import dataclass, field

from ..security import mask_url

W, H = 160, 90
FRAME = W * H
UNIFORM_STDDEV = 3.0


@dataclass
class ProbeResult:
    status: str
    detail: str
    frames: int = 0
    codec: str = ""
    resolution: str = ""
    fps: float | None = None
    frame_hash: str = ""
    steps: list[dict] = field(default_factory=list)


def _classify_error(stderr: str) -> tuple[str, str] | None:
    s = stderr.lower()
    if "401" in s and "unauthorized" in s or "403 forbidden" in s:
        return "ERRO_AUTENTICACAO", "RTSP recusou usuário/senha (401)"
    if "404" in s and "not found" in s or "stream not found" in s:
        return "SEM_VIDEO", "o DVR respondeu, mas este canal não existe ou está desabilitado (404)"
    for pat, msg in (("connection refused", "porta RTSP recusou a conexão"),
                     ("no route to host", "sem rota até o DVR"),
                     ("network is unreachable", "rede inalcançável"),
                     ("connection timed out", "conexão RTSP expirou"),
                     ("operation timed out", "conexão RTSP expirou"),
                     ("name or service not known", "hostname não resolvido"),
                     ("temporary failure in name resolution", "falha de DNS")):
        if pat in s:
            return "OFFLINE", msg
    return None


def _stream_info(stderr: str) -> tuple[str, str, float | None]:
    codec = res = ""
    fps = None
    for line in stderr.splitlines():
        if "Video:" in line and "Stream #" in line:
            m = re.search(r"Video:\s*([A-Za-z0-9_]+)", line)
            codec = (m.group(1) if m else "").upper().replace("H264", "H.264").replace("HEVC", "H.265")
            m = re.search(r",\s*(\d{2,5})x(\d{2,5})", line)
            if m:
                res = f"{m.group(1)}x{m.group(2)}"
            m = re.search(r"([\d.]+)\s*fps", line)
            if m:
                try:
                    fps = round(float(m.group(1)), 1)
                except ValueError:
                    pass
            break
    return codec, res, fps


def analyse_frames(raw: bytes, freeze_detection: bool, previous_hash: str = "") -> tuple[str, str, int, str]:
    n = len(raw) // FRAME
    frames = [raw[i * FRAME:(i + 1) * FRAME] for i in range(n)]
    if not frames:
        return "SEM_VIDEO", "nenhum quadro de vídeo recebido", 0, ""
    last_hash = hashlib.sha1(frames[-1]).hexdigest()[:16]
    stds = [statistics.pstdev(f[::4]) for f in frames]
    if max(stds) < UNIFORM_STDDEV:
        mean = statistics.mean(frames[-1][::4])
        tone = "preta" if mean < 40 else "uniforme"
        return "SEM_VIDEO", f"imagem {tone} (provável tela de sem sinal da câmera)", n, last_hash
    if freeze_detection:
        hashes = {hashlib.sha1(f).hexdigest() for f in frames}
        if n >= 3 and len(hashes) == 1:
            return "SEM_VIDEO", f"imagem congelada ({n} quadros idênticos)", n, last_hash
        if n >= 1 and previous_hash and len(hashes) == 1 and last_hash == previous_hash:
            return "SEM_VIDEO", "imagem congelada (idêntica à verificação anterior)", n, last_hash
    return "TRANSMITINDO", f"{n} quadros decodificados", n, last_hash


def input_args(url: str, timeout_s: float) -> list[str]:
    return ["-rtsp_transport", "tcp", "-timeout", str(int(timeout_s * 1_000_000)),
            "-analyzeduration", "2000000", "-probesize", "1000000", "-i", url]


def build_args(url: str, timeout_s: float, ffmpeg: str = "ffmpeg", frames: int = 3) -> list[str]:
    return [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "info", *input_args(url, timeout_s),
            "-an", "-sn", "-dn", "-vf", f"fps=1,scale={W}:{H}:flags=area,format=gray",
            "-frames:v", str(frames), "-f", "rawvideo", "pipe:1"]


async def probe(url: str, timeout_s: float, freeze_detection: bool = True, previous_hash: str = "",
                ffmpeg: str = "ffmpeg", frames: int = 3) -> ProbeResult:
    args = build_args(url, timeout_s, ffmpeg, frames)
    try:
        proc = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    except FileNotFoundError:
        return ProbeResult("NAO_VERIFICADO", "FFmpeg não está instalado no container")
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout_s + frames + 5)
    except asyncio.TimeoutError:
        proc.kill()
        out, err = await proc.communicate()
        if not out:
            st = _classify_error(err.decode(errors="replace"))
            if st:
                return ProbeResult(st[0], st[1])
            connected = b"Stream #" in err
            return ProbeResult("SEM_VIDEO" if connected else "OFFLINE",
                               f"nenhum quadro em {timeout_s:g} s" if connected else f"RTSP sem resposta em {timeout_s:g} s")
    stderr = err.decode(errors="replace")
    codec, res, fps = _stream_info(stderr)
    if not out:
        st = _classify_error(stderr)
        if st:
            return ProbeResult(st[0], st[1], codec=codec, resolution=res, fps=fps)
        if "Stream #" in stderr:
            return ProbeResult("SEM_VIDEO", f"o fluxo abriu mas nenhum quadro foi decodificado em {timeout_s:g} s",
                               codec=codec, resolution=res, fps=fps)
        tail = stderr.strip().splitlines()[-1:] or ["sem saída"]
        return ProbeResult("OFFLINE", "falha ao abrir o RTSP: " + mask_url(tail[0])[:160])
    status, detail, n, h = analyse_frames(out, freeze_detection, previous_hash)
    return ProbeResult(status, detail, n, codec, res, fps, h)
