import * as D from 'discord-api-types/v10'
import {
  CommandContext,
  CommandInteractionResponse,
  CommandView,
  field,
  _,
  getModalSubmitEntries,
} from '../../../discord-framework'
import { nonNullable } from '../../../utils/utils'
import { App } from '../../app/app'
import { AppError } from '../../app/errors'
import { getRegisterPlayer } from '../../modules/players'
import { checkGuildInteraction, ensureAdminPerms, hasAdminPerms } from '../utils/checks'
import { rankingsAutocomplete } from '../utils/common'
import { newRankingModal } from './rankings/new_ranking'
import { allGuildRankingsPage, rankings, rankings_cmd_def } from './rankings/rankings'

const optionnames = {
  ranking: 'for',
  player1: 'player 1',
  player2: 'player 2',
}

const start_match_command = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  name: 'startmatch',
  description: 'description',
  custom_id_id: 'sm',
  options: [
    {
      name: optionnames.player1,
      description: `Player 1 (optional)`,
      type: D.ApplicationCommandOptionType.User,
      required: false,
    },
    {
      name: optionnames.player2,
      description: `Player 2 (optional)`,
      type: D.ApplicationCommandOptionType.User,
      required: false,
    },
    {
      name: optionnames.ranking,
      description: `Ranking to record the match for (Optional if there's one ranking)`,
      type: D.ApplicationCommandOptionType.String,
      required: false,
      autocomplete: true,
    },
  ],
  state_schema: {
    ranking_id: field.Int(),
    component: field.Choice({
      'select:team': _,
      'btn:confirm teams': _,
    }),
    num_teams: field.Int(),
    players_per_team: field.Int(),
    // index of the team being selected (0-indexed)
    selected_team_idx: field.Int(),
  },
})

export const startMatch = (app: App) =>
  start_match_command.onAutocomplete(rankingsAutocomplete(app)).onCommand(async ctx => {
    return onCommand(app, ctx)
  })

async function onCommand(
  app: App,
  ctx: CommandContext<typeof start_match_command>,
): Promise<CommandInteractionResponse> {
  const interaction = checkGuildInteraction(ctx.interaction)

  const ranking_option_value = (
    interaction.data.options?.find(o => o.name === optionnames.ranking) as
      | D.APIApplicationCommandInteractionDataStringOption
      | undefined
  )?.value

  if (ranking_option_value == 'create') {
    return newRankingModal(rankings_cmd_def.getState({}))
  }

  await ensureAdminPerms(app, ctx)

  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredChannelMessageWithSource,
      data: { flags: D.MessageFlags.Ephemeral },
    },
    async ctx => {
      if (ranking_option_value) {
        var ranking = await app.db.rankings.get(parseInt(ranking_option_value))
      } else {
        const rankings = await app.db.guild_rankings.get({ guild_id: interaction.guild_id })
        if (rankings.length == 1) {
          ranking = rankings[0].ranking
        } else if (rankings.length == 0) {
          return void (await ctx.edit(
            await allGuildRankingsPage(app, { interaction, state: rankings_cmd_def.getState() }),
          ))
        } else {
          throw new AppError('Please specify a ranking to record the match for')
        }
      }

      ctx.state.save.ranking_id(ranking.data.id)
      ctx.state.save.players_per_team(
        nonNullable(ranking.data.players_per_team, 'players_per_team'),
      )
      ctx.state.save.num_teams(nonNullable(ranking.data.num_teams, 'num_teams'))

      if (ctx.state.is.players_per_team(1) && ctx.state.is.num_teams(2)) {
        // If this is a 1v1 ranking, check if the winner and loser were specified

        const p1_id = (
          interaction.data.options?.find(o => o.name === optionnames.player1) as
            | D.APIApplicationCommandInteractionDataUserOption
            | undefined
        )?.value

        const p2_id = (
          interaction.data.options?.find(o => o.name === optionnames.player2) as
            | D.APIApplicationCommandInteractionDataUserOption
            | undefined
        )?.value

        if (p1_id && p2_id) {
          // start a match
          return void (await ctx.edit({
            content: `Starting match between <@${p1_id}> and <@${p2_id}> for ${ranking.data.name}...`,
            flags: D.MessageFlags.Ephemeral,
          }))
        }
      }

      // Otherwise, select teams
    },
  )
}
