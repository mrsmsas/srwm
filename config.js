// ============================================================
// KONFIGURASI - TUKAR NILAI DI BAWAH IKUT SETUP AWAK
// ============================================================
const CONFIG = {
  // URL Web App GAS selepas Deploy > New deployment (Code.gs dalam folder gas-api/)
  API_URL: 'https://script.google.com/macros/s/MASUKKAN_DEPLOYMENT_ID/exec',

  // MESTI SAMA dengan API_SECRET dalam Code.gs. Tukar kepada rentetan rawak
  // sendiri (contoh: buka https://www.uuidgenerator.net/ dan salin satu UUID)
  API_SECRET: 'TUKAR_KEPADA_KUNCI_RAWAK_ANDA_SENDIRI',

  // Daftar percuma di https://cloudinary.com -> Dashboard -> Cloud Name
  CLOUDINARY_CLOUD_NAME: 'MASUKKAN_CLOUD_NAME',

  // Settings > Upload > Upload presets > Add upload preset -> Signing Mode: Unsigned
  CLOUDINARY_UPLOAD_PRESET: 'MASUKKAN_UPLOAD_PRESET',

  // Log masuk automatik luput selepas berapa jam tanpa aktiviti (keselamatan
  // untuk peranti dikongsi)
  SESSION_EXPIRY_HOURS: 12
};
