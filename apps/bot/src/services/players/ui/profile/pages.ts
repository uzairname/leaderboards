import { Ranking } from '@repo/db/models'
import { Context } from '@repo/discord'
import { intToOrdinal, nonNullable } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { ProfileHandlers } from '.'
import { UserError } from '../../../../errors/user-errors'
import { App } from '../../../../setup/app'
import { Colors, breadcrumbsTitle, escapeMd, userAvatarUrl } from '../../../../utils'
import { getOrAddGuild } from '../../../guilds/manage-guilds'
import { matches_view_sig } from '../../../matches/ui/matches/view'
import { rating_strategy_name } from '../../../rankings/properties'
import { getPlayerStats } from '../../properties'
import { calculateRankRolesForPlayer } from '../../rank-roles'
import { ratingTable, wlrTable } from './pieces'
import { profile_view_sig } from './view'

function rankingSelectMenu(
  grs: { ranking: Ranking }[],
  ctx: Context<typeof profile_view_sig>,
): D.APIActionRowComponent<D.APIComponentInMessageActionRow> {
  const ranking_select_menu_options: D.APISelectMenuOption[] = grs.map(gr => {
    return {
      label: gr.ranking.data.name,
      value: gr.ranking.data.id.toString(),
      // default: ctx.state.data.ranking_id === gr.ranking.data.id,
    }
  })

  return {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.StringSelect,
        custom_id: ctx.state.set.handler(ProfileHandlers.onRankingSelect).cId(),
        placeholder: `Select a ranking to view stats`,
        options: ranking_select_menu_options,
        min_values: 0,
      },
    ],
  }
}

/**
 * User profile - Main page
 */
export async function main(
  app: App,
  ctx: Context<typeof profile_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const target_user_id = ctx.state.get.user_id()
  const target_disc_user = await app.discord.getUser(target_user_id)
  const target_app_user = app.db.users.get(target_user_id)

  const target_user_name = target_disc_user.global_name ?? target_disc_user.username
  const avatar_url = userAvatarUrl(target_disc_user)

  const is_requesting_user = ctx.interaction.member.user.id === target_user_id

  const guild_id = ctx.interaction.guild_id
  const guild = await getOrAddGuild(app, guild_id)
  const rankings_in_guild = await app.db.guild_rankings.fetch({ guild_id })

  // find every ranking this user is in, in the guild
  const rankings_players = (await target_app_user.players()).filter(p =>
    rankings_in_guild.some(r => r.ranking.data.id === p.ranking.data.id),
  )

  // Find the guild rankings in this guild that the user has participated in
  const available_guild_rankings = rankings_in_guild.filter(r =>
    rankings_players.some(p => p.ranking.data.id === r.ranking.data.id),
  )

  // directly go to the ranking page if any ranking is available
  if (rankings_players.length >= 1 && undefined === ctx.state.data.ranking_id) {
    ctx.state.save.ranking_id(rankings_players[0].ranking.data.id)
  }

  let embed: D.APIEmbed = {
    thumbnail: {
      url: avatar_url,
    },
    color: Colors.EmbedBackground,
  }

  // if (undefined === ctx.state.data.ranking_id) {
  //   embed.description =
  //     `${breadcrumbsTitle(`Profiles`, target_user_name)}\n` +
  //     `## Overview\n` +
  //     `${is_requesting_user ? `You have` : `<@${target_disc_user.id}> has`}${rankings_players.length === 0 ? ` not participated in any` : ` participated in ${rankings_players.length}`} ranking${rankings_players.length === 1 ? `` : `s`} in this server.\n`

  // embed.fields =
  //   (await Promise.all(
  //     rankings_players.map(async p => {
  //       const stats = await getPlayerStats(app, p.player)

  //       const place_text = (stats.lb_place ? `**${intToOrdinal(stats.lb_place)}** place out of ${stats.max_lb_place}` : `Unranked`)

  //       return {
  //         name: escapeMd(p.ranking.data.name),
  //         value: `${place_text}`,
  //       }
  //     }),
  //   )) ?? []

  // } else {

  const gr = nonNullable(
    rankings_in_guild.find(r => r.ranking.data.id === ctx.state.data.ranking_id),
    `ranking`,
  )
  const player = rankings_players.find(p => p.ranking.data.id === gr.ranking.data.id)?.player
  if (!player) {
    throw new UserError(
      `${is_requesting_user ? `You have` : `<@${target_disc_user.id}> has`} not participated in ${gr.ranking.data.name}`,
    )
  }

  const applicable_rank_roles = await calculateRankRolesForPlayer(app, player, gr.guild_ranking)

  const rank_role_text = applicable_rank_roles.map(id => `<@&${id}>`).join(', ')

  const stats = await getPlayerStats(app, player)

  const wlr_table = wlrTable({ stats })
  const rating_table = ratingTable({ stats })

  embed.fields = [
    {
      name: `Rank`,
      value:
        (stats.lb_place ? `**${intToOrdinal(stats.lb_place)}** place out of ${stats.max_lb_place}` : `Unranked`) +
        (rank_role_text.length > 0 ? `\n${rank_role_text}` : ``),
    },
    {
      name: `Stats`,
      value: rating_table + wlr_table,
    },
    {
      name: `Notes`,
      value:
        `-# Ratings in this ranking are calculated using the *${rating_strategy_name[gr.ranking.data.rating_settings.rating_strategy]}* strategy` +
        (stats.display_rating.is_provisional ? `\n-# ? indicates a provisional rating` : ``),
    },
  ]

  embed.description =
    `${breadcrumbsTitle(`Profiles`, target_user_name, gr.ranking.data.name)}` +
    `\n` +
    `## <@${target_user_id}>'s stats in ${escapeMd(gr.ranking.data.name)}\n`
  // }

  return {
    embeds: [embed],
    components:
      available_guild_rankings.length > 0
        ? [
            rankingSelectMenu(available_guild_rankings, ctx),
            {
              type: D.ComponentType.ActionRow,
              components: [
                {
                  type: D.ComponentType.Button,
                  label: `View Recent Matches`,
                  style: D.ButtonStyle.Primary,
                  custom_id: matches_view_sig
                    .newState({
                      ranking_ids: ctx.state.data.ranking_id ? [ctx.state.data.ranking_id] : undefined,
                      player_ids: rankings_players.map(p => p.player.data.id),
                    })
                    .cId(),
                },
              ],
            },
          ]
        : [],
  }
}
