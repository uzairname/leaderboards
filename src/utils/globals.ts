import { Config } from '../config/config'
import { RequestArgs } from './request'
import { Sentry } from './sentry'

export let sentry: Sentry
export function initSentry(ctx: RequestArgs) {
  console.log('b')
  console.log(ctx.env)
  sentry = new Sentry(ctx)
  console.log('e')
  return sentry
}
