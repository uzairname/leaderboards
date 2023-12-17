import { Miniflare } from 'miniflare'

const mf = new Miniflare({
  host: '0.0.0.0',
  port: 8787,
  workers: [
    {
      name: 'worker1',
      modules: true,
      scriptPath: 'test/test3.js'
    }
  ]
})

async function main() {
  const res = await mf.dispatchFetch('http://localhost:8787/')
  console.log(await res.text())
  await mf.dispose()
}

main().then(() => {
  process.exit(0)
})
