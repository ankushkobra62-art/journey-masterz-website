# Journey Masterz — Beginner Installation Guide (Windows)

This version has been adjusted to avoid the native `better-sqlite3` package that can fail to compile on some Windows computers. It uses `sql.js` (WebAssembly-based SQLite) and a file-backed session store, so a C++ compiler is not normally required for installation.

## Before you begin

- Windows 10 or Windows 11
- Internet access during first-time installation
- Node.js LTS, version 20 or newer
- About 5–10 minutes for setup, depending on your internet speed

## Part 1 — Extract the project

1. Download the ZIP file.
2. Open **Downloads**.
3. Right-click `JourneyMasterzWebsite.zip`.
4. Select **Extract All…** and then **Extract**.
5. Open the extracted `JourneyMasterzWebsite` folder.
6. Confirm that you can see files such as `package.json`, `app.js`, `SETUP-WINDOWS.bat`, and `START-WEBSITE.bat`.

Do not run the files from inside the ZIP preview.

## Part 2 — Install Node.js

1. Open https://nodejs.org/en/download
2. Download the current **LTS** installer for Windows.
3. Run the installer and keep the standard options.
4. Finish the installation.
5. If Command Prompt was already open, close it and reopen it so Windows can find Node.js.

Optional check: open Start, type `cmd`, open Command Prompt, and run `node -v` and `npm -v`. Both should print version numbers.

## Part 3 — Run the setup helper

1. Return to the extracted `JourneyMasterzWebsite` folder.
2. Double-click **SETUP-WINDOWS.bat**.
3. If Windows asks whether to allow the script, only continue if you launched it from the project you downloaded.
4. On the first run, Notepad opens `.env`.
5. Replace these example values:
   - `SESSION_SECRET`: use a long random secret (at least 32 characters).
   - `ADMIN_EMAIL`: enter an email address you control.
   - `ADMIN_PASSWORD`: create a strong, unique password.
6. Save the file in Notepad and close Notepad.
7. Return to the setup window and wait for `npm install` to finish.

Keep `.env` private. Do not post it online, send it in screenshots, or share your admin password.

If setup finishes with `Setup complete`, continue.

## Part 4 — Start the website

1. Double-click **START-WEBSITE.bat**.
2. Wait for a message like `Journey Masterz running at http://localhost:3000`.
3. Keep the black window open. It is running your website.

Open Chrome and visit:

- Website: http://localhost:3000
- Admin login: http://localhost:3000/admin/login

Use the email and password you entered in `.env`. Do not expect the admin login to work until the server has started successfully.

## Part 5 — Stop and restart

- To stop the website, click the black server window and press `Ctrl+C`.
- To start it again, double-click `START-WEBSITE.bat`.
- Your package and enquiry database is stored in the configured database file, normally `data/journey-masterz.sqlite`.
- Local uploaded images are stored in `public/uploads` by default.

## Troubleshooting

### “node is not recognized” or “npm is not recognized”
Install Node.js LTS from the official website. Then close and reopen the setup window. Restart Windows if the commands still cannot be found.

### `npm install` fails
1. Make sure your internet connection works.
2. Close the setup window.
3. Reopen `SETUP-WINDOWS.bat`.
4. If it fails again, copy the last 15–25 lines of the error. Do not share the `.env` file or passwords.

This version no longer requires compiling `better-sqlite3`, which was the source of a common Windows `node-gyp` failure. Other network, antivirus, or dependency issues may still need troubleshooting.

### “Port 3000 is already in use”
Another program may be using port 3000. Close another Journey Masterz server window first. If the message remains, contact support with the exact error text before changing configuration.

### Admin login doesn't work
- Check that the email and password in `.env` are the ones you're entering.
- The initial admin account is created when the database is first initialized and `ADMIN_EMAIL` / `ADMIN_PASSWORD` are set. If a database already has a user, changing `.env` does not automatically reset that existing user's password.
- Never delete the database unless you understand that it may contain your saved enquiries and edits.

### Website opens but images are missing
Some destination images use external image URLs and therefore require internet access. Uploaded images should be stored in the configured uploads folder.

### Windows shows a security warning
Only run the `.bat` files in the project folder you intentionally downloaded. They install packages using npm and start the local server; they do not need administrator privileges in normal use.

## Security and production notes

- Change the example admin password before using the admin dashboard.
- Do not expose your `.env` file or commit it to a public repository.
- Use HTTPS and a long random session secret in production.
- Use a hosting provider with persistent storage for the database, uploaded images, and session files. Ephemeral storage can lose data after restarts or redeploys.
- This `sql.js` setup persists a small SQLite database file and is intended for a small, single-instance website. For larger traffic or multiple app instances, use managed PostgreSQL and object storage.
- No online payment, checkout, UPI, payment gateway, or payment link features are included.

## Business contact details

Phone and WhatsApp: +91 9899266481  
Address: 1348/27 Patel Nagar, Hisar, Haryana 125001
