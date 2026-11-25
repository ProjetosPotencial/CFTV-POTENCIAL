# Potencial CFTV · monitoramento (FastAPI + FFmpeg)
# Build a partir da RAIZ do repositório (inclui o painel):
#   docker compose -f servidor/compose.monitor.yml build
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TZ=America/Sao_Paulo
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg tzdata \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY servidor/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY servidor/app ./app
COPY painel ./painel

RUN useradd --system --uid 10001 cftv && chown -R cftv /app
USER cftv

EXPOSE 8096
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8096/api/health', timeout=4)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8096", "--no-server-header"]
