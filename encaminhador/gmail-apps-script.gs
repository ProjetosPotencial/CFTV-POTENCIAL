/**
 * Encaminhador: Gmail -> painel Potencial CFTV (Vercel).
 *
 * Roda no Google Apps Script da conta que recebe os e-mails dos DVRs.
 * Seguro para uma caixa de uso normal: só toca nos e-mails cujo ASSUNTO tem "CFTV"
 * (o assunto que configuramos nos DVRs). Não marca nada como lido, não apaga, não move:
 * apenas coloca o marcador "CFTV-DVR" nas conversas dos DVRs e lembra até onde já leu.
 *
 * Propriedades do script (Configurações do projeto › Propriedades do script):
 *   PAINEL_URL         ex.: https://cftv-potencial.vercel.app
 *   DVR_WEBHOOK_TOKEN  o mesmo valor colocado na Vercel
 *   FILTRO (opcional)  troca o filtro padrão subject:CFTV (ex.: from:dvr@empresa.com.br)
 *
 * Passo a passo completo: encaminhador/README.md
 */

const FILTRO_PADRAO = "subject:CFTV";
const MARCADOR = "CFTV-DVR";

function encaminharNotificacoesDvr() {
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty("PAINEL_URL") || "").replace(/\/+$/, "");
  const token = props.getProperty("DVR_WEBHOOK_TOKEN") || "";
  if (!base || !token) throw new Error("Preencha PAINEL_URL e DVR_WEBHOOK_TOKEN nas Propriedades do script.");
  const filtro = (props.getProperty("FILTRO") || FILTRO_PADRAO).trim();
  if (!filtro) throw new Error("O FILTRO não pode ficar vazio.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // outra execução ainda está rodando

  try {
    // Até onde já leu (em ms). Na 1ª vez, pega só a última hora.
    let ultimo = Number(props.getProperty("ULTIMO_MS")) || Date.now() - 3600e3;
    const desde = Math.floor((ultimo - 120e3) / 1000); // 2 min de folga; o painel ignora repetidos
    const threads = GmailApp.search(filtro + " after:" + desde, 0, 100);
    const label = GmailApp.getUserLabelByName(MARCADOR) || GmailApp.createLabel(MARCADOR);

    const msgs = [];
    for (const t of threads) {
      for (const m of t.getMessages()) {
        if (m.getDate().getTime() <= ultimo - 120e3) continue; // já enviado antes
        // Com o filtro padrão, confere o assunto de cada e-mail (a conversa pode ter outros).
        if (!props.getProperty("FILTRO") && !/cftv/i.test(m.getSubject() || "")) continue;
        msgs.push({ m: m, t: t });
      }
    }
    msgs.sort((a, b) => a.m.getDate() - b.m.getDate());

    for (const { m, t } of msgs) {
      const res = UrlFetchApp.fetch(base + "/api/dvr-eventos", {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + token },
        payload: JSON.stringify({
          id: m.getId(),
          from: m.getFrom(),
          to: m.getTo(),
          subject: m.getSubject(),
          text: (m.getPlainBody() || "").slice(0, 6000),
          date: m.getDate().toISOString(),
        }),
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code !== 200) {
        // Para aqui e tenta de novo no próximo minuto a partir deste e-mail.
        console.warn("Painel respondeu " + code + ": " + res.getContentText().slice(0, 300));
        break;
      }
      t.addLabel(label);
      ultimo = Math.max(ultimo, m.getDate().getTime());
      props.setProperty("ULTIMO_MS", String(ultimo));
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

/** Teste: manda uma notificação de exemplo para o painel (aparece como "Teste" em Barão de Cocais). */
function enviarTeste() {
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty("PAINEL_URL") || "").replace(/\/+$/, "");
  const res = UrlFetchApp.fetch(base + "/api/dvr-eventos", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + props.getProperty("DVR_WEBHOOK_TOKEN") },
    payload: JSON.stringify({ subject: "CFTV teste do encaminhador IMRG13045096H", text: "Teste de e-mail enviado pelo Apps Script." }),
    muteHttpExceptions: true,
  });
  console.log(res.getResponseCode() + " " + res.getContentText());
}
