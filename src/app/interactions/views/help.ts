import {
  APIActionRowComponent,
  APIBaseComponent,
  APIButtonComponent,
  APIEmbed,
  APIInteraction,
  APIInteractionResponseCallbackData,
  APIInteractionResponseChannelMessageWithSource,
  APIMessageActionRowComponent,
  ApplicationCommandType,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from 'discord-api-types/v10'

import { App } from '../../app'

import { Messages } from '../../messages/messages'
import { Colors, dateTimestamp, inviteUrl } from '../../messages/message_pieces'
import {
  BaseContext,
  ChatInteractionResponse,
  ChoiceField,
  CommandInteractionResponse,
  CommandView,
} from '../../../discord-framework'
import { AppError, AppErrors } from '../../errors'

export const help_command_def = new CommandView({
  type: ApplicationCommandType.ChatInput,

  custom_id_prefix: 'help',

  command: {
    name: 'help',
    description: 'All about this bot',
  },
  state_schema: {
    page: new ChoiceField({ main: null, reference: null }),
  },
})

export default (app: App) =>
  help_command_def
    .onCommand(async (ctx) => {
      ctx.state.save.page('main')
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: await mainPage(app, ctx, true),
      }
    })
    .onComponent(async (ctx) => {
      if (ctx.state.is.page('main')) {
        var data = await mainPage(app, ctx)
      } else if (ctx.state.is.page('reference')) {
        data = await referencePage(app, ctx)
      } else {
        throw new AppErrors.UnknownState(ctx.state.data.page)
      }
      return { type: InteractionResponseType.UpdateMessage, data }
    })

async function helpComponents(
  app: App,
  ctx: BaseContext<typeof help_command_def>,
): Promise<APIActionRowComponent<APIMessageActionRowComponent>[]> {
  let components: APIButtonComponent[] = []
  let action_rows: APIActionRowComponent<APIMessageActionRowComponent>[] = [
    {
      type: ComponentType.ActionRow,
      components,
    },
  ]

  components.push({
    type: ComponentType.Button,
    custom_id: ctx.state.set.page('main').encode(),
    label: 'About',
    style: ctx.state.is.page('main') ? ButtonStyle.Primary : ButtonStyle.Secondary,
    disabled: ctx.state.is.page('main'),
  })

  if (app.config.features.HELP_REFERENCE) {
    components = components.concat([
      {
        type: ComponentType.Button,
        custom_id: ctx.state.set.page('reference').encode(),
        label: 'Reference',
        style: ctx.state.is.page('reference') ? ButtonStyle.Primary : ButtonStyle.Secondary,
        disabled: ctx.state.is.page('reference'),
      },
    ])
  }

  if (ctx.state.is.page('main')) {
    if (ctx.state.is.page('main')) {
      action_rows.push({
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            url: inviteUrl(app.bot),
            label: 'Invite',
            style: ButtonStyle.Link,
          },
        ],
      })
    }
  }

  return [
    {
      type: ComponentType.ActionRow,
      components,
    },
  ]
}

async function mainPage<Send extends boolean>(
  app: App,
  ctx: BaseContext<typeof help_command_def>,
  send: boolean = false as Send,
): Promise<APIInteractionResponseCallbackData> {
  const last_deployed = (await app.db.settings.getOrUpdate()).data.last_deployed

  let last_deployed_timestamp = last_deployed ? dateTimestamp(last_deployed) : 'unknown'

  const embed: APIEmbed = {
    title: '🏅Leaderboards',
    description: Messages.concise_description,
    fields: [
      {
        name: `Source Code`,
        value: `This bot is open source. [GitHub](${Messages.github_url})`,
      },
      {
        name: `Version`,
        value: `This bot was last updated on ${last_deployed_timestamp}`,
      },
    ],
    color: Colors.EmbedBackground,
  }

  return {
    embeds: [embed],
    components: await helpComponents(app, ctx),
    flags: MessageFlags.Ephemeral,
  }
}

async function referencePage(
  app: App,
  ctx: BaseContext<typeof help_command_def>,
): Promise<APIInteractionResponseCallbackData> {
  const embed: APIEmbed = {
    title: 'Help',
    description: `reference`,
    color: Colors.EmbedBackground,
  }

  return {
    embeds: [embed],
    components: await helpComponents(app, ctx),
    flags: MessageFlags.Ephemeral,
  }
}
