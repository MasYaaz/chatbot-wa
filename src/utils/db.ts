import Database from "bun:sqlite";

const db = new Database("messages.db");

// Buat table jika belum ada
db.exec(`
  CREATE TABLE IF NOT EXISTS user_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chatId TEXT,
    userName TEXT,
    fullMessage TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export const saveToDatabase = (
  chatId: string,
  userName: string,
  message: string,
) => {
  const stmt = db.prepare(
    "INSERT INTO user_reports (chatId, userName, fullMessage) VALUES (?, ?, ?)",
  );
  stmt.run(chatId, userName, message);
};
