FROM python:3.12-slim
WORKDIR /app
# Install system deps for asyncpg compilation
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Bake the embedding tokenizer into the image so token counting never downloads it at runtime.
ENV TIKTOKEN_CACHE_DIR=/opt/tiktoken
RUN python -c "import tiktoken; tiktoken.encoding_for_model('text-embedding-3-small')"
COPY . .
EXPOSE 3002
# Apply migrations, then start uvicorn
CMD ["sh", "-c", "python -m alembic upgrade head && python -m uvicorn main:app --host 0.0.0.0 --port 3002"]
