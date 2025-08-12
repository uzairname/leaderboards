import { ChatInteractionResponse, ComponentContext, Context, getModalSubmitEntries } from '@repo/discord'
import { intOrNull } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { RankRolesSettingsPages } from '.'
import { App } from '../../../../setup/app'
import { setRankRole, unsetRankRole, updateRankRolesForGuildRanking } from '../../../players/rank-roles'
import { rank_roles_settings_view_sig } from './view'

export async function sendMainPage(
  app: App,
  ctx: Context<typeof rank_roles_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await RankRolesSettingsPages.main(app, ctx),
  }
}

/**
 * Called when a role selection is made from the dropdown
 */
export async function onRankRoleSelect(
  app: App,
  ctx: ComponentContext<typeof rank_roles_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  const data = ctx.interaction.data as D.APIMessageRoleSelectInteractionData
  const selected_role_id = data.resolved.roles?.[data.values[0]]?.id
  ctx.state.save.selected_role_id(selected_role_id)

  const { guild_ranking } = await app.db.guild_rankings.fetch({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })

  const existing_role = guild_ranking.data.rank_roles?.find(rr => rr.role_id === selected_role_id)

  if (!existing_role) {
    // If it is not set, send the modal to set the range.
    return sendEditRangeModal(app, ctx)
  } else {
    // If set, send settings page
    return {
      type: D.InteractionResponseType.UpdateMessage,
      data: await RankRolesSettingsPages.rankRoleSettings(app, ctx, selected_role_id),
    }
  }
}

export async function onUnsetRankRole(
  app: App,
  ctx: ComponentContext<typeof rank_roles_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {

    const original_msg_id = ctx.interaction.message?.id
    const followup = await ctx.followup({
      content: `Removing role from members...`,
      flags: D.MessageFlags.Ephemeral,
    })

    const selected_role_id = ctx.state.get.selected_role_id()
  
    const { guild_ranking } = await app.db.guild_rankings.fetch({
      guild_id: ctx.interaction.guild_id,
      ranking_id: ctx.state.get.ranking_id(),
    })
  
    // Unset the rank role
    await unsetRankRole(selected_role_id, guild_ranking)
    await updateRankRolesForGuildRanking(app, guild_ranking)
  
    await ctx.delete(followup.id)
    return void ctx.edit(await RankRolesSettingsPages.main(app, ctx), original_msg_id)
  })
}

export async function sendEditRangeModal(
  app: App,
  ctx: ComponentContext<typeof rank_roles_settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.Modal,
    data: {
      title: 'Please enter the desired rating range',
      custom_id: ctx.state.set.handler(onEditRangeModalSubmit).cId(),
      components: [
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.TextInput,
              custom_id: 'min_rating',
              label: 'Min rating (inclusive)',
              style: D.TextInputStyle.Short,
              placeholder: 'Leave blank for no minimum',
              required: false,
            },
          ],
        },
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.TextInput,
              custom_id: 'max_rating',
              label: 'Max rating (exclusive)',
              style: D.TextInputStyle.Short,
              placeholder: 'Leave blank for no maximum',
              required: false,
            },
          ],
        },
      ],
    },
  }
}

export async function onEditRangeModalSubmit(
  app: App,
  ctx: ComponentContext<typeof rank_roles_settings_view_sig>,
): Promise<ChatInteractionResponse> {

  return ctx.defer(async ctx => {

    const original_msg_id = ctx.interaction.message?.id
    const followup = await ctx.followup({
      content: `Updating role assignment...`,
      flags: D.MessageFlags.Ephemeral,
    })
    
    const entries = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)
    const selected_role_id = ctx.state.get.selected_role_id()
  
    const min_rating = intOrNull(entries['min_rating']?.value)
    const max_rating = intOrNull(entries['max_rating']?.value)
  
    // Update the rank role with the new range
    const { guild_ranking } = await app.db.guild_rankings.fetch({
      guild_id: ctx.interaction.guild_id,
      ranking_id: ctx.state.get.ranking_id(),
    })

    await setRankRole(selected_role_id, min_rating, max_rating, guild_ranking)
    await updateRankRolesForGuildRanking(app, guild_ranking)
  
    await ctx.delete(followup.id)
    return void ctx.edit(await RankRolesSettingsPages.main(app, ctx), original_msg_id)

  })
}
