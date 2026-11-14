"""Failures caused by the learner's file; they are reported, never retried."""


class IngestionFailure(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code
