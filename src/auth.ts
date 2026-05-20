import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { encryptString } from "@/lib/crypto";

const GMAIL_READ = "https://www.googleapis.com/auth/gmail.readonly";
const CAL_READ = "https://www.googleapis.com/auth/calendar.readonly";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: {
    strategy: "database",
    maxAge: 8 * 60 * 60, // 8 hours
    updateAge: 60 * 60, // refresh session row at most once per hour
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope: `openid email profile ${GMAIL_READ} ${CAL_READ}`,
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const raw = process.env.ALLOWED_EMAILS?.trim();
      if (!raw) return true;
      const allowed = raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
      const email = user.email?.toLowerCase();
      return !!email && allowed.includes(email);
    },
  },
  events: {
    // Auth.js writes OAuth tokens to the Account row in plaintext via the
    // adapter. Re-encrypt them at rest immediately after each link.
    async linkAccount({ account }) {
      await db.account.updateMany({
        where: {
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        },
        data: {
          access_token: account.access_token ? encryptString(account.access_token) : null,
          refresh_token: account.refresh_token ? encryptString(account.refresh_token) : null,
        },
      });
    },
  },
  pages: {
    signIn: "/signin",
  },
});
