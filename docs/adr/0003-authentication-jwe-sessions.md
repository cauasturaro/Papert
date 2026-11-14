# 3. Authentication: short-lived JWE cookies backed by a server-side session

- Status: Accepted. Implemented locally. Revised 2026-11-10 (refresh credential, abuse limits).
- Date: 2026-11-01

## Context

Papert needs learner accounts for a browser app. Requirements:

- no token readable by browser JavaScript;
- immediate revocation on logout;
- key rotation without logging everyone out;
- protection against CSRF and credential stuffing;
- internal service calls must never reuse learner credentials.

## Decision

- **Passwords:** Argon2id with OWASP baseline parameters (19 MiB memory, 2 passes, 1 lane)
  and generated salts. Login for an unknown email still verifies against a dummy hash and
  returns the same generic error, so timing and messages do not reveal which emails exist.
- **Tokens:** encrypted JWTs (JWE `dir` + `A256GCM`) with issuer, audience, `sub`, `sid`,
  `jti`, `iat` and `exp`, a strict algorithm allowlist and a 15-minute maximum age. Keys are
  a `kid`-indexed map. The active `kid` and all keys are server-only configuration, and the
  service refuses to start when they are missing or malformed.
- **Server-side session:** each token references a PostgreSQL session with an absolute
  7-day lifetime. Every request checks the session for revocation, expiry and the current
  token id. Logout revokes the session.
- **Renewal:** a separate refresh credential, a random 256-bit value stored only as a hash,
  renews the session. Every renewal replaces both the access token and the refresh value and
  never extends the absolute deadline. Presenting a replaced refresh value more than 30
  seconds after its rotation revokes the whole session (replay detection); inside that window
  a concurrent renewal from another tab simply fails. An access token alone cannot renew a
  session that has a refresh credential.
- **Transport:** the Web app proxies `/api/*` to Core on the same origin. The cookie is
  `HttpOnly`, `SameSite=Strict`, scoped to `/api`, and `Secure` on HTTPS; the refresh cookie
  is scoped to `/api/auth`. Tokens never
  appear in response bodies. Every mutation requires `application/json` and an exact
  `Origin` match.
- **Abuse limits:** PostgreSQL-backed, atomic limiters: a per-client request limit, a
  failure-only lockout per account and client, and a high per-account backstop. Each attempt
  is reserved before the password check and returned on success, so parallel guesses cannot
  overrun the limit and successful sign-ins never count. The client address is derived from
  a fixed number of trusted proxy hops (`TRUST_PROXY_HOPS`) only after constant-time
  verification of Web's server-only `EDGE_PROXY_SECRET` proof. Otherwise Core uses its
  socket peer (API Gateway's authoritative `requestContext.http.sourceIp` on Lambda).
  The secret is required at startup when Core trusts hops. Web strips incoming proof
  and supplies its own. Compose publishes only the sanitizing Nginx ingress for Web,
  which overwrites `X-Forwarded-For` from its socket peer; Next remains unpublished.
  `TRUSTED_PROXY_COUNT=1` selects that address. With zero trusted Web proxies or no
  edge secret, Web omits forwarding because route handlers expose no socket peer,
  and logs the configuration once when its proxy module starts. Use TLS between
  tiers in production and rotate the shared secret on both tiers together.
- **Security events:** failed sign-ins, rate limits, origin rejections, registration
  conflicts and refresh replay are written as structured log lines with keyed email hashes,
  never passwords, tokens or cookies.
- **Ownership:** resource queries filter by the authenticated user and answer `not_found`
  rather than `forbidden` for other users' resources.
- **Internal calls:** the HTTP `/internal` namespace is denied. Workers reach Core through
  control functions with no HTTP route. In AWS these use IAM, and locally a loopback bridge
  with a per-process secret compared in constant time.

## Alternatives considered

- **Signed JWT (JWS) in local storage.** Common, but readable by any injected script, and
  the claims are visible to the client.
- **Stateless JWT with refresh tokens.** Avoids a session lookup but makes revocation
  eventual. Papert keeps the session lookup and adds a refresh credential only to separate
  "prove who you are now" (15 minutes) from "keep the session alive" (rotating, replay-
  detected), so a stolen access token cannot extend itself.
- **Access token as its own renewal credential.** The first version did this. It meant a
  stolen access cookie could renew for 7 days and an idle laptop was signed out after 15
  minutes, so it was replaced.
- **Opaque session id only.** Equally secure and simpler. JWE was chosen so that the
  session id, token id and expiry travel authenticated and encrypted, and so that key
  rotation is exercised explicitly. The database lookup is kept regardless, so the
  encryption is defence in depth, not a replacement for server state.
- **Managed identity provider.** Reasonable for production, but it hides the parts this
  project wants to demonstrate and adds an external dependency to local runs.

## Consequences

- Every authenticated request costs one session lookup; acceptable at this scale.
- Rotation requires distributing the new key before switching the active `kid`, and keeping
  the old key for at least the token lifetime.
- Per-client limits are only as trustworthy as the hop count: Core must be reachable only
  through the Web tier, or a direct caller can forge `X-Forwarded-For`.
- Registration still reveals whether an email exists; probing is limited and logged until
  email verification makes the response uniform.
- Not implemented: MFA, password recovery, email confirmation, a session management page.
