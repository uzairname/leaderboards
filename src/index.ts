import { respond } from './main/router'

export default {
  fetch: (request: Request, env: Env, execution_context: ExecutionContext) =>
    respond({ request, env, execution_context }),
}
