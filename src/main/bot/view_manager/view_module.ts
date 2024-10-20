import { AnyAppCommand, AnyView } from '../../../discord-framework'
import { App } from '../../app-context/app-context'

export class CustomView {
  constructor(
    // Resolve the command's callbacks. Used for handling interactions.
    public resolveView: (app: App) => AnyView,
    // Get the command's signature in a particular guild. Used for deploying commands.
    public getCommandSignatureInGuild?: (app: App, guild_id: string) => Promise<AnyAppCommand>,
  ) {}
}
