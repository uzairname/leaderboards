import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../discord-framework'
import { AppView, GuildCommand } from '../../../../../app/ViewModule'
import { guildRankingsOption, withSelectedRanking } from '../../../../ui-helpers/ranking-command-option'
import { rescoreMatches } from '../../../matches/management/score-matches'
import { sentry } from '../../../../../../logging/sentry'

export const dev_cmd_signature = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'dev',
  description: 'Test command',
})

const subcommand_names = {
  clear_cache: 'clear-cache',
  rescore: 'rescore',
  lb: 'lb',
}
const ranking_option_name = 'ranking'

export default new GuildCommand(dev_cmd_signature,
  async (app, guild) => {
    return new AppCommand({
      ...dev_cmd_signature.config,
      options: [
        {
          type: D.ApplicationCommandOptionType.Subcommand,
          name: subcommand_names.clear_cache,
          description: 'Clear cache',
        },
        {
          type: D.ApplicationCommandOptionType.Subcommand,
          name: subcommand_names.rescore,
          description: 'Rescore all matches',
          options: await guildRankingsOption(app, guild, ranking_option_name),
        },
        {
          type: D.ApplicationCommandOptionType.Subcommand,
          name: subcommand_names.lb,
          description: 'Show full leaderboard',
          options: await guildRankingsOption(app, guild, ranking_option_name),
        }
      ],
    })
  },
  app =>
  dev_cmd_signature.onCommand(async ctx => {
      const subcommand_options = ctx.interaction.data
        .options as D.APIApplicationCommandInteractionDataSubcommandOption[]
  
      const subcommand_option_name = subcommand_options[0].name
  
      switch (subcommand_option_name) {
        case subcommand_names.clear_cache:
          app.db.cache.clear()
          return {
            type: D.InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: `cleared cache`,
            },
          }
        case subcommand_names.rescore:
          return await withSelectedRanking(app, ctx, ranking_option_name, {subcommand: subcommand_names.rescore}, async ranking => {
            
            return ctx.defer({
              type: D.InteractionResponseType.DeferredChannelMessageWithSource,
              data: {flags: D.MessageFlags.Ephemeral}
            }, async ctx => {
              await rescoreMatches(app, ranking, {reset_rating_to_initial: true})
              return ctx.edit({
                content: `rescored ${(await ranking.fetch()).data.name}`
              })
            })
          })
      }
  
      throw new Error('Unknown subcommand')
    }
  ),
)
