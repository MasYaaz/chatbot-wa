import type { proto, WASocket } from "@whiskeysockets/baileys";
import { isBotReplying, lastAdminActivity, lastBotReply } from "../state/store";
import { timeNow } from "../utils/timeUtils";

export const handleOutgoingMessage = (
  sock: WASocket,
  m: {
    messages: proto.IWebMessageInfo[];
  },
) => {
  // Cek apakah array messages ada dan tidak kosong
  const msg = m.messages?.[0];
  if (!msg || !msg.key) return;

  // Cek apakah key dan remoteJid ada
  const chatId = msg.key.remoteJid;
  const isFromMe = msg.key.fromMe;

  // Jika tidak ada ID chat atau pesan bukan dari kita, hentikan
  if (!chatId || !isFromMe) return;

  // Cek Flag State
  if (isBotReplying.get(chatId)) return;

  const now = Date.now();
  const lastBotTime = lastBotReply.get(chatId) || 0;

  // 4. Logic Filter Waktu
  if (now - lastBotTime < 3000) {
    return;
  }

  // 5. Validasi Manusia
  console.log(
    `${timeNow()} || [Activity] Admin manusia terdeteksi aktif di ${chatId}`,
  );

  lastAdminActivity.set(chatId, now);
};
