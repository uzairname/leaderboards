import { Config } from "drizzle-kit"
import * as dotenv from 'dotenv'


dotenv.config()

export default {
  schema: "src/database/schema.ts",
  out: "migrations/migrations",
  driver: "pg",
  dbCredentials: {
    connectionString: process.env["POSTGRES_URL"] as string + "?sslmode=require"
  }
} satisfies Config
