import { PartialPlayer } from '@repo/db/models'
import * as D from 'discord-api-types/v10'
import { App } from '../../setup/app'
import { displayRatingFn } from '../settings/properties'

export function getAppRoleConnectionsMetadata(app: App): D.RESTPutAPIApplicationRoleConnectionMetadataJSONBody {
  return [
    {
      type: D.ApplicationRoleConnectionMetadataType.IntegerGreaterThanOrEqual,
      key: 'rating',
      name: 'points',
      description: 'At least this many rating points (leave 0 for no minimum)',
    },
  ]
}

/**
 *
 * @param bot
 * @param access_token
 * @param rating_points
 * @param ranking_name Different for each user. Name of the ranking.
 */
export async function updateUserRoleConnectionData(app: App, access_token: string, p_player: PartialPlayer) {
  const ranking = await p_player.ranking()
  const player = await p_player.fetch()
  const rating = displayRatingFn(app, ranking)(player.data.rating)

  let metadata: Record<string, string | number>
  if (rating.is_provisional) {
    metadata = {}
  } else {
    metadata = {
      rating: rating.points,
    }
  }

  const body: D.RESTPutAPICurrentUserApplicationRoleConnectionJSONBody = {
    platform_name: ranking.data.name,
    metadata,
  }

  await app.discord.updateUserRoleConnection(access_token, body)

  return {
    ranking,
    metadata,
  }
}
