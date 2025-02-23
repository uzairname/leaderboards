import * as D from 'discord-api-types/v10'
import {
  AnyContext,
  AnyInteractionContext,
  AnyStateContext,
  CommandContext,
  ComponentContext,
  DeferContext,
  InitialInteractionContext,
  StateContext,
} from '../types'

export function isInteractionCtx(ctx: AnyContext): ctx is AnyInteractionContext {
  return ctx.hasOwnProperty('interaction')
}

export function isDeferredCtx(ctx: AnyStateContext): ctx is DeferContext<any> {
  return isInteractionCtx(ctx) && !ctx.hasOwnProperty('defer')
}

export function isInitialInteractionCtx(ctx: AnyContext): ctx is InitialInteractionContext<any> {
  return isInteractionCtx(ctx) && ctx.hasOwnProperty('defer')
}

export function isComponentCtx(ctx: AnyStateContext): ctx is ComponentContext<any> {
  return (
    isInitialInteractionCtx(ctx) &&
    (ctx.interaction.type === D.InteractionType.MessageComponent ||
      ctx.interaction.type === D.InteractionType.ModalSubmit)
  )
}

export function isCommandCtx(ctx: StateContext<any>): ctx is CommandContext<any> {
  return isInitialInteractionCtx(ctx) && ctx.interaction.type === D.InteractionType.ApplicationCommand
}
