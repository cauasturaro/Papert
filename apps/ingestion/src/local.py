"""Adapter for the loopback development runner; production uses src.handler."""

import json
import os
import sys
from urllib.parse import urlparse

import httpx

from src.infrastructure.composition import build_ports
from src.infrastructure.events import process_batch
from src.infrastructure.store import connect


def main():
    control_url = os.environ["LOCAL_CONTROL_URL"]
    endpoint = os.environ["AWS_ENDPOINT_URL"]

    if any(
        urlparse(url).hostname not in {"127.0.0.1", "localhost"} for url in [control_url, endpoint]
    ):
        raise ValueError("Local ingestion requires loopback endpoints")

    event = json.load(sys.stdin)

    with httpx.Client(timeout=10) as client, connect() as connection:

        def control(payload):
            response = client.post(
                control_url,
                json=payload,
                headers={"Authorization": f"Bearer {os.environ['LOCAL_CONTROL_SECRET']}"},
            )
            response.raise_for_status()

            return response.json()

        result = process_batch(build_ports(control, connection), event)

    # A non-zero exit leaves the message on the queue for another delivery.
    if result["batchItemFailures"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
