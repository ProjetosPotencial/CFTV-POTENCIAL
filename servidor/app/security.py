"""Credenciais, tokens e mascaramento.

- Senhas dos DVRs: Fernet (AES-128-CBC + HMAC-SHA256) com chave em CFTV_SECRET_KEY.
  É reversível de propósito: o servidor precisa da senha para autenticar no DVR.
- Nenhuma função daqui devolve senha para a API; só `has_password`.
- `mask_url` remove usuário/senha de URLs RTSP antes de logar ou responder.
"""
from __future__ import annotations

import hmac
import re
from urllib.parse import quote, urlsplit, urlunsplit

from cryptography.fernet import Fernet, InvalidToken
from fastapi import Header, HTTPException, Request

from .config import get_config


class CredentialError(RuntimeError):
    pass


def _fernet() -> Fernet:
    key = get_config().secret_key
    if not key:
        raise CredentialError("CFTV_SECRET_KEY não definida: não é possível guardar ou usar senhas de DVR.")
    try:
        return Fernet(key.encode())
    except Exception as exc:  # chave mal formada
        raise CredentialError("CFTV_SECRET_KEY inválida (gere com: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\").") from exc


def encrypt_secret(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_secret(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise CredentialError("Senha do DVR não pôde ser lida com a chave atual (CFTV_SECRET_KEY trocada?).") from exc


_CRED_RE = re.compile(r"(rtsp|rtsps|http|https)://[^/@\s]*@", re.I)


def mask_url(url: str | None) -> str:
    if not url:
        return ""
    return _CRED_RE.sub(lambda m: f"{m.group(1)}://***@", url)


def mask_text(text: str | None, *secrets: str | None) -> str:
    """Mascara URLs com credenciais e qualquer segredo literal em mensagens de erro."""
    out = mask_url(text or "")
    for s in secrets:
        if s and len(s) >= 3:
            out = out.replace(s, "***")
            out = out.replace(quote(s, safe=""), "***")
    return out


def strip_credentials(url: str) -> str:
    """Devolve a URL sem userinfo (para guardar caminhos RTSP vindos do ONVIF)."""
    p = urlsplit(url)
    host = p.hostname or ""
    if p.port:
        host = f"{host}:{p.port}"
    return urlunsplit((p.scheme, host, p.path, p.query, p.fragment))


def with_credentials(url: str, user: str | None, password: str | None) -> str:
    if not user:
        return url
    p = urlsplit(url)
    host = p.hostname or ""
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    if p.port:
        host = f"{host}:{p.port}"
    auth = quote(user, safe="") + (":" + quote(password, safe="") if password else "")
    return urlunsplit((p.scheme, f"{auth}@{host}", p.path, p.query, p.fragment))


# ---------------------------------------------------------------- autenticação da API

def _token_from(request: Request, authorization: str | None) -> str:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return request.headers.get("x-api-key", "").strip()


def _eq(a: str, b: str) -> bool:
    return bool(a) and bool(b) and hmac.compare_digest(a.encode(), b.encode())


async def require_read(request: Request, authorization: str | None = Header(default=None)) -> str:
    cfg = get_config()
    tok = _token_from(request, authorization)
    if _eq(tok, cfg.admin_token):
        return "admin"
    if _eq(tok, cfg.read_token):
        return "read"
    if cfg.allow_anonymous_read:
        return "anon"
    raise HTTPException(status_code=401, detail="Token ausente ou inválido.")


async def require_admin(request: Request, authorization: str | None = Header(default=None)) -> str:
    cfg = get_config()
    if not cfg.admin_token:
        raise HTTPException(status_code=503, detail="API_ADMIN_TOKEN não configurado no servidor: alterações estão bloqueadas.")
    tok = _token_from(request, authorization)
    if _eq(tok, cfg.admin_token):
        return "admin"
    if _eq(tok, cfg.read_token):
        raise HTTPException(status_code=403, detail="Este token só tem permissão de leitura.")
    raise HTTPException(status_code=401, detail="Token ausente ou inválido.")
