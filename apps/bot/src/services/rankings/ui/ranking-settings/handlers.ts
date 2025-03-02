import { ChatInteractionResponse, ComponentContext, Context, getModalSubmitEntries } from '@repo/discord'
import { intOrUndefined, strOrUndefined } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { RankingSettingsPages } from '.'
import { UserErrors } from '../../../../errors/user-errors'
import { App } from '../../../../setup/app'
import { parseColor } from '../../../../utils'
import { ensureAdminPerms } from '../../../../utils/perms'
import { escapeMd } from '../../../../utils/ui'
import { disableGuildRankingLbMessage, syncGuildRankingLbMessage } from '../../../leaderboard/manage'
import { rescoreAllMatches } from '../../../matches/scoring/score_match'
import { deleteRanking, updateGuildRanking, updateRanking } from '../../manage'
import { parseRatingStrategy, rating_strategy_to_rating_settings } from '../../properties'
import { AllRankingsPages } from '../all-rankings'
import { settingsOptions } from './common'
import { rankingSettingsModal } from './modals'
import { ranking_settings_view_sig } from './view'

export async function sendMainPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => void ctx.edit(await RankingSettingsPages.main(app, ctx)))
}

export async function onSettingSelect(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  const gr = await app.db.guild_rankings.fetchBy({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })
  const selected_option = (ctx.interaction.data as D.APIMessageStringSelectInteractionData).values[0]
  const setting = settingsOptions(gr)[selected_option]
  if (!setting) return ctx.defer(async () => void 0)
  return setting.handler(app, ctx)
}

export async function renameModal(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<D.APIModalInteractionResponse> {
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

  const modal = rankingSettingsModal({
    name: { ph: ranking.data.name },
  })
    .setTitle(`Rename ${ranking.data.name}`)
    .setCustomId(ctx.state.set.handler(onSettingsModalSubmit).cId())

  return {
    type: D.InteractionResponseType.Modal,
    data: modal.toJSON(),
  }
}

/**
 * When either a rename or settings modal is submitted
 */
export async function onSettingsModalSubmit(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    await ensureAdminPerms(app, ctx)

    const { guild_ranking, ranking } = await app.db.guild_rankings.fetchBy({
      guild_id: ctx.interaction.guild_id,
      ranking_id: ctx.state.get.ranking_id(),
    })

    const modal_input = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)

    const new_name = strOrUndefined(modal_input['name']?.value)
    const new_best_of = intOrUndefined(modal_input['best_of']?.value)
    const color_input = strOrUndefined(modal_input['color']?.value)

    // If any setings that apply to the ranking are specified, update them
    if (new_name || new_best_of) {
      const new_matchmaking_settings = {
        ...ranking.data.matchmaking_settings,
        default_best_of: new_best_of ?? ranking.data.matchmaking_settings.default_best_of,
      }

      await updateRanking(app, ranking, {
        name: new_name,
        matchmaking_settings: new_matchmaking_settings,
      })
    }

    // If any settings that apply to the guild ranking are specified, update them
    if (color_input) {
      // Validate color

      const valid_color = parseColor(color_input)
      if (!valid_color) throw new UserErrors.ValidationError('Color must contain a hex code, like ff0000')

      await updateGuildRanking(app, guild_ranking, {
        display_settings: {
          ...guild_ranking.data.display_settings,
          color: valid_color ?? guild_ranking.data.display_settings?.color,
        },
      })
    }

    // If we were on a page, go back to it
    if (ctx.state.data.page) {
      return void ctx.edit(await ctx.state.data.page(app, ctx))
    }

    return void (await ctx.edit(await RankingSettingsPages.main(app, ctx)))
  })
}

export async function onToggleLiveLeaderboard(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)

  return ctx.defer(async ctx => {
    const { guild_ranking } = await app.db.guild_rankings.fetchBy({
      guild_id: ctx.interaction.guild_id,
      ranking_id: ctx.state.get.ranking_id(),
    })

    // send and enable the leaderboard message if it's disabled
    if (guild_ranking.data.display_settings?.leaderboard_message) {
      await disableGuildRankingLbMessage(app, guild_ranking)
      await ctx.followup({
        content: `The leaderboard message will no longer be updated live`,
        flags: D.MessageFlags.Ephemeral,
      })
    } else {
      await syncGuildRankingLbMessage(app, guild_ranking, { enable_if_disabled: true })
      await ctx.followup({
        content: `The leaderboard message will now be updated live`,
        flags: D.MessageFlags.Ephemeral,
      })
    }

    return void ctx.edit(await RankingSettingsPages.main(app, ctx))
  })
}

export async function onToggleChallenge(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)
  return ctx.defer(async ctx => {
    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

    const matchmaking_settings = ranking.data.matchmaking_settings

    await updateRanking(app, ranking, {
      matchmaking_settings: {
        ...matchmaking_settings,
        direct_challenge_enabled: !matchmaking_settings?.direct_challenge_enabled,
      },
    })

    return void ctx.edit(await RankingSettingsPages.main(app, ctx))
  })
}

export async function sendQueueSettingsPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => void (await ctx.edit(await RankingSettingsPages.queue(app, ctx))))
}

export async function onToggleQueue(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)
  return ctx.defer(async ctx => {
    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
    const matchmaking_settings = ranking.data.matchmaking_settings

    await updateRanking(app, ranking, {
      matchmaking_settings: {
        ...matchmaking_settings,
        queue_enabled: !matchmaking_settings?.queue_enabled,
      },
    })

    await ctx.edit(await RankingSettingsPages.queue(app, ctx))
  })
}

export async function sendRatingMethodSelectMenu(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await RankingSettingsPages.scoringMethod(app, ctx),
  }
}

export async function onRatingMethodSelect(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    await ensureAdminPerms(app, ctx)
    const rating_strategy = parseRatingStrategy(
      (ctx.interaction.data as D.APIMessageStringSelectInteractionData).values[0],
    )

    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

    await ranking.update({
      rating_settings: {
        ...ranking.data.rating_settings,
        ...rating_strategy_to_rating_settings[rating_strategy],
      },
    }),
      await rescoreAllMatches(app, ranking, ctx)

    await ctx.edit(await RankingSettingsPages.scoringMethod(app, ctx))
  })
}

export async function sendDeletePage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await RankingSettingsPages.deleteConfirm(app, ctx),
  }
}

export async function sendAppearancePage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await RankingSettingsPages.appearance(app, ctx),
  }
}

export async function appearanceModal(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<D.APIModalInteractionResponse> {
  const { ranking, guild_ranking } = await app.db.guild_rankings.fetchBy({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })

  const modal = rankingSettingsModal({
    color: {
      ph: guild_ranking.data.display_settings?.color
        ? `#${guild_ranking.data.display_settings?.color?.toString(16)}`
        : undefined,
    },
  })
    .setTitle(`Edit Appearance of ${ranking.data.name}`)
    .setCustomId(ctx.state.set.handler(onSettingsModalSubmit).cId())

  return {
    type: D.InteractionResponseType.Modal,
    data: modal.toJSON(),
  }
}

export async function onDeleteConfirmBtn(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    await ensureAdminPerms(app, ctx)
    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
    await deleteRanking(app, ranking)

    await ctx.edit(await AllRankingsPages.main(app, ctx))

    await ctx.followup({
      flags: D.MessageFlags.Ephemeral,
      content: `Deleted **${escapeMd(ranking.data.name)}** and all of its players and matches`,
    })
  })
}
