import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "storage", "app.db");
const SCHEMA_PATH = path.join(process.cwd(), "backend", "db", "schema.sql");

export function initDB() {
  // asegura carpeta storage/
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");

  db.exec(schema);
  return db;
}
