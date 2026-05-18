import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="card p-8">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use your Google account. The app will request read-only access to Gmail and Calendar so
          it can link messages and events to your cases.
        </p>
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="btn-primary w-full" type="submit">
            Continue with Google
          </button>
        </form>
      </div>
    </div>
  );
}
