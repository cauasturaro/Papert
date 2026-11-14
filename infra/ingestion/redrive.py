import argparse

import boto3


def redrive(client, queue_url: str, dlq_url: str) -> int:
    count = 0

    while True:
        response = client.receive_message(
            QueueUrl=dlq_url, MaxNumberOfMessages=1, WaitTimeSeconds=2
        )
        messages = response.get("Messages", [])
        if not messages:
            return count

        for message in messages:
            client.send_message(QueueUrl=queue_url, MessageBody=message["Body"])
            client.delete_message(
                QueueUrl=dlq_url, ReceiptHandle=message["ReceiptHandle"]
            )
            count += 1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint-url", default="http://localhost:4566")
    parser.add_argument(
        "--queue-url", default="http://floci:4566/000000000000/papert-ingestion"
    )
    parser.add_argument(
        "--dlq-url", default="http://floci:4566/000000000000/papert-ingestion-dlq"
    )
    args = parser.parse_args()
    client = boto3.client(
        "sqs", endpoint_url=args.endpoint_url, region_name="us-east-1"
    )

    count = redrive(client, args.queue_url, args.dlq_url)
    print(f"Redrove {count} message(s).")


if __name__ == "__main__":
    main()
