import type {
  MessageUpsertType,
  WAMessage,
  WASocket,
  proto,
} from "@whiskeysockets/baileys";
import { isValidMessage, isSmartAwayMode } from "../utils/validators";
import { processBufferedMessages } from "./messageProcessor";
import { BOOT_TIMESTAMP } from "../state/store";
import { timeNow } from "../utils/timeUtils";

const BUFFER_DELAY = 6000;

const messageBuffers = new Map<
  string,
  { timer: NodeJS.Timeout; text: string[] }
>();

/**
 * Handler Utama - Sudah aman dari error 'possibly undefined'
 */
export const handleIncomingMessage = async (
  sock: WASocket,
  m: { messages: proto.IWebMessageInfo[]; type: MessageUpsertType },
) => {
  try {
    // Ambil pesan pertama dan pastikan ada
    const msg = m.messages?.[0];

    // Safety check: jika msg, msg.key, atau msg.message tidak ada, langsung keluar
    if (!msg || !msg.key || !msg.message) return;

    // Filter Validasi & Anti-Zombie
    if (!isValidMessage(msg as WAMessage)) return;

    // Pastikan remoteJid (ID Chat) tersedia
    const chatId = msg.key.remoteJid;
    if (!chatId) return;

    // Konversi timestamp ke milidetik
    const messageTimestamp = Number(msg.messageTimestamp) * 1000;
    if (messageTimestamp < BOOT_TIMESTAMP) {
      console.log(
        `${timeNow()} || [Old Message] Mengabaikan pesan lama dari ${chatId}`,
      );
      return;
    }

    // Ekstraksi Teks yang lebih luas (mendukung ViewOnce & Document)
    const mType = Object.keys(msg.message)[0];
    const content = msg.message;

    // 3. Ekstraksi Teks dengan Null-Safety
    let userQuery =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      (content as any).viewOnceMessageV2?.message?.imageMessage?.caption ||
      (content as any).viewOnceMessageV2?.message?.videoMessage?.caption ||
      "";

    userQuery = userQuery.trim();

    // Beri label jika media tanpa caption
    if (
      !userQuery &&
      (msg.message.imageMessage ||
        msg.message.videoMessage ||
        (content as any).viewOnceMessageV2)
    ) {
      userQuery = "[Gambar/Media/Video]";
    }

    // Jika pesan tetap kosong (misal: stiker), abaikan
    if (!userQuery) return;

    // === BUFFER MANAGEMENT ===

    const bufferEntry = messageBuffers.get(chatId);
    if (bufferEntry) clearTimeout(bufferEntry.timer);

    const currentBuffer = bufferEntry
      ? [...bufferEntry.text, userQuery]
      : [userQuery];

    const newTimer = setTimeout(async () => {
      if (isSmartAwayMode(chatId)) {
        console.log(`${timeNow()} || [SmartAway] Admin online. Bot diam.`);
        messageBuffers.delete(chatId);
        return;
      }

      const finalText = currentBuffer.join("\n");
      messageBuffers.delete(chatId);

      //Teruskan ke processor
      await processBufferedMessages(sock, chatId, finalText, msg);
    }, BUFFER_DELAY);

    messageBuffers.set(chatId, { timer: newTimer, text: currentBuffer });
  } catch (error) {
    console.error("[CRITICAL ERROR] Handler crash:", error);
  }
};
