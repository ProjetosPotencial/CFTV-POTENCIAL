"""Conversão de linhas do banco para JSON público (sem segredos)."""
from __future__ import annotations


def device_out(d: dict) -> dict:
    out = {k: v for k, v in d.items() if k not in ("password_enc", "onvif", "fail_count", "legacy_id")}
    out["has_password"] = bool(d.get("password_enc"))
    out["store"] = d.get("store_name", "")
    out.pop("store_name", None)
    ov = d.get("onvif")
    if ov:
        out["onvif"] = {"supported": ov.get("supported", False), "firmware": (ov.get("info") or {}).get("firmware", ""),
                        "profiles": len(ov.get("profiles") or []), "checked_at": ov.get("checked_at"),
                        "reason": ov.get("reason", "")}
    else:
        out["onvif"] = None
    return out


def channel_out(c: dict) -> dict:
    out = {k: v for k, v in c.items() if k not in ("frame_hash", "legacy_id")}
    return out


def event_out(e: dict) -> dict:
    out = dict(e)
    out["store"] = out.pop("store_name", "")
    return out
