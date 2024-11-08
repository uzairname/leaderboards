import * as D from 'discord-api-types/v10'
import { CommandView, getOptions, getSubcommandOption } from '../../../../../discord-framework'
import { GuildCommand } from '../../../../app/ViewModule'
import { guildRankingsOption, withSelectedRanking } from '../../../ui-helpers/ranking-option'
import { rescoreMatches } from '../../matches/management/manage-matches'

export const dev_cmd_signature = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  name: 'dev',
  description: 'Test command',
})

const scnames = {
  clear_cache: 'clear-cache',
  rescore: 'rescore',
  lb: 'lb',
}

export default new GuildCommand(
  dev_cmd_signature,
  async (app, guild) => {
    return new CommandView({
      ...dev_cmd_signature.config,
      options: [
        {
          type: D.ApplicationCommandOptionType.Subcommand,
          name: scnames.clear_cache,
          description: 'Clear cache',
        },
        {
          type: D.ApplicationCommandOptionType.Subcommand,
          name: scnames.rescore,
          description: 'Rescore all matches',
          options: await guildRankingsOption(app, guild, 'ranking'),
        },
        {
          type: D.ApplicationCommandOptionType.Subcommand,
          name: scnames.lb,
          description: 'Show full leaderboard',
          options: await guildRankingsOption(app, guild, 'ranking'),
        },
      ],
    })
  },
  app =>
    dev_cmd_signature.onCommand(async ctx => {
      const sc_option = getSubcommandOption(ctx.interaction)

      switch (sc_option.name) {
        case scnames.clear_cache:
          app.db.cache.clear()
          return {
            type: D.InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: `cleared cache`,
            },
          }
        case scnames.rescore:
          return await withSelectedRanking(
            app,
            ctx,
            getOptions(ctx.interaction, {
              ranking: {
                type: D.ApplicationCommandOptionType.Integer,
              },
            }).ranking,
            {},
            async ranking => {
              return ctx.defer(
                {
                  type: D.InteractionResponseType.DeferredChannelMessageWithSource,
                  data: { flags: D.MessageFlags.Ephemeral },
                },
                async ctx => {
                  await rescoreMatches(app, ranking, { reset_rating_to_initial: true, ctx })
                },
              )
            },
          )
      }

      throw new Error('Unknown subcommand')
    }),
)
