# Threat model

Scope: the learner-facing system (Web, Core, Seymour, Ingestion) as implemented in this
repository and run locally. Deployment definitions exist but have not been exercised in a
live AWS account.

## Assets

- Learner accounts and sessions.
- Learner code, notes and tutor conversations.
- Uploaded sources and their extracted passages.
- Study progress, streaks and achievements.

## Trust boundaries

| Boundary | Control |
| --- | --- |
| Browser → Web (Next.js) | Compose publishes an Nginx ingress that overwrites `X-Forwarded-For` from its socket peer; Next is not published directly. Web proxies an allowlist of `/api/*` routes and forwards a single address selected using `TRUSTED_PROXY_COUNT`. With zero trusted proxies or no edge secret, Web omits the address because route handlers expose no socket peer. |
| Web → Core | Web replaces incoming edge proof with its server-only `EDGE_PROXY_SECRET`. Core compares proof in constant time before trusting `TRUST_PROXY_HOPS` forwarded hops. Missing or invalid proof uses the socket peer, including API Gateway’s authoritative `requestContext.http.sourceIp` on Lambda. Core requires the secret at startup when trusting hops. Use TLS between tiers outside the local network; never expose the secret to browsers. |
| Core → PostgreSQL, S3, queues | Every query is filtered by the owning user; resources owned by someone else answer `not_found`. Core and Seymour use separate schemas and credentials, checked by `make check-isolation`. |
| Core ↔ Seymour, Ingestion | Internal control functions have no public HTTP route, and the HTTP `/internal` namespace is refused. |
| Core ↔ language model | Model output is untrusted data and is validated before Core acts on it ([ADR 0001](../adr/0001-core-owns-approval-and-progression.md)). |

## Authentication

Details and alternatives: [ADR 0003](../adr/0003-authentication-jwe-sessions.md).

- Passwords: Argon2id; at least 12 characters and at most 128 bytes, no composition rules.
  Unknown emails still run a dummy hash check, and sign-in returns one generic error.
- Access token: JWE (`dir` + `A256GCM`) with key rotation, valid for 15 minutes, checked
  against the stored session on every request.
- Refresh credential: a random 256-bit value stored as a hash and replaced on every use.
  Replay of a replaced value revokes the session. Sessions last at most 7 days.
- Cookies are `HttpOnly` and `SameSite=Strict`; every mutation also requires the exact Web
  `Origin` and a JSON content type.

## Abuse controls

- Per-client limit on sign-in and registration.
- Failure-only lockout per (account, client), plus a per-account backstop against
  distributed guessing.
- Per-client limit on registrations that hit an existing email.
- Structured security events with keyed email hashes, with log metric filters and alarms
  defined in the infrastructure templates.

## Known limitations

- **Step approval is AI-assessed.** For each criterion, the model judges whether the
  learner's work meets it. Core verifies that the result belongs to the right attempt and
  revision and covers exactly the step's criteria, then computes approval from those
  verdicts. The model reads learner code, so text inside that code can try to influence the
  verdict (prompt injection). The prompt treats learner content as untrusted data. Planned:
  deterministic pre-checks, an independent second judgment before approval, and sandboxed
  tests where a step can be tested.
- **Registration reveals whether an email is registered.** Probing is rate limited and
  logged; the response becomes uniform once email verification exists.
- **No account recovery yet.** There is no email verification, password reset, password
  change or session list.
- **No trusted ingress configured:** Web omits client addresses, so Core rate limits share
  the Web peer bucket. Keep the ingress hop count accurate and prevent direct access to
  Next when trusting forwarded addresses. A compromised edge secret permits forged
  forwarding; rotate it on both Web and Core together.
