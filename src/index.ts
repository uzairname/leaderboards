import { Env } from './config/env'
import { respond } from './app/router'

export default {
  fetch: (request: Request, env: Env, execution_context: ExecutionContext) =>
    respond({ request, env, execution_context }),
}
