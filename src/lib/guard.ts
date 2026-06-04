import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

// In the packaged Windows desktop app there is a single local user and no
// Google sign-in — the OS login is the security boundary (same threat model as
// the web app's "local only" note). The Electron launcher sets this flag.
export const DESKTOP = process.env.DESKTOP_LOCAL_AUTH === "1";
const LOCAL_EMAIL = "you@this-computer.local";

export async function requireUser() {
  if (DESKTOP) {
    const user = await db.user.upsert({
      where: { email: LOCAL_EMAIL },
      update: {},
      create: { email: LOCAL_EMAIL, name: "Local user" },
    });
    return { id: user.id, email: user.email, name: user.name };
  }

  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return session.user as { id: string; email?: string | null; name?: string | null };
}
