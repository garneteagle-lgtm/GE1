# Case Manager — Windows desktop app

This is the double-click Windows version. It runs entirely on your computer,
opens straight to the app (no Google sign-in required), and stores everything in
your private Windows user folder.

## How to get the installer (no terminal needed)

The installer is built automatically by a "robot" on GitHub. To get it:

1. Open the repository's **Actions** tab on GitHub.
2. In the left sidebar click **"Build Windows desktop app."**
3. Click the **"Run workflow"** button (top right) → **Run workflow**. Wait a few
   minutes for the green checkmark.
4. Open that finished run and scroll to **Artifacts** at the bottom. Download
   **CaseManager-Windows-Installer** — it's a `.zip`.
5. Unzip it and double-click **`CaseManager-Setup-x.y.z.exe`** to install. You'll
   get a desktop icon and a Start-menu entry.

> Windows may show a blue **"Windows protected your PC"** SmartScreen warning,
> because the app isn't code-signed (signing requires a paid certificate). Click
> **More info → Run anyway**. This is expected for a personal in-house app.

## First run

- The app opens to the dashboard. Click **Entities** to use the Florida lookup.
- It starts empty — load the Florida registry once (see "Loading data" below).
- Your data lives in:
  `C:\Users\<you>\AppData\Roaming\Case Manager\`
  (the database `data.db`, an encryption secret `config.json`, and `launcher.log`
  if something goes wrong). Back this folder up.

## Loading Florida data

The desktop app uses the same importer as the full project. Until there's an
in-app "Sync" button, load data once from a terminal in the project folder (a
developer can do this for you, or see QUICKSTART.md):

```
npm run sunbiz:import -- ./cordata.zip --fresh
```

…pointing `DATABASE_URL` at the app's `data.db`. (A built-in **Sync** button is
the planned next step so this needs no terminal at all.)

## Security notes

- No Google account and no cloud — the app is local to this machine.
- Because there's no per-app password, **the security boundary is your Windows
  login**. Use a strong Windows password, turn on **BitLocker** disk encryption,
  and set a short screen-lock timeout (the same advice as in the main README).
- Documents and any stored tokens are encrypted at rest with a key derived from
  the secret in `config.json`. If you delete that file, previously encrypted data
  can't be read — back it up with your data.

## For developers: building locally

On a Windows machine with Node 20+:

```
npm ci
npm run desktop:dist      # outputs dist-desktop\CaseManager-Setup-*.exe
```

How it works: `next build` (with `output: "standalone"`) produces a self-contained
server; `scripts/desktop-postbuild.mjs` copies static assets and the Prisma engine
beside it; `electron/main.js` forks that server on a local port and opens a window;
`electron-builder` (config in `electron-builder.yml`) packages it as an NSIS
installer. The launcher sets `DESKTOP_LOCAL_AUTH=1`, which makes the app use a
single local user instead of Google sign-in (see `src/lib/guard.ts`).
