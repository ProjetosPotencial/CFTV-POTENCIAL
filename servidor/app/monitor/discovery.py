"""Descoberta automática ONVIF (WS-Discovery, multicast UDP 239.255.255.250:3702).

Limitação importante: multicast só alcança a rede local do servidor. DVRs em outras lojas
(VPN roteada, Tailscale, P2P/Relay) normalmente NÃO respondem; para eles use a descoberta manual
pelo IP (POST /api/devices/{id}/onvif/discover).
"""
from __future__ import annotations

import asyncio
import re
import socket
import uuid
from urllib.parse import urlsplit

PROBE = ('<?xml version="1.0" encoding="UTF-8"?>'
         '<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" '
         'xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" '
         'xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" '
         'xmlns:dn="http://www.onvif.org/ver10/network/wsdl">'
         '<e:Header><w:MessageID>uuid:{id}</w:MessageID><w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>'
         '<w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header>'
         '<e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>')


class _Proto(asyncio.DatagramProtocol):
    def __init__(self):
        self.found: dict[str, dict] = {}

    def datagram_received(self, data: bytes, addr):
        txt = data.decode(errors="replace")
        xaddrs = re.findall(r"<[^>]*XAddrs>([^<]+)<", txt)
        scopes = " ".join(re.findall(r"<[^>]*Scopes>([^<]+)<", txt))
        urls = xaddrs[0].split() if xaddrs else []
        host = addr[0]
        port = 80
        for u in urls:
            p = urlsplit(u)
            if p.hostname == host:
                port = p.port or 80
                break
        else:
            if urls:
                port = urlsplit(urls[0]).port or 80

        def scope(key: str) -> str:
            m = re.search(rf"onvif://www\.onvif\.org/{key}/(\S+)", scopes)
            return m.group(1).replace("%20", " ") if m else ""
        self.found[host] = {"host": host, "onvif_port": port, "xaddrs": urls,
                            "name": scope("name"), "hardware": scope("hardware")}


async def ws_discovery(timeout: float = 3.0) -> list[dict]:
    loop = asyncio.get_running_loop()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    sock.bind(("", 0))
    transport, proto = await loop.create_datagram_endpoint(_Proto, sock=sock)
    try:
        msg = PROBE.format(id=uuid.uuid4()).encode()
        for _ in range(2):
            transport.sendto(msg, ("239.255.255.250", 3702))
            await asyncio.sleep(0.3)
        await asyncio.sleep(timeout)
    finally:
        transport.close()
    return sorted(proto.found.values(), key=lambda d: tuple(int(x) for x in d["host"].split(".") if x.isdigit()))
