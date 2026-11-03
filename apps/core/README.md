# Core

Papert's main API, built with NestJS, Prisma and PostgreSQL.

- Authenticates users and checks access to their workspaces.
- Stores study sessions, saved files and attempts.
- Queues tutor jobs, enforces token limits and delivers execution results.
- Checks syntax before analysis and alone approves attempts and unlocks the next step.

The local execution runner also lives here. Its Docker container connects the queues to the Seymour worker.

See the [project README](../../README.md) for setup and startup commands.
