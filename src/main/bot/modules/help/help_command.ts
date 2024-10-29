import * as D from 'discord-api-types/v10'
import { AppCommand, InteractionContext, StateContext, field } from '../../../../discord-framework'
import { App } from '../../../app/App'
import { AppView } from '../../../app/ViewModule'
import { Colors } from '../../helpers/constants'
import { Messages } from '../../helpers/messages'
import { dateTimestamp, github_url, inviteUrl } from '../../helpers/strings'
import { getOrAddGuild } from '../guilds/guilds'

export const help_cmd_signature = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  custom_id_prefix: 'h',
  name: 'help',
  description: 'All about this bot',
  state_schema: {
    page: field.Choice({
      overviewPage,
      guidePage,
    }),
  },
})

export default new AppView(help_cmd_signature, app =>
  help_cmd_signature
    .onCommand(async ctx => {
      ctx.state.save.page(overviewPage)
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: await overviewPage(app, ctx),
      }
    })
    .onComponent(async ctx => {
      return {
        type: D.InteractionResponseType.UpdateMessage,
        data: await ctx.state.get.page()(app, ctx),
      }
    }),
)

async function helpComponents(
  app: App,
  ctx: StateContext<typeof help_cmd_signature>,
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

  if (ctx.state.is.page(overviewPage) && !app.config.features.IsDev) {
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

async function overviewPage(
  app: App,
  ctx: InteractionContext<typeof help_cmd_signature>,
): Promise<D.APIInteractionResponseCallbackData> {
  const last_deployed = (await app.db.settings.getOrUpdate()).data.last_updated

  const last_deployed_timestamp = last_deployed ? dateTimestamp(last_deployed) : 'unknown'

  const embed: D.APIEmbed = {
    title: '🏅 Leaderboards',
    description: Messages.concise_description,
    fields: [
      {
        name: `Source Code`,
        value: `This bot is open source! [Source Code](${github_url})`,
        inline: true,
      },
      {
        name: `Version`,
        value: `Last updated on ${last_deployed_timestamp}`,
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
  ctx: InteractionContext<typeof help_cmd_signature>,
): Promise<D.APIInteractionResponseCallbackData> {
  const guild = ctx.interaction.guild_id
    ? await getOrAddGuild(app, ctx.interaction.guild_id)
    : undefined

  return {
    embeds: [await Messages.guide(app, guild)],
    components: await helpComponents(app, ctx),
    flags: D.MessageFlags.Ephemeral,
  }
}
