import { Config } from 'drizzle-kit'
import * as dotenv from 'dotenv'

dotenv.config({
  path: '.env'
})

export default {
  schema: 'src/main/database/schema.ts',
  out: 'scripts/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env['POSTGRES_URL'] + '?sslmode=require',
  },
} satisfies Config
