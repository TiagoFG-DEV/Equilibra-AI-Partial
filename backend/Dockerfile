FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY backend/package.json ./backend/

RUN npm ci

COPY packages/core ./packages/core
COPY backend ./backend
COPY skills ./skills

RUN npm run build -w @model/core

WORKDIR /app/backend
RUN npx prisma generate && npm run build

# Sandbox: o app bloqueia produção até a implementação dos controles documentados.
ENV NODE_ENV=development
ENV SURVEY_ROOT=/app/skills
EXPOSE 4000

WORKDIR /app/backend
CMD ["node", "dist/index.js"]
