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

## Admin dashboard

Open `https://dalsuitsbnb.com/admin` and sign in with `ADMIN_PASSWORD`.

- **Units:** add, edit, hide or delete suites; set bedrooms, guests, price per night (KES).
- **Photos:** upload per unit (resized in the browser, stored in MySQL), add captions, reorder, choose the cover.
- **Offers:** percent off the stay or KES off per night, for one unit or all, with optional minimum nights and date window. Guests get the single best offer.
- **Bookings:** upcoming bookings from WhatsApp and the website.

The website and the WhatsApp bot read units, prices and offers from the database, so changes show within a minute.
On first run the database is filled with Suites 110 and 123 (1 bedroom, KES 2,500) and 115 and 117 (2 bedrooms, KES 5,000).

## Editing

- Units, photos, prices and offers: the admin dashboard, no code change needed.
- Website text and contacts: `public/index.html` (the CONFIG block near the bottom).
- Bot wording and flow: `lib/bot.js`; first-run units: `SEED_UNITS` in `lib/config.js`.

## Local run

    npm install
    DB_HOST=localhost DB_USER=… DB_PASSWORD=… DB_NAME=… npm start   # or no DB vars for in-memory test mode
