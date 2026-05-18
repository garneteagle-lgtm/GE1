import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

const GMAIL_READ = "https://www.googleapis.com/auth/gmail.readonly";
const CAL_READ = "https://www.googleapis.com/auth/calendar.readonly";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
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
  pages: {
    signIn: "/signin",
  },
});
