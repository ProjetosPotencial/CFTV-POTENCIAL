// Configuração do painel.
// MODO "demo": usa dados de demonstração gravados no navegador (nada real é alterado).
// MODO "api": lê e grava na API FastAPI do Potencial CFTV (rotas /api/...).
// A URL e o token também podem ser trocados pela tela Configurações > Conexão,
// que tem prioridade sobre estes valores padrão.
window.PCFTV_CONFIG = {
  mode: "demo",            // "demo" | "api"
  apiBase: "",             // ex.: "https://cftv-api.seudominio.com.br" (sem barra no fim). Vazio = mesma origem.
  apiToken: "",            // nunca coloque o token aqui em produção; informe pela tela de Configurações.
  refreshSeconds: 30,      // atualização automática das telas
};
