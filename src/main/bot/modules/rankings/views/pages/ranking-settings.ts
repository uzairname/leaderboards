import * as D from 'discord-api-types/v10'
import {
  ChatInteractionResponse,
  ComponentContext,
  field,
  getModalSubmitEntries,
  MessageView,
  StateContext,
} from '../../../../../../discord-framework'
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
import { rankingNameTextInput, rankingsPage } from './rankings'
import { ViewState } from '../../../../../../discord-framework/interactions/view-state'

export const ranking_settings_page_config = new MessageView({
  name: 'ranking settings',
  custom_id_prefix: 'rs',
  state_schema: {
    guild_id: field.String(),
    ranking_id: field.Int(),
    callback: field.Choice({
      sendAllGuildRankingsPage,
      rename,
      onRenameModalSubmit,
      toggleLiveLeaderboard,
      toggleChallenge,
      onDeleteBtn,
      onDeleteConfirmBtn,
      // eloSettingsPage,
      // onSettingSelect,
      // onLbChannelSelect,
      // sendQueueMessage,
    }),
    // selected_channel_id: field.String(),
  },
})

export default new AppView(ranking_settings_page_config, app =>
  ranking_settings_page_config.onComponent(async ctx => {
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
  return _rankingSettingsPage(app, {state: ranking_settings_page_config.newState(data)})
}


async function _rankingSettingsPage(
  app: App,
  ctx: StateContext<typeof ranking_settings_page_config>,
): Promise<D.APIInteractionResponseCallbackData> {
  const guild_ranking = await app.db.guild_rankings.get({
    guild_id: ctx.state.get.guild_id(),
    ranking_id: ctx.state.get.ranking_id(),
  })
  const ranking = await app.db.rankings.get(ctx.state.get.ranking_id())

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
        label: `Rename`,
        style: D.ButtonStyle.Primary,
        custom_id: ctx.state.set.callback(rename).cId(),
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
      return void ctx.edit(await rankingsPage(app, guild))
    },
  )
}

async function rename(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_config>,
): Promise<ChatInteractionResponse> {
  const ranking = await app.db.rankings.get(ctx.state.get.ranking_id())
  return {
    type: D.InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.callback(onRenameModalSubmit).cId(),
      title: `Rename ${ranking.data.name}`,
      components: [rankingNameTextInput()],
    },
  }
}

async function onRenameModalSubmit(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_config>,
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)

  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const ranking = await app.db.rankings.get(ctx.state.get.ranking_id())
      const old_name = ranking.data.name
      const name = nonNullable(
        getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)['name']?.value,
        'input name',
      )

      await updateRanking(app, ranking, { name })
      const res = await ctx.followup({
        content: `Renamed ${escapeMd(old_name)} to ${escapeMd(name)}`,
        flags: D.MessageFlags.Ephemeral,
      })

      return void Promise.all([ctx.edit(await _rankingSettingsPage(app, ctx)), ctx.delete(res.id)])
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
      const guild_ranking = await app.db.guild_rankings.get({
        guild_id: ctx.state.get.guild_id(),
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
        await syncGuildRankingLbMessage(app, guild_ranking,{  enable_if_disabled: true })
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
      const ranking = await app.db.rankings.get(ctx.state.get.ranking_id())

      const matchmaking_settings = ranking.data.matchmaking_settings

      app.config.IsDev &&
        (await ctx.followup({ content: `Updating granking ${ranking.data.name}`, flags: 64 }))
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
  const ranking = await app.db.rankings.get(ctx.state.get.ranking_id())
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
      const ranking = await app.db.rankings.get(ctx.state.get.ranking_id())
      await deleteRanking(app, ranking)

      const guild = await getOrAddGuild(app, interaction.guild_id)
      await ctx.edit(await rankingsPage(app, guild))

      return void ctx.followup({
        flags: D.MessageFlags.Ephemeral,
        content: `Deleted **${escapeMd(ranking.data.name)}** and all of its players and matches`,
      })
    },
  )
}

async function eloSettingsPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_config>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: {
      embeds: [
        {
          title: 'Elo Settings',
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
