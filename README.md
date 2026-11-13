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
   `"storage":"mysql"` and `"database":"ok"`. Tables are created automatically on first
   start; to create them yourself instead, import `database/schema.sql` in phpMyAdmin.
6. hPanel > Emails: create the mailbox `bookings@dalsuitsbnb.com` (the website's
   "Send by email" button uses it).
7. Point the WhatsApp webhook to `https://dalsuitsbnb.com/api/whatsapp` with the
   same `WA_VERIFY_TOKEN`, subscribed to `messages`.

## Database (photos must survive redeploys)

Photos, units, prices, offers and bookings live in MySQL. If the database settings are
missing, the app runs in memory: everything disappears on the next restart or redeploy, so
the admin shows a red banner and refuses to save. Check `/api/whatsapp?health`: it must say
`"storage":"mysql"` and `"database":"ok"`.

Give the app `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (and `DB_PORT` if not 3306) in one of:

- **hPanel > your Node.js app > Environment variables** (preferred), or
- a file named `dalsuits.env` in your **home folder** (the top level in File Manager, not inside
  the app or `public_html`). It survives redeploys because it is outside the deployed folder.
  Same `KEY=value` format as `.env.example`. hPanel variables win if both are set.

A `.env` inside the app folder is also read, but a GitHub redeploy replaces that folder, so
don't rely on it in production. For local testing without MySQL set `ALLOW_MEMORY_STORAGE=1`.

## Admin dashboard

Open `https://dalsuitsbnb.com/admin` and sign in with `ADMIN_PASSWORD`.

- **Units:** add, edit, hide or delete suites; set bedrooms, guests, the whole-unit price and an optional 1-bedroom price (KES per night).
- **Photos:** upload per unit (resized in the browser, stored in MySQL), add captions, reorder, choose the cover.
- **Offers:** percent off the stay or KES off per night, for one unit or all, with optional minimum nights and date window. Guests get the single best offer.
- **Bookings:** upcoming bookings from WhatsApp and the website.

The website and the WhatsApp bot read units, prices and offers from the database, so changes show within a minute.
On first run the database is filled with Suites 110, 123, 115 and 117: each has 2 bedrooms and can be booked as 1 bedroom (KES 2,500, 2 guests) or the whole suite (KES 5,000, 4 guests). A 1-bedroom booking keeps the suite private. Databases from an earlier version are upgraded automatically on start (or run `database/migrations/` by hand).

## Website bookings

When a guest submits the booking form, the request is saved in `dal_bookings` (source `website`)
at the same moment WhatsApp opens with the message, so it isn't lost if they never press send.

- The form checks availability as dates are chosen and won't send a request for a booked suite.
- A free suite is held as `pending` for 24 hours, like a WhatsApp request; confirm or decline with
  `CONFIRM <ref>` / `DECLINE <ref>` on WhatsApp. If someone else took the suite in the meantime the
  request is still saved as `unavailable` so you can call the guest.
- The price at the time of the request (with any offer) is stored with the booking.
- New requests appear under Bookings in `/admin`, and host numbers get a WhatsApp alert once the bot is connected.
- If the guest also sends the WhatsApp message, the bot recognises the reference and doesn't create a duplicate.
- `POST /api/bookings` has a spam honeypot and allows 20 saved requests per hour per connection.

## Editing

- Units, photos, prices and offers: the admin dashboard, no code change needed.
- Website text and contacts: `public/index.html` (the CONFIG block near the bottom).
- Bot wording and flow: `lib/bot.js`; first-run units: `SEED_UNITS` in `lib/config.js`.

## Local run

    npm install
    DB_HOST=localhost DB_USER=… DB_PASSWORD=… DB_NAME=… npm start   # or no DB vars for in-memory test mode
