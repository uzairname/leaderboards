import { isInt, ModifyType } from '@repo/utils'
import { eq, InferSelectModel } from 'drizzle-orm'
import { DbObject, DbObjectManager } from '../classes'
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

  async get(): Promise<Setting> {
    return this.getOrUpdate()
  }


  

  async getOrUpdate(update?: SettingUpdate): Promise<Setting> {
    const id = 1

    var data: SettingSelect

    if (update) {
      data = (
        await this.db.drizzle.update(Settings).set(update).where(eq(Settings.id, id)).returning()
      )[0]
    } else {
      if (this.db.cache.setting) return this.db.cache.setting

      // No guarantee that the versions field will be of the correct type in the database
      const result = (
        await this.db.drizzle.select().from(Settings).where(eq(Settings.id, id))
      )[0]

      data = result ?? (
        await this.db.drizzle
          .insert(Settings)
          .values({})
          .returning()
      )[0]
    }
    
    return new Setting(data, this.db)
  }
}
