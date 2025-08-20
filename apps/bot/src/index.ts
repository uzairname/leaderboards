import * as sentry from '@sentry/cloudflare'
import { Env } from './Env'
import { Logger } from './logging/logger'
import router from './routers/base'
import { initApp } from './setup/app'

export default sentry.withSentry(
  (env: Env) => {
    return {
      dsn: env.SENTRY_DSN,
      release: env.CF_VERSION_METADATA?.id,
      sendDefaultPii: true,
      environment: env.ENVIRONMENT,
    }
  },
  {
    async fetch(request: Request, env: Env, executionContext: ExecutionContext): Promise<Response> {
      const logger = new Logger(request, executionContext, true)
      const app = initApp(env, logger)
      return logger.withLogging(router(app).fetch)
    },
  },
)
