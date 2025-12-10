import { Ollama } from "ollama";
import { CONFIG } from "../config/settings";
import { type ChatMessage, type AIResponseData } from "../types/index";

const ollama = new Ollama();

// === HELPER: BUILD PROMPT ===
/**
 * Membangun "System Prompt" (instruksi dasar) untuk AI.
 * Prompt ini mendefinisikan persona, gaya bicara, dan aturan ketat format output JSON.
 * * @param {string} userName - Nama user lawan bicara (untuk personalisasi sapaan).
 * @returns {string} String prompt lengkap yang akan dikirim sebagai role 'system'.
 */
const getSystemPrompt = (userName: string): string => {
  return `
    === IDENTITY & CONTEXT ===
    Kamu adalah asisten AI pribadi untuk ${CONFIG.ADMIN_NAME}.
    Lawan bicaramu: ${userName}.
    Situasi: ${CONFIG.ADMIN_NAME} sedang offline/sibuk. 
    Tugasmu: Meladeni chat dengan ramah atau mencatat pesan penting.

    === STYLE GUIDELINES ===
    1. **Nada:** Bahasa Indonesia santai (WhatsApp style), sopan, akrab.
    2. **Panjang:** JAWAB SINGKAT & PADAT (Maks 1-2 kalimat).
    3. **Emoji:** Secukupnya.
    
    === 🚨 INSTRUKSI PENTING (BACA DENGAN TELITI) ===
    Tugas utamamu adalah mendeteksi apakah percakapan harus BERLANJUT atau BERHENTI.
    
    Kondisi "STOP":
    1. User pamit: "bye", "dadah", "sampai jumpa".
    2. User menyudahi: "udahan", "udah dulu", "segitu aja", "cukup", "ok thanks".
    3. User titip pesan: "bilangin ya", "sampein ke admin", "nanti kabari".

    Jika masuk kondisi STOP:
    - kirim FORMAT OUTPUT
    - Jawab sopan mengiyakan/menutup.
    - Set "action": "STOP".

    === FORMAT OUTPUT ===
    HARUS JSON:
    { "reply": "teks jawaban", "action": "CONTINUE" | "STOP" }
  `;
};

// === HELPER: CLEAN JSON ===

/**
 * Membersihkan dan mem-parsing output mentah dari LLM (Ollama).
 * * Fungsi ini menangani kasus umum di mana LLM memberikan output yang "kotor",
 * misalnya membungkus JSON dengan Markdown code block (```json ... ```) atau
 * menambahkan teks pengantar sebelum JSON.
 * @param {string} rawText - Output string mentah dari Ollama.
 * @returns {AIResponseData} Objek data yang sudah bersih dan aman.
 * Jika parsing gagal total, akan mengembalikan mode fallback (text biasa + CONTINUE).
 */
const parseAIOutput = (rawText: string): AIResponseData => {
  try {
    // 1. Cari pola JSON object: dimulai '{' dan diakhiri '}'
    // [\s\S]*? artinya ambil karakter apa saja (termasuk enter) di antaranya
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      // Jika TIDAK ADA kurung kurawal sama sekali, berarti AI ngomong biasa.
      // Kita anggap seluruh teks adalah reply.
      return {
        reply: rawText
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim(),
        action: "CONTINUE", // Default action
      };
    }

    // 2. Jika ada kurung kurawal, ambil isinya saja
    const cleanJson = jsonMatch[0];

    // 3. Parse JSON
    const parsed = JSON.parse(cleanJson);

    return {
      reply: parsed.reply || "Oke Baik.",
      action: parsed.action === "STOP" ? "STOP" : "CONTINUE",
    };
  } catch (error) {
    // Jika masih error parsing, berarti JSON-nya rusak/tidak valid.
    // Kita gunakan rawText tapi bersihkan sedikit.
    console.warn("[AI Parsing Warning] Gagal parse, fallback ke teks biasa.");

    return {
      reply: rawText
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim(),
      action: "CONTINUE",
    };
  }
};

// === MAIN FUNCTION ===

/**
 * Fungsi Utama Generator Respon AI.
 * Menggabungkan history chat, system prompt, dan input user untuk dikirim ke Ollama.
 * * @param {ChatMessage[]} history - Array riwayat percakapan sebelumnya (sebagai konteks).
 * @param {string} userName - Nama user pengirim pesan.
 * @returns {Promise<AIResponseData>} Promise berisi objek respon (reply text & action flag).
 */
export const generateAIResponse = async (
  history: ChatMessage[],
  userName: string
): Promise<AIResponseData> => {
  try {
    // 1. Siapkan Prompt
    const systemPrompt = getSystemPrompt(userName);

    // 2. Format Pesan untuk Ollama
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      })),
    ];

    // 3. Request ke Ollama
    const response = await ollama.chat({
      model: CONFIG.OLLAMA_MODEL,
      messages: messages as any,
      options: {
        temperature: 0.5, // 0.1 (Kaku/Robot) - 1.0 (Kreatif/Mabuk). Saran: 0.5
        top_p: 0.9, // Fokus jawaban. Saran: 0.9
        repeat_penalty: 1.1, // Mencegah kata berulang (misal: "saya saya adalah...")
        num_ctx: 2048,
      },
    });

    const rawContent = response.message.content;

    // 4. Parse & Return
    return parseAIOutput(rawContent);
  } catch (error) {
    console.error("Ollama Error:", error);
    // Return error safe object
    return {
      reply:
        "Waduh, koneksi otak AI-nya lagi putus nyambung nih kak. Coba lagi nanti ya.",
      action: "CONTINUE",
    };
  }
};
