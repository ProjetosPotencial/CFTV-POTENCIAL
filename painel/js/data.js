/* Camada de dados do painel Potencial CFTV.
 * - Modo demo: dados de demonstração (31 lojas reais do inventário) gravados no navegador.
 * - Modo api : conversa com a API FastAPI (rotas /api/stores, /api/devices, /api/channels,
 *              /api/events, /api/settings, /api/summary). Rotas extras que o backend ainda
 *              não tenha (testar, onvif, sincronizar) retornam um aviso claro na tela.
 * As telas só usam o objeto window.DB, então trocar de modo não muda nada na interface.
 */
(function () {
  "use strict";

  const LS_KEY = "pcftv-demo-v2";
  const LS_CONN = "pcftv-conn";
  const LS_ACK = "pcftv-acks";

  const DEV_STATUS = {
    ONLINE: { label: "Online", cls: "s-ok", color: "var(--ok)" },
    INSTAVEL: { label: "Instável", cls: "s-orange", color: "var(--orange)" },
    OFFLINE: { label: "Offline", cls: "s-bad", color: "var(--bad)" },
    ERRO_AUTENTICACAO: { label: "Erro de autenticação", cls: "s-auth", color: "var(--auth)" },
    NAO_VERIFICADO: { label: "Não verificado", cls: "s-warn", color: "var(--warn)" },
  };
  const CH_STATUS = {
    TRANSMITINDO: { label: "Transmitindo", cls: "s-ok", color: "var(--ok)" },
    SEM_VIDEO: { label: "Sem vídeo", cls: "s-orange", color: "var(--orange)" },
    OFFLINE: { label: "Offline", cls: "s-bad", color: "var(--bad)" },
    ERRO_AUTENTICACAO: { label: "Erro de autenticação", cls: "s-auth", color: "var(--auth)" },
    NAO_VERIFICADO: { label: "Não verificado", cls: "s-warn", color: "var(--warn)" },
  };
  const EVENT_TYPES = {
    DVR_OFFLINE: { label: "DVR offline", sev: "critico" },
    DVR_ONLINE: { label: "DVR voltou online", sev: "ok" },
    DVR_INSTAVEL: { label: "DVR instável", sev: "atencao" },
    AUTH_FALHA: { label: "Falha de autenticação", sev: "critico" },
    CANAL_SEM_VIDEO: { label: "Canal perdeu vídeo", sev: "atencao" },
    CANAL_VOLTOU: { label: "Canal voltou a transmitir", sev: "ok" },
    SEM_COMUNICACAO: { label: "Sem comunicação prolongada", sev: "critico" },
    ONVIF: { label: "Descoberta ONVIF", sev: "info" },
    CADASTRO: { label: "Alteração de cadastro", sev: "info" },
    SLACK_TESTE: { label: "Teste do Slack", sev: "info" },
  };

  // Inventário real informado pelo painel atual (sem senhas).
  const INVENTARIO = [
    ["209 Jaracaty", "MHDX 3104", "OSVH2005814WJ", "Relay", 4],
    ["Barão de Cocais", "MHDX", "IMRG13045096H", "P2P", 4],
    ["Boqueiro", "Desconhecido", "OHJF1101818B9", "P2P", 0],
    ["Caconde", "MHDX", "CQGF14013402S", "P2P", 5],
    ["Campo Belo", "MHDX", "CQGF1401347L7", "P2P", 5],
    ["Congonhas", "MHDX", "CQGF13010834M", "Relay", 5],
    ["DF Novo Gama", "Desconhecido", "PA1LF07702236", "P2P", 0],
    ["Gov. Valadares", "MHDX", "CQGF14007804V", "P2P", 5],
    ["Guarapari", "MHDX", "OHJF2004890TE", "P2P", 5],
    ["Guaxupé", "MHDX", "CQGF1401329EH", "Relay", 5],
    ["Ibiporã", "MHDX", "OHJF0318354UQ", "P2P", 5],
    ["Ipatinga Horto", "MHDX", "CQGF1301085YD", "P2P", 5],
    ["Itapemirim", "MHDX", "NM3F0305092I7", "Relay", 10],
    ["Juatuba BB", "MHDX", "NM3E42038260T", "P2P", 10],
    ["Loja Vespasiano", "MHDX", "CQGF1400827HQ", "P2P", 5],
    ["MG 31 Ana Lucia", "DVR", "S6GC5200063QD", "P2P", 4],
    ["MG 40 Jardim Alterosa", "MHDX 3004", "IMRG1304511RD", "P2P", 4],
    ["MG 53 Coronel Fabriciano", "Desconhecido", "PA3GA03002525", "P2P", 0],
    ["MG 64 Ubá", "MHDX", "OHJF2004998ET", "P2P", 5],
    ["MG 68 Muriaé", "MHDX", "CQGF1301068WP", "P2P", 5],
    ["MG Mateus Leme", "MHDX", "OHJF20048996P", "P2P", 5],
    ["Mococa", "MHDX", "CQGF1401345T7", "Relay", 5],
    ["Pedro Leopoldo", "MHDX", "OHJF20049116Z", "Relay", 5],
    ["Poços de Caldas", "MHDX", "CQGF1401370MM", "P2P", 5],
    ["Ponta Porã", "MHDX", "OHJF2006138MZ", "P2P", 5],
    ["Ponte da Amizade", "MHDX", "OHJE4201472HG", "P2P", 5],
    ["Pote", "MHDX", "CQGF13010807F", "P2P", 5],
    ["Pouso Alegre", "MHDX", "CQGF1301075Z4", "P2P", 5],
    ["Rio Pardo", "MHDX", "CQGF1401319RH", "P2P", 5],
    ["Três Corações", "HDCVI", "WALD51001198J", "P2P", 5],
    ["Tubarão SP 58", "Desconhecido", "PA3EA02105097", "P2P", 0],
  ];
  const CAM_NOMES = ["Entrada", "Caixa", "Salão", "Estoque", "Fundos", "Estacionamento", "Corredor", "Escritório", "Doca", "Vitrine"];

  // ---------- utilitários ----------
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const nowIso = () => new Date().toISOString();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function lsGet(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* armazenamento indisponível */ } }

  // ---------- dados de demonstração ----------
  function seedDemo() {
    const r = rng(20261125);
    const now = Date.now();
    const H = 3600e3;
    const stores = [], devices = [], channels = [], events = [];
    const forced = { 4: "OFFLINE", 12: "OFFLINE", 9: "INSTAVEL", 24: "ERRO_AUTENTICACAO" };
    INVENTARIO.forEach((row, i) => {
      const [name, model, serial, mode, nch] = row;
      const sid = i + 1;
      stores.push({ id: sid, name, code: String(sid).padStart(2, "0"), city: "", notes: "" });
      const unknown = nch === 0;
      const status = unknown ? "NAO_VERIFICADO" : forced[i] || "ONLINE";
      const lastOk = status === "OFFLINE" ? now - (2 + r() * 30) * H : now - r() * 50e3;
      const dev = {
        id: sid, store_id: sid, manufacturer: unknown ? "" : "Intelbras", model, serial,
        host: unknown ? "" : `10.${20 + Math.floor(i / 10)}.${(i % 10) * 10 + 1}.10`,
        port: 37777, rtsp_port: 554, onvif_port: 80, mode: unknown ? mode : "VPN", p2p_mode: mode,
        protocol: unknown ? "A confirmar" : "ONVIF + RTSP", username: unknown ? "" : "monitor",
        has_password: !unknown, channels: nch, poll_interval: 60, status,
        status_since: new Date(status === "ONLINE" ? now - (3 + r() * 20) * 24 * H : status === "OFFLINE" ? lastOk : now - (1 + r() * 10) * H).toISOString(),
        last_check: unknown ? null : new Date(now - r() * 55e3).toISOString(),
        last_seen: unknown ? null : new Date(lastOk).toISOString(),
        latency_ms: status === "ONLINE" ? Math.round(18 + r() * 60) : status === "INSTAVEL" ? Math.round(240 + r() * 500) : null,
        onvif: unknown ? null : { supported: true, firmware: "4.001.0000000.3", profiles: nch },
      };
      devices.push(dev);
      for (let n = 1; n <= nch; n++) {
        let st = "TRANSMITINDO";
        if (status === "OFFLINE") st = "OFFLINE";
        else if (status === "ERRO_AUTENTICACAO") st = "ERRO_AUTENTICACAO";
        else if (r() < 0.06) st = "SEM_VIDEO";
        const lf = st === "TRANSMITINDO" ? now - r() * 60e3 : st === "SEM_VIDEO" ? now - (0.5 + r() * 20) * H : lastOk;
        channels.push({
          id: sid * 100 + n, device_id: sid, number: n, name: CAM_NOMES[(n - 1) % CAM_NOMES.length] + (n > CAM_NOMES.length ? " 2" : ""),
          status: st, resolution: r() < 0.5 ? "1920x1080" : "1280x720", fps: st === "TRANSMITINDO" ? Math.round(12 + r() * 3) : 0,
          last_check: new Date(now - r() * 120e3).toISOString(), last_frame: new Date(lf).toISOString(),
          status_since: new Date(st === "TRANSMITINDO" ? now - (2 + r() * 10) * 24 * H : lf).toISOString(),
        });
      }
    });

    // histórico dos últimos 30 dias
    const known = devices.filter((d) => d.channels > 0);
    for (let k = 0; k < 95; k++) {
      const d = known[Math.floor(r() * known.length)];
      const t = now - r() * 30 * 24 * H;
      const dur = Math.round((5 + r() * (r() < 0.2 ? 600 : 90)) * 60);
      const kind = r();
      if (kind < 0.45) {
        events.push(ev(t, d, null, "DVR_OFFLINE", `DVR sem resposta na porta ${d.port} após 3 tentativas.`, dur, t + dur * 1000));
        events.push(ev(t + dur * 1000, d, null, "DVR_ONLINE", `DVR voltou a responder (${Math.round(20 + r() * 50)} ms).`));
      } else if (kind < 0.85) {
        const chs = channels.filter((c) => c.device_id === d.id);
        const c = chs[Math.floor(r() * chs.length)];
        events.push(ev(t, d, c, "CANAL_SEM_VIDEO", `Fluxo RTSP abriu, mas nenhum quadro foi recebido em 10 s.`, dur, t + dur * 1000));
        events.push(ev(t + dur * 1000, d, c, "CANAL_VOLTOU", `Canal voltou a transmitir.`));
      } else if (kind < 0.95) {
        events.push(ev(t, d, null, "DVR_INSTAVEL", `Perda de 40% dos pacotes e latência acima de 500 ms.`, Math.round(dur / 3), t + dur * 333));
      } else {
        events.push(ev(t, d, null, "AUTH_FALHA", `Usuário ou senha recusados pelo DVR.`, dur, t + dur * 1000));
      }
    }
    // eventos abertos (estado atual)
    devices.forEach((d) => {
      if (d.status === "OFFLINE") events.push(ev(Date.parse(d.status_since), d, null, "DVR_OFFLINE", `DVR sem resposta na porta ${d.port} após 3 tentativas.`, null, null));
      if (d.status === "INSTAVEL") events.push(ev(Date.parse(d.status_since), d, null, "DVR_INSTAVEL", "Respostas intermitentes: 2 de 5 tentativas falharam.", null, null));
      if (d.status === "ERRO_AUTENTICACAO") events.push(ev(Date.parse(d.status_since), d, null, "AUTH_FALHA", "Usuário ou senha recusados pelo DVR.", null, null));
    });
    channels.filter((c) => c.status === "SEM_VIDEO").forEach((c) => {
      const d = devices.find((x) => x.id === c.device_id);
      events.push(ev(Date.parse(c.status_since), d, c, "CANAL_SEM_VIDEO", "Fluxo RTSP abriu, mas nenhum quadro foi recebido em 10 s.", null, null));
    });
    events.sort((a, b) => b.ts.localeCompare(a.ts));
    return {
      stores, devices, channels, events,
      settings: {
        poll_interval: 60, timeout_s: 5, retries: 3, concurrency: 10, rtsp_interval: 300, rtsp_concurrency: 4,
        rtsp_timeout_s: 10, freeze_detection: true, offline_alert_minutes: 30, slack_configured: true,
        slack_notify: { DVR_OFFLINE: true, DVR_ONLINE: true, CANAL_SEM_VIDEO: true, CANAL_VOLTOU: true, AUTH_FALHA: true, SEM_COMUNICACAO: true },
        slack_repeat_minutes: 60,
      },
      seq: 100000,
    };
    function ev(t, d, c, type, description, duration_s, recovered_at) {
      return {
        id: uid() + Math.floor(r() * 1e6), ts: new Date(t).toISOString(), store_id: d.store_id, device_id: d.id,
        channel_id: c ? c.id : null, type, description,
        duration_s: duration_s === undefined ? null : duration_s,
        recovered_at: recovered_at ? new Date(recovered_at).toISOString() : null,
        open: duration_s === null && recovered_at === null,
        slack: ["DVR_OFFLINE", "DVR_ONLINE", "CANAL_SEM_VIDEO", "CANAL_VOLTOU", "AUTH_FALHA"].includes(type),
      };
    }
  }

  let demo = null;
  function demoState() {
    if (!demo) demo = lsGet(LS_KEY, null) || seedDemo();
    return demo;
  }
  function demoSave() { lsSet(LS_KEY, demo); }

  // ---------- conexão ----------
  function conn() {
    const base = window.PCFTV_CONFIG || {};
    const saved = lsGet(LS_CONN, {});
    return { mode: saved.mode || base.mode || "demo", apiBase: (saved.apiBase ?? base.apiBase ?? "").replace(/\/$/, ""), apiToken: saved.apiToken || base.apiToken || "" };
  }

  class ApiError extends Error {
    constructor(msg, status) { super(msg); this.status = status; }
  }
  async function http(method, path, body) {
    const c = conn();
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (c.apiToken) headers.Authorization = "Bearer " + c.apiToken;
    let res;
    try {
      res = await fetch(c.apiBase + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      throw new ApiError("Não foi possível falar com a API (" + (c.apiBase || "mesma origem") + "). Verifique a URL, o HTTPS e o CORS.", 0);
    }
    if (res.status === 401 && res.headers.get("X-Painel-Login")) { location.href = "/login?next=" + encodeURIComponent(location.pathname + location.hash); throw new ApiError("Sessão expirada. Entre de novo.", 401); }
    if (res.status === 404) throw new ApiError("Rota " + method + " " + path + " ainda não existe no backend.", 404);
    if (res.status === 401 || res.status === 403) throw new ApiError("Acesso negado pela API. Confira o token em Configurações.", res.status);
    if (!res.ok) {
      let detail = "";
      try { const j = await res.json(); detail = j.detail ? (typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail)) : ""; } catch (e) { /* sem corpo */ }
      throw new ApiError("Erro " + res.status + " em " + path + (detail ? ": " + detail : ""), res.status);
    }
    if (res.status === 204) return null;
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }

  // Normaliza o que vem da API atual para o formato usado nas telas.
  function normalizeApi(raw) {
    const stores = (raw.stores || []).map((s) => ({ id: s.id, name: s.name, code: s.code || "", city: s.city || "", notes: s.notes || "" }));
    const byName = Object.fromEntries(stores.map((s) => [s.name, s.id]));
    const devices = (raw.devices || []).map((d) => ({
      id: d.id, store_id: d.store_id ?? byName[d.store] ?? null, manufacturer: d.manufacturer || "", model: d.model || "",
      serial: d.serial || "", host: d.host || "", port: d.port || 37777, rtsp_port: d.rtsp_port || 554, onvif_port: d.onvif_port || 80,
      mode: d.mode || "", p2p_mode: d.mode || "", protocol: d.protocol || "", username: d.username || "",
      has_password: !!d.has_password, channels: d.channels ?? 0, poll_interval: d.poll_interval || null,
      status: (d.status || "NAO_VERIFICADO").toUpperCase(), status_since: d.status_since || null, last_check: d.last_check || null,
      last_seen: d.last_seen || null, latency_ms: d.latency_ms ?? null, onvif: d.onvif || null,
    }));
    const channels = (raw.channels || []).map((c) => ({
      id: c.id, device_id: c.device_id, number: c.number, name: c.name || "Canal " + c.number,
      status: (c.status || "NAO_VERIFICADO").toUpperCase(), resolution: c.resolution || "", fps: c.fps ?? null,
      last_check: c.last_check || null, last_frame: c.last_frame || null, status_since: c.status_since || null,
      snapshot_at: c.snapshot_at || null,
    }));
    const devBySerial = Object.fromEntries(devices.map((d) => [d.serial, d]));
    const events = (raw.events || []).map((e, i) => {
      const d = e.device_id ? devices.find((x) => x.id === e.device_id) : devBySerial[e.serial];
      return {
        id: e.id ?? "e" + i, ts: e.ts || e.created_at || e.date || nowIso(), store_id: e.store_id ?? (d ? d.store_id : byName[e.store]) ?? null,
        device_id: d ? d.id : null, channel_id: e.channel_id ?? null, type: (e.type || e.event || "CADASTRO").toUpperCase(),
        description: e.description || e.message || "", duration_s: e.duration_s ?? null, recovered_at: e.recovered_at || null,
        open: !!e.open, slack: !!e.slack,
      };
    });
    const s = raw.settings || {};
    return { stores, devices, channels, events, settings: Object.assign({}, demoDefaults().settings, s) };
  }
  function demoDefaults() { return { settings: seedDemoSettings() }; }
  function seedDemoSettings() {
    return { poll_interval: 60, timeout_s: 5, retries: 3, concurrency: 10, rtsp_interval: 300, rtsp_concurrency: 4, rtsp_timeout_s: 10, freeze_detection: true, snapshots: true, offline_alert_minutes: 30, slack_configured: false, slack_notify: {}, slack_repeat_minutes: 60 };
  }

  // ---------- alertas (derivados do estado atual) ----------
  function deriveAlerts(state) {
    const acks = lsGet(LS_ACK, {});
    const alerts = [];
    const stName = (id) => (state.stores.find((s) => s.id === id) || {}).name || "—";
    const s = state.settings || {};
    state.devices.forEach((d) => {
      if (["OFFLINE", "INSTAVEL", "ERRO_AUTENTICACAO"].includes(d.status)) {
        const since = d.status_since || d.last_check || nowIso();
        const mins = (Date.now() - Date.parse(since)) / 60e3;
        const prolonged = d.status === "OFFLINE" && mins > (s.offline_alert_minutes || 30) * 6;
        alerts.push({
          key: "d" + d.id + d.status, kind: "dvr", device_id: d.id, store_id: d.store_id, channel_id: null,
          type: d.status === "OFFLINE" ? (prolonged ? "SEM_COMUNICACAO" : "DVR_OFFLINE") : d.status === "INSTAVEL" ? "DVR_INSTAVEL" : "AUTH_FALHA",
          severity: d.status === "INSTAVEL" ? "atencao" : "critico", since, title: stName(d.store_id) + " · DVR " + d.serial,
          description: d.status === "OFFLINE" ? "Sem resposta na rede. Todas as câmeras deste DVR estão sem monitoramento." : d.status === "INSTAVEL" ? "Respostas intermitentes ou latência alta." : "Usuário ou senha recusados pelo DVR.",
          ack: !!acks["d" + d.id + d.status],
        });
      }
    });
    state.channels.forEach((c) => {
      if (c.status === "SEM_VIDEO" || (c.status === "ERRO_AUTENTICACAO" && false)) {
        const d = state.devices.find((x) => x.id === c.device_id) || {};
        alerts.push({
          key: "c" + c.id + c.status, kind: "canal", device_id: d.id, store_id: d.store_id, channel_id: c.id, type: "CANAL_SEM_VIDEO",
          severity: "atencao", since: c.status_since || c.last_frame || nowIso(), title: stName(d.store_id) + " · Canal " + c.number + " (" + c.name + ")",
          description: "O DVR responde, mas a câmera não envia imagem.", ack: !!acks["c" + c.id + c.status],
        });
      }
    });
    alerts.sort((a, b) => (a.severity === b.severity ? a.since.localeCompare(b.since) : a.severity === "critico" ? -1 : 1));
    return alerts;
  }

  // ---------- simulação do monitor (somente demonstração) ----------
  function demoEvent(st, d, c, type, description, extra) {
    const e = Object.assign({ id: uid(), ts: nowIso(), store_id: d.store_id, device_id: d.id, channel_id: c ? c.id : null, type, description, duration_s: null, recovered_at: null, open: false, slack: !!(st.settings.slack_notify || {})[type] }, extra || {});
    st.events.unshift(e);
    return e;
  }
  function closeOpen(st, pred) {
    const e = st.events.find((x) => x.open && pred(x));
    if (e) { e.open = false; e.recovered_at = nowIso(); e.duration_s = Math.round((Date.now() - Date.parse(e.ts)) / 1000); }
    return e;
  }
  function setDevStatus(st, d, status, why) {
    const prev = d.status;
    if (prev === status) return null;
    d.status = status; d.status_since = nowIso();
    const chs = st.channels.filter((c) => c.device_id === d.id);
    let out = null;
    if (status === "OFFLINE") {
      out = demoEvent(st, d, null, "DVR_OFFLINE", why || `DVR sem resposta na porta ${d.port} após ${st.settings.retries} tentativas.`, { open: true });
      d.latency_ms = null;
      chs.forEach((c) => { c.status = "OFFLINE"; c.status_since = nowIso(); c.fps = 0; });
    } else if (status === "ERRO_AUTENTICACAO") {
      out = demoEvent(st, d, null, "AUTH_FALHA", why || "Usuário ou senha recusados pelo DVR.", { open: true });
      chs.forEach((c) => { c.status = "ERRO_AUTENTICACAO"; c.status_since = nowIso(); });
    } else if (status === "INSTAVEL") {
      out = demoEvent(st, d, null, "DVR_INSTAVEL", why || "Respostas intermitentes: 2 de 5 tentativas falharam.", { open: true });
      d.latency_ms = 300 + Math.round(Math.random() * 500);
    } else if (status === "ONLINE") {
      const closed = closeOpen(st, (x) => x.device_id === d.id && !x.channel_id && ["DVR_OFFLINE", "AUTH_FALHA", "DVR_INSTAVEL", "SEM_COMUNICACAO"].includes(x.type));
      out = demoEvent(st, d, null, "DVR_ONLINE", "DVR voltou a responder" + (closed ? " após " + fmtDur(closed.duration_s) : "") + ".");
      d.latency_ms = 20 + Math.round(Math.random() * 50); d.last_seen = nowIso();
      chs.forEach((c) => { if (c.status !== "SEM_VIDEO") { c.status = "TRANSMITINDO"; c.status_since = nowIso(); c.last_frame = nowIso(); c.fps = 15; } });
    }
    return out;
  }
  function fmtDur(s) {
    if (s == null) return "—";
    if (s < 60) return s + " s";
    const m = Math.round(s / 60);
    if (m < 60) return m + " min";
    const h = Math.floor(m / 60);
    if (h < 48) return h + " h " + (m % 60) + " min";
    return Math.floor(h / 24) + " d " + (h % 24) + " h";
  }

  function demoTick() {
    const st = demoState();
    const now = nowIso();
    const changes = [];
    st.devices.forEach((d) => {
      if (!d.host) return;
      d.last_check = now;
      if (d.status === "ONLINE") { d.last_seen = now; d.latency_ms = Math.max(8, Math.round((d.latency_ms || 30) + (Math.random() - 0.5) * 12)); }
    });
    st.channels.forEach((c) => {
      const d = st.devices.find((x) => x.id === c.device_id);
      if (d && d.status === "ONLINE") { c.last_check = now; if (c.status === "TRANSMITINDO") { c.last_frame = now; c.fps = 14 + Math.round(Math.random()); } }
    });
    const r = Math.random();
    const live = st.devices.filter((d) => d.host);
    if (r < 0.22) {
      const bad = live.filter((d) => d.status !== "ONLINE");
      const d = bad[Math.floor(Math.random() * bad.length)];
      if (d) changes.push(setDevStatus(st, d, "ONLINE"));
    } else if (r < 0.34) {
      const ok = live.filter((d) => d.status === "ONLINE");
      const d = ok[Math.floor(Math.random() * ok.length)];
      if (d) changes.push(setDevStatus(st, d, Math.random() < 0.7 ? "OFFLINE" : "INSTAVEL"));
    } else if (r < 0.52) {
      const pool = st.channels.filter((c) => c.status === "TRANSMITINDO" || c.status === "SEM_VIDEO");
      const c = pool[Math.floor(Math.random() * pool.length)];
      if (c) {
        const d = st.devices.find((x) => x.id === c.device_id);
        if (c.status === "TRANSMITINDO") {
          c.status = "SEM_VIDEO"; c.status_since = now; c.fps = 0;
          changes.push(demoEvent(st, d, c, "CANAL_SEM_VIDEO", "Fluxo RTSP abriu, mas nenhum quadro foi recebido em " + st.settings.rtsp_timeout_s + " s.", { open: true }));
        } else {
          const closed = closeOpen(st, (x) => x.channel_id === c.id && x.type === "CANAL_SEM_VIDEO");
          c.status = "TRANSMITINDO"; c.status_since = now; c.last_frame = now; c.fps = 15;
          changes.push(demoEvent(st, d, c, "CANAL_VOLTOU", "Canal voltou a transmitir" + (closed ? " após " + fmtDur(closed.duration_s) : "") + "."));
        }
      }
    }
    st.events = st.events.slice(0, 2000);
    demoSave();
    return changes.filter(Boolean);
  }

  // ---------- API pública usada pelas telas ----------
  const DB = {
    DEV_STATUS, CH_STATUS, EVENT_TYPES, fmtDur, ApiError,
    conn, setConn(v) { lsSet(LS_CONN, v); },
    get mode() { return conn().mode; },

    async load() {
      if (conn().mode === "demo") {
        const st = demoState();
        await sleep(60);
        const copy = JSON.parse(JSON.stringify(st));
        copy.alerts = deriveAlerts(copy);
        return copy;
      }
      const [stores, devices, channels, events, settings] = await Promise.all([
        http("GET", "/api/stores"), http("GET", "/api/devices"), http("GET", "/api/channels"),
        http("GET", "/api/events?limit=1000").catch(() => []), http("GET", "/api/settings").catch(() => ({})),
      ]);
      const st = normalizeApi({ stores, devices, channels, events, settings });
      st.alerts = deriveAlerts(st);
      return st;
    },

    // ----- lojas -----
    async saveStore(s) {
      if (conn().mode === "api") return s.id ? http("PUT", "/api/stores/" + s.id, s) : http("POST", "/api/stores", s);
      const st = demoState();
      if (st.stores.some((x) => x.name.trim().toLowerCase() === s.name.trim().toLowerCase() && x.id !== s.id)) throw new ApiError("Já existe uma loja com esse nome.", 409);
      if (s.id) Object.assign(st.stores.find((x) => x.id === s.id), s);
      else { s.id = ++st.seq; st.stores.push(s); }
      demoSave(); return s;
    },
    async deleteStore(id) {
      if (conn().mode === "api") return http("DELETE", "/api/stores/" + id);
      const st = demoState();
      if (st.devices.some((d) => d.store_id === id)) throw new ApiError("A loja tem DVRs vinculados. Remova ou mova os DVRs antes de excluir.", 409);
      st.stores = st.stores.filter((x) => x.id !== id); demoSave();
    },

    // ----- DVRs -----
    async saveDevice(d, opts) {
      opts = opts || {};
      const payload = Object.assign({}, d);
      if (!payload.password) delete payload.password; // senha só é enviada quando alterada
      if (conn().mode === "api") {
        const q = opts.removeExtraChannels ? "?remove_extra_channels=true" : "";
        return d.id ? http("PUT", "/api/devices/" + d.id + q, payload) : http("POST", "/api/devices", payload);
      }
      const st = demoState();
      if (st.devices.some((x) => x.serial && x.serial === d.serial && x.id !== d.id)) throw new ApiError("Já existe um DVR com esse número de série.", 409);
      const hasPw = !!payload.password; delete payload.password;
      let dev;
      if (d.id) {
        dev = st.devices.find((x) => x.id === d.id);
        Object.assign(dev, payload); if (hasPw) dev.has_password = true;
        demoEvent(st, dev, null, "CADASTRO", "Cadastro do DVR atualizado" + (hasPw ? " (senha alterada)" : "") + ".");
      } else {
        dev = Object.assign({ status: "NAO_VERIFICADO", status_since: nowIso(), last_check: null, last_seen: null, latency_ms: null, onvif: null }, payload, { id: ++st.seq, has_password: hasPw });
        st.devices.push(dev);
        demoEvent(st, dev, null, "CADASTRO", "DVR cadastrado.");
      }
      // cria canais que faltam; só remove os excedentes com confirmação explícita
      const chs = st.channels.filter((c) => c.device_id === dev.id);
      for (let n = 1; n <= dev.channels; n++) {
        if (!chs.some((c) => c.number === n)) st.channels.push({ id: ++st.seq, device_id: dev.id, number: n, name: "Canal " + n, status: "NAO_VERIFICADO", resolution: "", fps: null, last_check: null, last_frame: null, status_since: nowIso() });
      }
      if (opts.removeExtraChannels) st.channels = st.channels.filter((c) => c.device_id !== dev.id || c.number <= dev.channels);
      demoSave(); return dev;
    },
    async deleteDevice(id) {
      if (conn().mode === "api") return http("DELETE", "/api/devices/" + id);
      const st = demoState();
      st.devices = st.devices.filter((x) => x.id !== id);
      st.channels = st.channels.filter((c) => c.device_id !== id);
      demoSave();
    },
    async testDevice(id) {
      if (conn().mode === "api") return http("POST", "/api/devices/" + id + "/test");
      const st = demoState();
      const d = st.devices.find((x) => x.id === id);
      await sleep(900);
      const steps = [{ ok: null, text: "SIMULAÇÃO: o painel está em modo demonstração e não conectou no DVR. Para um teste real, ligue o painel à API do monitor em Configurações." }];
      if (!d.host) {
        steps.push({ ok: false, text: "Sem IP/hostname. Conexão " + (d.p2p_mode || d.mode || "P2P") + " não tem rota direta para o servidor." });
        steps.push({ ok: null, text: "Cadastre o IP da VPN/Tailscale/MikroTik para monitorar este DVR." });
        return { ok: false, status: d.status, steps, simulated: true };
      }
      const down = d.status === "OFFLINE";
      steps.push({ ok: !down, text: `TCP ${d.host}:${d.port} ` + (down ? `sem resposta (timeout ${st.settings.timeout_s} s × ${st.settings.retries})` : `respondeu em ${d.latency_ms || 32} ms`) });
      if (!down) {
        steps.push({ ok: true, text: `RTSP ${d.host}:${d.rtsp_port} aberto` });
        const auth = d.status !== "ERRO_AUTENTICACAO";
        steps.push({ ok: auth, text: auth ? "Autenticação aceita (usuário " + (d.username || "—") + ")" : "Autenticação recusada (401)" });
      }
      d.last_check = nowIso(); demoSave();
      return { ok: !down && d.status !== "ERRO_AUTENTICACAO", status: d.status, steps, simulated: true };
    },
    async discoverOnvif(id) {
      if (conn().mode === "api") return http("POST", "/api/devices/" + id + "/onvif/discover");
      const st = demoState();
      const d = st.devices.find((x) => x.id === id);
      await sleep(1300);
      if (!d.host) return { supported: false, reason: "DVR sem IP acessível. Em P2P/Relay o servidor não alcança o ONVIF; é preciso VPN ou integração do fabricante." };
      if (d.status === "OFFLINE") return { supported: false, reason: "DVR offline: o serviço ONVIF não respondeu." };
      const n = d.channels || 4;
      const profiles = Array.from({ length: n }, (_, i) => ({ token: "MediaProfile" + String(i).padStart(3, "0"), source: "VideoSource_" + (i + 1), channel: i + 1, encoding: "H.264", resolution: i % 2 ? "1280x720" : "1920x1080", rtsp: `rtsp://${d.host}:${d.rtsp_port}/cam/realmonitor?channel=${i + 1}&subtype=0` }));
      d.onvif = { supported: true, firmware: "4.001.0000000.3", profiles: n };
      demoEvent(st, d, null, "ONVIF", `ONVIF: ${n} perfis de mídia encontrados.`); demoSave();
      return { supported: true, info: { manufacturer: d.manufacturer || "Intelbras", model: d.model, firmware: "4.001.0000000.3", serial: d.serial }, profiles: profiles.map((p) => Object.assign({}, p, { rtsp: p.rtsp.replace(/\/\/[^/]+/, "//***") })) };
    },
    async syncChannels(id, profiles) {
      if (conn().mode === "api") return http("POST", "/api/devices/" + id + "/channels/sync", { profiles: profiles.map((p) => p.token) });
      const st = demoState();
      const d = st.devices.find((x) => x.id === id);
      let created = 0;
      profiles.forEach((p) => {
        if (!st.channels.some((c) => c.device_id === id && c.number === p.channel)) { st.channels.push({ id: ++st.seq, device_id: id, number: p.channel, name: "Canal " + p.channel, status: "NAO_VERIFICADO", resolution: p.resolution, fps: null, last_check: null, last_frame: null, status_since: nowIso() }); created++; }
      });
      d.channels = Math.max(d.channels, ...profiles.map((p) => p.channel));
      demoSave(); return { created, kept: profiles.length - created };
    },

    // ----- canais -----
    async saveChannel(c) {
      if (conn().mode === "api") return c.id ? http("PUT", "/api/channels/" + c.id, c) : http("POST", "/api/channels", c);
      const st = demoState();
      if (st.channels.some((x) => x.device_id === c.device_id && x.number === c.number && x.id !== c.id)) throw new ApiError("Esse DVR já tem um canal com esse número.", 409);
      if (c.id) Object.assign(st.channels.find((x) => x.id === c.id), c);
      else st.channels.push(Object.assign({ id: ++st.seq, status: "NAO_VERIFICADO", fps: null, last_check: null, last_frame: null, status_since: nowIso() }, c));
      demoSave(); return c;
    },
    async deleteChannel(id) {
      if (conn().mode === "api") return http("DELETE", "/api/channels/" + id);
      const st = demoState(); st.channels = st.channels.filter((c) => c.id !== id); demoSave();
    },
    // Foto do canal (JPEG). Vai com o token no cabeçalho, por isso não dá para usar a URL direto no <img>.
    async snapshotBlob(id) {
      const c = conn();
      if (c.mode !== "api") return null;
      const headers = {};
      if (c.apiToken) headers.Authorization = "Bearer " + c.apiToken;
      try {
        const res = await fetch(c.apiBase + "/api/channels/" + id + "/snapshot", { headers });
        if (!res.ok) return null;
        return await res.blob();
      } catch (e) { return null; }
    },
    async testChannel(id) {
      if (conn().mode === "api") return http("POST", "/api/channels/" + id + "/test");
      const st = demoState();
      const c = st.channels.find((x) => x.id === id);
      const d = st.devices.find((x) => x.id === c.device_id);
      await sleep(1100);
      const steps = [{ ok: null, text: "SIMULAÇÃO: modo demonstração, nenhuma conexão real com a câmera." }];
      if (!d.host) return { ok: false, status: c.status, steps: [{ ok: false, text: "DVR sem rota direta (P2P/Relay). Não é possível abrir o RTSP." }] };
      if (d.status === "OFFLINE") return { ok: false, status: "OFFLINE", steps: [{ ok: false, text: "DVR offline: o canal não pode ser testado." }] };
      if (d.status === "ERRO_AUTENTICACAO") return { ok: false, status: "ERRO_AUTENTICACAO", steps: [{ ok: false, text: "RTSP recusou as credenciais (401)." }] };
      steps.push({ ok: true, text: "ffprobe: conexão RTSP aberta (TCP)" });
      if (c.status === "SEM_VIDEO") {
        steps.push({ ok: false, text: `Nenhum quadro recebido em ${st.settings.rtsp_timeout_s} s (câmera sem sinal ou desconectada do DVR)` });
      } else {
        steps.push({ ok: true, text: `Stream H.264 ${c.resolution || "1920x1080"} @ ${c.fps || 15} fps` });
        steps.push({ ok: true, text: "3 quadros decodificados; imagem não congelada (hash diferente)" });
        c.status = "TRANSMITINDO"; c.last_frame = nowIso();
      }
      c.last_check = nowIso(); demoSave();
      return { ok: c.status === "TRANSMITINDO", status: c.status, steps, simulated: true };
    },

    // ----- alertas, configurações, monitor -----
    ackAlert(key) { const a = lsGet(LS_ACK, {}); a[key] = Date.now(); lsSet(LS_ACK, a); },
    async saveSettings(s) {
      if (conn().mode === "api") return http("PUT", "/api/settings", s);
      const st = demoState(); Object.assign(st.settings, s); demoSave(); return st.settings;
    },
    async testSlack() {
      if (conn().mode === "api") return http("POST", "/api/slack/test");
      const st = demoState(); await sleep(700);
      const d = st.devices[0];
      demoEvent(st, d, null, "SLACK_TESTE", "Mensagem de teste enviada ao Slack (simulação).", { slack: true }); demoSave();
      return { ok: true, message: "Teste simulado. No modo API, a mensagem vai pelo webhook configurado no servidor." };
    },
    async runNow() {
      if (conn().mode === "api") return http("POST", "/api/monitor/run");
      await sleep(500);
      return { changes: demoTick() };
    },
    tick() { return conn().mode === "demo" ? demoTick() : []; },
    resetDemo() { demo = seedDemo(); demoSave(); lsSet(LS_ACK, {}); },
  };
  window.DB = DB;
})();
