import { Ollama } from "ollama";
import { CONFIG } from "../config/settings";
import { type ChatMessage, type AIResponseData } from "../types/index";
import { timeNow } from "../utils/timeUtils";

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
    Role: Kamu adalah asisten virtual dari ${CONFIG.ADMIN_NAME}.
    User: ${userName}.
    Current Time: ${timeNow()}

    GOAL UTAMA:
    Jadilah jembatan komunikasi antara User dan ${CONFIG.ADMIN_NAME}. Karena admin sedang sibuk, tugasmu adalah melayani user dengan ramah, menjawab pertanyaan umum sebisa mungkin, dan mencatat pesan penting.

    CONSTRAINTS:
    - JANGAN PERNAH mengaku sebagai ${CONFIG.ADMIN_NAME}. Kamu adalah asistennya.
    - Tetaplah ramah dan mengalir. Jangan terlihat seperti bot kaku.
    - Jika user bertanya hal teknis yang rumit (seperti coding/analisis saham), katakan: "Wah kalau itu mending langsung ke ${CONFIG.ADMIN_NAME} aja kak, nanti aku sampein biar dijawab pas dia senggang."
    - Jangan gunakan kata-kata formal. Gunakan bahasa chat WhatsApp (gue/lo, aku/kamu, atau kak/bang tergantung kenyamanan).

    LOGIC ACTION:
    - "CONTINUE": Gunakan selama percakapan masih berlangsung, user masih tanya-tanya, atau user baru saja memberikan info.
    - "STOP": HANYA gunakan jika user sudah memberikan salam penutup (Terima kasih, Oke sip, Bye, dsb).

    STYLE:
    - Singkat (1-2 kalimat).
    - Santai, pakai emoji sesekali agar akrab 😊.
    - Jangan repetitif.

    RESPONSE FORMAT (JSON ONLY):
    { "reply": "isi pesan", "action": "CONTINUE/STOP" }
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
    // Membersihkan markdown code block dulu sebelum regex
    let cleanText = rawText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    // Regex yang lebih aman.
    // Mencari kurung kurawal pertama '{' dan kurung kurawal terakhir '}'
    const firstBrace = cleanText.indexOf("{");
    const lastBrace = cleanText.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1) {
      // Ambil substring hanya dari { sampai }
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);

      const parsed = JSON.parse(cleanText);

      return {
        reply: parsed.reply || "Oke, pesan diterima.", // Default fallback text
        // Paksa normalize action (kadang AI jawab "Stop" atau "stop" huruf kecil)
        action:
          parsed.action && parsed.action.toUpperCase() === "STOP"
            ? "STOP"
            : "CONTINUE",
      };
    }

    // Fallback jika tidak ditemukan kurung kurawal
    throw new Error("No JSON brackets found");
  } catch (error) {
    console.warn(
      `${timeNow()} || [AI Parsing Warning] Output bukan JSON valid:`,
      rawText,
    );

    // Fallback: Anggap semua teks adalah reply
    return {
      reply: rawText
        .replace(/```json/gi, "")
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
  userName: string,
): Promise<AIResponseData> => {
  try {
    // 1. Siapkan Prompt
    const systemPrompt = getSystemPrompt(userName);

    // Batasi history agar context tidak jebol
    // Ambil maksimal 10 chat terakhir saja biar AI fokus ke konteks terbaru
    const recentHistory = history.slice(-10);

    // 2. Format Pesan untuk Ollama
    const messages = [
      { role: "system", content: systemPrompt },
      ...recentHistory.map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      })),
    ];

    // 3. Request ke Ollama
    const response = await ollama.chat({
      model: CONFIG.OLLAMA_MODEL,
      messages: messages as any,
      options: {
        temperature: 0.7, // 0.1 (Kaku/Robot) - 1.0 (Kreatif/Mabuk). Saran: 0.5
        top_p: 0.9, // Fokus jawaban. Saran: 0.9
        repeat_penalty: 1.0, // Mencegah kata berulang (misal: "saya saya adalah...")
        num_ctx: 4096,
      },
    });

    const rawContent = response.message.content;

    // 4. Parse & Return
    return parseAIOutput(rawContent);
  } catch (error) {
    console.error(`${timeNow()} || Ollama Error: `, error);
    // Return error safe object
    return {
      reply: "Maaf, Aflah sedang tidak di tempat. Nanti dikabari lagi ya.",
      action: "STOP",
    };
  }
};
