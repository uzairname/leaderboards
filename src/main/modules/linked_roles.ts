import * as D from 'discord-api-types/v10'
import { App } from '../app/app'

export function getAppRoleConnectionsMetadata(
  app: App
): D.RESTPutAPIApplicationRoleConnectionMetadataJSONBody {
  return []
}

/**
 *
 * @param bot
 * @param access_token
 * @param score
 * @param platform_name Different for each user.
 */
export async function updateUserRoleConnectionData(
  app: App,
  access_token: string,
  score: number,
  platform_name: string
): Promise<void> {
  const body: D.RESTPutAPICurrentUserApplicationRoleConnectionJSONBody = {
    platform_name,
    metadata: {
      score: score
    }
  }

  if (app.config.features.ROLE_CONNECTIONS_METADATA) {
    await app.bot.updateUserRoleConnection(access_token, body)
  }
}
