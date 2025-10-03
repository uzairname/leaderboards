import { ChatInteractionResponse, ComponentContext, Context, getModalSubmitEntries } from '@repo/discord'
import { intOrNull, parseColor, strOrUndefined } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { RankingSettingsPages } from '.'
import { UserErrors } from '../../../errors/user-errors'
import { setRankRole, unsetRankRole, updateRankRolesForGuildRanking } from '../../../services/players/rank-roles'
import { parseRatingStrategy, rating_strategy_name } from '../../../services/rankings/ratings'
import { escapeMd } from '../../../services/utils/strings'
import { App } from '../../../setup/app'
import { SettingsPages } from '../settings'
import { settingsOptions } from './common'
import { rankingSettingsModal, ratingParametersModal } from './modals'
import { rankRolesSettings, scoringSettings } from './pages'
import { ranking_settings_view_sig } from './view'

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
  const selected_option_key = (ctx.interaction.data as D.APIMessageStringSelectInteractionData).values[0]
  ctx.state.save.setting_key(selected_option_key)
  const setting = settingsOptions(gr)[selected_option_key]
  if (!setting) throw new Error(`Unknown setting option ${selected_option_key}`)
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
      await app.rankings.update(app, ctx.interaction, ranking, {
        name: new_name,
        matchmaking_settings: {
          ...ranking.data.matchmaking_settings,
          default_best_of: new_best_of ?? ranking.data.matchmaking_settings?.default_best_of,
        },
      })
    }

    // If any settings that apply to the guild ranking are specified, update them
    if (color_input) {
      const valid_color = parseColor(color_input)
      if (!valid_color) throw new UserErrors.ValidationError('Color must contain a hex code, like ff0000')

      await app.rankings.updateGuildRanking(app, ctx.interaction, guild_ranking, {
        display_settings: {
          ...guild_ranking.data.display_settings,
          color: valid_color ?? guild_ranking.data.display_settings?.color,
        },
      })
    }

    await (ctx.interaction.message ? ctx.edit : ctx.followup)(await RankingSettingsPages.main(app, ctx))
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
      },
    }
  }

  return {
    type: D.InteractionResponseType.Modal,
    data: modal.setCustomId(ctx.state.set.handler(onRatingParamsModalSubmit).cId()).toJSON(),
  }
}

export async function onRatingParamsModalSubmit(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const msg_id = ctx.interaction.message?.id

    const { ranking } = await app.db.guild_rankings.fetch({
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

    await app.rankings.update(
      app,
      ctx.interaction,
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

    await ctx.edit(await scoringSettings(app, ctx), msg_id)
  })
}

export async function onToggleLiveLeaderboard(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const { guild_ranking } = await app.db.guild_rankings.fetch({
      guild_id: ctx.interaction.guild_id,
      ranking_id: ctx.state.get.ranking_id(),
    })

    // send and enable the leaderboard message if it's disabled
    if (guild_ranking.data.display_settings?.leaderboard_message) {
      await app.lbs.disableGuildRankingLbMessage(app, ctx.interaction, guild_ranking)
    } else {
      await app.lbs.syncGuildRankingMessage(app, guild_ranking, { enable_if_disabled: true })
    }

    await ctx.edit(await RankingSettingsPages.appearance(app, ctx))
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
  return ctx.defer(async ctx => {
    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

    const matchmaking_settings = ranking.data.matchmaking_settings

    await app.rankings.update(app, ctx.interaction, ranking, {
      matchmaking_settings: {
        ...matchmaking_settings,
        direct_challenge_enabled: !matchmaking_settings?.direct_challenge_enabled,
      },
    })

    await ctx.edit(await RankingSettingsPages.matchSettings(app, ctx))
  })
}

export async function onToggleQueue(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
    const matchmaking_settings = ranking.data.matchmaking_settings

    await app.rankings.update(
      app,
      ctx.interaction,
      ranking,
      {
        matchmaking_settings: {
          ...matchmaking_settings,
          queue_enabled: !matchmaking_settings?.queue_enabled,
        },
      },
      ctx,
    )

    await ctx.edit(await RankingSettingsPages.matchSettings(app, ctx))
  })
}

export async function unsetQueuePingRole(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const msg_id = ctx.interaction.message?.id

    const { guild_ranking } = await app.db.guild_rankings.fetch({
      guild_id: ctx.interaction.guild_id,
      ranking_id: ctx.state.get.ranking_id(),
    })

    // Unset the queue ping role
    await app.rankings.updateGuildRanking(app, ctx.interaction, guild_ranking, {
      matchmaking_settings: {
        ...guild_ranking.data.matchmaking_settings,
        queue_join_ping_role_id: null,
      },
    })

    await ctx.edit(await RankingSettingsPages.matchSettings(app, ctx), msg_id)
  })
}

export async function onQueuePingRoleSelect(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const data = ctx.interaction.data as D.APIMessageRoleSelectInteractionData
    const selected_role_id = data.values[0]

    const { guild_ranking } = await app.db.guild_rankings.fetch({
      guild_id: ctx.interaction.guild_id,
      ranking_id: ctx.state.get.ranking_id(),
    })

    // Update the queue ping role
    await app.rankings.updateGuildRanking(app, ctx.interaction, guild_ranking, {
      matchmaking_settings: {
        ...guild_ranking.data.matchmaking_settings,
        queue_join_ping_role_id: selected_role_id,
      },
    })

    await ctx.edit(await RankingSettingsPages.matchSettings(app, ctx))
  })
}

export async function sendQueueJoinTimeoutModal(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.Modal,
    data: {
      title: 'Set Queue Join Timeout',
      custom_id: ctx.state.set.handler(onQueueJoinTimeoutModalSubmit).cId(),
      components: [
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.TextInput,
              custom_id: 'queue_join_timeout_minutes',
              label: 'Queue Join Timeout',
              style: D.TextInputStyle.Short,
              placeholder: 'Enter number of minutes',
              required: true,
            },
          ],
        },
      ],
    },
  }
}

export async function onQueueJoinTimeoutModalSubmit(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

    const entries = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)
    const queue_join_timeout_minutes = intOrNull(entries['queue_join_timeout_minutes']?.value)

    if (queue_join_timeout_minutes === null || queue_join_timeout_minutes <= 0) {
      throw new UserErrors.ValidationError('Queue join timeout must be a positive integer')
    }

    const matchmaking_settings = ranking.data.matchmaking_settings

    await app.rankings.update(app, ctx.interaction, ranking, {
      matchmaking_settings: {
        ...matchmaking_settings,
        queue_join_timeout_minutes,
      },
    })

    await ctx.edit(await RankingSettingsPages.matchSettings(app, ctx))
  })
}

export async function onToggleDraws(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const msg_id = ctx.interaction.message?.id

    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
    const match_settings = ranking.data.match_settings

    await app.rankings.update(app, ctx.interaction, ranking, {
      match_settings: {
        ...match_settings,
        draws_allowed: !match_settings?.draws_allowed,
      },
    })

    await ctx.edit(await RankingSettingsPages.matchSettings(app, ctx), msg_id)
  })
}

export async function setOutcomeType(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const outcome_type = ctx.state.get.selected_outcome_type()
    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

    await app.rankings.update(app, ctx.interaction, ranking, {
      match_settings: {
        ...ranking.data.match_settings,
        outcome_type: outcome_type,
      },
    })
    await ctx.edit(await RankingSettingsPages.scoringSettings(app, ctx))
  })
}

export async function sendRankRolesPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => void (await ctx.edit(await rankRolesSettings(app, ctx))))
}

export async function sendRatingSettingsPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => void (await ctx.edit(await scoringSettings(app, ctx))))
}

export async function onRatingMethodSelect(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const rating_strategy = ctx.state.get.selected_rating_strategy()

    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

    // When updating the rating method, reset the parameters to keep them appropriate for the new method.
    await app.rankings.update(
      app,
      ctx.interaction,
      ranking,
      {
        rating_settings: {
          ...ranking.data.rating_settings,
          ...app.rankings.getDefaultRatingSettings(rating_strategy),
        },
      },
      ctx,
    )

    await ctx.edit(await scoringSettings(app, ctx))
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
    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
    await app.rankings.delete(app, ctx.interaction, ranking)

    await ctx.followup({
      flags: D.MessageFlags.Ephemeral,
      content: `Deleted **${escapeMd(ranking.data.name)}** and all of its players and matches`,
    })
  })
}

// RANK ROLES

/**
 * Called when a role selection is made from the dropdown
 */
export async function onRankRoleSelect(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  const data = ctx.interaction.data as D.APIMessageRoleSelectInteractionData
  const selected_role_id = data.resolved.roles?.[data.values[0]]?.id
  ctx.state.save.selected_role_id(selected_role_id)

  const { guild_ranking } = await app.db.guild_rankings.fetch({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })

  const existing_role = guild_ranking.data.rank_roles?.find(rr => rr.role_id === selected_role_id)

  if (!existing_role) {
    // If it is not set, send the modal to set the range.
    return sendEditRangeModal(app, ctx)
  } else {
    // If set, send settings page
    ctx.state.save.selected_role_id(selected_role_id)
    return {
      type: D.InteractionResponseType.UpdateMessage,
      data: await RankingSettingsPages.rankRolesSettings(app, ctx),
    }
  }
}

export async function onUnsetRankRole(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const original_msg_id = ctx.interaction.message?.id
    const selected_role_id = ctx.state.get.selected_role_id()

    const { guild_ranking } = await app.db.guild_rankings.fetch({
      guild_id: ctx.interaction.guild_id,
      ranking_id: ctx.state.get.ranking_id(),
    })

    // Unset the rank role
    await unsetRankRole(selected_role_id, guild_ranking)

    ctx.state.save.selected_role_id(null)
    await ctx.edit(await rankRolesSettings(app, ctx), original_msg_id)
  })
}

export async function sendEditRangeModal(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.Modal,
    data: {
      title: 'Please enter the desired rating range',
      custom_id: ctx.state.set.handler(onEditRangeModalSubmit).cId(),
      components: [
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.TextInput,
              custom_id: 'min_rating',
              label: 'Min rating (inclusive)',
              style: D.TextInputStyle.Short,
              placeholder: 'Leave blank for no minimum',
              required: false,
            },
          ],
        },
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.TextInput,
              custom_id: 'max_rating',
              label: 'Max rating (exclusive)',
              style: D.TextInputStyle.Short,
              placeholder: 'Leave blank for no maximum',
              required: false,
            },
          ],
        },
      ],
    },
  }
}

export async function onEditRangeModalSubmit(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const original_msg_id = ctx.interaction.message?.id
    const followup = await ctx.followup({
      content: `Updating role assignment...`,
      flags: D.MessageFlags.Ephemeral,
    })

    const entries = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)
    const selected_role_id = ctx.state.get.selected_role_id()

    const min_rating = intOrNull(entries['min_rating']?.value)
    const max_rating = intOrNull(entries['max_rating']?.value)

    // Update the rank role with the new range
    const { guild_ranking } = await app.db.guild_rankings.fetch({
      guild_id: ctx.interaction.guild_id,
      ranking_id: ctx.state.get.ranking_id(),
    })

    await setRankRole(selected_role_id, min_rating, max_rating, guild_ranking)
    await updateRankRolesForGuildRanking(app, guild_ranking)

    await ctx.delete(followup.id)
    await ctx.edit(await rankRolesSettings(app, ctx), original_msg_id)
  })
}
