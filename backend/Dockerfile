FROM node:20-alpine
WORKDIR /app

COPY package.json ./
COPY packages/core/package.json ./packages/core/
COPY backend/package.json ./backend/

RUN npm install

COPY packages/core ./packages/core
COPY backend ./backend
COPY skills ./skills

RUN npm run build -w @model/core

WORKDIR /app/backend
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 4000

WORKDIR /app/backend
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
