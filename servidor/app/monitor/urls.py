"""Montagem das URLs RTSP dos canais (credenciais só em memória)."""
from __future__ import annotations

from ..security import with_credentials

# Caminhos conhecidos por fabricante. {n} = canal; {sub} = 0 principal / 1 extra; {hik} = 101/102...
TEMPLATES = {
    "intelbras": "/cam/realmonitor?channel={n}&subtype={sub}",
    "dahua": "/cam/realmonitor?channel={n}&subtype={sub}",
    "hikvision": "/Streaming/Channels/{hik}",
    "jfl": "/cam/realmonitor?channel={n}&subtype={sub}",
    "giga": "/cam/realmonitor?channel={n}&subtype={sub}",
}
DEFAULT_TEMPLATE = TEMPLATES["intelbras"]  # base atual é Intelbras MHDX (porta 37777)


def template_for(device: dict) -> str:
    if device.get("rtsp_template"):
        return device["rtsp_template"]
    return TEMPLATES.get((device.get("manufacturer") or "").strip().lower(), DEFAULT_TEMPLATE)


def channel_path(device: dict, channel: dict, substream: bool = True) -> str:
    if channel.get("rtsp_path"):
        path = channel["rtsp_path"]
        if substream and "subtype=0" in path:
            path = path.replace("subtype=0", "subtype=1")
        return path
    n = int(channel["number"])
    sub = 1 if substream else 0
    return template_for(device).format(n=n, sub=sub, hik=f"{n}{'02' if substream else '01'}")


def channel_url(device: dict, channel: dict, user: str | None, password: str | None, substream: bool = True) -> str:
    path = channel_path(device, channel, substream)
    if not path.startswith("/"):
        path = "/" + path
    host = device["host"]
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    base = f"rtsp://{host}:{device.get('rtsp_port') or 554}{path}"
    return with_credentials(base, user, password)


def public_url(device: dict, channel: dict, substream: bool = True) -> str:
    """URL exibível: sem credenciais."""
    return channel_url(device, channel, None, None, substream)
