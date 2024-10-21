import * as D from 'discord-api-types/v10'
import {
  ChatInteractionResponse,
  ComponentContext,
  field,
  getModalSubmitEntries,
  MessageView,
  StateContext,
} from '../../../../../../discord-framework'
import { App } from '../../../../../context/app_context'
import { GuildRanking } from '../../../../../database/models'
import { Colors, escapeMd, messageLink } from '../../../../utils/converters'
import { ensureAdminPerms } from '../../../../utils/perms'
import { AppView } from '../../../../utils/view_module'
import { syncGuildRankingLbMessage } from '../../../leaderboard/leaderboard_messages'
import { sendGuildRankingQueueMessage } from '../../../matches/matchmaking/queue/queue_messages'
import { sendSelectChannelPage } from '../../../utils/views/pages/select_channel'
import { deleteRanking, updateRanking, validateRankingOptions } from '../../manage_rankings'
import { guildRankingDetails } from './all_rankings'
import { rankingNameTextInput } from './create_ranking'

export const ranking_settings_view = new MessageView({
  name: 'ranking settings',
  custom_id_prefix: 'rs',
  state_schema: {
    guild_id: field.String(),
    ranking_id: field.Int(),
    ranking_name: field.String(),
    edit: field.Bool(),
    callback: field.Choice({
      onSettingSelect,
      onLbChannelSelect,
      onRenameModalSubmit,
      onQueueChannelSelect,
      onDeleteConfirmBtn,
      eloSettingsPage,
    }),
    selected_channel_id: field.String(),
  },
})

export const rankingSettingsView = (app: App) =>
  ranking_settings_view.onComponent(async ctx => {
    if (ctx.state.data.callback) return ctx.state.data.callback(app, ctx)

    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredMessageUpdate,
      },
      async ctx => {
        const ranking = await app.db.rankings.get(ctx.state.get.ranking_id())
        return void (ctx.state.is.edit() ? ctx.edit : ctx.followup)(
          await guildRankingSettingsPage(app, {
            state: ranking_settings_view.newState({
              ranking_id: ranking.data.id,
              guild_id: ctx.state.get.guild_id(),
              edit: true,
              ranking_name: ranking.data.name,
            }),
          }),
        )
      },
    )
  })

export default new AppView(rankingSettingsView)

const setting_select_menu_options: Record<
  string,
  (
    app: App,
    guild_ranking: GuildRanking,
  ) => {
    name: string
    description: string
    onSelect: (
      app: App,
      ctx: ComponentContext<typeof ranking_settings_view>,
    ) => ChatInteractionResponse | Promise<ChatInteractionResponse>
  }
> = {
  rename: () => ({
    name: '✏️Rename',
    description: 'Rename the ranking',
    onSelect: (_, ctx) => ({
      type: D.InteractionResponseType.Modal,
      data: {
        custom_id: ctx.state.set.callback(onRenameModalSubmit).cId(),
        title: `Rename ${ctx.state.get.ranking_name()}`,
        components: [rankingNameTextInput()],
      },
    }),
  }),
  leaderboard_msg: () => ({
    name: '🏅Send Leaderboard',
    description: 'Send a live-updating leaderboard to a channel',
    onSelect: (app, ctx) => {
      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredMessageUpdate,
        },
        async ctx => {
          await ctx.edit(
            await sendSelectChannelPage(app, ctx.interaction, {
              submit_cid: ctx.state.set.callback(onLbChannelSelect).cId(),
              channel_id_field: 'selected_channel_id',
              text_only: true,
            }),
          )
        },
      )
    },
  }),
  queue_message: () => ({
    name: '⚔️Send Queue Message',
    description: 'Send a queue message to a channel',
    onSelect: (app, ctx) => {
      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredMessageUpdate,
        },
        async ctx => {
          await ctx.edit(
            await sendSelectChannelPage(app, ctx.interaction, {
              submit_cid: ctx.state.set.callback(onQueueChannelSelect).cId(),
              channel_id_field: 'selected_channel_id',
              text_only: true,
            }),
          )
        },
      )
    },
  }),
  match_logs: (_, guild_ranking) => {
    return {
      name: guild_ranking.data.display_settings?.log_matches
        ? '📜Disable Match Logs'
        : '📜Enable Match Logs',
      description: guild_ranking.data.display_settings?.log_matches
        ? `Stop logging matches from this ranking to the chosen channel`
        : `Log the results of matches to a channel`,
      onSelect: async (app, ctx) => {
        return ctx.defer(
          {
            type: D.InteractionResponseType.DeferredMessageUpdate,
          },
          async ctx => {
            await ensureAdminPerms(app, ctx)
            const guild_ranking = await app.db.guild_rankings.get({
              guild_id: ctx.state.get.guild_id(),
              ranking_id: ctx.state.get.ranking_id(),
            })

            const display_settings = guild_ranking.data.display_settings ?? {}
            const log_matches = !display_settings.log_matches

            await guild_ranking.update({
              display_settings: {
                ...display_settings,
                log_matches,
              },
            })
            await ctx.edit(await guildRankingSettingsPage(app, ctx))
          },
        )
      },
    }
  },
  delete: () => ({
    name: '🗑️Delete',
    description: 'Delete this ranking',
    onSelect: async (app, ctx) => {
      await ensureAdminPerms(app, ctx)
      return {
        type: D.InteractionResponseType.UpdateMessage,
        data: {
          content: ``,
          embeds: [
            {
              title: `Delete ${escapeMd(ctx.state.data.ranking_name)}?`,
              description: `This will delete all of its players and match history`,
              // +`\nAlternatively, you can disable, start a new season, or reset the ranking's players to retain its history`
              color: Colors.EmbedBackground,
            },
          ],
          components: [
            {
              type: D.ComponentType.ActionRow,
              components: [
                {
                  type: D.ComponentType.Button,
                  label: `Cancel`,
                  custom_id: ctx.state.set.callback(undefined).cId(),
                  style: D.ButtonStyle.Secondary,
                },
                {
                  type: D.ComponentType.Button,
                  label: `Delete`,
                  custom_id: ctx.state.set.callback(onDeleteConfirmBtn).cId(),
                  style: D.ButtonStyle.Danger,
                },
              ],
            },
          ],
          flags: D.MessageFlags.Ephemeral,
        },
      }
    },
  }),
}

export async function guildRankingSettingsPage(
  app: App,
  ctx: StateContext<typeof ranking_settings_view>,
): Promise<D.APIInteractionResponseCallbackData> {
  const guild_ranking = await app.db.guild_rankings.get({
    guild_id: ctx.state.get.guild_id(),
    ranking_id: ctx.state.get.ranking_id(),
  })

  const embed: D.APIEmbed = {
    title: `${escapeMd(ctx.state.data.ranking_name)}`,
    description: await guildRankingDetails(app, guild_ranking, { queue_teams: true }),
    color: Colors.EmbedBackground,
  }

  const select_menu: D.APISelectMenuComponent = {
    type: D.ComponentType.StringSelect,
    custom_id: ctx.state.set.callback(onSettingSelect).cId(),
    placeholder: `Select a setting`,
    options: await Promise.all(
      Object.entries(setting_select_menu_options).map(async ([value, option]) => ({
        label: option(app, guild_ranking).name,
        value,
        description: option(app, guild_ranking).description,
      })),
    ),
  }

  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [
    {
      type: D.ComponentType.ActionRow,
      components: [select_menu],
    },
  ]

  return {
    flags: D.MessageFlags.Ephemeral,
    embeds: [embed],
    content: ``,
    components,
  }
}

async function onSettingSelect(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view>,
): Promise<ChatInteractionResponse> {
  const value = (ctx.interaction.data as D.APIMessageStringSelectInteractionData).values[0]
  if (!value) return { type: D.InteractionResponseType.DeferredMessageUpdate }
  const guild_ranking = await app.db.guild_rankings.get({
    guild_id: ctx.state.get.guild_id(),
    ranking_id: ctx.state.get.ranking_id(),
  })
  return setting_select_menu_options[value](app, guild_ranking).onSelect(app, ctx)
}

async function onRenameModalSubmit(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      await ensureAdminPerms(app, ctx)
      const ranking = await app.db.rankings.get(ctx.state.get.ranking_id())
      const old_name = ranking.data.name
      const name = validateRankingOptions({
        name: getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)['name'].value,
      }).name

      const res = await ctx.followup({
        content: `Renaming ${escapeMd(old_name)} to ${escapeMd(name)}`,
        flags: D.MessageFlags.Ephemeral,
      })
      await updateRanking(app, ranking, { name })
      ctx.state.save.ranking_name(name)
      return void Promise.all([
        ctx.edit(await guildRankingSettingsPage(app, ctx)),
        ctx.delete(res.id),
      ])
    },
  )
}

async function onLbChannelSelect(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view>,
): Promise<ChatInteractionResponse> {
  // send leaderboard message
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const lb_channel_id = ctx.state.data.selected_channel_id

      if (!lb_channel_id) {
        return void ctx.edit(await guildRankingSettingsPage(app, ctx))
      }
      await ensureAdminPerms(app, ctx)

      const guild_ranking = await app.db.guild_rankings.get({
        guild_id: ctx.state.get.guild_id(),
        ranking_id: ctx.state.get.ranking_id(),
      })

      await guild_ranking.update({
        leaderboard_channel_id: lb_channel_id,
        display_settings: {
          ...guild_ranking.data.display_settings,
          leaderboard_message: true,
        },
      })
      await syncGuildRankingLbMessage(app, guild_ranking)
      await ctx.edit(await guildRankingSettingsPage(app, ctx))
      await ctx.followup({
        embeds: [
          {
            title: `Leaderboard Created`,
            description: `The leaderboard for this ranking will now be updated live here ${messageLink(
              guild_ranking.data.guild_id,
              lb_channel_id,
              guild_ranking.data.leaderboard_message_id ?? '0',
            )}`,
            color: Colors.Success,
          },
        ],
        flags: D.MessageFlags.Ephemeral,
      })
    },
  )
}

async function onQueueChannelSelect(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const queue_channel_id = ctx.state.data.selected_channel_id

      if (!queue_channel_id) {
        return void ctx.edit(await guildRankingSettingsPage(app, ctx))
      }
      const guild_ranking = await app.db.guild_rankings.get({
        guild_id: ctx.state.get.guild_id(),
        ranking_id: ctx.state.get.ranking_id(),
      })

      await ensureAdminPerms(app, ctx)
      const result = await sendGuildRankingQueueMessage(app, guild_ranking, queue_channel_id)
      await ctx.edit(await guildRankingSettingsPage(app, ctx))
      await ctx.followup({
        embeds: [
          {
            title: `Queue Message Created`,
            description: `${messageLink(
              guild_ranking.data.guild_id,
              queue_channel_id,
              result.message_id,
            )}`,
            color: Colors.Success,
          },
        ],
        flags: D.MessageFlags.Ephemeral,
      })
    },
  )
}

function onDeleteConfirmBtn(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view>,
): ChatInteractionResponse {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const ranking = await app.db.rankings.get(ctx.state.get.ranking_id())
      await deleteRanking(app, ranking)
      return void ctx.edit({
        flags: D.MessageFlags.Ephemeral,
        content: `Deleted **\`${escapeMd(
          ranking.data.name,
        )}\`** and all of its players and matches`,
        embeds: [],
        components: [],
      })
    },
  )
}

async function eloSettingsPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_view>,
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
