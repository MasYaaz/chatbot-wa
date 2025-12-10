import { NAME_REPLACEMENTS } from "../config/settings";

/**
 * Membersihkan nama pengguna (pushname) dari karakter yang tidak diinginkan
 * agar terdengar lebih natural dan sopan saat disapa oleh bot.
 *
 * **Urutan Proses Pembersihan:**
 * 1. Menghapus angka (0-9).
 * 2. Mengganti kata-kata tertentu sesuai config `NAME_REPLACEMENTS` (misal: gelar/singkatan).
 * 3. Menghapus simbol & emoji (hanya menyisakan Huruf, Spasi, Titik, Koma).
 * 4. Menghapus kata spesifik "konsul" (hardcoded logic).
 * 5. Merapikan spasi berlebih (double space).
 *
 * @param {string} rawName - String nama mentah dari objek kontak WhatsApp.
 * @returns {string} Nama yang sudah bersih. Jika nama kosong atau hasil < 2 huruf, mengembalikan "Kak".
 */
export const cleanName = (rawName: string): string => {
  if (!rawName) return "Kak";

  // 1. Hapus Angka
  let cleaned = rawName.replace(/[0-9]/g, "");

  // 2. Custom Replacements (dari config)
  for (const [key, replacement] of Object.entries(NAME_REPLACEMENTS)) {
    const regex = new RegExp(`\\b${key}\\b`, "gi");
    cleaned = cleaned.replace(regex, replacement);
  }

  // 3. Whitelist: Hapus yang bukan huruf, spasi, titik, koma (Emoji hilang di sini)
  cleaned = cleaned.replace(/[^a-zA-Z\s.,]/g, "");

  // 4. Spesifik case
  cleaned = cleaned.replace("konsul", ""); // Hardcoded removal dari kode aslimu

  // 5. Normalisasi Spasi (Trim & hapus spasi ganda)
  cleaned = cleaned.trim().replace(/\s+/g, " ");

  // Fallback jika sisa nama terlalu pendek (misal cuma "A" atau kosong)
  if (cleaned.length < 2) return "Kak";

  return cleaned;
};
