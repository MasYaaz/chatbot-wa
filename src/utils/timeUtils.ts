/**
 * Menghasilkan sapaan waktu berdasarkan jam sistem saat ini (Server Time).
 *
 * Logika pembagian waktu:
 * - **Pagi**: 00:00 - 10:59
 * - **Siang**: 11:00 - 14:59
 * - **Sore**: 15:00 - 17:59
 * - **Malam**: 18:00 - 23:59
 *
 * @returns {string} String sapaan ("Pagi", "Siang", "Sore", atau "Malam").
 */
export const getTimeGreeting = (): string => {
  const jam = new Date().getHours();
  if (jam >= 0 && jam < 11) return "Pagi";
  if (jam >= 11 && jam < 15) return "Siang";
  if (jam >= 15 && jam < 18) return "Sore";
  return "Malam";
};
