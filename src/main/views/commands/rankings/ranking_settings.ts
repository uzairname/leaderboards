import * as D from 'discord-api-types/v10'
import {
  MessageView,
  InteractionContext,
  ComponentContext,
  ChatInteractionResponse,
  getModalSubmitEntries,
  _,
  StateContext,
  field,
} from '../../../../discord-framework'
import { App } from '../../../app/app'
import { Colors, escapeMd, messageLink } from '../../../messages/message_pieces'
import { sendGuildRankingQueueMessage } from '../../../modules/matches/matchmaking/queue_messages'
import {
  updateRanking,
  deleteRanking,
  validateRankingOptions,
} from '../../../modules/rankings/manage_rankings'
import { syncGuildRankingLbMessage } from '../../../modules/rankings/ranking_channels'
import { select_channel_view } from '../../helpers/select_channel'
import { ensureAdminPerms } from '../../utils/checks'
import { rankingNameTextInput } from './create_ranking'
import { guildRankingDetails } from './rankings_cmd'

export const ranking_settings_page = new MessageView({
  name: 'ranking settings',
  custom_id_prefix: 'rs',
  state_schema: {
    guild_id: field.String(),
    ranking_id: field.Int(),
    ranking_name: field.String(),
    edit: field.Bool(),
    callback: field.Choice({
      rankingRenameModal,
      onRenameModalSubmit,
      onLbChannelSelect,
      onQueueChannelSelect,
      onDeleteBtn,
      onDeleteConfirmBtn,
      eloSettingsPage,
      onMatchLoggingBtn,
    }),
    selected_channel_id: field.String(),
  },
})

export const rankingSettingsView = (app: App) =>
  ranking_settings_page.onComponent(async ctx => {
    if (ctx.state.is.callback()) return ctx.state.get('callback')(app, ctx)

    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredMessageUpdate,
      },
      async ctx => {
        const ranking = await app.db.rankings.get(ctx.state.get('ranking_id'))
        return void (ctx.state.is.edit() ? ctx.edit : ctx.followup)(
          await guildRankingSettingsPage(app, {
            state: ranking_settings_page.newState({
              ranking_id: ranking.data.id,
              guild_id: ctx.state.get('guild_id'),
              edit: true,
              ranking_name: ranking.data.name,
            }),
          }),
        )
      },
    )
  })

/**
 * Ranking settings page:
 * Rename
 * Delete
 * Change rank roles
 * Reset
 * Specify match results channel
 * Specify ongoing matches channel
 * specify queue message
 * @param app
 * @returns
 */
export async function guildRankingSettingsPage(
  app: App,
  ctx: StateContext<typeof ranking_settings_page>,
): Promise<D.APIInteractionResponseCallbackData> {
  const ranking = await app.db.rankings.get(ctx.state.get('ranking_id'))
  const guild_ranking = await app.db.guild_rankings.get({
    guild_id: ctx.state.get('guild_id'),
    ranking_id: ctx.state.get('ranking_id'),
  })

  const embed: D.APIEmbed = {
    title: `${escapeMd(ctx.state.data.ranking_name)}`,
    description: await guildRankingDetails(app, guild_ranking, { queue_teams: true }),
    color: Colors.EmbedBackground,
  }

  const btns1: D.APIMessageActionRowComponent[] = [
    {
      type: D.ComponentType.Button,
      label: 'Rename',
      custom_id: ctx.state.set.callback(rankingRenameModal).cId(),
      style: D.ButtonStyle.Primary,
    },
    {
      type: D.ComponentType.Button,
      label: 'Send Live Leaderboard',
      custom_id: select_channel_view
        .newState({
          submit_cid: ctx.state.set.callback(onLbChannelSelect).cId(),
          channel_id_field: 'selected_channel_id',
          text_only: true,
        })
        .cId(),
      style: D.ButtonStyle.Primary,
    },
    {
      type: D.ComponentType.Button,
      label: 'Send Queue Message',
      custom_id: select_channel_view
        .newState({
          submit_cid: ctx.state.set.callback(onQueueChannelSelect).cId(),
          channel_id_field: 'selected_channel_id',
          text_only: true,
        })
        .cId(),
      style: D.ButtonStyle.Primary,
    },
    {
      type: D.ComponentType.Button,
      label:
        (guild_ranking.data.display_settings?.log_matches ? `Disable` : `Enable`) +
        ` Match Logging`,
      custom_id: ctx.state.set.callback(onMatchLoggingBtn).cId(),
      style: guild_ranking.data.display_settings?.log_matches
        ? D.ButtonStyle.Primary
        : D.ButtonStyle.Secondary,
    },
    {
      type: D.ComponentType.Button,
      label: 'Delete',
      custom_id: ctx.state.set.callback(onDeleteBtn).cId(),
      style: D.ButtonStyle.Danger,
    },
  ]

  const btns2: D.APIButtonComponent[] = [
    {
      type: D.ComponentType.Button,
      label: 'Elo Settings',
      custom_id: ctx.state.set.callback(eloSettingsPage).cId(),
      style: D.ButtonStyle.Primary,
    },
  ]

  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [
    {
      type: D.ComponentType.ActionRow,
      components: btns1,
    },
  ]

  if (app.config.features.EloSettings) {
    components.push({
      type: D.ComponentType.ActionRow,
      components: btns2,
    })
  }

  return {
    flags: D.MessageFlags.Ephemeral,
    embeds: [embed],
    content: ``,
    components,
  }
}

function rankingRenameModal(
  app: App,
  ctx: StateContext<typeof ranking_settings_page>,
): D.APIModalInteractionResponse {
  return {
    type: D.InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.callback(onRenameModalSubmit).cId(),
      title: `Rename ${ctx.state.get('ranking_name')}`,
      components: [rankingNameTextInput()],
    },
  }
}

async function onRenameModalSubmit(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      await ensureAdminPerms(app, ctx)
      const ranking = await app.db.rankings.get(ctx.state.get('ranking_id'))
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
  ctx: ComponentContext<typeof ranking_settings_page>,
): Promise<ChatInteractionResponse> {
  // send leaderboard message
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const lb_channel_id = ctx.state.data.selected_channel_id

      if (lb_channel_id) {
        await ensureAdminPerms(app, ctx)

        const guild_ranking = await app.db.guild_rankings.get({
          guild_id: ctx.state.get('guild_id'),
          ranking_id: ctx.state.get('ranking_id'),
        })

        await guild_ranking.update({
          leaderboard_channel_id: lb_channel_id,
          display_settings: {
            ...guild_ranking.data.display_settings,
            leaderboard_message: true,
          },
        })
        await syncGuildRankingLbMessage(app, guild_ranking)

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
      }

      await ctx.edit(await guildRankingSettingsPage(app, ctx))
    },
  )
}

async function onQueueChannelSelect(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const queue_channel_id = ctx.state.data.selected_channel_id

      if (queue_channel_id) {
        const guild_ranking = await app.db.guild_rankings.get({
          guild_id: ctx.state.get('guild_id'),
          ranking_id: ctx.state.get('ranking_id'),
        })

        await ensureAdminPerms(app, ctx)
        const result = await sendGuildRankingQueueMessage(app, guild_ranking, queue_channel_id)
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
      }

      await ctx.edit(await guildRankingSettingsPage(app, ctx))
    },
  )
}

async function onDeleteBtn(
  app: App,
  ctx: InteractionContext<typeof ranking_settings_page>,
): Promise<ChatInteractionResponse> {
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
}

function onDeleteConfirmBtn(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page>,
): ChatInteractionResponse {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const ranking = await app.db.rankings.get(ctx.state.get('ranking_id'))
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

async function onMatchLoggingBtn(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const guild_ranking = await app.db.guild_rankings.get({
        guild_id: ctx.state.get('guild_id'),
        ranking_id: ctx.state.get('ranking_id'),
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
}

async function eloSettingsPage(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page>,
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
