import * as D from 'discord-api-types/v10'
import { AppCommand, field } from '../../../discord-framework'
import { nonNullable } from '../../../utils/utils'
import { App } from '../../app/app'
import { AppError } from '../../app/errors'
import { checkGuildInteraction } from '../../views/utils/checks'
import { guildRankingsOptionChoices, rankingsAutocomplete } from '../../views/utils/common'
import { allGuildRankingsPage } from '../rankings/rankings_commands/all_rankings'
import { rankings_cmd_def } from '../rankings/rankings_commands/rankings_cmd'
import { ViewModule, guildCommand } from '../view_manager/view_module'
import { leaderboardMessage } from './leaderboard_messages'

const optionnames = {
  ranking: 'ranking',
}

const leaderboard_cmd = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  custom_id_prefix: 'lb',
  name: 'leaderboard',
  description: 'All about this bot',

  state_schema: {
    page: field.Int(),
    ranking_id: field.Int(),
  },
})

const leaderboardCmdDef = async (app: App, guild_id?: string) =>
  guild_id
    ? new AppCommand({
        ...leaderboard_cmd.options,
        options: [
          {
            name: optionnames.ranking,
            type: D.ApplicationCommandOptionType.String,
            description: 'Select a ranking',
            choices: await guildRankingsOptionChoices(app, guild_id, false),
          },
        ],
      })
    : undefined

export const leaderboardCmd = (app: App) =>
  leaderboard_cmd

    .onAutocomplete(rankingsAutocomplete(app, false, optionnames.ranking))
    .onCommand(async ctx => {
      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredChannelMessageWithSource,
          data: { flags: D.MessageFlags.Ephemeral },
        },
        async ctx => {
          const interaction = checkGuildInteraction(ctx.interaction)

          const selected_ranking_id = (
            interaction.data.options?.find(o => o.name === optionnames.ranking) as
              | D.APIApplicationCommandInteractionDataStringOption
              | undefined
          )?.value

          if (selected_ranking_id) {
            var ranking = await app.db.rankings.get(parseInt(selected_ranking_id))
          } else {
            const guild_rankings = await app.db.guild_rankings.get({
              guild_id: interaction.guild_id,
            })
            if (guild_rankings.length == 1) {
              ranking = guild_rankings[0].ranking
            } else if (guild_rankings.length == 0) {
              return void ctx.edit(
                await allGuildRankingsPage(app, {
                  interaction,
                  state: rankings_cmd_def.newState(),
                }),
              )
            } else {
              throw new AppError('Please select a ranking to view the leaderboard for')
            }
          }

          ctx.state.save.ranking_id(ranking.data.id)

          return void ctx.edit({
            content: (await leaderboardMessage(ranking)).patchdata.content ?? undefined,
          })
        },
      )
    })

export const leaderboard = new ViewModule([guildCommand(leaderboardCmd, leaderboardCmdDef)])
