/* Potencial CFTV · interface do painel (SPA sem dependências). */
(function () {
  "use strict";
  const DB = window.DB;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------------------------------------------------------------- ícones
  const I = {
    dashboard: '<path d="M3 3h8v10H3zM13 3h8v6h-8zM13 11h8v10h-8zM3 15h8v6H3z"/>',
    loja: '<path d="M3 9l1.5-5h15L21 9M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v8h14v-8M10 21v-5h4v5"/>',
    dvr: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h.01M10 12h.01M15 10h4M15 14h4"/>',
    canal: '<path d="M3 8h11l5-3v12l-5-3H3z"/><circle cx="8" cy="11" r="1.5"/>',
    monitor: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    alerta: '<path d="M12 3l9.5 17h-19zM12 10v4M12 17.5h.01"/>',
    historico: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
    relatorio: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 17v-3M12 17v-6M16 17v-2"/>',
    config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    play: '<path d="M6 4l14 8-14 8z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/>',
    sync: '<path d="M4 4v6h6M20 20v-6h-6M20 10A8 8 0 0 0 6 6L4 10M4 14a8 8 0 0 0 14 4l2-4"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    slack: '<path d="M14.5 10a1.5 1.5 0 0 1 0-3h5a1.5 1.5 0 0 1 0 3zM10 9.5a1.5 1.5 0 0 1-3 0v-5a1.5 1.5 0 0 1 3 0zM9.5 14a1.5 1.5 0 0 1 0 3h-5a1.5 1.5 0 0 1 0-3zM14 14.5a1.5 1.5 0 0 1 3 0v5a1.5 1.5 0 0 1-3 0z"/>',
    chev: '<path d="M9 18l6-6-6-6"/>',
    theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor"/>',
  };
  const ic = (n, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra || ""}>${I[n] || ""}</svg>`;

  // ---------------------------------------------------------------- formatação
  const pad = (n) => String(n).padStart(2, "0");
  function fmtDate(iso, withYear) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}${withYear ? "/" + d.getFullYear() : ""} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fmtAgo(iso) {
    if (!iso) return "nunca";
    const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
    if (s < 0) return "agora";
    if (s < 60) return `há ${s} s`;
    if (s < 3600) return `há ${Math.round(s / 60)} min`;
    if (s < 86400) return `há ${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
    return `há ${Math.floor(s / 86400)} d`;
  }
  function shortAgo(iso) {
    const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
    return s < 60 ? "agora" : s < 3600 ? Math.round(s / 60) + " min" : s < 86400 ? Math.floor(s / 3600) + " h" : Math.floor(s / 86400) + " d";
  }
  const since = (iso) => (iso ? DB.fmtDur(Math.round((Date.now() - Date.parse(iso)) / 1000)) : "—");
  const pct = (v) => (v == null || isNaN(v) ? "—" : (v * 100).toFixed(v >= 0.9995 ? 1 : 2).replace(".", ",") + "%");
  const num = (v) => Number(v || 0).toLocaleString("pt-BR");

  function devBadge(st) {
    const s = DB.DEV_STATUS[st] || DB.DEV_STATUS.NAO_VERIFICADO;
    return `<span class="badge ${s.cls} ${st === "OFFLINE" ? "pulse" : ""}">${s.label}</span>`;
  }
  function chBadge(st) {
    const s = DB.CH_STATUS[st] || DB.CH_STATUS.NAO_VERIFICADO;
    return `<span class="badge ${s.cls}">${s.label}</span>`;
  }
  const HEALTH = {
    CRITICO: { label: "Crítica", cls: "s-bad", color: "var(--bad)" },
    ATENCAO: { label: "Atenção", cls: "s-orange", color: "var(--orange)" },
    OK: { label: "Operando", cls: "s-ok", color: "var(--ok)" },
    NAO_VERIFICADO: { label: "Não verificada", cls: "s-warn", color: "var(--warn)" },
    SEM_DVR: { label: "Sem DVR", cls: "s-idle", color: "var(--idle)" },
  };
  const healthBadge = (h) => `<span class="badge ${HEALTH[h].cls}">${HEALTH[h].label}</span>`;
  const evLabel = (t) => (DB.EVENT_TYPES[t] || { label: t }).label;
  function evBadge(t) {
    const sev = (DB.EVENT_TYPES[t] || {}).sev;
    const cls = sev === "critico" ? "s-bad" : sev === "atencao" ? "s-orange" : sev === "ok" ? "s-ok" : "s-info";
    return `<span class="badge ${cls}">${esc(evLabel(t))}</span>`;
  }

  // ---------------------------------------------------------------- estado
  let S = null;
  let lastLoad = 0;
  const idx = { store: {}, dev: {}, ch: {}, devByStore: {}, chByDev: {} };
  function index() {
    idx.store = {}; idx.dev = {}; idx.ch = {}; idx.devByStore = {}; idx.chByDev = {};
    S.stores.forEach((s) => { idx.store[s.id] = s; idx.devByStore[s.id] = []; });
    S.devices.forEach((d) => { idx.dev[d.id] = d; idx.chByDev[d.id] = []; (idx.devByStore[d.store_id] = idx.devByStore[d.store_id] || []).push(d); });
    S.channels.forEach((c) => { idx.ch[c.id] = c; (idx.chByDev[c.device_id] = idx.chByDev[c.device_id] || []).push(c); });
    Object.values(idx.chByDev).forEach((l) => l.sort((a, b) => a.number - b.number));
    S.stores.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }
  const storeName = (id) => (idx.store[id] || {}).name || "—";
  const chOfStore = (sid) => (idx.devByStore[sid] || []).flatMap((d) => idx.chByDev[d.id] || []);
  function storeHealth(sid) {
    const devs = idx.devByStore[sid] || [];
    if (!devs.length) return "SEM_DVR";
    if (devs.some((d) => d.status === "OFFLINE" || d.status === "ERRO_AUTENTICACAO")) return "CRITICO";
    if (devs.some((d) => d.status === "INSTAVEL") || chOfStore(sid).some((c) => c.status === "SEM_VIDEO")) return "ATENCAO";
    if (devs.every((d) => d.status === "NAO_VERIFICADO")) return "NAO_VERIFICADO";
    return "OK";
  }
  const connOf = (d) => (d.host ? d.mode || "IP direto" : d.p2p_mode || d.mode || "P2P");

  async function reload(silent) {
    try {
      S = await DB.load();
      index();
      lastLoad = Date.now();
      updateChrome();
      return true;
    } catch (e) {
      if (!silent) {
        $("#content").innerHTML = `<div class="callout bad">${ic("alerta")}<div><b>Não foi possível carregar os dados.</b><br>${esc(e.message)}<br><br><a href="#/configuracoes?tab=conexao">Abrir Configurações › Conexão</a></div></div>`;
      }
      toast(e.message, "bad");
      return false;
    }
  }

  // ---------------------------------------------------------------- menu / chrome
  const PAGES = [
    ["dashboard", "Dashboard", "dashboard"], ["lojas", "Lojas", "loja"], ["dvrs", "DVRs", "dvr"], ["canais", "Canais", "canal"],
    ["monitoramento", "Monitoramento", "monitor"], ["alertas", "Alertas", "alerta"], ["historico", "Histórico", "historico"],
    ["relatorios", "Relatórios", "relatorio"], ["configuracoes", "Configurações", "config"],
  ];
  function updateChrome() {
    const route = parseHash().page;
    const nAlert = S ? S.alerts.filter((a) => !a.ack).length : 0;
    $("#nav").innerHTML = PAGES.map(([id, label, icon]) => `<a href="#/${id}" class="${route === id ? "active" : ""}">${ic(icon)}<span>${label}</span>${id === "alertas" && nAlert ? `<span class="count">${nAlert}</span>` : ""}</a>`).join("");
    const c = DB.conn();
    $("#sidebarFoot").innerHTML = `<div style="margin-bottom:6px">${c.mode === "demo" ? '<span class="mode-pill demo">● Modo demonstração</span>' : '<span class="mode-pill api">● Conectado à API</span>'}</div>
      <div>${c.mode === "demo" ? "Dados simulados no navegador. Nada real é alterado." : esc(c.apiBase || "mesma origem")}</div>
      <button class="btn sm theme-btn" data-act="theme">${ic("theme")} Tema: ${({ light: "claro", dark: "escuro" })[themeGet()] || "do sistema"}</button>${loginUser() ? `
      <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span>Conectado como <b>${esc(loginUser())}</b></span><a class="btn sm" href="/sair">Sair</a></div>` : ""}`;
    const crit = S && S.alerts.some((a) => a.severity === "critico" && !a.ack);
    $("#sealDot").style.background = crit ? "var(--bad)" : "var(--ok)";
  }
  // Usuário do login da Vercel (cookie informativo gravado pelo middleware.js).
  function loginUser() {
    const m = document.cookie.match(/(?:^|;\s*)cftv_usuario=([^;]+)/);
    try { return m ? decodeURIComponent(m[1]) : ""; } catch (e) { return ""; }
  }
  function tickInfo() {
    if (!lastLoad) return;
    $("#refreshInfo").textContent = "Atualizado " + fmtAgo(new Date(lastLoad).toISOString());
  }

  // ---------------------------------------------------------------- router
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const [page, qs] = h.split("?");
    const params = Object.fromEntries(new URLSearchParams(qs || ""));
    return { page: page || "dashboard", params };
  }
  function go(page, params) {
    const qs = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== "" && v != null)).toString();
    location.hash = "#/" + page + (qs ? "?" + qs : "");
  }
  function setParam(k, v) {
    const { page, params } = parseHash();
    params[k] = v;
    go(page, params);
  }
  const VIEWS = {};
  let currentPage = null;
  function render() {
    if (!S) return;
    const { page, params } = parseHash();
    const view = VIEWS[page] || VIEWS.dashboard;
    const keepScroll = currentPage === page;
    const y = window.scrollY;
    currentPage = page;
    const out = view(params);
    $("#pageTitle").textContent = out.title;
    $("#pageSub").textContent = out.sub || "";
    document.title = out.title + " · Potencial CFTV";
    $("#content").innerHTML = out.html;
    hydrateSnaps($("#content"));
    if (out.after) out.after();
    updateChrome();
    document.body.classList.remove("nav-open");
    if (keepScroll) window.scrollTo(0, y);
  }

  // ---------------------------------------------------------------- UI helpers
  function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.innerHTML = msg;
    $("#toasts").appendChild(t);
    setTimeout(() => t.remove(), 5200);
  }
  function openModal(html, opts) {
    opts = opts || {};
    const ov = document.createElement("div");
    ov.className = "overlay" + (opts.drawer ? " drawer-ov" : "");
    ov.innerHTML = `<div class="${opts.drawer ? "drawer" : "modal " + (opts.size || "")}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(ov);
    const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); if (opts.onClose) opts.onClose(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    $$("[data-close]", ov).forEach((b) => b.addEventListener("click", close));
    const f = $("input, select, textarea", ov);
    if (f && !opts.drawer) setTimeout(() => f.focus(), 30);
    return { el: ov, close };
  }
  function modalHead(title, sub) {
    return `<div class="modal-h"><div style="flex:1"><h3>${title}</h3>${sub ? `<div class="muted" style="font-size:12.5px">${sub}</div>` : ""}</div><button class="btn icon ghost" data-close aria-label="Fechar">${ic("x")}</button></div>`;
  }
  function confirmBox(title, msg, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let done = false;
      const m = openModal(`${modalHead(title)}<div class="modal-b"><p style="margin:0 0 12px">${msg}</p>
        ${opts.requireText ? `<div class="field"><label>Para confirmar, digite <b>${esc(opts.requireText)}</b></label><input class="input" id="cfTxt" autocomplete="off"></div>` : ""}</div>
        <div class="modal-f"><button class="btn" data-close>Cancelar</button><button class="btn ${opts.danger ? "danger" : "primary"}" id="cfOk" ${opts.requireText ? "disabled" : ""}>${opts.ok || "Confirmar"}</button></div>`,
        { size: "sm", onClose: () => { if (!done) resolve(false); } });
      const ok = $("#cfOk", m.el);
      if (opts.requireText) $("#cfTxt", m.el).addEventListener("input", (e) => { ok.disabled = e.target.value.trim() !== opts.requireText; });
      ok.addEventListener("click", () => { done = true; m.close(); resolve(true); });
    });
  }
  async function busy(btn, fn) {
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>';
    try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = html; }
  }
  function downloadCsv(name, rows) {
    const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? "selected" : ""}>${esc(label)}</option>`;
  const storeOptions = (cur, all) => (all ? opt("", all, cur) : "") + S.stores.map((s) => opt(s.id, s.name, cur)).join("");

  // ---------------------------------------------------------------- gráficos SVG
  function donut(segs, opts) {
    opts = opts || {};
    const total = segs.reduce((a, s) => a + s.value, 0);
    const R = 52, C = 2 * Math.PI * R;
    let off = 0;
    const arcs = segs.filter((s) => s.value > 0).map((s) => {
      const len = (s.value / (total || 1)) * C;
      const el = `<circle class="seg" data-go="${esc(s.go || "")}" r="${R}" cx="70" cy="70" fill="none" stroke="${s.color}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(s.label)}: ${s.value}</title></circle>`;
      off += len;
      return el;
    }).join("");
    const main = opts.center != null ? opts.center : total;
    return `<div class="donut-wrap"><svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label="${esc(opts.aria || "")}">
      <circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--bg-2)" stroke-width="18"/>${arcs}
      <text x="70" y="68" text-anchor="middle" fill="var(--text)" font-size="19" font-weight="700">${esc(main)}</text>
      <text x="70" y="88" text-anchor="middle" fill="var(--muted)" font-size="11">${esc(opts.sub || "total")}</text></svg>
      <div class="legend">${segs.map((s) => `<span class="clickable" data-go="${esc(s.go || "")}" style="padding:2px 4px;border-radius:5px"><i style="background:${s.color}"></i>${esc(s.label)}<b>${s.value}</b></span>`).join("")}</div></div>`;
  }
  function dayBars(days, keys) {
    const W = 640, H = 190, pl = 28, pb = 22, pt = 8;
    const max = Math.max(1, ...days.map((d) => keys.reduce((a, k) => a + d[k.k], 0)));
    const step = Math.ceil(max / 4);
    const top = step * 4;
    const bw = (W - pl) / days.length;
    let g = "";
    for (let i = 0; i <= 4; i++) {
      const y = pt + (H - pt - pb) * (1 - i / 4);
      g += `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-dasharray="${i ? "3 4" : ""}"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" fill="var(--faint)" font-size="10">${step * i}</text>`;
    }
    days.forEach((d, i) => {
      let y = H - pb;
      const x = pl + i * bw + bw * 0.18;
      keys.forEach((k) => {
        const h = (d[k.k] / top) * (H - pt - pb);
        if (h > 0) { y -= h; g += `<rect class="seg" data-go="${esc(d.go)}" x="${x}" y="${y}" width="${bw * 0.64}" height="${h}" rx="2" fill="${k.color}"><title>${d.label}: ${d[k.k]} ${k.label.toLowerCase()}</title></rect>`; }
      });
      if (days.length <= 14 || i % Math.ceil(days.length / 10) === 0) g += `<text x="${x + bw * 0.32}" y="${H - 6}" text-anchor="middle" fill="var(--faint)" font-size="10">${d.short}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:200px">${g}</svg>
      <div class="legend" style="margin-top:8px">${keys.map((k) => `<span><i style="background:${k.color}"></i>${k.label}</span>`).join("")}</div>`;
  }

  // ---------------------------------------------------------------- cálculos
  function periodMs(days) { return days * 86400e3; }
  function downtime(evs, from, to) {
    // soma o tempo fora dentro da janela [from, to]
    return evs.reduce((acc, e) => {
      const a = Date.parse(e.ts);
      const b = e.open ? Date.now() : e.recovered_at ? Date.parse(e.recovered_at) : a + (e.duration_s || 0) * 1000;
      const s = Math.max(a, from), f = Math.min(b, to);
      return acc + Math.max(0, f - s);
    }, 0);
  }
  const DOWN_DEV = ["DVR_OFFLINE", "AUTH_FALHA", "SEM_COMUNICACAO"];
  function availability(days, filterStoreIds) {
    const to = Date.now(), from = to - periodMs(days), P = to - from;
    const rows = [];
    S.stores.forEach((s) => {
      if (filterStoreIds && !filterStoreIds.includes(s.id)) return;
      const devs = (idx.devByStore[s.id] || []).filter((d) => d.host || d.status !== "NAO_VERIFICADO");
      const evs = S.events.filter((e) => e.store_id === s.id && Date.parse(e.ts) <= to && (e.open || !e.recovered_at || Date.parse(e.recovered_at) >= from));
      const devDown = devs.reduce((a, d) => a + downtime(evs.filter((e) => e.device_id === d.id && !e.channel_id && DOWN_DEV.includes(e.type)), from, to), 0);
      const chs = chOfStore(s.id).filter((c) => devs.some((d) => d.id === c.device_id));
      const chDown = chs.reduce((a, c) => a + downtime(evs.filter((e) => e.channel_id === c.id && e.type === "CANAL_SEM_VIDEO"), from, to), 0)
        + devs.reduce((a, d) => a + downtime(evs.filter((e) => e.device_id === d.id && !e.channel_id && DOWN_DEV.includes(e.type)), from, to) * (idx.chByDev[d.id] || []).length, 0);
      const incid = evs.filter((e) => ["DVR_OFFLINE", "AUTH_FALHA", "CANAL_SEM_VIDEO", "DVR_INSTAVEL", "SEM_COMUNICACAO"].includes(e.type) && Date.parse(e.ts) >= from);
      const closed = incid.filter((e) => e.duration_s);
      rows.push({
        store: s, monitored: devs.length > 0,
        devAvail: devs.length ? 1 - devDown / (P * devs.length) : null,
        chAvail: chs.length ? 1 - chDown / (P * chs.length) : null,
        incidents: incid.length, devIncidents: incid.filter((e) => !e.channel_id).length, chIncidents: incid.filter((e) => e.channel_id).length,
        downMs: devDown, mttr: closed.length ? closed.reduce((a, e) => a + e.duration_s, 0) / closed.length : null,
        longest: incid.reduce((m, e) => Math.max(m, e.open ? (Date.now() - Date.parse(e.ts)) / 1000 : e.duration_s || 0), 0),
      });
    });
    return rows;
  }

  // ================================================================ DASHBOARD
  VIEWS.dashboard = function (p) {
    const days = Number(p.dias || 14);
    const fConn = p.conexao || "";
    const fHealth = p.situacao || "";
    let stores = S.stores.filter((s) => {
      const devs = idx.devByStore[s.id] || [];
      if (fConn && !devs.some((d) => connOf(d) === fConn)) return false;
      if (fHealth && storeHealth(s.id) !== fHealth) return false;
      return true;
    });
    const sids = stores.map((s) => s.id);
    const devs = S.devices.filter((d) => sids.includes(d.store_id));
    const chs = devs.flatMap((d) => idx.chByDev[d.id] || []);
    const cnt = (arr, k, v) => arr.filter((x) => x[k] === v).length;
    const alerts = S.alerts.filter((a) => sids.includes(a.store_id));
    const conns = [...new Set(S.devices.map(connOf))].sort();
    const qsBase = { conexao: fConn };

    const kpi = (label, value, foot, color, goto) => `<div class="card kpi click" style="--accent:${color}" data-go="${esc(goto)}"><span class="label">${label}</span><span class="value">${value}</span><span class="foot">${foot}</span></div>`;
    const devOn = cnt(devs, "status", "ONLINE"), devOff = cnt(devs, "status", "OFFLINE"), devNv = cnt(devs, "status", "NAO_VERIFICADO");
    const chOn = cnt(chs, "status", "TRANSMITINDO"), chNo = cnt(chs, "status", "SEM_VIDEO");
    const kpis = [
      kpi("Lojas", stores.length, `${stores.filter((s) => storeHealth(s.id) === "CRITICO").length} críticas`, "var(--line-2)", "#/lojas"),
      kpi("DVRs", devs.length, `${cnt(devs, "status", "INSTAVEL")} instáveis · ${cnt(devs, "status", "ERRO_AUTENTICACAO")} sem acesso`, "var(--line-2)", "#/dvrs"),
      kpi("DVRs online", devOn, devs.length ? pct(devOn / devs.length) + " do total" : "—", "var(--ok)", "#/dvrs?status=ONLINE"),
      kpi("DVRs offline", devOff, "sem resposta na rede", "var(--bad)", "#/dvrs?status=OFFLINE"),
      kpi("Não verificados", devNv, "sem rota direta / a confirmar", "var(--warn)", "#/dvrs?status=NAO_VERIFICADO"),
      kpi("Canais", chs.length, "câmeras cadastradas", "var(--line-2)", "#/canais"),
      kpi("Transmitindo", chOn, chs.length ? pct(chOn / chs.length) + " dos canais" : "—", "var(--ok)", "#/canais?status=TRANSMITINDO"),
      kpi("Sem vídeo", chNo, "DVR responde, câmera não", "var(--orange)", "#/canais?status=SEM_VIDEO"),
      kpi("Alertas ativos", alerts.filter((a) => !a.ack).length, `${alerts.filter((a) => a.severity === "critico").length} críticos`, "var(--bad)", "#/alertas"),
    ].join("");

    const devDonut = donut(Object.entries(DB.DEV_STATUS).map(([k, v]) => ({ label: v.label, value: cnt(devs, "status", k), color: v.color, go: "#/dvrs?status=" + k })), { center: devs.length ? pct(devOn / devs.length) : "—", sub: "online", aria: "Disponibilidade dos DVRs" });
    const chDonut = donut(Object.entries(DB.CH_STATUS).map(([k, v]) => ({ label: v.label, value: cnt(chs, "status", k), color: v.color, go: "#/canais?status=" + k })), { center: chs.length ? pct(chOn / chs.length) : "—", sub: "transmitindo", aria: "Disponibilidade dos canais" });

    // falhas por loja no período
    const from = Date.now() - periodMs(days);
    const INC = ["DVR_OFFLINE", "AUTH_FALHA", "CANAL_SEM_VIDEO", "DVR_INSTAVEL", "SEM_COMUNICACAO"];
    const evs = S.events.filter((e) => sids.includes(e.store_id) && INC.includes(e.type) && Date.parse(e.ts) >= from);
    const byStore = stores.map((s) => ({ s, dvr: evs.filter((e) => e.store_id === s.id && !e.channel_id).length, ch: evs.filter((e) => e.store_id === s.id && e.channel_id).length }))
      .map((r) => Object.assign(r, { t: r.dvr + r.ch })).filter((r) => r.t).sort((a, b) => b.t - a.t).slice(0, 10);
    const maxT = Math.max(1, ...byStore.map((r) => r.t));
    const bars = byStore.length ? `<div class="bars">${byStore.map((r) => `<div class="bar-row hbar" data-go="#/historico?loja=${r.s.id}&dias=${days}"><span class="name" title="${esc(r.s.name)}">${esc(r.s.name)}</span>
      <div class="bar-track"><span style="width:${(r.dvr / maxT) * 100}%;background:var(--bad)"></span><span style="width:${(r.ch / maxT) * 100}%;background:var(--orange)"></span></div><span class="v">${r.t}</span></div>`).join("")}</div>
      <div class="legend" style="margin-top:12px"><span><i style="background:var(--bad)"></i>Falhas de DVR</span><span><i style="background:var(--orange)"></i>Canais sem vídeo</span></div>` : `<div class="empty">Nenhuma falha no período.</div>`;

    // incidentes por dia
    const dayList = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const a = d.getTime(), b = a + 86400e3;
      const dayEv = evs.filter((e) => { const t = Date.parse(e.ts); return t >= a && t < b; });
      const iso = d.toISOString().slice(0, 10);
      dayList.push({ label: d.toLocaleDateString("pt-BR"), short: pad(d.getDate()) + "/" + pad(d.getMonth() + 1), crit: dayEv.filter((e) => !e.channel_id).length, warn: dayEv.filter((e) => e.channel_id).length, go: `#/historico?de=${iso}&ate=${iso}` });
    }
    const dayChart = dayBars(dayList, [{ k: "crit", label: "DVR", color: "var(--bad)" }, { k: "warn", label: "Canal", color: "var(--orange)" }]);

    // visão por loja
    const order = { CRITICO: 0, ATENCAO: 1, NAO_VERIFICADO: 2, OK: 3, SEM_DVR: 4 };
    const tiles = stores.slice().sort((a, b) => order[storeHealth(a.id)] - order[storeHealth(b.id)] || a.name.localeCompare(b.name)).map((s) => {
      const h = storeHealth(s.id);
      const cs = chOfStore(s.id);
      const dv = idx.devByStore[s.id] || [];
      return `<div class="tile" style="--c:${HEALTH[h].color}" data-store="${s.id}">
        <div style="display:flex;justify-content:space-between;gap:6px;align-items:center"><span class="t-name" title="${esc(s.name)}">${esc(s.name)}</span>${healthBadge(h)}</div>
        <div class="dots">${cs.length ? cs.map((c) => `<span class="dot" data-ch="${c.id}" title="Canal ${c.number} · ${esc(c.name)}: ${DB.CH_STATUS[c.status].label}" style="background:${DB.CH_STATUS[c.status].color}"></span>`).join("") : '<span class="faint" style="font-size:11.5px">Canais a confirmar</span>'}</div>
        <div class="t-meta"><span>${dv.map((d) => esc(connOf(d))).join(", ") || "—"}</span><span>${cs.filter((c) => c.status === "TRANSMITINDO").length}/${cs.length} câm.</span></div></div>`;
    }).join("");

    const alertList = alerts.filter((a) => !a.ack).slice(0, 6);
    const recent = S.events.filter((e) => sids.includes(e.store_id)).slice(0, 8);

    const sel = (name, cur, options) => `<select class="select" data-param="${name}">${options}</select>`;
    const html = `
      <div class="toolbar">
        ${sel("conexao", fConn, opt("", "Todas as conexões", fConn) + conns.map((c) => opt(c, c, fConn)).join(""))}
        ${sel("situacao", fHealth, opt("", "Todas as situações", fHealth) + Object.entries(HEALTH).map(([k, v]) => opt(k, v.label, fHealth)).join(""))}
        ${sel("dias", days, [7, 14, 30].map((d) => opt(d, `Últimos ${d} dias`, days)).join(""))}
        ${fConn || fHealth ? `<button class="btn ghost sm" data-go="#/dashboard">${ic("x")} Limpar filtros</button>` : ""}
        <span class="spacer"></span>
        <button class="btn" data-act="runNow">${ic("refresh")} Verificar agora</button>
      </div>
      <div class="grid kpis">${kpis}</div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><h3>Disponibilidade dos DVRs</h3><span class="spacer"></span><span class="sub">clique para filtrar</span></div><div class="card-b">${devDonut}</div></div>
        <div class="card"><div class="card-h"><h3>Disponibilidade dos canais</h3><span class="spacer"></span><span class="sub">clique para filtrar</span></div><div class="card-b">${chDonut}</div></div>
      </div>
      <div class="grid g3">
        <div class="card"><div class="card-h"><h3>Histórico de incidentes</h3><span class="sub">· ${days} dias</span><span class="spacer"></span><a href="#/historico?dias=${days}" class="sub">ver tudo</a></div><div class="card-b">${dayChart}</div></div>
        <div class="card"><div class="card-h"><h3>Falhas por loja</h3><span class="sub">· top 10</span></div><div class="card-b">${bars}</div></div>
      </div>
      <div class="card"><div class="card-h"><h3>Visão geral por loja</h3><span class="sub">${stores.length} lojas · cada quadradinho é uma câmera</span><span class="spacer"></span>
        <div class="legend">${Object.entries(DB.CH_STATUS).map(([, v]) => `<span><i style="background:${v.color}"></i>${v.label}</span>`).join("")}</div></div>
        <div class="card-b">${tiles ? `<div class="tiles">${tiles}</div>` : '<div class="empty">Nenhuma loja com esses filtros.</div>'}</div></div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><h3>Alertas ativos</h3><span class="spacer"></span><a href="#/alertas" class="sub">abrir alertas</a></div>
          <div class="card-b flush">${alertList.length ? `<table><tbody>${alertList.map((a) => `<tr class="clickable" data-alert="${esc(a.key)}"><td><div class="row-title">${esc(a.title)}</div><div class="row-sub">${esc(a.description)}</div></td><td>${evBadge(a.type)}</td><td class="num muted" style="white-space:nowrap">${since(a.since)}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">Nenhum alerta ativo. Tudo certo.</div>'}</div></div>
        <div class="card"><div class="card-h"><h3>Últimos eventos</h3><span class="spacer"></span><button class="btn sm" data-act="testSlack">${ic("slack")} Testar Slack</button></div>
          <div class="card-b flush">${recent.length ? `<table><tbody>${recent.map((e) => `<tr class="clickable" data-go="#/historico?loja=${e.store_id}"><td class="muted mono" style="white-space:nowrap">${fmtDate(e.ts)}</td><td><div class="row-title">${esc(storeName(e.store_id))}</div><div class="row-sub">${esc(e.description)}</div></td><td>${evBadge(e.type)}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">Nenhum evento registrado.</div>'}</div></div>
      </div>
      <div class="faint" style="font-size:12px">“Não verificado” não significa offline. Conexões P2P/Relay não confirmam conectividade de rede: o servidor precisa de rota (VPN, Tailscale, MikroTik) para checar o DVR.</div>`;
    return { title: "Monitoramento CFTV", sub: "Visão geral dos equipamentos e canais", html, after() { void qsBase; } };
  };

  // ================================================================ LOJAS
  VIEWS.lojas = function (p) {
    const q = (p.q || "").toLowerCase();
    const fh = p.situacao || "";
    const rows = S.stores.filter((s) => (!q || (s.name + " " + s.code + " " + s.city + " " + (idx.devByStore[s.id] || []).map((d) => d.serial).join(" ")).toLowerCase().includes(q)) && (!fh || storeHealth(s.id) === fh));
    const html = `
      <div class="toolbar">
        <div class="search">${ic("search")}<input class="input" data-param="q" placeholder="Buscar loja, cidade ou serial…" value="${esc(p.q || "")}"></div>
        <select class="select" data-param="situacao">${opt("", "Todas as situações", fh)}${Object.entries(HEALTH).map(([k, v]) => opt(k, v.label, fh)).join("")}</select>
        <span class="spacer"></span>
        <button class="btn primary" data-act="newStore">${ic("plus")} Nova loja</button>
      </div>
      <div class="card"><div class="card-h"><h3>Cadastro de lojas</h3><span class="sub">${rows.length} de ${S.stores.length}</span></div>
      <div class="card-b flush table-wrap"><table>
        <thead><tr><th>Unidade</th><th class="num">DVRs</th><th>Câmeras</th><th>Situação</th><th class="hide-sm">Última comunicação</th><th></th></tr></thead>
        <tbody>${rows.map((s) => {
          const dv = idx.devByStore[s.id] || [];
          const cs = chOfStore(s.id);
          const on = cs.filter((c) => c.status === "TRANSMITINDO").length;
          const last = dv.map((d) => d.last_seen).filter(Boolean).sort().pop();
          return `<tr class="clickable" data-store="${s.id}"><td><div class="row-title">${esc(s.name)}</div><div class="row-sub">${[s.code && "Cód. " + s.code, s.city].filter(Boolean).map(esc).join(" · ") || "&nbsp;"}</div></td>
            <td class="num">${dv.length}</td>
            <td><div style="display:flex;align-items:center;gap:8px"><div class="mini-bar">${miniBar(cs)}</div><span class="muted" style="font-size:12px">${on}/${cs.length}</span></div></td>
            <td>${healthBadge(storeHealth(s.id))}</td><td class="hide-sm muted">${last ? fmtAgo(last) : "—"}</td>
            <td><div class="actions"><button class="btn sm" data-act="editStore" data-id="${s.id}">${ic("edit")} Editar</button><button class="btn sm danger" data-act="delStore" data-id="${s.id}">${ic("trash")}</button></div></td></tr>`;
        }).join("") || `<tr><td colspan="6" class="empty">Nenhuma loja encontrada.</td></tr>`}</tbody></table></div></div>`;
    return { title: "Lojas", sub: "Gerenciamento das unidades", html };
  };
  function miniBar(cs) {
    if (!cs.length) return "";
    return Object.entries(DB.CH_STATUS).map(([k, v]) => { const n = cs.filter((c) => c.status === k).length; return n ? `<span style="width:${(n / cs.length) * 100}%;background:${v.color}"></span>` : ""; }).join("");
  }

  function storeForm(s) {
    s = s || { name: "", code: "", city: "", notes: "" };
    const m = openModal(`${modalHead(s.id ? "Editar loja" : "Nova loja")}<form id="fStore"><div class="modal-b"><div class="form">
      <div class="field full"><label>Nome da unidade *</label><input class="input" name="name" required maxlength="80" value="${esc(s.name)}"></div>
      <div class="field"><label>Código</label><input class="input" name="code" maxlength="20" value="${esc(s.code)}"></div>
      <div class="field"><label>Cidade / UF</label><input class="input" name="city" maxlength="60" value="${esc(s.city)}"></div>
      <div class="field full"><label>Observações</label><textarea class="input" name="notes" rows="3" maxlength="500">${esc(s.notes)}</textarea></div>
      </div></div><div class="modal-f"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`);
    $("#fStore", m.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      f.name = f.name.trim();
      if (f.name.length < 2) return toast("Informe o nome da loja.", "bad");
      try { await busy(e.submitter, () => DB.saveStore(Object.assign({}, s, f))); m.close(); toast("Loja salva.", "ok"); await reload(); render(); } catch (err) { toast(esc(err.message), "bad"); }
    });
  }

  function storeDrawer(id) {
    const s = idx.store[id];
    if (!s) return;
    const dv = idx.devByStore[id] || [];
    const evs = S.events.filter((e) => e.store_id === id).slice(0, 12);
    const av = availability(30, [id])[0];
    const m = openModal(`${modalHead(esc(s.name), [s.code && "Cód. " + s.code, s.city].filter(Boolean).map(esc).join(" · ") || "Loja")}
      <div class="modal-b" style="display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${healthBadge(storeHealth(id))}<span class="tag">Disponibilidade DVR 30 d: ${pct(av.devAvail)}</span><span class="tag">Canais 30 d: ${pct(av.chAvail)}</span><span class="tag">${av.incidents} incidentes</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="editStore" data-id="${id}">${ic("edit")} Editar loja</button><button class="btn sm" data-act="newDevice" data-store="${id}">${ic("plus")} Adicionar DVR</button><button class="btn sm" data-go="#/historico?loja=${id}">${ic("historico")} Histórico</button></div>
        ${dv.map((d) => `<div class="card"><div class="card-h clickable" data-dev="${d.id}"><div><h3>${esc(d.model || "DVR")} · <span class="mono">${esc(d.serial)}</span></h3><div class="sub">${d.host ? esc(d.host) + ":" + d.port : "Sem IP"} · ${esc(connOf(d))} · ${d.last_check ? "verificado " + fmtAgo(d.last_check) : "nunca verificado"}</div></div><span class="spacer"></span>${devBadge(d.status)}</div>
          ${camGrid(idx.chByDev[d.id] || [], d)}</div>`).join("") || '<div class="empty">Nenhum DVR vinculado a esta loja.</div>'}
        <div><h4 style="margin-bottom:8px;font-size:13px">Eventos recentes</h4>${evTable(evs, true)}</div>
      </div>`, { drawer: true });
    return m;
  }
  function evTable(evs, compact) {
    if (!evs.length) return '<div class="empty">Nenhum evento.</div>';
    return `<div class="table-wrap card"><table><thead><tr><th>Data</th>${compact ? "" : "<th>Loja</th>"}<th>Evento</th><th>Descrição</th><th class="num">Duração</th></tr></thead><tbody>
      ${evs.map((e) => `<tr><td class="mono muted" style="white-space:nowrap">${fmtDate(e.ts)}</td>${compact ? "" : `<td>${esc(storeName(e.store_id))}</td>`}<td>${evBadge(e.type)}</td><td>${e.channel_id && idx.ch[e.channel_id] ? `<span class="tag">Canal ${idx.ch[e.channel_id].number}</span> ` : ""}${esc(e.description)}</td><td class="num">${e.open ? '<span class="badge s-bad plain">em aberto · ' + since(e.ts) + "</span>" : DB.fmtDur(e.duration_s)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  // ================================================================ fotos dos canais
  // Cache em memória: id do canal -> { at, url } (URL de blob). A foto só é baixada de novo quando snapshot_at muda.
  const SNAP = new Map();
  const snapQueue = [];
  let snapActive = 0;
  function snapImg(c, cls) {
    if (!c.snapshot_at) return "";
    const hit = SNAP.get(c.id);
    const fresh = hit && hit.at === c.snapshot_at;
    return `<img class="${cls}" alt="Foto do canal ${c.number}" ${hit ? `src="${hit.url}"` : ""} ${fresh ? "" : `data-snap="${c.id}" data-at="${esc(c.snapshot_at)}"`}>`;
  }
  function pumpSnaps() {
    while (snapActive < 6 && snapQueue.length) {
      const img = snapQueue.shift();
      const id = Number(img.dataset.snap), at = img.dataset.at;
      const hit = SNAP.get(id);
      if (hit && hit.at === at) { showSnap(img, hit.url); continue; }
      snapActive++;
      DB.snapshotBlob(id).then((blob) => {
        if (!blob) return;
        const old = SNAP.get(id);
        if (old && old.at === at) { showSnap(img, old.url); return; }
        const url = URL.createObjectURL(blob);
        SNAP.set(id, { at, url });
        $$(`img[data-snap="${id}"]`).forEach((el) => showSnap(el, url));
        showSnap(img, url);
        if (old) setTimeout(() => URL.revokeObjectURL(old.url), 5000);
      }).finally(() => { snapActive--; pumpSnaps(); });
    }
  }
  function showSnap(img, url) {
    img.src = url;
    delete img.dataset.snap;
    const cam = img.closest(".cam");
    if (cam) cam.classList.add("has-snap");
    const big = img.closest(".snap-big");
    if (big) big.classList.add("loaded");
  }
  const snapObserver = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { snapObserver.unobserve(en.target); snapQueue.push(en.target); } });
    pumpSnaps();
  }, { rootMargin: "300px" }) : null;
  function hydrateSnaps(root) {
    if (DB.mode !== "api") return;
    $$("img[data-snap]", root).forEach((img) => { if (snapObserver) snapObserver.observe(img); else snapQueue.push(img); });
    if (!snapObserver) pumpSnaps();
  }

  // ================================================================ câmeras (quadradinhos)
  function camTile(c, d) {
    const st = DB.CH_STATUS[c.status] || DB.CH_STATUS.NAO_VERIFICADO;
    const cls = c.status === "OFFLINE" ? "off" : c.status === "SEM_VIDEO" ? "novideo" : "";
    const detail = c.status === "TRANSMITINDO" ? (c.fps ? c.fps + " fps · " : "") + (c.resolution || "") : c.status === "NAO_VERIFICADO" ? "aguardando teste" : "há " + since(c.status_since || c.last_frame);
    const hasSnap = c.snapshot_at && SNAP.has(c.id);
    return `<div class="cam ${cls} ${hasSnap ? "has-snap" : ""}" style="--c:${st.color}" data-ch="${c.id}" title="${esc((d ? storeName(d.store_id) + " · " : "") + "Canal " + c.number + " · " + c.name + (c.snapshot_at ? " · foto " + fmtAgo(c.snapshot_at) : ""))}">
      ${snapImg(c, "cam-img")}
      <div class="cam-ico">${ic("canal")}</div>
      <div class="cam-top"><span class="cam-n">CH ${pad(c.number)}</span>${c.snapshot_at ? `<span class="cam-age">${esc(shortAgo(c.snapshot_at))}</span>` : ""}<span class="cam-led ${c.status === "TRANSMITINDO" ? "live" : ""}"></span></div>
      <div class="cam-bot"><div class="cam-name">${esc(c.name)}</div><div class="cam-st">${st.label}</div><div class="faint" style="font-size:10.5px">${esc(detail)}</div></div></div>`;
  }
  function camGrid(chs, d) {
    if (!chs.length) return `<div class="cam-grid"><div class="cam empty" style="--c:var(--line-2)"><div class="cam-ico">${ic("canal")}</div><div class="cam-bot"><div class="cam-name">Canais a confirmar</div><div class="faint" style="font-size:10.5px">use Descobrir ONVIF ou cadastre</div></div></div></div>`;
    return `<div class="cam-grid">${chs.map((c) => camTile(c, d)).join("")}</div>`;
  }

  // ================================================================ DVRs
  VIEWS.dvrs = function (p) {
    const q = (p.q || "").toLowerCase();
    const fs = p.status || "", fc = p.conexao || "", fl = p.loja || "";
    const conns = [...new Set(S.devices.map(connOf))].sort();
    const rows = S.devices.filter((d) => (!q || [storeName(d.store_id), d.model, d.serial, d.host, d.manufacturer].join(" ").toLowerCase().includes(q)) && (!fs || d.status === fs) && (!fc || connOf(d) === fc) && (!fl || String(d.store_id) === fl))
      .sort((a, b) => storeName(a.store_id).localeCompare(storeName(b.store_id), "pt-BR"));
    const noRoute = S.devices.filter((d) => !d.host).length;
    const html = `
      <div class="toolbar">
        <div class="search">${ic("search")}<input class="input" data-param="q" placeholder="Buscar loja, modelo, serial ou IP…" value="${esc(p.q || "")}"></div>
        <select class="select" data-param="status">${opt("", "Todos os status", fs)}${Object.entries(DB.DEV_STATUS).map(([k, v]) => opt(k, v.label, fs)).join("")}</select>
        <select class="select" data-param="conexao">${opt("", "Todas as conexões", fc)}${conns.map((c) => opt(c, c, fc)).join("")}</select>
        <select class="select" data-param="loja">${storeOptions(fl, "Todas as lojas")}</select>
        <span class="spacer"></span>
        <button class="btn primary" data-act="newDevice">${ic("plus")} Novo DVR</button>
      </div>
      ${noRoute ? `<div class="callout warn">${ic("info")}<div><b>${noRoute} DVR(s) sem IP acessível</b> (P2P/Relay). O app do fabricante alcança esses equipamentos pela nuvem dele, mas o servidor não. Para monitorar, cadastre o IP pela VPN/Tailscale/MikroTik. Eles ficam como “Não verificado”, nunca como online.</div></div>` : ""}
      <div class="card"><div class="card-h"><h3>Equipamentos cadastrados</h3><span class="sub">${rows.length} de ${S.devices.length}</span></div>
      <div class="card-b flush table-wrap"><table>
        <thead><tr><th>Loja</th><th>Modelo / Serial</th><th class="hide-sm">IP / Porta</th><th>Conexão</th><th class="num">Canais</th><th>Status</th><th class="hide-sm">Última comunicação</th><th></th></tr></thead>
        <tbody>${rows.map((d) => `<tr class="clickable" data-dev="${d.id}">
          <td class="row-title">${esc(storeName(d.store_id))}</td>
          <td><div>${esc(d.model || "—")}</div><div class="row-sub mono">${esc(d.serial)}</div></td>
          <td class="hide-sm mono">${d.host ? esc(d.host) + ":" + d.port : '<span class="faint">Não configurado : ' + d.port + "</span>"}</td>
          <td><span class="tag">${esc(connOf(d))}</span></td>
          <td class="num">${d.channels || '<span class="faint">a confirmar</span>'}</td>
          <td>${devBadge(d.status)}${d.latency_ms ? `<div class="row-sub">${d.latency_ms} ms</div>` : ""}</td>
          <td class="hide-sm muted">${d.last_seen ? fmtAgo(d.last_seen) : "—"}</td>
          <td><div class="actions"><button class="btn sm" data-act="testDev" data-id="${d.id}" title="Testar conectividade">${ic("play")} Testar</button><button class="btn sm hide-sm" data-act="editDev" data-id="${d.id}">${ic("edit")}</button><button class="btn sm danger hide-sm" data-act="delDev" data-id="${d.id}">${ic("trash")}</button></div></td></tr>`).join("") || `<tr><td colspan="8" class="empty">Nenhum DVR encontrado.</td></tr>`}</tbody></table></div></div>`;
    return { title: "DVRs", sub: "Cadastro e gerenciamento dos equipamentos", html };
  };

  function deviceForm(d, presetStore) {
    const isNew = !d;
    d = d || { store_id: presetStore ? Number(presetStore) : "", manufacturer: "Intelbras", model: "", serial: "", host: "", port: 37777, rtsp_port: 554, onvif_port: 80, mode: "VPN", protocol: "ONVIF + RTSP", username: "", channels: 4, poll_interval: 60, has_password: false };
    const modes = ["VPN", "Tailscale", "MikroTik", "IP direto", "DDNS", "P2P", "Relay"];
    const protos = ["ONVIF + RTSP", "RTSP", "ONVIF", "Proprietário (SDK)", "A confirmar"];
    const m = openModal(`${modalHead(isNew ? "Novo DVR" : "Editar DVR", isNew ? "" : esc(storeName(d.store_id)) + " · " + esc(d.serial))}<form id="fDev" autocomplete="off"><div class="modal-b"><div class="form">
      <div class="section-t">Identificação</div>
      <div class="field full"><label>Loja *</label><select class="select" name="store_id" required>${opt("", "Selecione…", d.store_id)}${S.stores.map((s) => opt(s.id, s.name, d.store_id)).join("")}</select></div>
      <div class="field"><label>Fabricante</label><input class="input" name="manufacturer" list="mfList" value="${esc(d.manufacturer)}"><datalist id="mfList"><option>Intelbras</option><option>Dahua</option><option>Hikvision</option><option>Jfl</option><option>Giga</option></datalist></div>
      <div class="field"><label>Modelo</label><input class="input" name="model" value="${esc(d.model)}"></div>
      <div class="field"><label>Número de série *</label><input class="input mono" name="serial" required value="${esc(d.serial)}"></div>
      <div class="field"><label>Canais *</label><input class="input" type="number" name="channels" min="0" max="128" value="${esc(d.channels)}"><span class="hint">Reduzir não apaga canais sem sua confirmação.</span></div>
      <div class="section-t">Rede</div>
      <div class="field"><label>Tipo de conexão</label><select class="select" name="mode">${modes.map((x) => opt(x, x, d.mode)).join("")}</select></div>
      <div class="field"><label>IP ou hostname</label><input class="input mono" name="host" placeholder="10.20.1.10 ou loja.ddns.net" value="${esc(d.host)}"><span class="hint">Deixe vazio se ainda não houver rota (P2P/Relay).</span></div>
      <div class="field"><label>Porta de serviço</label><input class="input" type="number" name="port" min="1" max="65535" value="${esc(d.port)}"></div>
      <div class="field"><label>Porta RTSP</label><input class="input" type="number" name="rtsp_port" min="1" max="65535" value="${esc(d.rtsp_port)}"></div>
      <div class="field"><label>Porta ONVIF (HTTP)</label><input class="input" type="number" name="onvif_port" min="1" max="65535" value="${esc(d.onvif_port)}"></div>
      <div class="field"><label>Protocolo</label><select class="select" name="protocol">${protos.map((x) => opt(x, x, d.protocol)).join("")}</select></div>
      <div class="field"><label>Intervalo de verificação (s)</label><input class="input" type="number" name="poll_interval" min="15" max="3600" value="${esc(d.poll_interval || 60)}"></div>
      <div class="section-t">Credenciais</div>
      <div class="field"><label>Usuário</label><input class="input" name="username" autocomplete="off" value="${esc(d.username)}"></div>
      <div class="field"><label>Senha</label><input class="input" type="password" name="password" autocomplete="new-password" placeholder="${d.has_password ? "•••••••• (mantida)" : "não cadastrada"}"><span class="hint">Enviada só ao servidor e guardada criptografada. Nunca é exibida.</span></div>
      <div class="field full" id="chWarn"></div>
      </div></div><div class="modal-f"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`);
    const form = $("#fDev", m.el);
    const existing = isNew ? 0 : (idx.chByDev[d.id] || []).length;
    const warnBox = $("#chWarn", form);
    const checkCh = () => {
      const n = Number(form.channels.value);
      const extra = (idx.chByDev[d.id] || []).filter((c) => c.number > n);
      warnBox.innerHTML = !isNew && extra.length ? `<div class="callout warn">${ic("alerta")}<div>Este DVR tem ${existing} canais cadastrados. Os canais ${extra.map((c) => c.number).join(", ")} ficam acima do novo total.
        <label class="check" style="margin-top:8px"><input type="checkbox" name="removeExtra"> Apagar esses canais e o vínculo deles (ação definitiva)</label>
        <div class="faint" style="font-size:12px;margin-top:4px">Sem marcar, os canais são mantidos.</div></div></div>` : "";
    };
    form.channels.addEventListener("input", checkCh);
    checkCh();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const removeExtra = !!f.removeExtra; delete f.removeExtra;
      ["store_id", "port", "rtsp_port", "onvif_port", "channels", "poll_interval"].forEach((k) => (f[k] = Number(f[k])));
      f.serial = f.serial.trim(); f.host = f.host.trim();
      if (!f.store_id) return toast("Selecione a loja.", "bad");
      if (!f.serial) return toast("Informe o número de série.", "bad");
      if (f.host && !/^[a-zA-Z0-9.-]+$/.test(f.host)) return toast("IP ou hostname inválido.", "bad");
      if (f.poll_interval < 15 || f.poll_interval > 3600) return toast("Intervalo deve ficar entre 15 e 3.600 s.", "bad");
      f.p2p_mode = ["P2P", "Relay"].includes(f.mode) ? f.mode : d.p2p_mode || "";
      try {
        await busy(e.submitter, () => DB.saveDevice(Object.assign({}, d, f), { removeExtraChannels: removeExtra }));
        m.close(); toast("DVR salvo.", "ok"); await reload(); render();
      } catch (err) { toast(esc(err.message), "bad"); }
    });
  }

  function deviceDrawer(id, tab) {
    const d = idx.dev[id];
    if (!d) return;
    tab = tab || "canais";
    const chs = idx.chByDev[id] || [];
    const evs = S.events.filter((e) => e.device_id === id);
    const av7 = availDev(d, 7), av30 = availDev(d, 30);
    const html = `${modalHead(esc(storeName(d.store_id)) + " · DVR", esc(d.model || "") + " · " + esc(d.serial))}
      <div class="modal-b" style="display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${devBadge(d.status)}<span class="muted" style="font-size:12.5px">desde ${fmtDate(d.status_since)} (${since(d.status_since)})</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn sm" data-act="testDev" data-id="${id}">${ic("play")} Testar conectividade</button>
          <button class="btn sm" data-act="onvif" data-id="${id}">${ic("radar")} Descobrir ONVIF</button>
          <button class="btn sm" data-act="editDev" data-id="${id}">${ic("edit")} Editar</button>
          <button class="btn sm danger" data-act="delDev" data-id="${id}">${ic("trash")} Excluir</button>
        </div>
        <dl class="kv">
          <dt>Fabricante / modelo</dt><dd>${esc([d.manufacturer, d.model].filter(Boolean).join(" ") || "—")}</dd>
          <dt>Endereço</dt><dd class="mono">${d.host ? esc(d.host) + ":" + d.port + " · RTSP " + d.rtsp_port + " · ONVIF " + d.onvif_port : "Sem IP acessível (" + esc(connOf(d)) + ")"}</dd>
          <dt>Conexão / protocolo</dt><dd>${esc(connOf(d))} · ${esc(d.protocol || "—")}</dd>
          <dt>Credenciais</dt><dd>${d.username ? esc(d.username) + " · senha " + (d.has_password ? "cadastrada (protegida)" : "não cadastrada") : "não cadastradas"}</dd>
          <dt>Intervalo</dt><dd>${d.poll_interval || S.settings.poll_interval} s</dd>
          <dt>Última comunicação</dt><dd>${d.last_seen ? fmtDate(d.last_seen) + " (" + fmtAgo(d.last_seen) + ")" : "—"}</dd>
          <dt>Latência</dt><dd>${d.latency_ms ? d.latency_ms + " ms" : "—"}</dd>
          <dt>ONVIF</dt><dd>${d.onvif ? (d.onvif.supported ? "compatível · " + (d.onvif.profiles || 0) + " perfis · firmware " + esc(d.onvif.firmware || "—") : "não suportado") : "não verificado"}</dd>
          <dt>Disponibilidade</dt><dd>7 dias: <b>${pct(av7)}</b> · 30 dias: <b>${pct(av30)}</b></dd>
        </dl>
        <div><div class="tabs" id="devTabs">${[["canais", `Canais (${chs.length})`], ["disp", "Disponibilidade"], ["hist", `Histórico (${evs.length})`]].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? "active" : ""}">${l}</button>`).join("")}</div>
        <div id="devTab">${devTabHtml(d, tab)}</div></div>
      </div>`;
    const m = openModal(html, { drawer: true });
    $$("#devTabs button", m.el).forEach((b) => b.addEventListener("click", () => {
      $$("#devTabs button", m.el).forEach((x) => x.classList.toggle("active", x === b));
      $("#devTab", m.el).innerHTML = devTabHtml(d, b.dataset.tab);
    }));
    return m;
  }
  function availDev(d, days) {
    if (!d.host && d.status === "NAO_VERIFICADO") return null;
    const to = Date.now(), from = to - periodMs(days);
    return 1 - downtime(S.events.filter((e) => e.device_id === d.id && !e.channel_id && DOWN_DEV.includes(e.type)), from, to) / (to - from);
  }
  function devTabHtml(d, tab) {
    const chs = idx.chByDev[d.id] || [];
    if (tab === "canais") return `<div class="card">${camGrid(chs, d)}</div><div style="margin-top:10px"><button class="btn sm" data-act="newChannel" data-dev="${d.id}">${ic("plus")} Cadastrar canal manualmente</button></div>`;
    if (tab === "hist") return evTable(S.events.filter((e) => e.device_id === d.id).slice(0, 60), true);
    // linha do tempo de 7 dias
    const to = Date.now(), from = to - periodMs(7);
    const evs = S.events.filter((e) => e.device_id === d.id && !e.channel_id && (DOWN_DEV.includes(e.type) || e.type === "DVR_INSTAVEL"));
    const segs = evs.map((e) => {
      const a = Math.max(Date.parse(e.ts), from);
      const b = Math.min(e.open ? to : e.recovered_at ? Date.parse(e.recovered_at) : Date.parse(e.ts) + (e.duration_s || 0) * 1000, to);
      if (b <= from || a >= to) return "";
      return `<rect x="${((a - from) / (to - from)) * 1000}" y="0" width="${Math.max(2, ((b - a) / (to - from)) * 1000)}" height="28" fill="${e.type === "DVR_INSTAVEL" ? "var(--orange)" : "var(--bad)"}"><title>${esc(evLabel(e.type))} · ${fmtDate(e.ts)} · ${e.open ? "em aberto" : DB.fmtDur(e.duration_s)}</title></rect>`;
    }).join("");
    const labels = Array.from({ length: 8 }, (_, i) => { const t = new Date(from + i * 86400e3); return `<span>${pad(t.getDate())}/${pad(t.getMonth() + 1)}</span>`; }).join("");
    return `<div class="card card-b"><div class="muted" style="font-size:12px;margin-bottom:8px">Últimos 7 dias</div>
      <svg viewBox="0 0 1000 28" preserveAspectRatio="none" style="width:100%;height:28px;border-radius:6px;display:block"><rect width="1000" height="28" fill="${d.host ? "var(--ok)" : "var(--idle)"}" opacity=".85"/>${segs}</svg>
      <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--faint);margin-top:4px">${labels}</div>
      <div class="legend" style="margin-top:10px"><span><i style="background:var(--ok)"></i>Online</span><span><i style="background:var(--bad)"></i>Offline / sem acesso</span><span><i style="background:var(--orange)"></i>Instável</span></div></div>
      <dl class="kv" style="margin-top:14px"><dt>Disponibilidade 24 h</dt><dd>${pct(availDev(d, 1))}</dd><dt>Disponibilidade 7 d</dt><dd>${pct(availDev(d, 7))}</dd><dt>Disponibilidade 30 d</dt><dd>${pct(availDev(d, 30))}</dd>
      <dt>Quedas em 30 d</dt><dd>${S.events.filter((e) => e.device_id === d.id && e.type === "DVR_OFFLINE" && Date.parse(e.ts) > Date.now() - periodMs(30)).length}</dd></dl>`;
  }

  async function testDevice(id, btn) {
    const d = idx.dev[id];
    const m = openModal(`${modalHead("Teste de conectividade", esc(storeName(d.store_id)) + " · " + esc(d.serial))}<div class="modal-b"><div class="log" id="tLog"><span class="dim">Iniciando teste…</span></div></div><div class="modal-f"><button class="btn" data-close>Fechar</button></div>`, { size: "sm" });
    try {
      const r = await (btn ? busy(btn, () => DB.testDevice(id)) : DB.testDevice(id));
      $("#tLog", m.el).innerHTML = (r.steps || []).map((s) => `<div class="${s.ok === true ? "ok" : s.ok === false ? "bad" : "warn"}">${s.ok === true ? "✔" : s.ok === false ? "✖" : "•"} ${esc(s.text)}</div>`).join("") + `<div class="dim" style="margin-top:6px">Resultado: ${esc((DB.DEV_STATUS[r.status] || {}).label || r.status)}</div>`;
      await reload(true); render();
    } catch (e) { $("#tLog", m.el).innerHTML = `<div class="bad">✖ ${esc(e.message)}</div>`; }
  }

  async function onvifDiscover(id) {
    const d = idx.dev[id];
    const m = openModal(`${modalHead("Descoberta ONVIF", esc(storeName(d.store_id)) + " · " + esc(d.serial))}<div class="modal-b" id="ovBody"><div class="empty"><span class="spin"></span> Consultando GetDeviceInformation, GetProfiles e GetStreamUri…</div></div><div class="modal-f" id="ovFoot"><button class="btn" data-close>Fechar</button></div>`);
    try {
      const r = await DB.discoverOnvif(id);
      if (!r.supported) { $("#ovBody", m.el).innerHTML = `<div class="callout warn">${ic("alerta")}<div><b>ONVIF indisponível.</b><br>${esc(r.reason || "O equipamento não respondeu ao ONVIF.")}<br><br>Nem todo DVR suporta ONVIF. Os canais podem ser cadastrados manualmente.</div></div>`; return; }
      const have = new Set((idx.chByDev[id] || []).map((c) => c.number));
      $("#ovBody", m.el).innerHTML = `<dl class="kv" style="margin-bottom:14px"><dt>Fabricante</dt><dd>${esc(r.info.manufacturer)}</dd><dt>Modelo</dt><dd>${esc(r.info.model)}</dd><dt>Firmware</dt><dd>${esc(r.info.firmware)}</dd><dt>Serial</dt><dd class="mono">${esc(r.info.serial)}</dd></dl>
        <div class="card table-wrap"><table><thead><tr><th></th><th>Canal</th><th>Perfil</th><th>Vídeo</th><th>URL RTSP (protegida)</th></tr></thead><tbody>
        ${r.profiles.map((p, i) => `<tr><td><input type="checkbox" data-pi="${i}" checked aria-label="Canal ${p.channel}"></td><td>${p.channel}${have.has(p.channel) ? ' <span class="tag" title="O canal existente recebe o perfil e a URL RTSP; nome e histórico são mantidos.">já cadastrado · vincular</span>' : ' <span class="tag">novo</span>'}</td><td class="mono">${esc(p.token)}</td><td>${esc(p.encoding)} ${esc(p.resolution)}</td><td class="mono faint">${esc(p.rtsp)}</td></tr>`).join("")}</tbody></table></div>
        <div class="faint" style="font-size:12px;margin-top:8px">Canais novos são criados; os já cadastrados recebem o perfil e a URL RTSP descobertos, mantendo nome e histórico. Nada é apagado. Usuário e senha não aparecem nas URLs.</div>`;
      $("#ovFoot", m.el).innerHTML = `<button class="btn" data-close-2>Fechar</button><button class="btn primary" id="ovSync">${ic("sync")} Sincronizar canais selecionados</button>`;
      $("[data-close-2]", m.el).addEventListener("click", m.close);
      $("#ovSync", m.el).addEventListener("click", async (e) => {
        const sel = $$("input[data-pi]:checked", m.el).map((x) => r.profiles[Number(x.dataset.pi)]);
        if (!sel.length) return toast("Nenhum canal selecionado.", "warn");
        try { const out = await busy(e.currentTarget, () => DB.syncChannels(id, sel)); m.close(); toast(`${out.created} canal(is) criado(s) e ${out.kept} vinculado(s) ao perfil ONVIF.`, "ok"); await reload(); render(); } catch (err) { toast(esc(err.message), "bad"); }
      });
    } catch (e) { $("#ovBody", m.el).innerHTML = `<div class="callout bad">${ic("alerta")}<div>${esc(e.message)}</div></div>`; }
  }

  // ================================================================ CANAIS
  VIEWS.canais = function (p) {
    const q = (p.q || "").toLowerCase();
    const fs = p.status || "", fl = p.loja || "", fc = p.conexao || "";
    const view = p.ver || "grade";
    const conns = [...new Set(S.devices.map(connOf))].sort();
    const match = (c) => {
      const d = idx.dev[c.device_id] || {};
      return (!fs || c.status === fs) && (!fl || String(d.store_id) === fl) && (!fc || connOf(d) === fc) && (!q || [storeName(d.store_id), d.serial, c.name, "canal " + c.number].join(" ").toLowerCase().includes(q));
    };
    const scope = S.channels.filter((c) => { const d = idx.dev[c.device_id] || {}; return (!fl || String(d.store_id) === fl) && (!fc || connOf(d) === fc); });
    const chips = `<div class="chips"><span class="chip ${!fs ? "active" : ""}" data-set="status" data-val=""><i style="--c:var(--brand)"></i>Todos <b>${scope.length}</b></span>${Object.entries(DB.CH_STATUS).map(([k, v]) => `<span class="chip ${fs === k ? "active" : ""}" data-set="status" data-val="${k}"><i style="--c:${v.color}"></i>${v.label} <b>${scope.filter((c) => c.status === k).length}</b></span>`).join("")}</div>`;
    const tools = `<div class="toolbar">
        <div class="search">${ic("search")}<input class="input" data-param="q" placeholder="Buscar loja, DVR ou canal…" value="${esc(p.q || "")}"></div>
        <select class="select" data-param="loja">${storeOptions(fl, "Todas as lojas")}</select>
        <select class="select" data-param="conexao">${opt("", "Todas as conexões", fc)}${conns.map((c) => opt(c, c, fc)).join("")}</select>
        <span class="spacer"></span>
        <div style="display:flex;gap:4px"><button class="btn ${view === "grade" ? "primary" : ""}" data-set="ver" data-val="grade" title="Grade de câmeras">${ic("grid")}</button><button class="btn ${view === "lista" ? "primary" : ""}" data-set="ver" data-val="lista" title="Lista">${ic("list")}</button></div>
        <button class="btn" data-act="newChannel">${ic("plus")} Canal manual</button>
      </div>`;
    let body;
    if (view === "lista") {
      const rows = S.channels.filter(match).sort((a, b) => { const da = idx.dev[a.device_id] || {}, db = idx.dev[b.device_id] || {}; return storeName(da.store_id).localeCompare(storeName(db.store_id), "pt-BR") || a.number - b.number; });
      body = `<div class="card"><div class="card-h"><h3>Canais dos equipamentos</h3><span class="sub">${rows.length} canais</span></div><div class="card-b flush table-wrap"><table>
        <thead><tr><th>Loja</th><th class="hide-sm">Serial DVR</th><th class="num">Nº</th><th>Nome</th><th>Status</th><th class="hide-sm">Último quadro</th><th class="hide-sm">Sem transmissão</th><th></th></tr></thead>
        <tbody>${rows.map((c) => { const d = idx.dev[c.device_id] || {}; return `<tr class="clickable" data-ch="${c.id}"><td class="row-title">${esc(storeName(d.store_id))}</td><td class="hide-sm mono">${esc(d.serial)}</td><td class="num">${c.number}</td><td>${esc(c.name)}</td><td>${chBadge(c.status)}</td><td class="hide-sm muted">${c.last_frame ? fmtAgo(c.last_frame) : "—"}</td><td class="hide-sm">${c.status !== "TRANSMITINDO" && c.status !== "NAO_VERIFICADO" ? since(c.status_since || c.last_frame) : "—"}</td>
          <td><div class="actions"><button class="btn sm" data-act="testCh" data-id="${c.id}">${ic("play")} Testar</button><button class="btn sm hide-sm" data-act="editCh" data-id="${c.id}">${ic("edit")}</button></div></td></tr>`; }).join("") || '<tr><td colspan="8" class="empty">Nenhum canal encontrado.</td></tr>'}</tbody></table></div></div>`;
    } else {
      const blocks = S.stores.filter((s) => !fl || String(s.id) === fl).map((s) => {
        const devs = (idx.devByStore[s.id] || []).filter((d) => !fc || connOf(d) === fc);
        if (!devs.length) return "";
        const inner = devs.map((d) => {
          const all = idx.chByDev[d.id] || [];
          const chs = all.filter(match);
          const filtering = fs || q;
          if (filtering && !chs.length) return "";
          return `<div class="store-head"><span class="mono muted" style="font-size:12px">DVR ${esc(d.serial)}</span><span class="tag">${esc(connOf(d))}</span>${devBadge(d.status)}<span class="spacer"></span><span class="meta">${all.filter((c) => c.status === "TRANSMITINDO").length}/${all.length} transmitindo</span><button class="btn sm ghost" data-dev="${d.id}">${ic("eye")} DVR</button></div>${filtering ? `<div class="cam-grid">${chs.map((c) => camTile(c, d)).join("")}</div>` : camGrid(all, d)}`;
        }).join("");
        if (!inner) return "";
        const cs = chOfStore(s.id);
        return `<div class="store-block"><div class="store-head" style="padding-top:14px"><h4 data-store="${s.id}">${esc(s.name)}</h4>${healthBadge(storeHealth(s.id))}<span class="spacer"></span><div class="mini-bar">${miniBar(cs)}</div></div>${inner}</div>`;
      }).join("");
      body = `<div class="card">${blocks || '<div class="empty">Nenhuma câmera com esses filtros.</div>'}</div>`;
    }
    return { title: "Canais", sub: "Câmeras de cada loja com o status de transmissão", html: chips + tools + body };
  };

  function channelDrawer(id) {
    const c = idx.ch[id];
    if (!c) return;
    const d = idx.dev[c.device_id] || {};
    const evs = S.events.filter((e) => e.channel_id === id);
    const to = Date.now(), from = to - periodMs(30);
    const down = downtime(evs.filter((e) => e.type === "CANAL_SEM_VIDEO"), from, to) + downtime(S.events.filter((e) => e.device_id === d.id && !e.channel_id && DOWN_DEV.includes(e.type)), from, to);
    const m = openModal(`${modalHead(`Canal ${c.number} · ${esc(c.name)}`, esc(storeName(d.store_id)) + " · DVR " + esc(d.serial))}
      <div class="modal-b" style="display:flex;flex-direction:column;gap:16px">
        ${c.snapshot_at ? `<figure class="snap-big ${SNAP.has(c.id) ? "loaded" : ""}" data-act="snapZoom" data-id="${c.id}" title="Ver em tamanho maior">${snapImg(c, "snap-img")}<span class="snap-wait">Carregando foto…</span>
          <figcaption>${c.status === "TRANSMITINDO" ? "" : "<b>Última imagem recebida</b> · "}Foto de ${fmtDate(c.snapshot_at)} (${fmtAgo(c.snapshot_at)})</figcaption></figure>`
          : `<div style="max-width:360px">${camTile(c, d).replace('data-ch="' + c.id + '"', "")}</div>
        ${DB.mode === "api" ? `<div class="callout">${ic("info")}<div>Este canal ainda não tem foto. Ela aparece depois do primeiro teste de vídeo com sucesso (o DVR precisa estar acessível pelo servidor).</div></div>` : ""}`}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm primary" data-act="testCh" data-id="${id}">${ic("play")} Testar transmissão</button><button class="btn sm" data-act="editCh" data-id="${id}">${ic("edit")} Editar</button><button class="btn sm" data-dev="${d.id}">${ic("dvr")} Ver DVR</button><button class="btn sm danger" data-act="delCh" data-id="${id}">${ic("trash")} Excluir</button></div>
        <div id="chLog"></div>
        <dl class="kv">
          <dt>Status</dt><dd>${chBadge(c.status)}</dd>
          <dt>Status do DVR</dt><dd>${devBadge(d.status)}</dd>
          <dt>Última verificação</dt><dd>${c.last_check ? fmtDate(c.last_check) + " (" + fmtAgo(c.last_check) + ")" : "—"}</dd>
          <dt>Último quadro</dt><dd>${c.last_frame ? fmtDate(c.last_frame) + " (" + fmtAgo(c.last_frame) + ")" : "—"}</dd>
          <dt>Sem transmissão há</dt><dd>${c.status !== "TRANSMITINDO" && c.status !== "NAO_VERIFICADO" ? since(c.status_since || c.last_frame) : "—"}</dd>
          <dt>Vídeo</dt><dd>${esc(c.resolution || "—")}${c.fps ? " · " + c.fps + " fps" : ""}</dd>
          <dt>URL de transmissão</dt><dd class="mono faint">${d.host ? "rtsp://***@" + esc(d.host) + ":" + d.rtsp_port + "/…channel=" + c.number : "indisponível (sem rota)"}</dd>
          <dt>Disponibilidade 30 d</dt><dd>${d.host ? pct(1 - down / (to - from)) : "—"}</dd>
        </dl>
        <div><h4 style="margin-bottom:8px;font-size:13px">Histórico de indisponibilidade</h4>${evTable(evs.slice(0, 40), true)}</div>
      </div>`, { drawer: true });
    hydrateSnaps(m.el);
    return m;
  }
  function snapZoom(id) {
    const c = idx.ch[id], hit = SNAP.get(id);
    if (!c || !hit) return;
    const d = idx.dev[c.device_id] || {};
    openModal(`${modalHead(`Canal ${c.number} · ${esc(c.name)}`, esc(storeName(d.store_id)) + " · foto de " + fmtDate(c.snapshot_at))}
      <div class="modal-b"><img class="snap-full" src="${hit.url}" alt="Foto do canal ${c.number}"></div>
      <div class="modal-f"><a class="btn" href="${hit.url}" download="canal-${c.id}.jpg">${ic("download")} Baixar</a><button class="btn primary" data-close>Fechar</button></div>`, { size: "lg" });
  }
  async function testChannel(id, btn) {
    const box = $("#chLog");
    const target = box || openModal(`${modalHead("Teste de transmissão")}<div class="modal-b"><div id="chLog2"></div></div><div class="modal-f"><button class="btn" data-close>Fechar</button></div>`, { size: "sm" }).el.querySelector("#chLog2");
    target.innerHTML = `<div class="log"><span class="dim">ffprobe -rtsp_transport tcp -timeout ${S.settings.rtsp_timeout_s}s … (canal ${idx.ch[id].number})</span></div>`;
    try {
      const r = await (btn ? busy(btn, () => DB.testChannel(id)) : DB.testChannel(id));
      target.innerHTML = `<div class="log">${(r.steps || []).map((s) => `<div class="${s.ok ? "ok" : "bad"}">${s.ok ? "✔" : "✖"} ${esc(s.text)}</div>`).join("")}<div class="dim" style="margin-top:6px">Resultado: ${esc((DB.CH_STATUS[r.status] || {}).label || r.status)}</div></div>`;
      await reload(true); render();
    } catch (e) { target.innerHTML = `<div class="callout bad">${ic("alerta")}<div>${esc(e.message)}</div></div>`; }
  }
  function channelForm(c, presetDev) {
    const isNew = !c;
    c = c || { device_id: presetDev ? Number(presetDev) : "", number: "", name: "" };
    if (isNew && c.device_id) c.number = Math.max(0, ...(idx.chByDev[c.device_id] || []).map((x) => x.number)) + 1;
    const m = openModal(`${modalHead(isNew ? "Cadastrar canal" : "Editar canal")}<form id="fCh"><div class="modal-b"><div class="form">
      <div class="field full"><label>DVR *</label><select class="select" name="device_id" required ${isNew ? "" : "disabled"}>${opt("", "Selecione…", c.device_id)}${S.devices.slice().sort((a, b) => storeName(a.store_id).localeCompare(storeName(b.store_id))).map((d) => opt(d.id, storeName(d.store_id) + " · " + d.serial, c.device_id)).join("")}</select></div>
      <div class="field"><label>Número *</label><input class="input" type="number" name="number" min="1" max="256" required value="${esc(c.number)}"></div>
      <div class="field"><label>Nome / identificação da câmera *</label><input class="input" name="name" required maxlength="60" placeholder="Ex.: Caixa 1" value="${esc(c.name)}"></div>
      </div></div><div class="modal-f"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`, { size: "sm" });
    $("#fCh", m.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const out = Object.assign({}, c, { name: f.name.trim(), number: Number(f.number) });
      if (isNew) out.device_id = Number(f.device_id);
      if (!out.device_id || !out.number || !out.name) return toast("Preencha DVR, número e nome.", "bad");
      try { await busy(e.submitter, () => DB.saveChannel(out)); m.close(); toast("Canal salvo.", "ok"); await reload(); render(); } catch (err) { toast(esc(err.message), "bad"); }
    });
  }

  // ================================================================ MONITORAMENTO
  let nextCycle = 0;
  VIEWS.monitoramento = function () {
    const st = S.settings;
    const live = S.devices.filter((d) => d.host);
    const noRoute = S.devices.filter((d) => !d.host);
    const lastChecks = live.map((d) => d.last_check).filter(Boolean).sort();
    const lastCycle = lastChecks.length ? lastChecks[lastChecks.length - 1] : null;
    const rows = live.slice().sort((a, b) => { const o = { OFFLINE: 0, ERRO_AUTENTICACAO: 1, INSTAVEL: 2, NAO_VERIFICADO: 3, ONLINE: 4 }; return o[a.status] - o[b.status] || storeName(a.store_id).localeCompare(storeName(b.store_id)); });
    const feed = S.events.slice(0, 14);
    const html = `
      <div class="grid kpis">
        <div class="card kpi" style="--accent:var(--brand)"><span class="label">Próximo ciclo</span><span class="value" id="cycleCount">—</span><span class="foot">a cada ${st.poll_interval} s · timeout ${st.timeout_s} s · ${st.retries} tentativas</span></div>
        <div class="card kpi" style="--accent:var(--ok)"><span class="label">Último ciclo</span><span class="value" style="font-size:20px">${lastCycle ? fmtAgo(lastCycle) : "—"}</span><span class="foot">${live.length} DVRs com rota · ${st.concurrency} em paralelo</span></div>
        <div class="card kpi" style="--accent:var(--orange)"><span class="label">Verificação RTSP</span><span class="value" style="font-size:20px">a cada ${st.rtsp_interval} s</span><span class="foot">máx. ${st.rtsp_concurrency} fluxos simultâneos · timeout ${st.rtsp_timeout_s} s</span></div>
        <div class="card kpi" style="--accent:var(--warn)"><span class="label">Sem rota direta</span><span class="value">${noRoute.length}</span><span class="foot">P2P/Relay: precisam de VPN</span></div>
      </div>
      <div class="toolbar"><button class="btn primary" data-act="runNow">${ic("refresh")} Verificar agora</button><span class="muted" style="font-size:12.5px">O monitor roda em segundo plano no servidor. Esta tela acompanha o resultado em tempo real.</span></div>
      <div class="grid g3">
        <div class="card"><div class="card-h"><h3>Equipamentos monitorados</h3><span class="sub">${live.length}</span></div><div class="card-b flush table-wrap"><table>
          <thead><tr><th>Loja</th><th class="hide-sm">Endereço</th><th>Status</th><th class="num">Latência</th><th class="hide-sm">Última verificação</th><th></th></tr></thead>
          <tbody>${rows.map((d) => `<tr class="clickable" data-dev="${d.id}"><td><div class="row-title">${esc(storeName(d.store_id))}</div><div class="row-sub mono">${esc(d.serial)}</div></td><td class="hide-sm mono">${esc(d.host)}:${d.port}</td><td>${devBadge(d.status)}</td><td class="num">${d.latency_ms ? d.latency_ms + " ms" : "—"}</td><td class="hide-sm muted">${fmtAgo(d.last_check)}</td><td><div class="actions"><button class="btn sm" data-act="testDev" data-id="${d.id}">${ic("play")}</button></div></td></tr>`).join("") || '<tr><td colspan="6" class="empty">Nenhum DVR com IP cadastrado.</td></tr>'}</tbody></table></div></div>
        <div class="card"><div class="card-h"><h3>Atividade em tempo real</h3></div><div class="card-b"><div class="log" style="max-height:520px">${feed.map((e) => { const sev = (DB.EVENT_TYPES[e.type] || {}).sev; return `<div><span class="dim">${fmtDate(e.ts)}</span> <span class="${sev === "critico" ? "bad" : sev === "atencao" ? "warn" : sev === "ok" ? "ok" : ""}">${esc(evLabel(e.type))}</span> · ${esc(storeName(e.store_id))}${e.channel_id && idx.ch[e.channel_id] ? " · CH" + idx.ch[e.channel_id].number : ""}</div>`; }).join("") || '<span class="dim">Sem atividade.</span>'}</div></div></div>
      </div>
      ${noRoute.length ? `<div class="card"><div class="card-h"><h3>Equipamentos sem rota direta</h3><span class="sub">não são simulados como online</span></div><div class="card-b flush table-wrap"><table><thead><tr><th>Loja</th><th>Serial</th><th>Conexão</th><th>Próximo passo</th><th></th></tr></thead><tbody>
        ${noRoute.map((d) => `<tr><td class="row-title">${esc(storeName(d.store_id))}</td><td class="mono">${esc(d.serial)}</td><td><span class="tag">${esc(connOf(d))}</span></td><td class="muted">Cadastrar IP via VPN/Tailscale/MikroTik, ou integrar a nuvem do fabricante</td><td><div class="actions"><button class="btn sm" data-act="editDev" data-id="${d.id}">${ic("edit")} Configurar IP</button></div></td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
    return {
      title: "Monitoramento", sub: "Verificações automáticas de DVRs e canais", html,
      after() { if (!nextCycle || nextCycle < Date.now()) nextCycle = Date.now() + cycleMs(); updateCountdown(); },
    };
  };
  function cycleMs() { return DB.mode === "demo" ? 20e3 : (window.PCFTV_CONFIG.refreshSeconds || 30) * 1000; }
  function updateCountdown() {
    const el = $("#cycleCount");
    if (el) el.textContent = Math.max(0, Math.round((nextCycle - Date.now()) / 1000)) + " s";
  }

  // ================================================================ ALERTAS
  VIEWS.alertas = function (p) {
    const f = p.filtro || "ativos";
    const list = S.alerts.filter((a) => (f === "ativos" ? !a.ack : f === "criticos" ? a.severity === "critico" : f === "reconhecidos" ? a.ack : true));
    const st = S.settings;
    const notif = st.slack_notify || {};
    const html = `
      <div class="chips">${[["ativos", "Não reconhecidos", S.alerts.filter((a) => !a.ack).length], ["criticos", "Críticos", S.alerts.filter((a) => a.severity === "critico").length], ["reconhecidos", "Reconhecidos", S.alerts.filter((a) => a.ack).length], ["todos", "Todos", S.alerts.length]].map(([k, l, n]) => `<span class="chip ${f === k ? "active" : ""}" data-set="filtro" data-val="${k}">${l} <b>${n}</b></span>`).join("")}</div>
      <div class="grid g3">
        <div class="card"><div class="card-h"><h3>Alertas</h3><span class="sub">${list.length}</span></div><div class="card-b flush table-wrap"><table>
          <thead><tr><th>Ocorrência</th><th>Tipo</th><th class="hide-sm">Desde</th><th class="num">Duração</th><th></th></tr></thead>
          <tbody>${list.map((a) => `<tr class="clickable" data-alert="${esc(a.key)}"><td><div class="row-title">${esc(a.title)}</div><div class="row-sub">${esc(a.description)}</div></td><td>${evBadge(a.type)}</td><td class="hide-sm muted mono">${fmtDate(a.since)}</td><td class="num">${since(a.since)}</td>
            <td><div class="actions">${a.ack ? '<span class="badge s-idle plain">reconhecido</span>' : `<button class="btn sm" data-act="ack" data-key="${esc(a.key)}">${ic("check")} Reconhecer</button>`}</div></td></tr>`).join("") || '<tr><td colspan="5" class="empty">Nenhum alerta aqui.</td></tr>'}</tbody></table></div></div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="card"><div class="card-h"><h3>Integração com Slack</h3><span class="spacer"></span>${st.slack_configured ? '<span class="badge s-ok">Configurado</span>' : '<span class="badge s-warn">Não configurado</span>'}</div>
            <div class="card-b" style="display:flex;flex-direction:column;gap:10px;font-size:13px">
              <div class="muted">O webhook fica em variável de ambiente no servidor (SLACK_WEBHOOK_URL) e nunca aparece na tela.</div>
              <div><b>Notificar quando:</b><ul style="margin:6px 0 0;padding-left:18px;color:var(--muted)">${["DVR_OFFLINE", "DVR_ONLINE", "CANAL_SEM_VIDEO", "CANAL_VOLTOU", "AUTH_FALHA", "SEM_COMUNICACAO"].map((t) => `<li>${notif[t] === false ? "<s>" + evLabel(t) + "</s>" : evLabel(t)}</li>`).join("")}</ul></div>
              <div class="muted">Falha repetida só gera nova mensagem após ${st.slack_repeat_minutes} min. “Sem comunicação prolongada” dispara após ${st.offline_alert_minutes * 6} min offline.</div>
              <div style="display:flex;gap:8px"><button class="btn primary sm" data-act="testSlack">${ic("slack")} Enviar alerta de teste</button><a class="btn sm" href="#/configuracoes?tab=slack">Regras</a></div>
            </div></div>
          <div class="card"><div class="card-h"><h3>Notificações recentes</h3></div><div class="card-b flush">${S.events.filter((e) => e.slack).slice(0, 8).map((e) => `<div style="padding:9px 14px;border-bottom:1px solid var(--line);font-size:12.5px"><span class="mono faint">${fmtDate(e.ts)}</span> · ${esc(evLabel(e.type))} · ${esc(storeName(e.store_id))}</div>`).join("") || '<div class="empty">Nenhuma notificação enviada.</div>'}</div></div>
        </div>
      </div>`;
    return { title: "Alertas", sub: "Falhas ativas e notificações no Slack", html };
  };
  function alertOpen(key) {
    const a = S.alerts.find((x) => x.key === key);
    if (!a) return;
    if (a.channel_id) channelDrawer(a.channel_id); else deviceDrawer(a.device_id, "hist");
  }

  // ================================================================ HISTÓRICO
  VIEWS.historico = function (p) {
    const page = Number(p.pag || 1);
    const per = 50;
    let from = p.de ? Date.parse(p.de + "T00:00:00") : p.dias ? Date.now() - periodMs(Number(p.dias)) : 0;
    let to = p.ate ? Date.parse(p.ate + "T23:59:59") : Infinity;
    const q = (p.q || "").toLowerCase();
    const rows = S.events.filter((e) => {
      const t = Date.parse(e.ts);
      if (t < from || t > to) return false;
      if (p.loja && String(e.store_id) !== p.loja) return false;
      if (p.dvr && String(e.device_id) !== p.dvr) return false;
      if (p.tipo && e.type !== p.tipo) return false;
      if (q) {
        const d = idx.dev[e.device_id] || {};
        const c = idx.ch[e.channel_id];
        if (![storeName(e.store_id), d.serial, c ? "canal " + c.number + " " + c.name : "", e.description].join(" ").toLowerCase().includes(q)) return false;
      }
      return true;
    });
    const pages = Math.max(1, Math.ceil(rows.length / per));
    const slice = rows.slice((page - 1) * per, page * per);
    const devOpts = S.devices.filter((d) => !p.loja || String(d.store_id) === p.loja).map((d) => opt(d.id, storeName(d.store_id) + " · " + d.serial, p.dvr)).join("");
    const html = `
      <div class="card card-b"><div class="toolbar">
        <select class="select" data-param="loja">${storeOptions(p.loja || "", "Todas as lojas")}</select>
        <select class="select" data-param="dvr">${opt("", "Todos os DVRs", p.dvr)}${devOpts}</select>
        <div class="search">${ic("search")}<input class="input" data-param="q" placeholder="Canal, serial ou descrição…" value="${esc(p.q || "")}"></div>
        <select class="select" data-param="tipo">${opt("", "Todos os eventos", p.tipo)}${Object.entries(DB.EVENT_TYPES).map(([k, v]) => opt(k, v.label, p.tipo)).join("")}</select>
        <label class="muted" style="font-size:12px">de</label><input class="input" type="date" data-param="de" value="${esc(p.de || "")}">
        <label class="muted" style="font-size:12px">até</label><input class="input" type="date" data-param="ate" value="${esc(p.ate || "")}">
        <button class="btn ghost" data-go="#/historico">Limpar</button>
        <span class="spacer"></span>
        <button class="btn" data-act="csvHist">${ic("download")} CSV</button>
      </div></div>
      <div class="card"><div class="card-h"><h3>Eventos registrados</h3><span class="sub">${num(rows.length)} eventos</span></div><div class="card-b flush table-wrap"><table>
        <thead><tr><th>Data</th><th>Loja</th><th class="hide-sm">DVR</th><th>Canal</th><th>Evento</th><th>Descrição</th><th class="num">Indisponível</th><th class="hide-sm">Recuperação</th></tr></thead>
        <tbody>${slice.map((e) => { const d = idx.dev[e.device_id] || {}; const c = idx.ch[e.channel_id]; return `<tr><td class="mono muted" style="white-space:nowrap">${fmtDate(e.ts, true)}</td><td class="row-title clickable" data-store="${e.store_id}">${esc(storeName(e.store_id))}</td><td class="hide-sm mono clickable" data-dev="${d.id || ""}">${esc(d.serial || "—")}</td><td>${c ? `<span class="clickable" data-ch="${c.id}">${c.number} · ${esc(c.name)}</span>` : "—"}</td><td>${evBadge(e.type)}</td><td>${esc(e.description)}</td><td class="num">${e.open ? '<span class="badge s-bad plain">em aberto</span>' : DB.fmtDur(e.duration_s)}</td><td class="hide-sm muted mono">${e.recovered_at ? fmtDate(e.recovered_at) : e.open ? "—" : ""}</td></tr>`; }).join("") || '<tr><td colspan="8" class="empty">Nenhum evento com esses filtros.</td></tr>'}</tbody></table></div>
        ${pages > 1 ? `<div class="pager">Página ${page} de ${pages}<button class="btn sm" data-set="pag" data-val="${page - 1}" ${page <= 1 ? "disabled" : ""}>Anterior</button><button class="btn sm" data-set="pag" data-val="${page + 1}" ${page >= pages ? "disabled" : ""}>Próxima</button></div>` : ""}</div>`;
    return { title: "Histórico", sub: "Consulta de eventos registrados", html, after() { histRows = rows; } };
  };
  let histRows = [];

  // ================================================================ RELATÓRIOS
  VIEWS.relatorios = function (p) {
    const days = Number(p.dias || 30);
    const rows = availability(days).sort((a, b) => (a.devAvail ?? 2) - (b.devAvail ?? 2));
    const mon = rows.filter((r) => r.monitored);
    const avg = (k) => { const v = mon.map((r) => r[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const tot = mon.reduce((a, r) => a + r.incidents, 0);
    const mttrs = mon.map((r) => r.mttr).filter(Boolean);
    const color = (v) => (v == null ? "var(--faint)" : v >= 0.99 ? "var(--ok)" : v >= 0.95 ? "var(--warn)" : "var(--bad)");
    const html = `
      <div class="toolbar">
        <select class="select" data-param="dias">${[7, 30, 90].map((d) => opt(d, `Últimos ${d} dias`, days)).join("")}</select>
        <span class="spacer"></span>
        <button class="btn" data-act="csvRel" data-dias="${days}">${ic("download")} Exportar CSV</button>
        <button class="btn" data-act="print">${ic("print")} Imprimir</button>
      </div>
      <div class="grid kpis">
        <div class="card kpi" style="--accent:${color(avg("devAvail"))}"><span class="label">Disponibilidade média dos DVRs</span><span class="value">${pct(avg("devAvail"))}</span><span class="foot">${mon.length} lojas monitoradas</span></div>
        <div class="card kpi" style="--accent:${color(avg("chAvail"))}"><span class="label">Disponibilidade média dos canais</span><span class="value">${pct(avg("chAvail"))}</span><span class="foot">vídeo recebido</span></div>
        <div class="card kpi" style="--accent:var(--bad)"><span class="label">Incidentes</span><span class="value">${tot}</span><span class="foot">${mon.reduce((a, r) => a + r.devIncidents, 0)} de DVR · ${mon.reduce((a, r) => a + r.chIncidents, 0)} de canal</span></div>
        <div class="card kpi" style="--accent:var(--brand)"><span class="label">Tempo médio de recuperação</span><span class="value" style="font-size:22px">${mttrs.length ? DB.fmtDur(Math.round(mttrs.reduce((a, b) => a + b, 0) / mttrs.length)) : "—"}</span><span class="foot">MTTR</span></div>
      </div>
      <div class="card"><div class="card-h"><h3>Disponibilidade e falhas por loja</h3><span class="sub">· ${days} dias · piores primeiro</span></div><div class="card-b flush table-wrap"><table>
        <thead><tr><th>Loja</th><th>DVR</th><th>Canais</th><th class="num">Incidentes</th><th class="num hide-sm">Tempo fora (DVR)</th><th class="num hide-sm">MTTR</th><th class="num hide-sm">Maior falha</th></tr></thead>
        <tbody>${rows.map((r) => `<tr class="clickable" data-store="${r.store.id}"><td class="row-title">${esc(r.store.name)}</td>
          <td>${r.monitored ? `<div style="display:flex;align-items:center;gap:8px"><div class="bar-track" style="width:70px"><span style="width:${(r.devAvail || 0) * 100}%;background:${color(r.devAvail)}"></span></div><b style="color:${color(r.devAvail)}">${pct(r.devAvail)}</b></div>` : '<span class="faint">sem monitoramento</span>'}</td>
          <td>${r.chAvail != null ? `<b style="color:${color(r.chAvail)}">${pct(r.chAvail)}</b>` : '<span class="faint">—</span>'}</td>
          <td class="num">${r.incidents}</td><td class="num hide-sm">${r.downMs ? DB.fmtDur(Math.round(r.downMs / 1000)) : "—"}</td><td class="num hide-sm">${r.mttr ? DB.fmtDur(Math.round(r.mttr)) : "—"}</td><td class="num hide-sm">${r.longest ? DB.fmtDur(Math.round(r.longest)) : "—"}</td></tr>`).join("")}</tbody></table></div></div>
      <div class="faint" style="font-size:12px">Disponibilidade = 1 − tempo fora ÷ período. Lojas sem rota direta (P2P/Relay) aparecem como “sem monitoramento” e não entram na média.</div>`;
    return { title: "Relatórios", sub: "Disponibilidade e falhas por período", html };
  };

  // ================================================================ CONFIGURAÇÕES
  VIEWS.configuracoes = function (p) {
    const tab = p.tab || "monitor";
    const s = S.settings;
    const c = DB.conn();
    const tabs = [["monitor", "Monitoramento"], ["slack", "Slack"], ["conexao", "Conexão"], ["sobre", "Sobre"]];
    let body = "";
    if (tab === "monitor") {
      body = `<form id="fSet"><div class="form" style="max-width:760px">
        <div class="section-t">DVRs (TCP / ONVIF)</div>
        <div class="field"><label>Intervalo de verificação (segundos)</label><input class="input" type="number" name="poll_interval" min="15" max="3600" value="${s.poll_interval}"><span class="hint">Permitido de 15 a 3.600 s.</span></div>
        <div class="field"><label>Timeout de conexão (segundos)</label><input class="input" type="number" name="timeout_s" min="1" max="60" value="${s.timeout_s}"></div>
        <div class="field"><label>Tentativas antes de marcar offline</label><input class="input" type="number" name="retries" min="1" max="10" value="${s.retries}"></div>
        <div class="field"><label>Verificações simultâneas</label><input class="input" type="number" name="concurrency" min="1" max="100" value="${s.concurrency}"></div>
        <div class="section-t">Canais (RTSP / FFmpeg)</div>
        <div class="field"><label>Intervalo de teste de vídeo (segundos)</label><input class="input" type="number" name="rtsp_interval" min="60" max="86400" value="${s.rtsp_interval}"></div>
        <div class="field"><label>Timeout de quadro (segundos)</label><input class="input" type="number" name="rtsp_timeout_s" min="3" max="60" value="${s.rtsp_timeout_s}"></div>
        <div class="field"><label>Fluxos RTSP simultâneos</label><input class="input" type="number" name="rtsp_concurrency" min="1" max="16" value="${s.rtsp_concurrency}"><span class="hint">Mantenha baixo para não sobrecarregar o link das lojas.</span></div>
        <div class="field" style="justify-content:flex-end"><label class="check"><input type="checkbox" name="freeze_detection" ${s.freeze_detection ? "checked" : ""}> Detectar imagem congelada (compara quadros)</label></div>
        <div class="field" style="justify-content:flex-end"><label class="check"><input type="checkbox" name="snapshots" ${s.snapshots !== false ? "checked" : ""}> Guardar foto de cada canal (aparece nos quadradinhos)</label><span class="hint">A foto sai do próprio teste de vídeo, sem abrir conexão extra com o DVR.</span></div>
        <div class="section-t">Alertas</div>
        <div class="field"><label>Minutos offline para alerta prolongado</label><input class="input" type="number" name="offline_alert_minutes" min="5" max="1440" value="${s.offline_alert_minutes}"></div>
        <div class="field"><label>Repetir aviso da mesma falha após (min)</label><input class="input" type="number" name="slack_repeat_minutes" min="5" max="1440" value="${s.slack_repeat_minutes}"></div>
        <div class="field full"><div><button class="btn primary" type="submit">Salvar configurações</button></div></div></div></form>`;
    } else if (tab === "slack") {
      const n = s.slack_notify || {};
      body = `<form id="fSlack" style="max-width:640px;display:flex;flex-direction:column;gap:14px">
        <div>${s.slack_configured ? '<span class="badge s-ok">Webhook configurado no servidor</span>' : '<span class="badge s-warn">Webhook do Slack não configurado no container</span>'}</div>
        <div class="muted" style="font-size:13px">Por segurança o endereço do webhook não é editado nem exibido aqui. Defina SLACK_WEBHOOK_URL no ambiente do servidor.</div>
        <div class="card card-b" style="display:flex;flex-direction:column;gap:10px">${["DVR_OFFLINE", "DVR_ONLINE", "CANAL_SEM_VIDEO", "CANAL_VOLTOU", "AUTH_FALHA", "SEM_COMUNICACAO"].map((t) => `<label class="check"><input type="checkbox" name="${t}" ${n[t] !== false ? "checked" : ""}> ${evLabel(t)}</label>`).join("")}</div>
        <div style="display:flex;gap:8px"><button class="btn primary" type="submit">Salvar regras</button><button class="btn" type="button" data-act="testSlack">${ic("slack")} Enviar teste</button></div></form>`;
    } else if (tab === "conexao") {
      body = `<form id="fConn" style="max-width:640px;display:flex;flex-direction:column;gap:14px">
        <div class="field"><label>Fonte de dados</label><select class="select" name="mode">${opt("demo", "Demonstração (dados simulados no navegador)", c.mode)}${opt("api", "API do servidor Potencial CFTV", c.mode)}</select></div>
        <div class="field"><label>URL da API</label><input class="input mono" name="apiBase" placeholder="https://cftv-api.seudominio.com.br" value="${esc(c.apiBase)}"><span class="hint">Vazio = mesma origem. Na Vercel com CFTV_API_URL configurada, deixe vazio (a Vercel encaminha para o monitor e guarda o token). Sem isso, use a URL HTTPS publicada do servidor.</span></div>
        <div class="field"><label>Token de acesso</label><input class="input mono" type="password" name="apiToken" autocomplete="off" placeholder="${c.apiToken ? "•••••••• (salvo neste navegador)" : "opcional"}"><span class="hint">Enviado como “Authorization: Bearer”. Fica só neste navegador. Com a URL vazia na Vercel, deixe vazio também.</span></div>
        <div class="callout info">${ic("info")}<div>A Vercel não alcança a rede 192.168.0.x. Para dados reais, a API precisa estar publicada com HTTPS (por exemplo, Cloudflare Tunnel ou Tailscale Funnel) e liberar CORS para o domínio do painel.</div></div>
        <div style="display:flex;gap:8px"><button class="btn primary" type="submit">Salvar e recarregar</button><button class="btn" type="button" data-act="testConn">Testar conexão</button></div>
        <div id="connOut"></div></form>`;
    } else {
      body = `<div style="max-width:680px;display:flex;flex-direction:column;gap:12px;font-size:13px">
        <dl class="kv"><dt>Versão do painel</dt><dd>2.0.0</dd><dt>Fonte de dados</dt><dd>${c.mode === "demo" ? "Demonstração" : "API · " + esc(c.apiBase || "mesma origem")}</dd><dt>Lojas / DVRs / canais</dt><dd>${S.stores.length} / ${S.devices.length} / ${S.channels.length}</dd></dl>
        ${c.mode === "demo" ? `<div class="callout warn">${ic("info")}<div>No modo demonstração, as 31 lojas e seriais são reais, mas status, IPs e histórico são simulados. Você pode restaurar os dados de exemplo a qualquer momento.</div></div><div><button class="btn danger" data-act="resetDemo">Restaurar dados de demonstração</button></div>` : ""}</div>`;
    }
    const html = `<div class="card"><div class="card-b"><div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? "active" : ""}" data-set="tab" data-val="${k}">${l}</button>`).join("")}</div>${body}</div></div>`;
    return {
      title: "Configurações", sub: "Parâmetros do monitoramento", html,
      after() {
        const fs = $("#fSet");
        if (fs) fs.addEventListener("submit", async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(fs));
          const out = {};
          Object.entries(f).forEach(([k, v]) => (out[k] = Number(v)));
          out.freeze_detection = !!f.freeze_detection;
          out.snapshots = !!f.snapshots;
          if (out.poll_interval < 15 || out.poll_interval > 3600) return toast("O intervalo permitido é de 15 a 3.600 segundos.", "bad");
          for (const el of $$("input[type=number]", fs)) if (!el.checkValidity()) return toast("Valor fora do limite: " + esc(el.closest(".field").querySelector("label").textContent), "bad");
          try { await busy(e.submitter, () => DB.saveSettings(out)); toast("Configurações salvas.", "ok"); await reload(); render(); } catch (err) { toast(esc(err.message), "bad"); }
        });
        const fsl = $("#fSlack");
        if (fsl) fsl.addEventListener("submit", async (e) => {
          e.preventDefault();
          const n = {};
          $$("input[type=checkbox]", fsl).forEach((x) => (n[x.name] = x.checked));
          try { await busy(e.submitter, () => DB.saveSettings({ slack_notify: n })); toast("Regras do Slack salvas.", "ok"); await reload(); render(); } catch (err) { toast(esc(err.message), "bad"); }
        });
        const fc = $("#fConn");
        if (fc) fc.addEventListener("submit", async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(fc));
          const cur = DB.conn();
          const apiBase = f.apiBase.trim().replace(/\/$/, "");
          if (apiBase && !/^https?:\/\//.test(apiBase)) return toast("A URL deve começar com https://", "bad");
          if (location.protocol === "https:" && apiBase.startsWith("http://")) toast("Atenção: páginas HTTPS (Vercel) não conseguem chamar APIs em http://.", "warn");
          DB.setConn({ mode: f.mode, apiBase, apiToken: f.apiToken || cur.apiToken });
          toast("Conexão salva.", "ok");
          if (await reload()) render();
        });
      },
    };
  };

  // ================================================================ ações globais
  function themeGet() { try { return localStorage.getItem("pcftv-theme") || ""; } catch (e) { return ""; } }
  function themeSet(t) {
    try { if (t) localStorage.setItem("pcftv-theme", t); else localStorage.removeItem("pcftv-theme"); } catch (e) { /* sem armazenamento */ }
    if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
  }
  const ACTIONS = {
    snapZoom: (el) => snapZoom(Number(el.dataset.id)),
    theme() { const order = ["", "light", "dark"]; themeSet(order[(order.indexOf(themeGet()) + 1) % 3]); updateChrome(); },
    newStore: () => storeForm(),
    editStore: (el) => storeForm(Object.assign({}, idx.store[el.dataset.id])),
    async delStore(el) {
      const s = idx.store[el.dataset.id];
      const n = (idx.devByStore[s.id] || []).length;
      if (n) return toast(`Não é possível excluir: ${esc(s.name)} tem ${n} DVR(s) vinculado(s). Mova ou exclua os DVRs primeiro.`, "bad");
      if (!(await confirmBox("Excluir loja", `A loja <b>${esc(s.name)}</b> será removida do cadastro.`, { danger: true, ok: "Excluir", requireText: s.name }))) return;
      try { await DB.deleteStore(s.id); toast("Loja excluída.", "ok"); closeOverlays(); await reload(); render(); } catch (e) { toast(esc(e.message), "bad"); }
    },
    newDevice: (el) => deviceForm(null, el.dataset.store),
    editDev: (el) => deviceForm(Object.assign({}, idx.dev[el.dataset.id])),
    async delDev(el) {
      const d = idx.dev[el.dataset.id];
      const n = (idx.chByDev[d.id] || []).length;
      if (!(await confirmBox("Excluir DVR", `O DVR <b>${esc(d.serial)}</b> de ${esc(storeName(d.store_id))} e seus <b>${n} canais</b> serão removidos. O histórico de eventos é mantido.`, { danger: true, ok: "Excluir DVR", requireText: d.serial }))) return;
      try { await DB.deleteDevice(d.id); toast("DVR excluído.", "ok"); closeOverlays(); await reload(); render(); } catch (e) { toast(esc(e.message), "bad"); }
    },
    testDev: (el) => testDevice(Number(el.dataset.id), el),
    onvif: (el) => onvifDiscover(Number(el.dataset.id)),
    newChannel: (el) => channelForm(null, el.dataset.dev),
    editCh: (el) => channelForm(Object.assign({}, idx.ch[el.dataset.id])),
    async delCh(el) {
      const c = idx.ch[el.dataset.id];
      if (!(await confirmBox("Excluir canal", `O canal <b>${c.number} · ${esc(c.name)}</b> será removido.`, { danger: true, ok: "Excluir" }))) return;
      try { await DB.deleteChannel(c.id); toast("Canal excluído.", "ok"); closeOverlays(); await reload(); render(); } catch (e) { toast(esc(e.message), "bad"); }
    },
    testCh: (el) => testChannel(Number(el.dataset.id), el),
    async runNow(el) {
      try {
        const r = await busy(el, () => DB.runNow());
        announce((r && r.changes) || []);
        nextCycle = Date.now() + cycleMs();
        await reload(true); render();
        toast("Verificação concluída.", "ok");
      } catch (e) { toast(esc(e.message), "bad"); }
    },
    async testSlack(el) {
      try { const r = await busy(el, () => DB.testSlack()); toast(esc((r && r.message) || "Alerta de teste enviado."), "ok"); await reload(true); render(); } catch (e) { toast(esc(e.message), "bad"); }
    },
    ack(el) { DB.ackAlert(el.dataset.key); toast("Alerta reconhecido. Ele sai da lista ativa, mas continua no histórico.", "ok"); reload(true).then(render); },
    csvHist() {
      downloadCsv("historico-cftv.csv", [["Data", "Loja", "DVR", "Canal", "Evento", "Descrição", "Duração (s)", "Recuperação"]].concat(histRows.map((e) => {
        const d = idx.dev[e.device_id] || {}; const c = idx.ch[e.channel_id];
        return [fmtDate(e.ts, true), storeName(e.store_id), d.serial || "", c ? c.number + " " + c.name : "", evLabel(e.type), e.description, e.open ? "em aberto" : e.duration_s ?? "", e.recovered_at ? fmtDate(e.recovered_at, true) : ""];
      })));
    },
    csvRel(el) {
      const rows = availability(Number(el.dataset.dias));
      downloadCsv(`disponibilidade-${el.dataset.dias}d.csv`, [["Loja", "Disponibilidade DVR", "Disponibilidade canais", "Incidentes", "Tempo fora DVR (min)", "MTTR (min)"]].concat(rows.map((r) => [r.store.name, r.devAvail == null ? "" : (r.devAvail * 100).toFixed(2), r.chAvail == null ? "" : (r.chAvail * 100).toFixed(2), r.incidents, Math.round(r.downMs / 60000), r.mttr ? Math.round(r.mttr / 60) : ""])));
    },
    print: () => window.print(),
    async testConn() {
      const out = $("#connOut");
      const f = Object.fromEntries(new FormData($("#fConn")));
      const base = f.apiBase.trim().replace(/\/$/, "");
      out.innerHTML = '<div class="log"><span class="dim">GET ' + esc(base) + '/api/summary …</span></div>';
      try {
        const headers = {};
        const tok = f.apiToken || DB.conn().apiToken;
        if (tok) headers.Authorization = "Bearer " + tok;
        const r = await fetch(base + "/api/summary", { headers });
        const j = await r.json();
        out.innerHTML = `<div class="log"><div class="${r.ok ? "ok" : "bad"}">${r.ok ? "✔" : "✖"} HTTP ${r.status}</div><div>${esc(JSON.stringify(j))}</div></div>`;
      } catch (e) { out.innerHTML = `<div class="log"><div class="bad">✖ Sem resposta: ${esc(e.message)}. Verifique HTTPS, CORS e se a API está publicada.</div></div>`; }
    },
    async resetDemo() {
      if (!(await confirmBox("Restaurar demonstração", "Os dados simulados deste navegador voltam ao estado inicial.", { ok: "Restaurar" }))) return;
      DB.resetDemo(); await reload(); render(); toast("Dados de demonstração restaurados.", "ok");
    },
  };
  function closeOverlays() { $$(".overlay").forEach((o) => o.remove()); }
  function announce(changes) {
    changes.forEach((e) => {
      const sev = (DB.EVENT_TYPES[e.type] || {}).sev;
      toast(`<b>${esc(evLabel(e.type))}</b><br>${esc(storeName(e.store_id))}${e.channel_id ? " · canal " + ((S && idx.ch[e.channel_id]) || {}).number : ""}`, sev === "critico" ? "bad" : sev === "atencao" ? "warn" : sev === "ok" ? "ok" : "");
    });
  }

  // delegação de eventos
  document.addEventListener("click", (e) => {
    const t = e.target;
    const act = t.closest("[data-act]");
    if (act && !act.disabled) { e.preventDefault(); e.stopPropagation(); const fn = ACTIONS[act.dataset.act]; if (fn) fn(act); return; }
    const setter = t.closest("[data-set]");
    if (setter && !setter.disabled) { e.preventDefault(); const { page, params } = parseHash(); params[setter.dataset.set] = setter.dataset.val; if (setter.dataset.set !== "pag") delete params.pag; go(page, params); return; }
    const ch = t.closest("[data-ch]");
    if (ch && ch.dataset.ch) { e.stopPropagation(); channelDrawer(Number(ch.dataset.ch)); return; }
    const dev = t.closest("[data-dev]");
    if (dev && dev.dataset.dev) { deviceDrawer(Number(dev.dataset.dev)); return; }
    const st = t.closest("[data-store]");
    if (st && st.dataset.store) { storeDrawer(Number(st.dataset.store)); return; }
    const al = t.closest("[data-alert]");
    if (al) { alertOpen(al.dataset.alert); return; }
    const g = t.closest("[data-go]");
    if (g && g.dataset.go) { e.preventDefault(); closeOverlays(); location.hash = g.dataset.go; }
  });
  let typing;
  document.addEventListener("input", (e) => {
    const el = e.target.closest("[data-param]");
    if (!el || el.tagName !== "INPUT" || el.type === "date") return;
    clearTimeout(typing);
    typing = setTimeout(() => { const pos = el.selectionStart; setParam(el.dataset.param, el.value); requestAnimationFrame(() => { const n = $(`[data-param="${el.dataset.param}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ok */ } } }); }, 280);
  });
  document.addEventListener("change", (e) => {
    const el = e.target.closest("[data-param]");
    if (!el || (el.tagName === "INPUT" && el.type !== "date")) return;
    const { page, params } = parseHash();
    params[el.dataset.param] = el.value;
    if (el.dataset.param === "loja") delete params.dvr;
    delete params.pag;
    go(page, params);
  });
  $("#menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  document.addEventListener("click", (e) => { if (document.body.classList.contains("nav-open") && !e.target.closest(".sidebar") && !e.target.closest("#menuBtn")) document.body.classList.remove("nav-open"); });
  window.addEventListener("hashchange", render);

  // ciclo automático
  setInterval(async () => {
    tickInfo();
    updateCountdown();
    if (!S || Date.now() < nextCycle) return;
    nextCycle = Date.now() + cycleMs();
    if ($(".overlay")) { const ch = DB.tick(); announce(ch); return; } // não redesenha com formulário aberto
    announce(DB.tick());
    if (await reload(true)) render();
  }, 1000);

  (async function start() {
    nextCycle = Date.now() + cycleMs();
    if (await reload()) render();
  })();
})();
