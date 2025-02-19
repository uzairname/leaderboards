import { auth } from '@/lib/auth';
import { fetchLbApi } from '@/lib/fetch';
import { DiscordAPIClient } from 'discord-framework';
import { nonNullable } from 'utils';

export default async function Page({
    params,
  }: {
    params: Promise<{ id: string }>
  }) {
    const id = (await params).id;

    // Check if the user is authenticated
    const session = await auth()
    
    if (!session) {
      return (
        <div className="flex flex-col items-center justify-start min-h-screen p-24">
          <h6 className="text-2xl font-light">Please sign in to view this page</h6>
        </div>
      )
    }

    const discordClient = new DiscordAPIClient({
      token: nonNullable(process.env.DISCORD_TOKEN, 'DISCORD_TOKEN'),
      application_id: nonNullable(process.env.AUTH_DISCORD_ID, 'AUTH_DISCORD_ID'),
      client_secret: nonNullable(process.env.AUTH_DISCORD_SECRET, 'AUTH_DISCORD_SECRET'),
      public_key: nonNullable(process.env.DISCORD_PUBLIC_KEY, 'DISCORD_PUBLIC_KEY'),
    })

    const access_token = await fetchLbApi('GET', `/api/access-tokens/${session?.user?.id}`).then(res => res.json())
    console.log(`bearer token`, access_token)

    if (!access_token) {
      return (
        <div className="flex flex-col items-center justify-start min-h-screen p-24">
          <h6 className="text-2xl font-light">Please sign in to view this page</h6>
        </div>
      )
    }

    // Get the user's guilds
    const guilds = await discordClient.getUserGuilds(access_token)

    return (
      <div className="flex flex-col items-center justify-start min-h-screen p-24">
        <h1 className="text-4xl font-bold">Ranking: {id}</h1>
        <p className="mt-4 text-lg">{JSON.stringify(guilds.map(a => a.name))}</p>
      </div>
    )
}
