"""Core execution-control client over an injected RPC transport."""

from src.executions.domain.execution import Claim


class RpcControl:
    def __init__(self, invoke):
        self.invoke = invoke

    def claim(self, execution_id: str) -> Claim:
        answer = self.invoke({"action": "claim", "executionId": execution_id})

        status = answer["status"]
        if status != "running":
            return Claim(status)

        return Claim(status, answer["lease"], answer["input"], answer["budget"])

    def active(self, execution_id: str, lease: str) -> bool:
        answer = self.invoke({"action": "active", "executionId": execution_id, "lease": lease})

        return answer["active"]

    def failed(self, execution_id: str, lease: str) -> None:
        self.invoke({"action": "failed", "executionId": execution_id, "lease": lease})

    def live_sources(self, execution_id: str, lease: str) -> list[str]:
        answer = self.invoke({"action": "sources", "executionId": execution_id, "lease": lease})

        return answer["sourceIds"]
