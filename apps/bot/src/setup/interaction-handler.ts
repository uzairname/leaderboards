import { InteractionHandler } from '@repo/discord'
import * as views from './all-interaction-handlers'
import { App } from './app'

export const initInteractionHandler = () => new InteractionHandler<App>(Object.values(views))
