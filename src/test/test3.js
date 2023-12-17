import { runTests } from './test'

export default {
  async fetch(request, env, ctx) {
    console.log('test3')
    await runTests()
    return new Response('Hello World', { status: 200 })
  }
}
