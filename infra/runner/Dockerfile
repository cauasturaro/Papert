# Local queue bridge only; cloud workers use per-service Lambda images.
FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS core
WORKDIR /workspace/apps/core
COPY apps/core/package.json apps/core/package-lock.json apps/core/prisma.config.ts ./
COPY apps/core/prisma ./prisma
RUN npm ci
COPY apps/core ./
RUN npm run build && npm prune --omit=dev

FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 gcc libpq-dev && rm -rf /var/lib/apt/lists/*
COPY apps/seymour/requirements*.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt
# Bake the embedding tokenizer into the image so token counting never downloads it at runtime.
ENV TIKTOKEN_CACHE_DIR=/opt/tiktoken
RUN python -c "import tiktoken; tiktoken.encoding_for_model('text-embedding-3-small')"
COPY apps/ingestion/requirements.txt ./apps/ingestion/requirements.txt
RUN pip install --no-cache-dir -r apps/ingestion/requirements.txt
COPY --from=core /usr/local/bin/node /usr/local/bin/node
COPY --from=core /workspace/apps/core ./apps/core
COPY apps/seymour/src ./apps/seymour/src
COPY apps/ingestion/src ./apps/ingestion/src
ENV INGESTION_PYTHON=/usr/local/bin/python
ENV NODE_ENV=development
ENV SEYMOUR_PYTHON=/usr/local/bin/python
USER 10001:10001
CMD ["node", "apps/core/dist/executions/infrastructure/local-worker.js"]
