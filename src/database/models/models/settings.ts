import { not, eq } from 'drizzle-orm'
import { SettingSelect, SettingUpdate } from '../types'
import { Settings } from '../../schema'
import { DbObject } from '../../object_manager'
import { DbObjectManager } from '../../object_manager'

export class Setting extends DbObject<SettingSelect> {}

export class SettingsManager extends DbObjectManager {
  async getOrUpdate(update?: SettingUpdate): Promise<Setting> {
    await this.client.db.delete(Settings).where(not(eq(Settings.id, 1)))

    let data = (await this.client.db.select().from(Settings).where(eq(Settings.id, 1)))[0]

    if (data) {
      if (update) {
        data = (
          await this.client.db
            .update(Settings)
            .set({ ...update })
            .where(eq(Settings.id, 1))
            .returning()
        )[0]
      }
    } else {
      data = (
        await this.client.db
          .insert(Settings)
          .values({ id: 1, ...update })
          .returning()
      )[0]
    }

    return new Setting(data, this.client)
  }
}
