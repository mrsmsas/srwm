// ============================================================
// KONFIGURASI - TUKAR NILAI DI BAWAH IKUT SETUP AWAK
// ============================================================
const CONFIG = {
  // URL Web App GAS selepas Deploy > New deployment (Code.gs dalam folder gas-api/)
  API_URL: 'https://script.google.com/macros/s/AKfycbwWWF5mApDPPYOZHWkiYctvDOFZVqmurEnoNZ-VJWedX95l3u1R2ScIwLDMIHZSvfh-/exec',

  // MESTI SAMA dengan API_SECRET dalam Code.gs. Tukar kepada rentetan rawak
  // sendiri (contoh: buka https://www.uuidgenerator.net/ dan salin satu UUID)
  API_SECRET: 'r0vnYpdipR-4k1mnjIEWeyVfrJo',

  // Daftar percuma di https://cloudinary.com -> Dashboard -> Cloud Name
  CLOUDINARY_CLOUD_NAME: 'a4qxpglv',

  // Settings > Upload > Upload presets > Add upload preset -> Signing Mode: Unsigned
  CLOUDINARY_UPLOAD_PRESET: 'eRondaanMalam',

  // Log masuk automatik luput selepas berapa jam tanpa aktiviti (keselamatan
  // untuk peranti dikongsi)
  SESSION_EXPIRY_HOURS: 12
};
