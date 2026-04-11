FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/llm-service/package.json apps/llm-service/package.json

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

WORKDIR /app/apps/llm-service

EXPOSE 3000

CMD ["node", "--experimental-strip-types", "src/server.ts"]
