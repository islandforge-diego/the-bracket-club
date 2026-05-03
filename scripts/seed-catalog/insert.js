/**
 * insert.js — Take data.json from fetch.js and upsert into items.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local — bypasses RLS so we can
 * insert verified rows server-side.  The service role key is sensitive: never
 * commit it, never ship it to the client.
 *
 * Run with:  node scripts/seed-catalog/insert.js
 */

import fs   from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "data.json");

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error(`Missing env vars.  Need:
  VITE_SUPABASE_URL  (or SUPABASE_URL)  = ${URL ? "ok" : "MISSING"}
  SUPABASE_SERVICE_ROLE_KEY            = ${KEY ? "ok" : "MISSING"}

The service role key lives in Supabase dashboard → Settings → API Keys → service_role.
Add it to .env.local as SUPABASE_SERVICE_ROLE_KEY=eyJ...`);
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

async function main() {
  const rows = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  console.log(`Loading ${rows.length} books from data.json`);

  // Upsert in chunks of 50 to keep payload sizes reasonable.
  const CHUNK = 50;
  let ok = 0, fail = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await sb
      .from("items")
      .upsert(chunk, { onConflict: "source,source_id", ignoreDuplicates: false });
    if (error) {
      fail += chunk.length;
      console.error(`  chunk ${i}-${i + chunk.length}: ${error.message}`);
    } else {
      ok += chunk.length;
      process.stdout.write(`\r  inserted ${ok}/${rows.length}`);
    }
  }
  console.log(`\nDone: ${ok} ok, ${fail} failed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
