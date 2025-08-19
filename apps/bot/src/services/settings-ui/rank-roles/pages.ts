import { ActionRowBuilder, ButtonBuilder, ContainerBuilder, EmbedBuilder, RoleSelectMenuBuilder, SeparatorBuilder, TextDisplayBuilder } from '@discordjs/builders'
import { Context, MessageData } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { RankRolesSettingsHandlers } from '.'
import { App } from '../../../setup/app'
import { breadcrumbsTitle, escapeMd } from '../../../utils'
import { DEFAULT_LB_COLOR } from '../../rankings/properties'
import { settings_view_sig } from '../settings/view'
import { rank_roles_settings_view_sig } from './view'

/**
 * Main page for rank role settings
 */
export async function main(
  app: App,
  ctx: Context<typeof rank_roles_settings_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const { ranking, guild_ranking } = await app.db.guild_rankings.fetch({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })

  const rank_roles = guild_ranking.data.rank_roles || []

  const components: D.APIMessageTopLevelComponent[] = []

  components.push(new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder({
      content: `## Rank Roles Settings for ${escapeMd(ranking.data.name)}` +
        `\nRank roles are automatically assigned to players when their rating in this ranking enters a certain range.` +
        `\nThe roles must be below the bot's highest role in the server.` +
        `\n# Current Rank Roles and Their Ranges` +
        `\n` +
        (rank_roles.length > 0
          ? rank_roles
              .map(rr => `<@&${rr.role_id}>: **${rr.min_rating ?? '-∞'} to ${rr.max_rating ?? '∞'}**`)
              .join('\n')
          : `-# No rank roles are set for this ranking.`) + 
        `\n\nYou can add a new role or edit an existing one by selecting it from the dropdown.`
    }))
    .addSeparatorComponents(new SeparatorBuilder({spacing: D.SeparatorSpacingSize.Large}))
    .addActionRowComponents(
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder({
          custom_id: ctx.state.set.handler(RankRolesSettingsHandlers.onRankRoleSelect).cId(),
          placeholder: `Select a Role`,
          min_values: 1,
          max_values: 1,
        })
      )
    ).setAccentColor(guild_ranking.data.display_settings?.color ?? DEFAULT_LB_COLOR)
    .toJSON())

  if (ctx.state.data.selected_role_id) {
    components.push(new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder({
        content: `## Selected Role: <@&${ctx.state.data.selected_role_id}>`
      }))
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().setComponents(
          new ButtonBuilder({
            label: `Done`,
            custom_id: ctx.state.set.handler(RankRolesSettingsHandlers.sendMainPage).cId(),
            style: D.ButtonStyle.Secondary,
            emoji: { name: '✅' },
          }),
          new ButtonBuilder({
            label: `Edit Range`,
            custom_id: ctx.state.set.handler(RankRolesSettingsHandlers.sendEditRangeModal).cId(),
            style: D.ButtonStyle.Primary,
            emoji: { name: '↕️' },
          }),
          new ButtonBuilder({
            label: `Unset Role`,
            custom_id: ctx.state.set.handler(RankRolesSettingsHandlers.onUnsetRankRole).cId(),
            style: D.ButtonStyle.Secondary,
            emoji: { name: '❌' },
          }),
        ),
      ).toJSON())
  }


  const back_btn_row = new ActionRowBuilder<ButtonBuilder>()
    .setComponents(
      new ButtonBuilder({
        label: `Back`,
        custom_id: settings_view_sig.newState().cId(),
        style: D.ButtonStyle.Secondary,
        emoji: { name: '⬅️' },
      }),
    )

  components.push(back_btn_row.toJSON())

  return new MessageData({
    components,
  }).addFlags(D.MessageFlags.Ephemeral | D.MessageFlags.IsComponentsV2).response_data

}

export async function rankRoleSettings(
  app: App,
  ctx: Context<typeof rank_roles_settings_view_sig>,
  role_id: string,
): Promise<D.APIInteractionResponseCallbackData> {
  const { guild_ranking, ranking } = await app.db.guild_rankings.fetch({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })

  const role = await app.discord.getRole(ctx.interaction.guild_id, role_id)

  const rank_roles = guild_ranking.data.rank_roles || []

  const existing_role = rank_roles.find(rr => rr.role_id === role_id)

  if (!existing_role) {
    throw new Error(`Role with ID ${role_id} is not a rank role for ranking ${ranking.data.name}`)
  }

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder({
      content: `## Settings for Role <@&${role.id}>`
    }))
    .setAccentColor(guild_ranking.data.display_settings?.color ?? DEFAULT_LB_COLOR)

  return {
    embeds: [
      new EmbedBuilder({
        title: breadcrumbsTitle(
          `Settings`,
          `Rankings`,
          escapeMd(ranking.data.name),
          `Rating Role`,
          escapeMd(role.name),
        ),
        description:
          `# Settings for role <@&${role.id}>` +
          `\n - Minimum Rating: ${existing_role.min_rating ?? '-∞'}` +
          `\n - Maximum Rating: ${existing_role.max_rating ?? '∞'}`,
        color: guild_ranking.data.display_settings?.color ?? DEFAULT_LB_COLOR,
      }).toJSON(),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>()
        .setComponents(
          new ButtonBuilder({
            label: `Back`,
            custom_id: ctx.state.set.handler(RankRolesSettingsHandlers.sendMainPage).cId(),
            style: D.ButtonStyle.Secondary,
            emoji: { name: '⬅️' },
          }),
          new ButtonBuilder({
            label: `Edit Range`,
            custom_id: ctx.state.set.handler(RankRolesSettingsHandlers.sendEditRangeModal).cId(),
            style: D.ButtonStyle.Primary,
            emoji: { name: '↕️' },
          }),
          new ButtonBuilder({
            label: `Unset Role`,
            custom_id: ctx.state.set.handler(RankRolesSettingsHandlers.onUnsetRankRole).cId(),
            style: D.ButtonStyle.Secondary,
            emoji: { name: '❌' },
          }),
        )
        .toJSON(),
      // Add more components for the rank role settings here
    ],
  }
}
