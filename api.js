// ============================================================
// api.js - Wrapper untuk panggil GAS Web App API
// ============================================================
const Api = {
  async get(action, params) {
    params = params || {};
    const qs = new URLSearchParams(Object.assign(
      { action: action, secret: CONFIG.API_SECRET }, params
    )).toString();
    const res = await fetch(CONFIG.API_URL + '?' + qs, { method: 'GET' });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Ralat API');
    return json.data;
  },

  // NOTA: content-type 'text/plain' sengaja digunakan supaya browser anggap ia
  // "simple request" dan TIDAK menghantar OPTIONS preflight (Apps Script Web App
  // tidak melayan preflight OPTIONS dengan baik). Code.gs baca guna e.postData.contents.
  async post(action, body) {
    body = body || {};
    body.action = action;
    body.secret = CONFIG.API_SECRET;
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (json.success === false) throw new Error(json.message || 'Ralat API');
    return json;
  }
};

// ============================================================
// Upload gambar terus ke Cloudinary (bypass GAS sepenuhnya)
// ============================================================
async function uploadKeCloudinary(fileOrBlob) {
  const url = 'https://api.cloudinary.com/v1_1/' + CONFIG.CLOUDINARY_CLOUD_NAME + '/image/upload';
  const formData = new FormData();
  formData.append('file', fileOrBlob);
  formData.append('upload_preset', CONFIG.CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', 'eRondaan-Malam');

  const res = await fetch(url, { method: 'POST', body: formData });
  const json = await res.json();
  if (!json.secure_url) throw new Error('Gagal muat naik gambar ke Cloudinary.');
  return json.secure_url;
}
