import { Env } from './env'
import { Config } from './config'
import { Sentry } from './sentry'

export let config: Config
export function initConfig(env: Env, ctx: ExecutionContext) {
  config = new Config(env, ctx)
}

export let sentry: Sentry
export function initSentry(request: Request, config: Config) {
  sentry = new Sentry(request, config)
}
