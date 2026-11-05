"""Synchronous psycopg access to the Seymour schema, shared by pgvector adapters."""

import os

import psycopg


def connect():
    url = os.environ["SEYMOUR_DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://", 1)

    return psycopg.connect(url, connect_timeout=5)


def vector_literal(values):
    return "[" + ",".join(repr(float(value)) for value in values) + "]"
