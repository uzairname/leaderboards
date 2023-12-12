import { PermissionFlagsBits } from 'discord-api-types/v10'

export abstract class DiscordError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `${DiscordError.name}.${this.constructor.name}`
  }
}

export namespace DiscordErrors {
  export class BotPermissions extends DiscordError {
    getMissingPermissionsNames() {
      const missing_permissions_names: string[] = []
      for (const [key, value] of Object.entries(PermissionFlagsBits)) {
        if ((BigInt(value) & this.missing_permissions) === BigInt(value)) {
          missing_permissions_names.push(key)
        }
      }
      return missing_permissions_names
    }

    constructor(private missing_permissions: bigint = BigInt(0)) {
      super()
    }
  }

  export class ForumInNonCommunityServer extends Error {
    constructor() {
      super('Unable to create forum channel. Community is disabled for this server')
    }
  }
}
