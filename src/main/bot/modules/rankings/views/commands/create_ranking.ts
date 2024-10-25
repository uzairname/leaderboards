import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../discord-framework'
import { AppView } from '../../../../utils/ViewModule'
import { default_num_teams, default_players_per_team } from '../../manage_rankings'
import { create_ranking_view, createRankingPageResponseData } from '../pages/create_ranking'

export const create_ranking_cmd_signature = new AppCommand({
  name: 'create-ranking',
  type: D.ApplicationCommandType.ChatInput,
  description: 'Create a new ranking',
})

export default new AppView(create_ranking_cmd_signature, app =>
  new AppCommand({
    ...create_ranking_cmd_signature.signature,
    options: (
      [
        {
          name: 'name',
          description: 'Name of the ranking',
          type: D.ApplicationCommandOptionType.String,
          required: true,
        },
      ] as D.APIApplicationCommandOption[]
    ).concat(
      app.config.features.MultipleTeamsPlayers
        ? [
            {
              name: 'num-teams',
              description: `Number of teams per match. Default ${default_num_teams}`,
              type: D.ApplicationCommandOptionType.Integer,
              required: false,
            },
            {
              name: 'players-per-team',
              description: `Number of players per team. Default ${default_players_per_team}`,
              type: D.ApplicationCommandOptionType.Integer,
              required: false,
            },
          ]
        : [],
    ),
  }).onCommand(async ctx => {
    const options: { [key: string]: string | undefined } = Object.fromEntries(
      (ctx.interaction.data.options as D.APIApplicationCommandInteractionDataStringOption[])?.map(
        o => [o.name, o.value],
      ) ?? [],
    )

    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: D.MessageFlags.Ephemeral },
      },
      async ctx => {
        return void ctx.followup(
          await createRankingPageResponseData(app, {
            interaction: ctx.interaction,
            state: create_ranking_view.createState({
              input_name: options['name'],
              input_num_teams: options['num-teams'] ? parseInt(options['num-teams']) : undefined,
              input_players_per_team: options['players-per-team']
                ? parseInt(options['players-per-team'])
                : undefined,
            }),
          }),
        )
      },
    )
  }),
)
