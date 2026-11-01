FROM python:3.12-slim
WORKDIR /app
# Install system deps for asyncpg compilation
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 3002
# Apply migrations, then start uvicorn
CMD ["sh", "-c", "python -m alembic upgrade head && python -m uvicorn main:app --host 0.0.0.0 --port 3002"]
