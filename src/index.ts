import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { handleIncomingMessage } from "./handlers/messageHandler";
import {
  lastAdminActivity,
  lastBotReply,
  startAutoCleanup,
} from "./state/store";

/**
 * Inisialisasi Client WhatsApp Web.
 * * Menggunakan strategi `LocalAuth` untuk menyimpan sesi login di folder lokal,
 * sehingga tidak perlu scan QR Code setiap kali bot dijalankan ulang.
 * @type {Client}
 */
const client: Client = new Client({
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
    if (now - lastBotTime < 2000) {
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

// --- KONFIGURASI SERVER BUN.SERVE ---
const port = 80;

interface SendMessageRequest {
  number: string;
  message: string;
}

Bun.serve({
  port: port,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;

    // Routing: POST /send-message
    if (url.pathname === "/send-message" && method === "POST") {
      try {
        // 1. Ambil Body JSON
        const body = (await req.json()) as SendMessageRequest;
        const { number, message } = body;

        // 2. Validasi Input
        if (!number || !message) {
          return Response.json(
            {
              status: false,
              error: "Parameter 'number' dan 'message' wajib diisi.",
            },
            { status: 400 }
          );
        }

        // 3. Cek Status Bot
        if (!client.info) {
          return Response.json(
            {
              status: false,
              error: "Bot belum siap (belum login atau masih inisialisasi).",
            },
            { status: 503 }
          );
        }

        // 4. Formatting Nomor Telepon
        let formattedNumber = number.replace(/\D/g, "");
        if (formattedNumber.startsWith("0")) {
          formattedNumber = "62" + formattedNumber.slice(1);
        }
        if (!formattedNumber.endsWith("@c.us")) {
          formattedNumber += "@c.us";
        }

        // 5. Cek Registrasi & Kirim Pesan
        const isRegistered = await client.isRegisteredUser(formattedNumber);
        if (!isRegistered) {
          return Response.json(
            {
              status: false,
              error: "Nomor tersebut tidak terdaftar di WhatsApp.",
            },
            { status: 404 }
          );
        }

        await client.sendMessage(formattedNumber, message);

        return Response.json({
          status: true,
          data: {
            to: formattedNumber,
            message: message,
            timestamp: new Date(),
          },
        });
      } catch (error) {
        console.error("Gagal kirim pesan:", error);
        return Response.json(
          {
            status: false,
            error: "Terjadi kesalahan internal atau JSON tidak valid.",
          },
          { status: 500 }
        );
      }
    }

    // Default 404 jika route tidak ditemukan
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🌐 Server API (Bun) berjalan di http://localhost:${port}`);
