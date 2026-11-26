import os

from cryptography.fernet import Fernet

os.environ.setdefault("DATABASE_URL", "postgresql://cftv:cftv@127.0.0.1:55432/potencial_cftv")
os.environ["DB_SCHEMA"] = "monitor_test"
os.environ["CFTV_SECRET_KEY"] = Fernet.generate_key().decode()
os.environ["API_ADMIN_TOKEN"] = "admin-token-de-teste"
os.environ["API_READ_TOKEN"] = "read-token-de-teste"
os.environ["MONITOR_ENABLED"] = "false"
os.environ["SLACK_WEBHOOK_URL"] = "https://hooks.slack.invalid/teste"
import tempfile
os.environ["SNAPSHOT_DIR"] = tempfile.mkdtemp(prefix="cftv-snap-")
os.environ["PANEL_DIR"] = os.path.join(os.path.dirname(__file__), "..", "..", "painel")
