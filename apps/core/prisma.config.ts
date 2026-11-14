import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 configuration file.
 * The datasource URL is declared here instead of schema.prisma.
 * DATABASE_URL format: postgresql://core_user:<password>@<host>:7001/papert?schema=core
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
