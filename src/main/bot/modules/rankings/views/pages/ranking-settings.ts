import * as D from 'discord-api-types/v10'
import {
  ChatInteractionResponse,
  ComponentContext,
  field,
  getModalSubmitEntries,
  MessageView,
  StateContext,
} from '../../../../../../discord-framework'
import { ViewState } from '../../../../../../discord-framework/interactions/view-state'
import { nonNullable } from '../../../../../../utils/utils'
import { App } from '../../../../../app/App'
import { AppView } from '../../../../../app/ViewModule'
import { Colors } from '../../../../ui-helpers/constants'
import { Messages } from '../../../../ui-helpers/messages'
import { checkGuildInteraction, ensureAdminPerms } from '../../../../ui-helpers/perms'
import { escapeMd } from '../../../../ui-helpers/strings'
import { getOrAddGuild } from '../../../guilds/guilds'
import {
  disableGuildRankingLbMessage,
  syncGuildRankingLbMessage,
} from '../../../leaderboard/leaderboard-message'
import { deleteRanking, updateRanking } from '../../manage-rankings'
import { rankingSettingsModal, rankingsPage } from './rankings'
import { UserErrors } from '../../../../errors/UserError'
import { sentry } from '../../../../../../logging/sentry'

export const ranking_settings_page_config = new MessageView({
  name: 'ranking settings',
  custom_id_prefix: 'rs',
  state_schema: {
    component_owner_id: field.String(),
    guild_id: field.String(),
    ranking_id: field.Int(),
    callback: field.Choice({
      sendAllGuildRankingsPage,
      sendSettingsModal,
      onSettingsModalSubmit,
      toggleLiveLeaderboard,
      toggleChallenge,
      onDeleteBtn,
      onDeleteConfirmBtn,
    }),
  },
})

export default new AppView(ranking_settings_page_config, app =>
  ranking_settings_page_config.onComponent(async ctx => {
    const interaction = checkGuildInteraction(ctx.interaction)
    if (ctx.state.data.component_owner_id && ctx.state.data.component_owner_id !== interaction.member.user.id) {
      throw new UserErrors.NotComponentOwner(ctx.state.data.component_owner_id)
    }

    if (ctx.state.data.callback) {
      return ctx.state.data.callback(app, ctx)
    } else {
      return {
        type: D.InteractionResponseType.UpdateMessage,
        data: await _rankingSettingsPage(app, ctx),
      }
    }
  }),
)

export async function rankingSettingsPage(
  app: App,
  data: ViewState<typeof ranking_settings_page_config.state_schema>['data'],
) {
  return _rankingSettingsPage(app, { state: ranking_settings_page_config.newState(data) })
}

async function _rankingSettingsPage(
  app: App,
  ctx: StateContext<typeof ranking_settings_page_config>,
): Promise<D.APIInteractionResponseCallbackData> {
  const { guild_ranking, ranking } = await app.db.guild_rankings
    .get(ctx.state.get.guild_id(), ctx.state.get.ranking_id())
    .fetch()

  const embed: D.APIEmbed = {
    title: `Ranking Settings`,
    description:
      `## ${escapeMd(ranking.data.name)}` +
      `\n` +
      (await Messages.guildRankingDescription(app, guild_ranking, true)),
    color: Colors.Primary,
  }

  const buttons1: D.APIActionRowComponent<D.APIButtonComponent> = {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.Button,
        label: `Edit`,
        style: D.ButtonStyle.Primary,
        custom_id: ctx.state.set.callback(sendSettingsModal).cId(),
      },
      {
        type: D.ComponentType.Button,
        label: guild_ranking.data.display_settings?.leaderboard_message
          ? `Disable Live Leaderboard`
          : `Send Live Leaderboard`,
        style: D.ButtonStyle.Primary,
        custom_id: ctx.state.set.callback(toggleLiveLeaderboard).cId(),
      },
      {
        type: D.ComponentType.Button,
        label: ranking.data.matchmaking_settings?.direct_challenge_enabled
          ? `Disable Direct Challenges`
          : `Enable Direct Challenges`,
        style: D.ButtonStyle.Primary,
        custom_id: ctx.state.set.callback(toggleChallenge).cId(),
      },
      {
        type: D.ComponentType.Button,
        label: `Delete`,
        style: D.ButtonStyle.Danger,
        custom_id: ctx.state.set.callback(onDeleteBtn).cId(),
      },
    ],
  }

  const buttons2: D.APIActionRowComponent<D.APIButtonComponent> = {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.Button,
        label: `All Rankings`,
        style: D.ButtonStyle.Secondary,
        custom_id: ctx.state.set.callback(sendAllGuildRankingsPage).cId(),
        emoji: {
          name: '⬅️',
        },
      },
    ],
  }

  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [buttons1, buttons2]

  return {
    flags: D.MessageFlags.Ephemeral,
    embeds: [embed],
    components,
  }
}

async function sendAllGuildRankingsPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_config>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const guild = await getOrAddGuild(app, ctx.state.get.guild_id())
      return void ctx.edit(await rankingsPage(app, guild, ctx.state.data.component_owner_id))
    },
  )
}

async function sendSettingsModal(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_config>,
): Promise<ChatInteractionResponse> {
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
  sentry.debug(`${ctx.state.get.ranking_id()}`)
  sentry.debug(`sendsettingsmodal ${ranking.data.name}`)
  return {
    type: D.InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.callback(onSettingsModalSubmit).cId(),
      title: `Edit ${ranking.data.name}`,
      components: rankingSettingsModal({
        name: { current: ranking.data.name },
        best_of: { current: ranking.data.matchmaking_settings?.default_best_of }
      }),
    },
  }
}

async function onSettingsModalSubmit(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_config>,
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)

  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const modal_input = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)
      const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

      // determine whether the user had any input for the fields. If not, set them to undefined so they are not updated
      const new_name_str = modal_input['name']?.value
      const new_name = new_name_str ? new_name_str : undefined

      const best_of_int = parseInt(modal_input['best_of']?.value ?? '')

      sentry.debug(`onSettingsModalSubmit ${ranking.data.name} ${new_name} ${best_of_int}`)

      const new_matchmaking_settings = {
        ...ranking.data.matchmaking_settings,
        default_best_of: !(isNaN(best_of_int)) ? best_of_int : ranking.data.matchmaking_settings.default_best_of,
      }

      await updateRanking(app, ranking, { 
        name: new_name,
        matchmaking_settings: new_matchmaking_settings,
       })

      return ctx.edit(await _rankingSettingsPage(app, ctx))
    },
  )
}

async function toggleLiveLeaderboard(
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

async function toggleChallenge(
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

      await updateRanking(
        app,
        ranking,
        {
          matchmaking_settings: {
            ...matchmaking_settings,
            direct_challenge_enabled: !matchmaking_settings?.direct_challenge_enabled,
          },
        },
        ctx,
      )

      await ctx.edit(await _rankingSettingsPage(app, ctx))
    },
  )
}

async function onDeleteBtn(
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
              custom_id: ctx.state.set.callback(onDeleteConfirmBtn).cId(),
              style: D.ButtonStyle.Danger,
            },
            {
              type: D.ComponentType.Button,
              label: `Cancel`,
              custom_id: ctx.state.set.callback(undefined).cId(),
              style: D.ButtonStyle.Secondary,
            },
          ],
        },
      ],
      flags: D.MessageFlags.Ephemeral,
    },
  }
}

async function onDeleteConfirmBtn(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_config>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const interaction = checkGuildInteraction(ctx.interaction)
      const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
      await deleteRanking(app, ranking)

      const guild = await getOrAddGuild(app, interaction.guild_id)
      await ctx.edit(await rankingsPage(app, guild, interaction.member.user.id))

      return void ctx.followup({
        flags: D.MessageFlags.Ephemeral,
        content: `Deleted **${escapeMd(ranking.data.name)}** and all of its players and matches`,
      })
    },
  )
}

async function ratingSettingsPage(
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
              custom_id: ctx.state.set.callback(undefined).cId(),
              style: D.ButtonStyle.Secondary,
            },
          ],
        },
      ],
    },
  }
}
