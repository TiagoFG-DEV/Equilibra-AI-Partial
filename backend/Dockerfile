FROM node:22-alpine
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

ENV NODE_ENV=production
ENV SURVEY_ROOT=/app/skills
ENV SURVEY_OUTPUT_DIR=/var/data/survey
ENV WHATSAPP_PAIRING_ENABLED=false
EXPOSE 4000

WORKDIR /app/backend
CMD ["node", "dist/index.js"]
