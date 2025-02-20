import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: 'scripts/drizzle-migrations',
  dialect: 'postgresql',
  schema: 'src/database/schema.ts',
})
