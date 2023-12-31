import { RequestArgs } from '../utils/request'
import { Sentry } from './sentry'

export let sentry: Sentry
export function initSentry(ctx: RequestArgs) {
  sentry = new Sentry(ctx)
  return sentry
}
