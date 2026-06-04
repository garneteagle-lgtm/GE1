# Quickstart — run and test the app for real

This walks you through running Case Manager on your own computer and testing the
**Florida entity lookup** (service of process) end to end, with your real Google
account and real Sunbiz data.

Plan for ~30–45 minutes the first time, mostly waiting on the Google setup and
the data download. Everything else is a few commands.

---

## 0. What you need

- **A computer** (Mac, Windows, or Linux) — this is a local app; your data stays
  on your machine.
- **Node.js 20 or newer.** Check by opening a terminal and running `node -v`. If
  it's missing or older, install the LTS from <https://nodejs.org>.
- **Git.** Check with `git --version`; install from <https://git-scm.com> if
  needed.
- **A Google account** (the one whose Gmail/Calendar you want to read).

> Terminal tip: on Mac open **Terminal**, on Windows open **PowerShell**, on
> Linux your usual shell. Run the commands below from there.

---

## 1. Get the code

```bash
git clone https://github.com/garneteagle-lgtm/ge1.git
cd ge1
git checkout claude/ecstatic-goodall-ie2ke
npm install
```

`npm install` downloads dependencies — give it a minute.

---

## 2. Set up Google sign-in (the fiddly part)

The app signs you in with Google and reads Gmail/Calendar **read-only**. You need
to create OAuth credentials once.

1. Go to the **Google Cloud Console**: <https://console.cloud.google.com>.
2. Top bar → **project picker** → **New Project** (name it e.g. "Case Manager").
   Select it once created.
3. **Enable the APIs.** Left menu → **APIs & Services → Library**. Search for and
   **Enable** each of:
   - **Gmail API**
   - **Google Calendar API**
4. **Configure the consent screen.** APIs & Services → **OAuth consent screen**:
   - User type: **External** (or **Internal** if you have Google Workspace).
   - Fill app name + your email where required; you can skip optional fields.
   - **Scopes:** add `.../auth/gmail.readonly` and `.../auth/calendar.readonly`.
   - **Test users:** while the app is in "Testing", add **your own Google email**
     as a test user (otherwise Google blocks sign-in).
5. **Create the credentials.** APIs & Services → **Credentials** →
   **Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs** — add **both** of these exactly:
     - `http://localhost:3000/api/auth/callback/google`
     - `http://127.0.0.1:3000/api/auth/callback/google`
   - Click **Create**, then copy the **Client ID** and **Client secret**.

---

## 3. Create your settings file

```bash
cp .env.example .env
```

Open `.env` in any text editor and fill it in:

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="<paste a generated secret — see below>"
AUTH_GOOGLE_ID="<the Client ID from step 2>"
AUTH_GOOGLE_SECRET="<the Client secret from step 2>"
ALLOWED_EMAILS=""
```

Generate `AUTH_SECRET` with whichever works on your machine:

```bash
# Mac / Linux:
openssl rand -base64 32

# Any platform (Node):
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> **Back up `AUTH_SECRET`.** It also derives the key that encrypts your documents
> and Google tokens at rest. If you lose it, that encrypted data can't be
> recovered.

Leave `ALLOWED_EMAILS` blank for now — your first sign-in is allowed, and you'll
lock it down in step 7.

---

## 4. Create the database

```bash
npm run db:push
```

This creates a local SQLite file (`dev.db`). Nothing leaves your machine.

---

## 5. Load Florida entity data

The lookup searches Florida's official corporate registry locally. You load it
once (then refresh later with the small daily files). The full file is the
**quarterly** `cordata.zip` — it contains every active entity, so it's large
(hundreds of MB unzipped, millions of records); the import can take several
minutes.

### Option A — download it yourself (recommended, most reliable)

Connect to Florida's free public SFTP server and grab `cordata.zip`:

```
Host:     sftp.floridados.gov
Username: Public
Password: PubAccess1845!
```

Use any SFTP client — **Cyberduck** (Mac/Win), **WinSCP** (Win), **FileZilla**
(all), or your browser. After logging in, browse the public folders to the
**corporate quarterly** data and download `cordata.zip`. Then import it (point at
wherever you saved it; a `.zip` or an unzipped `.txt` both work):

```bash
npm run sunbiz:import -- ./cordata.zip --fresh
```

### Option B — let the app fetch it

```bash
npm run sunbiz:import -- --sftp --fresh
```

If this can't find the file, the remote folder path differs from the built-in
default. Use Option A to see the real path, then set it in `.env`:

```
SUNBIZ_SFTP_QUARTERLY="/the/path/you/saw/cordata.zip"
```

### Want a faster first run?

Before committing to the big quarterly file, you can sanity-check the pipeline on
a tiny **daily** file (one business day of filings — small, but search results
will be sparse since it's only that day's changes):

```bash
npm run sunbiz:import -- --sftp --daily 20260603 --fresh   # use a recent weekday
```

When the import finishes it prints how many records were written. If it warns
that many lines aren't 1440 characters, the file layout changed — see
`src/lib/sunbiz-layout.ts`.

---

## 6. Start the app

```bash
npm run dev
```

Open **<http://localhost:3000>** in your browser. Click **Sign in**, choose your
Google account, and approve the read-only Gmail/Calendar access. (If Google warns
the app is "unverified," that's expected for your own testing app — proceed; this
is why you added yourself as a test user.)

---

## 7. Lock down sign-in

Once you've signed in successfully, stop the server (`Ctrl+C`), set your email in
`.env` so only you can sign in, and restart:

```
ALLOWED_EMAILS="you@gmail.com"
```

```bash
npm run dev
```

---

## 8. Test the entity lookup

1. Click **Entities** in the top nav. The header shows how many Florida records
   loaded.
2. **Search** a Florida company you know — by name or by document number.
3. Open a result. You'll see the **Service of process** block (legal name +
   registered agent to serve + address), **officers & directors**, principal /
   mailing addresses, and registry details.
4. **Important accuracy check:** click **"Verify live on Sunbiz"** and compare the
   registered agent + address against the live record. Doing this once on a
   company you know confirms the data is lining up correctly with the real file.
5. **Link to a case:** create a Client and a Case (top nav → Clients/Cases), then
   on the entity page use **Add to case** (e.g. role "Defendant"). The case page
   will show it under **Parties to serve** with the agent to serve; the
   **Dashboard** shows a data-freshness card.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `redirect_uri_mismatch` at sign-in | The redirect URI must match exactly. Make sure you opened `http://localhost:3000` (the same host you registered) and that both `localhost` and `127.0.0.1` callback URLs are in your Google credentials. |
| "Access blocked / app not verified" | While the consent screen is in **Testing**, add your email under **Test users**. Then proceed past the warning. |
| Sign-in works but you can't get in after setting `ALLOWED_EMAILS` | The value must be your exact Google email, lowercase, comma-separated for multiple. Restart `npm run dev` after editing `.env`. |
| `Error: Missing AUTH_SECRET` | Generate one (step 3) and put it in `.env`. |
| Import warns many lines ≠ 1440 chars | The state changed the file layout; the field map is in `src/lib/sunbiz-layout.ts`. Run the import with `--dry-run` to inspect parsed rows. |
| Port 3000 already in use | Stop whatever's using it, or run `PORT=3001 npm run dev` and use that port (and matching redirect URI). |
| Searches return nothing | If you only imported a **daily** file, that's expected — load the **quarterly** `cordata.zip` for the full registry. |

---

## Refreshing the data later

Re-import the small daily files to stay current (they upsert, so just drop the
`--fresh`), or re-run the quarterly with `--fresh` to do a clean reload:

```bash
npm run sunbiz:import -- --sftp --daily 20260604
```

The Dashboard's entity-data card turns amber and nudges you once the data is a
week old.
