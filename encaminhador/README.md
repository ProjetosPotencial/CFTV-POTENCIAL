# Notificações dos DVRs no painel

Os próprios DVRs avisam o painel quando algo acontece. Não precisa de VPN, de PC ligado nem de servidor Linux.

```
DVR da loja ──e-mail──▶ caixa de e-mail dos alertas ──Apps Script (1 min)──▶ painel na Vercel (/api/dvr-eventos) ──▶ tela "Notificações DVR"
```

O que chega: perda de vídeo, câmera offline, erro de HD / sem HD / HD cheio, rede ausente, conflito de IP, login ilegal, mascaramento, movimento (escondido por padrão) e o e-mail de teste. A tela organiza tudo por loja, pelo número de série.

## 1. Vercel (uma vez)

1. **Banco**: Vercel › projeto `cftv-potencial` › **Storage** › **Create Database** › **Upstash for Redis** (plano grátis) › **Connect Project**. A Vercel cria sozinha `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
2. **Token do encaminhador**: Settings › Environment Variables › `DVR_WEBHOOK_TOKEN` = um texto secreto longo (ex.: gere com `openssl rand -hex 24` ou um gerador de senha de 40+ caracteres). Ambiente Production.
3. **Redeploy** (Deployments › ⋯ › Redeploy).

## 2. Caixa de e-mail que recebe os alertas (uma vez)

Pode ser uma conta Google nova ou uma caixa que já é usada no dia a dia (Gmail ou Google Workspace da empresa). O script só mexe nos e-mails cujo **assunto tem "CFTV"**: não marca nada como lido, não apaga e não move. Ele só põe o marcador **CFTV-DVR** nessas conversas, para você achar (e, se quiser, criar um filtro do Gmail que pule a caixa de entrada para elas).

1. Ative a verificação em duas etapas e crie uma **senha de app** (Conta Google › Segurança › Senhas de app). É essa senha que vai no DVR, não a senha da conta.
2. Abra <https://script.google.com> logado nessa conta › **Novo projeto**.
3. Apague o conteúdo e cole o arquivo [`gmail-apps-script.gs`](gmail-apps-script.gs).
4. **Configurações do projeto** (engrenagem) › **Propriedades do script** › adicione:
   - `PAINEL_URL` = `https://cftv-potencial.vercel.app` (o endereço do painel)
   - `DVR_WEBHOOK_TOKEN` = o mesmo valor da Vercel
5. Volte ao editor, escolha a função `enviarTeste` › **Executar** › autorize. Deve aparecer `200 {"ok":true,...}` e a notificação surge na tela **Notificações DVR** em Barão de Cocais.
6. Escolha `instalarAgendamento` › **Executar** (uma vez só). A partir daí o script roda sozinho a cada minuto.

Por isso o **Assunto de todo DVR precisa começar com `CFTV`**. Para usar outro critério, preencha a propriedade `FILTRO` com uma busca do Gmail (ex.: `from:dvr@empresa.com.br`).

## 3. Em cada DVR (Intelbras MHDX)

Pela interface web do DVR ou pelo próprio monitor do DVR:

**Rede › E-mail**
- Habilitar: sim
- Servidor SMTP: `smtp.gmail.com` · Porta `465` · Criptografia **SSL** (se o DVR só tiver TLS, use porta `587`)
- Usuário: o e-mail da caixa de alertas · Senha: a **senha de app** (no Google Workspace, se "Senhas de app" não aparecer, o administrador precisa liberar a verificação em duas etapas para a conta)
- Remetente: o mesmo e-mail · Destinatário: o mesmo e-mail
- **Assunto: `CFTV <nome da loja> <número de série>`**, ex.: `CFTV Barao de Cocais IMRG13045096H`. O número de série no assunto é o que liga a notificação à loja certa.
- Se existir a opção de **e-mail de teste periódico / saúde / intervalo de envio**, ligue com o maior intervalo disponível (ex.: a cada 12 ou 24 h). É isso que mostra que o DVR está vivo mesmo sem eventos.
- Clique em **Testar** e confira se chegou.

**Eventos** (marque **Enviar e-mail** em cada um)
- Eventos › Anormalidade › **HD**: Sem HD, Erro no HD, HD sem espaço
- Eventos › Anormalidade › **Rede**: Rede ausente/Offline, Conflito de IP (o e-mail sai quando a rede volta)
- Eventos › **Perda de vídeo**, **Mascaramento**, **Câmera offline** (todos os canais)
- Alerta de segurança › **Login ilegal**
- Movimento: só se quiser (gera muito e-mail; a tela esconde por padrão)

## Como o painel sabe que um DVR caiu

O DVR sem internet não consegue mandar e-mail. Por isso a tela mostra, para cada loja, o **último contato**. Se a loja passar do tempo escolhido em "Sem notícias após" (padrão 24 h) sem mandar nada, ela vai para **Sem notícias**. Com o e-mail periódico de teste ligado no DVR, esse aviso fica confiável. Sem ele, só dá para saber que o DVR "não falou nada", o que também acontece num dia sem eventos.

## Outros serviços de e-mail

A rota `POST /api/dvr-eventos` aceita JSON `{ id, from, subject, text, date }` (ou formulário com `from`, `subject`, `text`) com o cabeçalho `Authorization: Bearer <DVR_WEBHOOK_TOKEN>`. Então qualquer serviço de e-mail de entrada (CloudMailin, Mailgun, SendGrid Inbound Parse, Cloudflare Email Workers) pode substituir o Apps Script.
