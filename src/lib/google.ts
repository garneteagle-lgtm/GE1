import { google } from "googleapis";
import { db } from "@/lib/db";
import { decryptString, encryptString } from "@/lib/crypto";

export async function getGoogleClient(userId: string) {
  const account = await db.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account?.access_token) throw new Error("No Google account linked");

  const accessToken = decryptString(account.access_token);
  const refreshToken = account.refresh_token ? decryptString(account.refresh_token) : undefined;

  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  oauth2.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  const now = Date.now();
  if (account.expires_at && account.expires_at * 1000 < now + 60_000 && refreshToken) {
    const { credentials } = await oauth2.refreshAccessToken();
    oauth2.setCredentials(credentials);
    await db.account.update({
      where: { id: account.id },
      data: {
        access_token: credentials.access_token ? encryptString(credentials.access_token) : null,
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
