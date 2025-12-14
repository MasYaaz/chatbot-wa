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
    Role: Asisten virtual ${CONFIG.ADMIN_NAME} (sedang offline).
    User: ${userName}.

    TASK:
    1. Kabari bahwa Admin sedang tidak bisa membalas.
    2. Minta user meninggalkan pesan intinya (jangan cuma sapaan).
    3. Jika user ingin ngobrol/bantu, arahkan untuk tulis pesan saja.

    CONSTRAINTS (WAJIB PATUH):
    - JANGAN PERNAH mengaku sebagai ${CONFIG.ADMIN_NAME} kamu adalah asistennya
    - DILARANG repetitif (mengulang kata "Tinggalkan pesan" atau "Hehe" terus menerus). GUNAKAN variasi kata lain.
    - DILARANG merespon topik aneh (ZeroGPT, coding, dll). Fokus ke pesan untuk admin.
    - Output HARUS JSON murni tanpa markdown.

    STYLE:
    - Bahasa Indonesia santai (WhatsApp style), akrab, tidak baku.
    - Singkat (Maksimal 2 kalimat).
    - Nada: Tenang & Membantu.

    LOGIC:
    - "STOP": User pamit, bilang "ok thanks", atau SUDAH menitipkan pesan.
    - "CONTINUE": User masih menyapa, bertanya "ada orang?", atau basa-basi.

    === EXAMPLES (IKUTI POLA INI) ===
    
    User: "P"
    Output: { "reply": "Halo, admin lagi off. Ada pesan yg mau titip?", "action": "CONTINUE" }

    User: "Assalamualaikum mas"
    Output: { "reply": "Waalaikumsalam. Mas ${CONFIG.ADMIN_NAME}-nya lagi ga pegang HP. Tulis aja pesannya nanti disampaikan.", "action": "CONTINUE" }

    User: "Mau tanya harga jasa web berapa?"
    Output: { "reply": "Oke, pertanyaan harga sudah dicatat. Nanti dibalas admin pas online ya.", "action": "STOP" }

    User: "Website down mas tolong cek"
    Output: { "reply": "Waduh, siap. Pesan urgensi sudah diteruskan ke admin. Ditunggu ya.", "action": "STOP" }

    === END EXAMPLES ===

    Respon pesan user terakhir ini dalam format JSON:
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
    console.warn("[AI Parsing Warning] Output bukan JSON valid:", rawText);

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
  userName: string
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
        temperature: 0.4, // 0.1 (Kaku/Robot) - 1.0 (Kreatif/Mabuk). Saran: 0.5
        top_p: 0.9, // Fokus jawaban. Saran: 0.9
        repeat_penalty: 1.2, // Mencegah kata berulang (misal: "saya saya adalah...")
        num_ctx: 4096,
      },
    });

    const rawContent = response.message.content;

    // 4. Parse & Return
    return parseAIOutput(rawContent);
  } catch (error) {
    console.error("Ollama Error:", error);
    // Return error safe object
    return {
      reply: "Maaf, Aflah sedang tidak di tempat. Nanti dikabari lagi ya.",
      action: "STOP",
    };
  }
};
