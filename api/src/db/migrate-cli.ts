import { defaultDbPath, migrate, SqliteDatabase } from "./sqlite.js";

const path = defaultDbPath();
const applied = migrate(new SqliteDatabase(path));
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Up to date.", `(${path})`);
