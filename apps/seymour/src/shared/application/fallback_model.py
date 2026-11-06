"""A model that tries providers in order, with bounded retries and one sticky route per execution."""

from collections.abc import Callable
from dataclasses import dataclass, field

from src.shared.domain.fallback import call_deadline, next_step
from src.shared.domain.inference import Message, Model, ModelUnavailable


@dataclass
class Route:
    """Shared by every model of one execution: after a switch, later calls stay on the fallback,
    so one answer never mixes provider state and a failing provider is not tried again."""

    active: int = 0
    events: list[dict] = field(default_factory=list)


@dataclass(frozen=True)
class Provider:
    name: str
    model: Model


class FallbackModel:
    def __init__(
        self,
        providers: list[Provider],
        route: Route,
        clock: Callable[[], float],
        sleep: Callable[[float], None],
        observe: Callable[[dict], None] = lambda _event: None,
    ):
        if not providers:
            raise ValueError("At least one provider is required")

        self.providers = providers
        self.route = route
        self.clock = clock
        self.sleep = sleep
        self.observe = observe

    def complete(self, messages, tools, effort, remaining, deadline, active) -> Message:
        retries = 0
        # Tokens that failed calls may have consumed; the learner's budget pays for them.
        lost = 0

        while True:
            index = self.route.active
            provider = self.providers[index]
            has_next = index + 1 < len(self.providers)
            limit = call_deadline(self.clock(), deadline, has_next)

            try:
                response = provider.model.complete(
                    messages, tools, effort, remaining - lost, limit, active
                )
            except ModelUnavailable as failure:
                lost += failure.charged

                step = next_step(
                    failure.reason,
                    failure.retry_after,
                    retries,
                    has_next,
                    deadline - self.clock(),
                )
                self._record(provider.name, failure.reason, step.action)

                if step.action == "fail":
                    raise ModelUnavailable(failure.reason, charged=lost) from None

                if step.action == "retry":
                    retries += 1
                    self.sleep(step.wait)
                    continue

                retries = 0
                self.route.active = index + 1
                continue

            return _charged(response, lost)

    def _record(self, provider: str, reason: str, action: str) -> None:
        event = {"provider": provider, "reason": reason, "action": action}

        self.route.events.append(event)
        self.observe(event)


def _charged(response: Message, lost: int) -> Message:
    """Adds the conservative charge of failed calls to the answer's reported usage."""
    if lost == 0 or response.usage is None:
        return response

    usage = response.usage
    response.usage = {
        "input_tokens": usage["input_tokens"] + lost,
        "output_tokens": usage["output_tokens"],
        "total_tokens": usage["total_tokens"] + lost,
    }

    return response
