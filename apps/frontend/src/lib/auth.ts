import { nonNullable } from '@repo/utils';
import Discord from 'next-auth/providers/discord';
import { DiscordAPIClient } from '@repo/discord';
import { fetchLbApi } from './fetch';
import NextAuth from 'next-auth';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Discord({
      authorization:
        'https://discord.com/api/oauth2/authorize?scope=identify+guilds'
    })
  ],
  callbacks: {
    async session({ session }) {
      if (session.user.image == null || session.user.image == undefined)
        return session;
      const url = new URL(session.user.image);
      const userId = url.pathname.split('/')[2];

      session.user.id = userId;

      return session;
    },
    async signIn({ user, account, profile }) {
      const discordClient = new DiscordAPIClient({
        token: nonNullable(process.env.DISCORD_TOKEN, 'DISCORD_TOKEN'),
        application_id: nonNullable(
          process.env.AUTH_DISCORD_ID,
          'AUTH_DISCORD_ID'
        ),
        client_secret: nonNullable(
          process.env.AUTH_DISCORD_SECRET,
          'AUTH_DISCORD_SECRET'
        ),
        public_key: nonNullable(
          process.env.DISCORD_PUBLIC_KEY,
          'DISCORD_PUBLIC_KEY'
        )
      });

      const token = account;

      await fetchLbApi('POST', `/api/access-tokens`, token);

      console.log(user, account, profile);
      return true;
    }
  },
  trustHost: true
});
