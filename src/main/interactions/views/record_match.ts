import {
  APIActionRowComponent,
  APIApplicationCommandInteractionDataStringOption,
  APIApplicationCommandInteractionDataUserOption,
  APIEmbed,
  APIMessageActionRowComponent,
  APIMessageSelectMenuInteractionData,
  APIMessageStringSelectInteractionData,
  APIMessageUserSelectInteractionData,
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
  ComponentContext,
  CommandView,
  BaseContext,
  ChatInteraction,
  ChatInteractionResponse,
} from '../../../discord-framework'
import { assert, assertValue } from '../../../utils/utils'
import { sentry } from '../../../request/sentry'

import { App } from '../../../main/app/app'
import { getOrAddGuild } from '../../../main/modules/guilds'

import { UserError } from '../../../main/app/errors'
import { checkGuildInteraction } from '../utils/checks'
import { rankingsAutocomplete } from '../utils/common'
import { getRegisterPlayer } from '../../../main/modules/players'
import rankings from './rankings'
import { finishMatch } from '../../modules/matches'
import { Ranking } from '../../../database/models'
import { Colors } from '../../../main/messages/message_pieces'
import { checkInteractionMemberPerms } from '../utils/checks'

const record_match_command = new CommandView({
  type: ApplicationCommandType.ChatInput,
  command: {
    name: 'record-match',
    description: 'record a match',
    options: [
      {
        name: 'winner',
        description: 'winner',
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      {
        name: 'loser',
        description: 'loser',
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      {
        name: 'ranking',
        description: 'ranking to record match for',
        type: ApplicationCommandOptionType.String,
        required: false,
        autocomplete: true,
      },
    ],
  },
  custom_id_prefix: 'rm',
  state_schema: {
    clicked_component: new ChoiceField({
      'select team': null,
      'confirm teams': null,
      'select outcome': null,
      'confirm match': null,
    }),
    selected_team: new NumberField(),
    selected_winning_team_index: new NumberField(),
    users: new ListField(),
    ranking_id: new NumberField(),
  },
})

export default (app: App) =>
  record_match_command
    .onAutocomplete(rankingsAutocomplete(app))

    .onCommand(async (ctx) => {
      const interaction = checkGuildInteraction(ctx.interaction)
      const selected_ranking_id = (
        interaction.data.options?.find((o) => o.name === 'ranking') as
          | APIApplicationCommandInteractionDataStringOption
          | undefined
      )?.value

      // TODO return a page from another command
      if (selected_ranking_id == 'create') {
        return await rankings(app).sendToCommandInteraction(ctx, {
          owner_id: interaction.member.user.id,
          page: 'creating new',
        })
      }

      ctx.offload(async (ctx) => {
        /*Save the selected ranking id to the state. 
        If the ranking was not specified, try to use the only ranking in the guild. 
        If not and there is more than one ranking, throw an error
       */
        if (selected_ranking_id) {
          var ranking = await app.db.rankings.get(parseInt(selected_ranking_id))
        } else {
          const guild = await getOrAddGuild(app, interaction.guild_id)
          const rankings = await guild.guildRankings()
          if (rankings.length == 1) {
            ranking = rankings[0].ranking
          } else {
            throw new UserError('Please specify a ranking to record the match for')
          }
        }

        ctx.state.save.ranking_id(ranking.data.id)

        const players_per_team = ranking.data.players_per_team
        const num_teams = ranking.data.num_teams
        assertValue(players_per_team, 'players_per_team')
        assertValue(num_teams, 'num_teams')
        if (players_per_team == 1 && num_teams == 2) {
          // If this is a 1v1 ranking, check if the winner and loser were specified

          const winner_id = (
            interaction.data.options?.find((o) => o.name === 'winner') as
              | APIApplicationCommandInteractionDataUserOption
              | undefined
          )?.value
          const loser_id = (
            interaction.data.options?.find((o) => o.name === 'loser') as
              | APIApplicationCommandInteractionDataUserOption
              | undefined
          )?.value

          if (winner_id && loser_id) {
            const winner = await getRegisterPlayer(app, winner_id, ranking)
            const loser = await getRegisterPlayer(app, loser_id, ranking)

            sentry.debug('winner id', winner.data.id)
            sentry.debug('loser id', loser.data.id)

            await confirmMatch(ctx, app, ranking, [[winner.data.id], [loser.data.id]], [1, 0])

            return await ctx.editOriginal({
              content: `Recorded match.`,
              flags: MessageFlags.Ephemeral,
            })
          }
        }

        // Otherwise, select teams
        return await ctx.editOriginal({
          content: '',
          components: await selectTeamComponents(app, ctx),
          flags: MessageFlags.Ephemeral,
        })
      })

      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: `Please wait`,
          flags: MessageFlags.Ephemeral,
        },
      }
    })

    .onComponent(async (ctx) => {
      assertValue(ctx.state.data.ranking_id, 'ranking_id')
      const ranking = await app.db.rankings.get(ctx.state.data.ranking_id)
      const players_per_team = ranking.data.players_per_team
      const num_teams = ranking.data.num_teams

      assertValue(players_per_team, 'players_per_team')
      assertValue(num_teams, 'num_teams')

      if (ctx.state.data.clicked_component == 'select team') {
        const data = ctx.interaction.data as unknown as APIMessageUserSelectInteractionData
        const selected_user_ids = data.values

        // make a copy of players so we don't mutate the state
        let current_users =
          ctx.state.data.users?.slice() ||
          new Array(num_teams * players_per_team).fill(placeholder_user_id)

        assertValue(ctx.state.data.selected_team, 'selected_team')

        // Update the players for the selected team
        if (players_per_team == 1) {
          current_users = selected_user_ids
        } else {
          for (let i = 0; i < players_per_team; i++) {
            current_users[ctx.state.data.selected_team * players_per_team + i] =
              selected_user_ids[i]
          }
        }

        ctx.state.save.users(current_users)

        if (current_users.every((p) => p != placeholder_user_id)) {
          // if all teams have been selected
          assertValue(ranking.data.num_teams, 'num_teams')

          return {
            type: InteractionResponseType.UpdateMessage,
            data: {
              content: '',
              components: await selectTeamComponents(app, ctx, true),
              flags: MessageFlags.Ephemeral,
            },
          }
        } else {
          return {
            type: InteractionResponseType.UpdateMessage,
            data: {
              components: await selectTeamComponents(app, ctx),
              flags: MessageFlags.Ephemeral,
            },
          }
        }
      } else if (ctx.state.is.clicked_component('confirm teams')) {
        // Allow the user to select the outcome of the match.
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            components: await selectOutcomeComponents(ctx, app, num_teams, players_per_team),
            flags: MessageFlags.Ephemeral,
          },
        }
      } else if (ctx.state.is.clicked_component('select outcome')) {
        const data = ctx.interaction.data as unknown as APIMessageStringSelectInteractionData
        ctx.state.save.selected_winning_team_index(parseInt(data.values[0]))

        return {
          type: InteractionResponseType.UpdateMessage,
          data: {
            components: await selectOutcomeComponents(ctx, app, num_teams, players_per_team),
            flags: MessageFlags.Ephemeral,
          },
        }
      } else if (ctx.state.is.clicked_component('confirm match')) {
        return await onConfirmMatch(app, ctx, ranking, num_teams, players_per_team)
      }
    })

async function selectTeamComponents(
  app: App,
  ctx: BaseContext<typeof record_match_command>,
  confirm_teams = false,
): Promise<APIActionRowComponent<APIMessageActionRowComponent>[]> {
  assertValue(ctx.state.data.ranking_id, 'ranking_id')
  const ranking = await app.db.rankings.get(ctx.state.data.ranking_id)

  const players_per_team = ranking.data.players_per_team
  assertValue(players_per_team, 'players_per_team')

  const num_teams = ranking.data.num_teams
  assertValue(num_teams, 'num_teams')

  let components: APIActionRowComponent<APIMessageActionRowComponent>[] = []
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

  if (confirm_teams) {
    components.push({
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          label: 'Confirm',
          style: ButtonStyle.Success,
          custom_id: ctx.state.set.clicked_component('confirm teams').encode(),
        },
      ],
    })
  }

  return components
}

async function selectOutcomeComponents(
  ctx: ComponentContext<typeof record_match_command>,
  app: App,
  num_teams: number,
  players_per_team: number,
): Promise<APIActionRowComponent<APIMessageActionRowComponent>[]> {
  const all_users = ctx.state.data.users
  assertValue(all_users, 'all_players')
  const interaction = checkGuildInteraction(ctx.interaction)

  // find the name of the users in the match
  const all_player_names = await Promise.all(
    all_users.map(async (user_id) => {
      const member = await app.bot.getGuildMember(interaction.guild_id, user_id)
      return member.nick || member.user!.username // "The field user won't be included in the member object attached to MESSAGE_CREATE and MESSAGE_UPDATE gateway events."
    }),
  )

  // take the first user name from each team as the team name
  const team_names = all_player_names.filter((_, i) => i % players_per_team == 0)

  return [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          placeholder: 'Winner',
          custom_id: ctx.state.set.clicked_component('select outcome').encode(),
          options: new Array(num_teams).fill(0).map((_, i) => {
            return {
              label: team_names ? team_names[i] : `Team ${i + 1}`,
              value: i.toString(),
              default: ctx.state.data.selected_winning_team_index == i,
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
          custom_id: ctx.state.set.clicked_component('confirm match').encode(),
        },
      ],
    },
  ]
}

async function onConfirmMatch(
  app: App,
  ctx: ComponentContext<typeof record_match_command>,
  ranking: Ranking,
  num_teams: number,
  players_per_team: number,
): Promise<ChatInteractionResponse> {
  ctx.offload(async (ctx) => {
    const current_user_ids = ctx.state.data.users
    assertValue(current_user_ids, 'current_users')
    assert(
      current_user_ids.every((p) => p != placeholder_user_id),
      'not all teams have been selected',
    )
    const c = current_user_ids

    const player_teams = await Promise.all(
      new Array(num_teams).fill(0).map(async (_, i) => {
        return (
          await Promise.all(
            c.slice(i * players_per_team, (i + 1) * players_per_team).map((user_id) => {
              return getRegisterPlayer(app, user_id, ranking)
            }),
          )
        ).map((p) => p.data.id)
      }),
    )

    assertValue(ctx.state.data.selected_winning_team_index, 'selected_winner')
    const relative_scores = new Array(num_teams)
      .fill(0)
      .map((_, i) => (i == ctx.state.data.selected_winning_team_index ? 1 : 0))
    sentry.debug('relative scores', relative_scores, 'player teams', num_teams)

    await confirmMatch(ctx, app, ranking, player_teams, relative_scores)

    const embed: APIEmbed = {
      title: `Match recorded`,
      description: `**${ranking.data.name}**`,
      fields: [
        {
          name: 'Teams',
          value: player_teams
            .map((team) => {
              return team
                .map((player_id) => `<@${player_id}>`)
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

    await ctx.editOriginal({
      content: `Recorded match`,
      components: [],
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    })
  })

  return {
    type: InteractionResponseType.UpdateMessage,
    data: {
      content: `Please wait`,
      flags: MessageFlags.Ephemeral,
    },
  }
}

const placeholder_user_id = '0'

async function confirmMatch(
  ctx: BaseContext<typeof record_match_command>,
  app: App,
  ranking: Ranking,
  player_teams: number[][],
  relative_scores: number[],
): Promise<void> {
  await checkInteractionMemberPerms(app, ctx)
  await finishMatch(app, ranking, player_teams, relative_scores)
}
