import { IttyRouter } from 'itty-router/IttyRouter'
import { sentry } from '../logging/sentry'
import { getOrAddGuild } from '../services/guilds/manage-guilds'
import { getAppRoleConnectionsMetadata } from '../services/role-connections/role-connections'
import { App } from '../setup/app'

export default (app: App) =>
  IttyRouter({ base: '/update' })
    .post('/', async () => {
      await app.db.settings.getOrUpdate({
        last_updated: new Date(),
      })

      const [_, guild_names] = await Promise.all([
        app.syncDiscordCommands(),
        app.db.guilds.getAll().then(guilds =>
          Promise.all(
            guilds.map(guild =>
              app
                .syncDiscordCommands(guild)
                .then(() => guild.data.name)
                .catch(() => undefined),
            ),
          ).then(res => res.filter(c => undefined !== c)),
        ),
        app.discord.updateRoleConnectionsMetadata(getAppRoleConnectionsMetadata(app)),
      ])

      sentry.addBreadcrumb({
        message: `Updated Leaderboards app in ${guild_names.length} guilds`,
        data: { guild_names },
      })

      return new Response(`Updated Leaderboards app in ${guild_names.length} guilds`, {
        status: 200,
      })
    })

    .post('/guilds/:guild_id', async request => {
      if (!request.params.guild_id) {
        throw new Error('Guild ID not provided')
      }
      const guild = await getOrAddGuild(app, request.params.guild_id)
      await app.syncDiscordCommands(guild)
      return new Response(`Updated leaderborads app in guild ${guild?.data.name}`, { status: 200 })
    })
    .all('*', () => new Response('Init endpoint not found', { status: 404 }))
