/**
 * Menyimpan timestamp (waktu dalam ms) kapan terakhir kali bot
 * membalas pesan di chat tertentu.
 * Digunakan untuk mencegah bot spamming atau membalas berulang-ulang dalam waktu singkat.
 *
 * @type {Map<string, number>} Key: ChatID, Value: Timestamp
 */
export const lastBotReply = new Map<string, number>();

/**
 * Menyimpan timestamp aktivitas terakhir admin.
 * Berguna untuk mendeteksi apakah admin sedang aktif mengetik/membalas manual,
 * sehingga bot bisa "mengalah" (tidak membalas otomatis).
 *
 * @type {Map<string, number>} Key: ChatID, Value: Timestamp
 */
export const lastAdminActivity = new Map<string, number>();

/**
 * Memori jangka pendek bot.
 * Map ini menyimpan riwayat percakapan (konteks) per chat ID.
 * Data ini yang akan dikirim ke API AI agar jawaban nyambung.
 *
 * @type {Map<string, ChatMessage[]>}
 */
export const chatHistory = new Map<
  string,
  { role: "user" | "assistant"; content: string }[]
>();

/**
 * Konfigurasi batas jumlah pesan yang disimpan dalam memori (sliding window).
 * Jika pesan melebihi jumlah ini, pesan terlama akan dihapus.
 * Tujuannya agar hemat token API dan memori server.
 */
const MAX_HISTORY_LENGTH = 10;

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
};

/**
 * Mengambil seluruh riwayat percakapan untuk chat ID tertentu.
 * Jika tidak ada history, mengembalikan array kosong `[]`.
 *
 * @param {string} chatId - ID unik chat.
 * @returns {ChatMessage[]} Array objek pesan.
 */
export const getHistory = (chatId: string) => {
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
export const mutedSessions = new Map<string, number>();

/**
 * Durasi default untuk menonaktifkan bot sementara (Mute).
 * Saat ini diset ke 1 Jam (dalam milidetik).
 */
export const MUTE_DURATION_MS = 60 * 60 * 1000;
