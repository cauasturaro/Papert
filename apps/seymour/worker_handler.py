"""SQS Lambda entry point; composition and transport live in infrastructure."""

from src.executions.infrastructure.sqs import handler as handler
from src.shared.infrastructure.logs import configure_logging

configure_logging()
