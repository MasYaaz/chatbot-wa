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

  // Abaikan pesan dari Status/Broadcast
  if (CONFIG.IGNORE_IDS.some((id) => chatId.includes(id))) return false;

  // Akses Konten & Tipe
  const content = msg.message;
  if (!content) return false;

  // Abaikan pesan sistem/protokol (Reaction, Edit Message, dll)
  const mType: string = Object.keys(content)[0] || "";
  if (IGNORED_MESSAGE_KEYS.includes(mType)) return false;

  // Logic Mute
  const muteExpiry = mutedSessions.get(chatId);
  if (muteExpiry) {
    if (Date.now() < muteExpiry) return false;
    mutedSessions.delete(chatId);
  }

  // Cek isi konten (Body Text)
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

  return !!textContent.trim() || hasMedia;
};

/**
 * Logic "Smart Away": Mengecek apakah Admin sedang aktif chatting secara manual.
 */
export const isSmartAwayMode = (chatId: string): boolean => {
  const lastSeen = lastAdminActivity.get(chatId) || 0;
  return Date.now() - lastSeen < TIMEOUT_MS;
};
