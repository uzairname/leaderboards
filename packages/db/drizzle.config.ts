import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: 'drizzle-migrations',
  dialect: 'postgresql',
  schema: 'src/schema.ts',
})
