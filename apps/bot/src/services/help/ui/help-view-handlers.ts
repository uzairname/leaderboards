import { Context } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { Colors, commandMention, dateTimestamp, inviteUrl, Messages } from '../../../utils'
import { getOrAddGuild } from '../../guilds/manage-guilds'
import { setup_cmd } from '../../setup-ui/setup-cmd'
import { help_view_sig } from './help-view'

export namespace HelpPages {
  export async function overviewPage(
    app: App,
    ctx: Context<typeof help_view_sig>,
  ): Promise<D.APIInteractionResponseCallbackData> {
    const last_deployed = (await app.db.settings.getOrUpdate()).data.last_updated

    const lastDeployed = last_deployed ? dateTimestamp(last_deployed) : 'unknown'

    const embed: D.APIEmbed = {
      title: '🏅 Leaderboards',
      description: Messages.concise_description + `\n\nType ${await commandMention(app, setup_cmd)} to get started.`,
      fields: [
        {
          name: `Source Code`,
          value: `This bot is open source! [Source Code](${app.config.GithubUrl})`,
          inline: true,
        },
        {
          name: `Version`,
          value: `Last updated on ${lastDeployed}`,
          inline: true,
        },
      ],
      color: Colors.EmbedBackground,
    }

    return {
      embeds: [embed],
      components: await helpComponents(app, ctx),
      flags: D.MessageFlags.Ephemeral,
    }
  }

  export async function guidePage(
    app: App,
    ctx: Context<typeof help_view_sig>,
  ): Promise<D.APIInteractionResponseCallbackData> {
    const guild = ctx.interaction.guild_id ? await getOrAddGuild(app, ctx.interaction.guild_id) : undefined

    return {
      embeds: [await Messages.guide(app, guild)],
      components: await helpComponents(app, ctx),
      flags: D.MessageFlags.Ephemeral,
    }
  }

  // Nav buttons
  async function helpComponents(
    app: App,
    ctx: Context<typeof help_view_sig>,
  ): Promise<D.APIActionRowComponent<D.APIMessageActionRowComponent>[]> {
    let components: D.APIButtonComponent[] = []

    components = components.concat([
      {
        type: D.ComponentType.Button,
        custom_id: ctx.state.set.page(overviewPage).cId(),
        label: 'Overview',
        style: D.ButtonStyle.Secondary,
        disabled: ctx.state.is.page(overviewPage),
      },
      {
        type: D.ComponentType.Button,
        custom_id: ctx.state.set.page(guidePage).cId(),
        label: 'Guide',
        style: D.ButtonStyle.Primary,
        disabled: ctx.state.is.page(guidePage),
      },
    ])

    const action_rows: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [
      {
        type: D.ComponentType.ActionRow,
        components,
      },
    ]

    if (ctx.state.is.page(overviewPage) && app.config.features.GiveBotInvite) {
      action_rows.push({
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            url: inviteUrl(app),
            label: 'Invite to Server',
            style: D.ButtonStyle.Link,
          },
        ],
      })
    }

    return action_rows
  }
}
