import { DiscordErrors } from '../../../discord-framework'
import { App } from '../../context/app_context'
import { inviteUrl } from '../utils/converters'

export namespace Messages {
  export const concise_description =
    'Tracks Elo ratings and matches for any game. Additional utilities for moderation, display, and statistics.'

  export const github_url = 'https://github.com/uzairname/leaderboards'

  export function botPermisssionsError(app: App, e: DiscordErrors.BotPermissions): string {
    let msg = "I'm missing some permissions"

    let missing_perms = e.missingPermissionsNames

    if (missing_perms.length > 0) {
      msg = `I'm missing the following permissions: ${permsToString(missing_perms)}`
    }
    return msg + `\n[Click here to re-invite me with the required perms](${inviteUrl(app)})`
  }

  export const no_rankings_description = `This server has no rankings. Create one to host ranked matches and leaderboards for any game.`
}

function permsToString(perms: string[]) {
  return perms
    .map(e =>
      e
        .toLowerCase()
        .split('_')
        .map(e => e.charAt(0).toUpperCase() + e.slice(1))
        .join(' '),
    )
    .join(', ')
}
