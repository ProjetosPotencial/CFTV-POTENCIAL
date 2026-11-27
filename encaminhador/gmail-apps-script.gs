/**
 * Encaminhador: Gmail -> painel Potencial CFTV (Vercel).
 *
 * Roda dentro do Google Apps Script da conta Gmail que recebe os e-mails dos DVRs.
 * A cada minuto pega os e-mails NÃO LIDOS da caixa de entrada, envia cada um para
 * /api/dvr-eventos do painel e marca como lido. Nada de senha fica neste código:
 * a URL e o token ficam em "Propriedades do script" (Configurações do projeto).
 *
 * Propriedades do script (Configurações do projeto › Propriedades do script):
 *   PAINEL_URL         ex.: https://cftv-potencial.vercel.app
 *   DVR_WEBHOOK_TOKEN  o mesmo valor colocado na Vercel
 *   FILTRO (opcional)  busca extra do Gmail, ex.: from:dvr@potencial.biz
 *
 * Passo a passo completo: encaminhador/README.md
 */

function encaminharNotificacoesDvr() {
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty("PAINEL_URL") || "").replace(/\/+$/, "");
  const token = props.getProperty("DVR_WEBHOOK_TOKEN") || "";
  if (!base || !token) throw new Error("Preencha PAINEL_URL e DVR_WEBHOOK_TOKEN nas Propriedades do script.");
  const filtro = props.getProperty("FILTRO") || "";

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // outra execução ainda está rodando

  try {
    const threads = GmailApp.search(("in:inbox is:unread " + filtro).trim(), 0, 50);
    for (const thread of threads) {
      for (const m of thread.getMessages()) {
        if (!m.isUnread()) continue;
        const payload = {
          id: m.getId(),
          from: m.getFrom(),
          to: m.getTo(),
          subject: m.getSubject(),
          text: (m.getPlainBody() || "").slice(0, 6000),
          date: m.getDate().toISOString(),
        };
        const res = UrlFetchApp.fetch(base + "/api/dvr-eventos", {
          method: "post",
          contentType: "application/json",
          headers: { Authorization: "Bearer " + token },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        });
        const code = res.getResponseCode();
        if (code === 200) {
          m.markRead();
        } else {
          // Deixa como não lido para tentar de novo no próximo minuto.
          console.warn("Painel respondeu " + code + ": " + res.getContentText().slice(0, 300));
          if (code === 401 || code === 503) return; // token ou banco errados: não adianta insistir agora
        }
      }
    }
  } finally {
    lock.releaseLock();
  }
}

/** Rode UMA vez (menu Executar) para agendar a cada 1 minuto. */
function instalarAgendamento() {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === "encaminharNotificacoesDvr") ScriptApp.deleteTrigger(t);
  }
  ScriptApp.newTrigger("encaminharNotificacoesDvr").timeBased().everyMinutes(1).create();
}

/** Teste: manda uma notificação de exemplo para o painel (aparece como "Teste"). */
function enviarTeste() {
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty("PAINEL_URL") || "").replace(/\/+$/, "");
  const res = UrlFetchApp.fetch(base + "/api/dvr-eventos", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + props.getProperty("DVR_WEBHOOK_TOKEN") },
    payload: JSON.stringify({ subject: "Teste do encaminhador IMRG13045096H", text: "Teste de e-mail enviado pelo Apps Script." }),
    muteHttpExceptions: true,
  });
  console.log(res.getResponseCode() + " " + res.getContentText());
}
