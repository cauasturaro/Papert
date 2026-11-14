"""Stable prompt identity: a family of named templates and the hash of their content."""

import hashlib
from dataclasses import dataclass


@dataclass(frozen=True)
class PromptFamily:
    """Every template one model task may render; learner content is never part of it."""

    id: str
    templates: dict[str, str]

    @property
    def version(self) -> str:
        """Changes whenever any template text, name or the family membership changes."""
        digest = hashlib.sha256()

        for name in sorted(self.templates):
            digest.update(name.encode("utf-8"))
            digest.update(b"\0")
            digest.update(self.templates[name].encode("utf-8"))
            digest.update(b"\0")

        return f"sha:{digest.hexdigest()[:12]}"
