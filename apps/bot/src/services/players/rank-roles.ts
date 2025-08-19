import { DiscordAPIError } from '@discordjs/rest'
import { Guild, GuildRanking, PartialGuildRanking, Player, User } from '@repo/db/models'
import { DiscordErrors } from '@repo/discord'
import { RESTJSONErrorCodes } from 'discord-api-types/v10'
import { UserErrors } from '../../errors/user-errors'
import { App } from '../../setup/app'
import { displayRatingFn } from '../rankings/properties'

export async function setRankRole(
  role_id: string,
  min_rating: number | null,
  max_rating: number | null,
  p_guild_ranking: PartialGuildRanking,
) {
  if (min_rating !== null && max_rating !== null && min_rating >= max_rating) {
    throw new UserErrors.ValidationError('Minimum rating must be less than maximum rating')
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

export async function unsetRankRole(role_id: string, guild_ranking: GuildRanking) {
  const current_rank_roles = guild_ranking.data.rank_roles ?? []

  const updated_roles = current_rank_roles.filter(role => role.role_id !== role_id)

  await guild_ranking.update({
    rank_roles: updated_roles,
  })
}

/**
 * Calculates the applicable rank roles for a player with the given display rating in a guild ranking.
 * Used for previewing rank roles or displaying them on a leaderboard
 */
export function calculateRankRolesForRating(
  app: App,
  guild_ranking: GuildRanking,
  rating: { points: number; is_provisional?: boolean },
) {
  const rank_roles = guild_ranking.data.rank_roles || []

  if (rating.is_provisional) return []

  const result: string[] = rank_roles
    .filter(
      role =>
        (role.min_rating === null || rating.points >= role.min_rating) &&
        (role.max_rating === null || rating.points < role.max_rating),
    )
    .map(role => role.role_id)

  return result
}

/**
 * Returns the applicable rank roles for a player in a guild ranking.
 * @returns A record where keys are role IDs and values are booleans indicating if the role is applicable.
 */
export async function calculateRankRolesForPlayer(
  app: App,
  player: Player,
  guild_ranking: GuildRanking,
): Promise<string[]> {
  const ranking = await player.ranking()

  const rating = displayRatingFn(app, ranking)(player.data.rating)

  return calculateRankRolesForRating(app, guild_ranking, rating)
}

/**
 * Returns the rank roles that a user should have in a guild.
 * If a role is applicable in any ranking the user is in
 * in the guild, the role is considered applicable.
 */
export async function calculateRankRolesForUser(app: App, user: User, guild: Guild): Promise<Record<string, boolean>> {
  const rankings = await app.db.guild_rankings.fetch({ guild_id: guild.data.id })
  const roles: Record<string, boolean> = {}

  // Iterate through all rankings in the guild
  for (const { ranking, guild_ranking } of rankings) {
    var player = await app.db.players.fetchBy({ ranking, user_id: user.data.id })
    if (!player) continue // The player is not in this ranking

    const roles_in_ranking = await calculateRankRolesForPlayer(app, player, guild_ranking)

    for (const role_id of roles_in_ranking) {
      roles[role_id] = roles[role_id] || roles_in_ranking.includes(role_id)
    }
  }

  return roles
}

/**
 * Assigns or removes rank roles for a player based on their rating in the guild ranking.
 */
export async function assignRankRolesForUser(app: App, user: User, guild_ranking: GuildRanking) {
  const guild = await guild_ranking.guild.fetch()
  const user_id = user.data.id

  const applicable_roles = await calculateRankRolesForUser(app, user, guild)

  app.logger.debug(`assignRankRolesForUser(${user.data.name}, ${guild_ranking.data.ranking_id})`)
  app.logger.debug(`applicable roles for user ${user.data.name}: ${JSON.stringify(applicable_roles, null, 2)}`)

  const member_roles = (await app.discord.getGuildMember(guild.data.id, user_id))?.roles

  await Promise.all(
    Object.entries(applicable_roles).map(async ([role_id, is_applicable]) => {
      try {
        if (is_applicable && !member_roles?.includes(role_id)) {
          app.logger.debug(`Adding role ${role_id} to user ${user.data.name}`)
          await app.discord.addRoleToMember(guild.data.id, user_id, role_id)
        } else if (!is_applicable && member_roles?.includes(role_id)) {
          app.logger.debug(`Removing role ${role_id} from user ${user.data.name}`)
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
 * Updates rank roles for all users in a guild ranking.
 */
export async function updateRankRolesForGuildRanking(app: App, guild_ranking: GuildRanking) {
  const players = await app.db.players.fetchMany({ ranking_id: guild_ranking.data.ranking_id })
  for (const player of players) {
    const user = await player.user()
    if (!user) continue // player is not associated with a Discord user
    await assignRankRolesForUser(app, user, guild_ranking)
  }
}
