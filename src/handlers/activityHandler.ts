import type { Message } from "whatsapp-web.js";
import { isBotReplying, lastAdminActivity, lastBotReply } from "../state/store";
import { timeNow } from "../utils/timeUtils";

/**
 * Menangani pesan keluar (fromMe) untuk mendeteksi aktivitas admin manusia.
 */
export const handleOutgoingMessage = (msg: Message) => {
  // Pastikan pesan dari akun sendiri
  if (!msg.fromMe) return;

  const chatId = msg.to;

  // 1. Cek Flag State
  if (isBotReplying.get(chatId)) return; // Skip, ini sedang proses reply bot

  const now = Date.now();
  const lastBotTime = lastBotReply.get(chatId) || 0;

  // 2. Logic Filter Waktu (Heuristik)
  // Jika pesan muncul < 2 detik setelah bot reply, anggap ini echo dari bot
  if (now - lastBotTime < 2000) {
    return;
  }

  // 3. Validasi Manusia
  console.log(
    `${timeNow()} || [Activity] Admin manusia terdeteksi aktif di ${chatId}`,
  );
  lastAdminActivity.set(chatId, now);
};
