import { defineConfig } from 'drizzle-kit'
import * as dotenv from 'dotenv'

export default defineConfig({
  out: 'scripts/drizzle-migrations',
  dialect: 'postgresql',
  schema: 'src/database/schema.ts',
})
