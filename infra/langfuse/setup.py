"""Generate local integration secrets without replacing an existing installation."""

import os
import secrets
from pathlib import Path


def prepare(path: Path) -> None:
    existing = path.read_text() if path.exists() else ""
    keys = {line.split("=", 1)[0] for line in existing.splitlines() if "=" in line}
    defaults = {
        "LF_POSTGRES_PASSWORD": secrets.token_hex(32),
        "LF_CLICKHOUSE_PASSWORD": secrets.token_hex(32),
        "LF_REDIS_PASSWORD": secrets.token_hex(32),
        "LF_STORAGE_PASSWORD": secrets.token_hex(32),
        "LF_SALT": secrets.token_hex(32),
        "LF_ENCRYPTION_KEY": secrets.token_hex(32),
        "LF_AUTH_SECRET": secrets.token_hex(32),
        "LF_ADMIN_EMAIL": "admin@papert.local",
        "LF_ADMIN_PASSWORD": secrets.token_hex(24),
        "LANGFUSE_PUBLIC_KEY": f"pk-lf-{secrets.token_hex(16)}",
        "LANGFUSE_SECRET_KEY": f"sk-lf-{secrets.token_hex(32)}",
        "LANGFUSE_BASE_URL": "http://localhost:3003",
    }
    additions = [f"{key}={value}\n" for key, value in defaults.items() if key not in keys]

    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    with os.fdopen(descriptor, "a") as target:
        if existing and not existing.endswith("\n") and additions:
            target.write("\n")

        target.writelines(additions)

    path.chmod(0o600)


if __name__ == "__main__":
    prepare(Path(__file__).resolve().parents[2] / ".env.langfuse")
    print("Local Langfuse environment ready in .env.langfuse (existing values preserved).")
