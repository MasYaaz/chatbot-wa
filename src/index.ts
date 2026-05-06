import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  delay,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import readline from "readline";
import { handleIncomingMessage } from "./handlers/messageHandler";
import { handleOutgoingMessage } from "./handlers/activityHandler";
import { timeNow } from "./utils/timeUtils";
import { startAutoCleanup } from "./utils/autoCleanupMemory";

// Setup readline untuk input nomor telepon di terminal
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = (text: string) =>
  new Promise<string>((resolve) => rl.question(text, resolve));

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  const { version } = await fetchLatestBaileysVersion();

  // 1. Inisialisasi Koneksi
  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    logger: pino({ level: "silent" }),
    // Nama browser HARUS seperti ini agar fitur Pairing Code muncul
    browser: ["Ubuntu", "Chrome", "20.0.04"],
  });

  // --- LOGIC PAIRING CODE ---
  // Jika belum terdaftar/login, minta nomor telepon
  if (!sock.authState.creds.registered) {
    console.log(`\n${timeNow()} || 🛠️  MODE PAIRING CODE AKTIF`);
    const phoneNumber = await question(
      "Masukkan Nomor Telepon Bot (Contoh: 628123456789): ",
    );

    // Tunggu koneksi stabil sebelum meminta kode
    await delay(6000);

    try {
      const code = await sock.requestPairingCode(phoneNumber.trim());
      console.log(`\n==========================================`);
      console.log(`KODE PAIRING ANDA: ${code}`);
      console.log(`==========================================\n`);
      console.log(
        `Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat > Tautkan dengan nomor telepon saja.\n`,
      );
    } catch (err) {
      console.error("Gagal mendapatkan pairing code:", err);
    }
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log(
        `${timeNow()} || ⚠️ Koneksi terputus. Reconnect: ${shouldReconnect}`,
      );

      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log(`${timeNow()} || ✅ Bot Siap (Baileys via Pairing Code)!`);
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages?.[0];

    if (!msg || !msg.message || !msg.key) return;
    if (msg.key.remoteJid === "status@broadcast") return;

    if (msg.key.fromMe) {
      handleOutgoingMessage(sock, m);
    } else {
      await handleIncomingMessage(sock, m);
    }
  });

  startAutoCleanup();
  return sock;
}

startBot().catch((err) => console.error("Error saat memulai bot:", err));
