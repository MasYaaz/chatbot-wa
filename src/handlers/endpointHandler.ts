import { MessageMedia, type Client } from "whatsapp-web.js";
import { timeNow } from "../utils/timeUtils";

// --- HANDLERS: LOGIKA PER ENDPOINT ---
export const handleText = async (
  client: Client,
  target: string,
  message?: string,
) => {
  if (!message) throw { status: 400, error: "Pesan teks kosong." };
  await client.sendMessage(target, message);
  console.log(`${timeNow()} || [Success] Pesan berhasil dikirim ke ${target}`);
};

export const handleExcel = async (
  client: Client,
  target: string,
  file?: string,
  fileName?: string,
  caption?: string,
) => {
  if (!file) throw { status: 400, error: "File base64 kosong." };
  const media = new MessageMedia(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    file,
    fileName || "Data Santri.xlsx",
  );
  await client.sendMessage(target, media, { caption: caption || "" });
  console.log(
    `${timeNow()} || [Success] File excel "${fileName}" berhasil dikirim ke ${target}`,
  );
};
