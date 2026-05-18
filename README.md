# Case Manager

A small case management web app for solo / small-firm lawyers.

- Clients, cases, notes, tasks, deadlines, document uploads
- Google sign-in (Auth.js v5)
- Pulls related messages from Gmail by client email (read-only)
- Pulls upcoming events from Google Calendar (read-only); link any event to a case

Stack: Next.js 15 (App Router) · TypeScript · Tailwind · Prisma · SQLite.

## Setup

### 1. Google OAuth credentials

In your existing Google Cloud project:

1. **Enable APIs**: APIs & Services → Library → enable **Gmail API** and **Google Calendar API**.
2. **OAuth consent screen**: add the scopes `.../auth/gmail.readonly` and `.../auth/calendar.readonly`. While the app is in "Testing", add yourself (and any colleagues you invite) as test users.
3. **Credentials → Create OAuth client ID → Web application**:
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   - Save the **Client ID** and **Client Secret**.

### 2. Environment

```bash
cp .env.example .env
```

Then fill in `.env`:

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="<run: openssl rand -base64 32>"
AUTH_GOOGLE_ID="<client id from step 1>"
AUTH_GOOGLE_SECRET="<client secret from step 1>"
ALLOWED_EMAILS="you@yourfirm.com"
```

`ALLOWED_EMAILS` is a comma-separated allowlist. Leave it blank on the very first sign-in if you want, then add your email to lock the app down. To invite a colleague later, add their email (e.g. `you@firm.com,paralegal@firm.com`) — no other configuration needed.

### 3. Install and run

```bash
npm install
npm run db:push   # creates the SQLite database
npm run dev
```

Open <http://localhost:3000>.

## Usage notes

- **Gmail sync**: each case has a "Sync from Gmail" button. It searches your inbox for messages to/from the client's email address over the last year and links them to the case. The Inbox page has a "Sync all clients" button that does this for every client at once.
- **Calendar sync**: the Calendar page fetches your next 90 days of events. You assign each event to a case with the dropdown.
- **Documents**: uploaded files live in `./storage/documents/` on disk. Max 25MB per file. The `storage/` directory is gitignored.
- **Database**: SQLite file at `./dev.db`. Back it up by copying the file.

## Deploying for colleagues

The app is built local-first, but it's ready to deploy when colleagues want in:

1. Host on Vercel / Fly / Render and switch the Prisma datasource from `sqlite` to `postgresql` (only the `provider` line in `prisma/schema.prisma` and `DATABASE_URL`).
2. Update the Google OAuth redirect URI to your deployed URL.
3. For shared documents, swap `src/lib/storage.ts` for an S3 / R2 implementation (or mount persistent disk on Fly).
4. Add colleagues' emails to `ALLOWED_EMAILS`.
