import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { createAPI, organizerAuthorized } from "../lib/api-core.mjs";
import { importLegacy, repository } from "../lib/repository.js";

// Use Netlify's modern Request handler. The legacy Lambda-compatible handler
// does not automatically receive the Netlify Database connection environment.
const respond = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "GET" && request.method !== "POST")
    return respond({ error: "Method not allowed." }, 405);

  let body: Record<string, unknown> = {};
  try {
    if (request.method === "POST") body = await request.json();
  } catch {
    return respond({ error: "Invalid request." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return respond({ error: "Invalid request." }, 400);

  // Authenticate before any storage access.
  if (["login", "create", "update", "delete", "audit"].includes(String(body.action))) {
    if (!organizerAuthorized(body))
      return respond({ error: "Incorrect organizer secret key." }, 403);
    if (body.action === "login") return respond({ ok: true });
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Serialize writes to prevent overbooking, including the legacy import.
      await tx.execute(sql`select pg_advisory_xact_lock(736211, 1)`);
      await importLegacy(tx);
      const result = await createAPI(repository(tx))({
        httpMethod: request.method,
        body: JSON.stringify(body),
      });
      // Roll back if a response represents a failed operation.
      if (result.statusCode >= 400) throw result;
      return result;
    });
    return new Response(result.body, {
      status: result.statusCode,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (failure: any) {
    if (failure?.statusCode && typeof failure.body === "string")
      return new Response(failure.body, {
        status: failure.statusCode,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    console.error("Soccer database request failed:", failure);
    return respond({ error: "Unable to load the schedule right now. Please try again." }, 500);
  }
}
