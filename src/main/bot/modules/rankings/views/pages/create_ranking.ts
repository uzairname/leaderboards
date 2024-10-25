import * as D from 'discord-api-types/v10'
import {
  ChatInteractionResponse,
  ComponentContext,
  InteractionContext,
  MessageView,
  StateContext,
  _,
  field,
  getModalSubmitEntries,
} from '../../../../../../discord-framework'
import { nonNullable } from '../../../../../../utils/utils'
import { App } from '../../../../../context/app_context'
import { Colors } from '../../../../common/constants'
import { commandMention, escapeMd } from '../../../../common/strings'
import { checkGuildInteraction, ensureAdminPerms } from '../../../../utils/perms'
import { AppView } from '../../../../utils/ViewModule'
import { getMatchLogsChannel, getOrAddGuild } from '../../../guilds'
import { syncGuildRankingLbMessage } from '../../../leaderboard/leaderboard_message'
import { syncMatchesChannel } from '../../../matches/matches_channel'
import { sendGuildRankingQueueMessage } from '../../../matches/matchmaking/queue/queue_messages'
import {
  createNewRankingInGuild,
  default_num_teams,
  default_players_per_team,
  max_ranking_name_length,
  validateRankingOptions,
} from '../../manage_rankings'
import { rankings_cmd_signature } from '../commands/rankings'
import { guildRankingSettingsPage, ranking_settings_view_signature } from './ranking_settings'

export const create_ranking_view = new MessageView({
  custom_id_prefix: 'cr',
  name: 'rankings',
  state_schema: {
    from_page: field.Enum({
      creating_new: _,
    }),
    callback: field.Choice({
      createRankingPage,
      createRankingModal,
      onCreateRankingModalSubmit,
      onCreateConfirmBtn,
    }),
    input_name: field.String(),
    input_players_per_team: field.Int(),
    input_num_teams: field.Int(),
    leaderboard_message: field.Boolean(),
    queue_message: field.Boolean(),
    log_matches: field.Boolean(),
  },
})

export default new AppView(create_ranking_view, (app: App) =>
  create_ranking_view.onComponent(async ctx => {
    return ctx.state.get.callback()(app, ctx)
  }),
)

export async function createRankingPage(
  app: App,
  ctx: InteractionContext<typeof create_ranking_view>,
): Promise<ChatInteractionResponse> {
  const type = ctx.state.is.from_page('creating_new')
    ? // already on creating new page. Update message
      D.InteractionResponseType.UpdateMessage
    : // modal originated from another page. Create new message
      D.InteractionResponseType.ChannelMessageWithSource

  ctx.state.save.from_page('creating_new')

  return {
    type,
    data: await createRankingPageResponseData(app, ctx),
  }
}

export async function createRankingPageResponseData(
  app: App,
  ctx: InteractionContext<typeof create_ranking_view>,
): Promise<D.APIInteractionResponseCallbackData> {
  const guild = await getOrAddGuild(app, checkGuildInteraction(ctx.interaction).guild_id)

  ctx.state.saveAll({ from_page: 'creating_new', callback: createRankingPage })

  const { name, num_teams, players_per_team } = validateRankingOptions({
    name: ctx.state.get.input_name(),
    num_teams: ctx.state.data.input_num_teams || default_num_teams,
    players_per_team: ctx.state.data.input_players_per_team || default_players_per_team,
  })

  const leaderboard_message = ctx.state.data.leaderboard_message ?? true
  const queue_message = ctx.state.data.queue_message ?? true
  const log_matches = ctx.state.data.log_matches ?? true

  const guild_match_results_channel_id = (await getMatchLogsChannel(app, guild))?.id

  const description =
    `### Settings:`
    + `\nYou're making a new ranking with the following settings.`
    + ` Modify the settings with the buttons below, and click Confirm to create the ranking.`
    + (app.config.features.MultipleTeamsPlayers
      ? `\n- **Teams**: Matches in this ranking are **${new Array(num_teams).fill(players_per_team).join('v')}s**`
          + ` (${num_teams} teams and ${players_per_team} player${(players_per_team === 1 ? '' : 's')} per team)`
      : ``)
    + (leaderboard_message
      ? `\n- **Live Leaderboard**: A new channel will be created where the leaderboard is displayed and updated live`
      : ``)
    + (log_matches
      ? `\n- **Match Logging**:`
        + (guild_match_results_channel_id
          ? ` Matches in this ranking will be logged in <#${guild_match_results_channel_id}>`
          : ` A new channel will be created where matches in this ranking are logged`)
      : ``)
    + (app.config.features.QueueMessage && queue_message
      ? `\n- **Matchmaking Queue** A message will be sent where players can join the matchmaking queue.`
      : ``)
    + `\n-# You can edit these settings later by running`
    + ` ${await commandMention(app, rankings_cmd_signature, guild.data.id)} **${escapeMd(name)}**`
    + `` // prettier-ignore

  let components: D.APIMessageActionRowComponent[] = [
    {
      type: D.ComponentType.Button,
      style: D.ButtonStyle.Primary,
      custom_id: ctx.state.set.callback(createRankingModal).cId(),
      label: 'Rename',
    },
    {
      type: D.ComponentType.Button,
      style: leaderboard_message ? D.ButtonStyle.Primary : D.ButtonStyle.Secondary,
      label: leaderboard_message ? `Disable Leaderboard` : `Enable Leaderboard`,
      custom_id: ctx.state.set.leaderboard_message(!leaderboard_message).cId(),
    },
  ]

  if (app.config.features.DisableLogMatchesOption) {
    components = components.concat({
      type: D.ComponentType.Button,
      style: log_matches ? D.ButtonStyle.Primary : D.ButtonStyle.Secondary,
      label: log_matches ? `Don't Log Matches` : `Log Matches`,
      custom_id: ctx.state.set.log_matches(!log_matches).cId(),
    })
  }

  if (app.config.features.QueueMessage) {
    components = components.concat({
      type: D.ComponentType.Button,
      style: queue_message ? D.ButtonStyle.Primary : D.ButtonStyle.Secondary,
      label: queue_message ? `Disable Queue Message` : `Enable Queue Message`,
      custom_id: ctx.state.set.queue_message(!queue_message).cId(),
    })
  }

  const response: D.APIInteractionResponseCallbackData = {
    flags: D.MessageFlags.Ephemeral,
    embeds: [
      {
        title: `Setting up a new ranking: **"${escapeMd(name)}"**`,
        description,
        color: Colors.EmbedBackground,
      },
    ],
    components: [
      {
        type: D.ComponentType.ActionRow,
        components,
      },
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Success,
            custom_id: ctx.state
              .setAll({
                callback: onCreateConfirmBtn,
                leaderboard_message,
                log_matches,
                queue_message,
              })
              .cId(),
            label: 'Confirm',
          },
        ],
      },
    ],
  }
  return response
}

export function createRankingModal(
  app: App,
  ctx: StateContext<typeof create_ranking_view>,
): D.APIModalInteractionResponse {
  let components = [rankingNameTextInput(ctx.state.data.input_name)]

  if (app.config.features.MultipleTeamsPlayers) {
    components = components.concat([
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.TextInput,
            style: D.TextInputStyle.Short,
            custom_id: 'num_teams',
            label: 'Number of teams per match',
            placeholder: `${ctx.state.data.input_num_teams ?? default_num_teams}`,
            required: false,
          },
        ],
      },
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.TextInput,
            style: D.TextInputStyle.Short,
            custom_id: 'players_per_team',
            label: 'Players per team',
            placeholder: `${ctx.state.data.input_players_per_team ?? default_players_per_team}`,
            required: false,
          },
        ],
      },
    ])
  }

  return {
    type: D.InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.callback(onCreateRankingModalSubmit).cId(),
      title: 'Create a new ranking',
      components,
    },
  }
}

export function onCreateRankingModalSubmit(
  app: App,
  ctx: ComponentContext<typeof create_ranking_view>,
): Promise<ChatInteractionResponse> {
  const modal_input = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)
  modal_input['name']?.value && ctx.state.save.input_name(modal_input['name'].value)
  modal_input['num_teams']?.value &&
    ctx.state.save.input_num_teams(parseInt(modal_input['num_teams'].value))
  modal_input['players_per_team']?.value &&
    ctx.state.save.input_players_per_team(parseInt(modal_input['players_per_team'].value))

  return createRankingPage(app, ctx)
}

export function onCreateConfirmBtn(
  app: App,
  ctx: ComponentContext<typeof create_ranking_view>,
): ChatInteractionResponse {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      await ensureAdminPerms(app, ctx)

      const guild = await getOrAddGuild(app, checkGuildInteraction(ctx.interaction).guild_id)

      const result = await createNewRankingInGuild(app, guild, {
        name: ctx.state.get.input_name(),
        num_teams: ctx.state.data.input_num_teams,
        players_per_team: ctx.state.data.input_players_per_team,
        display_settings: {
          log_matches: ctx.state.data.log_matches,
          leaderboard_message: ctx.state.data.leaderboard_message,
        },
      })

      await syncGuildRankingLbMessage(app, result.new_guild_ranking, true)

      if (result.new_guild_ranking.data.display_settings?.log_matches) {
        await syncMatchesChannel(app, guild)
      }

      if (ctx.state.data.queue_message && app.config.features.QueueMessage) {
        await sendGuildRankingQueueMessage(
          app,
          result.new_guild_ranking,
          result.new_guild_ranking.data.leaderboard_channel_id ??
            nonNullable(ctx.interaction.channel, 'interaction channel').id,
        )
      }

      return ctx.edit(
        await guildRankingSettingsPage(app, {
          state: ranking_settings_view_signature.createState({
            ranking_id: result.new_ranking.data.id,
            guild_id: guild.data.id,
            edit: true,
            ranking_name: result.new_ranking.data.name,
          }),
        }),
      )
    },
  )
}

export function rankingNameTextInput(
  existing_name?: string,
): D.APIActionRowComponent<D.APITextInputComponent> {
  return {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.TextInput,
        style: D.TextInputStyle.Short,
        custom_id: 'name',
        label: 'Name',
        placeholder: existing_name ?? `e.g. 1v1 boosts only`,
        max_length: max_ranking_name_length,
        required: !existing_name,
      },
    ],
  }
}
