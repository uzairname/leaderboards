import * as D from 'discord-api-types/v10'
import {
  MessageView,
  ChatInteractionContext,
  ComponentContext,
  ChatInteractionResponse,
  getModalSubmitEntries
} from '../../../../discord-framework'
import { nonNullable } from '../../../../utils/utils'
import { App } from '../../../app/app'
import { Colors, toMarkdown } from '../../../messages/message_pieces'
import { updateRanking, deleteRanking } from '../../../modules/rankings/rankings'
import { checkGuildInteraction, ensureAdminPerms } from '../../utils/checks'
import { rankings_cmd_def, guildRankingDetails } from './rankings'

export const ranking_settings_page = (app: App) =>
  new MessageView({
    custom_id_prefix: 'rs',
    state_schema: {}
  }).onComponent(async ctx => {
    return {
      type: D.InteractionResponseType.DeferredChannelMessageWithSource
    }
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
  ctx: ChatInteractionContext<typeof rankings_cmd_def, any>
): Promise<D.APIInteractionResponseCallbackData> {
  ctx.state.save.page('ranking settings')
  const selected_ranking_id = ctx.state.get('selected_ranking_id')

  const interaction = checkGuildInteraction(ctx.interaction)

  const guild_ranking = await app.db.guild_rankings.get({
    guild_id: interaction.guild_id,
    ranking_id: selected_ranking_id
  })
  const ranking = await guild_ranking.ranking()

  const embed: D.APIEmbed = {
    title: ranking.data.name || 'Unnamed Ranking',
    description: await guildRankingDetails(app, guild_ranking, ranking),
    color: Colors.EmbedBackground
  }

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
            style: D.ButtonStyle.Secondary,
            custom_id: ctx.state.set.component('btn:rename').encode(),
            label: 'Rename'
          },
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Danger,
            custom_id: ctx.state.set.component('btn:delete').encode(),
            label: 'Delete'
          }
        ]
      }
    ]
  }
}
export async function onRenameModal(
  app: App,
  ctx: ComponentContext<typeof rankings_cmd_def>
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)
  const ranking = await app.db.rankings.get(ctx.state.get('selected_ranking_id'))
  const old_name = ranking.data.name

  await updateRanking(app, ranking, {
    name: nonNullable(
      getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction).find(
        c => c.custom_id === 'name'
      )?.value,
      'input name'
    )
  })

  return {
    type: D.InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: `Renamed **${toMarkdown(old_name)}** to **${toMarkdown(ranking.data.name)}**`,
      flags: D.MessageFlags.Ephemeral
    }
  }
}
export async function onBtnDelete(
  app: App,
  ctx: ChatInteractionContext<typeof rankings_cmd_def>
): Promise<D.APIModalInteractionResponse> {
  const ranking = await app.db.rankings.get(ctx.state.get('selected_ranking_id'))

  let response: D.APIModalInteractionResponse = {
    type: D.InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.component('modal:delete confirm').encode(),
      title: `Delete ${ranking.data.name}?`,
      components: [
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.TextInput,
              label: `Type "delete" to delete`.substring(0, 45),
              placeholder: `delete`,
              custom_id: 'name',
              style: D.TextInputStyle.Short
            }
          ]
        }
      ]
    }
  }
  return response
}
export async function onDeleteModal(
  app: App,
  ctx: ComponentContext<typeof rankings_cmd_def>
): Promise<ChatInteractionResponse> {
  let input = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction).find(
    c => c.custom_id === 'name'
  )?.value

  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate
    },
    async ctx => {
      const ranking = await app.db.rankings.get(ctx.state.get('selected_ranking_id'))

      if (input?.toLowerCase() !== 'delete') {
        await ctx.followup({
          flags: D.MessageFlags.Ephemeral,
          content: `Didn't delete ${ranking.data.name}`
        })
      }

      await ensureAdminPerms(app, ctx)
      await deleteRanking(app, ranking)
      return await ctx.edit({
        flags: D.MessageFlags.Ephemeral,
        content: `Deleted **\`${ranking.data.name}\`** and all of its players and matches`,
        embeds: [],
        components: []
      })
    }
  )
}
