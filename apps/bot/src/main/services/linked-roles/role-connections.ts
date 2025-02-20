import * as D from 'discord-api-types/v10'
import { App } from '../../setup/app'

export function getAppRoleConnectionsMetadata(
  app: App,
): D.RESTPutAPIApplicationRoleConnectionMetadataJSONBody {
  return [
    {
      type: D.ApplicationRoleConnectionMetadataType.IntegerGreaterThanOrEqual,
      key: 'rating',
      name: 'Rating',
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
export async function updateUserRoleConnectionData(
  app: App,
  access_token: string,
  rating_points: number,
  ranking_name: string,
): Promise<void> {
  const body: D.RESTPutAPICurrentUserApplicationRoleConnectionJSONBody = {
    platform_name: ranking_name,
    metadata: {
      rating: rating_points.toFixed(0),
    },
  }

  await app.discord.updateUserRoleConnection(access_token, body)
}
