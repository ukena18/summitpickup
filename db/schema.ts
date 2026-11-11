import { pgTable, text, integer, jsonb, primaryKey } from "drizzle-orm/pg-core";

export const games = pgTable("soccer_games", {
  id: text().primaryKey(),
  date: text().notNull(),
  start: text().notNull(),
  end: text().notNull(),
  location: text().notNull(),
  capacity: integer().notNull(),
  status: text().notNull(),
  createdAt: text("created_at").notNull(),
});
export const registrations = pgTable(
  "soccer_registrations",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => games.id),
    playerId: text("player_id").notNull(),
    name: text().notNull(),
    secretHash: text("secret_hash").notNull(),
    status: text().notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.playerId] })],
);
export const audit = pgTable("soccer_audit", {
  id: text().primaryKey(),
  action: text().notNull(),
  who: text().notNull(),
  detail: jsonb().notNull(),
  at: text().notNull(),
});
export const imports = pgTable("soccer_imports", { id: text().primaryKey() });
