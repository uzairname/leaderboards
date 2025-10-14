import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  MessageActionRowComponentBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} from '@discordjs/builders'
import { AnyGuildInteractionContext, MessageData } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { SettingsHandlers } from '.'
import { liveLbMsgLink } from '../../../services/rankings/properties'
import { Colors, commandMention, escapeMd } from '../../../services/utils/strings'
import { App } from '../../../setup/app'
import { help_view_sig } from '../../help/view'
import * as RankingSettingsHandlers from '../ranking-settings/handlers'
import { ranking_settings_view_sig } from '../ranking-settings/view'
import { settings_cmd } from './cmd'
import { settings_view_sig } from './view'

export async function main(app: App, ctx: AnyGuildInteractionContext): Promise<D.APIInteractionResponseCallbackData> {
  const guild = await app.guilds.get(app, ctx.interaction.guild_id)
  const grs = await app.db.guild_rankings.fetch({ guild_id: guild.data.id })

  const rankings_desc = new TextDisplayBuilder({
    content:
      `\n## Rankings` +
      `\n` +
      (grs.length === 0
        ? `${escapeMd(guild.data.name)} has no rankings. Get started by clicking the button below.` +
          `\n\n**When you create a ranking:**` +
          `\n- The bot will create a publicly visible category for all ranking-related messages.` +
          `\n- You may rename and rearrange any roles or channels that the bot creates.` +
          `\n- You can disable any of these features later in the ranking settings.`
        : `${escapeMd(guild.data.name)} has **${grs.length}** ranking${grs.length === 1 ? `` : `s`}. Adjust their settings by clicking a gear icon below.`),
  })

  // Choose the first 5 rankings to show.
  const grs_limited = grs.slice(0, 5)

  const sections: SectionBuilder[] = await Promise.all(
    grs_limited.map(async gr => {
      const lb_msg_link = liveLbMsgLink(gr.guild_ranking)
      const props = app.rankings.getProperties(gr.ranking)

      const desc =
        `**${escapeMd(gr.ranking.data.name)}**` +
        (lb_msg_link ? `\nLeaderboard channel: ${lb_msg_link}` : `\nNo leaderboard channel set`) +
        `\nMatch type: **${props.match_type_name}**`

      return new SectionBuilder({
        components: [
          {
            type: D.ComponentType.TextDisplay,
            content: desc,
          },
        ],
        accessory: {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Secondary,
          custom_id: ranking_settings_view_sig
            .newState({
              ranking_id: gr.ranking.data.id,
              handler: RankingSettingsHandlers.sendMainPage,
            })
            .cId(),
          emoji: { name: '⚙️' },
        },
      })
    }),
  )

  const rankings_container = new ContainerBuilder({
    accent_color: Colors.Primary,
  })
    .addTextDisplayComponents(rankings_desc)
    .addSeparatorComponents(new SeparatorBuilder({ spacing: D.SeparatorSpacingSize.Large }))

  if (sections.length > 0) {
    rankings_container.addSectionComponents(sections)

    if (grs.length > 5) {
      rankings_container.addTextDisplayComponents(
        new TextDisplayBuilder({
          content: `-# You have **${grs.length - 5}** more ranking${grs.length - 5 === 1 ? `` : `s`} not shown here. Use ${await commandMention(app, settings_cmd, guild.data.id)} \`[ranking-name]\` to access a specific ranking's settings.`,
        }),
      )
    }

    rankings_container.addSeparatorComponents(new SeparatorBuilder({ spacing: D.SeparatorSpacingSize.Large }))
  }

  rankings_container.addActionRowComponents(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents([
      new ButtonBuilder({
        style: D.ButtonStyle.Success,
        custom_id: settings_view_sig.newState({ handler: SettingsHandlers.sendCreateRankingModal }).cId(),
        label: 'New Ranking',
        emoji: { name: '➕' },
      }),
    ]),
  )

  const current_admin_role_id = (await app.db.guilds.fetch(ctx.interaction.guild_id))?.data.admin_role_id

  // General server settings
  const general_settings_container = new ContainerBuilder({
    accent_color: Colors.Secondary,
  })
    .addTextDisplayComponents(
      new TextDisplayBuilder({
        content: `## General Settings`,
      }),
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder({
            content:
              `**Bot Admin Role**${current_admin_role_id ? ` (<@&${current_admin_role_id}>)` : ``}: Server members with this role will be able to manage rankings, matches, and players. ` +
              `Click the button to create it if it does not exist. ` +
              `You can rename, edit, and assign the role however you want.`,
          }),
        )
        .setButtonAccessory(
          new ButtonBuilder({
            style: D.ButtonStyle.Secondary,
            custom_id: settings_view_sig.newState({ handler: SettingsHandlers.syncAdminRole }).cId(),
            label: `Set Admin Role`,
          }),
        ),
    )
    // .addSectionComponents(
    //   new SectionBuilder()
    //     .addTextDisplayComponents(
    //       new TextDisplayBuilder({
    //         content: `**Refresh Commands:** Certain commands, such as ${await commandMention(app, record_match_cmd, guild.data.id)}, have different options or formats based on the server's settings. If they ever get outdated, click the button to refresh the commands in this server.`,
    //       }),
    //     )
    //     .setButtonAccessory(
    //       new ButtonBuilder({
    //         style: D.ButtonStyle.Secondary,
    //         custom_id: settings_view_sig.newState({ handler: SettingsHandlers.refreshCommands }).cId(),
    //         label: 'Refresh Commands',
    //       }),
    //     ),
    // )

    .addActionRowComponents(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents([
        new ButtonBuilder({
          style: D.ButtonStyle.Secondary,
          custom_id: help_view_sig.newState({ followup: true }).cId(),
          label: 'Help',
        }),
      ]),
    )

  const message = new MessageData({
    flags: D.MessageFlags.Ephemeral | D.MessageFlags.IsComponentsV2,
    components: [rankings_container.toJSON(), general_settings_container.toJSON()],
  })

  return message.response_data
}
