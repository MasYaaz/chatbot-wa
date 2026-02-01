import { type Message, type Chat } from "whatsapp-web.js";
import { TIMEOUT_MS, STOP_KEYWORDS } from "../config/settings";
import {
  lastBotReply,
  mutedSessions,
  MUTE_DURATION_MS,
  isBotReplying,
} from "../state/store";
import { cleanName } from "../utils/textUtils";
import { generateAIResponse } from "../services/aiServices";
import { timeNow } from "../utils/timeUtils";
import {
  addMessageToHistory,
  clearHistory,
  getHistory,
} from "../utils/history";
import { isSmartAwayMode } from "../utils/validators";

/**
 * Memeriksa apakah pesan mengandung kata kunci penghentian paksa.
 * Digunakan sebagai "Hard Stop" manual jika user mengetik "stop", "bye", atau "cukup".
 *
 * @param {string} text - Teks input dari user yang akan diperiksa.
 * @returns {boolean} True jika mengandung salah satu kata kunci STOP.
 */
const checkForceStop = (text: string): boolean => {
  const lower = text.toLowerCase();
  return STOP_KEYWORDS.some((keyword) => lower.includes(keyword));
};

// ==========================================
// CORE LOGIC: AI INTERACTION
// ==========================================

/**
 * Menangani seluruh interaksi dengan AI dalam satu aliran logika (Single Flow).
 * * **Alur Kerja:**
 * 1. Sinkronisasi pesan ke riwayat (Memory).
 * 2. Cek interupsi manual (Force Stop).
 * 3. JIT (Just-In-Time) Check: Memastikan admin tidak login saat AI sedang berpikir.
 * 4. Pengiriman pesan & sinkronisasi timestamp bot untuk menghindari 'Self-Echo' (Threshold 2s).
 * 5. Manajemen State: Mute sesi atau pembersihan memori jika sesi berakhir.
 *
 * @param {Chat} chat - Objek Chat dari whatsapp-web.js.
 * @param {string} chatId - ID unik chat untuk identifikasi session.
 * @param {string} finalName - Nama user yang telah diformat.
 * @param {string} combinedText - Pesan tunggal atau gabungan dari buffer.
 */
const handleAIInteraction = async (
  chat: Chat,
  chatId: string,
  finalName: string,
  combinedText: string
) => {
  console.log(
    `${timeNow()} || [Process] Memproses pesan dari ${finalName}: "${combinedText}"`
  );

  // 1. Simpan pesan User ke History (Memory)
  addMessageToHistory(chatId, "user", combinedText);

  // 2. Cek Force Stop (Manual Override)
  // Memeriksa apakah ada kata kunci seperti "stop" atau "cukup" dalam pesan user.
  const isForceStop = checkForceStop(combinedText);

  // 3. Generate Jawaban AI via Ollama/Service AI
  const history = getHistory(chatId);
  await chat.sendStateTyping(); // Memberikan feedback visual 'sedang mengetik'

  let aiResult = await generateAIResponse(history, finalName);

  // === VALIDASI & FALLBACK AI ===
  if (!aiResult || !aiResult.reply) {
    if (isForceStop) {
      aiResult = { reply: "Oke, pesan diterima. 👋", action: "STOP" };
    } else {
      console.warn(`${timeNow()} || [AI Fail] Output kosong. Pesan diabaikan.`);
      return;
    }
  }

  // === OVERRIDE ACTION ===
  // Paksa status STOP jika user mengirim keyword penghentian, meskipun AI ingin lanjut.
  if (isForceStop) {
    aiResult.action = "STOP";
  }

  // === JIT SMART AWAY CHECK ===
  // Cek ulang kondisi admin tepat sebelum mengirim pesan.
  // Jika admin mendadak aktif saat AI sedang 'berpikir', batalkan balasan otomatis.
  if (isSmartAwayMode(chatId)) {
    console.log(
      `${timeNow()} || [Abort] Admin aktif saat AI proses. Bot membatalkan balasan.`
    );
    return;
  }

  isBotReplying.set(chatId, true);

  // 4. Kirim Balasan AI ke WhatsApp
  // Dilakukan SEBELUM update timestamp agar event 'message_create' menangkap waktu yang akurat.
  await chat.sendMessage(aiResult.reply);

  // === UPDATE TIMESTAMP (PRECISE 2S SAFETY) ===
  // Dicatat TEPAT setelah pesan keluar. Ini memastikan selisih waktu di event
  // 'message_create' sangat kecil (< 100ms), sehingga threshold 2 detik tetap aman.
  lastBotReply.set(chatId, Date.now());

  // Beri jeda 3 detik sebelum mematikan flag agar event message_create selesai lewat
  setTimeout(() => isBotReplying.delete(chatId), 3000);

  // 5. Sinkronisasi Memori Bot
  // Simpan balasan assistant agar percakapan tetap kontekstual.
  addMessageToHistory(chatId, "assistant", aiResult.reply);

  // 6. Eksekusi Aksi Pasca-Percakapan (STOP)
  if (aiResult.action === "STOP") {
    console.log(
      `${timeNow()} || [Action] STOP dipicu untuk ${finalName}. Resetting session...`
    );

    // Bersihkan history agar tidak membebani RAM & reset konteks untuk chat berikutnya.
    clearHistory(chatId);

    // Aktifkan mode senyap agar bot tidak langsung menyambar jika user membalas "oke/terima kasih".
    const muteUntil = Date.now() + MUTE_DURATION_MS;
    mutedSessions.set(chatId, muteUntil);
  }
};

// ==========================================
// MAIN PROCESSOR
// ==========================================

/**
 * Controller Utama: Memproses pesan yang masuk dari Buffer.
 * * Fungsi ini bertugas menentukan KONTEKS WAKTU (Timing):
 * Apakah ini sesi percakapan baru (karena sudah lama tidak chat)?
 * Atau kelanjutan dari percakapan yang sedang berjalan?
 * @param {string} chatId - ID unik chat.
 * @param {string} combinedText - Teks pesan user.
 * @param {Message} originalMessage - Objek pesan asli untuk mengambil metadata kontak.
 */
export const processBufferedMessages = async (
  chatId: string,
  combinedText: string,
  originalMessage: Message
) => {
  try {
    const chat = await originalMessage.getChat();
    const contact = await originalMessage.getContact();
    const finalName = cleanName(contact.name || contact.pushname || "Kak");

    // === LOGIC TIMEOUT / SESI BARU ===
    const lastBot = lastBotReply.get(chatId) || 0;
    const timeDiff = Date.now() - lastBot;

    // Syarat Sesi Baru:
    // 1. timeDiff > TIMEOUT_MS (Sudah melewati batas waktu diam)
    // 2. lastBot === 0 (User baru pertama kali chat sejak bot nyala)
    const isNewSession = timeDiff > TIMEOUT_MS || lastBot === 0;

    if (isNewSession) {
      console.log(
        `${timeNow()} || [Status] Sesi Baru/Timeout terdeteksi. Resetting History...`
      );

      // KITA HANYA RESET HISTORY.
      // Tidak ada welcome message manual. Kita biarkan AI merespon input pertama user
      // sesuai System Prompt (apakah itu sapaan atau langsung pesan inti).
      clearHistory(chatId);
    }

    // === MASUK KE LOGIKA TUNGGAL ===
    // Baik sesi baru atau lama, semua diproses oleh handler yang sama.
    await handleAIInteraction(chat, chatId, finalName, combinedText);
  } catch (error) {
    console.error(`${timeNow()} || [Error Processing Buffer]`, error);
  } finally {
    // Pastikan status 'typing' hilang meskipun terjadi error di tengah jalan
    const chat = await originalMessage.getChat();
    await chat.clearState();
  }
};
