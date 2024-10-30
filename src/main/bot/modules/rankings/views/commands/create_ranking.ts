import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../discord-framework'
import { sentry } from '../../../../../../logging/sentry'
import { nonNullable } from '../../../../../../utils/utils'
import { AppView } from '../../../../../app/ViewModule'
import { Colors } from '../../../../helpers/constants'
import { checkGuildInteraction, ensureAdminPerms } from '../../../../helpers/perms'
import { getOrAddGuild } from '../../../guilds/guilds'
import { syncMatchesChannel } from '../../../matches/matches_channel'
import {
  createNewRankingInGuild,
  default_num_teams,
  default_players_per_team,
} from '../../manage_rankings'
import { ranking_settings_page_config, rankingSettingsPage } from '../pages/ranking_settings'

export const create_ranking_cmd_signature = new AppCommand({
  name: 'create-ranking',
  type: D.ApplicationCommandType.ChatInput,
  description: 'Create a new ranking',
})

export default new AppView(create_ranking_cmd_signature, app =>
  new AppCommand({
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
    await ensureAdminPerms(app, ctx)
    const interaction = checkGuildInteraction(ctx.interaction)

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
        const guild = await getOrAddGuild(app, interaction.guild_id)

        await syncMatchesChannel(app, guild)

        const ranking = await createNewRankingInGuild(app, guild, {
          name: nonNullable(options['name'], 'options.name'),
          num_teams: options['num-teams'] ? parseInt(options['num-teams']) : default_num_teams,
          players_per_team: options['players-per-team']
            ? parseInt(options['players-per-team'])
            : default_players_per_team,
        })

        sentry.debug(`new ranking. ${ranking.new_guild_ranking.data.leaderboard_message_id}`)

        await ctx.followup({
          embeds: [
            {
              description:
                `New ranking created: **${ranking.new_ranking.data.name}**` +
                `\nNext, you can configure additional settings for this ranking below`,
              color: Colors.Success,
            },
          ],
        })

        await ctx.followup(
          await rankingSettingsPage(app, {
            state: ranking_settings_page_config.newState({
              guild_id: guild.data.id,
              ranking_id: ranking.new_ranking.data.id,
            }),
          }),
        )
      },
    )
  }),
)
