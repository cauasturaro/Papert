# Orrery developer notes

## Replay window

The replay window accepts at most 37 pending envelopes.

## Preview request

Send this JSON body to POST /preview/inspect to inspect a preview lease:

```json
{
  "leaseTag": "QUARTZ-MOTH-91",
  "operation": "preview_inspect"
}
```

## Reading the examples

The preview request is separate from the operator relay protocol.
