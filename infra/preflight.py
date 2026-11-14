"""Reject incomplete templates without rotating credentials for existing databases."""

import json
import re
from pathlib import Path


def validate(path: Path) -> None:
    values = {}
    for line in path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            key, value = line.split("=", 1)
            values[key] = value.strip().strip("\"'")

    for key in ("POSTGRES_PASSWORD", "CORE_DB_PASSWORD", "SEYMOUR_DB_PASSWORD"):
        if not re.fullmatch(r"[A-Za-z0-9_-]{16,}", values.get(key, "")):
            raise ValueError(
                f"{key} must contain at least 16 URL-safe characters. "
                "Restore the existing database credential in .env; for a new installation, "
                "remove the copied template and run make up."
            )

    if "AUTH_JWE_KEYS" in values:
        try:
            keys = json.loads(values["AUTH_JWE_KEYS"])
        except json.JSONDecodeError as error:
            raise ValueError(
                "AUTH_JWE_KEYS must be a JSON key map; restore existing keys or remove a blank template entry before make auth-env."
            ) from error

        if not isinstance(keys, dict) or values.get("AUTH_JWE_ACTIVE_KID") not in keys:
            raise ValueError("AUTH_JWE_ACTIVE_KID must select a key in AUTH_JWE_KEYS.")

        if not all(
            isinstance(value, str) and re.fullmatch(r"[0-9a-fA-F]{64}", value)
            for value in keys.values()
        ):
            raise ValueError(
                "Each AUTH_JWE_KEYS value must contain 64 hexadecimal characters."
            )


if __name__ == "__main__":
    validate(Path(".env"))
