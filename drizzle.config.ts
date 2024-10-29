import { defineConfig } from 'drizzle-kit'
import * as dotenv from 'dotenv'

dotenv.config({
  path: '.env'
})

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL is not set')
}

export default defineConfig({
  out: 'scripts/migrations',
  dialect: 'postgresql',
  schema: 'src/database/schema.ts',
  dbCredentials: {
    url: process.env.POSTGRES_URL + '?sslmode=require',
  },
})
