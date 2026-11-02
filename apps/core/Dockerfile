FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --legacy-peer-deps

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client and compile the API without a DB connection
RUN npm run build
EXPOSE 3001
# Apply migrations, then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
