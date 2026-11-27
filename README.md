# Potencial CFTV

- `painel/`: painel web (HTML/CSS/JS, publicado na Vercel).
- `api/dvr-eventos.js` + `encaminhador/`: notificações enviadas pelos próprios DVRs (e-mail → painel), sem VPN. Veja [encaminhador/README.md](encaminhador/README.md).
- `servidor/`: serviço de monitoramento real (FastAPI + PostgreSQL + FFmpeg/ONVIF) que implementa as rotas abaixo. Veja [servidor/README.md](servidor/README.md).

## Painel

Painel web do monitoramento centralizado de DVRs e câmeras das lojas do Grupo Potencial.
HTML, CSS e JavaScript puros, sem build e sem dependências. Pronto para publicar na Vercel.

## Telas

Dashboard interativo · Lojas · DVRs · Canais (grade de câmeras por loja) · Monitoramento · Alertas · Histórico · Relatórios · Configurações.

## Fonte de dados

O painel tem dois modos, escolhidos em **Configurações › Conexão** (ou em `js/config.js`):

| Modo | O que faz |
|---|---|
| `demo` (padrão) | Usa as 31 lojas e seriais reais do inventário com status e histórico **simulados**, gravados só no navegador. Nada real é alterado. |
| `api` | Lê e grava na API FastAPI do servidor Potencial CFTV. |

### Rotas que o painel usa no modo API

Já existentes no backend atual:

- `GET /api/stores`, `GET /api/devices`, `GET /api/channels`, `GET /api/events?limit=N`, `GET /api/settings`, `GET /api/summary`

Usadas para cadastro e ações (implementadas em `servidor/`):

- `POST/PUT/DELETE /api/stores[/{id}]`
- `POST/PUT/DELETE /api/devices[/{id}]` · `PUT ...?remove_extra_channels=true` só quando o usuário confirma apagar canais excedentes
- `POST/PUT/DELETE /api/channels[/{id}]`
- `POST /api/devices/{id}/test` → `{ ok, status, steps: [{ ok, text }] }`
- `POST /api/devices/{id}/onvif/discover` → `{ supported, reason?, info, profiles: [{ token, channel, encoding, resolution, rtsp }] }` (RTSP sem usuário/senha)
- `POST /api/devices/{id}/channels/sync` com `{ profiles: [token] }` → `{ created, kept }`
- `POST /api/channels/{id}/test` → `{ ok, status, steps }`
- `GET /api/channels/{id}/snapshot` → foto JPEG do canal (o painel busca com o token e mostra nos quadradinhos quando `snapshot_at` vem em `/api/channels`)
- `PUT /api/settings`, `POST /api/slack/test`, `POST /api/monitor/run`

Campos opcionais que o painel aproveita se o backend enviar: `store_id`, `manufacturer`, `rtsp_port`, `onvif_port`, `protocol`, `username`, `has_password`, `status_since`, `last_seen`, `latency_ms`, `last_frame`, `resolution`, `fps`, e nos eventos `type`, `duration_s`, `recovered_at`, `open`.

Status esperados: DVR `ONLINE | OFFLINE | INSTAVEL | NAO_VERIFICADO | ERRO_AUTENTICACAO`; canal `TRANSMITINDO | SEM_VIDEO | OFFLINE | ERRO_AUTENTICACAO | NAO_VERIFICADO`.

## Publicar na Vercel

1. Importe este repositório na Vercel (Add New › Project).
2. Pode deixar tudo no padrão: o `vercel.json` da raiz já publica a pasta `painel` (sem build). O Root Directory precisa ficar na **raiz** do repositório, porque o login (`middleware.js`) mora lá.
3. Configure as variáveis do login (abaixo) e faça o deploy.

## Login do painel

O arquivo `middleware.js` roda no servidor da Vercel antes de entregar qualquer arquivo. Sem login válido, nada do painel sai para o navegador (nem o HTML, nem o `data.js` com o inventário, nem as fotos). Não é só uma tela no navegador: quem não entrou recebe 401 ou é mandado para `/login`.

Em Vercel › Project › Settings › Environment Variables (ambiente Production):

| Variável | Obrigatória | O que é |
|---|---|---|
| `PAINEL_USUARIO` | sim | usuário de acesso |
| `PAINEL_SENHA` | sim | senha de acesso (use uma forte) |
| `PAINEL_USUARIOS` | não | vários acessos de uma vez: `joao:senha1,maria:senha2` |
| `PAINEL_SEGREDO` | não | chave das sessões (`openssl rand -hex 32`). Sem ela, a chave sai das senhas: trocar uma senha derruba todas as sessões |
| `PAINEL_SESSAO_HORAS` | não | quanto tempo o login vale (padrão 12) |
| `CFTV_API_URL` | não | URL HTTPS do monitor (Cloudflare Tunnel), ex. `https://cftv-api.seudominio.com.br` |
| `DVR_WEBHOOK_TOKEN` | não | segredo do encaminhador de e-mails dos DVRs (tela Notificações DVR) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | não | banco Upstash Redis das notificações (criadas pela Vercel em Storage › Upstash for Redis) |
| `CFTV_API_TOKEN` | não | token da API do monitor (`API_ADMIN_TOKEN` para poder cadastrar, ou `API_READ_TOKEN` só para ver) |

Depois de criar ou mudar variáveis, faça um **Redeploy** (Deployments › ⋯ › Redeploy), porque a Vercel só lê as variáveis em um deploy novo. Sem `PAINEL_USUARIO`/`PAINEL_SENHA` o painel fica bloqueado (falha fechada). Para sair: botão **Sair** no rodapé do menu, ou `/sair`.

## Ligar aos dados reais

A Vercel não alcança a rede interna das lojas. O caminho recomendado:

1. Publique a API do monitor com HTTPS (Cloudflare Tunnel, ver `servidor/README.md`). A API já exige token em todas as rotas `/api` (menos `/api/health`), inclusive nas fotos.
2. Na Vercel, preencha `CFTV_API_URL` e `CFTV_API_TOKEN` e faça Redeploy.
3. Pronto: o painel abre direto no modo API e chama `/api/...` na própria Vercel, que confere o login e repassa para o monitor com o token. O token fica só na Vercel, nunca no navegador, e quem não fez login não vê dados nem fotos.

Se em algum navegador você já tinha salvo uma URL/token em Configurações › Conexão, deixe os dois campos **vazios** e o modo em “API” para usar esse caminho.

Ainda funciona o jeito antigo (URL do túnel e token digitados em Configurações › Conexão, com CORS liberado no monitor), mas aí o token fica guardado no navegador.

Senhas dos DVRs nunca são exibidas: o formulário só envia uma senha nova quando ela é digitada, e o backend deve guardá-la criptografada.
