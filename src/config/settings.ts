/**
 * Konfigurasi Utama Bot.
 * Berisi pengaturan global yang mudah disesuaikan tanpa mengganggu logika kode.
 */
export const CONFIG = {
  /**
   * Durasi (dalam menit) sebelum sesi percakapan dianggap berakhir.
   * Jika user diam lebih lama dari ini, sapaan "Selamat Pagi/Siang" akan muncul lagi.
   */
  TIMEOUT_MINUTES: 10,

  /**
   * Nama Admin/Pemilik Bot.
   * Digunakan dalam prompt AI untuk memberitahu user siapa pemilik nomor ini.
   */
  ADMIN_NAME: "Aflah",

  /**
   * Daftar filter ID WhatsApp yang akan diabaikan total oleh bot.
   * - `'status'`: Mengabaikan update status/story orang lain (karena dianggap pesan masuk oleh library).
   * - `'g.us'`: Mengabaikan pesan dari Grup (bot hanya untuk Private Chat).
   */
  IGNORE_IDS: ["status", "g.us"],

  /**
   * Model AI Ollama yang digunakan.
   * Pastikan model ini sudah di-pull di terminal (`ollama pull qwen2.5:7b`).
   */
  OLLAMA_MODEL: "qwen3.5:397b-cloud",

  /**
   * ID WhatsApp Admin (format: `nomor@c.us`).
   * Digunakan bot untuk mengirim laporan saat restart atau error.
   */
  BOT_NUMBER_ID: "6282333044295@c.us",
};

/**
 * Daftar kata yang harus dihapus/diganti saat membersihkan nama user.
 * Key = Kata yang dicari (case insensitive), Value = Kata pengganti (biasanya string kosong).
 * * Digunakan di `utils/textUtils.ts`.
 * Contoh: User bernama "Aflah Konsul" akan dibersihkan menjadi "Aflah".
 */
export const NAME_REPLACEMENTS: Record<string, string> = {
  konsul: "",
  si: "",
  "98": "",
  dagu: "",
};

/**
 * Daftar kata kunci untuk memicu "Hard Stop".
 * Jika pesan user mengandung salah satu kata ini, bot akan dipaksa berhenti (Mute),
 * terlepas dari apapun keputusan AI.
 * * Berguna sebagai jaring pengaman jika AI gagal paham bahwa user ingin pamit.
 */
export const STOP_KEYWORDS = [
  "udahan",
  "udah dulu",
  "cukup",
  "segitu aja",
  "bye",
  "makasih min",
  "makasih ya",
  "thanks",
  "pamit",
  "met bobo",
  "stop",
  "berhenti",
  "sampun",
];

/**
 * Konversi TIMEOUT_MINUTES ke milidetik.
 * Konstanta ini yang sebenarnya dipakai oleh logic `setTimeout` atau perbandingan waktu.
 * (Jangan ubah ini manual, ubah `TIMEOUT_MINUTES` saja di atas).
 */
export const TIMEOUT_MS = CONFIG.TIMEOUT_MINUTES * 60 * 1000;
