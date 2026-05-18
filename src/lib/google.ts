import { google } from "googleapis";
import { db } from "@/lib/db";

export async function getGoogleClient(userId: string) {
  const account = await db.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account?.access_token) throw new Error("No Google account linked");

  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  oauth2.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token ?? undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // If expired and we have a refresh token, refresh and persist.
  const now = Date.now();
  if (account.expires_at && account.expires_at * 1000 < now + 60_000 && account.refresh_token) {
    const { credentials } = await oauth2.refreshAccessToken();
    oauth2.setCredentials(credentials);
    await db.account.update({
      where: { id: account.id },
      data: {
        access_token: credentials.access_token,
        expires_at: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : null,
      },
    });
  }

  return oauth2;
}

export async function gmailClient(userId: string) {
  const auth = await getGoogleClient(userId);
  return google.gmail({ version: "v1", auth });
}

export async function calendarClient(userId: string) {
  const auth = await getGoogleClient(userId);
  return google.calendar({ version: "v3", auth });
}
