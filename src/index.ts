import { Env } from './utils/request'
import { initSentry } from './utils/globals'
import { router } from './app/router'
import { App } from './app/app'

export default {
  fetch: (request: Request, env: Env, execution_context: ExecutionContext) => {
    return initSentry({ request, env, execution_context }).wrapHandler(router(new App(env)).handle)
  }
}
