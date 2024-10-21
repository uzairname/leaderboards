import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../discord-framework'
import { App } from '../../../../../context/app_context'
import { AppView } from '../../../../utils/view_module'
import { default_num_teams, default_players_per_team } from '../../manage_rankings'
import { create_ranking_view, createRankingPageResponseData } from '../pages/create_ranking'

export default new AppView((app: App) =>
  new AppCommand({
    name: 'create-ranking',
    type: D.ApplicationCommandType.ChatInput,
    description: 'Create a new ranking',
    options: [
      {
        name: 'name',
        description: 'Name of the ranking (you can rename later)',
        type: D.ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'num-teams',
        description: `Number of teams per match. Default ${default_num_teams}`,
        type: D.ApplicationCommandOptionType.Integer,
      },
      {
        name: 'players-per-team',
        description: `Number of players per team. Default ${default_players_per_team}`,
        type: D.ApplicationCommandOptionType.Integer,
      },
    ],
  }).onCommand(async ctx => {
    const options: { [key: string]: string } = {}
    ;(
      ctx.interaction.data.options as D.APIApplicationCommandInteractionDataStringOption[]
    )?.forEach(o => {
      options[o.name] = o.value
    })

    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: D.MessageFlags.Ephemeral },
      },
      async ctx => {
        return void ctx.followup(
          await createRankingPageResponseData(app, {
            interaction: ctx.interaction,
            state: create_ranking_view.newState({
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
