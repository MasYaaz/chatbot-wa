import { Client } from "whatsapp-web.js";
import { validateRequest } from "../handlers/validationHandler";
import { handleExcel, handleText } from "../handlers/endpointHandler";
import type { ApiError, BotRequest } from "../types";
import { timeNow } from "../utils/timeUtils";

/**
 * Handler utama untuk API Gateway WhatsApp Bot.
 * * Fungsi ini bertindak sebagai "Router" dan "Controller" pusat yang menangani:
 * 1. Validasi HTTP Method (Wajib POST).
 * 2. Parsing JSON Body dari request.
 * 3. Validasi nomor tujuan (memastikan format benar & terdaftar).
 * 4. Routing berdasarkan URL endpoint ke handler spesifik (Text/Excel).
 * 5. Standarisasi format response JSON (Success/Error).
 * * @param {Request} req - Object Request bawaan (Web Standard/Bun) yang berisi detail permintaan HTTP.
 * @param {Client} client - Instance client WhatsApp yang sudah terautentikasi dan siap digunakan.
 * @returns {Promise<Response>} Promise yang mengembalikan object Response JSON standar.
 */
export const apiHandler = async (
  req: Request,
  client: Client,
): Promise<Response> => {
  const url = new URL(req.url);

  // 1. Gatekeeper: Hanya izinkan Method POST
  // Method lain (GET, PUT, DELETE) akan ditolak langsung.
  if (req.method !== "POST") return new Response("Not Found", { status: 404 });

  try {
    // 2. Parsing Body
    // Mengubah raw request body menjadi object JSON typed `BotRequest`.
    const body = (await req.json()) as BotRequest;

    // 3. Validasi Nomor Tujuan
    // Memastikan nomor ada di body dan diformat menjadi id WhatsApp yang valid (misal: 628123@c.us).
    // Sekarang mengembalikan object { target: string, isRegistered: boolean }
    const { target, isRegistered } = await validateRequest(
      req,
      client,
      body.number,
    );

    // 4. Routing Logic
    // Mengarahkan request ke fungsi handler yang sesuai berdasarkan path URL.
    switch (url.pathname) {
      case "/cek-nomer-wa":
        // Jika kode sampai di sini tanpa masuk ke 'catch',
        // berarti nomor sudah divalidasi dan "terdaftar" oleh validateRequest.
        console.log(
          `${timeNow()} || [Check] Verifikasi nomor: ${target.replace("@c.us", "")}`,
        );
        return Response.json({
          status: true,
          exists: isRegistered,
          number: target.replace("@c.us", ""),
          message: isRegistered
            ? "Nomor terdaftar di WhatsApp"
            : "Nomor tidak terdaftar di WhatsApp",
        });

      // Endpoint untuk pesan teks biasa
      case "/send-message":
        await handleText(client, target, body.message);
        break;

      // Endpoint untuk kirim file Excel dengan caption
      case "/send-excel":
        await handleExcel(
          client,
          target,
          body.file,
          body.fileName,
          body.caption,
        );
        break;

      default:
        // Jika endpoint tidak dikenali
        return new Response("Endpoint Not Found", { status: 404 });
    }

    // 5. Success Response
    // Mengembalikan status 200 OK jika proses pengiriman berhasil diserahkan ke WA Web.
    return Response.json({ status: true, to: target, type: url.pathname });
  } catch (rawError: unknown) {
    // 6. Global Error Handler
    // Menangkap error dari validasi maupun proses pengiriman pesan.
    // Mengembalikan status code spesifik jika ada (misal 400 dr validasi), atau 500 untuk error server.

    // Lakukan Type Assertion (Paksa tipe data)
    const err = rawError as ApiError;
    const status = err.status || 500;

    // Prioritaskan err.error, lalu err.message, atau default string
    const errorMessage = err.error || err.message || "Internal Server Error";
    console.log(`${timeNow()} || [Failure] ${errorMessage}`);
    return Response.json({ status: false, error: errorMessage }, { status });
  }
};
