import { eq, InferSelectModel } from 'drizzle-orm'
import { DbObject, DbObjectManager } from '../classes'
import { DbClient } from '../client'
import { logDbMethods } from '../logging'
import { Settings } from '../schema'

export type SettingSelect = InferSelectModel<typeof Settings>
export type SettingUpdate = Partial<Omit<SettingSelect, 'id'>>

@logDbMethods
export class Setting extends DbObject<SettingSelect> {
  constructor(
    public data: SettingSelect,
    public db: DbClient,
  ) {
    super(data, db)
  }
  toString() {
    return `[Setting]`
  }
}

@logDbMethods
export class SettingsManager extends DbObjectManager {
  toString() {
    return `[SettingsManager]`
  }

  async get(): Promise<Setting> {
    return this.getOrUpdate()
  }

  async getOrUpdate(update?: SettingUpdate): Promise<Setting> {
    const id = 1

    var data: SettingSelect

    if (update) {
      data = (await this.db.drizzle.update(Settings).set(update).where(eq(Settings.id, id)).returning())[0]
    } else {
      // No guarantee that the versions field will be of the correct type in the database
      const result = (await this.db.drizzle.select().from(Settings).where(eq(Settings.id, id)))[0]

      data = result ?? (await this.db.drizzle.insert(Settings).values({}).returning())[0]
    }

    return new Setting(data, this.db)
  }
}
