FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client (no DB connection needed for generation)
RUN npx prisma generate
EXPOSE 3001
# Apply migrations, then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
