"""Validação da entrada da API. Campos extras enviados pelo painel (status, has_password...) são ignorados."""
from __future__ import annotations

import ipaddress
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

HOST_RE = re.compile(r"^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.?$")
SERIAL_RE = re.compile(r"^[A-Za-z0-9._\-/ ]{1,40}$")


def _clean(v):
    return v.strip() if isinstance(v, str) else v


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


class StoreIn(_Base):
    name: str = Field(min_length=1, max_length=80)
    code: str = Field("", max_length=20)
    city: str = Field("", max_length=80)
    notes: str = Field("", max_length=500)


class DeviceIn(_Base):
    store_id: int = Field(gt=0)
    manufacturer: str = Field("", max_length=40)
    model: str = Field("", max_length=60)
    serial: str = Field(min_length=1, max_length=40)
    host: str | None = Field(None, max_length=253)
    port: int = Field(37777, ge=1, le=65535)
    rtsp_port: int = Field(554, ge=1, le=65535)
    onvif_port: int = Field(80, ge=1, le=65535)
    mode: str = Field("", max_length=30)
    protocol: str = Field("", max_length=30)
    username: str = Field("", max_length=64)
    password: str | None = Field(None, max_length=128)   # só quando o usuário digitou uma nova
    clear_password: bool = False
    channels: int = Field(0, ge=0, le=128)
    poll_interval: int | None = Field(None, ge=15, le=3600)
    rtsp_template: str = Field("", max_length=200)

    @field_validator("host")
    @classmethod
    def _host(cls, v):
        v = _clean(v)
        if not v:
            return None
        try:
            ipaddress.ip_address(v)
            return v
        except ValueError:
            pass
        if not HOST_RE.match(v):
            raise ValueError("IP ou hostname inválido")
        return v.lower()

    @field_validator("serial")
    @classmethod
    def _serial(cls, v):
        if not SERIAL_RE.match(v):
            raise ValueError("número de série com caracteres inválidos")
        return v.upper()

    @field_validator("rtsp_template")
    @classmethod
    def _tpl(cls, v):
        if v and (not v.startswith("/") or "@" in v or "://" in v):
            raise ValueError("o modelo RTSP deve ser só o caminho, ex.: /cam/realmonitor?channel={n}&subtype={sub}")
        return v

    @field_validator("poll_interval", mode="before")
    @classmethod
    def _pi(cls, v):
        return None if v in ("", 0, None) else v


class ChannelIn(_Base):
    device_id: int = Field(gt=0)
    number: int = Field(ge=1, le=256)
    name: str = Field(min_length=1, max_length=60)
    enabled: bool = True
    rtsp_path: str = Field("", max_length=300)

    @field_validator("rtsp_path")
    @classmethod
    def _path(cls, v):
        if v and (not v.startswith("/") or "@" in v or "://" in v):
            raise ValueError("informe só o caminho RTSP (sem host, usuário ou senha)")
        return v


class SyncIn(_Base):
    profiles: list[str] = Field(default_factory=list, max_length=256)
