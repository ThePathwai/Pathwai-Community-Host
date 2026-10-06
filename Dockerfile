# Pathwai -- ONE service that serves both the API and the web app.
#
#   * Stage 1 builds the React app (same-origin: it calls /api on whatever domain it is served from,
#     so there is no REACT_APP_BACKEND_URL to set and no CORS to configure).
#   * Stage 2 is the FastAPI server, which also serves that build (see "single-service deploy" in
#     backend/server.py).
#
# Why one service: login cookies stay first-party (Safari/iPhone block cross-site cookies, which a
# separate frontend/backend on two *.up.railway.app domains would hit), Stripe/Twilio webhooks and
# uploads share the same domain, and there is a single thing to deploy. The separate
# backend/Dockerfile and frontend/Dockerfile still work if you really want two services (see DEPLOY.md).
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY frontend/ .
# REACT_APP_* values are baked into the JS at BUILD time. On Railway add REACT_APP_AI_CHAT_ENABLED as a
# service variable and it is passed through as a build arg automatically.
ARG REACT_APP_AI_CHAT_ENABLED=false
# Shown on the public Terms / Privacy pages (/terms, /privacy). Set both before launch.
ARG REACT_APP_LEGAL_EMAIL=""
ARG REACT_APP_LEGAL_ENTITY=""
ENV REACT_APP_BACKEND_URL="" \
    REACT_APP_AI_CHAT_ENABLED=$REACT_APP_AI_CHAT_ENABLED \
    REACT_APP_LEGAL_EMAIL=$REACT_APP_LEGAL_EMAIL \
    REACT_APP_LEGAL_ENTITY=$REACT_APP_LEGAL_ENTITY \
    CI=false \
    GENERATE_SOURCEMAP=false
RUN yarn build

FROM python:3.11-slim
WORKDIR /app
# gcc is needed to build a couple of native wheels (bcrypt/cryptography) on some platforms.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY --from=web /web/build ./static
# PORT is injected by Railway at runtime. --proxy-headers makes request.url/client IP reflect the
# real https scheme and client behind Railway's proxy (needed for Twilio signature checks and
# rate limiting).
ENV PORT=8001 \
    STATIC_DIR=/app/static
EXPOSE 8001
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
