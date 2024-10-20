import { Config } from 'drizzle-kit'
import * as dotenv from 'dotenv'

dotenv.config()

export default {
  schema: 'src/main/database/schema.ts',
  out: 'migrations/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env['POSTGRES_URL'] + '?sslmode=require',
  },
} satisfies Config
