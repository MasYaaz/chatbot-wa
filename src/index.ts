import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { handleIncomingMessage } from "./handlers/messageHandler";
import {
  lastAdminActivity,
  lastBotReply,
  startAutoCleanup,
} from "./state/store";
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

startAutoCleanup();

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
client.on("message_create", (msg) => {
  // Cek apakah pesan ini keluar dari akun kita (fromMe)
  if (msg.fromMe) {
    const chatId = msg.to;
    const now = Date.now();

    // Ambil waktu terakhir Bot reply (dari langkah no 2)
    const lastBotTime = lastBotReply.get(chatId) || 0;

    // LOGIC FILTER:
    // Jika pesan ini muncul kurang dari 3 detik setelah Bot ditandai "reply",
    // Berarti pesan ini ADALAH pesan Bot itu sendiri (echo).
    // JANGAN update aktivitas admin.
    if (now - lastBotTime < 3000) {
      return;
    }

    // Jika lolos filter di atas, berarti ini 99% MANUSIA (Admin) yang mengetik manual.
    console.log(`[Activity] Admin manusia terdeteksi aktif di ${chatId}`);
    lastAdminActivity.set(chatId, now);
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
