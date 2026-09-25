# Pathwai frontend — CRA/craco static build, served by `serve`.
#
# IMPORTANT: React env vars (REACT_APP_*) are baked into the JS bundle at BUILD time, not read at
# runtime. On Railway, set these as the service's "Build Variables" (not just runtime Variables) so
# they're present during `docker build`, or pass them as --build-arg if building elsewhere.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
ARG REACT_APP_BACKEND_URL
ARG REACT_APP_AI_CHAT_ENABLED=false
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
ENV REACT_APP_AI_CHAT_ENABLED=$REACT_APP_AI_CHAT_ENABLED
ENV CI=false
RUN yarn build

FROM node:20-alpine
WORKDIR /app
RUN yarn global add serve
COPY --from=build /app/build ./build
ENV PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "serve -s build -l ${PORT}"]
