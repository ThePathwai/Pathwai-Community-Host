# Pathwai backend — FastAPI + Motor(MongoDB). Works as-is on Railway, Render, or Fly.
FROM python:3.11-slim

WORKDIR /app

# gcc is needed to build a couple of native wheels (bcrypt/cryptography) on some platforms.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway/Render/Fly all inject PORT at runtime; 8001 matches the local dev default.
ENV PORT=8001
EXPOSE 8001

CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
