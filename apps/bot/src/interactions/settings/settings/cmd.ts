import {} from '@discordjs/builders'
import { PartialRanking } from '@repo/db/models'
import { CommandContext, CommandInteractionResponse, CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { SettingsPages } from '.'
import { App } from '../../../setup/app'
import { guildRankingsOption, withOptionalSelectedRanking } from '../../utils/ranking-option'
import { RankingSettingsPages } from '../ranking-settings'
import * as RankingSettingsHandlers from '../ranking-settings/handlers'
import { ranking_settings_view_sig } from '../ranking-settings/view'

export const settings_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'settings',
  description: 'Create and edit rankings in this server',
  guild_only: true,
})

export const settings_cmd = settings_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    const guild_rankings = await app.db.guild_rankings.fetch({ guild_id: guild.data.id })

    let options = await guildRankingsOption(app, guild, 'ranking', { optional: true })

    // If there is a ranking, include the option to choose the setting
    if (guild_rankings.length > 0) {
      options.push({
        type: D.ApplicationCommandOptionType.String,
        name: 'setting',
        description: 'Which setting to change',
        choices: [
          {
            name: `Rename`,
            value: 'rename',
          },
          {
            name: `Matchmaking`,
            value: `match`,
          },
          {
            name: `Rank Roles`,
            value: `rank-roles`,
          },
          {
            name: `Scoring`,
            value: `rating`,
          },
          {
            name: `Delete`,
            value: `delete`,
          },
        ],
      })
    }

    return new CommandSignature({
      ...settings_cmd_sig.config,
      options,
    })
  },

  onCommand: async (ctx, app) => {
    const { options } = getOptions(ctx.interaction, {
      ranking: { type: D.ApplicationCommandOptionType.Integer },
      setting: { type: D.ApplicationCommandOptionType.String },
    })
    return withOptionalSelectedRanking(
      {
        app,
        ctx,
        ranking_id: options.ranking,
      },
      async ranking => {
        // If a ranking was selected, redirect to the appropriate settings page
        if (ranking) {
          const setting_option_value = options.setting
          return await sendSettingsPage(app, ctx, ranking, setting_option_value)
        } else {
          return ctx.defer(async ctx => void (await ctx.edit(await SettingsPages.main(app, ctx))))
        }
      },
    )
  },
})

/**
 * Redirects to the appropriate setting page, based on the selected setting option.
 */
async function sendSettingsPage(
  app: App,
  ctx: CommandContext<typeof settings_cmd_sig, App>,
  ranking: PartialRanking,
  setting?: string,
): Promise<CommandInteractionResponse> {
  const new_ctx = {
    ...ctx,
    state: ranking_settings_view_sig.newState({
      ranking_id: ranking.data.id,
    }),
  }

  if (!setting) {
    return ctx.defer(
      async ctx =>
        void (await ctx.edit(
          await RankingSettingsPages.main(app, {
            ...ctx,
            state: ranking_settings_view_sig.newState({
              ranking_id: ranking.data.id,
            }),
          }),
        )),
    )
  }

  switch (setting) {
    case 'rename':
      return await RankingSettingsHandlers.sendRenameModal(app, new_ctx)
    case 'rating':
      return ctx.defer(async ctx => void (await ctx.edit(await RankingSettingsPages.scoringSettings(app, new_ctx))))
    case 'delete':
      return ctx.defer(async ctx => void (await ctx.edit(await RankingSettingsPages.deleteConfirm(app, new_ctx))))
    case 'rank-roles':
      return ctx.defer(async ctx => void (await ctx.edit(await RankingSettingsPages.rankRolesSettings(app, new_ctx))))
    case 'match':
      return ctx.defer(async ctx => void (await ctx.edit(await RankingSettingsPages.matchSettings(app, new_ctx))))
  }

  throw new Error(`Unknwn setting ${setting}`)
}
