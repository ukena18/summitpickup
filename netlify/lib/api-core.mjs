import { randomUUID, createHash, timingSafeEqual } from "node:crypto";

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
const eq = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const json = (data, status = 200) => ({
  statusCode: status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(data),
});
const clean = (s) =>
  String(s || "")
    .trim()
    .slice(0, 100);
export const organizerAuthorized = (body) =>
  !!process.env.SOCCER_ADMIN_SECRET &&
  eq(body.adminSecret || "", process.env.SOCCER_ADMIN_SECRET);
export function createAPI({ read, save, all }) {
  const recordEvent = async (action, who, detail) =>
    save("audit/" + Date.now() + "-" + randomUUID(), {
      action,
      who,
      detail,
      at: new Date().toISOString(),
    });
  const adminOK = organizerAuthorized;
  const sessionKey = (id) => "sessions/" + id;
  const registrationKey = (id, playerId) =>
    "registrations/" + id + "/" + playerId;
  const active = (r) => r.status === "confirmed" || r.status === "waitlist";
  async function roster(id) {
    const regs = (await all("registrations/" + id + "/"))
      .filter(active)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return regs;
  }
  async function promote(id) {
    const session = await read(sessionKey(id), null);
    if (!session) return;
    const regs = await roster(id);
    const confirmed = regs.filter((r) => r.status === "confirmed");
    const wait = regs.filter((r) => r.status === "waitlist");
    for (const next of wait.slice(
      0,
      Math.max(0, session.capacity - confirmed.length),
    )) {
      next.status = "confirmed";
      next.updatedAt = new Date().toISOString();
      await save(registrationKey(id, next.playerId), next);
      await recordEvent("promoted", next.name, { sessionId: id });
    }
  }
  return async (event) => {
    try {
      const method = event.httpMethod;
      if (method === "OPTIONS") return json({ ok: true });
      const body = method === "POST" ? JSON.parse(event.body || "{}") : {};
      const action = method === "GET" ? "list" : body.action;
      if (action === "login") {
        return adminOK(body)
          ? json({ ok: true })
          : json({ error: "Incorrect organizer secret key." }, 403);
      }
      if (action === "list") {
        const sessions = (await all("sessions/"))
          .filter(
            (s) =>
              s.status !== "deleted" &&
              new Date(s.date + "T23:59:59") >= new Date(),
          )
          .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
        const output = [];
        for (const s of sessions) {
          const regs = await roster(s.id);
          const mine = regs.find(
            (r) =>
              r.playerId === body.playerId &&
              eq(r.secretHash, hash(body.playerSecret || "")),
          );
          output.push({
            ...s,
            myStatus: mine?.status || null,
            confirmed: regs
              .filter((r) => r.status === "confirmed")
              .map((r) => ({ name: r.name })),
            waitlist: regs
              .filter((r) => r.status === "waitlist")
              .map((r) => ({ name: r.name })),
            confirmedCount: regs.filter((r) => r.status === "confirmed").length,
            waitlistCount: regs.filter((r) => r.status === "waitlist").length,
          });
        }
        return json({ sessions: output });
      }
      if (action === "create" || action === "update") {
        if (!adminOK(body))
          return json({ error: "Incorrect organizer password." }, 403);
        const date = clean(body.date),
          start = clean(body.start),
          end = clean(body.end),
          location = clean(body.location),
          capacity = Number(body.capacity);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          Number.isNaN(Date.parse(date + "T12:00:00Z")) ||
          new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) ||
          start >= end ||
          !location ||
          !Number.isInteger(capacity) ||
          capacity < 2 ||
          capacity > 100
        )
          return json(
            { error: "Check date, time, location and capacity." },
            400,
          );
        if (action === "update") {
          const s = await read(sessionKey(clean(body.sessionId)), null);
          if (!s || s.status === "deleted")
            return json({ error: "Game not found." }, 404);
          const confirmed = (await roster(s.id)).filter(
            (r) => r.status === "confirmed",
          ).length;
          if (capacity < confirmed)
            return json(
              {
                error:
                  "Player limit cannot be lower than the number already registered.",
              },
              409,
            );
          Object.assign(s, { date, start, end, location, capacity });
          await save(sessionKey(s.id), s);
          await promote(s.id);
          await recordEvent("updated", "organizer", { sessionId: s.id, date });
          return json({ ok: true });
        }
        const s = {
          id: randomUUID(),
          date,
          start,
          end,
          location,
          capacity,
          status: "open",
          createdAt: new Date().toISOString(),
        };
        await save(sessionKey(s.id), s);
        await recordEvent("created", "organizer", { sessionId: s.id, date });
        return json({ ok: true });
      }
      if (action === "delete") {
        if (!adminOK(body))
          return json({ error: "Incorrect organizer password." }, 403);
        const s = await read(sessionKey(clean(body.sessionId)), null);
        if (!s) return json({ error: "Game not found." }, 404);
        s.status = "deleted";
        await save(sessionKey(s.id), s);
        await recordEvent("deleted", "organizer", { sessionId: s.id });
        return json({ ok: true });
      }
      if (action === "register") {
        const id = clean(body.sessionId),
          name = clean(body.name),
          playerId = clean(body.playerId),
          playerSecret = clean(body.playerSecret);
        if (
          !name ||
          name.length < 2 ||
          !playerId ||
          !playerSecret ||
          playerSecret.length < 16
        )
          return json({ error: "Name and player identity required." }, 400);
        const s = await read(sessionKey(id), null);
        if (!s || s.status !== "open")
          return json({ error: "Game not available." }, 404);
        const key = registrationKey(id, playerId),
          existing = await read(key, null);
        if (existing && active(existing))
          return json(
            { error: "You are already registered for this game." },
            409,
          );
        if (existing && !eq(existing.secretHash, hash(playerSecret)))
          return json(
            { error: "This registration belongs to another device." },
            403,
          );
        const regs = await roster(id);
        const status =
          regs.filter((r) => r.status === "confirmed").length < s.capacity
            ? "confirmed"
            : "waitlist";
        const r = {
          sessionId: id,
          playerId,
          name,
          secretHash: hash(playerSecret),
          status,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await save(key, r);
        await recordEvent("registered", name, { sessionId: id, status });
        return json({ ok: true, status });
      }
      if (action === "cancel") {
        const id = clean(body.sessionId),
          playerId = clean(body.playerId),
          secret = clean(body.playerSecret),
          key = registrationKey(id, playerId),
          r = await read(key, null);
        if (!r || !eq(r.secretHash, hash(secret)) || !active(r))
          return json(
            { error: "No matching active registration for this device." },
            403,
          );
        r.status = "cancelled";
        r.updatedAt = new Date().toISOString();
        await save(key, r);
        await recordEvent("cancelled", r.name, { sessionId: id });
        await promote(id);
        return json({ ok: true });
      }
      if (action === "audit") {
        if (!adminOK(body))
          return json({ error: "Incorrect organizer password." }, 403);
        const logs = (await all("audit/"))
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 100);
        return json({ logs });
      }
      return json({ error: "Unknown action." }, 400);
    } catch (e) {
      console.error("Soccer API request failed:", e?.name || "Error");
      return json({ error: "Server error. Please try again." }, 500);
    }
  };
}
