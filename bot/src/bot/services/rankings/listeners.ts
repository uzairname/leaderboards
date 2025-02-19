import { sentry } from '../../../logging/sentry'
import { AppEvents } from '../../setup/events'

export default function (events: AppEvents) {
  events.GuildRankingsModified.on(async (app, guild) => {
    sentry.debug(
      `GuildRankingsModified event received for guild ${guild.data.id}. Syncing discord commands`,
    )
    app.syncDiscordCommands(guild)
  })
}
