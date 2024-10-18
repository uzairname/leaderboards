import { Router } from 'itty-router'
import { viewIsAppCommand, overwriteDiscordCommandsWithViews } from '../discord-framework'
import { AppError } from './errors'
import { getAppRoleConnectionsMetadata } from './modules/linked_roles'
import { syncDiscordCommands } from './view_manager/manage_views'
import { App } from './app-context/app-context'

export const initRouter = (app: App) =>
  Router({ base: '/init' })
    .post('/', async () => {
      await Promise.all([
        syncDiscordCommands(app, undefined),
        app.config.features.DevGuildCommands && syncDiscordCommands(app, app.config.DevGuildId),
        app.bot.updateRoleConnectionsMetadata(getAppRoleConnectionsMetadata(app)),
        app.db.settings.getOrUpdate({ last_deployed: new Date() }),
      ])
      return new Response('Successfully deployed Leaderboards app', { status: 200 })
    })
    .post('/guilds/:guild_id', async request => {
      if (!request.params.guild_id) {
        throw new AppError('Guild ID not provided')
      }
      await syncDiscordCommands(app, request.params.guild_id)
      const guild = await app.db.guilds.get(request.params.guild_id)
      return new Response(`Deployed leaderborads app in guild ${guild?.data.name}`, { status: 200 })
    })
    .all('*', () => new Response('Init endpoint not found', { status: 404 }))
