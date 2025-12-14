# Chatbot Whatsapp Integrated with AI

## Deskripsi

Project ini adalah implementasi chatbot untuk WhatsApp menggunakan teknologi TypeScript dan bun. Project ini dibuat dengan tujuan untuk memudahkan pengembangan dan pemeliharaan chatbot WhatsApp.Chatbot ini diintegrasikan dengan Qwen 2.5 7b parameter untuk fungsi obrolannya.

## Struktur Proyek

Proyek ini terdiri dari beberapa bagian utama:

- **src**: Folder yang berisi kode sumber utama project.
  - **index.ts**: File utama proyek, di mana aplikasi dimulai.
  - **config/**: Folder untuk konfigurasi aplikasi.
    - **settings.ts**: File untuk mengatur setting aplikasi.
  - **handlers/**: Folder untuk handler pesan.
    - **messageHandler.ts**: File untuk menangani pesan masuk.
    - **messageProcessor.ts**: File untuk memproses pesan.
  - **services/**: Folder untuk layanan tambahan.
    - **aiServices.ts**: File untuk konfigurasi AI seperti System Prompt.
  - **state/**: Folder untuk state aplikasi.
    - **store.ts**: File untuk menyimpan dan mengambil data state.
  - **types/**: Folder untuk tipe-tipe yang digunakan dalam project.
    - **index.ts**: File utama folder types.
  - **utils/**: Folder untuk utilitas umum.
    - **textUtils.ts**: File untuk utilitas teks.
    - **timeUtils.ts**: File untuk utilitas waktu.
    - **validators.ts**: File untuk validasi input yang diterima chatbot.

## Instalasi

Untuk menginstal semua dependensi yang diperlukan, jalankan perintah berikut di terminal:

```bash
bun install
```

## Menjalankan Aplikasi

Setelah semua dependensi terinstal, Anda dapat menjalankan aplikasi dengan perintah berikut:

```bash
bun run index.ts
```

Aplikasi ini akan berjalan dan merespon pesan masuk di WhatsApp.

Dokumentasi ini dibuat untuk memberikan gambaran umum tentang proyek chatbot-wa. Untuk informasi lebih lanjut tentang penggunaan dan pengembangan, silakan merujuk pada kode sumber dan komentar yang ada dalam proyek.
