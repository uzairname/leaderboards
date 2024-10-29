import * as D from 'discord-api-types/v10'
import {
  ChatInteractionResponse,
  ComponentContext,
  field,
  getModalSubmitEntries,
  MessageView,
  StateContext,
} from '../../../../../../discord-framework'
import { ViewState } from '../../../../../../discord-framework/interactions/view_state'
import { nonNullable } from '../../../../../../utils/utils'
import { App } from '../../../../../app/App'
import { AppView } from '../../../../../app/ViewModule'
import { Colors } from '../../../../helpers/constants'
import { Messages } from '../../../../helpers/messages'
import { checkGuildInteraction, ensureAdminPerms } from '../../../../helpers/perms'
import { escapeMd } from '../../../../helpers/strings'
import { getOrAddGuild } from '../../../guilds/guilds'
import {
  disableGuildRankingLbMessage,
  syncGuildRankingLbMessage,
} from '../../../leaderboard/leaderboard_message'
import { deleteRanking, updateRanking } from '../../manage_rankings'
import { allGuildRankingsPage } from './all_guild_rankings'
import { rankingNameTextInput } from './create_ranking'

export const ranking_settings_view_signature = new MessageView({
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

export default new AppView(ranking_settings_view_signature, app =>
  ranking_settings_view_signature.onComponent(async ctx => {
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

export function initRankingSettingsPageState(options: {
  guild_id: string
  ranking_id: number
}): ViewState<typeof ranking_settings_view_signature.state_schema> {
  return ranking_settings_view_signature.createState({
    guild_id: options.guild_id,
    ranking_id: options.ranking_id,
  })
}

export async function rankingSettingsPage(
  app: App,
  options: {
    guild_id: string
    ranking_id: number
  },
  // state: ViewState<typeof ranking_settings_view_signature.state_schema>,
): Promise<D.APIInteractionResponseCallbackData> {
  return await _rankingSettingsPage(app, { state: initRankingSettingsPageState(options) })
}

async function _rankingSettingsPage(
  app: App,
  ctx: StateContext<typeof ranking_settings_view_signature>,
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
      (await Messages.guildRankingDetails(app, guild_ranking)),
    color: Colors.Primary,
  }

  // const select_menu: D.APISelectMenuComponent = {
  //   type: D.ComponentType.StringSelect,
  //   custom_id: ctx.state.set.callback(onSettingSelect).cId(),
  //   placeholder: `Select a setting`,
  //   options: Object.entries(setting_select_menu_options(app))
  //     .map(([value, option]) => {
  //       const { name, description } = option(guild_ranking)
  //       if (value == 'queue_message' && !app.config.features.QueueMessage) {
  //         return null
  //       }
  //       if (value == 'match_logs' && !app.config.features.DisableLogMatchesOption) {
  //         return null
  //       }

  //       return {
  //         label: name,
  //         value,
  //         description: description,
  //       }
  //     })
  //     .filter(option => !!option),
  // }

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
  ctx: ComponentContext<typeof ranking_settings_view_signature>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const guild = await getOrAddGuild(app, ctx.state.get.guild_id())
      return void ctx.edit(await allGuildRankingsPage(app, guild))
    },
  )
}

async function rename(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_signature>,
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

async function toggleLiveLeaderboard(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_signature>,
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
        await syncGuildRankingLbMessage(app, guild_ranking, true)
        await ctx.followup({
          content: `The leaderboard message will now be updated live`,
          flags: D.MessageFlags.Ephemeral,
        })
      }

      await ctx.edit(await _rankingSettingsPage(app, ctx))
    },
  )
}

async function onRenameModalSubmit(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_signature>,
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

async function onDeleteBtn(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_signature>,
): Promise<ChatInteractionResponse> {
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

// async function onLbChannelSelect(
//   app: App,
//   ctx: ComponentContext<typeof ranking_settings_view_signature>,
// ): Promise<ChatInteractionResponse> {
//   // send leaderboard message
//   return ctx.defer(
//     {
//       type: D.InteractionResponseType.DeferredMessageUpdate,
//     },
//     async ctx => {
//       const lb_channel_id = ctx.state.data.selected_channel_id

//       if (!lb_channel_id) {
//         return void ctx.edit(await _rankingSettingsPage(app, ctx))
//       }
//       await ensureAdminPerms(app, ctx)

//       const guild_ranking = await app.db.guild_rankings.get({
//         guild_id: ctx.state.get.guild_id(),
//         ranking_id: ctx.state.get.ranking_id(),
//       })

//       await guild_ranking.update({
//         leaderboard_channel_id: lb_channel_id,
//         display_settings: {
//           ...guild_ranking.data.display_settings,
//           leaderboard_message: true,
//         },
//       })
//       await syncGuildRankingLbMessage(app, guild_ranking)
//       await ctx.edit(await _rankingSettingsPage(app, ctx))
//       await ctx.followup({
//         embeds: [
//           {
//             title: `Leaderboard Created`,
//             description: `The leaderboard for this ranking will now be updated live here ${messageLink(
//               guild_ranking.data.guild_id,
//               lb_channel_id,
//               guild_ranking.data.leaderboard_message_id ?? '0',
//             )}`,
//             color: Colors.Success,
//           },
//         ],
//         flags: D.MessageFlags.Ephemeral,
//       })
//     },
//   )
// }

// async function onQueueMessageSelect(
//   app: App,
//   ctx: ComponentContext<typeof ranking_settings_view_signature>,
// ): Promise<ChatInteractionResponse> {
//   return ctx.defer(
//     {
//       type: D.InteractionResponseType.DeferredMessageUpdate,
//     },
//     async ctx => {
//       const queue_channel_id = ctx.state.data.selected_channel_id

//       if (!queue_channel_id || !app.config.features.QueueMessage) {
//         return void ctx.edit(await _rankingSettingsPage(app, ctx))
//       }
//       const guild_ranking = await app.db.guild_rankings.get({
//         guild_id: ctx.state.get.guild_id(),
//         ranking_id: ctx.state.get.ranking_id(),
//       })

//       await ensureAdminPerms(app, ctx)
//       const result = await sendGuildRankingQueueMessage(app, guild_ranking, queue_channel_id)
//       await ctx.edit(await _rankingSettingsPage(app, ctx))
//       await ctx.followup({
//         embeds: [
//           {
//             title: `Queue Message Created`,
//             description: `${messageLink(
//               guild_ranking.data.guild_id,
//               queue_channel_id,
//               result.message_id,
//             )}`,
//             color: Colors.Success,
//           },
//         ],
//         flags: D.MessageFlags.Ephemeral,
//       })
//     },
//   )
// }

async function onDeleteConfirmBtn(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_signature>,
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const interaction = checkGuildInteraction(ctx.interaction)
      const ranking = await app.db.rankings.get(ctx.state.get.ranking_id())
      await deleteRanking(app, ranking)

      const guild = await getOrAddGuild(app, interaction.guild_id)
      await ctx.edit(await allGuildRankingsPage(app, guild))

      return void ctx.followup({
        flags: D.MessageFlags.Ephemeral,
        content: `Deleted **${escapeMd(ranking.data.name)}** and all of its players and matches`,
      })
    },
  )
}

async function eloSettingsPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view_signature>,
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

// const setting_select_menu_options: (app: App) => Record<
//   string,
//   (guild_ranking: GuildRanking) => {
//     name: string
//     description: string
//     onSelect: (
//       ctx: ComponentContext<typeof ranking_settings_view_signature>,
//     ) => Promise<ChatInteractionResponse>
//   }
// > = (app: App) => ({
//   rename: () => ({
//     name: '✏️Rename',
//     description: 'Rename the ranking',
//     onSelect: async ctx => ({
//       type: D.InteractionResponseType.Modal,
//       data: {
//         custom_id: ctx.state.set.callback(onRenameModalSubmit).cId(),
//         title: `Rename ${ctx.state.get.ranking_name()}`,
//         components: [rankingNameTextInput()],
//       },
//     }),
//   }),
//   leaderboard_msg: () => ({
//     name: '🏅Send Leaderboard',
//     description: 'Send a live-updating leaderboard to a channel',
//     onSelect: async ctx => {
//       return ctx.defer(
//         {
//           type: D.InteractionResponseType.DeferredMessageUpdate,
//         },
//         async ctx => {
//           await ctx.edit(
//             await sendSelectChannelPage(app, ctx.interaction, {
//               submit_cid: ctx.state.set.callback(onLbChannelSelect).cId(),
//               channel_id_field: 'selected_channel_id',
//               text_only: true,
//             }),
//           )
//         },
//       )
//     },
//   }),
//   queue_message: () => ({
//     name: '⚔️Send Queue Message',
//     description: 'Send a queue message to a channel',
//     onSelect: async ctx =>
//       ctx.defer(
//         {
//           type: D.InteractionResponseType.DeferredMessageUpdate,
//         },
//         async ctx => {
//           await ctx.edit(
//             await sendSelectChannelPage(app, ctx.interaction, {
//               submit_cid: ctx.state.set.callback(onQueueMessageSelect).cId(),
//               channel_id_field: 'selected_channel_id',
//               text_only: true,
//             }),
//           )
//         },
//       ),
//   }),
//   match_logs: guild_ranking => {
//     return {
//       name: guild_ranking.data.display_settings?.log_matches
//         ? '📜Disable Match Logs'
//         : '📜Enable Match Logs',
//       description: guild_ranking.data.display_settings?.log_matches
//         ? `Stop logging matches from this ranking to the chosen channel`
//         : `Log the results of matches to a channel`,
//       onSelect: async ctx =>
//         ctx.defer(
//           {
//             type: D.InteractionResponseType.DeferredMessageUpdate,
//           },
//           async ctx => {
//             await ensureAdminPerms(app, ctx)
//             const guild_ranking = await app.db.guild_rankings.get({
//               guild_id: ctx.state.get.guild_id(),
//               ranking_id: ctx.state.get.ranking_id(),
//             })

//             const display_settings = guild_ranking.data.display_settings ?? {}
//             const log_matches = !display_settings.log_matches

//             await guild_ranking.update({
//               display_settings: {
//                 ...display_settings,
//                 log_matches,
//               },
//             })
//             await ctx.edit(await guildRankingSettingsPage(app, ctx))
//           },
//         ),
//     }
//   },
//   delete: () => ({
//     name: '🗑️Delete',
//     description: 'Delete this ranking',
//     onSelect: async ctx => {
//       await ensureAdminPerms(app, ctx)
//       return {
//         type: D.InteractionResponseType.UpdateMessage,
//         data: {
//           content: ``,
//           embeds: [
//             {
//               title: `Delete ${escapeMd(ctx.state.data.ranking_name)}?`,
//               description: `This will delete all of its players and match history`,
//               color: Colors.EmbedBackground,
//             },
//           ],
//           components: [
//             {
//               type: D.ComponentType.ActionRow,
//               components: [
//                 {
//                   type: D.ComponentType.Button,
//                   label: `Delete`,
//                   custom_id: ctx.state.set.callback(onDeleteConfirmBtn).cId(),
//                   style: D.ButtonStyle.Danger,
//                 },
//                 {
//                   type: D.ComponentType.Button,
//                   label: `Cancel`,
//                   custom_id: ctx.state.set.callback(undefined).cId(),
//                   style: D.ButtonStyle.Secondary,
//                 },
//               ],
//             },
//           ],
//           flags: D.MessageFlags.Ephemeral,
//         },
//       }
//     },
//   }),
// })

// async function onSettingSelect(
//   app: App,
//   ctx: ComponentContext<typeof ranking_settings_view_signature>,
// ): Promise<ChatInteractionResponse> {
//   const value = (ctx.interaction.data as D.APIMessageStringSelectInteractionData).values[0]
//   if (!value) return { type: D.InteractionResponseType.DeferredMessageUpdate }
//   const guild_ranking = await app.db.guild_rankings.get({
//     guild_id: ctx.state.get.guild_id(),
//     ranking_id: ctx.state.get.ranking_id(),
//   })
//   return setting_select_menu_options(app)[value](guild_ranking).onSelect(ctx)
// }
