"""Run a leased community recommendation check."""

from collections.abc import Callable

from src.executions.application.resources import RecommendationResources
from src.executions.domain.execution import Result
from src.executions.domain.ports import Control, Publisher


def run_recommendation_job(
    execution_id,
    lease,
    context,
    budget,
    control: Control,
    publish: Publisher,
    resources: Callable[[], RecommendationResources],
):
    from src.recommendation.application.recommender import recommend
    from src.recommendation.domain.recommendation import RecommendationContext

    snapshot = RecommendationContext.model_validate(
        {key: context[key] for key in RecommendationContext.model_fields if key in context}
    )

    runtime = resources()

    def active():
        return control.active(execution_id, lease)

    publish(Result(execution_id, lease, 1, "running", "Checking the community catalog…", 0))

    with runtime.trace.execution(
        execution_id, snapshot.sessionId, "seymour-recommendation"
    ) as span:
        result = recommend(snapshot, budget, runtime.embedder, runtime.cache, active)

        # Ids and scores only; the goal and catalog text stay out of traces.
        span.record_metadata(
            {
                "candidates": len(snapshot.candidates),
                "cached": result["cached"],
                "embedded": result["embedded"],
                "tokens": result["tokens"],
                "matches": result["matches"],
                "reason": result["reason"],
            }
        )

        recommendation = None
        if result["reason"] is None:
            recommendation = {"matches": result["matches"]}

        publish(
            Result(
                execution_id,
                lease,
                100,
                "completed",
                "",
                result["tokens"],
                recommendation=recommendation,
            )
        )
