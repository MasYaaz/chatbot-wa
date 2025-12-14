import { type Message, type Chat } from "whatsapp-web.js";
import { TIMEOUT_MS, STOP_KEYWORDS } from "../config/settings";
import {
  lastBotReply,
  addMessageToHistory,
  getHistory,
  clearHistory,
  mutedSessions,
  MUTE_DURATION_MS,
} from "../state/store";
import { cleanName } from "../utils/textUtils";
import { generateAIResponse } from "../services/aiServices";

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
 * * Fungsi ini bertanggung jawab untuk:
 * 1. Menyimpan pesan user ke riwayat chat.
 * 2. Mengirim konteks chat ke layanan AI (Ollama).
 * 3. Menangani kondisi error atau force stop.
 * 4. Mengirim balasan AI kembali ke WhatsApp user.
 * 5. Menjalankan aksi "STOP" (Mute & Hapus Memori) jika AI memutuskan percakapan selesai.
 *
 * @param {Chat} chat - Objek Chat dari whatsapp-web.js untuk mengirim pesan/typing state.
 * @param {string} chatId - ID unik chat (biasanya nomor telepon user + @c.us).
 * @param {string} finalName - Nama user yang sudah dibersihkan/diformat.
 * @param {string} combinedText - Teks pesan gabungan (jika user mengirim spam chat pendek).
 */
const handleAIInteraction = async (
  chat: Chat,
  chatId: string,
  finalName: string,
  combinedText: string
) => {
  console.log(`[Process] Memproses pesan dari ${finalName}: "${combinedText}"`);

  // 1. Simpan pesan User ke History (Memory)
  addMessageToHistory(chatId, "user", combinedText);

  // 2. Cek Force Stop (Manual Override)
  // Dilakukan di awal agar kita bisa membatalkan proses AI jika perlu (opsional),
  // atau untuk memaksa flag 'STOP' nanti.
  const isForceStop = checkForceStop(combinedText);

  // 3. Generate Jawaban AI
  const history = getHistory(chatId);

  // Kirim state 'typing...' agar terlihat natural seperti manusia
  await chat.sendStateTyping();

  // Request ke Ollama
  let aiResult = await generateAIResponse(history, finalName);

  // === SAFETY & FALLBACK ===
  // Menangani kasus jika AI gagal merespon (return null/undefined)
  if (!aiResult || !aiResult.reply) {
    if (isForceStop) {
      // Jika user minta stop tapi AI error, kita buat pesan manual
      aiResult = { reply: "Oke, pesan diterima. 👋", action: "STOP" };
    } else {
      console.warn("[AI Fail] Output kosong. Pesan diabaikan.");
      return; // Jangan kirim apa-apa jika error murni
    }
  }

  // === LOGIC OVERRIDE ===
  // Jika kode mendeteksi keyword stop (isForceStop), kita PAKSA action jadi STOP.
  // Ini meng-override keputusan AI jika AI "bebal" ingin lanjut ngobrol padahal user sudah pamit.
  if (isForceStop) {
    aiResult.action = "STOP";
  }

  // === UPDATE TIMESTAMP (CRITICAL) ===
  // Update waktu aktivitas bot SEBELUM mengirim pesan fisik.
  // Ini mencegah event listener 'message_create' menganggap pesan bot sendiri sebagai spam/aktivitas baru.
  lastBotReply.set(chatId, Date.now());

  // 4. Kirim Balasan AI ke WhatsApp
  await chat.sendMessage(aiResult.reply);

  // 5. Simpan Balasan AI ke History
  // Agar AI ingat apa yang barusan dia katakan di turn berikutnya.
  addMessageToHistory(chatId, "assistant", aiResult.reply);

  // 6. Handle Action STOP
  // Jika AI (atau override) memutuskan percakapan selesai:
  if (aiResult.action === "STOP") {
    console.log(`[Action] STOP triggered for ${finalName}. Muting & Clearing.`);

    // a. Hapus memori percakapan (Reset context) agar hemat RAM
    clearHistory(chatId);

    // b. Aktifkan Mute (Bot tidak akan membalas user ini selama durasi tertentu)
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
        "[Status] Sesi Baru/Timeout terdeteksi. Resetting History..."
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
    console.error("[Error Processing Buffer]", error);
  } finally {
    // Pastikan status 'typing' hilang meskipun terjadi error di tengah jalan
    const chat = await originalMessage.getChat();
    await chat.clearState();
  }
};
