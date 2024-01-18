import * as D from 'discord-api-types/v10'
import { InteractionContext, CommandView, _, field, StateContext } from '../../../discord-framework'
import { App } from '../../app/app'
import { AppErrors } from '../../app/errors'
import { Colors, botAndOauthUrl, dateTimestamp, inviteUrl } from '../../messages/message_pieces'
import { Messages } from '../../messages/messages'

export const help_cmd = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  custom_id_prefix: 'h',
  name: 'help',
  description: 'All about this bot',
  state_schema: {
    page: field.Enum({ main: _, reference: _ }),
  },
})

export const helpCmd = (app: App) =>
  help_cmd
    .onCommand(async ctx => {
      ctx.state.save.page('main')
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: await mainPage(app, ctx),
      }
    })
    .onComponent(async ctx => {
      if (ctx.state.is.page('main')) {
        var data = await mainPage(app, ctx)
      } else if (ctx.state.is.page('reference')) {
        data = await referencePage(app, ctx)
      } else {
        throw new AppErrors.UnknownState(ctx.state.data.page)
      }
      return { type: D.InteractionResponseType.UpdateMessage, data }
    })

async function mainPage(
  app: App,
  ctx: InteractionContext<typeof help_cmd>,
): Promise<D.APIInteractionResponseCallbackData> {
  const last_deployed = (await app.db.settings.getOrUpdate()).data.last_deployed

  let last_deployed_timestamp = last_deployed ? dateTimestamp(last_deployed) : 'unknown'

  const embed: D.APIEmbed = {
    title: '🏅 Leaderboards',
    description: Messages.concise_description,
    fields: [
      {
        name: `Source Code`,
        value: `[Source Code](${Messages.github_url})`,
        inline: true,
      },
      {
        name: `Version`,
        value: `This bot was last updated on ${last_deployed_timestamp}`,
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

async function referencePage(
  app: App,
  ctx: InteractionContext<typeof help_cmd>,
): Promise<D.APIInteractionResponseCallbackData> {
  const embed: D.APIEmbed = {
    title: 'Help',
    description: `reference`,
    color: Colors.EmbedBackground,
  }

  return {
    embeds: [embed],
    components: await helpComponents(app, ctx),
    flags: D.MessageFlags.Ephemeral,
  }
}

async function helpComponents(
  app: App,
  ctx: StateContext<typeof help_cmd>,
): Promise<D.APIActionRowComponent<D.APIMessageActionRowComponent>[]> {
  let components: D.APIButtonComponent[] = []
  let action_rows: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [
    {
      type: D.ComponentType.ActionRow,
      components,
    },
  ]

  components.push({
    type: D.ComponentType.Button,
    custom_id: ctx.state.set.page('main').cId(),
    label: 'About',
    style: ctx.state.is.page('main') ? D.ButtonStyle.Primary : D.ButtonStyle.Secondary,
    disabled: ctx.state.is.page('main'),
  })

  if (app.config.features.HelpReference) {
    components = components.concat([
      {
        type: D.ComponentType.Button,
        custom_id: ctx.state.set.page('reference').cId(),
        label: 'Reference',
        style: ctx.state.is.page('reference') ? D.ButtonStyle.Primary : D.ButtonStyle.Secondary,
        disabled: ctx.state.is.page('reference'),
      },
    ])
  }

  if (ctx.state.is.page('main')) {
    action_rows.push({
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.Button,
          // url: inviteUrl(app.bot),
          url: botAndOauthUrl(app),
          label: 'Invite',
          style: D.ButtonStyle.Link,
        },
      ],
    })
  }

  return action_rows
}
