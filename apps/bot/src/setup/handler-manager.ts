import { ViewManager } from '@repo/discord'
import { App } from './app'
import * as views from './all-interaction-handlers'

export const getViewManager = () => new ViewManager<App>(Object.values(views))
