import type { WASocket } from "@whiskeysockets/baileys";
import { timeNow } from "../utils/timeUtils";

// --- HANDLERS: LOGIKA PER ENDPOINT (Baileys Version) ---

/**
 * Handler untuk mengirim pesan teks
 */
export const handleText = async (
  sock: WASocket,
  target: string,
  message?: string,
) => {
  if (!message) throw { status: 400, error: "Pesan teks kosong." };

  await sock.sendMessage(target, { text: message });

  console.log(`${timeNow()} || [Success] Pesan berhasil dikirim ke ${target}`);
};

/**
 * Handler untuk mengirim file Excel (Base64)
 */
export const handleExcel = async (
  sock: WASocket,
  target: string,
  file?: string, // String Base64
  fileName?: string,
  caption?: string,
) => {
  if (!file) throw { status: 400, error: "File base64 kosong." };

  // Di Baileys, kita mengirimnya sebagai document
  await sock.sendMessage(target, {
    document: Buffer.from(file, "base64"), // Konversi base64 ke Buffer
    fileName: fileName || "Data Santri.xlsx",
    mimetype:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    caption: caption || "",
  });

  console.log(
    `${timeNow()} || [Success] File excel "${fileName}" berhasil dikirim ke ${target}`,
  );
};
