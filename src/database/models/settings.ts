import { eq, InferSelectModel } from 'drizzle-orm'
import { isInt, ModifyType } from '../../utils/utils'
import { DbObject, DbObjectManager } from '../managers'
import { Settings } from '../schema'

export type SettingSelect = InferSelectModel<typeof Settings>
export type SettingUpdate = Partial<Omit<SettingSelect, 'id'>>

export interface Versions {
  db: number
}

export class Setting implements DbObject<SettingSelect> {
  constructor(
    public data: SettingSelect,
    public db: any,
  ) {
    db.cache.setting = this
  }
}

export class SettingsManager extends DbObjectManager {
  async getOrUpdate(update?: SettingUpdate): Promise<Setting> {
    const id = 1

    var data: SettingSelect

    if (update) {
      const current_setting = await this.getOrUpdate()

      data = (
        await this.db.drizzle.update(Settings).set(update).where(eq(Settings.id, id)).returning()
      )[0]
    } else {
      if (this.db.cache.setting) return this.db.cache.setting

      // No guarantee that the versions field will be of the correct type in the database
      const result = (
        await this.db.drizzle.select().from(Settings).where(eq(Settings.id, id))
      )[0] as any as ModifyType<SettingSelect, { versions: Record<string, unknown> }>

      if (!result) {
        data = (
          await this.db.drizzle
            .insert(Settings)
            .values({ id, versions: { db: 1 } })
            .returning()
        )[0]
      } else {
        data = {
          ...result,
          versions: {
            db: isInt(result.versions.guilds) ? result.versions.guilds : 1,
          },
        }
      }
    }
    return new Setting(data, this.db)
  }
}
