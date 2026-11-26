// Login do painel Potencial CFTV (Vercel Routing Middleware).
//
// Roda no servidor da Vercel ANTES de qualquer arquivo ser entregue: sem sessão válida,
// nada do painel (HTML, JS com o inventário, fotos) sai para o navegador.
//
// Variáveis de ambiente (Vercel › Project › Settings › Environment Variables):
//   PAINEL_USUARIO / PAINEL_SENHA   usuário e senha de acesso (obrigatórias)
//   PAINEL_USUARIOS                 opcional, vários acessos: "joao:senha1,maria:senha2"
//   PAINEL_SEGREDO                  opcional, chave das sessões (openssl rand -hex 32). Trocar derruba todas as sessões.
//   PAINEL_SESSAO_HORAS             opcional, duração do login (padrão 12)
//   CFTV_API_URL / CFTV_API_TOKEN   opcional, URL HTTPS do monitor (Cloudflare Tunnel) e token da API.
//                                   Com elas, o painel chama /api/... na própria Vercel e o token
//                                   fica só aqui, nunca no navegador.
//
// Sem PAINEL_USUARIO/PAINEL_SENHA (nem PAINEL_USUARIOS) o painel fica BLOQUEADO (falha fechada).

export const config = {
  matcher: "/:path*",
};

const COOKIE = "cftv_sessao";
const enc = new TextEncoder();

function env(name) {
  return (process.env[name] || "").trim();
}

function users() {
  const list = new Map();
  for (const item of env("PAINEL_USUARIOS").split(",")) {
    const i = item.indexOf(":");
    if (i > 0) list.set(item.slice(0, i).trim(), item.slice(i + 1).trim());
  }
  if (env("PAINEL_USUARIO") && env("PAINEL_SENHA")) list.set(env("PAINEL_USUARIO"), env("PAINEL_SENHA"));
  for (const [u, p] of list) if (!u || !p) list.delete(u);
  return list;
}

function secret(list) {
  // Sem PAINEL_SEGREDO, a chave sai das próprias credenciais: trocar a senha derruba as sessões abertas.
  return env("PAINEL_SEGREDO") || "cftv:" + [...list].map(([u, p]) => u + ":" + p).sort().join("|");
}

function b64url(buf) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

// Comparação em tempo constante (compara os HMACs, que têm sempre o mesmo tamanho).
async function same(a, b) {
  const k = "cmp";
  const [x, y] = await Promise.all([hmac(k, String(a)), hmac(k, String(b))]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0 && x.length === y.length;
}

function cookies(request) {
  const out = {};
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

async function makeSession(user, list) {
  const hours = Math.min(Math.max(Number(env("PAINEL_SESSAO_HORAS")) || 12, 1), 24 * 30);
  const exp = Math.floor(Date.now() / 1000) + hours * 3600;
  const body = b64url(enc.encode(user)) + "." + exp;
  return { value: body + "." + (await hmac(secret(list), body)), maxAge: hours * 3600 };
}

async function readSession(request, list) {
  const raw = cookies(request)[COOKIE];
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [u64, exp, sig] = parts;
  if (!(Number(exp) > Date.now() / 1000)) return null;
  if (!(await same(sig, await hmac(secret(list), u64 + "." + exp)))) return null;
  let user;
  try {
    user = new TextDecoder().decode(Uint8Array.from(atob(u64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
  } catch (e) {
    return null;
  }
  return list.has(user) ? user : null; // usuário removido perde o acesso na hora
}

function cookieHeader(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

// Cookie só informativo (sem valor de segurança) para o painel mostrar "Conectado como ... · Sair".
function userCookie(user, maxAge) {
  return `cftv_usuario=${encodeURIComponent(user)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`;
}

function safeNext(v) {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") && !v.startsWith("/login") ? v : "/";
}

const NO_STORE = { "Cache-Control": "no-store", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function loginPage({ next = "/", error = "", status = 200 } = {}) {
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Entrar · Potencial CFTV</title><meta name="robots" content="noindex">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%23FFC400'/%3E%3Cpath d='M5 9h9l4-2v8l-4-2H5z' fill='%23371B01'/%3E%3C/svg%3E">
<style>
:root{--bg:#FAF7F2;--card:#fff;--ink:#2B1A0A;--muted:#7A6A58;--line:#E8DFD2;--brand:#FFC400;--brand-ink:#371B01;--bad:#B3261E;--bad-bg:#FCEDEC}
@media (prefers-color-scheme:dark){:root{--bg:#17110B;--card:#211910;--ink:#F5EEE4;--muted:#B5A693;--line:#3A2E22;--bad:#FFB4AB;--bad-bg:#3B1D1A}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:16px}
.card{width:100%;max-width:360px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:22px}.logo{width:36px;height:36px;border-radius:10px;background:var(--brand);color:var(--brand-ink);display:grid;place-items:center}
.brand b{display:block}.brand span{font-size:12px;color:var(--muted)}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 18px;color:var(--muted);font-size:13px}
label{display:block;font-size:13px;font-weight:600;margin:12px 0 6px}
input{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:transparent;color:inherit;font:inherit}
input:focus{outline:2px solid var(--brand);outline-offset:1px}
button{width:100%;margin-top:20px;padding:12px;border:0;border-radius:10px;background:var(--brand);color:var(--brand-ink);font:inherit;font-weight:700;cursor:pointer}
.err{background:var(--bad-bg);color:var(--bad);border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:6px}
</style></head><body>
<form class="card" method="post" action="/login">
  <div class="brand"><div class="logo"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h11l5-3v12l-5-3H3z"/><circle cx="8" cy="11" r="1.5"/></svg></div>
  <div><b>Grupo Potencial</b><span>CFTV • Monitoramento Central</span></div></div>
  <h1>Entrar no painel</h1><p>Acesso restrito à equipe autorizada.</p>
  ${error ? `<div class="err" role="alert">${esc(error)}</div>` : ""}
  <input type="hidden" name="next" value="${esc(next)}">
  <label for="u">Usuário</label><input id="u" name="usuario" autocomplete="username" required autofocus>
  <label for="p">Senha</label><input id="p" name="senha" type="password" autocomplete="current-password" required>
  <button type="submit">Entrar</button>
</form></body></html>`;
  return new Response(html, { status, headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" } });
}

function redirect(location, extra = {}) {
  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: location, ...extra } });
}

function json(status, detail, extra = {}) {
  return new Response(JSON.stringify({ detail }), { status, headers: { ...NO_STORE, "Content-Type": "application/json", ...extra } });
}

// Encaminha /api/... para o monitor (Cloudflare Tunnel) com o token guardado na Vercel.
async function proxyApi(request, url) {
  const base = env("CFTV_API_URL").replace(/\/+$/, "");
  if (!base) return null; // sem proxy configurado: segue o fluxo normal (404 da Vercel)
  if (!/^https:\/\//.test(base)) return json(500, "CFTV_API_URL precisa começar com https://");
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    // Proteção extra contra CSRF, além do SameSite=Lax do cookie.
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return json(403, "Origem não permitida.");
  }
  const headers = new Headers();
  for (const h of ["accept", "content-type", "if-none-match"]) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  const token = env("CFTV_API_TOKEN");
  if (token) headers.set("authorization", "Bearer " + token);
  let res;
  try {
    res = await fetch(base + url.pathname + url.search, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
      redirect: "manual",
    });
  } catch (e) {
    return json(502, "O painel não conseguiu falar com o monitor (CFTV_API_URL). Confira se o servidor e o túnel estão no ar.");
  }
  const out = new Headers();
  for (const h of ["content-type", "content-disposition", "etag", "last-modified"]) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("Cache-Control", "private, no-store");
  out.set("X-Content-Type-Options", "nosniff");
  return new Response(res.body, { status: res.status, headers: out });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const list = users();

  if (list.size === 0) {
    return new Response(
      "Painel bloqueado: configure PAINEL_USUARIO e PAINEL_SENHA nas variáveis de ambiente da Vercel e faça um novo deploy.",
      { status: 503, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  if (path === "/login" || path === "/login/") {
    if (request.method === "POST") {
      let form;
      try {
        form = await request.formData();
      } catch (e) {
        return loginPage({ error: "Não foi possível ler o formulário.", status: 400 });
      }
      const user = String(form.get("usuario") || "").trim();
      const pass = String(form.get("senha") || "");
      const next = safeNext(String(form.get("next") || "/"));
      const expected = list.get(user);
      // Compara sempre, mesmo com usuário inexistente, para não revelar quais usuários existem.
      const ok = (await same(pass, expected ?? "\u0000sem-usuario")) && expected !== undefined;
      if (!ok) {
        await new Promise((r) => setTimeout(r, 1200)); // freia tentativas em sequência
        return loginPage({ next, error: "Usuário ou senha incorretos.", status: 401 });
      }
      const s = await makeSession(user, list);
      const h = new Headers({ ...NO_STORE, Location: next });
      h.append("Set-Cookie", cookieHeader(s.value, s.maxAge));
      h.append("Set-Cookie", userCookie(user, s.maxAge));
      return new Response(null, { status: 303, headers: h });
    }
    if (await readSession(request, list)) return redirect(safeNext(url.searchParams.get("next") || "/"));
    return loginPage({ next: safeNext(url.searchParams.get("next") || "/") });
  }

  if (path === "/sair" || path === "/logout") {
    const h = new Headers({ ...NO_STORE, Location: "/login" });
    h.append("Set-Cookie", cookieHeader("", 0));
    h.append("Set-Cookie", userCookie("", 0));
    return new Response(null, { status: 303, headers: h });
  }

  const user = await readSession(request, list);
  if (!user) {
    if (path.startsWith("/api/")) return json(401, "Sessão expirada. Entre de novo no painel.", { "X-Painel-Login": "1" });
    const accept = request.headers.get("accept") || "";
    if (request.method === "GET" && (accept.includes("text/html") || path === "/" || path.endsWith(".html"))) {
      return redirect("/login" + (path !== "/" ? "?next=" + encodeURIComponent(path + url.search) : ""));
    }
    return new Response("Não autorizado.", { status: 401, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
  }

  if (path.startsWith("/api/")) {
    const res = await proxyApi(request, url);
    if (res) return res;
  }

  // Com o proxy ligado, o painel já abre conectado à API da própria Vercel.
  if (path === "/js/config.js" && env("CFTV_API_URL")) {
    const js = 'window.PCFTV_CONFIG = { mode: "api", apiBase: "", apiToken: "", refreshSeconds: 30, proxy: true };\n';
    return new Response(js, { headers: { ...NO_STORE, "Content-Type": "application/javascript; charset=utf-8" } });
  }

  // Sessão válida: segue para os arquivos do painel.
  return undefined;
}
