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
  `CREATE TABLE IF NOT EXISTS usage_log (
     id               INTEGER PRIMARY KEY AUTOINCREMENT,
     at               INTEGER NOT NULL,
     model            TEXT    NOT NULL,
     input_tokens     INTEGER NOT NULL DEFAULT 0,
     output_tokens    INTEGER NOT NULL DEFAULT 0,
     cached_tokens    INTEGER NOT NULL DEFAULT 0,
     reasoning_tokens INTEGER NOT NULL DEFAULT 0,
     api_calls        INTEGER NOT NULL DEFAULT 1
   );`,
  `CREATE TABLE IF NOT EXISTS chat_summary (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     upto_message_id INTEGER NOT NULL,
     content         TEXT    NOT NULL,
     created_at      INTEGER NOT NULL
   );`,
];
