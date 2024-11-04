import * as D from 'discord-api-types/v10'
import { field, InteractionContext, MessageView } from '../../../../../../discord-framework'
import { App } from '../../../../../app/App'
import { AppView } from '../../../../../app/ViewModule'
import { Colors } from '../../../../ui-helpers/constants'
import { checkGuildInteraction } from '../../../../ui-helpers/perms'
import { escapeMd, memberAvatarUrl } from '../../../../ui-helpers/strings'
import { matches_page_config } from '../../../matches/logging/views/pages/matches'
import { calcDisplayRating } from '../../display'

export const profile_page_config = new MessageView({
  name: 'Profile page',
  custom_id_prefix: 'p',
  state_schema: {
    callback: field.Choice({
      profileOverviewPage,
    }),
    user_id: field.String(),
    selected_ranking_id: field.Int(),
  },
})

export default new AppView(profile_page_config, app =>
  profile_page_config.onComponent(async ctx => {
    return {
      type: D.InteractionResponseType.UpdateMessage,
      data: await ctx.state.get.callback()(app, ctx),
    }
  }),
)

export async function profileOverviewPage(
  app: App,
  ctx: InteractionContext<typeof profile_page_config>,
): Promise<D.APIInteractionResponseCallbackData> {
  const interaction = checkGuildInteraction(ctx.interaction)

  const target_user_id = ctx.state.get.user_id()
  const target_member = await app.discord.getGuildMember(interaction.guild_id, target_user_id)
  const username =
    target_member.nick ?? target_member.user.global_name ?? target_member.user.username
  const avatar_url = memberAvatarUrl(interaction.guild_id, target_member)

  const is_requesting_user = interaction.member.user.id === target_user_id

  // find all of the user's players that are in a ranking that the guild has
  const guild_rankings = await app.db.guild_rankings.fetch({
    guild_id: checkGuildInteraction(ctx.interaction).guild_id,
  })
  const user = app.db.users.get(target_user_id)
  const players = (await user.players()).filter(p =>
    guild_rankings.some(r => r.ranking.data.id === p.data.ranking_id),
  )

  const embed: D.APIEmbed = {
    title: `${username}'s Stats`,
    description:
      players.length === 0
        ? `*${is_requesting_user ? `You have` : `<@${target_member.user.id}> has`} not participated in any ranked matches*`
        : ``,
    fields:
      (await Promise.all(
        players.map(async p => {
          const ranking = await p.ranking()
          const display_rating = calcDisplayRating(app, ranking.data.initial_rating)(p.data.rating)
          const rating_text = display_rating.is_provisional 
            ? `${display_rating.rating}? (Unranked)`
            : `${display_rating.rating}`

          return {
            name: escapeMd(ranking.data.name),
            value: `Score: ${rating_text}`,
          }
        }),
      )) ?? [],
    thumbnail: {
      url: avatar_url,
    },
    color: Colors.EmbedBackground,
  }

  return {
    embeds: [embed],
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            label: `View Recent Matches`,
            style: D.ButtonStyle.Primary,
            custom_id: matches_page_config
              .newState({
                ranking_ids: ctx.state.data.selected_ranking_id
                  ? [ctx.state.data.selected_ranking_id]
                  : undefined,
                player_ids: players.map(p => p.data.id),
              })
              .cId(),
          },
        ],
      },
    ],
  }
}
