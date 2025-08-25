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
      beforeBreadcrumb: breadcrumb => {
        if (breadcrumb.category === 'console') {
          return null // Ignore console logs in Sentry
        }
        return breadcrumb
      },
    }
  },
  {
    async fetch(request: Request, env: Env, executionContext: ExecutionContext): Promise<Response> {
      const logger = new Logger(executionContext.waitUntil, true)
      const app = initApp(env, logger)
      return logger.run(request, router(app).fetch)
    },
  },
)
