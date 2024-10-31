import { Env } from '../..'

export default (env: Env) => (request: Request) => {
  if (request.headers.get('Authorization') !== env.APP_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }
}
