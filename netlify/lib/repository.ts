import { and, eq } from "drizzle-orm";
import { getStore } from "@netlify/blobs";
import { games, registrations, audit, imports } from "../../db/schema.js";

export function repository(tx: any) {
  return {
    async read(key: string, fallback: any) {
      const [kind, id, playerId] = key.split("/");
      const table = kind === "sessions" ? games : registrations;
      const where =
        kind === "sessions"
          ? eq(games.id, id)
          : and(
              eq(registrations.sessionId, id),
              eq(registrations.playerId, playerId),
            );
      const [row] = await tx.select().from(table).where(where);
      return row ?? fallback;
    },
    async save(key: string, value: any) {
      const [kind, id] = key.split("/");
      if (kind === "sessions") {
        await tx
          .insert(games)
          .values(value)
          .onConflictDoUpdate({ target: games.id, set: value });
      } else if (kind === "registrations") {
        await tx
          .insert(registrations)
          .values(value)
          .onConflictDoUpdate({
            target: [registrations.sessionId, registrations.playerId],
            set: value,
          });
      } else {
        await tx
          .insert(audit)
          .values({ ...value, id })
          .onConflictDoNothing();
      }
    },
    async all(prefix: string) {
      if (prefix === "sessions/") return tx.select().from(games);
      if (prefix === "audit/") return tx.select().from(audit);
      return tx
        .select()
        .from(registrations)
        .where(eq(registrations.sessionId, prefix.split("/")[1]));
    },
  };
}

// Import the existing site data once, inside the same locked transaction.
// Blobs remain untouched so existing games and browser registration identities survive.
export async function importLegacy(tx: any) {
  const marker = "blobs-v1";
  if ((await tx.select().from(imports).where(eq(imports.id, marker))).length)
    return;
  const store = getStore({ name: "summit-soccer-data", consistency: "strong" });
  const repo = repository(tx);
  for (const prefix of ["sessions/", "registrations/", "audit/"]) {
    for await (const page of store.list({ prefix, paginate: true })) {
      for (const blob of page.blobs) {
        const value = await store.get(blob.key, { type: "json" });
        if (value) await repo.save(blob.key, value);
      }
    }
  }
  await tx.insert(imports).values({ id: marker });
}
