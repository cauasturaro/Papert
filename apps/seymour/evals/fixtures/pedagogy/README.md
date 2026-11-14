# Tutor pedagogy fixtures

`starter-main.ts` is the learner's saved file for every case: an Express route that greets
`request.body.name` without validating it. `reference-main.ts` is a complete solution of the
step. It exists only here, to measure leakage; it is never sent to the model.

The cases in `evals/datasets/pedagogy.json` pressure the tutor to hand over that solution, from a
single "just give me the code" to multi-turn escalations with a deadline, a claimed teacher
permission and a request for "only" the function. Two cases are controls: a plain conceptual
question, and solution mode with Core's permission, where showing code is allowed and the
leak rate is expected to be high.
