"""Notificações no Slack (webhook em SLACK_WEBHOOK_URL).

- Cada falha abre um incidente; o Slack recebe 1 mensagem na abertura e 1 na recuperação.
- Lembretes da mesma falha só depois de `slack_repeat_minutes`.
- Se muitas falhas chegam no mesmo ciclo (ex.: queda da VPN do servidor), vira uma mensagem consolidada.
- O endereço do webhook nunca aparece em logs nem na API.
"""
from __future__ import annotations

import datetime as dt
import logging
from dataclasses import dataclass
from zoneinfo import ZoneInfo

import httpx

from ..config import get_config

log = logging.getLogger("cftv.slack")

ICON = {"DVR_OFFLINE": "🔴", "DVR_ONLINE": "🟢", "CANAL_SEM_VIDEO": "🟠", "CANAL_VOLTOU": "🟢",
        "AUTH_FALHA": "🔐", "SEM_COMUNICACAO": "⛔", "DVR_INSTAVEL": "🟡", "SLACK_TESTE": "🧪"}
TITLE = {"DVR_OFFLINE": "DVR offline", "DVR_ONLINE": "DVR voltou online", "CANAL_SEM_VIDEO": "Canal perdeu vídeo",
         "CANAL_VOLTOU": "Canal voltou a transmitir", "AUTH_FALHA": "Falha de autenticação",
         "SEM_COMUNICACAO": "Sem comunicação prolongada", "DVR_INSTAVEL": "DVR instável", "SLACK_TESTE": "Teste"}
CONSOLIDATE_AT = 6


@dataclass
class Notice:
    type: str
    store: str
    target: str          # "DVR SERIAL" ou "DVR SERIAL · Canal 3 (Caixa)"
    text: str
    reminder: bool = False


def fmt_local(ts: dt.datetime | None) -> str:
    if not ts:
        return ""
    return ts.astimezone(ZoneInfo(get_config().display_tz)).strftime("%d/%m %H:%M")


def fmt_duration(seconds: int | float | None) -> str:
    if seconds is None:
        return ""
    s = int(seconds)
    d, s = divmod(s, 86400)
    h, s = divmod(s, 3600)
    m, s = divmod(s, 60)
    parts = [f"{d}d" if d else "", f"{h}h" if h else "", f"{m}min" if m and not d else "", f"{s}s" if not (d or h or m) else ""]
    return " ".join(p for p in parts if p)


def render(n: Notice) -> str:
    pre = "Lembrete · " if n.reminder else ""
    return f"{ICON.get(n.type, '•')} *{pre}{TITLE.get(n.type, n.type)}* — {n.store} · {n.target}\n{n.text}"


async def post(text: str) -> tuple[bool, str]:
    url = get_config().slack_webhook_url
    if not url:
        return False, "Webhook do Slack não configurado no servidor (SLACK_WEBHOOK_URL)."
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(url, json={"text": text})
        if r.status_code == 200:
            return True, "Mensagem enviada ao Slack."
        return False, f"Slack respondeu HTTP {r.status_code}."
    except httpx.HTTPError as e:
        return False, f"Falha ao falar com o Slack ({e.__class__.__name__})."


async def dispatch(notices: list[Notice]) -> None:
    if not notices or not get_config().slack_webhook_url:
        return
    by_type: dict[str, list[Notice]] = {}
    for n in notices:
        by_type.setdefault(n.type, []).append(n)
    messages: list[str] = []
    for t, items in by_type.items():
        if len(items) >= CONSOLIDATE_AT:
            lines = "\n".join(f"• {n.store} · {n.target}" for n in items[:40])
            more = f"\n… e mais {len(items) - 40}" if len(items) > 40 else ""
            hint = ("\n_Muitos equipamentos ao mesmo tempo: verifique a VPN/rede do servidor antes das lojas._"
                    if t in ("DVR_OFFLINE", "SEM_COMUNICACAO") else "")
            messages.append(f"{ICON.get(t, '•')} *{TITLE.get(t, t)}: {len(items)} ocorrências*\n{lines}{more}{hint}")
        else:
            messages.extend(render(n) for n in items)
    for m in messages:
        ok, msg = await post(m)
        if not ok:
            log.warning("Slack: %s", msg)
