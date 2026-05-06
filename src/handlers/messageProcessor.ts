import type { WAMessage, WASocket, proto } from "@whiskeysockets/baileys";
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
    await handleAIInteraction(
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
