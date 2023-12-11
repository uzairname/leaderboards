import { Env } from "../config/env"

export interface RequestArgs {
  request: Request
  env: Env
  execution_context: ExecutionContext
}

export const authorize = (req: RequestArgs) => (request: Request) => {
  if (request.headers.get('Authorization') !== req.env.APP_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }
}
