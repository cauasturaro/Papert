import importlib.util
import unittest
from pathlib import Path
from unittest.mock import Mock, call

spec = importlib.util.spec_from_file_location(
    "redrive", Path(__file__).resolve().parents[1] / "ingestion/redrive.py"
)
redrive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(redrive)


class RedriveTests(unittest.TestCase):
    def test_preserves_body_and_sends_before_deleting(self):
        body = '\t{"Records": []}\n\n'
        client = Mock()
        client.receive_message.side_effect = [
            {"Messages": [{"Body": body, "ReceiptHandle": "receipt"}]},
            {},
        ]

        count = redrive.redrive(client, "queue", "dlq")

        self.assertEqual(count, 1)
        self.assertEqual(
            client.mock_calls[1:3],
            [
                call.send_message(QueueUrl="queue", MessageBody=body),
                call.delete_message(QueueUrl="dlq", ReceiptHandle="receipt"),
            ],
        )

    def test_failed_send_does_not_delete(self):
        client = Mock()
        client.receive_message.return_value = {
            "Messages": [{"Body": "body", "ReceiptHandle": "receipt"}]
        }
        client.send_message.side_effect = ConnectionError("unavailable")

        with self.assertRaises(ConnectionError):
            redrive.redrive(client, "queue", "dlq")

        client.delete_message.assert_not_called()
