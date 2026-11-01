# Core API

This directory contains the NestJS Core API scaffold. It currently exposes the generated root endpoint and uses port `3001` by default.

## Observability

NestJS Observe is not configured. The architecture specifies a self-hosted Langfuse deployment with its SDK integrated into Seymour; that integration is not implemented yet.

Do not assume production telemetry exists or enable an external telemetry service without an explicit request.
