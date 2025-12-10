/**
 * Definisi struktur objek pesan untuk keperluan history percakapan.
 * Format ini disesuaikan dengan format pesan standar OpenAI/LLM.
 */
export type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Struktur data respon yang diharapkan dari pemrosesan AI.
 * Interface ini memisahkan antara teks balasan dengan instruksi logikanya.
 * * @property {string} reply - Teks jawaban yang akan dikirimkan ke WhatsApp user.
 * @property {"CONTINUE" | "STOP"} action - Flag kontrol.
 * - `CONTINUE`: Bot tetap aktif mendengarkan.
 * - `STOP`: Bot mendeteksi user ingin mengakhiri sesi/titip pesan,
 * sehingga bot harus mematikan dirinya sendiri (Mute) setelah ini.
 */
export interface AIResponseData {
  reply: string;
  action: "CONTINUE" | "STOP";
}
