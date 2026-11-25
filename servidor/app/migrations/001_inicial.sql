-- Potencial CFTV · monitoramento · esquema inicial
-- Tudo fica no schema "monitor" (as tabelas do sistema atual não são tocadas).
-- Migrações só ADICIONAM estruturas. Nunca DROP/TRUNCATE aqui.

CREATE TABLE IF NOT EXISTS stores (
    id          serial PRIMARY KEY,
    name        text NOT NULL,
    code        text NOT NULL DEFAULT '',
    city        text NOT NULL DEFAULT '',
    notes       text NOT NULL DEFAULT '',
    legacy_id   integer,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS stores_name_uq ON stores (lower(name));

CREATE TABLE IF NOT EXISTS devices (
    id             serial PRIMARY KEY,
    store_id       integer NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    manufacturer   text NOT NULL DEFAULT '',
    model          text NOT NULL DEFAULT '',
    serial         text NOT NULL,
    host           text,
    port           integer NOT NULL DEFAULT 37777,
    rtsp_port      integer NOT NULL DEFAULT 554,
    onvif_port     integer NOT NULL DEFAULT 80,
    mode           text NOT NULL DEFAULT '',          -- VPN, Tailscale, MikroTik, IP direto, DDNS, P2P, Relay
    protocol       text NOT NULL DEFAULT '',          -- ONVIF + RTSP, RTSP, ONVIF, Proprietário (SDK), A confirmar
    username       text NOT NULL DEFAULT '',
    password_enc   text,                               -- Fernet; nunca sai pela API
    channels       integer NOT NULL DEFAULT 0,
    poll_interval  integer,                            -- NULL = usa o global
    rtsp_template  text NOT NULL DEFAULT '',           -- ex.: /cam/realmonitor?channel={n}&subtype=1
    onvif          jsonb,                              -- último resultado da descoberta (sem credenciais)
    status         text NOT NULL DEFAULT 'NAO_VERIFICADO',
    status_since   timestamptz NOT NULL DEFAULT now(),
    status_detail  text NOT NULL DEFAULT '',
    last_check     timestamptz,
    last_seen      timestamptz,
    latency_ms     integer,
    fail_count     integer NOT NULL DEFAULT 0,
    legacy_id      integer,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS devices_serial_uq ON devices (upper(serial));
CREATE INDEX IF NOT EXISTS devices_store_idx ON devices (store_id);

CREATE TABLE IF NOT EXISTS channels (
    id             serial PRIMARY KEY,
    device_id      integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    number         integer NOT NULL,
    name           text NOT NULL,
    enabled        boolean NOT NULL DEFAULT true,
    profile_token  text NOT NULL DEFAULT '',
    rtsp_path      text NOT NULL DEFAULT '',           -- caminho+query, sem host nem credenciais
    status         text NOT NULL DEFAULT 'NAO_VERIFICADO',
    status_since   timestamptz NOT NULL DEFAULT now(),
    status_detail  text NOT NULL DEFAULT '',
    last_check     timestamptz,
    last_frame     timestamptz,
    resolution     text NOT NULL DEFAULT '',
    fps            real,
    codec          text NOT NULL DEFAULT '',
    frame_hash     text NOT NULL DEFAULT '',
    legacy_id      integer,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (device_id, number)
);

-- Histórico: sem FK para não perder eventos quando algo é excluído; guarda nomes no momento do evento.
CREATE TABLE IF NOT EXISTS events (
    id             bigserial PRIMARY KEY,
    ts             timestamptz NOT NULL DEFAULT now(),
    store_id       integer,
    device_id      integer,
    channel_id     integer,
    store_name     text NOT NULL DEFAULT '',
    serial         text NOT NULL DEFAULT '',
    channel_number integer,
    type           text NOT NULL,
    description    text NOT NULL DEFAULT '',
    duration_s     integer,
    recovered_at   timestamptz,
    open           boolean NOT NULL DEFAULT false,
    slack          boolean NOT NULL DEFAULT false,
    incident_id    bigint
);
CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts DESC);
CREATE INDEX IF NOT EXISTS events_dev_idx ON events (device_id, ts DESC);
CREATE INDEX IF NOT EXISTS events_ch_idx ON events (channel_id, ts DESC);

-- Incidentes: uma falha aberta por alvo e tipo (evita alertas repetidos).
CREATE TABLE IF NOT EXISTS incidents (
    id                  bigserial PRIMARY KEY,
    kind                text NOT NULL,               -- dvr | canal
    device_id           integer NOT NULL,
    channel_id          integer,
    type                text NOT NULL,               -- DVR_OFFLINE, AUTH_FALHA, DVR_INSTAVEL, CANAL_SEM_VIDEO
    started_at          timestamptz NOT NULL DEFAULT now(),
    ended_at            timestamptz,
    last_notified_at    timestamptz,
    prolonged_notified  boolean NOT NULL DEFAULT false,
    open_event_id       bigint
);
CREATE UNIQUE INDEX IF NOT EXISTS incidents_open_uq
    ON incidents (device_id, coalesce(channel_id, 0), type) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS incidents_time_idx ON incidents (started_at, ended_at);

-- Amostras de disponibilidade (uma por verificação), base dos relatórios.
CREATE TABLE IF NOT EXISTS availability (
    id          bigserial PRIMARY KEY,
    ts          timestamptz NOT NULL DEFAULT now(),
    device_id   integer NOT NULL,
    channel_id  integer,
    status      text NOT NULL,
    latency_ms  integer
);
CREATE INDEX IF NOT EXISTS availability_dev_idx ON availability (device_id, ts);
CREATE INDEX IF NOT EXISTS availability_ch_idx ON availability (channel_id, ts) WHERE channel_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS settings (
    key    text PRIMARY KEY,
    value  jsonb NOT NULL
);
