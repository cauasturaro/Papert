"""Read bounded source versions and write viewer renditions to S3."""

import json
import os

import boto3

from src.domain.errors import IngestionFailure

MAX_SOURCE_BYTES = 15 * 1024 * 1024


class S3Objects:
    def __init__(self, client=None):
        self.client = client or boto3.client(
            "s3",
            endpoint_url=os.environ.get("AWS_ENDPOINT_URL") or None,
            region_name=os.environ.get("AWS_REGION", "us-east-1"),
        )

    def read(self, bucket, key, version_id):
        response = self.client.get_object(Bucket=bucket, Key=key, VersionId=version_id)

        if response["ContentLength"] > MAX_SOURCE_BYTES:
            response["Body"].close()
            raise IngestionFailure("too_large")

        return response["Body"].read(MAX_SOURCE_BYTES + 1)


class S3Renditions:
    def __init__(self, client=None):
        self.client = client or boto3.client(
            "s3",
            endpoint_url=os.environ.get("AWS_ENDPOINT_URL") or None,
            region_name=os.environ.get("AWS_REGION", "us-east-1"),
        )

    def write(self, bucket: str, key: str, body: dict) -> None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")

        self.client.put_object(Bucket=bucket, Key=key, Body=data, ContentType="application/json")
