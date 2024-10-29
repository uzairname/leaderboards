import { sentry } from '../../../../logging/sentry'
import { AppEvents } from '../../../app/AppEvents'

export default function (events: AppEvents) {
  events.GuildRankingsModified.on(async (app, guild) => {
    sentry.debug(
      `GuildRankingsModified event received for guild ${guild.data.id}. Syncing discord commands`,
    )
    await app.syncDiscordCommands(guild)
  })
}