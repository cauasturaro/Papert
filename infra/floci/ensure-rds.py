"""Provision only the local development database; preserve an existing instance."""

import os

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


def main():
    rds = boto3.client(
        "rds",
        endpoint_url="http://localhost:4566",
        region_name="us-east-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",
        config=Config(read_timeout=180, retries={"total_max_attempts": 1}),
    )
    try:
        instance = rds.describe_db_instances(DBInstanceIdentifier="papert-local")[
            "DBInstances"
        ][0]
    except ClientError as error:
        if error.response["Error"]["Code"] != "DBInstanceNotFound":
            raise
        instance = rds.create_db_instance(
            DBInstanceIdentifier="papert-local",
            DBInstanceClass="db.t3.micro",
            Engine="postgres",
            DBName="papert",
            MasterUsername="papert_admin",
            MasterUserPassword=os.environ["POSTGRES_PASSWORD"],
            AllocatedStorage=20,
            Port=7001,
        )["DBInstance"]

    if instance.get("DBInstanceStatus") != "available":
        raise RuntimeError("Local RDS is not available yet; check make logs.")
    if instance.get("Endpoint", {}).get("Port") != 7001:
        raise RuntimeError(
            "Existing RDS uses a different port; preserve its data and review the endpoint."
        )
    print("Local RDS is available: floci:7001 / papert")


if __name__ == "__main__":
    main()
