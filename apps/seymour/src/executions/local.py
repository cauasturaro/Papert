"""Loopback execution runner entry point spawned by Core as `python -m src.executions.local`."""

from src.executions.infrastructure.local import main

if __name__ == "__main__":
    main()
