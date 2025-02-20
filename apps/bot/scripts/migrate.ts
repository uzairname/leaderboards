import { migrate_database } from "@repo/database"
// import nonNullable from '@repo/utils'
import * as dotenv from 'dotenv'

console.log(migrate_database)

const args = process.argv.slice(2)

const envPath = args.length == 1 ? args[0] : undefined

dotenv.config({
  path: envPath,
})

// const postgres_url = nonNullable(process.env.POSTGRES_URL, 'postgres url')

migrate_database("").then(() => {
    process.exit(0)
}).catch((e) => {
    console.error(e)
    process.exit(1)
})
