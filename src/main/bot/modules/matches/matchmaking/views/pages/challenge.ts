import * as D from 'discord-api-types/v10'
import {
  ChatInteractionResponse,
  ComponentContext,
  field,
  InteractionContext,
  MessageData,
  MessageView,
} from '../../../../../../../discord-framework'
import { App } from '../../../../../../context/app_context'
import { Colors } from '../../../../../common/constants'
import { channelMention, relativeTimestamp } from '../../../../../common/strings'
import { checkGuildInteraction } from '../../../../../utils/perms'
import { AppView } from '../../../../../utils/ViewModule'
import { getOrCreatePlayer } from '../../../../players/players'
import { start1v1MatchAndThread } from '../../../ongoing-matches/start_match'

export const challenge_message_signature = new MessageView({
  name: 'Challenge Message',
  custom_id_prefix: 'c',
  state_schema: {
    time_started: field.Date(),
    initiator_id: field.String(),
    opponent_id: field.String(),
    ranking_id: field.Int(),
    opponent_accepted: field.Boolean(),
    ongoing_match_channel_id: field.String(),
    callback: field.Choice({
      onAccept,
    }),
  },
})

export default new AppView(app =>
  challenge_message_signature.onComponent(async ctx => {
    if (!ctx.state.data.callback) throw new Error('Unhandled state')
    return await ctx.state.data.callback(app, ctx)
  }),
)

export async function challengeMessage(
  app: App,
  ctx: InteractionContext<typeof challenge_message_signature>,
): Promise<MessageData> {
  const initiator_id = ctx.state.get.initiator_id()
  const opponent_id = ctx.state.get.opponent_id()

  const expires_at = new Date(
    ctx.state.get.time_started().getTime() + app.config.ChallengeTimeoutMs,
  ) // 5 minutes

  const embeds: D.APIEmbed[] = [
    {
      title: ``,
      description:
        `### <@${initiator_id}> challenges <@${opponent_id}> to a 1v1`
        + `\n` + (ctx.state.data.ongoing_match_channel_id
          ? `Challenge accepted. A private thread has been created: ${channelMention(ctx.state.data.ongoing_match_channel_id)}`
          : `*Awaiting response*`)
        + `\n-# Expires ${relativeTimestamp(expires_at)}`
        + ``, // prettier-ignore
      color: Colors.Primary,
    },
  ]

  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [
    {
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          custom_id: ctx.state.set.callback(onAccept).cId(),
          label: 'Accept',
        },
      ],
    },
  ]

  return new MessageData({
    content: `||<@${opponent_id}>||`,
    embeds,
    components,
    allowed_mentions: { users: [initiator_id, opponent_id] },
  })
}

async function onAccept(
  app: App,
  ctx: ComponentContext<typeof challenge_message_signature>,
): Promise<ChatInteractionResponse> {
  // check expiration
  const expires_at = new Date(
    ctx.state.get.time_started().getTime() + app.config.ChallengeTimeoutMs,
  )
  if (new Date() > expires_at) {
    await app.bot.deleteMessageIfExists(ctx.interaction.channel?.id, ctx.interaction.message?.id)
    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: { content: `This challenge has expired`, flags: D.MessageFlags.Ephemeral },
    }
  }

  const interaction = checkGuildInteraction(ctx.interaction)

  const is_opponent = ctx.state.is.opponent_id(interaction.member.user.id)

  if (!is_opponent || ctx.state.is.opponent_accepted()) return { type: D.InteractionResponseType.DeferredMessageUpdate }

  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      ctx.state.save.opponent_accepted(true)

      const guild_ranking = await app.db.guild_rankings.get({
        guild_id: interaction.guild_id,
        ranking_id: ctx.state.get.ranking_id(),
      })

      const team_player_ids = [[ctx.state.get.initiator_id()], [ctx.state.get.opponent_id()]]

      const team_players = await Promise.all(
        team_player_ids.map(async team => 
          Promise.all(team.map(id => getOrCreatePlayer(app, id, guild_ranking.data.ranking_id)))
        ),
      )

      const { match, thread } = await start1v1MatchAndThread(app, guild_ranking, team_players)

      ctx.state.save.ongoing_match_channel_id(thread.id)

      await ctx.edit((await challengeMessage(app, ctx)).as_response)
    },
  )
}
