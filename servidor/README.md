# Potencial CFTV · Serviço de monitoramento

Backend FastAPI que verifica de verdade os DVRs e as câmeras das lojas: rede (TCP), autenticação, ONVIF e vídeo (RTSP com FFmpeg). Grava histórico de disponibilidade, abre e fecha incidentes e avisa no Slack sem repetir a mesma falha.

Ele roda **ao lado** do sistema atual, num container novo (`potencial-cftv-monitor`, porta **8096**), usando o mesmo PostgreSQL num schema separado (`monitor`). O container `potencial-cftv`, o banco e o volume `cftv_db_data` não são alterados. O inventário (31 lojas, 31 DVRs, 141 canais) vem embutido e é carregado sozinho na primeira subida, com o banco vazio. Não depende do sistema antigo.

## Como cada coisa é detectada

| Pergunta | Como | Resultado |
|---|---|---|
| DVR responde na rede? | Conexão TCP na porta de serviço (37777), com timeout e N tentativas; se falhar, tenta a porta RTSP | `ONLINE` / `OFFLINE` |
| Conexão está estável? | Respondeu só depois de falhar, ou caiu e voltou X vezes na janela configurada | `INSTAVEL` |
| Usuário e senha estão certos? | ONVIF `GetDeviceInformation` (WS-Security digest) ou RTSP `DESCRIBE` com Digest/Basic, sem abrir vídeo | `ERRO_AUTENTICACAO` |
| Sem IP (P2P/Relay)? | Não há rota do servidor até o DVR. O sistema **não simula** conectividade | `NAO_VERIFICADO` com o motivo |
| Quantos canais e quais URLs? | ONVIF `GetVideoSources`, `GetProfiles`, `GetStreamUri` (descoberta manual pelo IP); WS-Discovery para a rede local | perfis por canal, sem credenciais |
| A câmera está mandando vídeo? | FFmpeg abre o RTSP (TCP, substream), decodifica 3 quadros reduzidos (160×90, 1 fps) | `TRANSMITINDO` |
| Câmera sem sinal? | Conectou mas nenhum quadro chegou, ou a imagem é uniforme (tela preta/azul de "sem vídeo"), ou o canal não existe (404) | `SEM_VIDEO` |
| Imagem congelada? | Quadros idênticos byte a byte na amostra, ou idênticos à verificação anterior | `SEM_VIDEO` (detalhe "congelada") |
| Como está a imagem? | No mesmo teste, o FFmpeg grava uma 2ª saída: uma foto JPEG do canal (até 640 px de largura). Sem conexão extra com o DVR | foto nos quadradinhos do painel |
| DVR caiu? | Os canais viram `OFFLINE` com detalhe "DVR offline" e **não** geram alerta de canal; o alerta é do DVR | diferencia câmera sem vídeo de DVR fora |

Antes de mudar um canal para falha, o monitor testa de novo após 5 s (reconexão). Responder TCP nunca é tratado como "tem vídeo".

### Cuidados com os equipamentos

- **Um fluxo RTSP por DVR por vez** e no máximo `rtsp_concurrency` no total (padrão 4), usando o substream, para não ocupar o link das lojas.
- **Senha errada não é repetida**: depois de um `ERRO_AUTENTICACAO`, o monitor espera 30 min (ou uma senha nova) antes de tentar de novo. DVRs Intelbras/Dahua costumam bloquear o usuário após algumas tentativas erradas.
- Verificação de DVR usa só conexão TCP + uma requisição leve de autenticação.

## Alertas (Slack)

- Eventos: DVR offline, DVR voltou online, canal perdeu vídeo, canal voltou a transmitir, falha de autenticação, sem comunicação prolongada (após `offline_alert_minutes`).
- Cada falha abre **um incidente** (índice único no banco). Enquanto ele está aberto, não sai novo alerta; só um lembrete a cada `slack_repeat_minutes`.
- Se muitos equipamentos caem no mesmo ciclo (ex.: VPN do servidor fora), vai **uma mensagem consolidada** com a dica de verificar a rede do servidor.
- Tudo fica no histórico (`events`) com duração e horário de recuperação. O webhook nunca aparece na API nem nos logs.

## Segurança

- Senhas dos DVRs criptografadas com Fernet (AES + HMAC); a chave fica só em `CFTV_SECRET_KEY`. A API devolve apenas `has_password`.
- URLs RTSP com usuário/senha existem só em memória, na chamada do FFmpeg. Respostas e logs passam por máscara (`rtsp://***@host`).
- Tokens: `API_ADMIN_TOKEN` (altera) e `API_READ_TOKEN` (só consulta), via `Authorization: Bearer`. Sem token configurado, alterações ficam bloqueadas.
- Validação de entrada (IP/hostname, portas, serial, caminhos RTSP sem credenciais), CORS restrito ao painel, cabeçalhos de segurança.
- Container sem root. Migrações só adicionam estruturas (o código recusa `DROP`/`TRUNCATE`).

## Implantação no servidor 192.168.0.46

Só cria o container novo. Faça o backup antes, mesmo assim.

```bash
# 1) Backup do banco e da pasta atual
mkdir -p ~/backup
docker exec potencial-cftv-db pg_dump -U cftv -Fc potencial_cftv > ~/backup/potencial_cftv_$(date +%F_%H%M).dump
tar czf ~/backup/potencial-cftv-app_$(date +%F_%H%M).tgz -C /home/potencial potencial-cftv
ls -lh ~/backup

# 2) Código
cd /home/potencial
git clone https://github.com/ProjetosPotencial/cftv-potencial.git   # ou git pull, se já existir
cd cftv-potencial

# 3) Configuração
cp servidor/.env.example servidor/.env
nano servidor/.env          # senha do banco, CFTV_SECRET_KEY, tokens, SLACK_WEBHOOK_URL
docker network ls | grep cftv   # se o nome não for potencial-cftv_default, exporte CFTV_NETWORK=<nome>

# 4) Subir só o monitor
docker compose -f servidor/compose.monitor.yml up -d --build
docker logs -f potencial-cftv-monitor      # deve aparecer "migração aplicada" e "monitor iniciado"
curl http://localhost:8096/api/health

# 5) Conferir o inventário (carregado sozinho na primeira subida)
curl -H "Authorization: Bearer <API_ADMIN_TOKEN>" http://localhost:8096/api/summary
```

Painel: `http://192.168.0.46:8096` já abre o painel ligado a esta API (informe o token em Configurações › Conexão). O painel da Vercel usa a mesma API quando ela for publicada com HTTPS (ver README da raiz).

Pelo Portainer também funciona: Stacks › Add stack › Repository, apontando para `servidor/compose.monitor.yml`, com as variáveis do `.env`.

**Voltar atrás:** `docker compose -f servidor/compose.monitor.yml down` (sem `-v`). O sistema atual continua como estava. Os dados do monitor ficam no schema `monitor` até você decidir apagá-los.

**Atualizar:** `git pull && docker compose -f servidor/compose.monitor.yml up -d --build`.

## Para começar a monitorar um DVR

1. Em DVRs › Editar: informe o **IP ou hostname alcançável pelo servidor** (VPN, Tailscale, MikroTik, DDNS), portas, protocolo, usuário e senha.
2. Clique em **Testar** (TCP, autenticação) e, se for ONVIF, em **Descobrir ONVIF** → **Sincronizar canais** (canais existentes nunca são apagados).
3. O monitor passa a verificar sozinho no intervalo configurado.

Sem IP, o DVR fica `NÃO VERIFICADO` com o motivo. É o caso dos 31 DVRs hoje, todos em P2P/Relay.

## Rede: P2P/Relay e VPN

O servidor só monitora o que ele alcança por IP. Um DVR que abre no app Intelbras (P2P/Relay pela nuvem do fabricante) **não** está acessível para o servidor. Caminhos, do mais recomendado:

1. **VPN site-to-site por loja** (MikroTik com WireGuard/IPsec até a matriz, ou Tailscale num roteador/mini-PC da loja anunciando a sub-rede do DVR). O servidor passa a enxergar `10.x.y.z:37777/554` e tudo funciona.
2. **Tailscale no servidor + subnet router na loja**: mesmo resultado, sem abrir portas.
3. **DDNS + portas abertas**: funciona, mas expõe o DVR na internet. Se usar, restrinja por IP de origem.
4. **P2P do fabricante**: exige o SDK/serviço da Intelbras/Dahua. Não há integração aqui; se for necessário, o caminho é um conector específico usando o SDK oficial.

O container usa a rede bridge do Docker e sai pelas rotas do host, então rotas de VPN/Tailscale do servidor valem para ele. A descoberta automática ONVIF por multicast (WS-Discovery) só enxerga a rede local do servidor; para lojas, use a descoberta pelo IP.

## Rodar num PC Windows (sem o servidor antigo)

Para quando não há o servidor Linux com o banco antigo. O `compose.windows.yml` sobe **banco + monitor** juntos.

1. Instale o **Docker Desktop** (com WSL2) e o **Git**. Deixe o Docker Desktop iniciando com o Windows.
2. No PowerShell:
   ```
   git clone https://github.com/ProjetosPotencial/cftv-potencial
   cd cftv-potencial
   copy servidor\.env.windows.example servidor\.env.windows
   notepad servidor\.env.windows      # preencha CFTV_SECRET_KEY e os tokens
   docker compose -f servidor/compose.windows.yml up -d --build
   ```
3. Abra `http://localhost:8096`. O inventário (31 lojas, 31 DVRs, 141 canais) carrega sozinho.
4. Atualizar depois: `git pull` e o mesmo `docker compose ... up -d --build`.

Se o PC estiver **na mesma rede do DVR** (ex.: piloto na loja), o monitor já alcança o IP local do DVR sem VPN. Para outras lojas, o PC entra no Tailscale (no Windows as rotas das lojas entram sozinhas) e cada loja anuncia sua sub-rede. Teste de dentro do container: `docker exec potencial-cftv-monitor python -c "import socket;socket.create_connection(('IP_DO_DVR',37777),5);print('ok')"`.

## Configurações (`PUT /api/settings`)

| Campo | Padrão | Limites |
|---|---|---|
| `poll_interval` (s entre verificações do DVR) | 60 | 15–3600 (cada DVR pode ter o seu) |
| `timeout_s` / `retries` / `concurrency` | 5 / 3 / 10 | 1–60 / 1–10 / 1–100 |
| `rtsp_interval` (s entre testes de vídeo por canal) | 300 | 60–86400 |
| `rtsp_timeout_s` / `rtsp_concurrency` | 10 / 4 | 3–60 / 1–16 |
| `rtsp_substream`, `freeze_detection`, `snapshots` (foto de cada canal) | sim, sim, sim | |
| `offline_alert_minutes` / `slack_repeat_minutes` | 30 / 60 | 5–1440 |
| `unstable_changes` em `unstable_window_minutes` | 3 em 30 min | |
| `retention_days` (amostras de disponibilidade) | 180 | 7–3650 (eventos e incidentes não são apagados) |
| `slack_notify` | todos ligados | por tipo de evento |

## Fotos dos canais

A cada teste de vídeo (padrão: a cada 5 min por canal, `rtsp_interval`) o monitor guarda uma foto de cada câmera em `SNAPSHOT_DIR` (padrão `/app/data/snapshots`, um arquivo por canal, sobrescrito; ~30 KB cada). A foto anterior só é trocada quando chega uma imagem nova, então um canal que caiu continua mostrando a última imagem recebida, em cinza, com a idade da foto. O botão "Testar transmissão" também atualiza a foto na hora.

Para ver as fotos no painel da Vercel, a API precisa estar publicada com HTTPS (ver "Publicar a API com HTTPS" abaixo). As fotos só existem para DVRs que o servidor alcança por IP: os que estão só em P2P/Relay continuam sem foto até haver VPN.

## Publicar a API com HTTPS (Cloudflare Tunnel)

O painel da Vercel é HTTPS e roda no navegador, fora da rede da empresa, então precisa de uma URL HTTPS pública para a porta 8096. O jeito mais simples, sem abrir porta no roteador:

```bash
# no servidor 192.168.0.46, com um domínio já na Cloudflare
docker run -d --name cftv-tunnel --restart unless-stopped --network host \
  cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <TOKEN_DO_TUNNEL>
```

No painel da Cloudflare (Zero Trust › Networks › Tunnels) crie o túnel, copie o token e adicione um *Public hostname*, por exemplo `cftv-api.seudominio.com.br` → `http://localhost:8096`. Depois:

1. No `.env` do monitor, tokens fortes em `API_READ_TOKEN`/`API_ADMIN_TOKEN` (`openssl rand -hex 32`) e `ALLOW_ANONYMOUS_READ=false`. Reinicie o container.
2. Na Vercel, variáveis `CFTV_API_URL=https://cftv-api.seudominio.com.br` e `CFTV_API_TOKEN=<API_ADMIN_TOKEN>`, e Redeploy. O painel passa a falar com o monitor pela própria Vercel, depois do login, e o token não vai para o navegador (ver “Login do painel” no README da raiz).
   Alternativa sem proxy: Configurações › Conexão com a URL do túnel e o token, e `CORS_ORIGINS=https://cftv-potencial.vercel.app` no `.env`.

As fotos usam o mesmo token das outras rotas; sem token a API responde 401.

## Rotas

Compatíveis com o painel (`painel/`): `GET /api/summary`, `/api/stores`, `/api/devices`, `/api/channels`, `/api/events`, `/api/settings`, e as de cadastro/ação listadas no README da raiz. Novas:

- `GET /api/health` (sem token)
- `GET /api/channels/{id}/snapshot` · última foto do canal (JPEG, mesmo token de leitura). `GET /api/channels` traz `snapshot_at` (data da foto) para o painel só baixar de novo quando muda
- `GET /api/devices/{id}/availability?days=7` · disponibilidade por dia e incidentes do DVR
- `GET /api/incidents?open_only=true` · alertas ativos
- `GET /api/events?store_id=&device_id=&channel_id=&type=A,B&since=&until=&store=&serial=&format=csv`
- `GET /api/reports/availability?from=2026-11-01&to=2026-11-30[&store_id=][&format=csv]` · por loja e por DVR
- `GET /api/reports/incidents-timeline?days=30`
- `GET /api/monitor/status`, `POST /api/onvif/scan`, `POST /api/admin/import-legacy?dry_run=true` (recarrega o inventário embutido, só acrescenta o que falta; com `LEGACY_API_URL` lê de outro sistema)
- Documentação interativa: `/api/docs`

## Desenvolvimento

```bash
cd servidor
pip install -r requirements-dev.txt          # precisa de ffmpeg e de um PostgreSQL de teste
DATABASE_URL=postgresql://cftv:cftv@127.0.0.1:5432/potencial_cftv pytest
```

Os testes usam um schema próprio (`monitor_test`), DVR RTSP simulado (Digest), ONVIF simulado (perfis Intelbras) e fontes sintéticas do FFmpeg (vídeo normal, tela preta, imagem congelada).
