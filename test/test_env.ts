import { Env } from "../src/utils/request"

export default {
  ENVIRONMENT: 'test',
  BASE_URL: 'https://example.com',
  DISCORD_TOKEN: '',
  PUBLIC_KEY: '',
  APPLICATION_ID: '',
  CLIENT_SECRET: '',
  SENTRY_DSN: '',
  APP_KEY: '',
  POSTGRES_URL: "",
} satisfies Env
