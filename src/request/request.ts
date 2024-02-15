export type RequestArgs = Readonly<{
  request: Request
  env: Env
  execution_context: ExecutionContext
}>

export const authorize = (env: Env) => (request: Request) => {
  if (request.headers.get('Authorization') !== env.APP_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }
}
