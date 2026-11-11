import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createAPI } from "../netlify/lib/api-core.mjs";

// Test-only storage fixture; production uses a locked Postgres transaction.
function fixture() {
  const records = new Map();
  const handler = createAPI({
    read: async (key, fallback) =>
      structuredClone(records.get(key) ?? fallback),
    save: async (key, value) => records.set(key, structuredClone(value)),
    all: async (prefix) =>
      [...records]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, value]) => structuredClone(value)),
  });
  return async (body) => {
    const result = await handler({
      httpMethod: body ? "POST" : "GET",
      body: JSON.stringify(body),
    });
    return { status: result.statusCode, ...JSON.parse(result.body) };
  };
}

test("organizer authorization protects login, create, update, delete and audit", async (t) => {
  const original = process.env.SOCCER_ADMIN_SECRET;
  process.env.SOCCER_ADMIN_SECRET = randomUUID();
  t.after(() => {
    if (original === undefined) delete process.env.SOCCER_ADMIN_SECRET;
    else process.env.SOCCER_ADMIN_SECRET = original;
  });
  const call = fixture();
  for (const action of ["login", "create", "update", "delete", "audit"]) {
    assert.equal(
      (await call({ action, adminSecret: randomUUID() })).status,
      403,
    );
  }
  assert.equal(
    (
      await call({
        action: "login",
        adminSecret: process.env.SOCCER_ADMIN_SECRET,
      })
    ).ok,
    true,
  );
});

test("registration counts, edits, waitlist promotion and removal use saved records", async (t) => {
  const original = process.env.SOCCER_ADMIN_SECRET;
  const adminSecret = randomUUID();
  process.env.SOCCER_ADMIN_SECRET = adminSecret;
  t.after(() => {
    if (original === undefined) delete process.env.SOCCER_ADMIN_SECRET;
    else process.env.SOCCER_ADMIN_SECRET = original;
  });
  const call = fixture();
  const fields = {
    date: "2099-01-01",
    start: "18:00",
    end: "20:00",
    location: "Frisco gym",
    capacity: 2,
  };
  assert.equal(
    (await call({ action: "create", adminSecret, ...fields })).ok,
    true,
  );
  const sessionId = (await call()).sessions[0].id;
  const players = Array.from({ length: 4 }, (_, i) => ({
    playerId: randomUUID(),
    playerSecret: randomUUID(),
    name: "Player " + i,
  }));
  for (let i = 0; i < 4; i++) {
    const result = await call({ action: "register", sessionId, ...players[i] });
    assert.equal(result.status, i < 2 ? "confirmed" : "waitlist");
  }
  assert.equal(
    (await call({ action: "register", sessionId, ...players[0] })).status,
    409,
  );
  const list = async (player) =>
    (await call({ action: "list", ...player })).sessions[0];
  let game = await list(players[0]);
  assert.equal(game.confirmedCount, 2);
  assert.equal(game.waitlistCount, 2);
  assert.equal(game.myStatus, "confirmed");
  assert.equal(
    (await list({ ...players[0], playerSecret: randomUUID() })).myStatus,
    null,
  );
  assert.ok(
    !JSON.stringify((await call()).sessions).includes(players[0].playerId),
  );
  assert.ok(!JSON.stringify((await call()).sessions).includes("secretHash"));
  assert.equal(
    (
      await call({
        action: "update",
        sessionId,
        adminSecret,
        ...fields,
        capacity: 1,
      })
    ).status,
    400,
  );
  const updated = {
    action: "update",
    sessionId,
    adminSecret,
    ...fields,
    capacity: 4,
    location: "New field",
  };
  assert.equal((await call(updated)).ok, true);
  game = await list(players[2]);
  assert.equal(game.location, "New field");
  assert.equal(game.confirmedCount, 4);
  assert.equal(game.waitlistCount, 0);
  assert.equal(game.myStatus, "confirmed");
  assert.equal((await call({ ...updated, capacity: 3 })).status, 409);
  assert.equal(
    (
      await call({
        action: "cancel",
        sessionId,
        ...players[0],
        playerSecret: randomUUID(),
      })
    ).status,
    403,
  );
  assert.equal(
    (await call({ action: "cancel", sessionId, ...players[0] })).ok,
    true,
  );
  assert.equal((await list(players[0])).confirmedCount, 3);
  assert.equal((await list(players[0])).myStatus, null);
  const logs = await call({ action: "audit", adminSecret });
  assert.ok(logs.logs.some((log) => log.action === "updated"));
  assert.equal(
    (await call({ action: "delete", sessionId, adminSecret })).ok,
    true,
  );
  assert.equal((await call()).sessions.length, 0);
  assert.equal(
    (await call({ action: "register", sessionId, ...players[0] })).status,
    404,
  );
});

test("invalid calendar dates and times cannot create a game", async (t) => {
  const original = process.env.SOCCER_ADMIN_SECRET;
  const adminSecret = randomUUID();
  process.env.SOCCER_ADMIN_SECRET = adminSecret;
  t.after(() => {
    if (original === undefined) delete process.env.SOCCER_ADMIN_SECRET;
    else process.env.SOCCER_ADMIN_SECRET = original;
  });
  const call = fixture();
  const fields = {
    action: "create",
    adminSecret,
    date: "2099-02-30",
    start: "18:00",
    end: "20:00",
    capacity: 10,
    location: "Gym",
  };
  assert.equal((await call(fields)).status, 400);
  assert.equal(
    (await call({ ...fields, date: "2099-02-28", end: "25:00" })).status,
    400,
  );
  assert.equal((await call()).sessions.length, 0);
});

test("cancellation immediately promotes the first waiting player", async (t) => {
  const original = process.env.SOCCER_ADMIN_SECRET;
  const adminSecret = randomUUID();
  process.env.SOCCER_ADMIN_SECRET = adminSecret;
  t.after(() => {
    if (original === undefined) delete process.env.SOCCER_ADMIN_SECRET;
    else process.env.SOCCER_ADMIN_SECRET = original;
  });
  const call = fixture();
  await call({
    action: "create",
    adminSecret,
    date: "2099-01-02",
    start: "18:00",
    end: "20:00",
    location: "Gym",
    capacity: 2,
  });
  const sessionId = (await call()).sessions[0].id;
  const players = Array.from({ length: 3 }, (_, i) => ({
    playerId: randomUUID(),
    playerSecret: randomUUID(),
    name: "Player " + i,
  }));
  for (const player of players)
    await call({ action: "register", sessionId, ...player });
  assert.equal(
    (await call({ action: "list", ...players[2] })).sessions[0].myStatus,
    "waitlist",
  );
  await call({ action: "cancel", sessionId, ...players[0] });
  const game = (await call({ action: "list", ...players[2] })).sessions[0];
  assert.equal(game.myStatus, "confirmed");
  assert.equal(game.confirmedCount, 2);
  assert.equal(game.waitlistCount, 0);
});
