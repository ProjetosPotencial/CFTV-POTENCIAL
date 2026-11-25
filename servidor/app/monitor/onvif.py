"""Cliente ONVIF enxuto (SOAP 1.2 + WS-Security UsernameToken digest).

Não usa onvif-zeep para manter o container leve e controlar timeouts. Cobre o que o monitor precisa:
GetSystemDateAndTime (ajuste de relógio), GetDeviceInformation, GetCapabilities/GetServices,
Media GetVideoSources, GetProfiles e GetStreamUri.
Nem todo DVR suporta ONVIF; erros viram `OnvifError` com motivo legível.
"""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import os
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from urllib.parse import urlsplit

import httpx

NS = {
    "s": "http://www.w3.org/2003/05/soap-envelope",
    "tds": "http://www.onvif.org/ver10/device/wsdl",
    "trt": "http://www.onvif.org/ver10/media/wsdl",
    "tt": "http://www.onvif.org/ver10/schema",
}
WSSE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
WSU = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"
PW_DIGEST = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest"
NONCE_B64 = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary"


class OnvifError(Exception):
    def __init__(self, reason: str, kind: str = "unsupported"):
        super().__init__(reason)
        self.reason = reason
        self.kind = kind  # unsupported | auth | offline | error


@dataclass
class OnvifProfile:
    token: str
    name: str
    source_token: str
    channel: int
    encoding: str = ""
    resolution: str = ""
    fps: float | None = None
    rtsp_path: str = ""      # caminho+query, sem host nem credenciais
    rtsp_port: int | None = None


@dataclass
class OnvifResult:
    info: dict = field(default_factory=dict)
    profiles: list[OnvifProfile] = field(default_factory=list)
    media_url: str = ""
    clock_offset_s: float = 0.0


def _security_header(user: str, pw: str, offset_s: float) -> str:
    nonce = os.urandom(16)
    created = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=offset_s)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    digest = base64.b64encode(hashlib.sha1(nonce + created.encode() + pw.encode()).digest()).decode()
    u = user.replace("&", "&amp;").replace("<", "&lt;")
    return (f'<wsse:Security xmlns:wsse="{WSSE}" xmlns:wsu="{WSU}" s:mustUnderstand="1"><wsse:UsernameToken>'
            f"<wsse:Username>{u}</wsse:Username>"
            f'<wsse:Password Type="{PW_DIGEST}">{digest}</wsse:Password>'
            f'<wsse:Nonce EncodingType="{NONCE_B64}">{base64.b64encode(nonce).decode()}</wsse:Nonce>'
            f"<wsu:Created>{created}</wsu:Created></wsse:UsernameToken></wsse:Security>")


def _envelope(body: str, header: str = "") -> str:
    return (f'<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="{NS["s"]}" xmlns:tds="{NS["tds"]}" '
            f'xmlns:trt="{NS["trt"]}" xmlns:tt="{NS["tt"]}"><s:Header>{header}</s:Header><s:Body>{body}</s:Body></s:Envelope>')


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _find(el: ET.Element | None, name: str) -> ET.Element | None:
    if el is None:
        return None
    for x in el.iter():
        if _local(x.tag) == name:
            return x
    return None


def _findall(el: ET.Element, name: str) -> list[ET.Element]:
    return [x for x in el.iter() if _local(x.tag) == name]


def _text(el: ET.Element | None, name: str, default: str = "") -> str:
    x = _find(el, name)
    return (x.text or "").strip() if x is not None and x.text else default


class OnvifClient:
    def __init__(self, host: str, port: int, user: str | None, password: str | None, timeout: float = 5.0,
                 transport: httpx.AsyncBaseTransport | None = None):
        self.host, self.port = host, port
        self.user, self.password = user or "", password or ""
        self.timeout = timeout
        self.offset = 0.0
        self.device_url = f"http://{host}:{port}/onvif/device_service"
        self.media_url = ""
        self._client = httpx.AsyncClient(timeout=timeout, transport=transport, follow_redirects=False)

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        await self.close()

    def _fix_xaddr(self, xaddr: str) -> str:
        """DVR atrás de NAT/VPN costuma anunciar o IP interno; mantém o caminho e usa o host que alcançamos."""
        p = urlsplit(xaddr)
        return f"http://{self.host}:{self.port}{p.path or '/onvif/device_service'}"

    async def call(self, url: str, body: str, auth: bool = True) -> ET.Element:
        header = _security_header(self.user, self.password, self.offset) if auth and self.user else ""
        data = _envelope(body, header)
        try:
            r = await self._client.post(url, content=data.encode(),
                                        headers={"Content-Type": "application/soap+xml; charset=utf-8"})
        except httpx.ConnectError as e:
            raise OnvifError(f"porta ONVIF {self.port} não respondeu ({e.__class__.__name__})", "offline") from e
        except httpx.TimeoutException as e:
            raise OnvifError(f"ONVIF sem resposta em {self.timeout:g} s", "offline") from e
        except httpx.HTTPError as e:
            raise OnvifError(f"erro HTTP no ONVIF: {e.__class__.__name__}", "error") from e
        if r.status_code in (401, 403):
            raise OnvifError("ONVIF recusou usuário/senha", "auth")
        try:
            root = ET.fromstring(r.content)
        except ET.ParseError as e:
            if r.status_code == 404:
                raise OnvifError("o equipamento não tem serviço ONVIF neste endereço (404)") from e
            raise OnvifError(f"resposta não é ONVIF (HTTP {r.status_code})") from e
        fault = _find(root, "Fault")
        if fault is not None:
            txt = " ".join((x.text or "") for x in fault.iter() if x.text).strip()
            if re.search(r"NotAuthorized|not authorized|Sender not Authorized|FailedAuthentication|Unauthorized", txt, re.I):
                raise OnvifError("ONVIF recusou usuário/senha", "auth")
            if re.search(r"ActionNotSupported|not supported|NoProfile", txt, re.I):
                raise OnvifError("operação ONVIF não suportada pelo equipamento: " + txt[:120])
            raise OnvifError("falha ONVIF: " + txt[:160], "error")
        return root

    async def sync_clock(self) -> None:
        try:
            root = await self.call(self.device_url, "<tds:GetSystemDateAndTime/>", auth=False)
        except OnvifError as e:
            if e.kind in ("offline",):
                raise
            return
        utc = _find(root, "UTCDateTime")
        if utc is None:
            return
        d, t = _find(utc, "Date"), _find(utc, "Time")
        try:
            dev = dt.datetime(int(_text(d, "Year")), int(_text(d, "Month")), int(_text(d, "Day")),
                              int(_text(t, "Hour")), int(_text(t, "Minute")), int(_text(t, "Second")), tzinfo=dt.timezone.utc)
            self.offset = (dev - dt.datetime.now(dt.timezone.utc)).total_seconds()
        except (ValueError, TypeError):
            pass

    async def device_information(self) -> dict:
        root = await self.call(self.device_url, "<tds:GetDeviceInformation/>")
        return {k.lower(): _text(root, k) for k in ("Manufacturer", "Model", "FirmwareVersion", "SerialNumber", "HardwareId")}

    async def find_media_service(self) -> str:
        try:
            root = await self.call(self.device_url, '<tds:GetCapabilities><tds:Category>Media</tds:Category></tds:GetCapabilities>')
            media = _find(root, "Media")
            x = _text(media, "XAddr")
            if x:
                return self._fix_xaddr(x)
        except OnvifError as e:
            if e.kind in ("auth", "offline"):
                raise
        root = await self.call(self.device_url, "<tds:GetServices><tds:IncludeCapability>false</tds:IncludeCapability></tds:GetServices>")
        for svc in _findall(root, "Service"):
            if _text(svc, "Namespace") == NS["trt"]:
                return self._fix_xaddr(_text(svc, "XAddr"))
        raise OnvifError("o equipamento não informou o serviço de mídia ONVIF")

    async def video_sources(self) -> list[str]:
        root = await self.call(self.media_url, "<trt:GetVideoSources/>")
        return [vs.get("token", "") for vs in _findall(root, "VideoSources") if vs.get("token")]

    async def profiles(self) -> list[dict]:
        root = await self.call(self.media_url, "<trt:GetProfiles/>")
        out = []
        for p in _findall(root, "Profiles"):
            vsc = _find(p, "VideoSourceConfiguration")
            vec = _find(p, "VideoEncoderConfiguration")
            res = _find(vec, "Resolution")
            w, h = _text(res, "Width"), _text(res, "Height")
            fps = _text(_find(vec, "RateControl"), "FrameRateLimit")
            out.append({
                "token": p.get("token", ""), "name": _text(p, "Name"),
                "source_token": _text(vsc, "SourceToken"),
                "encoding": _text(vec, "Encoding").replace("H264", "H.264").replace("H265", "H.265"),
                "resolution": f"{w}x{h}" if w and h else "",
                "fps": float(fps) if fps.replace(".", "", 1).isdigit() else None,
            })
        return out

    async def stream_uri(self, token: str) -> str:
        body = ("<trt:GetStreamUri><trt:StreamSetup><tt:Stream>RTP-Unicast</tt:Stream><tt:Transport>"
                "<tt:Protocol>RTSP</tt:Protocol></tt:Transport></trt:StreamSetup>"
                f"<trt:ProfileToken>{token}</trt:ProfileToken></trt:GetStreamUri>")
        root = await self.call(self.media_url, body)
        return _text(root, "Uri")

    async def discover(self) -> OnvifResult:
        await self.sync_clock()
        info = await self.device_information()
        self.media_url = await self.find_media_service()
        sources = await self.video_sources()
        raw = await self.profiles()
        if not raw:
            raise OnvifError("nenhum perfil de mídia ONVIF configurado no equipamento")
        order = {tok: i + 1 for i, tok in enumerate(sources)}
        for p in raw:
            if p["source_token"] and p["source_token"] not in order:
                order[p["source_token"]] = len(order) + 1
        profiles: list[OnvifProfile] = []
        for p in raw:
            uri = ""
            try:
                uri = await self.stream_uri(p["token"])
            except OnvifError as e:
                if e.kind == "auth":
                    raise
            parts = urlsplit(uri) if uri else None
            ch = order.get(p["source_token"], 0)
            m = re.search(r"[?&]channel=(\d+)", uri or "")
            if m:
                ch = int(m.group(1))
            profiles.append(OnvifProfile(
                token=p["token"], name=p["name"], source_token=p["source_token"], channel=ch,
                encoding=p["encoding"], resolution=p["resolution"], fps=p["fps"],
                rtsp_path=(parts.path + ("?" + parts.query if parts.query else "")) if parts else "",
                rtsp_port=parts.port if parts else None,
            ))
        return OnvifResult(info=info, profiles=profiles, media_url=self.media_url, clock_offset_s=round(self.offset, 1))


def main_profiles(profiles: list[OnvifProfile]) -> list[OnvifProfile]:
    """Um perfil por canal: o de maior resolução (stream principal)."""
    best: dict[int, OnvifProfile] = {}

    def area(p: OnvifProfile) -> int:
        try:
            w, h = p.resolution.split("x")
            return int(w) * int(h)
        except ValueError:
            return 0
    for p in profiles:
        if p.channel and (p.channel not in best or area(p) > area(best[p.channel])):
            best[p.channel] = p
    return [best[k] for k in sorted(best)]
