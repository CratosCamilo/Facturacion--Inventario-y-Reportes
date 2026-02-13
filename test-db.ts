import { initDB } from "./backend/db/init.ts";

const db = initDB();
console.log("BD creada correctamente");
db.close();
