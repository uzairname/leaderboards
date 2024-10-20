import { Router } from 'itty-router'
import { App } from '../app-context/app-context'
import { getAppRoleConnectionsMetadata } from '../bot/modules/linked_roles'
import { syncDiscordCommands } from '../bot/view_manager/manage_views'

export const initRouter = (app: App) =>
  Router({ base: '/update' })
    .post('/', async () => {
      await Promise.all([
        syncDiscordCommands(app),
        app.config.features.IsDev && syncDiscordCommands(app, app.config.DevGuildId),
        app.bot.updateRoleConnectionsMetadata(getAppRoleConnectionsMetadata(app)),
        app.db.settings.getOrUpdate({ last_deployed: new Date() }),
      ])
      return new Response('Successfully updated Leaderboards app', { status: 200 })
    })
    .post('/guilds/:guild_id', async request => {
      if (!request.params.guild_id) {
        throw new Error('Guild ID not provided')
      }
      await syncDiscordCommands(app, request.params.guild_id)
      const guild = await app.db.guilds.get(request.params.guild_id)
      return new Response(`Updated leaderborads app in guild ${guild?.data.name}`, { status: 200 })
    })
    .all('*', () => new Response('Init endpoint not found', { status: 404 }))