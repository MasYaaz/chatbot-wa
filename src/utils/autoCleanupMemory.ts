import { chatHistory, lastInteraction } from "../state/store";
import { timeNow } from "./timeUtils";

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

  console.log(`${timeNow()} || [System] Menjalankan cleanup memori...`);

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
};
