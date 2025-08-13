import { DiscordAPIError } from '@discordjs/rest'
import { GuildRanking, PartialGuildRanking, Player, PlayerFlags } from '@repo/db/models'
import { DiscordErrors } from '@repo/discord'
import { RESTJSONErrorCodes } from 'discord-api-types/v10'
import { sentry } from '../../logging/sentry'
import { App } from '../../setup/app'
import { displayRatingFn } from '../settings/properties'

export async function setRankRole(
  role_id: string,
  min_rating: number | null,
  max_rating: number | null,
  p_guild_ranking: PartialGuildRanking,
) {
  if (min_rating !== null && max_rating !== null && min_rating >= max_rating) {
    throw new Error('Minimum rating must be less than maximum rating')
  }

  const { guild_ranking } = await p_guild_ranking.fetch()
  const current_rank_roles = guild_ranking.data.rank_roles ?? []

  if (current_rank_roles.some(role => role.role_id === role_id)) {
    updated_roles = current_rank_roles.map(role => {
      if (role.role_id === role_id) {
        return { ...role, min_rating, max_rating }
      }
      return role
    })
  } else {
    var updated_roles = [
      ...current_rank_roles,
      {
        role_id,
        min_rating,
        max_rating,
      },
    ]
  }

  // Sort roles by min_rating, then by max_rating - min_rating
  updated_roles.sort((a, b) => {
    if (a.min_rating !== b.min_rating) {
      return (a.min_rating ?? -Infinity) - (b.min_rating ?? -Infinity)
    }
    return (
      (a.max_rating ?? Infinity) -
      (a.min_rating ?? -Infinity) -
      ((b.max_rating ?? Infinity) - (b.min_rating ?? -Infinity))
    )
  })

  // Check if updated_roles is different from current_rank_roles
  const were_changes_made =
    updated_roles.length !== current_rank_roles.length ||
    updated_roles.some((role, index) => {
      const current_role = current_rank_roles[index]
      return (
        role.role_id !== current_role.role_id ||
        role.min_rating !== current_role.min_rating ||
        role.max_rating !== current_role.max_rating
      )
    })

  if (were_changes_made) {
    await guild_ranking.update({
      rank_roles: updated_roles,
    })
  }
}

export async function unsetRankRole(role_id: string, p_guild_ranking: PartialGuildRanking) {
  const { guild_ranking } = await p_guild_ranking.fetch()
  const current_rank_roles = guild_ranking.data.rank_roles ?? []

  const updated_roles = current_rank_roles.filter(role => role.role_id !== role_id)

  await guild_ranking.update({
    rank_roles: updated_roles,
  })
}

/**
 * Returns the applicable rank roles for a player in a guild ranking.
 * @returns A record where keys are role IDs and values are booleans indicating if the role is applicable.
 */
export async function getApplicableRankRoles(app: App, player: Player, guild_ranking: GuildRanking) {
  const ranking = await player.ranking()
  const rank_roles = guild_ranking.data.rank_roles || []

  const display_rating = displayRatingFn(app, ranking)(player.data.rating).points

  const result = Object.fromEntries(
    rank_roles.map(role => [
      role.role_id,
      !(player.data.flags & PlayerFlags.Disabled) &&
        (role.min_rating === null || display_rating >= role.min_rating) &&
        (role.max_rating === null || display_rating < role.max_rating),
    ]),
  )

  sentry.debug(
    `getApplicableRankRoles(${player.data.name}), display rating: ${display_rating}, rating: ${JSON.stringify(player.data.rating)}, roles: ${JSON.stringify(rank_roles)}`,
  )

  return result
}

/**
 * Assigns or removes rank roles for a player based on their rating in the guild ranking.
 */
export async function updateRankRolesForPlayer(app: App, player: Player, guild_ranking: GuildRanking) {
  if (!player.data.user_id) return

  const guild = guild_ranking.guild
  const user_id = player.data.user_id

  const applicable_roles = await getApplicableRankRoles(app, player, guild_ranking)

  sentry.debug(`updateRankRolesForPlayer(${player.data.name}, ${guild_ranking.data.ranking_id})`)
  sentry.debug(`applicable roles for player ${player.data.name}: ${JSON.stringify(applicable_roles, null, 2)}`)

  const member_roles = (await app.discord.getGuildMember(guild.data.id, user_id))?.roles

  await Promise.all(
    Object.entries(applicable_roles).map(async ([role_id, is_applicable]) => {
      try {
        if (is_applicable && !member_roles?.includes(role_id)) {
          sentry.debug(`Adding role ${role_id} to player ${player.data.name}`)
          await app.discord.addRoleToMember(guild.data.id, user_id, role_id)
        } else if (!is_applicable && member_roles?.includes(role_id)) {
          sentry.debug(`Removing role ${role_id} from player ${player.data.name}`)
          await app.discord.removeRoleFromMember(guild.data.id, user_id, role_id)
        }
      } catch (e) {
        if (e instanceof DiscordErrors.RolePermissions) {
          // Unset it in case the role is above the bot's role
          await unsetRankRole(role_id, guild_ranking)
          throw e
        } else if (e instanceof DiscordAPIError && e.code === RESTJSONErrorCodes.UnknownMember) {
          // Member not found, possibly left the guild
        }
      }
    }),
  )
}

/**
 * Updates rank roles for all players in a guild ranking.
 */
export async function updateRankRolesForGuildRanking(app: App, guild_ranking: GuildRanking) {
  const players = await app.db.players.fetchMany({ ranking_id: guild_ranking.data.ranking_id })
  await Promise.all(players.map(player => updateRankRolesForPlayer(app, player, guild_ranking)))
}
