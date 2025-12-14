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
 * Konfigurasi batas jumlah pesan yang disimpan dalam memori (sliding window).
 * Jika pesan melebihi jumlah ini, pesan terlama akan dihapus.
 * Tujuannya agar hemat token API dan memori server.
 */
const MAX_HISTORY_LENGTH = 10;

// Konfigurasi Cleanup
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Jalankan pembersihan setiap 1 Jam
const INACTIVE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // Hapus data jika tidak aktif selama 24 Jam

/**
 * Fungsi Utama Cleanup.
 * Mengecek semua sesi, jika ada yang tidak aktif > 24 jam, hapus dari memori.
 */
const cleanupInactiveUsers = () => {
  const now = Date.now();
  let deletedCount = 0;

  console.log(`[System] Menjalankan cleanup memori...`);

  // Loop semua data di lastInteraction
  lastInteraction.forEach((lastTime, chatId) => {
    if (now - lastTime > INACTIVE_THRESHOLD_MS) {
      // Hapus dari semua Map agar bersih total
      chatHistory.delete(chatId);
      // Hapus juga dari map lain jika kamu meng-exportnya di file ini
      // lastBotReply.delete(chatId);
      // lastAdminActivity.delete(chatId);

      // Terakhir hapus dari map tracking ini sendiri
      lastInteraction.delete(chatId);

      deletedCount++;
    }
  });

  if (deletedCount > 0) {
    console.log(
      `[System] Cleanup selesai. Menghapus ${deletedCount} sesi tidak aktif.`
    );
  }
};

/**
 * Panggil fungsi ini SATU KALI saja saat bot pertama kali dijalankan (misal di index.ts/main.ts).
 * Ini akan menyalakan timer otomatis.
 */
export const startAutoCleanup = () => {
  // Jalankan interval setiap 1 jam
  setInterval(cleanupInactiveUsers, CLEANUP_INTERVAL_MS);
  console.log("[System] Auto-cleanup service started.");
};

/**
 * Menambahkan pesan baru ke dalam riwayat percakapan spesifik.
 * Fungsi ini otomatis menghapus pesan terlama (FIFO) jika jumlah pesan
 * sudah melebihi `MAX_HISTORY_LENGTH`.
 *
 * @param {string} chatId - ID unik chat (nomor HP atau ID grup).
 * @param {"user" | "assistant"} role - Peran pengirim ('user' = manusia, 'assistant' = bot).
 * @param {string} content - Isi pesan teks.
 */
export const addMessageToHistory = (
  chatId: string,
  role: "user" | "assistant",
  content: string
) => {
  const currentHistory = chatHistory.get(chatId) || [];

  // Masukkan pesan baru
  currentHistory.push({ role, content });

  // Jika kepanjangan, hapus pesan paling lama (FIFO)
  if (currentHistory.length > MAX_HISTORY_LENGTH) {
    currentHistory.shift();
  }

  chatHistory.set(chatId, currentHistory);
  lastInteraction.set(chatId, Date.now());
};

/**
 * Mengambil seluruh riwayat percakapan untuk chat ID tertentu.
 * Jika tidak ada history, mengembalikan array kosong `[]`.
 *
 * @param {string} chatId - ID unik chat.
 * @returns {ChatMessage[]} Array objek pesan.
 */
export const getHistory = (chatId: string): ChatMessage[] => {
  return chatHistory.get(chatId) || [];
};

/**
 * Menghapus seluruh ingatan bot tentang chat tertentu.
 * Panggil ini jika sesi berakhir atau user meminta reset (misal: command /reset).
 *
 * @param {string} chatId - ID unik chat yang ingin dihapus memorinya.
 */
export const clearHistory = (chatId: string) => {
  chatHistory.delete(chatId);
};

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
