import type { Client } from "whatsapp-web.js";
import { timeNow } from "../utils/timeUtils";

// --- HELPER: VALIDASI & KEAMANAN ---
export const validateRequest = async (
  req: Request,
  client: Client,
  number: string
) => {
  // 1. Cek Kunci Rahasia (UUID) dari Header
  const secret = req.headers.get("x-api-secret");
  if (secret !== process.env.INTERNAL_API_SECRET) {
    console.error(`${timeNow()} || ⚠️ Akses Ilegal Dideteksi!`);
    throw { status: 401, error: "Unauthorized: Kunci rahasia tidak valid." };
  }

  if (!client.info) throw { status: 503, error: "Bot belum siap." };
  if (!number) throw { status: 400, error: "Nomor wajib diisi." };

  // 2. Format & Cek Registrasi
  let clean = number.replace(/\D/g, "");
  if (clean.startsWith("0")) clean = "62" + clean.slice(1);
  const target = clean.endsWith("@c.us") ? clean : clean + "@c.us";

  const isRegistered = await client.isRegisteredUser(target);
  if (!isRegistered)
    throw { status: 404, error: "Nomor tidak terdaftar di WA." };

  return target;
};
