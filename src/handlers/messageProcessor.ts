import { type Message, type Chat } from "whatsapp-web.js";
import { CONFIG, TIMEOUT_MS, STOP_KEYWORDS } from "../config/settings";
import {
  lastBotReply,
  addMessageToHistory,
  getHistory,
  clearHistory,
  mutedSessions,
  MUTE_DURATION_MS,
} from "../state/store";
import { cleanName } from "../utils/textUtils";
import { getTimeGreeting } from "../utils/timeUtils";
import { generateAIResponse } from "../services/aiServices";

/**
 * Mengecek apakah pesan mengandung kata kunci penghentian paksa.
 * Digunakan sebagai "Hard Stop" jika AI gagal mendeteksi konteks pamit.
 *
 * @param {string} text - Teks input dari user.
 * @returns {boolean} True jika mengandung kata seperti "stop", "bye", dll.
 */
const checkForceStop = (text: string): boolean => {
  const lower = text.toLowerCase();
  return STOP_KEYWORDS.some((keyword) => lower.includes(keyword));
};

// ==========================================
// LOGIC A: SESI BARU
// ==========================================

/**
 * Menangani user yang baru memulai percakapan atau sudah lama tidak chat (Timeout).
 * Tugas fungsi ini:
 * 1. Membersihkan ingatan lama (Reset context).
 * 2. Mengirim salam pembuka (Greeting).
 *
 * @param {Chat} chat - Objek chat dari whatsapp-web.js untuk kirim pesan.
 * @param {string} chatId - ID unik chat.
 * @param {string} finalName - Nama user yang sudah dibersihkan.
 * @param {string} combinedText - Pesan user saat ini (disimpan ke history baru).
 */
const handleNewSession = async (
  chat: Chat,
  chatId: string,
  finalName: string,
  combinedText: string
) => {
  console.log("[Status] Sesi Baru - Reset Memory & Kirim Greeting");

  // Reset history lama biar AI gak bingung dengan konteks minggu lalu
  clearHistory(chatId);

  // Simpan pesan pertama user ke history baru
  if (combinedText) {
    addMessageToHistory(chatId, "user", combinedText);
  }

  // Efek mengetik biar terlihat natural
  await chat.sendStateTyping();
  await new Promise((r) => setTimeout(r, 1000));

  const greeting = getTimeGreeting();
  const welcomeMsg =
    `Hai ${finalName} Selamat ${greeting}! \n` +
    `${CONFIG.ADMIN_NAME} lagi gak ada nih.\n` +
    `Tinggalkan pesan aja yaa.. nanti dibalas. \nAtau kalau mau ngobrol sama AI, silakan balas chat ini oke.`;

  await chat.sendMessage(welcomeMsg);

  // Simpan pesan bot ke history & update timestamp
  addMessageToHistory(chatId, "assistant", welcomeMsg);
  lastBotReply.set(chatId, Date.now());
};

// ==========================================
// LOGIC B: SESI AKTIF
// ==========================================

/**
 * Menangani percakapan yang sedang berlangsung (Active Session).
 * Fungsi ini menghubungkan user dengan AI, dan menangani logika STOP/MUTE.
 *
 * @param {Chat} chat - Objek chat.
 * @param {string} chatId - ID Chat.
 * @param {string} finalName - Nama user.
 * @param {string} combinedText - Gabungan pesan user (buffer).
 */
const handleActiveSession = async (
  chat: Chat,
  chatId: string,
  finalName: string,
  combinedText: string
) => {
  console.log("[Status] Sesi Aktif - Processing AI Context");

  // 1. Simpan input user ke memori
  addMessageToHistory(chatId, "user", combinedText);

  // 2. DETEKSI HARD STOP (Keyword check manual)
  const isForceStop = checkForceStop(combinedText);
  if (isForceStop) {
    console.log(`[Override] Mendeteksi kata kunci STOP: "${combinedText}"`);
  }

  // 3. Generate AI Response
  const chatContext = getHistory(chatId);
  let aiResult = await generateAIResponse(chatContext, finalName); // Pakai 'let' biar bisa diubah

  // Safety check: Jika AI error tapi user minta stop, kita buat dummy response
  // Ini mencegah bot diam saja padahal user sudah bilang "bye"
  if (!aiResult || !aiResult.reply) {
    if (isForceStop) {
      aiResult = { reply: "Oke, sampai jumpa!", action: "STOP" };
    } else {
      return; // Jika error biasa, abaikan (jangan reply apa-apa)
    }
  }

  // === 4. LOGIC OVERRIDE ===
  // Jika kode mendeteksi kata kunci stop secara manual, PAKSA action jadi STOP.
  // Ini override keputusan AI (jaga-jaga AI-nya "bebal" ingin lanjut ngobrol).
  if (isForceStop) {
    console.log("[Logic] Mengubah paksa Action menjadi STOP.");
    aiResult.action = "STOP";
  }

  // 5. Kirim Balasan ke WA
  await chat.sendMessage(aiResult.reply);
  addMessageToHistory(chatId, "assistant", aiResult.reply);

  // 6. Eksekusi Action STOP/MUTE
  if (aiResult.action === "STOP") {
    console.log(`[Action] STOP dijalankan. Mute User & Clear History.`);

    // Hapus History (Sesi dianggap selesai)
    clearHistory(chatId);

    // AKTIFKAN MUTE (Bot tidak akan membalas user ini selama durasi tertentu)
    const muteUntil = Date.now() + MUTE_DURATION_MS;
    mutedSessions.set(chatId, muteUntil);

    // Hapus timer reply agar sesi berikutnya benar-benar dianggap baru (Fresh Start)
    lastBotReply.delete(chatId);
  } else {
    // Jika CONTINUE: Update timestamp aktivitas terakhir bot
    lastBotReply.set(chatId, Date.now());
  }
};

// ==========================================
// MAIN PROCESSOR
// ==========================================

/**
 * Controller Utama: Memproses pesan yang sudah di-buffer.
 * Fungsi ini menentukan apakah pesan masuk ke logika "Sesi Baru" atau "Sesi Aktif"
 * berdasarkan selisih waktu (timeout).
 *
 * @param {string} chatId - ID unik chat.
 * @param {string} combinedText - Teks pesan gabungan (jika user kirim spam chat beruntun).
 * @param {Message} originalMessage - Objek pesan asli (untuk ambil info kontak/chat).
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

    const lastBot = lastBotReply.get(chatId) || 0;
    const timeDiff = Date.now() - lastBot;

    // Logic timeout: Apakah jeda percakapan masih dalam batas wajar?
    // Jika lastBot 0 (belum pernah chat), timeDiff akan sangat besar -> Sesi Baru.
    const isSessionActive = timeDiff < TIMEOUT_MS && lastBot !== 0;

    await chat.sendStateTyping();

    if (!isSessionActive) {
      // Jika sudah timeout atau user baru -> Sesi Baru
      await handleNewSession(chat, chatId, finalName, combinedText);
    } else {
      // Jika masih dalam percakapan -> Sesi Aktif
      await handleActiveSession(chat, chatId, finalName, combinedText);
    }
  } catch (error) {
    console.error("[Error Processing Buffer]", error);
  } finally {
    // Pastikan status mengetik hilang walau error
    const chat = await originalMessage.getChat();
    await chat.clearState();
  }
};
