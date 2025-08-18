import { ChatInteractionResponse, ComponentContext, Context, getModalSubmitEntries } from '@repo/discord'
import { intOrNull, strOrUndefined } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { RankingSettingsPages } from '.'
import { UserError, UserErrors } from '../../../errors/user-errors'
import { App } from '../../../setup/app'
import { ensureAdminPerms, escapeMd, parseColor } from '../../../utils'
import { disableGuildRankingLbMessage, syncGuildRankingLbMessage } from '../../leaderboard/manage'
import { rescoreAllMatches } from '../../matches/scoring/score-matches'
import { deleteRanking, updateGuildRanking, updateRanking } from '../../rankings/manage'
import { getDefaultRatingSettings, parseRatingStrategy, rating_strategy_name } from '../../rankings/properties'
import { RankRolesSettingsPages } from '../rank-roles'
import { rank_roles_settings_view_sig } from '../rank-roles/view'
import { SettingsPages } from '../settings'
import { settingsOptions } from './common'
import { rankingSettingsModal, ratingParametersModal } from './modals'
import { ranking_settings_view_sig } from './view'
import { RatingStrategy } from '@repo/db/models'

/**
 * Go to the ranking settings page
 */
export async function sendMainPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => void (await ctx.edit(await RankingSettingsPages.main(app, ctx))))
}

export async function onSettingSelect(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  const gr = await app.db.guild_rankings.fetch({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })
  const selected_option = (ctx.interaction.data as D.APIMessageStringSelectInteractionData).values[0]
  const setting = settingsOptions(gr)[selected_option]
  if (!setting) throw new Error(`Unknown setting option ${selected_option}`)
  return setting.handler(app, ctx)
}

export async function sendRenameModal(
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

    const { guild_ranking, ranking } = await app.db.guild_rankings.fetch({
      guild_id: ctx.interaction.guild_id,
      ranking_id: ctx.state.get.ranking_id(),
    })

    const modal_input = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)

    const new_name = strOrUndefined(modal_input['name']?.value)
    const new_best_of = intOrNull(modal_input['best_of']?.value)
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
      const valid_color = parseColor(color_input)
      if (!valid_color) throw new UserErrors.ValidationError('Color must contain a hex code, like ff0000')

      await updateGuildRanking(app, guild_ranking, {
        display_settings: {
          ...guild_ranking.data.display_settings,
          color: valid_color ?? guild_ranking.data.display_settings?.color,
        },
      })
    }

    return void (await ctx.edit(await RankingSettingsPages.main(app, ctx)))
  })
}

export async function sendRatingParamsModal(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

  const modal = ratingParametersModal(ranking.data.rating_settings.rating_strategy)

  if (!modal) {
    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `There are no applicable parameters to update for the \`${rating_strategy_name[ranking.data.rating_settings.rating_strategy]}\` strategy.`,
        flags: D.MessageFlags.Ephemeral,
      }
    }
  }

  return {
    type: D.InteractionResponseType.Modal,
    data: modal
      .setCustomId(ctx.state.set.handler(onRatingParamsModalSubmit).cId())
      .toJSON(),
  }
}

export async function onRatingParamsModalSubmit(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const msg_id = ctx.interaction.message?.id

    await ensureAdminPerms(app, ctx)

    const { guild_ranking, ranking } = await app.db.guild_rankings.fetch({
      guild_id: ctx.interaction.guild_id,
      ranking_id: ctx.state.get.ranking_id(),
    })

    const modal_input = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)

    const mu = intOrNull(modal_input['mu']?.value)
    const sigma = intOrNull(modal_input['sigma']?.value)
    const tau = intOrNull(modal_input['tau']?.value)
    const vol = intOrNull(modal_input['vol']?.value)
    const k_factor = intOrNull(modal_input['k_factor']?.value)

    const current_rating_settings = ranking.data.rating_settings

    const new_rating_settings = {
      ...current_rating_settings,
      initial_rating: {
        mu: mu ?? current_rating_settings.initial_rating.mu,
        rd: sigma ?? current_rating_settings.initial_rating.rd,
        vol: vol ?? current_rating_settings.initial_rating.vol,
      },
      tau: tau ?? current_rating_settings.tau,
      k_factor: k_factor ?? current_rating_settings.k_factor,
    }

    const followup = await ctx.followup({
      content: `Updating ranking **${escapeMd(ranking.data.name)}**...`,
      flags: D.MessageFlags.Ephemeral,
    })

    await updateRanking(
      app,
      ranking,
      {
        rating_settings: new_rating_settings,
      },
      ctx,
    )

    await ctx.edit(
      {
        content: `Done!`,
      },
      followup.id,
    )

    await ctx.edit(await RankingSettingsPages.ratingSettings(app, ctx), msg_id)
  })
}

export async function onToggleLiveLeaderboard(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)

  return ctx.defer(async ctx => {
    const { guild_ranking } = await app.db.guild_rankings.fetch({
      guild_id: ctx.interaction.guild_id,
      ranking_id: ctx.state.get.ranking_id(),
    })

    // send and enable the leaderboard message if it's disabled
    if (guild_ranking.data.display_settings?.leaderboard_message) {
      await disableGuildRankingLbMessage(app, guild_ranking)
    } else {
      await syncGuildRankingLbMessage(app, guild_ranking, { enable_if_disabled: true })
    }

    return void (await ctx.edit(await RankingSettingsPages.appearance(app, ctx)))
  })
}

export async function sendMatchSettingsPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => void (await ctx.edit(await RankingSettingsPages.matchSettings(app, ctx))))
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

    return void (await ctx.edit(await RankingSettingsPages.matchSettings(app, ctx)))
  })
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

    await ctx.edit(await RankingSettingsPages.matchSettings(app, ctx))
  })
}

export async function onToggleDraws(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)

  return ctx.defer(async ctx => {
    const msg_id = ctx.interaction.message?.id

    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
    const match_settings = ranking.data.match_settings

    await updateRanking(app, ranking, {
      match_settings: {
        ...match_settings,
        draws_allowed: !match_settings?.draws_allowed,
      },
    })

    await ctx.edit(await RankingSettingsPages.matchSettings(app, ctx), msg_id)
  })
}

export async function sendRankRolesPage(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await RankRolesSettingsPages.main(app, {
      ...ctx,
      state: rank_roles_settings_view_sig.newState({
        ranking_id: ctx.state.get.ranking_id(),
      }),
    }),
  }
}

export async function sendRatingMethodSelectMenu(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await RankingSettingsPages.ratingSettings(app, ctx),
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

    await updateRanking(app, ranking, {
      rating_settings: {
        ...ranking.data.rating_settings,
        ...getDefaultRatingSettings(rating_strategy),
      },
    }, ctx)

    await ctx.edit(await RankingSettingsPages.ratingSettings(app, ctx))
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

export async function sendColorModal(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<D.APIModalInteractionResponse> {
  const { ranking, guild_ranking } = await app.db.guild_rankings.fetch({
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

    await ctx.edit(await SettingsPages.main(app, ctx))

    await ctx.followup({
      flags: D.MessageFlags.Ephemeral,
      content: `Deleted **${escapeMd(ranking.data.name)}** and all of its players and matches`,
    })
  })
}
