// Notificações enviadas pelos próprios DVRs (Vercel Function).
//
// Os DVRs Intelbras mandam e-mail quando algo acontece (perda de vídeo, erro de HD,
// rede, movimento...). Um encaminhador (ex.: Google Apps Script na caixa de e-mail que
// recebe os alertas, ver encaminhador/README.md) faz POST de cada e-mail aqui.
//
//   POST /api/dvr-eventos   recebe uma notificação. Exige o token DVR_WEBHOOK_TOKEN
//                           (cabeçalho "Authorization: Bearer ..." ou "X-DVR-Token").
//                           Não usa o login do painel (o middleware.js deixa passar).
//   GET  /api/dvr-eventos   lista as notificações para o painel (exige login do painel,
//                           conferido pelo middleware.js).
//
// Variáveis de ambiente (Vercel › Settings › Environment Variables):
//   DVR_WEBHOOK_TOKEN                       segredo do encaminhador (openssl rand -hex 24)
//   KV_REST_API_URL / KV_REST_API_TOKEN     banco Upstash Redis (Vercel › Storage › Upstash for Redis
//   (ou UPSTASH_REDIS_REST_URL / _TOKEN)     › Connect Project cria essas variáveis sozinho)

const LIST = "dvr:eventos";
const SEEN = "dvr:visto";
const MAX_EVENTS = 3000;
const enc = new TextEncoder();

const env = (n) => (process.env[n] || "").trim();
const kvUrl = () => (env("KV_REST_API_URL") || env("UPSTASH_REDIS_REST_URL")).replace(/\/+$/, "");
const kvToken = () => env("KV_REST_API_TOKEN") || env("UPSTASH_REDIS_REST_TOKEN");

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function kv(commands) {
  const res = await fetch(kvUrl() + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + kvToken(), "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error("Banco (Upstash) respondeu " + res.status);
  const out = await res.json();
  for (const r of out) if (r && r.error) throw new Error("Banco (Upstash): " + r.error);
  return out.map((r) => r.result);
}

async function sameSecret(a, b) {
  const key = await crypto.subtle.importKey("raw", enc.encode("dvr-cmp"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const [x, y] = await Promise.all([a, b].map((v) => crypto.subtle.sign("HMAC", key, enc.encode(String(v)))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

// ------------------------------------------------------------ interpretação do e-mail
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Ordem importa: o primeiro que casar define o tipo.
const TYPES = [
  ["TESTE", "info", /\b(teste|test|saude|health|heartbeat)\b/],
  ["HD_ERRO", "critico", /(sem hd|no hdd|no disk|erro (no|de) hd|hdd error|disk error|erro (no |de )?disco|falha (no |de )?(hd|disco)|hd com erro|saude do ssd)/],
  ["HD_CHEIO", "atencao", /(hd (sem espaco|cheio)|disk full|hdd full|sem espaco|espaco de cota|disco cheio)/],
  ["SEM_GRAVACAO", "critico", /(sem gravacao|nao (esta )?gravando|record(ing)? (fail|error|stop)|falha (na|de) gravacao)/],
  ["PERDA_VIDEO", "critico", /(perda de video|video loss|videoloss|sem video|perda do sinal)/],
  ["CAMERA_OFFLINE", "critico", /(camera (ip )?offline|camera desconectada|ipc offline)/],
  ["MASCARAMENTO", "atencao", /(mascaramento|tamper|obstru|camera coberta|bloqueio de camera)/],
  ["REDE", "critico", /(rede ausente|desconex|network (disconnect|down|abnormal)|offline|sem rede|cabo de rede)/],
  ["CONFLITO_IP", "atencao", /(conflito de (ip|mac)|ip conflict|mac conflict)/],
  ["ACESSO_ILEGAL", "critico", /(login ilegal|acesso ilegal|illegal (login|access)|forca bruta|brute force|excecao de seguranca|seguranca de rede)/],
  ["MOVIMENTO", "info", /(movimento|motion|deteccao inteligente|ivs|cruzamento de linha|tripwire|intrus)/],
  ["ALARME", "atencao", /(alarme|alarm)/],
];
const RECOVER = /(fim d[oe]|finaliz|encerrad|restaurad|normaliz|recuperad|voltou|alarm (stop|end)|event (stop|end)|\bstop\b)/;

function classify(subject, text) {
  const s = fold(subject + "\n" + text);
  for (const [type, sev, re] of TYPES) {
    if (re.test(s)) {
      const recovered = type !== "TESTE" && RECOVER.test(s);
      return { type, severity: recovered ? "ok" : sev, recovered };
    }
  }
  return { type: "OUTRO", severity: "info", recovered: false };
}

function field(text, labels) {
  for (const l of labels) {
    const m = text.match(new RegExp("(?:^|\\n)\\s*" + l + "\\s*[:=]\\s*([^\\n]{1,120})", "i"));
    if (m) return m[1].trim();
  }
  return "";
}

function parseDate(text) {
  let m = text.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return [m[1], m[2], m[3], m[4], m[5], m[6] || "00"];
  m = text.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return [m[3], m[2], m[1], m[4], m[5], m[6] || "00"]; // DVRs no Brasil usam DD/MM/AAAA
  return null;
}

function interpret(msg) {
  const subject = String(msg.subject || "").slice(0, 300);
  const text = String(msg.text || "").replace(/\r/g, "").slice(0, 6000);
  const from = String(msg.from || "").slice(0, 200);
  const all = subject + "\n" + from + "\n" + text;
  const kind = classify(subject, text);

  // Números de série Intelbras: 10 a 16 letras/números, com letras e números juntos.
  const serials = [...new Set((all.toUpperCase().match(/\b[A-Z0-9]{10,16}\b/g) || []).filter((t) => /[A-Z]/.test(t) && /\d/.test(t) && !/^\d+[A-Z]?$/.test(t)))].slice(0, 6);
  const chRaw = field(text, ["canal(?: de entrada de alarme)?", "alarm input channel", "channel", "canal de video", "ch"]) ||
    ((subject + "\n" + text).match(/\b(?:canal|channel|ch)\s*[:#nº°-]?\s*(\d{1,3})\b/i) || [])[1] || "";
  const ch = Number((String(chRaw).match(/\d{1,3}/) || [])[0]) || null;
  const d = parseDate(text) || parseDate(subject);
  const eventLocal = d ? `${d[0]}-${d[1]}-${d[2]}T${d[3]}:${d[4]}:${d[5]}` : null;

  return {
    ...kind,
    serials,
    channel: ch,
    device_name: field(text, ["nome do dispositivo", "alarm device name", "device name", "nome do equipamento", "dispositivo"]),
    event_name: field(text, ["evento de alarme", "alarm event", "evento", "event", "tipo de evento", "tipo"]),
    ip: field(text, ["endereco ip", "endereço ip", "ip address", "ip"]),
    event_local: eventLocal,
  };
}

// ------------------------------------------------------------ leitura do POST
async function readBody(request) {
  const type = (request.headers.get("content-type") || "").toLowerCase();
  if (type.includes("application/json")) {
    const b = await request.json();
    // Formato próprio (encaminhador), CloudMailin (headers/plain) ou parecido.
    const h = b.headers || {};
    return {
      id: b.id || b.message_id || h["message-id"] || h["Message-ID"] || "",
      from: b.from || h.from || h.From || (b.envelope && b.envelope.from) || "",
      to: b.to || h.to || h.To || (b.envelope && b.envelope.to) || "",
      subject: b.subject || h.subject || h.Subject || "",
      text: b.text || b.plain || b.body || stripHtml(b.html || ""),
      date: b.date || h.date || h.Date || "",
    };
  }
  if (type.includes("form")) {
    const f = await request.formData();
    const g = (k) => (typeof f.get(k) === "string" ? f.get(k) : "");
    return {
      id: g("Message-Id") || g("message-id"),
      from: g("from") || g("sender"),
      to: g("to") || g("recipient"),
      subject: g("subject"),
      text: g("text") || g("body-plain") || g("plain") || stripHtml(g("html") || g("body-html")),
      date: g("date") || g("Date"),
    };
  }
  return { subject: "", text: (await request.text()).slice(0, 6000) };
}

function stripHtml(h) {
  return String(h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

// ------------------------------------------------------------ rotas
export async function POST(request) {
  const secret = env("DVR_WEBHOOK_TOKEN");
  if (!secret) return json(503, { detail: "Configure DVR_WEBHOOK_TOKEN na Vercel e faça Redeploy." });
  const auth = request.headers.get("authorization") || "";
  const given = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : (request.headers.get("x-dvr-token") || "").trim();
  if (!given || !(await sameSecret(given, secret))) return json(401, { detail: "Token inválido." });
  if (!kvUrl() || !kvToken()) return json(503, { detail: "Banco não configurado: conecte o Upstash for Redis ao projeto na Vercel (Storage)." });

  let msg;
  try {
    msg = await readBody(request);
  } catch (e) {
    return json(400, { detail: "Não consegui ler o corpo da notificação." });
  }
  if (!msg.subject && !msg.text) return json(400, { detail: "Notificação vazia (sem assunto e sem texto)." });

  const now = new Date().toISOString();
  const parsed = interpret(msg);
  let sent = msg.date ? new Date(msg.date) : null;
  if (!sent || isNaN(sent)) sent = null;
  const ev = {
    id: now.replace(/\D/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 8),
    received_at: now,
    sent_at: sent ? sent.toISOString() : null,
    from: String(msg.from || "").slice(0, 200),
    subject: String(msg.subject || "").slice(0, 300),
    text: String(msg.text || "").replace(/\r/g, "").trim().slice(0, 1500),
    ...parsed,
  };

  const cmds = [];
  if (msg.id) cmds.push(["SET", "dvr:msg:" + String(msg.id).slice(0, 200), "1", "NX", "EX", "1209600"]);
  const results = await kv(cmds.length ? cmds : [["PING"]]);
  if (msg.id && results[0] !== "OK") return json(200, { ok: true, duplicate: true });

  // "Visto por último" por remetente: o 1º número de série encontrado, senão o e-mail de origem.
  const key = parsed.serials[0] || fold(ev.from).replace(/^.*</, "").replace(/>.*$/, "").trim() || "desconhecido";
  const seen = JSON.stringify({ ts: now, type: ev.type, severity: ev.severity, subject: ev.subject, from: ev.from, serials: parsed.serials, device_name: ev.device_name });
  await kv([
    ["LPUSH", LIST, JSON.stringify(ev)],
    ["LTRIM", LIST, "0", String(MAX_EVENTS - 1)],
    ["HSET", SEEN, key, seen],
  ]);
  return json(200, { ok: true, id: ev.id, type: ev.type, severity: ev.severity, serials: parsed.serials, channel: parsed.channel });
}

export async function GET(request) {
  const configured = { token: !!env("DVR_WEBHOOK_TOKEN"), storage: !!(kvUrl() && kvToken()) };
  if (!configured.storage) return json(200, { configured, events: [], seen: {} });
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 1000, 1), MAX_EVENTS);
  try {
    const [list, seen] = await kv([["LRANGE", LIST, "0", String(limit - 1)], ["HGETALL", SEEN]]);
    const events = (list || []).map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
    const seenObj = {};
    for (let i = 0; i + 1 < (seen || []).length; i += 2) {
      try { seenObj[seen[i]] = JSON.parse(seen[i + 1]); } catch (e) { /* ignora */ }
    }
    return json(200, { configured, events, seen: seenObj });
  } catch (e) {
    return json(502, { configured, detail: e.message });
  }
}

// Só para testes locais (node --test).
export const _test = { interpret, classify };
