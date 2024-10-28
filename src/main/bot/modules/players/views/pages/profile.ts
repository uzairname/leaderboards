import * as D from 'discord-api-types/v10'
import { field, InteractionContext, MessageView } from '../../../../../../discord-framework'
import { App } from '../../../../../app/App'
import { AppView } from '../../../../../app/ViewModule'
import { Colors } from '../../../../helpers/constants'
import { checkGuildInteraction } from '../../../../helpers/perms'
import { matches_view } from '../../../matches/logging/views/pages/matches'

export const profile_page_signature = new MessageView({
  name: 'Profile page',
  custom_id_prefix: 'p',
  state_schema: {
    callback: field.Choice({
      overviewPage: profileOverviewPage,
    }),
    user_id: field.String(),
    selected_ranking_id: field.Int(),
  },
})

export default new AppView(profile_page_signature, app =>
  profile_page_signature.onComponent(async ctx => {
    return {
      type: D.InteractionResponseType.UpdateMessage,
      data: await ctx.state.get.callback()(app, ctx),
    }
  }),
)

export async function profileOverviewPage(
  app: App,
  ctx: InteractionContext<typeof profile_page_signature>,
): Promise<D.APIInteractionResponseCallbackData> {
  const user_id = ctx.state.get.user_id()
  const discord_user = await app.bot.getUser(user_id)

  // find all of the user's players that are in a ranking that the guild has
  const guild_rankings = await app.db.guild_rankings.get({
    guild_id: checkGuildInteraction(ctx.interaction).guild_id,
  })
  const players = (await app.db.players.getByUser(user_id)).filter(p =>
    guild_rankings.some(r => r.ranking.data.id === p.data.ranking_id),
  )

  const embed: D.APIEmbed = {
    title: `${discord_user.global_name ?? discord_user.username}'s Stats`,
    fields:
      (await Promise.all(
        players.map(async p => {
          const ranking = await p.ranking
          return {
            name: ranking.data.name ?? 'Unnamed Ranking',
            value: `Score: ${p.data.rating?.toFixed(0) ?? 'Unranked'}`,
          }
        }),
      )) ?? `No data`,
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
            custom_id: matches_view
              .createState({
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
