import { getStore } from "@netlify/blobs";

// Site-wide JSON object store. Unlike files bundled in a deploy, these values
// survive function restarts and future production deployments.
// Strong reads reduce stale roster views after a booking or cancellation.
export function repository(store = getStore({ name: "summit-soccer-data", consistency: "strong" })) {
  return {
    async read(key: string, fallback: any) {
      const value = await store.get(key, { type: "json", consistency: "strong" });
      return value ?? fallback;
    },
    async save(key: string, value: any) {
      await store.setJSON(key, value);
    },
    async all(prefix: string) {
      const entries: any[] = [];
      for await (const page of store.list({ prefix, paginate: true })) {
        for (const entry of page.blobs) {
          const value = await store.get(entry.key, { type: "json", consistency: "strong" });
          if (value !== null) entries.push(value);
        }
      }
      return entries;
    },
  };
}
