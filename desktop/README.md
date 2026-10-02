# Letterhead — desktop app

A standalone Windows app for your Lenovo: paste a letter, see it formatted on
the firm's letterhead, and **Export to PDF** through a normal Save dialog where
you browse to any folder and name the file. Built with Electron; no web server,
no sign-in, nothing leaves your computer.

## Get the installer (no developer tools needed)

The app is built for you automatically on GitHub. There are two ways to get it.

### Option A — a permanent download link (GitHub Release)

Every released version is published on the repo's **Releases** page with a
stable download link you can bookmark.

1. Open the repo on GitHub → **Releases** (right-hand sidebar).
2. Open the latest **Letterhead vX.Y.Z** release.
3. Under **Assets**, download `Letterhead Setup <version>.exe`.
4. Run it on your Lenovo — a **Letterhead** desktop shortcut is created.

To cut a new release: in the **Actions** tab run **"Release Letterhead desktop
app (Windows)"**, or push a git tag like `v1.0.1`. Bump the `version` in
`desktop/package.json` before releasing a new build so the tag is unique.

### Option B — a one-off build (Actions artifact)

1. Go to the **Actions** tab → **Build Letterhead desktop app (Windows)**.
2. Click **Run workflow**, wait a few minutes, open the run.
3. Download the **Letterhead-Windows-Installer** artifact and unzip it.

> The installer is **not code-signed**, so Windows SmartScreen may warn you the
> first time ("Windows protected your PC"). Click **More info → Run anyway** —
> this is expected for a self-built app. Signing requires a paid certificate we
> can add later if you want to distribute it.

## Using the app

1. Open **Letterhead**.
2. Click **Edit letterhead** once to confirm your logo, footer address, phone/fax,
   and signature. (It's pre-filled with the firm's details; everything is saved
   on your computer.) You can upload a different logo here.
3. Back on the letter screen, fill in the date, delivery line, recipient, `Re:`
   line, and salutation, then **paste the body** (blank line between paragraphs).
   Optionally set `xc:` and check **Note enclosure**.
4. Click **Export to PDF…**, **browse to the folder you want**, name the file,
   and save. The finished PDF opens in its folder.

## Build it yourself (optional)

If you'd rather build locally instead of using GitHub:

```bash
cd desktop
npm install
npm start        # run the app in development
npm run dist      # build dist/Letterhead Setup <version>.exe
```

Requires Node.js 18+ on the machine doing the build.

## Where settings live

Your letterhead settings are stored in a small `settings.json` under your
Windows user profile (`%APPDATA%/Letterhead`). Uninstalling the app does not
delete it.
