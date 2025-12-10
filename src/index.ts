import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { handleIncomingMessage } from "./handlers/messageHandler";
import { lastAdminActivity } from "./state/store";
import { CONFIG } from "./config/settings";

/**
 * Inisialisasi Client WhatsApp Web.
 * * Menggunakan strategi `LocalAuth` untuk menyimpan sesi login di folder lokal,
 * sehingga tidak perlu scan QR Code setiap kali bot dijalankan ulang.
 * @type {Client}
 */
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

/**
 * Event Listener: QR Code
 * * Dipicu ketika klien belum terautentikasi dan membutuhkan scan QR.
 * @param {string} qr - String data QR Code yang diterima dari WA Web.
 */
client.on("qr", (qr) => {
  console.log("Scan QR Code ini:");
  qrcode.generate(qr, { small: true });
});

/**
 * Event Listener: Ready
 * * Dipicu ketika klien berhasil terhubung sepenuhnya ke WhatsApp
 * dan siap mengirim/menerima pesan.
 */
client.on("ready", () => {
  console.log("✅ Bot Siap!");
  // Kirim notif ke admin kalau bot restart
  client.sendMessage(
    CONFIG.BOT_NUMBER_ID,
    "Bot sudah aktif dan tersambung kembali. 🚀"
  );
});

/**
 * Event Listener: Message Create (Pesan Keluar/Dibuat)
 * * Event ini mendeteksi SEMUA pesan yang dibuat (baik masuk maupun keluar).
 * Di sini digunakan khusus untuk mendeteksi pesan dari Admin (fromMe)
 * guna memperbarui timestamp aktivitas terakhir admin.
 * * @param {import('whatsapp-web.js').Message} message - Objek pesan.
 */
client.on("message_create", (message) => {
  if (message.fromMe) {
    lastAdminActivity.set(message.to, Date.now());
  }
});

/**
 * Event Listener: Message (Pesan Masuk)
 * * Menangkap pesan masuk dan mengopernya ke fungsi handler utama.
 * Lihat `handleIncomingMessage` untuk logika detailnya.
 */
client.on("message", handleIncomingMessage);

// Jalankan inisialisasi bot
client.initialize();
