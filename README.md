# DAL Suits BnB: website + WhatsApp booking bot

One Express app: serves the website from `public/`, the WhatsApp webhook at `/api/whatsapp`,
and suite availability at `/api/availability`. Bookings are stored in MySQL.

## Deploy on Hostinger (Unlimited / Business plan)

1. hPanel > Databases > MySQL Databases: create a database and user; note the
   full names (they start with `u…_`) and the password.
2. hPanel > Websites > Add website > Node.js Web App > Upload files: upload this zip
   and choose the domain `dalsuitsbnb.com`.
3. Build settings: framework Express (or Other with entry file `server.js`),
   Node.js 22.x, package manager npm, start command `npm start`.
4. Environment variables > Import .env: use `.env.example`, filled in with the
   database details from step 1 and the WhatsApp values.
5. Deploy, then open `https://dalsuitsbnb.com/api/whatsapp?health`. It should show
   `"storage":"mysql"` and `"database":"ok"`. Tables are created automatically.
6. hPanel > Emails: create the mailbox `bookings@dalsuitsbnb.com` (the website's
   "Send by email" button uses it).
7. Point the WhatsApp webhook to `https://dalsuitsbnb.com/api/whatsapp` with the
   same `WA_VERIFY_TOKEN`, subscribed to `messages`.

## Editing

- Website text, suites, contacts: `public/index.html` (the CONFIG block near the bottom).
- Bot wording and flow: `lib/bot.js`; suite list for the bot: `lib/config.js`.
- Nightly rates for the bot: `RATES` environment variable, no code change needed.

## Local run

    npm install
    DB_HOST=localhost DB_USER=… DB_PASSWORD=… DB_NAME=… npm start   # or no DB vars for in-memory test mode
