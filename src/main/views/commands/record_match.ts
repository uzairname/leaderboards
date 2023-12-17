import * as D from 'discord-api-types/v10'
import {
  BooleanField,
  ChatInteractionResponse,
  ChoiceField,
  CommandContext,
  CommandInteractionResponse,
  CommandView,
  ComponentContext,
  Context,
  DeferContext,
  IntField,
  ListField,
  StringField,
  TimestampField,
  _
} from '../../../discord-framework'
import { sentry } from '../../../request/sentry'
import { assert, nonNullable, unflatten } from '../../../utils/utils'
import { App } from '../../app/app'
import { AppErrors, UserError } from '../../app/errors'
import { Colors, commandMention, relativeTimestamp } from '../../messages/message_pieces'
import { recordAndScoreNewMatch } from '../../modules/matches/score_matches'
import { getRegisterPlayer } from '../../modules/players'
import { checkGuildInteraction, hasAdminPerms } from '../utils/checks'
import { rankingsAutocomplete } from '../utils/common'
import { rankingSettingsPage } from './rankings/ranking_settings'
import { rankings_cmd_def } from './rankings/rankings'

const options = {
  ranking: 'for',
  winner: 'winner',
  loser: 'loser'
}

const record_match_command_def = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  command: {
    name: 'record-match',
    description: 'record a match',
    options: [
      {
        name: options.winner,
        description: 'Winner of the match. (Optional if more than 2 players)',
        type: D.ApplicationCommandOptionType.User,
        required: false
      },
      {
        name: options.loser,
        description: 'Loser of the match. (Optional if more than 2 players)',
        type: D.ApplicationCommandOptionType.User,
        required: false
      },
      {
        name: options.ranking,
        description: `Ranking to record the match for (Optional if there's one ranking)`,
        type: D.ApplicationCommandOptionType.String,
        required: false,
        autocomplete: true
      }
    ]
  },
  custom_id_prefix: 'rm',
  state_schema: {
    // whether the user can record a match on their own
    admin: new BooleanField(),
    clicked_component: new ChoiceField({
      'select team': _,
      'confirm teams': _,
      'select winner': _,
      'confirm outcome': _,
      'match user confirm': _, // someone in the match has confirmed the pending match
      'match user cancel': _ // someone in the match has cancelled the pending match
    }),
    num_teams: new IntField(),
    players_per_team: new IntField(),
    // index of the team being selected (0-indexed)
    selected_team: new IntField(),
    // index of the chosen winning team (0-indexed)
    selected_winning_team_index: new IntField(),
    flattened_team_user_ids: new ListField(),
    ranking_id: new IntField(),

    match_requested_at: new TimestampField(),
    // user who originally requested the match
    requesting_player_id: new StringField(),
    // list of user ids who have confirmed the match, corresponding to flattened_team_users
    users_confirmed: new ListField()
  }
})

export const record_match_cmd = (app: App) =>
  record_match_command_def
    .onAutocomplete(rankingsAutocomplete(app, false, options.ranking))

    .onCommand(async ctx => {
      return initCommand(app, ctx)
    })

    .onComponent(async ctx => {
      if (ctx.state.is.clicked_component('select team')) {
        const data = ctx.interaction.data as unknown as D.APIMessageUserSelectInteractionData
        const selected_user_ids = data.values
        return await onSelectTeam(app, ctx, selected_user_ids)
      } //
      else if (ctx.state.is.clicked_component('confirm teams')) {
        return {
          type: D.InteractionResponseType.ChannelMessageWithSource,
          data: await selectOutcomeAndConfirmPage(app, ctx)
        }
      } //
      else if (ctx.state.is.clicked_component('select winner')) {
        const data = ctx.interaction.data as unknown as D.APIMessageStringSelectInteractionData
        ctx.state.save.selected_winning_team_index(parseInt(data.values[0]))
        return {
          type: D.InteractionResponseType.UpdateMessage,
          data: await selectOutcomeAndConfirmPage(app, ctx)
        }
      } //
      else if (ctx.state.is.clicked_component('confirm outcome')) {
        return onConfirmOutcomeBtn(app, ctx)
      } //
      else if (ctx.state.is.clicked_component('match user confirm')) {
        return await onPlayerConfirmOrCancelBtn(app, ctx)
      } //
      else if (ctx.state.is.clicked_component('match user cancel')) {
        return await onPlayerConfirmOrCancelBtn(app, ctx)
      } //
      else {
        throw new AppErrors.UnknownState(ctx.state.data.clicked_component)
      }
    })

function initCommand(
  app: App,
  ctx: CommandContext<typeof record_match_command_def>
): CommandInteractionResponse {
  const interaction = checkGuildInteraction(ctx.interaction)
  const selected_ranking_id = (
    interaction.data.options?.find(o => o.name === options.ranking) as
      | D.APIApplicationCommandInteractionDataStringOption
      | undefined
  )?.value

  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredChannelMessageWithSource,
      data: { flags: D.MessageFlags.Ephemeral }
    },
    async ctx => {
      /*Save the selected ranking id to the state. 
    If the ranking was not specified, try to use the only ranking in the guild. 
    If not and there is more than one ranking, throw an error
   */

      if (selected_ranking_id == 'create') {
        // TODO
        const res = rankingSettingsPage(app, {
          interaction: ctx.interaction,
          state: rankings_cmd_def.getState()
        })
        return ctx.edit({
          content: `Create a ranking with ${await commandMention(app, rankings_cmd_def)}`,
          flags: D.MessageFlags.Ephemeral
        })
      }

      if (await hasAdminPerms(app, ctx)) {
        ctx.state.save.admin(true)
      }

      if (selected_ranking_id) {
        var ranking = await app.db.rankings.get(parseInt(selected_ranking_id))
      } else {
        const rankings = await app.db.guild_rankings.get({ guild_id: interaction.guild_id })
        if (rankings.length == 1) {
          ranking = rankings[0].ranking
        } else if (rankings.length == 0) {
          throw new UserError(
            `Please specify a ranking to record the match for. ` +
              `Create a ranking with ${await commandMention(app, rankings_cmd_def)}`
          )
        } else {
          throw new UserError('Please specify a ranking to record the match for')
        }
      }

      ctx.state.save.ranking_id(ranking.data.id)
      ctx.state.save.players_per_team(
        nonNullable(ranking.data.players_per_team, 'players_per_team')
      )
      ctx.state.save.num_teams(nonNullable(ranking.data.num_teams, 'num_teams'))

      if (ctx.state.is.players_per_team(1) && ctx.state.is.num_teams(2)) {
        // If this is a 1v1 ranking, check if the winner and loser were specified

        const winner_id = (
          interaction.data.options?.find(o => o.name === options.winner) as
            | D.APIApplicationCommandInteractionDataUserOption
            | undefined
        )?.value
        const loser_id = (
          interaction.data.options?.find(o => o.name === options.loser) as
            | D.APIApplicationCommandInteractionDataUserOption
            | undefined
        )?.value

        if (winner_id && loser_id) {
          if (ctx.state.is.admin()) {
            // record the match
            const winner = await getRegisterPlayer(app, winner_id, ranking)
            const loser = await getRegisterPlayer(app, loser_id, ranking)
            await recordAndScoreNewMatch(app, ranking, [[winner], [loser]], [1, 0])
            return await ctx.edit({
              content: `Recorded match`,
              flags: D.MessageFlags.Ephemeral
            })
          } else {
            // prompt all users involved to confirm the match
            validateSelectedTeams([[winner_id], [loser_id]])
            // store the selected users to state
            ctx.state.save.flattened_team_user_ids([winner_id, loser_id].map(id => id.toString()))
            ctx.state.save.selected_winning_team_index(0)
            await ctx.edit({
              content: `All players involved in this match must agree to the results`
            })
            return await onPlayerConfirmOutcome(app, ctx)
          }
        }
      }

      // Otherwise, select teams

      return await ctx.edit(await selectTeamPage(app, ctx, false))
    }
  )
}

async function onSelectTeam(
  app: App,
  ctx: ComponentContext<typeof record_match_command_def>,
  selected_user_ids: string[]
): Promise<ChatInteractionResponse> {
  const players_per_team = ctx.state.get('players_per_team')
  const num_teams = ctx.state.get('num_teams')

  // make a copy of players so we don't mutate the state
  const current_user_ids =
    ctx.state.data.flattened_team_user_ids?.slice() ||
    new Array(num_teams * players_per_team).fill(placeholder_user_id)

  const selected_team = ctx.state.get('selected_team')
  const new_flat_team_user_ids = update_team_flat(
    current_user_ids,
    selected_team,
    selected_user_ids,
    players_per_team,
    num_teams
  )

  validateSelectedTeams(unflatten(new_flat_team_user_ids, players_per_team))

  ctx.state.save.flattened_team_user_ids(new_flat_team_user_ids)

  const all_teams_selected =
    ctx.state.data.flattened_team_user_ids?.every(p => p != placeholder_user_id) || false

  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await selectTeamPage(app, ctx, all_teams_selected)
  }
}

async function selectTeamPage(
  app: App,
  ctx: Context<typeof record_match_command_def>,
  all_teams_selected: boolean
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
                selected_team: 0,
                clicked_component: 'select team'
              })
              .encode(),
            min_values: num_teams,
            max_values: num_teams
          }
        ]
      }
    ]
  } else {
    components = new Array(num_teams).fill(0).map((_, i) => {
      return {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.UserSelect,
            placeholder: `Team ${i + 1}`,
            custom_id: ctx.state.set.selected_team(i).set.clicked_component('select team').encode(),
            min_values: players_per_team,
            max_values: players_per_team
          }
        ]
      }
    })
  }

  components.push({
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.Button,
        label: 'Confirm',
        style: D.ButtonStyle.Success,
        custom_id: ctx.state.set.clicked_component('confirm teams').encode(),
        disabled: !all_teams_selected
      }
    ]
  })

  return {
    content: '',
    components,
    flags: D.MessageFlags.Ephemeral
  }
}

async function selectOutcomeAndConfirmPage(
  app: App,
  ctx: ComponentContext<typeof record_match_command_def>
): Promise<D.APIInteractionResponseCallbackData> {
  const players_per_team = ctx.state.get('players_per_team')
  const num_teams = ctx.state.get('num_teams')
  const flattened_user_ids = nonNullable(
    ctx.state.data.flattened_team_user_ids,
    'flattened_user_ids'
  )
  const interaction = checkGuildInteraction(ctx.interaction)

  // find the name of the users in the match
  const all_player_names = await Promise.all(
    flattened_user_ids.map(async user_id => {
      const member = await app.bot.getGuildMember(interaction.guild_id, user_id)
      return member.nick || member.user!.username // "The field user won't be included in the member object attached to MESSAGE_CREATE and MESSAGE_UPDATE gateway events."
    })
  )

  // take the first user name from each team as the team name
  const team_names = all_player_names.filter((_, i) => i % players_per_team == 0)

  sentry.debug(
    'selected winning team index',
    ctx.state.data.selected_winning_team_index,
    !ctx.state.data.selected_winning_team_index
  )

  const data: D.APIInteractionResponseCallbackData = {
    content: ``,
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.StringSelect,
            placeholder: 'Select Winning Team',
            custom_id: ctx.state.set.clicked_component('select winner').encode(),
            options: new Array(num_teams).fill(0).map((_, i) => {
              return {
                label: team_names ? team_names[i] : `Team ${i + 1}`,
                value: i.toString(),
                default: ctx.state.is.selected_winning_team_index(i)
              }
            })
          }
        ]
      },
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            label: 'Confirm',
            style: D.ButtonStyle.Success,
            custom_id: ctx.state.set.clicked_component('confirm outcome').encode(),
            disabled: ctx.state.data.selected_winning_team_index === undefined
          }
        ]
      }
    ],
    flags: D.MessageFlags.Ephemeral
  }

  return data
}

function onConfirmOutcomeBtn(
  app: App,
  ctx: ComponentContext<typeof record_match_command_def>
): ChatInteractionResponse {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate
    },
    async ctx => {
      if (ctx.state.is.admin()) {
        await ctx.followup({
          content: `Please wait...`
        })
        return await ctx.followup(await recordMatchFromSelectedTeams(app, ctx))
      } else {
        // prompt all users involved to confirm the match
        return await onPlayerConfirmOutcome(app, ctx)
      }
    }
  )
}

async function onPlayerConfirmOutcome(
  app: App,
  ctx: DeferContext<typeof record_match_command_def.options.state_schema>
): Promise<void> {
  const interaction = checkGuildInteraction(ctx.interaction)
  ctx.state.save.requesting_player_id(interaction.member.user.id)
  ctx.state.save.match_requested_at(new Date())
  await ctx.followup(await playersConfirmingMatchPage(app, ctx))
}

async function playersConfirmingMatchPage(
  app: App,
  ctx: Context<typeof record_match_command_def>
): Promise<D.APIInteractionResponseCallbackData> {
  const requested_at = ctx.state.get('match_requested_at')
  const expires_at = new Date(requested_at.getTime() + match_confirm_timeout_ms)

  const flattened_user_ids = nonNullable(
    ctx.state.data.flattened_team_user_ids,
    'flattened_team_users'
  )
  const players_per_team = ctx.state.get('players_per_team')
  const num_teams = ctx.state.get('num_teams')

  // take the first user name from each team as the team name
  const selected_winner_index = nonNullable(
    ctx.state.data.selected_winning_team_index,
    'winner_index'
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
          name: `Team ${i + 1}` + (i == selected_winner_index ? ' (WINNER)' : ''),
          value: unflatten(flattened_user_ids, players_per_team)
            [i].map(user_id => `<@${user_id}>`)
            .join(players_per_team == 1 ? ', ' : '\n')
        } as D.APIEmbedField
      })
      .concat([
        {
          name: 'Confirmed Players',
          value: (ctx.state.data.users_confirmed ?? new Array(flattened_user_ids.length).fill('0'))
            .map((c, i) => {
              return c == 'y' ? `<@${flattened_user_ids[i]}>` : ''
            })
            .join('\n')
        }
      ]),
    color: Colors.EmbedBackground
  }

  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [
    {
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.Button,
          label: 'Confirm',
          style: D.ButtonStyle.Success,
          custom_id: ctx.state.set.clicked_component('match user confirm').encode()
        },
        {
          type: D.ComponentType.Button,
          label: 'Cancel',
          style: D.ButtonStyle.Danger,
          custom_id: ctx.state.set.clicked_component('match user cancel').encode()
        }
      ]
    }
  ]

  const data: D.APIInteractionResponseCallbackData = {
    embeds: [embed],
    components,
    allowed_mentions: { users: flattened_user_ids }
  }

  return data
}

async function onPlayerConfirmOrCancelBtn(
  app: App,
  ctx: ComponentContext<typeof record_match_command_def>
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
        flags: D.MessageFlags.Ephemeral
      }
    }
  }

  const interaction = checkGuildInteraction(ctx.interaction)
  const user_id = interaction.member.user.id

  // find which user is confirming/cancelling
  const flattened_user_ids = nonNullable(
    ctx.state.data.flattened_team_user_ids,
    'flattened_team_users'
  )

  sentry.debug('flattened_user_ids', flattened_user_ids)

  const user_index = flattened_user_ids.indexOf(user_id)
  if (user_index == -1) {
    throw new UserError(`Players involved in this match should confirm/cancel`)
  }

  const users_confirmed =
    ctx.state.data.users_confirmed?.slice() || new Array(flattened_user_ids.length).fill('0')
  if (ctx.state.is.clicked_component('match user confirm')) {
    // add the user to the list of confirmed users
    users_confirmed[user_index] = 'y'
  } else if (ctx.state.is.clicked_component('match user cancel')) {
    // remove the user from the list of confirmed users
    users_confirmed[user_index] = 'n'
  }
  ctx.state.save.users_confirmed(users_confirmed)

  // check if all users have confirmed or canceled
  if (users_confirmed.every(c => c == 'n')) {
    // all users have canceled
    return {
      type: D.InteractionResponseType.UpdateMessage,
      data: {
        content: `Match canceled`,
        embeds: [],
        components: [],
        flags: D.MessageFlags.Ephemeral
      }
    }
  }

  if (users_confirmed.every(c => c == 'y')) {
    // all users have confirmed
    return {
      type: D.InteractionResponseType.UpdateMessage,
      data: await recordMatchFromSelectedTeams(app, ctx)
    }
  }

  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await playersConfirmingMatchPage(app, ctx)
  }
}

async function recordMatchFromSelectedTeams(
  app: App,
  ctx: Context<typeof record_match_command_def>
): Promise<D.APIInteractionResponseCallbackData> {
  const players_per_team = ctx.state.get('players_per_team')
  const num_teams = ctx.state.get('num_teams')

  const current_user_ids = nonNullable(
    ctx.state.data.flattened_team_user_ids,
    'flattened_team_users'
  )

  assert(
    current_user_ids.every(p => p != placeholder_user_id),
    'not all teams have been selected'
  )

  const relative_scores = new Array(num_teams)
    .fill(0)
    .map((_, i) => (i == ctx.state.get('selected_winning_team_index') ? 1 : 0))

  const ranking = await app.db.rankings.get(ctx.state.get('ranking_id'))
  // register all the players
  const team_players = await Promise.all(
    unflatten(current_user_ids, players_per_team).map(async user_ids => {
      return await Promise.all(user_ids.map(user_id => getRegisterPlayer(app, user_id, ranking)))
    })
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
          .join('\n\n')
      },
      {
        name: 'Outcome',
        value: relative_scores
          .map((score, i) => {
            return `${i}: ${score}`
          })
          .join('\n')
      }
    ],
    color: Colors.EmbedBackground
  }

  return {
    content: `Recorded match`,
    components: [],
    embeds: [embed],
    flags: D.MessageFlags.Ephemeral
  }
}

const match_confirm_timeout_ms = 1000 * 60 * 1 // 10 minutes

const placeholder_user_id = '0'

function update_team_flat(
  flattened_team_user_ids: string[],
  team_index: number,
  selected_user_ids: string[],
  players_per_team: number,
  num_teams: number
): string[] {
  const new_flattened_team_user_ids = flattened_team_user_ids.slice()
  if (players_per_team == 1) {
    // selected_user_ids contains one from every team
    assert(selected_user_ids.length == num_teams, 'number of players should match num teams')
    return selected_user_ids.slice()
  } else {
    // selected_user_ids contains all the players for the selected team
    assert(
      selected_user_ids.length == players_per_team,
      'number of players should match players per team'
    )
    new_flattened_team_user_ids.splice(
      team_index * players_per_team,
      players_per_team,
      ...selected_user_ids
    )
  }
  return new_flattened_team_user_ids
}

function validateSelectedTeams(team_players: string[][]) {
  // no duplicate players
  const all_players = team_players.flat()
  const unique_players = new Set(all_players)
  if (all_players.length != unique_players.size) {
    throw new UserError('All players must be unique')
  }
}
