import { CommandSignature, getOptions } from '@repo/discord'
import { nonNullable } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { Colors, escapeMd } from '../../../utils'
import { ensureAdminPerms } from '../../../utils/perms'
import { createNewRankingInGuild } from '../manage'
import { default_players_per_team, default_teams_per_match } from '../properties'
import { RankingSettingsPages } from './ranking-settings/pages'
import { ranking_settings_view_sig } from './ranking-settings/view'

export const create_ranking_cmd_sig = new CommandSignature({
  name: 'create-ranking',
  type: D.ApplicationCommandType.ChatInput,
  description: 'Create a new ranking',
  guild_only: true,
  options: [
    {
      name: 'name',
      description: 'Name of the ranking',
      type: D.ApplicationCommandOptionType.String,
      required: true,
    },
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
  ],
})

export const create_ranking_cmd = create_ranking_cmd_sig.set<App>({
  onCommand: async (ctx, app) => {
    return ctx.defer(async ctx => {
      await ensureAdminPerms(app, ctx)

      const options = getOptions(ctx.interaction, {
        name: { type: D.ApplicationCommandOptionType.String, required: true },
        'teams-per-match': { type: D.ApplicationCommandOptionType.Integer },
        'players-per-team': { type: D.ApplicationCommandOptionType.Integer },
      })

      const tpm = options['teams-per-match'] ?? default_teams_per_match
      const ppt = options['players-per-team'] ?? default_players_per_team

      if (!app.config.features.AllowNon1v1 && (tpm > 2 || ppt > 1))
        throw new Error(`Only 1v1 rankings are supported for now`)

      const { ranking } = await createNewRankingInGuild(app, ctx.interaction.guild_id, {
        name: nonNullable(options['name'], 'options.name'),
        teams_per_match: tpm,
        players_per_team: ppt,
      })

      await ctx.followup({
        embeds: [
          {
            description:
              `New ranking created: **${escapeMd(ranking.data.name)}**` +
              `\nNext, you can configure additional settings for this ranking below`,
            color: Colors.Success,
          },
        ],
      })

      await RankingSettingsPages.main(app, {
        ...ctx,
        state: ranking_settings_view_sig.newState({
          ranking_id: ranking.data.id,
        }),
      })
    })
  },
})
