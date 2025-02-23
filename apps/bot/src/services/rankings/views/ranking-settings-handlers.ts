import { ScoringMethod } from '@repo/db/models'
import { ChatInteractionResponse, ComponentContext, getModalSubmitEntries } from '@repo/discord'
import { intOrUndefined, strOrUndefined } from '@repo/utils'
import { Colors } from 'apps/bot/src/utils/ui'
import * as D from 'discord-api-types/v10'
import { sentry } from '../../../logging/sentry'
import { App } from '../../../setup/app'
import { ensureAdminPerms } from '../../../utils/perms'
import { escapeMd } from '../../../utils/ui'
import { disableGuildRankingLbMessage, syncGuildRankingLbMessage } from '../../leaderboard/leaderboard-message'
import { rankingSettingsModal } from '../components'
import { deleteRanking, updateRanking } from '../manage-rankings'
import { rankingSettingsPage, ranking_settings_view_sig } from './ranking-settings-view'
import { rankingsPage } from './rankings-view'

export async function allRankings(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    return void ctx.edit(await rankingsPage(app, ctx))
  })
}

export async function onEditBtn(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
  return {
    type: D.InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.handler(onSettingsModalSubmit).cId(),
      title: `Edit ${ranking.data.name}`,
      components: rankingSettingsModal({
        name: { current: ranking.data.name },
        best_of: { current: ranking.data.matchmaking_settings?.default_best_of },
      }),
    },
  }
}

export async function onSettingsModalSubmit(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    await ensureAdminPerms(app, ctx)
    const modal_input = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)
    // determine whether the user had any input for the fields. If not, set them to undefined so they are not updated
    const new_name = strOrUndefined(modal_input['name']?.value)
    const new_best_of = intOrUndefined(modal_input['best_of']?.value)

    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
    const new_matchmaking_settings = {
      ...ranking.data.matchmaking_settings,
      default_best_of: new_best_of ?? ranking.data.matchmaking_settings.default_best_of,
    }
    sentry.debug(`${new_matchmaking_settings}`)

    await updateRanking(app, ranking, {
      name: new_name,
      matchmaking_settings: new_matchmaking_settings,
    })

    return ctx.edit(await rankingSettingsPage(app, ctx))
  })
}

export async function onToggleLiveLeaderboard(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)
  return ctx.defer(async ctx => {
    const { guild_ranking } = await app.db.guild_rankings
      .get(ctx.state.get.guild_id(), ctx.state.get.ranking_id())
      .fetch()

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

    await ctx.edit(await rankingSettingsPage(app, ctx))
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

    await ctx.edit(await rankingSettingsPage(app, ctx))
  })
}

export async function onDeleteBtn(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: {
      content: ``,
      embeds: [
        {
          title: `Delete ${ranking.data.name}?`,
          description: `This will delete all of its players and match history`,
          color: Colors.EmbedBackground,
        },
      ],
      components: [
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.Button,
              label: `Delete`,
              custom_id: ctx.state.set.handler(onDeleteConfirmBtn).cId(),
              style: D.ButtonStyle.Danger,
            },
            {
              type: D.ComponentType.Button,
              label: `Cancel`,
              custom_id: ctx.state.set.handler(undefined).cId(),
              style: D.ButtonStyle.Secondary,
            },
          ],
        },
      ],
      flags: D.MessageFlags.Ephemeral,
    },
  }
}

export async function onDeleteConfirmBtn(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
    await deleteRanking(app, ranking)

    await ctx.edit(await rankingsPage(app, ctx))

    return void ctx.followup({
      flags: D.MessageFlags.Ephemeral,
      content: `Deleted **${escapeMd(ranking.data.name)}** and all of its players and matches`,
    })
  })
}

export async function ratingSettingsPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: {
      embeds: [
        {
          title: 'Rating Settings',
          description: `These settings affect how players' ratings are calculated`,
          color: Colors.EmbedBackground,
        },
      ],
      components: [
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.Button,
              label: 'Back',
              custom_id: ctx.state.set.handler(undefined).cId(),
              style: D.ButtonStyle.Secondary,
            },
          ],
        },
      ],
    },
  }
}

export async function onScoringMethodSelect(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  const value = parseInt((ctx.interaction.data as D.APIMessageStringSelectInteractionData).values[0])

  // check if the value is a valid ScoringMethod
  if (!Object.values(ScoringMethod).includes(value)) throw new Error(`Invalid ScoringMethod value: ${value}`)

  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

  await ranking.update({
    rating_settings: {
      ...ranking.data.rating_settings,
      scoring_method: value,
    },
  })

  return ratingSettingsPage(app, ctx)
}
