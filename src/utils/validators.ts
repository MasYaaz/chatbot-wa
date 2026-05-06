import type { WAMessage, proto } from "@whiskeysockets/baileys";
import { CONFIG, TIMEOUT_MS } from "../config/settings";
import { lastAdminActivity, mutedSessions } from "../state/store";

/**
 * Daftar tipe pesan sistem/protokol yang tidak perlu direspon.
 * Di Baileys, kita mengecek kunci (key) di dalam objek message.
 */
const IGNORED_MESSAGE_KEYS = [
  "protocolMessage",
  "senderKeyDistributionMessage",
  "stickerMessage", // Opsional: abaikan jika tidak ingin AI merespon stiker
  "reactionMessage", // Wajib abaikan agar tidak loop saat ada emoji reaction
];

/**
 * Filter Utama: Memvalidasi apakah pesan masuk layak diproses oleh Bot.
 */
export const isValidMessage = (msg: WAMessage): boolean => {
  // 1. Bot tidak boleh merespon dirinya sendiri
  if (msg.key.fromMe) return false;

  const chatId = msg.key.remoteJid;
  if (!chatId) return false;

  // 2. Abaikan pesan dari Status/Broadcast
  if (chatId === "status@broadcast" || chatId.includes("@broadcast"))
    return false;

  // 3. Pastikan isi pesan ada (Akses ke msg.message)
  const content = msg.message;
  if (!content) return false;

  // 4. Abaikan pesan sistem/protokol (Reaction, Edit Message, dll)
  const mType: string = Object.keys(content)[0] || "";
  if (mType === "" || IGNORED_MESSAGE_KEYS.includes(mType)) return false;

  // 5. Check Content (Body Text)
  // Baileys menyimpan teks di beberapa tempat tergantung tipe pesannya
  const textContent =
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    "";

  const hasMedia = !!(
    content.imageMessage ||
    content.videoMessage ||
    content.documentMessage
  );

  // Jika tidak ada teks dan tidak ada media, abaikan
  if (!textContent.trim() && !hasMedia) return false;

  // 6. Cek Blacklist ID
  if (CONFIG.IGNORE_IDS.some((id) => chatId.includes(id))) return false;

  // === 7. LOGIC MUTE ===
  const muteExpiry = mutedSessions.get(chatId);

  if (muteExpiry && Date.now() < muteExpiry) {
    console.log(`[Filter] Pesan dari ${chatId} diabaikan (Mode Mute aktif).`);
    return false;
  }

  if (muteExpiry && Date.now() >= muteExpiry) {
    mutedSessions.delete(chatId);
  }

  return true;
};

/**
 * Logic "Smart Away": Mengecek apakah Admin sedang aktif chatting secara manual.
 */
export const isSmartAwayMode = (chatId: string): boolean => {
  const lastSeen = lastAdminActivity.get(chatId) || 0;
  return Date.now() - lastSeen < TIMEOUT_MS;
};
