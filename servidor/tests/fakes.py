"""Equipamentos simulados para os testes (sem rede externa)."""
from __future__ import annotations

import asyncio
import hashlib
import re


class FakeRtspDvr:
    """Servidor RTSP mínimo: responde DESCRIBE com desafio Digest e valida a senha."""

    def __init__(self, user="admin", password="senha123", realm="Login to FAKEDVR", nonce="0a1b2c3d"):
        self.user, self.password, self.realm, self.nonce = user, password, realm, nonce
        self.server: asyncio.base_events.Server | None = None
        self.port = 0
        self.connections = 0
        self.auth_attempts = 0

    async def start(self, port: int = 0):
        self.server = await asyncio.start_server(self._handle, "127.0.0.1", port)
        self.port = self.server.sockets[0].getsockname()[1]
        return self

    async def stop(self):
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            self.server = None

    def _valid(self, auth: str, uri: str) -> bool:
        p = dict(re.findall(r'(\w+)="?([^",]*)"?', auth))
        ha1 = hashlib.md5(f"{self.user}:{self.realm}:{self.password}".encode()).hexdigest()
        ha2 = hashlib.md5(f"DESCRIBE:{p.get('uri', uri)}".encode()).hexdigest()
        if p.get("qop"):
            exp = hashlib.md5(f"{ha1}:{self.nonce}:{p['nc']}:{p['cnonce']}:auth:{ha2}".encode()).hexdigest()
        else:
            exp = hashlib.md5(f"{ha1}:{self.nonce}:{ha2}".encode()).hexdigest()
        return p.get("username") == self.user and p.get("response") == exp

    async def _handle(self, reader, writer):
        self.connections += 1
        try:
            while True:
                head = await reader.readuntil(b"\r\n\r\n")
                lines = head.decode().split("\r\n")
                method, uri, _ = lines[0].split(" ", 2)
                hdr = {k.strip().lower(): v.strip() for k, v in (l.split(":", 1) for l in lines[1:] if ":" in l)}
                cseq = hdr.get("cseq", "1")
                auth = hdr.get("authorization")
                if auth:
                    self.auth_attempts += 1
                if auth and self._valid(auth, uri):
                    sdp = "v=0\r\nm=video 0 RTP/AVP 96\r\n"
                    writer.write(f"RTSP/1.0 200 OK\r\nCSeq: {cseq}\r\nContent-Type: application/sdp\r\nContent-Length: {len(sdp)}\r\n\r\n{sdp}".encode())
                else:
                    writer.write(f'RTSP/1.0 401 Unauthorized\r\nCSeq: {cseq}\r\nWWW-Authenticate: Digest realm="{self.realm}", nonce="{self.nonce}"\r\n\r\n'.encode())
                await writer.drain()
        except (asyncio.IncompleteReadError, ConnectionError, ValueError):
            pass
        finally:
            writer.close()


def onvif_handler(user="admin", password="senha123", channels=4):
    """Transporte httpx simulando um DVR Intelbras/Dahua com ONVIF."""
    import base64
    import httpx

    def ok(body: str) -> httpx.Response:
        return httpx.Response(200, content=(
            '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" '
            'xmlns:tds="http://www.onvif.org/ver10/device/wsdl" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" '
            f'xmlns:tt="http://www.onvif.org/ver10/schema"><s:Body>{body}</s:Body></s:Envelope>').encode())

    def fault() -> httpx.Response:
        return httpx.Response(400, content=(
            '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:ter="http://www.onvif.org/ver10/error">'
            '<s:Body><s:Fault><s:Code><s:Value>s:Sender</s:Value><s:Subcode><s:Value>ter:NotAuthorized</s:Value></s:Subcode></s:Code>'
            '<s:Reason><s:Text>Sender not Authorized</s:Text></s:Reason></s:Fault></s:Body></s:Envelope>').encode())

    def authed(xml: str) -> bool:
        m = re.search(r"<wsse:Password[^>]*>([^<]+)<", xml)
        n = re.search(r"<wsse:Nonce[^>]*>([^<]+)<", xml)
        c = re.search(r"<wsu:Created>([^<]+)<", xml)
        u = re.search(r"<wsse:Username>([^<]+)<", xml)
        if not (m and n and c and u) or u.group(1) != user:
            return False
        exp = base64.b64encode(hashlib.sha1(base64.b64decode(n.group(1)) + c.group(1).encode() + password.encode()).digest()).decode()
        return exp == m.group(1)

    def handler(req: httpx.Request) -> httpx.Response:
        xml = req.content.decode()
        if "GetSystemDateAndTime" in xml:
            import datetime as dt
            n = dt.datetime.now(dt.timezone.utc)
            return ok(f"<tds:GetSystemDateAndTimeResponse><tds:SystemDateAndTime><tt:UTCDateTime><tt:Time><tt:Hour>{n.hour}</tt:Hour>"
                      f"<tt:Minute>{n.minute}</tt:Minute><tt:Second>{n.second}</tt:Second></tt:Time><tt:Date><tt:Year>{n.year}</tt:Year>"
                      f"<tt:Month>{n.month}</tt:Month><tt:Day>{n.day}</tt:Day></tt:Date></tt:UTCDateTime></tds:SystemDateAndTime>"
                      "</tds:GetSystemDateAndTimeResponse>")
        if not authed(xml):
            return fault()
        if "GetDeviceInformation" in xml:
            return ok("<tds:GetDeviceInformationResponse><tds:Manufacturer>Intelbras</tds:Manufacturer><tds:Model>MHDX 3104</tds:Model>"
                      "<tds:FirmwareVersion>4.001.0000000.3</tds:FirmwareVersion><tds:SerialNumber>OSVH2005814WJ</tds:SerialNumber>"
                      "<tds:HardwareId>1.00</tds:HardwareId></tds:GetDeviceInformationResponse>")
        if "GetCapabilities" in xml:
            return ok("<tds:GetCapabilitiesResponse><tds:Capabilities><tt:Media><tt:XAddr>http://10.9.9.9/onvif/media_service</tt:XAddr>"
                      "</tt:Media></tds:Capabilities></tds:GetCapabilitiesResponse>")
        if "GetVideoSources" in xml:
            src = "".join(f'<trt:VideoSources token="{i:03d}"><tt:Framerate>15</tt:Framerate></trt:VideoSources>' for i in range(channels))
            return ok(f"<trt:GetVideoSourcesResponse>{src}</trt:GetVideoSourcesResponse>")
        if "GetProfiles" in xml:
            ps = ""
            for i in range(channels):
                for sub, (w, h) in enumerate([(1920, 1080), (640, 480)]):
                    ps += (f'<trt:Profiles token="MediaProfile{i:02d}{sub}"><tt:Name>Perfil{i}{sub}</tt:Name>'
                           f'<tt:VideoSourceConfiguration token="V{i}"><tt:SourceToken>{i:03d}</tt:SourceToken></tt:VideoSourceConfiguration>'
                           f'<tt:VideoEncoderConfiguration><tt:Encoding>H264</tt:Encoding><tt:Resolution><tt:Width>{w}</tt:Width>'
                           f'<tt:Height>{h}</tt:Height></tt:Resolution><tt:RateControl><tt:FrameRateLimit>15</tt:FrameRateLimit></tt:RateControl>'
                           '</tt:VideoEncoderConfiguration></trt:Profiles>')
            return ok(f"<trt:GetProfilesResponse>{ps}</trt:GetProfilesResponse>")
        if "GetStreamUri" in xml:
            tok = re.search(r"<trt:ProfileToken>MediaProfile(\d\d)(\d)<", xml)
            ch, sub = int(tok.group(1)) + 1, int(tok.group(2))
            return ok(f"<trt:GetStreamUriResponse><trt:MediaUri><tt:Uri>rtsp://10.9.9.9:554/cam/realmonitor?channel={ch}&amp;subtype={sub}"
                      "</tt:Uri></trt:MediaUri></trt:GetStreamUriResponse>")
        return httpx.Response(400, content=b"?")
    return httpx.MockTransport(handler)
