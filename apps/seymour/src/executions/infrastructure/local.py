"""Adapter for the loopback development runner; production uses worker_handler."""

import json
import os
import sys
from urllib.parse import urlparse

import boto3
import httpx

from src.executions.infrastructure.composition import run_job


def main():
    endpoint = os.environ["AWS_ENDPOINT_URL"]
    control_url = os.environ["LOCAL_CONTROL_URL"]
    results_url = os.environ["RESULTS_QUEUE_URL"]
    if any(
        urlparse(url).hostname not in {"127.0.0.1", "localhost"}
        for url in [endpoint, control_url, results_url]
    ):
        raise ValueError("Local execution transport requires loopback endpoints")

    queue = boto3.client("sqs", endpoint_url=endpoint, region_name=os.environ["AWS_REGION"])

    with httpx.Client(timeout=10) as client:

        def control(payload):
            response = client.post(
                control_url,
                json=payload,
                headers={"Authorization": f"Bearer {os.environ['LOCAL_CONTROL_SECRET']}"},
            )
            response.raise_for_status()

            return response.json()

        def publish(payload):
            queue.send_message(QueueUrl=results_url, MessageBody=json.dumps(payload))

        run_job(json.load(sys.stdin), control, publish)


if __name__ == "__main__":
    main()
