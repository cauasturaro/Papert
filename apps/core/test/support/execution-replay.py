"""Drive Seymour's real worker and RPC/event adapters against Core's database test."""

import json
import sys

from src.executions.application.contracts.transport import encode_result
from src.executions.application.worker import run_execution
from src.executions.domain.execution import Execution, Result
from src.executions.infrastructure.rpc_control import RpcControl


def rpc(payload):
    print(json.dumps(payload), flush=True)
    return json.loads(sys.stdin.readline())


def invoke(payload):
    answer = rpc(payload)
    if payload["action"] == "claim":
        # Discard a committed claim response, then retry with the actual producer's payload.
        assert rpc(payload) == answer

    return answer


class Results:
    def __init__(self):
        self.items = {}

    def stage(self, result):
        self.items[result.execution_id] = result

    def staged(self, execution_id):
        return self.items.get(execution_id)

    def clear(self, execution_id):
        self.items.pop(execution_id, None)


results = Results()
inferences = []
fail_send = True


def publish(result):
    global fail_send
    if result.is_final() and fail_send:
        fail_send = False
        raise RuntimeError("Final send failed")

    payload = {"action": "publish", "event": encode_result(result)}
    rpc(payload)
    rpc(payload)


def infer(execution_id, lease, context, budget, control, send):
    inferences.append(lease)
    assert budget == 8000
    send(Result(execution_id, lease, 1, "running", "Checking", 100))
    send(Result(execution_id, lease, 100, "completed", "Saved answer", 900))


def run():
    run_execution(
        Execution(sys.argv[1]),
        RpcControl(invoke),
        publish,
        infer,
        infer,
        infer,
        infer,
        results=results,
    )


try:
    run()
except RuntimeError as error:
    assert str(error) == "Final send failed"
else:
    raise AssertionError("Expected a failed final send")

rpc({"action": "redeliver"})
run()
assert len(inferences) == 1
assert results.items == {}
