import { createAPI, organizerAuthorized } from "../lib/api-core.mjs";
import { repository } from "../lib/repository.js";

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

  // Check organizer authorization before touching storage.
  if (["login", "create", "update", "delete", "audit", "adminRoster", "adminEditPlayer", "adminRemovePlayer"].includes(String(body.action))) {
    if (!organizerAuthorized(body))
      return respond({ error: "Incorrect organizer secret key." }, 403);
    if (body.action === "login") return respond({ ok: true });
  }

  try {
    const result = await createAPI(repository())({
      httpMethod: request.method,
      body: JSON.stringify(body),
    });
    return new Response(result.body, {
      status: result.statusCode,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (failure) {
    console.error("Soccer JSON store request failed:", failure);
    return respond({ error: "Unable to load the schedule right now. Please try again." }, 500);
  }
}
