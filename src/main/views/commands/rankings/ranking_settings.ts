import * as D from 'discord-api-types/v10'
import {
  MessageView,
  InteractionContext,
  ComponentContext,
  ChatInteractionResponse,
  getModalSubmitEntries,
  _,
  $type,
  StateContext,
  field,
} from '../../../../discord-framework'
import { sentry } from '../../../../request/sentry'
import { nonNullable } from '../../../../utils/utils'
import { App } from '../../../app/app'
import { Colors, escapeMd, truncateString } from '../../../messages/message_pieces'
import {
  updateRanking,
  deleteRanking,
  validateRankingOptions,
} from '../../../modules/rankings/rankings'
import { checkGuildInteraction, ensureAdminPerms } from '../../utils/checks'
import { guildRankingDetails, rankingNameTextInput } from './rankings'

export const ranking_settings_page_def = new MessageView({
  name: 'ranking settings',
  custom_id_id: 'rs',
  state_schema: {
    ranking_id: field.Int(),
    on_page: field.Choice({
      ranking_settings: _,
    }),
    component: field.Choice({
      'btn:rename': _,
      'modal:rename': _,

      'btn:restore': _,

      'btn:reset': _,
      'btn:reset confirm': _,

      'btn:delete': _,
      'btn:delete confirm': _,
    }),
  },
  param: $type<{ ranking_id: number }>,
})

export const rankingSettings = (app: App) =>
  ranking_settings_page_def.onComponent(async ctx => {
    if (ctx.state.is.component('btn:rename')) {
      return await rankingRenameModal(app, ctx)
    }
    if (ctx.state.is.component('modal:rename')) {
      return await onRenameModal(app, ctx)
    }
    if (ctx.state.is.component('btn:restore')) {
      return await onRestoreBtn(app, ctx)
    }
    if (ctx.state.is.component('btn:delete')) {
      return await deleteConfirmMessage(app, ctx)
    }
    if (ctx.state.is.component('btn:delete confirm')) {
      return onDeleteConfirmBtn(app, ctx)
    }

    return ctx.defer(
      {
        type: ctx.state.is.on_page('ranking_settings')
          ? D.InteractionResponseType.DeferredMessageUpdate
          : D.InteractionResponseType.DeferredChannelMessageWithSource,
        data: {
          flags: D.MessageFlags.Ephemeral,
        },
      },
      async ctx => {
        ctx.edit(
          await rankingSettingsPage(
            app,
            ctx.state.get('ranking_id'),
            checkGuildInteraction(ctx.interaction).guild_id,
          ),
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
 * @param app
 * @returns
 */
export async function rankingSettingsPage(
  app: App,
  ranking_id: number,
  guild_id: string,
): Promise<D.APIInteractionResponseCallbackData> {
  const guild_ranking = await app.db.guild_rankings.get({
    guild_id,
    ranking_id,
  })
  const ranking = await guild_ranking.ranking()

  const embed: D.APIEmbed = {
    title: ranking.data.name || 'Unnamed Ranking',
    description: await guildRankingDetails(app, guild_ranking, ranking),
    color: Colors.EmbedBackground,
  }

  const state = ranking_settings_page_def.getState({ ranking_id, on_page: 'ranking_settings' })

  return {
    flags: D.MessageFlags.Ephemeral,
    embeds: [embed],
    content: ``,
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Primary,
            custom_id: state.set.component('btn:rename').cId(),
            label: 'Rename',
          },
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Primary,
            custom_id: state.set.component('btn:restore').cId(),
            label: 'Restore',
          },
          // {
          //   type: D.ComponentType.Button,
          //   style: D.ButtonStyle.Secondary,
          //   custom_id: state.set.component('btn:reset').cId(),
          //   label: 'Reset',
          // },
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Danger,
            custom_id: state.set.component('btn:delete').cId(),
            label: 'Delete',
          },
        ],
      },
    ],
  }
}

async function rankingRenameModal(
  app: App,
  ctx: StateContext<typeof ranking_settings_page_def>,
): Promise<D.APIModalInteractionResponse> {
  const old_name = (await app.db.rankings.get(ctx.state.get('ranking_id'))).data.name
  return {
    type: D.InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.component('modal:rename').cId(),
      title: `Rename ${old_name}`,
      components: [rankingNameTextInput()],
    },
  }
}

async function onRenameModal(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_def>,
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
        content: `Renaming ${old_name} to ${name}`,
        flags: D.MessageFlags.Ephemeral,
      })
      await updateRanking(app, ranking, { name })
      await ctx.edit(
        await rankingSettingsPage(
          app,
          ranking.data.id,
          checkGuildInteraction(ctx.interaction).guild_id,
        ),
      )
      await ctx.delete(res.id)
    },
  )
}

async function onRestoreBtn(
  app: App,
  ctx: ComponentContext<typeof ranking_settings_page_def>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      await ensureAdminPerms(app, ctx)
      const ranking = await app.db.rankings.get(ctx.state.get('ranking_id'))
      const res = await ctx.followup({
        content: `Restoring ${ranking.data.name}'s channels and messages`,
        flags: D.MessageFlags.Ephemeral,
      })
      await app.events.RankingUpdated.emit(ranking)

      await ctx.edit(
        await rankingSettingsPage(
          app,
          ranking.data.id,
          checkGuildInteraction(ctx.interaction).guild_id,
        ),
      )
      await ctx.delete(res.id)
    },
  )
}

async function deleteConfirmMessage(
  app: App,
  ctx: InteractionContext<typeof ranking_settings_page_def>,
): Promise<ChatInteractionResponse> {
  const ranking = await app.db.rankings.get(ctx.state.get('ranking_id'))

  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: {
      content: undefined,
      embeds: [
        {
          title: `Delete ${escapeMd(ranking.data.name)}?`,
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
              custom_id: ctx.state.set.component(undefined).cId(),
              style: D.ButtonStyle.Secondary,
            },
            {
              type: D.ComponentType.Button,
              label: `Delete`,
              custom_id: ctx.state.set.component('btn:delete confirm').cId(),
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
  ctx: ComponentContext<typeof ranking_settings_page_def>,
): ChatInteractionResponse {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      await ensureAdminPerms(app, ctx)
      const ranking = await app.db.rankings.get(ctx.state.get('ranking_id'))
      await deleteRanking(app, ranking)
      return await ctx.edit({
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
