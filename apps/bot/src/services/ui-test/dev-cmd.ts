import { CommandSignature, getOptions, getSubcommandOption } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../setup/app'
import { guildRankingsOption, withSelectedRanking } from '../../utils/view-helpers/ranking-option'
import { rescoreMatches } from '../matches/scoring/score_match'

export const dev_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'dev',
  description: 'Test command',
  experimental: true,
})

const scnames = {
  clear_cache: 'clear-cache',
  rescore: 'rescore',
  lb: 'lb',
}

export const dev_cmd = dev_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    return new CommandSignature({
      ...dev_cmd_sig.config,
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
          options: await guildRankingsOption(app, guild),
        },
        {
          type: D.ApplicationCommandOptionType.Subcommand,
          name: scnames.lb,
          description: 'Show full leaderboard',
          options: await guildRankingsOption(app, guild),
        },
      ],
    })
  },
  onCommand: async (ctx, app) => {
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
        return withSelectedRanking(
          {
            app,
            ctx,
            ranking_id: getOptions(ctx.interaction, {
              ranking: {
                type: D.ApplicationCommandOptionType.Integer,
              },
            }).ranking,
          },
          async ranking => {
            return ctx.defer(async ctx => {
              await rescoreMatches(app, ranking, { reset_rating_to_initial: true, ctx })
            })
          },
        )
    }

    throw new Error('Unknown subcommand')
  },
})
