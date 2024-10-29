import dotenv from 'dotenv'
import { nonNullable } from '../src/utils/utils'

const args = process.argv.slice(2)

const envPath = args[0]

dotenv.config({
  path: envPath
})

export async function updateApp() {
  const response = await fetch(`${nonNullable(process.env.BASE_URL, 'base url')}/update`, {
    method: 'POST',
    headers: {
      'Authorization': `${nonNullable(process.env.APP_KEY, 'app key')}`
    },
  })
  console.log(await response.text())
}

updateApp().then(() => {
  process.exit(0)
})