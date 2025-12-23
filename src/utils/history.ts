import { chatHistory, lastInteraction } from "../state/store";
import type { ChatMessage } from "../types";

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
