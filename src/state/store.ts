import type { ChatMessage } from "../types";

/**
 * Menyimpan data waktu chatbot pertama kali aktif
 */
export const BOOT_TIMESTAMP = Math.floor(Date.now() / 1000);

/**
 * Menyimpan timestamp (waktu dalam ms) kapan terakhir kali bot
 * membalas pesan di chat tertentu.
 * Digunakan untuk mencegah bot spamming atau membalas berulang-ulang dalam waktu singkat.
 *
 * @type {Map<string, number>} Key: ChatID, Value: Timestamp
 */
export const lastBotReply: Map<string, number> = new Map<string, number>();

export const isBotReplying = new Map<string, boolean>();

/**
 * Menyimpan timestamp aktivitas terakhir admin.
 * Berguna untuk mendeteksi apakah admin sedang aktif mengetik/membalas manual,
 * sehingga bot bisa "mengalah" (tidak membalas otomatis).
 *
 * @type {Map<string, number>} Key: ChatID, Value: Timestamp
 */
export const lastAdminActivity: Map<string, number> = new Map<string, number>();

/**
 * Menyimpan data berisi waktu terakhir interaksi dengan user.
 * Digunakan untuk menghapus history user yang sudah gak ada interaksi.
 */
export const lastInteraction: Map<string, number> = new Map<string, number>();

/**
 * Memori jangka pendek bot.
 * Map ini menyimpan riwayat percakapan (konteks) per chat ID.
 * Data ini yang akan dikirim ke API AI agar jawaban nyambung.
 *
 * @type {Map<string, ChatMessage[]>}
 */
export const chatHistory: Map<string, ChatMessage[]> = new Map<
  string,
  ChatMessage[]
>();

/**
 * Menyimpan status MUTE untuk chat tertentu.
 * Jika ChatID ada di sini dan waktunya belum habis, bot tidak akan merespon pesan.
 *
 * @type {Map<string, number>} Key: ChatID, Value: Timestamp kapan mute berakhir.
 */
export const mutedSessions: Map<string, number> = new Map<string, number>();

/**
 * Durasi default untuk menonaktifkan bot sementara (Mute).
 * Saat ini diset ke 1 Jam (dalam milidetik).
 */
export const MUTE_DURATION_MS = 60 * 60 * 1000;
