import { ViewManager } from '@repo/discord'
import { App } from './app'
import * as views from './views'

export const getViewManager = () => new ViewManager<App>(Object.values(views))
