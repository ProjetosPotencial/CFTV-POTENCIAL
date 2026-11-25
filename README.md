# Potencial CFTV · Painel

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

Usadas para cadastro e ações (implementar no backend quando for ligar o painel real):

- `POST/PUT/DELETE /api/stores[/{id}]`
- `POST/PUT/DELETE /api/devices[/{id}]` · `PUT ...?remove_extra_channels=true` só quando o usuário confirma apagar canais excedentes
- `POST/PUT/DELETE /api/channels[/{id}]`
- `POST /api/devices/{id}/test` → `{ ok, status, steps: [{ ok, text }] }`
- `POST /api/devices/{id}/onvif/discover` → `{ supported, reason?, info, profiles: [{ token, channel, encoding, resolution, rtsp }] }` (RTSP sem usuário/senha)
- `POST /api/devices/{id}/channels/sync` com `{ profiles: [token] }` → `{ created, kept }`
- `POST /api/channels/{id}/test` → `{ ok, status, steps }`
- `PUT /api/settings`, `POST /api/slack/test`, `POST /api/monitor/run`

Campos opcionais que o painel aproveita se o backend enviar: `store_id`, `manufacturer`, `rtsp_port`, `onvif_port`, `protocol`, `username`, `has_password`, `status_since`, `last_seen`, `latency_ms`, `last_frame`, `resolution`, `fps`, e nos eventos `type`, `duration_s`, `recovered_at`, `open`.

Status esperados: DVR `ONLINE | OFFLINE | INSTAVEL | NAO_VERIFICADO | ERRO_AUTENTICACAO`; canal `TRANSMITINDO | SEM_VIDEO | OFFLINE | ERRO_AUTENTICACAO | NAO_VERIFICADO`.

## Publicar na Vercel

1. Importe este repositório na Vercel (Add New › Project).
2. Framework: **Other**. Root Directory: **painel**. Sem comando de build.
3. Deploy. Recomendo ativar *Deployment Protection* (senha ou login Vercel), porque o painel mostra o inventário das lojas.

## Ligar aos dados reais

A Vercel não alcança a rede `192.168.0.x`. Para o modo API funcionar a partir da Vercel:

1. Publique a API do servidor com HTTPS (por exemplo Cloudflare Tunnel ou Tailscale Funnel).
2. Libere CORS no FastAPI para o domínio do painel na Vercel.
3. Exija um token (`Authorization: Bearer`) nas rotas `/api`.
4. No painel, abra Configurações › Conexão, escolha “API”, informe a URL e o token.

Senhas dos DVRs nunca são exibidas: o formulário só envia uma senha nova quando ela é digitada, e o backend deve guardá-la criptografada.
