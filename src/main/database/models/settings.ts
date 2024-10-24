import { eq, InferSelectModel, not } from 'drizzle-orm'
import { DbObject, DbObjectManager } from '../managers'
import { Settings } from '../schema'

export type SettingSelect = InferSelectModel<typeof Settings>
export type SettingUpdate = Partial<Omit<SettingSelect, 'id'>>

export class Setting extends DbObject<SettingSelect> {}

export class SettingsManager extends DbObjectManager {
  async getOrUpdate(update?: SettingUpdate): Promise<Setting> {
    let data = (await this.db.db.select().from(Settings).where(eq(Settings.id, 1)))[0]

    if (data) {
      if (update) {
        data = (
          await this.db.db
            .update(Settings)
            .set({ ...update })
            .where(eq(Settings.id, 1))
            .returning()
        )[0]
      }
    } else {
      data = (
        await this.db.db
          .insert(Settings)
          .values({ id: 1, ...update })
          .returning()
      )[0]
    }

    return new Setting(data, this.db)
  }

  async clear(): Promise<void> {
    await this.db.db.delete(Settings).where(not(eq(Settings.id, 1)))
  }
}
// Types for each model, for each type of query.
// The "Update" type of each model is the insert type without primary/foreign keys.
