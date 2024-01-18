import * as D from 'discord-api-types/v10'
import {
  ChatInteractionResponse,
  CommandContext,
  CommandInteractionResponse,
  CommandView,
  ComponentContext,
  StateContext,
  DeferContext,
  _,
  field,
} from '../../../../discord-framework'
import { sentry } from '../../../../request/sentry'
import { assert, nonNullable, unflatten } from '../../../../utils/utils'
import { App } from '../../../app/app'
import { AppErrors, AppError } from '../../../app/errors'
import { Colors, relativeTimestamp } from '../../../messages/message_pieces'
import { recordAndScoreNewMatch } from '../../../modules/matches/scoring/score_matches'
import { getRegisterPlayer } from '../../../modules/players'
import { checkGuildInteraction, hasAdminPerms } from '../../utils/checks'
import { rankingsAutocomplete } from '../../utils/common'
import { create_ranking_view, createRankingModal } from '../rankings/create_ranking'
import { allGuildRankingsPage, rankings_cmd_def } from '../rankings/rankings_cmd'

const optionnames = {
  ranking: 'for',
  winner: 'winner',
  loser: 'loser',
}

const record_match_command_def = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  name: 'record-match',
  description: 'record a match',
  options: [
    {
      name: optionnames.ranking,
      description: `Ranking to record the match for (Leave blank for default)`,
      type: D.ApplicationCommandOptionType.String,
      required: false,
      autocomplete: true,
    },
    {
      name: optionnames.winner,
      description: 'Who won (if applicable)',
      type: D.ApplicationCommandOptionType.User,
      required: false,
    },
    {
      name: optionnames.loser,
      description: 'Who lost (if applicable)',
      type: D.ApplicationCommandOptionType.User,
      required: false,
    },
  ],
  custom_id_prefix: 'rm',
  state_schema: {
    // whether the user can record a match on their own
    admin: field.Bool(),
    clicked_component: field.Enum({
      'select team': _,
      'confirm teams': _,
      'select winner': _,
      'confirm outcome': _,
      'match user confirm': _, // someone in the match has confirmed the pending match
      'match user cancel': _, // someone in the match has cancelled the pending match
    }),
    num_teams: field.Int(),
    players_per_team: field.Int(),
    // index of the team being selected (0-indexed)
    selected_team_idx: field.Int(),
    // index of the chosen winning team (0-indexed)
    selected_winning_team_index: field.Int(),
    players: field.Array(
      field.Array(
        field.Object({
          user_id: field.String(),
          confirmed: field.String(),
        }),
      ),
    ),
    // flattened_team_user_ids: field.Array(field.String()),
    ranking_id: field.Int(),

    match_requested_at: field.Date(),
    // user who originally requested the match
    requesting_player_id: field.String(),
    // list of user ids who have confirmed the match, corresponding to flattened_team_users
    // users_confirmed: field.Array(field.String()),
  },
})

export const recordMatchCmd = (app: App) =>
  record_match_command_def
    .onAutocomplete(rankingsAutocomplete(app, false, optionnames.ranking))

    .onCommand(async ctx => {
      const interaction = checkGuildInteraction(ctx.interaction)
      const selected_ranking_id = (
        interaction.data.options?.find(o => o.name === optionnames.ranking) as
          | D.APIApplicationCommandInteractionDataStringOption
          | undefined
      )?.value

      if (selected_ranking_id == 'create') {
        return createRankingModal(app, { state: create_ranking_view.newState({}) })
      }

      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredChannelMessageWithSource,
          data: { flags: D.MessageFlags.Ephemeral },
        },
        async ctx => {
          if (await hasAdminPerms(app, ctx)) {
            ctx.state.save.admin(true)
          }

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

            const winner_id = (
              interaction.data.options?.find(o => o.name === optionnames.winner) as
                | D.APIApplicationCommandInteractionDataUserOption
                | undefined
            )?.value
            const loser_id = (
              interaction.data.options?.find(o => o.name === optionnames.loser) as
                | D.APIApplicationCommandInteractionDataUserOption
                | undefined
            )?.value

            if (winner_id && loser_id) {
              if (ctx.state.is.admin()) {
                // record the match
                const winner = await getRegisterPlayer(app, winner_id, ranking)
                const loser = await getRegisterPlayer(app, loser_id, ranking)

                await recordAndScoreNewMatch(app, ranking, [[winner], [loser]], [1, 0])
                sentry.captureMessage('recorded match')
                return void ctx.edit({
                  content: `Recorded match`,
                  flags: D.MessageFlags.Ephemeral,
                })
              } else {
                // prompt all users involved to confirm the match
                validateMatchTeamPlayers([[winner_id], [loser_id]])
                // store the selected users to state
                ctx.state.save.players([[{ user_id: winner_id }], [{ user_id: loser_id }]])
                ctx.state.save.selected_winning_team_index(0)
                await ctx.edit({
                  content: `All players involved in this match must agree to the results`,
                })
                return void sendPlayersConfirmingMatchPage(app, ctx)
              }
            }
          }

          // Otherwise, select teams
          return void ctx.edit(await selectTeamPage(app, ctx))
        },
      )
    })

    .onComponent(async ctx => {
      if (ctx.state.is.clicked_component('select team')) {
        return onSelectTeam(app, ctx)
      } //
      else if (ctx.state.is.clicked_component('confirm teams')) {
        return {
          type: D.InteractionResponseType.UpdateMessage,
          data: await selectAndConfirmOutcomePage(app, ctx),
        }
      } //
      else if (ctx.state.is.clicked_component('select winner')) {
        const data = ctx.interaction.data as unknown as D.APIMessageStringSelectInteractionData
        ctx.state.save.selected_winning_team_index(parseInt(data.values[0]))
        return {
          type: D.InteractionResponseType.UpdateMessage,
          data: await selectAndConfirmOutcomePage(app, ctx),
        }
      } //
      else if (ctx.state.is.clicked_component('confirm outcome')) {
        return onConfirmOutcomeBtn(app, ctx)
      } //
      else if (ctx.state.is.clicked_component('match user confirm')) {
        return onPlayerConfirmOrCancelBtn(app, ctx)
      } //
      else if (ctx.state.is.clicked_component('match user cancel')) {
        return onPlayerConfirmOrCancelBtn(app, ctx)
      } //
      else {
        throw new AppErrors.UnknownState(ctx.state.data.clicked_component)
      }
    })

async function selectTeamPage(
  app: App,
  ctx: StateContext<typeof record_match_command_def>,
): Promise<D.APIInteractionResponseCallbackData> {
  let components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = []
  const players_per_team = ctx.state.get('players_per_team')
  const num_teams = ctx.state.get('num_teams')
  if (players_per_team == 1) {
    components = [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.UserSelect,
            placeholder: `Players`,
            custom_id: ctx.state
              .setAll({
                selected_team_idx: undefined,
                clicked_component: 'select team',
              })
              .cId(),
            min_values: num_teams,
            max_values: num_teams,
          },
        ],
      },
    ]
  } else {
    components = new Array(num_teams).fill(0).map((_, i) => {
      return {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.UserSelect,
            placeholder: `Team ${i + 1}`,
            custom_id: ctx.state.set
              .selected_team_idx(i)
              .set.clicked_component('select team')
              .cId(),
            min_values: players_per_team,
            max_values: players_per_team,
          },
        ],
      }
    })
  }

  const all_teams_selected =
    ctx.state.data.players?.length == num_teams &&
    ctx.state.data.players?.every(p => {
      return p.length == players_per_team && p.every(p => !!p.user_id)
    })

  components.push({
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.Button,
        label: 'Confirm',
        style: D.ButtonStyle.Success,
        custom_id: ctx.state.set.clicked_component('confirm teams').cId(),
        disabled: !all_teams_selected,
      },
    ],
  })

  return {
    content: '',
    components,
    flags: D.MessageFlags.Ephemeral,
  }
}

async function onSelectTeam(
  app: App,
  ctx: ComponentContext<typeof record_match_command_def>,
): Promise<ChatInteractionResponse> {
  const data = ctx.interaction.data as unknown as D.APIMessageUserSelectInteractionData
  const selected_user_ids = data.values
  const players_per_team = ctx.state.get('players_per_team')
  const num_teams = ctx.state.get('num_teams')

  const current_selected_players =
    ctx.state.data.players?.slice() ||
    new Array(num_teams).fill(0).map(() => new Array(players_per_team).fill(placeholder_user_id))

  // Update the current_team_userids based on the input
  if (players_per_team == 1) {
    assert(selected_user_ids.length == num_teams, 'number of players should match num teams')
    ctx.state.save.players(
      selected_user_ids.map(user_id => {
        return [{ user_id }]
      }),
    )
  } else {
    // selected_user_ids contains all the players for the selected team
    assert(
      selected_user_ids.length == players_per_team,
      'number of players should match players per team',
    )

    const updated_selected_players = current_selected_players.slice()
    updated_selected_players[ctx.state.get('selected_team_idx')] = selected_user_ids.map(
      user_id => {
        return { user_id }
      },
    )
    ctx.state.save.players(current_selected_players)
  }

  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await selectTeamPage(app, ctx),
  }
}

async function selectAndConfirmOutcomePage(
  app: App,
  ctx: ComponentContext<typeof record_match_command_def>,
): Promise<D.APIInteractionResponseCallbackData> {
  const players_per_team = ctx.state.get('players_per_team')
  const num_teams = ctx.state.get('num_teams')
  const players = nonNullable(ctx.state.data.players, 'players')
  const interaction = checkGuildInteraction(ctx.interaction)

  // find the name of the users in the match
  const all_player_names = await Promise.all(
    players.flat().map(async p => {
      const member = await app.bot.getGuildMember(
        interaction.guild_id,
        nonNullable(p.user_id, 'user_id'),
      )
      return member.nick || member.user!.username // "The field user won't be included in the member object attached to MESSAGE_CREATE and MESSAGE_UPDATE gateway events."
    }),
  )

  // take the first user name from each team as the team name
  const team_names = all_player_names.filter((_, i) => i % players_per_team == 0)

  const data: D.APIInteractionResponseCallbackData = {
    content: ``,
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.StringSelect,
            placeholder: 'Select Winning Team',
            custom_id: ctx.state.set.clicked_component('select winner').cId(),
            options: new Array(num_teams)
              .fill(0)
              .map((_, i) => {
                return {
                  label: team_names ? team_names[i] : `Team ${i + 1}`,
                  value: i.toString(),
                  default: ctx.state.data.selected_winning_team_index === i,
                }
              })
              .concat([
                {
                  label: 'Draw',
                  value: '-1',
                  default: ctx.state.data.selected_winning_team_index === -1,
                },
              ]),
          },
        ],
      },
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            label: 'Confirm',
            style: D.ButtonStyle.Success,
            custom_id: ctx.state.set.clicked_component('confirm outcome').cId(),
            disabled: ctx.state.data.selected_winning_team_index === undefined,
          },
        ],
      },
    ],
    flags: D.MessageFlags.Ephemeral,
  }

  return data
}

function onConfirmOutcomeBtn(
  app: App,
  ctx: ComponentContext<typeof record_match_command_def>,
): ChatInteractionResponse {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      if (ctx.state.is.admin()) {
        return void ctx.edit(await recordMatchFromSelectedTeams(app, ctx))
      } else {
        // prompt all users involved to confirm the match
        return void sendPlayersConfirmingMatchPage(app, ctx)
      }
    },
  )
}

async function sendPlayersConfirmingMatchPage(
  app: App,
  ctx: DeferContext<typeof record_match_command_def>,
): Promise<void> {
  const interaction = checkGuildInteraction(ctx.interaction)
  ctx.state.save.requesting_player_id(interaction.member.user.id)
  ctx.state.save.match_requested_at(new Date())
  return void ctx.followup(await playersConfirmingMatchPage(app, ctx))
}

async function playersConfirmingMatchPage(
  app: App,
  ctx: StateContext<typeof record_match_command_def>,
): Promise<D.APIInteractionResponseCallbackData> {
  const requested_at = ctx.state.get('match_requested_at')
  const expires_at = new Date(requested_at.getTime() + match_confirm_timeout_ms)

  const players = nonNullable(ctx.state.data.players, 'players')
  const players_per_team = ctx.state.get('players_per_team')
  const num_teams = ctx.state.get('num_teams')

  // take the first user name from each team as the team name
  const selected_winner_index = nonNullable(
    ctx.state.data.selected_winning_team_index,
    'winner_index',
  )

  const original_user_id = ctx.state.get('requesting_player_id')

  const ranking = await app.db.rankings.get(ctx.state.get('ranking_id'))

  const embed: D.APIEmbed = {
    title: `New Match`,
    description:
      `<@${original_user_id}> wants to record a match in **${ranking.data.name}**. The match will be recorded once all players have agreed to the results` +
      `\nExpires ${relativeTimestamp(expires_at)}`,
    fields: new Array(num_teams)
      .fill(0)
      .map((_, i) => {
        return {
          name: `Team ${i + 1}` + (i == selected_winner_index ? ' (Winner)' : ''),
          value: players[i].map(p => `<@${p.user_id}>`).join(players_per_team == 1 ? ', ' : '\n'),
        } as D.APIEmbedField
      })
      .concat([
        {
          name: 'Confirmed Players',
          value: nonNullable(ctx.state.data.players?.flat())
            .map((c, i) => {
              return c.confirmed == 'y' ? `\n<@${c.user_id}>` : ''
            })
            .join(''),
        },
      ]),
    color: Colors.EmbedBackground,
  }

  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [
    {
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.Button,
          label: 'Confirm',
          style: D.ButtonStyle.Success,
          custom_id: ctx.state.set.clicked_component('match user confirm').cId(),
        },
        {
          type: D.ComponentType.Button,
          label: 'Cancel',
          style: D.ButtonStyle.Danger,
          custom_id: ctx.state.set.clicked_component('match user cancel').cId(),
        },
      ],
    },
  ]

  const data: D.APIInteractionResponseCallbackData = {
    embeds: [embed],
    components,
    allowed_mentions: { users: players.flat().map(p => p.user_id ?? '0') },
  }

  return data
}

async function onPlayerConfirmOrCancelBtn(
  app: App,
  ctx: ComponentContext<typeof record_match_command_def>,
): Promise<ChatInteractionResponse> {
  const time_since_match_requested =
    new Date().getTime() - ctx.state.get('match_requested_at').getTime()

  if (time_since_match_requested > match_confirm_timeout_ms) {
    ctx.interaction.channel?.id &&
      ctx.interaction.message?.id &&
      (await app.bot.deleteMessage(ctx.interaction.channel.id, ctx.interaction.message.id))
    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `This match has expired`,
        flags: D.MessageFlags.Ephemeral,
      },
    }
  }

  const interaction = checkGuildInteraction(ctx.interaction)
  const user_id = interaction.member.user.id

  // find which user is confirming/cancelling
  const players = nonNullable(ctx.state.data.players, 'players')

  const player_team = players.findIndex(team => team.some(p => p.user_id == user_id))
  const user_index = players[player_team].findIndex(p => p.user_id == user_id)
  if (!players.some(team => team.some(p => p.user_id == user_id))) {
    throw new AppError(`Players involved in this match should confirm/cancel`)
  }

  if (ctx.state.is.clicked_component('match user confirm')) {
    // add the user to the list of confirmed users
    players[player_team][user_index].confirmed = 'y'
  } else if (ctx.state.is.clicked_component('match user cancel')) {
    // remove the user from the list of confirmed users
    players[player_team][user_index].confirmed = 'n'
  }
  ctx.state.save.players(players)

  // check if all users have canceled
  if (players.every(team => team.every(p => p.confirmed == 'n'))) {
    // cancel the match
    return {
      type: D.InteractionResponseType.UpdateMessage,
      data: {
        content: `Match canceled`,
        embeds: [],
        components: [],
        flags: D.MessageFlags.Ephemeral,
      },
    }
  }

  // check if all users have confirmed
  if (players.every(team => team.every(p => p.confirmed == 'y'))) {
    // record the match
    return {
      type: D.InteractionResponseType.UpdateMessage,
      data: await recordMatchFromSelectedTeams(app, ctx),
    }
  }

  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await playersConfirmingMatchPage(app, ctx),
  }
}

async function recordMatchFromSelectedTeams(
  app: App,
  ctx: StateContext<typeof record_match_command_def>,
): Promise<D.APIInteractionResponseCallbackData> {
  const players_per_team = ctx.state.get('players_per_team')
  const num_teams = ctx.state.get('num_teams')

  const players = ctx.state.get('players')

  assert(allTeamsSelected(players, players_per_team, num_teams), 'not all teams selected')

  const relative_scores = new Array(num_teams)
    .fill(0)
    .map((_, i) => (i == ctx.state.get('selected_winning_team_index') ? 1 : 0))

  const ranking = await app.db.rankings.get(ctx.state.get('ranking_id'))
  // register all the players
  const team_players = await Promise.all(
    players.map(async user_ids => {
      return Promise.all(user_ids.map(p => getRegisterPlayer(app, p.user_id!, ranking)))
    }),
  )

  await recordAndScoreNewMatch(app, ranking, team_players, relative_scores)

  const embed: D.APIEmbed = {
    title: `Match recorded`,
    description: `**${ranking.data.name}**`,
    fields: [
      {
        name: 'Teams',
        value: team_players
          .map(team => {
            return team
              .map(player => `<@${player.data.user_id}>`)
              .join(players_per_team == 1 ? ', ' : '\n')
          })
          .join('\n\n'),
      },
    ],
    color: Colors.EmbedBackground,
  }

  return {
    content: `Recorded match`,
    components: [],
    embeds: [embed],
    flags: D.MessageFlags.Ephemeral,
  }
}

const match_confirm_timeout_ms = 1000 * 60 * 1 // 10 minutes

const placeholder_user_id = '0'

function validateMatchTeamPlayers(team_players: string[][]) {
  // no duplicate players
  const all_players = team_players.flat()
  const unique_players = new Set(all_players)
  if (all_players.length != unique_players.size) {
    throw new AppError('All players must be unique')
  }
}

function allTeamsSelected(
  players: { user_id?: string }[][],
  players_per_team: number,
  num_teams: number,
): boolean {
  return (
    players?.length == num_teams &&
    players?.every(p => {
      return p.length == players_per_team && p.every(p => !!p.user_id)
    })
  )
}
