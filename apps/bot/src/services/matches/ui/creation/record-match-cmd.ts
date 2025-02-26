import {
  ChatInteractionResponse,
  checkGuildMessageComponentInteraction,
  CommandSignature,
  ComponentContext,
  Context,
  DeferredComponentContext,
  getOptions,
  StateContext,
} from '@repo/discord'
import { assert, intOrUndefined, nonNullable, snowflakeToDate } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { UserError } from '../../../../errors/user-errors'
import { App } from '../../../../setup/app'
import { Colors, hasAdminPerms } from '../../../../utils'
import { escapeMd, messageLink, relativeTimestamp } from '../../../../utils/ui'
import { guildRankingsOption, withSelectedRanking } from '../../../../utils/view-helpers/ranking-option'
import { numRankings } from '../../../guilds/properties'
import { getRegisterPlayer } from '../../../players/manage-players'
import { matchSummaryEmbed } from '../../logging/match-summary-message'
import { recordAndScoreMatch } from '../../management/match-creation'
import { record_match_view_sig } from './record-match-view'

export const record_match_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'record-match',
  description: 'record a match',
})

const optionnames = {
  ranking: 'ranking',
  winner: 'winner',
  loser: 'loser',
  time_finished: 'when',
}

export const record_match_cmd = record_match_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    if ((await numRankings(app, guild)) == 0) return null

    const options: D.APIApplicationCommandBasicOption[] = [
      {
        name: optionnames.winner,
        description: 'Who won (if applicable)',
        type: D.ApplicationCommandOptionType.User,
      },
      {
        name: optionnames.loser,
        description: 'Who lost (if applicable)',
        type: D.ApplicationCommandOptionType.User,
      },
      {
        name: optionnames.time_finished,
        description: 'Snowflake or Unix timestamp of when the match was finished (default now)',
        type: D.ApplicationCommandOptionType.String,
      },
    ]

    return new CommandSignature({
      ...record_match_cmd_sig.config,
      options: (
        await guildRankingsOption(app, guild, optionnames.ranking, {}, 'Which ranking should this match belong to')
      ).concat(options),
    })
  },
  onCommand: (ctx, app) => {
    /**
     * If the ranking is 1v1 all the required options are provided, record the match.
     * If not, open a menu to select the teams
     *
     * If the user is admin, skip the confirmation step
     */

    const input = getOptions(ctx.interaction, {
      ranking: { type: D.ApplicationCommandOptionType.Integer, name: optionnames.ranking },
      winner: { type: D.ApplicationCommandOptionType.User, name: optionnames.winner },
      loser: { type: D.ApplicationCommandOptionType.User, name: optionnames.loser },
      time_finished: { type: D.ApplicationCommandOptionType.String, name: optionnames.time_finished },
    })

    const state = record_match_view_sig.newState({})

    const selected_time_finished = intOrUndefined(input.time_finished)
    if (selected_time_finished) {
      if (selected_time_finished.toString().length < 13) {
        // assume it's a unix timestamp
        state.save.selected_time_finished(new Date(selected_time_finished * 1000))
      } else {
        // assume it's a snowflake
        state.save.selected_time_finished(snowflakeToDate(BigInt(selected_time_finished)))
      }
    }

    return withSelectedRanking(
      {
        app,
        ctx,
        ranking_id: input.ranking,
      },
      async p_ranking =>
        ctx.defer(async ctx => {
          const selected_time_finished = (
            ctx.interaction.data.options?.find(o => o.name === optionnames.time_finished) as
              | D.APIApplicationCommandInteractionDataStringOption
              | undefined
          )?.value

          if (await hasAdminPerms(app, ctx)) {
            state.save.admin(true)
          }

          const ranking = await p_ranking?.fetch()
          state.save.ranking_id(ranking.data.id)
          state.save.players_per_team(ranking.data.players_per_team)
          state.save.teams_per_match(ranking.data.teams_per_match)

          if (state.is.players_per_team(1) && state.is.teams_per_match(2)) {
            // If this is a 1v1 ranking, check if the winner and loser were specified

            const winner_id = (
              ctx.interaction.data.options?.find(o => o.name === optionnames.winner) as
                | D.APIApplicationCommandInteractionDataUserOption
                | undefined
            )?.value
            const loser_id = (
              ctx.interaction.data.options?.find(o => o.name === optionnames.loser) as
                | D.APIApplicationCommandInteractionDataUserOption
                | undefined
            )?.value

            if (winner_id && loser_id) {
              if (state.is.admin()) {
                // record the match
                const winner = await getRegisterPlayer(app, winner_id, ranking)
                const loser = await getRegisterPlayer(app, loser_id, ranking)

                const match = await recordAndScoreMatch(
                  app,
                  ranking,
                  [[winner], [loser]].map(team =>
                    team.map(p => ({
                      player: p,
                      ...p.data,
                    })),
                  ),
                  [1, 0],
                  undefined,
                  state.data.selected_time_finished,
                )

                const match_summary_message = await match.getSummaryMessage(ctx.interaction.guild_id)

                return void ctx.edit({
                  content:
                    `Match #${match.data.number} in ${ranking.data.name} recorded.` +
                    (match_summary_message
                      ? ` ${messageLink(
                          match_summary_message.guild_id,
                          match_summary_message.channel_id,
                          match_summary_message.message_id,
                        )}`
                      : ``),
                  flags: D.MessageFlags.Ephemeral,
                })
              } else {
                // store the selected users to state
                state.save.players([[{ user_id: winner_id }], [{ user_id: loser_id }]])
                state.save.selected_winning_team_index(0)
                // prompt all users involved to confirm the match
                await ctx.edit({
                  content: `All players involved in this match must agree to the results`,
                })

                state.save.requesting_player_id(ctx.interaction.member.user.id)
                state.save.match_requested_at(new Date())
                return void ctx.followup(await playersConfirmingMatchPage(app, { ...ctx, state }))
              }
            }
          }

          // Otherwise, select teams
          await ctx.edit(await selectTeamPage(app, { ...ctx, state }))
        }),
    )
  },
})

/**
 * Edits the current view to the team selection page
 */
export async function selectTeamPage(
  app: App,
  ctx: Context<typeof record_match_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  let components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = []
  const players_per_team = ctx.state.get.players_per_team()
  const teams_per_match = ctx.state.get.teams_per_match()
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
            min_values: teams_per_match,
            max_values: teams_per_match,
          },
        ],
      },
    ]
  } else {
    components = new Array(teams_per_match).fill(0).map((_, i) => {
      return {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.UserSelect,
            placeholder: `Team ${i + 1}`,
            custom_id: ctx.state.set.selected_team_idx(i).set.clicked_component('select team').cId(),
            min_values: players_per_team,
            max_values: players_per_team,
          },
        ],
      }
    })
  }

  const all_teams_selected =
    ctx.state.data.players?.length == teams_per_match &&
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

export async function onSelectTeam(
  app: App,
  ctx: ComponentContext<typeof record_match_view_sig>,
): Promise<ChatInteractionResponse> {
  const data = ctx.interaction.data as unknown as D.APIMessageUserSelectInteractionData
  const selected_user_ids = data.values
  const players_per_team = ctx.state.get.players_per_team()
  const teams_per_match = ctx.state.get.teams_per_match()

  const current_selected_players =
    ctx.state.data.players?.slice() ||
    new Array(teams_per_match).fill(0).map(() => new Array(players_per_team).fill(placeholder_user_id))

  // Update the current_team_userids based on the input
  if (players_per_team == 1) {
    assert(selected_user_ids.length == teams_per_match, 'number of players should match num teams')
    ctx.state.save.players(selected_user_ids.map(id => [{ user_id: id }]))
  } else {
    // selected_user_ids contains all the players for the selected team
    assert(selected_user_ids.length == players_per_team, 'number of players should match players per team')

    const updated_selected_players = current_selected_players.slice()
    updated_selected_players[ctx.state.get.selected_team_idx()] = selected_user_ids.map(user_id => {
      return { user_id }
    })
    ctx.state.save.players(current_selected_players)
  }

  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await selectTeamPage(app, ctx),
  }
}

export async function selectAndConfirmOutcomePage(
  app: App,
  ctx: ComponentContext<typeof record_match_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const players_per_team = ctx.state.get.players_per_team()
  const teams_per_match = ctx.state.get.teams_per_match()
  const players = ctx.state.get.players()
  const ranking = app.db.rankings.get(ctx.state.get.ranking_id())

  // find the name of the users in the match
  const all_player_names = await Promise.all(
    players.flat().map(async p => {
      return (await getRegisterPlayer(app, nonNullable(p.user_id, 'user_id'), ranking)).data.name // "The field user won't be included in the member object attached to MESSAGE_CREATE and MESSAGE_UPDATE gateway events."
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
            options: new Array(teams_per_match)
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

export function onConfirmOutcomeBtn(
  app: App,
  ctx: ComponentContext<typeof record_match_view_sig>,
): ChatInteractionResponse {
  return ctx.defer(async ctx => {
    if (ctx.state.is.admin()) {
      return void ctx.edit(await recordMatchFromSelectedTeams(app, ctx))
    } else {
      // prompt all users involved to confirm the match
      return void sendPlayersConfirmingMatchPage(app, ctx)
    }
  })
}

async function sendPlayersConfirmingMatchPage(
  app: App,
  ctx: DeferredComponentContext<typeof record_match_view_sig>,
): Promise<void> {
  ctx.state.save.requesting_player_id(ctx.interaction.member.user.id)
  ctx.state.save.match_requested_at(new Date())
  return void ctx.followup(await playersConfirmingMatchPage(app, ctx))
}

async function playersConfirmingMatchPage(
  app: App,
  ctx: StateContext<typeof record_match_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const expires_at = new Date(ctx.state.get.match_requested_at().getTime() + match_confirm_timeout_ms)
  const players = ctx.state.get.players()
  const players_per_team = ctx.state.get.players_per_team()
  const teams_per_match = ctx.state.get.teams_per_match()
  const selected_winner_index = ctx.state.get.selected_winning_team_index()
  const original_user_id = ctx.state.get.requesting_player_id()
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

  const embed: D.APIEmbed = {
    title: `New Match`,
    description:
      `<@${original_user_id}> wants to record a match in **${escapeMd(ranking.data.name)}**. The match will be recorded once all players have agreed to the results` +
      `\nExpires ${relativeTimestamp(expires_at)}`,
    fields: new Array(teams_per_match)
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
          value: ctx.state.get
            .players()
            .flat()
            .map((c, i) => {
              return c.confirmed === true ? `\n<@${c.user_id}>` : ''
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

export async function onPlayerConfirmOrCancelBtn(
  app: App,
  ctx: ComponentContext<typeof record_match_view_sig>,
): Promise<ChatInteractionResponse> {
  const { channel, message } = checkGuildMessageComponentInteraction(ctx.interaction)

  const time_since_match_requested = new Date().getTime() - ctx.state.get.match_requested_at().getTime()

  if (time_since_match_requested > match_confirm_timeout_ms) {
    await app.discord.deleteMessageIfExists(channel.id, message.id)
    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `This match has expired`,
        flags: D.MessageFlags.Ephemeral,
      },
    }
  }

  const user_id = ctx.interaction.member.user.id

  // find which user is confirming/cancelling
  const players = ctx.state.get.players()

  const player_team = players.findIndex(team => team.some(p => p.user_id == user_id))
  const user_index = players[player_team].findIndex(p => p.user_id == user_id)
  if (!players.some(team => team.some(p => p.user_id == user_id))) {
    throw new UserError(`Players involved in this match should confirm/cancel`)
  }

  if (ctx.state.is.clicked_component('match user confirm')) {
    // add the user to the list of confirmed users
    players[player_team][user_index].confirmed = true
  } else if (ctx.state.is.clicked_component('match user cancel')) {
    // remove the user from the list of confirmed users
    players[player_team][user_index].confirmed = false
  }
  ctx.state.save.players(players)

  // check if all users have canceled
  if (players.every(team => team.every(p => !p.confirmed))) {
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
  if (players.every(team => team.every(p => p.confirmed))) {
    // record the match
    return ctx.defer(async ctx => {
      const followup = await ctx.followup({
        content: `Recording match...`,
        flags: D.MessageFlags.Ephemeral,
      })
      await ctx.edit(await recordMatchFromSelectedTeams(app, ctx))
      return void app.discord.deleteMessageIfExists(followup.channel_id, followup.id)
    })
  }

  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await playersConfirmingMatchPage(app, ctx),
  }
}

async function recordMatchFromSelectedTeams(
  app: App,
  ctx: StateContext<typeof record_match_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const teams_per_match = ctx.state.get.teams_per_match()
  const selected_user_ids = ensureAllTeamsSelected(
    ctx.state.get.players(),
    ctx.state.get.players_per_team(),
    teams_per_match,
  )

  const relative_scores = new Array(teams_per_match)
    .fill(0)
    .map((_, i) => (i == ctx.state.get.selected_winning_team_index() ? 1 : 0))

  const ranking = app.db.rankings.get(ctx.state.get.ranking_id())

  // register all the players, and convert them to match players based on their current rating
  const match_players = await Promise.all(
    selected_user_ids.map(async user_ids => {
      return Promise.all(
        user_ids.map(async id => {
          const player = await getRegisterPlayer(app, id, ranking)
          return {
            player,
            ...player.data,
          }
        }),
      )
    }),
  )

  const new_match = await recordAndScoreMatch(
    app,
    ranking,
    match_players,
    relative_scores,
    undefined,
    ctx.state.data.selected_time_finished,
  )

  return {
    components: [],
    embeds: [await matchSummaryEmbed(app, new_match)],
    flags: D.MessageFlags.Ephemeral,
  }
}

const match_confirm_timeout_ms = 1000 * 60 * 15 // minutes

const placeholder_user_id = '0'

/**
 * Returns array of arrays of user ids for each team.
 * Validates the size of each team and number of teams
 */
function ensureAllTeamsSelected(
  players: { user_id?: string }[][],
  players_per_team: number,
  teams_per_match: number,
): string[][] {
  if (players.length !== teams_per_match) {
    throw new UserError(`Only ${players.length} teams selected. Expected: ${teams_per_match}`)
  }
  if (players.some(team => team.length !== players_per_team)) {
    throw new UserError(`All teams should have ${players_per_team} players`)
  }

  if (players.some(team => team.some(p => !p.user_id))) {
    throw new UserError('Not all players selected')
  }

  return players.map(team => team.map(p => p.user_id!))
}
