"""Cliente RTSP mínimo (DESCRIBE) para validar rota e credenciais sem abrir vídeo.

É bem mais leve que o FFmpeg: só troca cabeçalhos. Suporta autenticação Basic e Digest (MD5).
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import os
import re
from dataclasses import dataclass
from urllib.parse import urlsplit


@dataclass
class DescribeResult:
    code: int | None            # código RTSP final (200, 401, 404...) ou None se não conectou
    reason: str = ""
    error: str = ""             # erro de rede
    sdp: str = ""

    @property
    def ok(self) -> bool:
        return self.code == 200

    @property
    def auth_failed(self) -> bool:
        return self.code in (401, 403)


def _parse_auth(header: str) -> tuple[str, dict[str, str]]:
    scheme, _, rest = header.partition(" ")
    params = dict(re.findall(r'(\w+)="?([^",]*)"?', rest))
    return scheme.lower(), params


def _digest(user: str, pw: str, method: str, uri: str, p: dict[str, str]) -> str:
    realm, nonce = p.get("realm", ""), p.get("nonce", "")
    ha1 = hashlib.md5(f"{user}:{realm}:{pw}".encode()).hexdigest()
    ha2 = hashlib.md5(f"{method}:{uri}".encode()).hexdigest()
    qop = p.get("qop", "")
    if "auth" in qop.split(","):
        nc, cnonce = "00000001", os.urandom(8).hex()
        resp = hashlib.md5(f"{ha1}:{nonce}:{nc}:{cnonce}:auth:{ha2}".encode()).hexdigest()
        return (f'Digest username="{user}", realm="{realm}", nonce="{nonce}", uri="{uri}", '
                f'response="{resp}", qop=auth, nc={nc}, cnonce="{cnonce}"'
                + (f', opaque="{p["opaque"]}"' if "opaque" in p else ""))
    resp = hashlib.md5(f"{ha1}:{nonce}:{ha2}".encode()).hexdigest()
    return (f'Digest username="{user}", realm="{realm}", nonce="{nonce}", uri="{uri}", response="{resp}"'
            + (f', opaque="{p["opaque"]}"' if "opaque" in p else ""))


async def _request(reader, writer, url: str, cseq: int, auth: str | None, timeout: float):
    lines = [f"DESCRIBE {url} RTSP/1.0", f"CSeq: {cseq}", "Accept: application/sdp", "User-Agent: PotencialCFTV/3"]
    if auth:
        lines.append(f"Authorization: {auth}")
    writer.write(("\r\n".join(lines) + "\r\n\r\n").encode())
    await writer.drain()
    head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=timeout)
    text = head.decode(errors="replace")
    first, *hdrs = text.split("\r\n")
    m = re.match(r"RTSP/1\.\d\s+(\d+)\s*(.*)", first)
    if not m:
        raise ValueError("resposta não é RTSP")
    headers: dict[str, list[str]] = {}
    for h in hdrs:
        if ":" in h:
            k, v = h.split(":", 1)
            headers.setdefault(k.strip().lower(), []).append(v.strip())
    body = b""
    clen = int((headers.get("content-length") or ["0"])[0] or 0)
    if clen:
        body = await asyncio.wait_for(reader.readexactly(clen), timeout=timeout)
    return int(m.group(1)), m.group(2), headers, body.decode(errors="replace")


async def describe(url: str, user: str | None, pw: str | None, timeout: float = 5.0) -> DescribeResult:
    """`url` sem credenciais (rtsp://host:porta/caminho)."""
    p = urlsplit(url)
    host, port = p.hostname or "", p.port or 554
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=timeout)
    except asyncio.TimeoutError:
        return DescribeResult(None, error=f"timeout de {timeout:g} s")
    except OSError as e:
        return DescribeResult(None, error=e.strerror or str(e))
    try:
        code, reason, headers, body = await _request(reader, writer, url, 1, None, timeout)
        if code == 401 and user:
            chal = headers.get("www-authenticate", [])
            digest = next((c for c in chal if c.lower().startswith("digest")), None)
            if digest:
                _, params = _parse_auth(digest)
                auth = _digest(user, pw or "", "DESCRIBE", url, params)
            else:
                auth = "Basic " + base64.b64encode(f"{user}:{pw or ''}".encode()).decode()
            code, reason, headers, body = await _request(reader, writer, url, 2, auth, timeout)
        return DescribeResult(code, reason, sdp=body if code == 200 else "")
    except (asyncio.TimeoutError, asyncio.IncompleteReadError):
        return DescribeResult(None, error="o DVR não respondeu ao RTSP")
    except (OSError, ValueError) as e:
        return DescribeResult(None, error=str(e))
    finally:
        writer.close()
        try:
            await asyncio.wait_for(writer.wait_closed(), timeout=1)
        except Exception:
            pass
