"""Provider-free execution tracing for application tests."""

from contextlib import contextmanager

import pytest


class NoopTracer:
    @contextmanager
    def execution(self, execution_id, session_id, name="seymour-tutor"):
        yield self

    def record_metadata(self, metadata):
        pass

    def tool(self, name, action):
        return action()


@pytest.fixture
def noop_trace():
    return NoopTracer()
