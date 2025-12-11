import { type Message } from "whatsapp-web.js";
import { CONFIG, TIMEOUT_MS } from "../config/settings";
import { lastBotReply, lastAdminActivity, mutedSessions } from "../state/store";

/**
 * Daftar tipe pesan sistem WhatsApp yang tidak perlu direspon oleh bot.
 * @type {string[]}
 */
const IGNORED_TYPES = [
  "revoked", // Pesan ditarik/dihapus
  "e2e_notification", // Notifikasi enkripsi
  "ciphertext",
  "protocol",
  "call_log", // Notifikasi panggilan telepon/video
  "gp2",
  "notification_template",
];

/**
 * Filter Utama: Memvalidasi apakah pesan masuk layak diproses oleh Bot.
 *
 * Fungsi ini melakukan pengecekan berlapis:
 * 1. **Self-Check**: Abaikan jika pesan dari bot sendiri.
 * 2. **Type Check**: Abaikan pesan sistem (log panggilan, pesan ditarik, dll).
 * 3. **Content Check**: Abaikan pesan kosong (kecuali ada media/gambar).
 * 4. **Blacklist**: Abaikan nomor yang ada di config `IGNORE_IDS`.
 * 5. **Mute Logic**: Abaikan jika user sedang dalam kondisi mute setelah pamit.
 *
 * @param {Message} message - Objek pesan asli dari WhatsApp Web.
 * @returns {boolean} `true` jika pesan aman diproses, `false` jika harus diabaikan.
 */
export const isValidMessage = (message: Message): boolean => {
  // 1. Bot tidak boleh merespon dirinya sendiri (Loop prevention)
  if (message.fromMe) return false;

  // 2. Abaikan pesan sistem/teknis
  if (IGNORED_TYPES.includes(message.type)) return false;

  // 3. Ignore pesan kosong tanpa media (ghost messages)
  if (!message.body.trim() && !message.hasMedia) return false;

  // 4. Cek Blacklist ID (misal: nomor mantan, grup spam, dll)
  if (CONFIG.IGNORE_IDS.some((id) => message.from.includes(id))) return false;

  // === 5. LOGIC MUTE (Integrasi Fitur Stop) ===
  const chatId = message.from;
  const muteExpiry = mutedSessions.get(chatId);

  // Jika user ada di daftar mute DAN waktunya belum habis (Timestamp Mute > Waktu Sekarang)
  if (muteExpiry && Date.now() < muteExpiry) {
    console.log(`[Filter] Pesan dari ${chatId} diabaikan (Mode Mute aktif).`);
    return false; // <-- Disini kuncinya, pesan langsung ditolak/diabaikan
  }

  // Auto-Unmute: Jika waktu mute sudah lewat, hapus dari daftar agar bot bisa jawab lagi nanti
  if (muteExpiry && Date.now() >= muteExpiry) {
    mutedSessions.delete(chatId);
  }

  return true;
};

/**
 * Logic "Smart Away": Mengecek apakah Admin sedang aktif chatting secara manual.
 *
 * Tujuannya agar bot tidak "menyerobot" pembicaraan ketika Admin sedang online
 * dan membalas pesan user secara langsung.
 *
 * @param {string} chatId - ID chat yang sedang diperiksa.
 * @returns {boolean}
 * - `true`: Admin aktif (Bot harus diam/standby).
 * - `false`: Admin offline/idle (Bot boleh mengambil alih).
 */
export const isSmartAwayMode = (chatId: string): boolean => {
  const lastSeenAdmin = lastAdminActivity.get(chatId) || 0;
  const lastSeenBot = lastBotReply.get(chatId) || 0;

  // Cek apakah admin mengetik dalam rentang waktu TIMEOUT terakhir
  const isAdminActive = Date.now() - lastSeenAdmin < TIMEOUT_MS;

  // Bot trigger check (Safety):
  // Mencegah kondisi di mana bot baru saja reply, lalu dianggap sebagai "aktivitas admin"
  // jika logic message_create tidak sempurna membedakan fromMe.
  const isBotTriggered = Math.abs(lastSeenAdmin - lastSeenBot) < 5000;

  if (isAdminActive && !isBotTriggered) {
    console.log(`[SmartAway] Admin aktif, Bot diam.`);
    return true; // Mode Smart Away AKTIF (Bot harus diam)
  }

  return false; // Bot boleh jalan
};
