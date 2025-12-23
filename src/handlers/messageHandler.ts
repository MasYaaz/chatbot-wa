import { type Message } from "whatsapp-web.js";
import { isValidMessage, isSmartAwayMode } from "../utils/validators";
import { processBufferedMessages } from "./messageProcessor";
import { BOOT_TIMESTAMP } from "../state/store";
import { timeNow } from "../utils/timeUtils";

/**
 * Waktu tunggu (dalam milidetik) untuk menumpuk pesan.
 * Bot akan menunggu 6 detik setelah pesan terakhir user sebelum mulai memproses.
 * Jika user mengetik lagi dalam 6 detik, timer di-reset.
 */
const BUFFER_DELAY = 6000; // 6 detik

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
 * Fungsi ini bertugas sebagai "Gatekeeper" (Pintu Masuk) pesan WhatsApp.
 *
 * **Fitur Utama:**
 * 1. **Anti-Zombie Check:** Mengabaikan pesan lama yang masuk saat bot baru dinyalakan.
 * 2. **Message Buffering / Debouncing:** Menggabungkan chat pendek beruntun (misal: "Halo".."Min".."Tanya")
 * menjadi satu konteks utuh sebelum dikirim ke AI, untuk menghemat token & memori.
 * 3. **Just-In-Time Smart Away:** Cek status admin tepat saat pesan akan diproses.
 *
 * @param {Message} message - Objek pesan mentah dari WhatsApp Web.
 */
export const handleIncomingMessage = async (message: Message) => {
  try {
    // 1. Validation Checks (Filter dasar)
    // Cek apakah pesan valid (bukan status, bukan pesan broadcast, dll)
    if (!isValidMessage(message)) return;

    // 2. Anti-Zombie Filter (Pesan Kadaluarsa)
    // Jika timestamp pesan lebih kecil dari waktu Bot dinyalakan (BOOT_TIMESTAMP),
    // artinya ini adalah pesan lama yang baru tersinkronisasi. ABAIKAN.
    if (message.timestamp < BOOT_TIMESTAMP) {
      console.log(
        `${timeNow()} || [Old Message] Mengabaikan pesan lama dari ${
          message.from
        }`
      );
      return;
    }

    const chatId = message.from;

    // 3. Prepare Text
    // Normalisasi teks. Jika gambar tanpa caption, beri label khusus.
    let userQuery = message.body.trim();
    if (message.hasMedia && !userQuery) userQuery = "[Gambar/Media]";

    // === BUFFER MANAGEMENT (DEBOUNCING) ===

    // A. Reset Timer Lama
    // Jika user mengirim pesan lagi sebelum 6 detik habis, batalkan pengiriman sebelumnya.
    // Kita ingin menunggu sampai user SELESAI mengetik rangkaian kalimatnya.
    if (messageBuffers.has(chatId)) {
      clearTimeout(messageBuffers.get(chatId)!.timer);
    }

    // B. Update Buffer
    // Ambil tumpukan pesan yang ada, lalu tambahkan pesan baru ini ke array.
    const currentBuffer = messageBuffers.get(chatId)?.text || [];
    currentBuffer.push(userQuery);

    // C. Set Timer Baru (Countdown dimulai)
    const newTimer = setTimeout(() => {
      // --- CALLBACK INI JALAN SETELAH 6 DETIK HENING ---

      // D. Just-In-Time Smart Away Check (Cek Status Admin TERAKHIR)
      // Kita cek di sini (bukan di awal fungsi) untuk mengatasi Race Condition.
      // Skenario: User chat -> Timer jalan -> Admin login -> Timer habis.
      // Dengan cek di sini, Bot akan sadar admin sudah online & membatalkan balasan.
      if (isSmartAwayMode(chatId)) {
        console.log(
          `${timeNow()} || [SmartAway] Admin online saat timer habis. Bot diam.`
        );
        messageBuffers.delete(chatId);
        return;
      }

      // E. Gabungkan Pesan
      // Array ["Halo", "Mau tanya"] menjadi string "Halo\nMau tanya"
      const finalText = currentBuffer.join("\n");

      // F. Bersihkan Buffer
      messageBuffers.delete(chatId);

      // G. Proses ke AI
      // Kirim gabungan pesan ke otak bot (messageProcessor)
      processBufferedMessages(chatId, finalText, message);
    }, BUFFER_DELAY);

    // H. Simpan State Timer ke Map
    messageBuffers.set(chatId, { timer: newTimer, text: currentBuffer });
  } catch (error) {
    console.error("[CRITICAL ERROR] Handler crash:", error);
  }
};
