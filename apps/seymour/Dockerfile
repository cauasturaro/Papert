FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df AS builder
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt
ENV TIKTOKEN_CACHE_DIR=/opt/tiktoken
RUN PYTHONPATH=/install/lib/python3.12/site-packages python -c "import tiktoken; tiktoken.encoding_for_model('text-embedding-3-small')"

FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df
WORKDIR /app
COPY --from=builder /install /usr/local
COPY --from=builder /opt/tiktoken /opt/tiktoken
ENV TIKTOKEN_CACHE_DIR=/opt/tiktoken
COPY . .
USER 10001:10001
EXPOSE 3002
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3002"]
