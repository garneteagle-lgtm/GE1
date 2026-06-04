# Case Manager

A small case management web app for a solo lawyer.

- Clients, cases, notes, tasks, deadlines, document uploads
- Google sign-in (Auth.js v5)
- Pulls related messages from Gmail by client email (read-only)
- Pulls upcoming events from Google Calendar (read-only); link any event to a case
- **Entity lookup** for service of process — search Florida's official corporate registry locally to find who/where to serve when suing or subpoenaing a company

Stack: Next.js 15 (App Router) · TypeScript · Tailwind · Prisma · SQLite.

## Setup

### 1. Google OAuth credentials

In your existing Google Cloud project:

1. **Enable APIs**: APIs & Services → Library → enable **Gmail API** and **Google Calendar API**.
2. **OAuth consent screen**: add the scopes `.../auth/gmail.readonly` and `.../auth/calendar.readonly`. While the app is in "Testing", add yourself as a test user.
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

`AUTH_SECRET` is also used to derive the key for at-rest encryption (see Security). Generate a fresh random value and **back it up somewhere safe**. If you lose it, your encrypted documents and OAuth tokens cannot be recovered.

### 3. Install and run

```bash
npm install
npm run db:push   # creates the SQLite database
npm run dev
```

Open <http://127.0.0.1:3000>.

## Usage notes

- **Gmail sync**: each case has a "Sync from Gmail" button. It searches your inbox for messages to/from the client's email address over the last year and links them to the case. Only headers (subject, from, to, date) are stored locally — the message body is never saved.
- **Calendar sync**: the Calendar page fetches your next 90 days of events. You assign each event to a case with the dropdown.
- **Documents**: uploaded files live encrypted in `./storage/documents/` on disk. Max 25MB per file.
- **Database**: SQLite file at `./dev.db`. Back it up by copying the file (along with `.env`, since the encryption key lives there).

## Entity lookup (service of process)

When you need to sue or subpoena a business, you need its exact legal name and
its **registered agent** — the person/company authorized to accept service. The
**Entities** tab searches Florida's official corporate registry and, for each
entity, shows:

- a ready-to-paste **service block** (legal name + registered agent + address),
- the entity's **officers and directors** (for individual service or deciding
  who to depose),
- principal/mailing addresses, status, FEI/EIN, and filing dates, and
- a button to **link the entity to a case** as a defendant or subpoena target.

### Accuracy

Stored records come from a bulk file and can lag the live registry. Because
serving the wrong agent can void service, every entity page carries a **"Verify
live on Sunbiz"** button that opens the authoritative record by document number
(in a browser, which passes the Cloudflare challenge that blocks scraping), plus
the sync date and the entity's last state filing date so you can judge freshness
at a glance. Treat the local copy as a fast index; confirm the agent and address
on the live record before effecting service.

Rather than scraping sunbiz.org per query (it sits behind a Cloudflare
bot-challenge that blocks automated requests), this imports Florida's official
**bulk data download** into your local database and searches it offline. After a
one-time load, lookups are instant and require no network call.

### Loading the data

The Florida Division of Corporations publishes the full corporate file
(`cordata.zip`) plus small daily update files over a free public SFTP server:

```
Host: sftp.floridados.gov   User: Public   Pass: PubAccess1845!
```

**Option A — let the app fetch it:**

```bash
npm run sunbiz:import -- --sftp --fresh        # full quarterly file (large, do once)
npm run sunbiz:import -- --sftp --daily 20260603   # a daily update file
```

**Option B — download it yourself** (any SFTP client or a browser) and import the
file:

```bash
npm run sunbiz:import -- ./cordata.zip --fresh     # .zip or unzipped .txt both work
```

Useful flags: `--fresh` (wipe then fast bulk-insert — use for the full file),
`--active-only` (skip inactive entities), `--dry-run` (parse and print the first
few records without writing — handy to sanity-check the layout).

Refresh by importing the daily files (fast, upserts) or re-running the quarterly
with `--fresh`. The fixed-width record layout lives in
`src/lib/sunbiz-layout.ts`, mirroring Florida's published
[file definition](https://dos.sunbiz.org/data-definitions/cor.html) — the only
place to edit if the state ever changes the format.

> Coverage is Florida only for now, and bulk data can lag the live record by up
> to a day (quarterly) — always confirm the agent and address on sunbiz.org
> before effecting service.

## Security

This app is built for solo use with confidential client data. Here's what is and isn't protected, and what you need to do.

### What the app does for you

- **Local only.** The server binds to `127.0.0.1`; nothing listens on your LAN. The app reaches the network in exactly two places, and **never sends your client data anywhere**: read-only Gmail/Calendar (to Google), and the entity importer downloading Florida's *public* corporate dataset from the state SFTP server. Entity lookups themselves run entirely against your local database — no per-query network call.
- **Read-only Google access.** The app can read Gmail/Calendar; it cannot send mail or modify your calendar.
- **OAuth tokens encrypted at rest.** The Google access/refresh tokens stored in `dev.db` are AES-256-GCM encrypted with a key derived from `AUTH_SECRET`. Someone with just `dev.db` cannot use them.
- **Documents encrypted at rest.** Uploaded files are AES-256-GCM encrypted before being written to disk. Filenames on disk are random; the original filename only appears in the (encrypted-token-protected) DB.
- **No email body cached.** Gmail sync stores subject/from/to/date headers and the Gmail message ID — never the body or snippet.
- **Sign-in allowlist.** Only emails in `ALLOWED_EMAILS` can sign in.
- **Short sessions.** Sessions expire after 8 hours of activity.
- **Security headers.** CSP, X-Frame-Options, Referrer-Policy, and no-camera/mic/geo set on every response.

### What you still need to do (the OS layer)

These are the actual likely attack vectors. The app cannot protect against them on its own.

1. **Turn on full-disk encryption.** FileVault (Mac), BitLocker (Windows), or LUKS (Linux). Non-negotiable for client data — if your laptop is stolen or borrowed, this is what stops a stranger from reading everything.
2. **Set a short auto-lock timeout** on your OS (5 minutes idle). Anyone who walks up to your unlocked machine can open `localhost:3000` and read everything.
3. **Strong password + 2FA on your Google account.** Compromise of your Google account would let an attacker re-sign-in and access Gmail/Calendar.
4. **Encrypted backups.** SQLite is one file — if it corrupts or your disk dies, the data is gone. Back up `dev.db`, the `storage/` directory, and `.env` to encrypted storage (Time Machine on an encrypted volume, Arq to encrypted cloud, etc.). Without `.env` (or specifically `AUTH_SECRET`), the backup is unrecoverable.
5. **Don't commit `.env` or `dev.db` to git.** Both are gitignored, but be careful.

### Threat model summary

| Scenario | Protected? |
| --- | --- |
| Laptop stolen, disk **encrypted**, screen locked | Yes — attacker can't get past disk encryption. |
| Laptop stolen, disk **not** encrypted | Partial — they can read `dev.db` but tokens and documents are still AES-encrypted by the app. Subject lines and case metadata would be readable. Turn on full-disk encryption. |
| Someone gets a copy of just `dev.db` (e.g. an unencrypted backup) | Yes — tokens encrypted, documents not in DB. |
| Someone gets both `dev.db` and `.env` | No — `.env` contains the key. Treat `.env` like a password. |
| Malware running as your user | No — same trust as you. App-level encryption can't protect against this; only AV / disk hygiene helps. |
| Google account compromise | No — they could sign in and pull all your data. Use 2FA. |

### Ethics

Most state bars (under ABA Model Rule 1.6 / 1.1) require "reasonable measures" to protect client confidences. Full-disk encryption + screen lock + this app's at-rest encryption + Google 2FA is comfortably within that bar for solo practice on a personal device. For especially sensitive matters, consider an air-gapped or separate device.
