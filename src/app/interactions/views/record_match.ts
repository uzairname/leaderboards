import {
  APIActionRowComponent,
  APIApplicationCommandInteractionDataStringOption,
  APIApplicationCommandInteractionDataUserOption,
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
} from '../../../discord-framework'
import { assert, assertValue } from '../../../utils/utils'
import { sentry } from '../../../logging/globals'

import { App } from '../../app'
import { getOrAddGuild } from '../../modules/guilds'

import { UserError } from '../../errors'
import { checkGuildInteraction } from '../checks'
import { rankingsAutocomplete } from '../common'
import { getRegisterPlayer } from '../../modules/players'
import rankings from './rankings'
import { check } from 'drizzle-orm/sqlite-core'

const record_match_command = new CommandView({
  type: ApplicationCommandType.ChatInput,
  command: {
    name: 'record-match',
    description: 'record a match',
    options: [
      {
        name: 'ranking',
        description: 'ranking to record match for',
        type: ApplicationCommandOptionType.String,
        required: false,
        autocomplete: true,
      },
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
    selected_winner: new NumberField(),
    users: new ListField(),
    ranking_id: new NumberField(),
  },
})

export default (app: App) =>
  record_match_command
    .onAutocomplete(rankingsAutocomplete(app))

    .onCommand(async (ctx) => {
      const interaction = checkGuildInteraction(ctx.interaction)
      let selected_ranking_id = (
        interaction.data.options?.find((o) => o.name === 'ranking') as
          | APIApplicationCommandInteractionDataStringOption
          | undefined
      )?.value

      // TODO return a page from another command
      if (selected_ranking_id == 'create') {
        let res = await rankings(app).sendToCommandInteraction(ctx, {
          owner_id: interaction.member.user.id,
          page: 'creating new',
        })
        return res
      }

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

          return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: `Recorded match. Winner: ${winner.data.name}, Loser: ${loser.data.name}`,
              flags: MessageFlags.Ephemeral,
            },
          }
        }
      }

      // Otherwise, select teams
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          components: await selectTeamComponents(app, ctx),
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
        let data = ctx.interaction.data as unknown as APIMessageUserSelectInteractionData
        const selected_user_ids = data.values

        // Determine number of players

        // make a copy of players so we don't mutate the state
        let current_users =
          ctx.state.data.users?.slice() || new Array(num_teams * players_per_team).fill('0')

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

        if (current_users.every((p) => p != '0')) {
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
        let data = ctx.interaction.data as unknown as APIMessageStringSelectInteractionData
        ctx.state.save.selected_winner(parseInt(data.values[0]))

        return {
          type: InteractionResponseType.UpdateMessage,
          data: {
            components: await selectOutcomeComponents(ctx, app, num_teams, players_per_team),
            flags: MessageFlags.Ephemeral,
          },
        }
      } else if (ctx.state.is.clicked_component('confirm match')) {
        let current_users = ctx.state.data.users?.slice()
        assertValue(current_users, 'current_users')
        assert(
          current_users.every((p) => p != '0'),
          'not all teams have been selected',
        )
        let c = current_users
        const player_teams = new Array(num_teams).fill(0).map((_, i) => {
          return c.slice(i * players_per_team, (i + 1) * players_per_team).map((user_id) => {
            return getRegisterPlayer(app, user_id, ranking)
          })
        })

        return {
          type: InteractionResponseType.UpdateMessage,
          data: {
            content: `Recorded match ${JSON.stringify(player_teams)}. Winner: ${
              ctx.state.data.selected_winner
            }`,
            flags: MessageFlags.Ephemeral,
          },
        }
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
              default: ctx.state.data.selected_winner == i,
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
