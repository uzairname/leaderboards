import * as D from 'discord-api-types/v10'
import { CommandView } from '../../../../../../discord-framework'
import { nonNullable } from '../../../../../../utils/utils'
import { AppView } from '../../../../../app/ViewModule'
import { Colors } from '../../../../ui-helpers/constants'
import { ensureAdminPerms } from '../../../../ui-helpers/perms'
import {
  createNewRankingInGuild,
  default_players_per_team,
  default_teams_per_match,
} from '../../manage-rankings'
import { rankingSettingsPage } from '../pages/ranking-settings-page'

export const create_ranking_cmd_signature = new CommandView({
  name: 'create-ranking',
  type: D.ApplicationCommandType.ChatInput,
  description: 'Create a new ranking',
  guild_only: true,
})

export default new AppView(create_ranking_cmd_signature, app =>
  new CommandView({
    ...create_ranking_cmd_signature.config,
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
      app.config.features.AllowNon1v1
        ? [
            {
              name: 'num-teams',
              description: `Number of teams per match. Default ${default_teams_per_match}`,
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
    await ensureAdminPerms(app, ctx)

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
        const { ranking } = await createNewRankingInGuild(app, ctx.interaction.guild_id, {
          name: nonNullable(options['name'], 'options.name'),
          teams_per_match: options['num-teams']
            ? parseInt(options['num-teams'])
            : default_teams_per_match,
          players_per_team: options['players-per-team']
            ? parseInt(options['players-per-team'])
            : default_players_per_team,
        })

        await ctx.followup({
          embeds: [
            {
              description:
                `New ranking created: **${ranking.data.name}**` +
                `\nNext, you can configure additional settings for this ranking below`,
              color: Colors.Success,
            },
          ],
        })

        await ctx.followup(await rankingSettingsPage({ app, ctx, ranking_id: ranking.data.id }))
      },
    )
  }),
)
