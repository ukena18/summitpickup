# Summit Pickup Soccer

A pickup soccer calendar with name-based registration and organizer tools on Netlify.

Choose a scheduled date or game to open registration and enter a display name. The server confirms a spot or adds the player to the waitlist when full. Player counts refresh after changes and every 15 seconds while the page is visible. A player's cancellation identity stays in their browser; clearing browser data removes that access.

Organizer tools require the existing `SOCCER_ADMIN_SECRET` before opening. The key is checked on the server for every organizer action and stays only in the page's memory until the tools are locked or the page is closed. Organizers can publish, edit, and remove games and view the activity log. Editing preserves registrations; capacity cannot drop below the confirmed count. Increasing capacity or cancelling a spot promotes waiting players in signup order.

The static frontend is published from `public`, with its API in `netlify/functions/api.ts`. Structured game, registration, and audit records use Netlify Database with Drizzle. The schema is in `db/schema.ts`; deployment applies the generated migrations in `netlify/database/migrations`. The first schedule request imports the existing site's Blobs records into the database once, transactionally, without changing the original blobs. Database transactions serialize changes to prevent overbooking.

Run `node --test tests/api.test.mjs` for API behavior checks. Netlify handles deployment and database migration application.
