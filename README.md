# Summit County Pickup — JSON-backed Netlify edition

This project uses Netlify Blobs to store **JSON objects** for games, registrations, waiting lists and organizer audit records. No Postgres or Netlify Database is required.

## Deploy to the NEW Netlify account/project

1. Upload/push **this complete extracted project folder** to the repository connected to your new Netlify project, or link this folder using the Netlify CLI.
2. Build: `npm run build`; publish: `public`; functions: `netlify/functions` (already configured in `netlify.toml`).
3. In the **new** site's Environment variables, set `SOCCER_ADMIN_SECRET` to a long, private secret. Do not put it in source control.
4. Deploy. The API uses Netlify Blobs and creates records on demand; there is no database setup step.
5. Check the page, create a test game, register and cancel a test player, and verify persistence after a refresh.

## Important limitations

- Static JSON files included in `public/` are read-only at runtime. Netlify Blobs stores JSON records persistently across deploys and server restarts.
- This storage is suitable for small, low-traffic pickup games, but it does **not** provide database transactions or guaranteed capacity limits under concurrent signups. Two people registering at precisely the same moment may overbook. If strict capacity/waitlist accuracy is essential, use a transactional backend.
- The records belong to a **Netlify site**, not your local ZIP. Deploying to a new Netlify account/project starts with empty game and registration data; old-site Blobs do **not** transfer automatically.
- Blobs are shared across deploy previews and production on the same site. Do not submit real/test registrations on a preview if you need isolated production data.
- To inspect your records, use Netlify dashboard **Data & Storage → Blobs**, store `summit-soccer-data`.

## Local tests

`npm test` tests the game/registration business rules using an in-memory fixture. It does not exercise live Netlify Blobs.

## Organizer player management
In Organizer tools > Manage scheduled games, click **Manage players** under a game. The organizer can change a registered player's display name, or remove them from that game. Removing a confirmed player promotes the next waitlisted player. These actions require SOCCER_ADMIN_SECRET and do not reveal player device secrets. Changes persist in the site's Netlify Blobs storage. Note that Netlify Blobs does not provide transactions; simultaneous requests can race.

## Dark theme and mobile roster update

The interface now uses a midnight-blue dark theme across its calendar, game details, organizer tools, forms, and dialogs. Opening **Player roster** on a game displays individually styled confirmed-player entries and the ordered waitlist. Layouts adapt down to narrow mobile widths. This is a presentation update: it does not modify the Netlify Blobs storage format or overwrite existing game/player records.
