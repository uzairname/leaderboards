import { AnyContext, AnyInteractionContext, AnyStateContext, DeferredComponentContext } from '../types'

export function isInteractionCtx(ctx: AnyContext): ctx is AnyInteractionContext {
  return ctx.hasOwnProperty('interaction')
}

export function isDeferredCtx(ctx: AnyStateContext): ctx is DeferredComponentContext<any> {
  return isInteractionCtx(ctx) && !ctx.hasOwnProperty('defer')
}
