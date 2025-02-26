import { ScoringMethod } from '@repo/db/models'
import { ChatInteractionResponse, ComponentContext, Context, getModalSubmitEntries } from '@repo/discord'
import { intOrUndefined, strOrUndefined } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../../../../setup/app'
import { ensureAdminPerms } from '../../../../utils/perms'
import { Colors, escapeMd } from '../../../../utils/ui'
import { disableGuildRankingLbMessage, syncGuildRankingLbMessage } from '../../../leaderboard/leaderboard-message'
import { rescoreAllMatches } from '../../../matches/management/manage-matches'
import { rankingSettingsModal, renameModal } from '../components'
import { deleteRanking, updateRanking } from '../../manage'
import {
  queueSettingsPage,
  ranking_settings_view_sig,
  rankingSettingsPage,
  scoringMethodSelectMenu,
  settingsOptions,
} from './ranking-settings-view'
import { rankingsPage } from '../rankings-view'

export async function sendAllRankingsPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => void ctx.edit(await rankingsPage(app, ctx)))
}

export async function sendRankingSettingsPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => void ctx.edit(await rankingSettingsPage(app, ctx)))
}

export async function onRankingSelect(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  const ranking_id = parseInt((ctx.interaction.data as D.APIMessageStringSelectInteractionData).values[0])

  ctx.state.saveAll({ ranking_id })
  return sendRankingSettingsPage(app, ctx)
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
  return setting.callback(app, ctx)
}

export async function sendRenameModal(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return await renameModal(app, ctx)
}

export async function sendEditModal(
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

    await updateRanking(app, ranking, {
      name: new_name,
      matchmaking_settings: new_matchmaking_settings,
    })

    await ctx.edit(await rankingSettingsPage(app, ctx))
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

export async function sendQueueSettingsPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => void ctx.edit(await queueSettingsPage(app, ctx)))
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

    await ctx.edit(await queueSettingsPage(app, ctx))
  })
}

export async function sendScoringMethodSelectMenu(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await scoringMethodSelectMenu(app, ctx),
  }
}

export async function onScoringMethodSelect(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const scoring_method = parseInt((ctx.interaction.data as D.APIMessageStringSelectInteractionData).values[0])

    // check if the value is a valid ScoringMethod
    if (!Object.values(ScoringMethod).includes(scoring_method))
      throw new Error(`Invalid ScoringMethod value: ${scoring_method}`)

    const msg = await ctx.followup({
      content: `Updating scoring method...`,
      flags: D.MessageFlags.Ephemeral,
    })

    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

    await ranking.update({
      rating_settings: {
        ...ranking.data.rating_settings,
        scoring_method: scoring_method,
      },
    }),
      await ctx.edit(
        {
          content: `Rescoring all matches...`,
          embeds: [],
          components: [],
        },
        msg.id,
      )

    await rescoreAllMatches(app, ranking),
      await ctx.edit(
        {
          content: `Done`,
          embeds: [],
          components: [],
        },
        msg.id,
      )

    await ctx.edit(await scoringMethodSelectMenu(app, ctx))
  })
}

export async function deletePage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: {
      embeds: [
        {
          title: `Settings → Rankings → ${escapeMd(ranking.data.name)} → Delete`,
          description: `# Delete ${escapeMd(ranking.data.name)}?

          This will delete all of its players and match history`,
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
              custom_id: ctx.state.set.handler(sendRankingSettingsPage).cId(),
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
