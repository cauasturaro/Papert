FROM node:22-bookworm-slim AS core
WORKDIR /workspace/apps/core
COPY apps/core/package.json apps/core/package-lock.json apps/core/prisma.config.ts ./
COPY apps/core/prisma ./prisma
RUN npm ci --legacy-peer-deps
COPY apps/core ./
RUN npm run build

FROM python:3.12-slim-bookworm
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 gcc libpq-dev && rm -rf /var/lib/apt/lists/*
COPY apps/seymour/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=core /usr/local/bin/node /usr/local/bin/node
COPY --from=core /workspace/apps/core ./apps/core
COPY apps/seymour/src ./apps/seymour/src
ENV NODE_ENV=development
ENV SEYMOUR_PYTHON=/usr/local/bin/python
CMD ["node", "apps/core/dist/executions/infrastructure/local.js"]
