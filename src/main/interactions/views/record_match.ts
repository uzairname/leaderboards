import {
  APIActionRowComponent,
  APIApplicationCommandInteractionDataStringOption,
  APIApplicationCommandInteractionDataUserOption,
  APIEmbed,
  APIEmbedField,
  APIInteractionResponseCallbackData,
  APIInteractionResponseUpdateMessage,
  APIMessage,
  APIMessageActionRowComponent,
  APIMessageSelectMenuInteractionData,
  APIMessageStringSelectInteractionData,
  APIMessageUserSelectInteractionData,
  APIModalInteractionResponseCallbackData,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from 'discord-api-types/v10'

import {
  ChoiceField,
  ListField,
  NumberField,
  CommandView,
  CommandContext,
  ComponentContext,
  Context,
  ChatInteractionResponse,
  DeferContext,
  CommandInteractionResponse,
} from '../../../discord-framework'
import { assert, nonNullable } from '../../../utils/utils'
import { sentry } from '../../../request/sentry'

import { App } from '../../../main/app/app'
import { getOrAddGuild } from '../../../main/modules/guilds'

import { AppErrors, UserError } from '../../../main/app/errors'
import { checkGuildInteraction, hasAdminPerms } from '../utils/checks'
import { rankingsAutocomplete } from '../utils/common'
import { getRegisterPlayer } from '../../modules/players'
import rankings_command, { rankings_command_def } from './rankings'
import { recordAndScoreNewMatch } from '../../modules/matches/score_match'
import { Ranking } from '../../../database/models'
import { Colors, commandMention } from '../../../main/messages/message_pieces'
import { ensureAdminPerms } from '../utils/checks'

const options = {
  ranking: 'for',
  winner: 'winner',
  loser: 'loser',
}

const record_match_command_def = new CommandView({
  type: ApplicationCommandType.ChatInput,
  command: {
    name: 'record-match',
    description: 'record a match',
    options: [
      {
        name: options.winner,
        description: 'Winner of the match. (Optional if more than 2 players)',
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      {
        name: options.loser,
        description: 'Loser of the match. (Optional if more than 2 players)',
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      {
        name: options.ranking,
        description: `Ranking to record the match for (Optional if there's one ranking)`,
        type: ApplicationCommandOptionType.String,
        required: false,
        autocomplete: true,
      },
    ],
  },
  custom_id_prefix: 'rm',
  state_schema: {
    admin: new NumberField(), // whether the user can record a match on their own
    clicked_component: new ChoiceField({
      'select team': null,
      'confirm teams': null,
      'select winner': null,
      'confirm outcome': null,
      'match user confirm': null, // someone in the match has confirmed the pending match
      'match user cancel': null, // someone in the match has cancelled the pending match
    }),
    num_teams: new NumberField(),
    players_per_team: new NumberField(),
    selected_team: new NumberField(), // index of the team being selected (0-indexed)
    selected_winning_team_index: new NumberField(), // index of the chosen winning team (0-indexed)
    flattened_team_user_ids: new ListField(),
    ranking_id: new NumberField(),

    users_confirmed: new ListField(), // list of user ids who have confirmed the match, corresponding to flattened_team_users
  },
})

export default (app: App) =>
  record_match_command_def
    .onAutocomplete(rankingsAutocomplete(app))

    .onCommand(async (ctx) => {
      return initCommand(app, ctx)
    })

    .onComponent(async (ctx) => {
      if (ctx.state.is.clicked_component('select team')) {
        const data = ctx.interaction.data as unknown as APIMessageUserSelectInteractionData
        const selected_user_ids = data.values
        return await onSelectTeam(app, ctx, selected_user_ids)
      } //
      else if (ctx.state.is.clicked_component('confirm teams')) {
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: await selectOutcomeAndConfirmPage(ctx, app),
        }
      } //
      else if (ctx.state.is.clicked_component('select winner')) {
        const data = ctx.interaction.data as unknown as APIMessageStringSelectInteractionData
        ctx.state.save.selected_winning_team_index(parseInt(data.values[0]))
        return {
          type: InteractionResponseType.UpdateMessage,
          data: await selectOutcomeAndConfirmPage(ctx, app),
        }
      } //
      else if (ctx.state.is.clicked_component('confirm outcome')) {
        return onConfirmOutcomeBtn(app, ctx)
      } //
      else if (ctx.state.is.clicked_component('match user confirm')) {
        return await onUserConfirmOrCancelBtn(app, ctx)
      } //
      else if (ctx.state.is.clicked_component('match user cancel')) {
        return await onUserConfirmOrCancelBtn(app, ctx)
      } else {
        throw new AppErrors.UnknownState(ctx.state.data.clicked_component)
      }
    })

function initCommand(
  app: App,
  ctx: CommandContext<typeof record_match_command_def>,
): CommandInteractionResponse {
  const interaction = checkGuildInteraction(ctx.interaction)
  const selected_ranking_id = (
    interaction.data.options?.find((o) => o.name === options.ranking) as
      | APIApplicationCommandInteractionDataStringOption
      | undefined
  )?.value

  return ctx.defer(
    {
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: { flags: MessageFlags.Ephemeral },
    },
    async (ctx) => {
      /*Save the selected ranking id to the state. 
    If the ranking was not specified, try to use the only ranking in the guild. 
    If not and there is more than one ranking, throw an error
   */

      if (selected_ranking_id == 'create') {
        // TODO
        return ctx.editOriginal({
          content: `Create a ranking with ${await commandMention(app, rankings_command_def)}`,
          flags: MessageFlags.Ephemeral,
        })
      }

      if (await hasAdminPerms(app, ctx)) {
        ctx.state.save.admin(1)
      }

      if (selected_ranking_id) {
        var ranking = await app.db.rankings.get(parseInt(selected_ranking_id))
      } else {
        const guild = await getOrAddGuild(app, interaction.guild_id)
        const rankings = await guild.guildRankings()
        if (rankings.length == 1) {
          ranking = rankings[0].ranking
        } else if (rankings.length == 0) {
          throw new UserError(
            `Please specify a ranking to record the match for. ` +
              `Create a ranking with ${await commandMention(app, rankings_command_def)}`,
          )
        } else {
          throw new UserError('Please specify a ranking to record the match for')
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
          interaction.data.options?.find((o) => o.name === options.winner) as
            | APIApplicationCommandInteractionDataUserOption
            | undefined
        )?.value
        const loser_id = (
          interaction.data.options?.find((o) => o.name === options.loser) as
            | APIApplicationCommandInteractionDataUserOption
            | undefined
        )?.value

        if (winner_id && loser_id) {
          if (ctx.state.is.admin(1)) {
            const winner = await getRegisterPlayer(app, winner_id, ranking)
            const loser = await getRegisterPlayer(app, loser_id, ranking)
            await recordAndScoreNewMatch(app, ranking, [[winner], [loser]], [1, 0])
            return await ctx.editOriginal({
              content: `Recorded match`,
              flags: MessageFlags.Ephemeral,
            })
          } else {
            // prompt all users involved to confirm the match
            // store the selected users to state
            ctx.state.save.flattened_team_user_ids([winner_id, loser_id].map((id) => id.toString()))
            ctx.state.save.selected_winning_team_index(0)
            return await ctx.followup(await usersConfirmingMatchPage(app, ctx))
          }
        }
      }

      // Otherwise, select teams

      return await ctx.editOriginal(await selectTeamPage(app, ctx, false))
    },
  )
}

function unflatten(
  flattened_team_user_ids: string[],
  num_teams: number,
  players_per_team: number,
): string[][] {
  return new Array(num_teams).fill(0).map((_, i) => {
    return flattened_team_user_ids.slice(i * players_per_team, (i + 1) * players_per_team)
  })
}

function update_team(
  flattened_team_user_ids: string[],
  team_index: number,
  selected_user_ids: string[],
  players_per_team: number,
  num_teams: number,
): string[] {
  const result = flattened_team_user_ids.slice()
  if (players_per_team == 1) {
    // selected_user_ids contains one from every team
    assert(selected_user_ids.length == num_teams, 'number of players should match num teams')
    return selected_user_ids.slice()
  } else {
    // selected_user_ids contains all the players for the selected team
    assert(
      selected_user_ids.length == players_per_team,
      'number of players should match players per team',
    )
    result.splice(team_index * players_per_team, players_per_team, ...selected_user_ids)
  }
  return result
}

async function onSelectTeam(
  app: App,
  ctx: ComponentContext<typeof record_match_command_def>,
  selected_user_ids: string[],
): Promise<ChatInteractionResponse> {
  const ranking = await app.db.rankings.get(nonNullable(ctx.state.data.ranking_id, 'ranking_id'))
  const players_per_team = nonNullable(ranking.data.players_per_team, 'players_per_team')
  const num_teams = nonNullable(ranking.data.num_teams, 'num_teams')

  // make a copy of players so we don't mutate the state
  const current_user_ids =
    ctx.state.data.flattened_team_user_ids?.slice() ||
    new Array(num_teams * players_per_team).fill(placeholder_user_id)

  const selected_team = nonNullable(ctx.state.data.selected_team, 'selected_team')

  ctx.state.save.flattened_team_user_ids(
    update_team(current_user_ids, selected_team, selected_user_ids, players_per_team, num_teams),
  )

  const all_teams_selected =
    ctx.state.data.flattened_team_user_ids?.every((p) => p != placeholder_user_id) || false

  return {
    type: InteractionResponseType.UpdateMessage,
    data: await selectTeamPage(app, ctx, all_teams_selected),
  }
}

async function selectTeamPage(
  app: App,
  ctx: Context<typeof record_match_command_def>,
  all_teams_selected: boolean,
): Promise<APIInteractionResponseCallbackData> {
  let components: APIActionRowComponent<APIMessageActionRowComponent>[] = []
  const players_per_team = nonNullable(ctx.state.data.players_per_team, 'players_per_team')
  const num_teams = nonNullable(ctx.state.data.num_teams, 'num_teams')
  if (players_per_team == 1) {
    components = [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.UserSelect,
            placeholder: `Players`,
            custom_id: ctx.state.set.selected_team(0).set.clicked_component('select team').encode(),
            min_values: num_teams,
            max_values: num_teams,
          },
        ],
      },
    ]
  } else {
    components = new Array(num_teams).fill(0).map((_, i) => {
      return {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.UserSelect,
            placeholder: `Team ${i + 1}`,
            custom_id: ctx.state.set.selected_team(i).set.clicked_component('select team').encode(),
            min_values: players_per_team,
            max_values: players_per_team,
          },
        ],
      }
    })
  }

  components.push({
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.Button,
        label: 'Confirm',
        style: ButtonStyle.Success,
        custom_id: ctx.state.set.clicked_component('confirm teams').encode(),
        disabled: !all_teams_selected,
      },
    ],
  })

  return {
    content: '',
    components,
    flags: MessageFlags.Ephemeral,
  }
}

async function selectOutcomeAndConfirmPage(
  ctx: ComponentContext<typeof record_match_command_def>,
  app: App,
): Promise<APIInteractionResponseCallbackData> {
  const players_per_team = nonNullable(ctx.state.data.players_per_team, 'players_per_team')
  const num_teams = nonNullable(ctx.state.data.num_teams, 'num_teams')
  const flattened_user_ids = nonNullable(
    ctx.state.data.flattened_team_user_ids,
    'flattened_user_ids',
  )
  const interaction = checkGuildInteraction(ctx.interaction)

  // find the name of the users in the match
  const all_player_names = await Promise.all(
    flattened_user_ids.map(async (user_id) => {
      const member = await app.bot.getGuildMember(interaction.guild_id, user_id)
      return member.nick || member.user!.username // "The field user won't be included in the member object attached to MESSAGE_CREATE and MESSAGE_UPDATE gateway events."
    }),
  )

  // take the first user name from each team as the team name
  const team_names = all_player_names.filter((_, i) => i % players_per_team == 0)

  sentry.debug(
    'selected winning team index',
    ctx.state.data.selected_winning_team_index,
    !ctx.state.data.selected_winning_team_index,
  )

  const data: APIInteractionResponseCallbackData = {
    content: ``,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.StringSelect,
            placeholder: 'Select Winning Team',
            custom_id: ctx.state.set.clicked_component('select winner').encode(),
            options: new Array(num_teams).fill(0).map((_, i) => {
              return {
                label: team_names ? team_names[i] : `Team ${i + 1}`,
                value: i.toString(),
                default: ctx.state.is.selected_winning_team_index(i),
              }
            }),
          },
        ],
      },
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            label: 'Confirm',
            style: ButtonStyle.Success,
            custom_id: ctx.state.set.clicked_component('confirm outcome').encode(),
            disabled: ctx.state.data.selected_winning_team_index === undefined,
          },
        ],
      },
    ],
    flags: MessageFlags.Ephemeral,
  }

  return data
}

function onConfirmOutcomeBtn(
  app: App,
  ctx: ComponentContext<typeof record_match_command_def>,
): ChatInteractionResponse {
  return ctx.defer(
    {
      type: InteractionResponseType.DeferredMessageUpdate,
    },
    async (ctx) => {
      if (ctx.state.is.admin(1)) {
        return await ctx.editOriginal(await confirmMatch(app, ctx))
      } else {
        // prompt all users involved to confirm the match
        // store the selected users to state
        return await ctx.followup(await usersConfirmingMatchPage(app, ctx))
      }
    },
  )
}

const placeholder_user_id = '0'

async function onUserConfirmOrCancelBtn(
  app: App,
  ctx: ComponentContext<typeof record_match_command_def>,
): Promise<ChatInteractionResponse> {
  const interaction = checkGuildInteraction(ctx.interaction)
  const user_id = interaction.member.user.id

  // find which user is confirming/cancelling
  const flattened_user_ids = nonNullable(
    ctx.state.data.flattened_team_user_ids,
    'flattened_team_users',
  )

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

  return {
    type: InteractionResponseType.UpdateMessage,
    data: await usersConfirmingMatchPage(app, ctx),
  }
}

async function usersConfirmingMatchPage(
  app: App,
  ctx: Context<typeof record_match_command_def>,
): Promise<APIInteractionResponseCallbackData> {
  const interaction = checkGuildInteraction(ctx.interaction)
  const flattened_user_ids = nonNullable(
    ctx.state.data.flattened_team_user_ids,
    'flattened_team_users',
  )

  const players_per_team = nonNullable(ctx.state.data.players_per_team, 'players_per_team')
  const num_teams = nonNullable(ctx.state.data.num_teams, 'num_teams')

  // take the first user name from each team as the team name
  const winner_index = nonNullable(ctx.state.data.selected_winning_team_index, 'winner_index')

  const ranking = await app.db.rankings.get(nonNullable(ctx.state.data.ranking_id, 'ranking'))
  const embed: APIEmbed = {
    title: `New Match`,
    description: `<@${interaction.member.user.id}> wants to record a match in **${ranking.data.name}**. All players must confirm.`,
    fields: new Array(num_teams)
      .fill(0)
      .map((_, i) => {
        return {
          name: `Team ${i + 1}` + (i == winner_index ? ' (WINNER)' : ''),
          value: unflatten(flattened_user_ids, num_teams, players_per_team)
            [i].map((user_id) => `<@${user_id}>`)
            .join(players_per_team == 1 ? ', ' : '\n'),
        } as APIEmbedField
      })
      .concat([
        {
          name: 'Confirmed Players',
          value: (ctx.state.data.users_confirmed ?? new Array(flattened_user_ids.length).fill('0'))
            .map((c, i) => {
              return c == 'y' ? `<@${flattened_user_ids[i]}>` : ''
            })
            .join('\n'),
        },
      ]),
  }

  const components: APIActionRowComponent<APIMessageActionRowComponent>[] = [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          label: 'Confirm',
          style: ButtonStyle.Success,
          custom_id: ctx.state.set.clicked_component('match user confirm').encode(),
        },
        {
          type: ComponentType.Button,
          label: 'Cancel',
          style: ButtonStyle.Danger,
          custom_id: ctx.state.set.clicked_component('match user cancel').encode(),
        },
      ],
    },
  ]

  const data: APIInteractionResponseCallbackData = {
    content: 'confirm outcome',
    embeds: [embed],
    components,
    allowed_mentions: { users: flattened_user_ids },
  }

  return data
}

async function confirmMatch(
  app: App,
  ctx: Context<typeof record_match_command_def>,
): Promise<APIInteractionResponseCallbackData> {
  const players_per_team = nonNullable(ctx.state.data.players_per_team, 'players_per_team')
  const num_teams = nonNullable(ctx.state.data.num_teams, 'num_teams')

  const current_user_ids = nonNullable(
    ctx.state.data.flattened_team_user_ids,
    'flattened_team_users',
  )

  assert(
    current_user_ids.every((p) => p != placeholder_user_id),
    'not all teams have been selected',
  )

  const relative_scores = new Array(num_teams)
    .fill(0)
    .map((_, i) =>
      i == nonNullable(ctx.state.data.selected_winning_team_index, 'selected_winning_team_index')
        ? 1
        : 0,
    )

  const ranking = await app.db.rankings.get(nonNullable(ctx.state.data.ranking_id, 'ranking_id'))
  // register all the players
  const team_players = await Promise.all(
    unflatten(current_user_ids, num_teams, players_per_team).map(async (user_ids) => {
      return await Promise.all(user_ids.map((user_id) => getRegisterPlayer(app, user_id, ranking)))
    }),
  )

  await recordAndScoreNewMatch(app, ranking, team_players, relative_scores)

  const embed: APIEmbed = {
    title: `Match recorded`,
    description: `**${ranking.data.name}**`,
    fields: [
      {
        name: 'Teams',
        value: team_players
          .map((team) => {
            return team
              .map((player) => `<@${player.data.user_id}>`)
              .join(players_per_team == 1 ? ', ' : '\n')
          })
          .join('\n\n'),
      },
      {
        name: 'Outcome',
        value: relative_scores
          .map((score, i) => {
            return `${i}: ${score}`
          })
          .join('\n'),
      },
    ],
    color: Colors.Primary,
  }

  return {
    content: `Recorded match`,
    components: [],
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  }
}
