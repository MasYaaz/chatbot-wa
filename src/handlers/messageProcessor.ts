import type { WAMessage, WASocket, proto } from "@whiskeysockets/baileys";
import { TIMEOUT_MS, STOP_KEYWORDS, BOT_PHRASES } from "../config/settings";
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
import { saveToDatabase } from "../utils/db";

const checkForceStop = (text: string): boolean => {
  const lower = text.toLowerCase();
  return STOP_KEYWORDS.some((keyword) => lower.includes(keyword));
};

// ==========================================
// CORE LOGIC: AI INTERACTION (Baileys Version)
// ==========================================

const handleAIInteraction = async (
  sock: WASocket,
  chatId: string,
  finalName: string,
  combinedText: string,
  originalMsg: proto.IWebMessageInfo,
) => {
  console.log(
    `${timeNow()} || [Process] Memproses pesan dari ${finalName}: "${combinedText}"`,
  );

  // 1. Simpan pesan User ke History
  addMessageToHistory(chatId, "user", combinedText);

  const isForceStop = checkForceStop(combinedText);
  const history = getHistory(chatId);

  // 2. Feedback Visual: Typing
  // Di Baileys, kita kirim presence update ke JID
  await sock.sendPresenceUpdate("composing", chatId);

  let aiResult = await generateAIResponse(history, finalName);

  if (!aiResult || !aiResult.reply) {
    if (isForceStop) {
      aiResult = { reply: "Oke, pesan diterima. 👋", action: "STOP" };
    } else {
      console.warn(`${timeNow()} || [AI Fail] Output kosong.`);
      await sock.sendPresenceUpdate("paused", chatId);
      return;
    }
  }

  if (isForceStop) aiResult.action = "STOP";

  // 3. JIT SMART AWAY CHECK
  if (isSmartAwayMode(chatId)) {
    console.log(`${timeNow()} || [Abort] Admin aktif saat AI proses.`);
    await sock.sendPresenceUpdate("paused", chatId);
    return;
  }

  isBotReplying.set(chatId, true);

  // 4. Kirim Balasan AI
  // Menggunakan sock.sendMessage dengan parameter 'quoted' agar membalas pesan user
  await sock.sendMessage(
    chatId,
    { text: aiResult.reply },
    { quoted: originalMsg as WAMessage },
  );

  lastBotReply.set(chatId, Date.now());

  setTimeout(() => isBotReplying.delete(chatId), 3000);

  // 5. Sinkronisasi Memori
  addMessageToHistory(chatId, "assistant", aiResult.reply);

  // 6. STOP Action
  if (aiResult.action === "STOP") {
    console.log(`${timeNow()} || [Action] STOP dipicu untuk ${finalName}.`);
    clearHistory(chatId);
    const muteUntil = Date.now() + MUTE_DURATION_MS;
    mutedSessions.set(chatId, muteUntil);
  }

  // Matikan status mengetik
  await sock.sendPresenceUpdate("paused", chatId);
};

// State Management Sederhana
const userState = new Map<string, "GREETED" | "NUDGED">();
const followUpTimers = new Map<string, Timer>();

// State tambahan untuk melacak awal sesi
const sessionStartTimers = new Map<string, number>();
const autoStopTimers = new Map<string, Timer>();

const handleChatbotInteraction = async (
  sock: WASocket,
  chatId: string,
  finalName: string,
  combinedText: string,
  originalMsg: proto.IWebMessageInfo,
) => {
  const textLower = combinedText.toLowerCase().trim();
  const now = Date.now();

  // 1. Bersihkan timer "Tanya Lagi" lama setiap ada pesan baru
  if (followUpTimers.has(chatId)) {
    clearTimeout(followUpTimers.get(chatId));
    followUpTimers.delete(chatId);
  }

  // 2. Fungsi Pembantu untuk Simpan & Stop (Reusable)
  const executeStop = async (reason: "KEYWORD" | "TIMEOUT") => {
    const closing: string =
      reason === "KEYWORD"
        ? BOT_PHRASES.CLOSINGS[
            Math.floor(Math.random() * BOT_PHRASES.CLOSINGS.length)
          ] || "Siap, pesan disimpan."
        : "Sesi berakhir otomatis. Pesan kakak sudah aku teruskan ke Admin ya. 👋";

    const sessionHistory = getHistory(chatId)
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" | ");

    saveToDatabase(chatId, finalName, sessionHistory || combinedText);

    isBotReplying.set(chatId, true);
    await sock.sendMessage(chatId, { text: closing });
    lastBotReply.set(chatId, Date.now());
    setTimeout(() => isBotReplying.delete(chatId), 3000);

    // Cleanup total
    clearHistory(chatId);
    userState.delete(chatId);
    sessionStartTimers.delete(chatId);
    if (autoStopTimers.has(chatId)) clearTimeout(autoStopTimers.get(chatId));
    autoStopTimers.delete(chatId);

    mutedSessions.set(chatId, Date.now() + 3600000); // Mute 1 jam
    console.log(
      `${timeNow()} || [Stop] Sesi selesai (${reason}) untuk ${finalName}`,
    );
  };

  // 3. Cek Keyword STOP manual
  const isStop = STOP_KEYWORDS.some((kw) => textLower.includes(kw));
  if (isStop) return await executeStop("KEYWORD");

  // 4. Jalankan Flow Chatbot
  const currentState = userState.get(chatId);

  if (!currentState) {
    // === TAHAP: GREETING ===
    const replyText: string =
      BOT_PHRASES.GREETINGS[
        Math.floor(Math.random() * BOT_PHRASES.GREETINGS.length)
      ] || "";
    userState.set(chatId, "GREETED");
    sessionStartTimers.set(chatId, now);

    isBotReplying.set(chatId, true);
    await sock.sendPresenceUpdate("composing", chatId);
    await sock.sendMessage(
      chatId,
      { text: replyText },
      { quoted: originalMsg as WAMessage },
    );
    lastBotReply.set(chatId, Date.now());
    setTimeout(() => isBotReplying.delete(chatId), 3000);

    addMessageToHistory(chatId, "assistant", replyText);

    // Set Auto-Stop Timer (25 detik) sejak pesan pertama
    const stopTimer = setTimeout(() => executeStop("TIMEOUT"), 25000);
    autoStopTimers.set(chatId, stopTimer);
  } else {
    // Catat pesan user ke history
    addMessageToHistory(chatId, "user", combinedText);
  }

  // 5. TAHAP: NUDGE (Tunggu 5 Detik setelah pesan terakhir)
  const nudgeTimer = setTimeout(async () => {
    // JIT Check: SmartAway
    if (isSmartAwayMode(chatId)) return;

    const nudge: string =
      BOT_PHRASES.NUDGES[
        Math.floor(Math.random() * BOT_PHRASES.NUDGES.length)
      ] || "Ada lagi?";

    isBotReplying.set(chatId, true);
    await sock.sendMessage(chatId, { text: nudge });
    lastBotReply.set(chatId, Date.now());
    setTimeout(() => isBotReplying.delete(chatId), 3000);

    addMessageToHistory(chatId, "assistant", nudge);
    userState.set(chatId, "NUDGED");

    console.log(
      `${timeNow()} || [Nudge] User diam 5 detik, menanyai ulang ${finalName}`,
    );
  }, 5000); // Tunggu 5 detik

  followUpTimers.set(chatId, nudgeTimer);
};

// ==========================================
// MAIN PROCESSOR
// ==========================================

export const processBufferedMessages = async (
  sock: WASocket,
  chatId: string,
  combinedText: string,
  originalMessage: proto.IWebMessageInfo,
) => {
  try {
    // === MENGAMBIL NAMA USER ===
    // Di Baileys, nama ada di properti 'pushName'
    const pushName = originalMessage.pushName || "Kak";
    const finalName = cleanName(pushName);

    // === LOGIC TIMEOUT / SESI BARU ===
    const lastBot = lastBotReply.get(chatId) || 0;
    const timeDiff = Date.now() - lastBot;
    const isNewSession = timeDiff > TIMEOUT_MS || lastBot === 0;

    if (isNewSession) {
      console.log(`${timeNow()} || [Status] Sesi Baru/Timeout terdeteksi.`);
      clearHistory(chatId);
    }

    // Jalankan interaksi
    await handleChatbotInteraction(
      sock,
      chatId,
      finalName,
      combinedText,
      originalMessage,
    );
  } catch (error) {
    console.error(`${timeNow()} || [Error Processing Buffer]`, error);
    // Pastikan status mengetik berhenti jika error
    await sock.sendPresenceUpdate("paused", chatId);
  }
};
