import { PartialRanking } from '@repo/db/models'
import { CommandContext, CommandInteractionResponse, CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { guildRankingsOption, withOptionalSelectedRanking } from '../../../utils/ui/view-helpers/ranking-option'
import { AllRankingsPages } from './all-rankings'
import { RankingSettingsHandlers, RankingSettingsPages } from './ranking-settings'
import { ranking_settings_view_sig } from './ranking-settings/view'
import {  } from '@discordjs/builders'

export const settings_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'settings',
  description: 'Create and edit rankings in this server',
  guild_only: true,
})

export const settings_cmd = settings_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    const guild_rankings = await app.db.guild_rankings.fetchBy({ guild_id: guild.data.id })

    let options = await guildRankingsOption(app, guild, 'ranking', { optional: true })

    // If there is a ranking, include the option to choose the setting
    if (guild_rankings.length > 0) {
      options.push({
        type: D.ApplicationCommandOptionType.String,
        name: 'setting',
        description: 'Which setting to change',
        choices: [
          {
            name: `Customize the rating algorithm`,
            value: `rating`,
          },
          {
            name: `Rename`,
            value: 'rename',
          },
          {
            name: `Matchmaking queue`,
            value: `queue`,
          },
          {
            name: `Delete`,
            value: `delete`,
          }
        ],
      })
    }

    return new CommandSignature({
      ...settings_cmd_sig.config,
      options,
    })
  },

  onCommand: async (ctx, app) => {
    const input = getOptions(ctx.interaction, {
      ranking: { type: D.ApplicationCommandOptionType.Integer },
      setting: { type: D.ApplicationCommandOptionType.String },
    })

    return withOptionalSelectedRanking(
      {
        app,
        ctx,
        ranking_id: input.ranking,
      },
      async ranking => {
        if (ranking) {
          const setting_option_value = input.setting
          if (setting_option_value) {
            return routeToSettingPage(app, ctx, ranking, setting_option_value)
          } else {
            return ctx.defer(
              async ctx =>
                await RankingSettingsPages.main(app, {
                  ...ctx,
                  state: ranking_settings_view_sig.newState({
                    ranking_id: ranking.data.id,
                  }),
                }),
            )
          }
        } else {
          return {
            type: D.InteractionResponseType.ChannelMessageWithSource,
            data: await AllRankingsPages.main(app, ctx),
          }
        }
      },
    )
  },
})

/**
 * Redirects to the appropriate setting page, based on the selected setting option.
 */
async function routeToSettingPage(
  app: App,
  ctx: CommandContext<typeof settings_cmd_sig>,
  ranking: PartialRanking,
  setting: string,
): Promise<CommandInteractionResponse> {
  const new_ctx = {
    ...ctx,
    state: ranking_settings_view_sig.newState({
      ranking_id: ranking.data.id,
    }),
  }

  switch (setting) {
    case 'rename':
      return await RankingSettingsHandlers.renameModal(app, new_ctx)
    case 'queue':
      return ctx.defer(async ctx => {
        await ctx.edit(await RankingSettingsPages.queue(app, new_ctx))
      })
    case 'rating':
      return ctx.defer(async ctx => {
        await ctx.edit(await RankingSettingsPages.scoringMethod(app, new_ctx))
      })
  }

  throw new Error(`Unknwn setting ${setting}`)
}
