import { ChatInteractionResponse, ComponentContext, getModalSubmitEntries } from '@repo/discord'
import { intOrUndefined, strOrUndefined } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { sentry } from '../../../../logging/sentry'
import { App } from '../../../../setup/app'
import { Colors } from '../../../../ui-helpers/constants'
import { ensureAdminPerms } from '../../../../ui-helpers/perms'
import { escapeMd } from '../../../../ui-helpers/strings'
import {
  disableGuildRankingLbMessage,
  syncGuildRankingLbMessage,
} from '../../../leaderboard/leaderboard-message'
import { deleteRanking, updateRanking } from '../../manage-rankings'
import { allRankingsPage, rankingSettingsModal } from './all-rankings-page'
import { _rankingSettingsPage, ranking_settings_page_config } from './ranking-settings-page'

export async function allRankings(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_config>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      return void ctx.edit(await allRankingsPage(app, ctx))
    },
  )
}

export async function editBtn(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_config>,
): Promise<ChatInteractionResponse> {
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
  sentry.debug(`${ctx.state.get.ranking_id()}`)
  sentry.debug(`sendsettingsmodal ${ranking.data.name}`)
  return {
    type: D.InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.handler(settingsModalSubmit).cId(),
      title: `Edit ${ranking.data.name}`,
      components: rankingSettingsModal({
        name: { current: ranking.data.name },
        best_of: { current: ranking.data.matchmaking_settings?.default_best_of },
      }),
    },
  }
}

export async function settingsModalSubmit(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_config>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
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

      return ctx.edit(await _rankingSettingsPage(app, ctx))
    },
  )
}

export async function toggleLiveLeaderboard(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_config>,
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
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

      await ctx.edit(await _rankingSettingsPage(app, ctx))
    },
  )
}

export async function toggleChallenge(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_config>,
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

      const matchmaking_settings = ranking.data.matchmaking_settings

      await updateRanking(app, ranking, {
        matchmaking_settings: {
          ...matchmaking_settings,
          direct_challenge_enabled: !matchmaking_settings?.direct_challenge_enabled,
        },
      })

      await ctx.edit(await _rankingSettingsPage(app, ctx))
    },
  )
}

export async function deleteBtn(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_config>,
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
              custom_id: ctx.state.set.handler(deleteConfirmBtn).cId(),
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

export async function deleteConfirmBtn(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_config>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
      await deleteRanking(app, ranking)

      await ctx.edit(await allRankingsPage(app, ctx))

      return void ctx.followup({
        flags: D.MessageFlags.Ephemeral,
        content: `Deleted **${escapeMd(ranking.data.name)}** and all of its players and matches`,
      })
    },
  )
}

export async function ratingSettingsPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_config>,
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
