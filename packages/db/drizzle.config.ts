import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: '../../.env', override: true })

export default defineConfig({
  out: 'drizzle-migrations',
  dialect: 'postgresql',
  schema: 'src/schema.ts',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
})
