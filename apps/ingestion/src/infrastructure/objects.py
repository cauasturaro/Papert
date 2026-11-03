"""Reads one exact object version, bounded by the accepted upload size."""

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
