import { Env } from '../Env'
import { Logger } from './Logger'

export let sentry: Logger

export function initSentry(request: Request, env: Env, execution_context: ExecutionContext) {
  sentry = new Logger(request, env, execution_context)
  return sentry
}

