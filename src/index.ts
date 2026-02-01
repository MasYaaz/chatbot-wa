import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { handleIncomingMessage } from "./handlers/messageHandler";
import { handleOutgoingMessage } from "./handlers/activityHandler";
import { apiHandler } from "./server/apiServer";
import { timeNow } from "./utils/timeUtils";
import { startAutoCleanup } from "./utils/autoCleanupMemory";

// Setup Client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// Setup Event Listeners
client.on("qr", (qr) => {
  console.log("Scan QR Code ini:");
  qrcode.generate(qr, { small: true });
});

// Pemberitahuan di console kalau chatbot udah siap
client.on("ready", () => {
  console.log(`${timeNow()} || ✅ Bot Siap!`);
});

// Logic admin activity (untuk mendeteksi apakah pembalas WA itu manusia atau chatbot)
client.on("message_create", handleOutgoingMessage);

// Logic pesan masuk (Untuk kirim pesan balasan)
client.on("message", handleIncomingMessage);

// // Membersihkan riwayat pembicaraan WA yang disimpen di memori (Context pembicaraan antara user dengan chatbot/AI)
// startAutoCleanup();

// Memulai chatbot
client.initialize();

// Memulai endpoint server (Untuk endpoint kirim pesan secara otomatis)
const port = 80;
Bun.serve({
  port: port,
  fetch: (req) => apiHandler(req, client), // <-- Delegasi bersih
});

console.log(
  `${timeNow()} || 🌐 Server API (Bun) berjalan di http://localhost:${port}`,
);
