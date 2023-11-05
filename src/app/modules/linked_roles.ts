import {
  ApplicationRoleConnectionMetadataType,
  RESTPutAPICurrentUserApplicationRoleConnectionJSONBody,
} from 'discord-api-types/v10'
import { App } from '../app'

export async function syncAppRoleConnectionsMetadata(app: App): Promise<void> {
  const metadata = app.config.features.ROLE_CONNECTIONS_METADATA
    ? [
        {
          key: 'elorating',
          name: 'Elo Rating',
          description: 'Points must be greater than',
          type: ApplicationRoleConnectionMetadataType.IntegerGreaterThanOrEqual,
        },
      ]
    : []

  await app.bot.updateRoleConnectionsMetadata(metadata)
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
  platform_name: string,
): Promise<void> {
  const body: RESTPutAPICurrentUserApplicationRoleConnectionJSONBody = {
    platform_name,
    metadata: {
      score: score,
    },
  }

  if (app.config.features.ROLE_CONNECTIONS_METADATA) {
    await app.bot.updateUserRoleConnection(access_token, body)
  }
}
