export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS user_profile (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     data TEXT NOT NULL DEFAULT '{}',
     updated_at INTEGER NOT NULL
   );`,
  `CREATE TABLE IF NOT EXISTS chat_history (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     role TEXT NOT NULL,
     content TEXT NOT NULL,
     tool_calls TEXT,
     created_at INTEGER NOT NULL
   );`,
  `CREATE TABLE IF NOT EXISTS domain_meta (
     name TEXT PRIMARY KEY,
     display_name TEXT NOT NULL,
     icon TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );`,
];
