import { DiscordErrors, DiscordRESTClient } from '../../discord-framework'

import { inviteUrl } from './message_pieces'

export namespace Messages {
  export const concise_description =
    'Track matches and Elo ratings for any game in your server. Find and play matches against players of your skill level. Additional utilities for moderation, display, and statistics.'

  export const github_url = 'https://github.com/uzairname/leaderboards'

  export function botPermisssionsErrorDescription(
    bot: DiscordRESTClient,
    e: DiscordErrors.BotPermissions,
  ): string {
    let msg = "I'm missing some permissions"

    let missing_perms = e.getMissingPermissionsNames()

    if (missing_perms.length > 0) {
      msg = `I'm missing the following permissions: ${permsToString(missing_perms)}`
    }
    return msg + `\n[Click here to re-invite me with the required perms](${inviteUrl(bot)})`
  }
}

function permsToString(perms: string[]) {
  return perms
    .map((e) =>
      e
        .toLowerCase()
        .split('_')
        .map((e) => e.charAt(0).toUpperCase() + e.slice(1))
        .join(' '),
    )
    .join(', ')
}
