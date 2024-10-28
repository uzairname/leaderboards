import { eq, InferSelectModel } from 'drizzle-orm'
import { isInt, ModifyType } from '../../utils/utils'
import { DbObject, DbObjectManager } from '../managers'
import { Settings } from '../schema'

export type SettingSelect = InferSelectModel<typeof Settings>
export type SettingUpdate = Partial<Omit<SettingSelect, 'id'>>

export interface Versions {
  guilds: number
}

export class Setting extends DbObject<SettingSelect> {
  constructor(data: SettingSelect, db: any) {
    super(data, db)
    db.cache.setting = this
  }
}

export class SettingsManager extends DbObjectManager {
  async getOrUpdate(
    update?: { last_updated?: boolean } & Record<keyof Versions, boolean>,
  ): Promise<Setting> {
    const id = 1

    var data: SettingSelect

    if (update) {
      const current_setting = await this.getOrUpdate()

      // Update the last_updated field if specified
      const last_updated = update.last_updated ? new Date() : current_setting.data.last_updated

      // Updated versions, with defaults for missing or invalid fields
      const updated_versions = {
        guilds: current_setting.data.versions.guilds + (update.guilds ? 1 : 0),
      }

      data = (
        await this.db.drizzle
          .update(Settings)
          .set({ last_updated: last_updated, versions: updated_versions })
          .where(eq(Settings.id, id))
          .returning()
      )[0]
    } else {
      const cached_setting = this.db.cache.setting
      if (cached_setting) return cached_setting

      // No guarantee that the versions field will be of the correct type in the database
      const result = (
        await this.db.drizzle.select().from(Settings).where(eq(Settings.id, id))
      )[0] as any as ModifyType<SettingSelect, { versions: Record<string, unknown> }>

      if (!result) {
        data = (
          await this.db.drizzle
            .insert(Settings)
            .values({ id, versions: { guilds: 1 } })
            .returning()
        )[0]
      } else {
        data = {
          ...result,
          versions: {
            guilds: isInt(result.versions.guilds) ? result.versions.guilds : 1,
          },
        }
      }
    }
    return new Setting(data, this.db)
  }
}
