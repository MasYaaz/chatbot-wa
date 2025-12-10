import { type Message } from "whatsapp-web.js";
import { isValidMessage, isSmartAwayMode } from "../utils/validators";
import { processBufferedMessages } from "./messageProcessor";

/**
 * Waktu tunggu (dalam milidetik) untuk menumpuk pesan.
 * Bot akan menunggu 3 detik setelah pesan terakhir user sebelum mulai memproses.
 * Jika user mengetik lagi dalam 3 detik, timer di-reset.
 */
const BUFFER_DELAY = 3000; // 3 detik

/**
 * Penyimpanan sementara (Buffer) untuk pesan yang masuk beruntun.
 * Key: ChatID.
 * Value: Object berisi Timer aktif dan Array teks yang sedang ditumpuk.
 *
 * Contoh kasus: User kirim "Halo" -> "Min" -> "Mau tanya".
 * Map akan menyimpan ["Halo", "Min", "Mau tanya"] sebelum digabung.
 */
const messageBuffers = new Map<
  string,
  { timer: NodeJS.Timeout; text: string[] }
>();

/**
 * Handler Utama untuk event 'message'.
 * Fungsi ini bertugas sebagai "Pintu Masuk" yang mengatur lalu lintas pesan.
 *
 * **Fitur Utama: Buffering / Debouncing**
 * Menggabungkan "chat putus-putus" (double/triple bubble) menjadi satu paragraf utuh
 * sebelum dikirim ke AI. Ini menghemat token dan memberikan konteks yang lebih baik.
 *
 * @param {Message} message - Objek pesan mentah dari WhatsApp.
 */
export const handleIncomingMessage = async (message: Message) => {
  try {
    // 1. Validation Checks (Filter pesan sampah/sistem)
    // Cek isValidMessage di file validators.ts
    if (!isValidMessage(message)) return;

    const chatId = message.from;

    // 2. Smart Away Check (Cek apakah Admin sedang online)
    // Jika admin aktif, bot akan diam.
    if (isSmartAwayMode(chatId)) return;

    // 3. Prepare Text
    // Ambil isi pesan. Jika gambar, beri label [Gambar/Media] agar AI tahu.
    let userQuery = message.body.trim();
    if (message.hasMedia && !userQuery) userQuery = "[Gambar/Media]";

    // === BUFFER MANAGEMENT (ANTREAN) ===
    // Logika di bawah ini menangani user yang mengirim chat bertubi-tubi.

    // A. Hapus timer lama jika user mengetik lagi (Reset hitungan)
    // Ini mencegah bot membalas pesan "Halo" sendirian padahal user belum selesai mengetik kalimatnya.
    if (messageBuffers.has(chatId)) {
      clearTimeout(messageBuffers.get(chatId)!.timer);
    }

    // B. Ambil antrean pesan yang sudah ada, atau buat array baru
    const currentBuffer = messageBuffers.get(chatId)?.text || [];
    currentBuffer.push(userQuery); // Tambahkan pesan baru ke tumpukan

    // C. Set Timer Baru (Countdown dimulai)
    const newTimer = setTimeout(() => {
      // --- KODE INI JALAN SETELAH 3 DETIK HENING ---

      // Gabungkan semua pesan di array jadi satu string (dipisah enter)
      const finalText = currentBuffer.join("\n");

      // Bersihkan memory buffer (karena sudah mau diproses)
      messageBuffers.delete(chatId);

      // Oper ke Processor utama untuk dikirim ke AI
      // Lihat logika di file messageProcessor.ts
      processBufferedMessages(chatId, finalText, message);
    }, BUFFER_DELAY);

    // D. Simpan Timer dan Array pesan ke Map (untuk ronde berikutnya)
    messageBuffers.set(chatId, { timer: newTimer, text: currentBuffer });
  } catch (error) {
    console.error("[CRITICAL ERROR] Handler crash:", error);
  }
};
