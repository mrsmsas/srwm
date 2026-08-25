// ============================================================
// app.js - Logik utama eRondaan Malam
// ============================================================
let currentUser = null;
let currentGPS = { lat: '', long: '', alamat: '' };
let gpsEnabled = true;
let photoFiles = [];   // File objects (belum upload)
let photoPreviews = []; // data URL untuk preview
let kecemasanAktif = false;
let allLogsCache = [];

/** ================= INIT ================= **/
window.onload = function () {
  const savedTheme = sessionStorage.getItem('erondaan_theme') || 'dark';
  document.body.setAttribute('data-theme', savedTheme);

  if (semakSesiLuput()) {
    // Sesi dah luput - kekal di skrin login
  } else {
    const savedUser = sessionStorage.getItem('erondaan_user');
    if (savedUser) {
      currentUser = JSON.parse(savedUser);
      showApp();
    }
  }
  updateClock();
  setInterval(updateClock, 1000 * 30);
  setInterval(semakSesiLuput, 1000 * 60); // semak setiap minit
  initSegmentedSesi();

  setTimeout(function () {
    const splash = document.getElementById('splash');
    if (splash) splash.classList.add('hide');
  }, 550);
};

function initSegmentedSesi() {
  const el = document.getElementById('segmentedSesi');
  if (!el) return;
  el.querySelectorAll('.segmented-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      window._sesiDipilihManual = true;
      pilihSesi(parseInt(btn.dataset.idx));
    });
  });
}

function pilihSesi(idx) {
  const el = document.getElementById('segmentedSesi');
  el.querySelectorAll('.segmented-item').forEach(function (btn, i) {
    btn.classList.toggle('active', i === idx);
  });
  document.getElementById('fSesi').selectedIndex = idx;
  document.getElementById('sesiSemasa').textContent = 'Sesi ' + (idx + 1);
  const active = el.querySelector('.segmented-item.active');
  if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}
/** Keselamatan: log keluar automatik selepas tempoh tidak aktif (peranti dikongsi) */
function semakSesiLuput() {
  const masaLogin = sessionStorage.getItem('erondaan_login_time');
  if (!masaLogin) return false;
  const jamBerlalu = (Date.now() - Number(masaLogin)) / (1000 * 60 * 60);
  const hadJam = (typeof CONFIG !== 'undefined' && CONFIG.SESSION_EXPIRY_HOURS) || 12;
  if (jamBerlalu >= hadJam) {
    sessionStorage.removeItem('erondaan_user');
    sessionStorage.removeItem('erondaan_login_time');
    if (currentUser) {
      currentUser = null;
      document.getElementById('screen-app').style.display = 'none';
      document.getElementById('screen-login').style.display = 'flex';
      showToast('Sesi tamat tempoh. Sila log masuk semula.');
    }
    return true;
  }
  return false;
}

function toggleTheme() {
  const cur = document.body.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', next);
  sessionStorage.setItem('erondaan_theme', next);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 2200);
}

/** ================= LOGIN / LOGOUT ================= **/
async function doLogin() {
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginErr');
  const btn = document.getElementById('btnLogin');
  errEl.textContent = '';

  if (!password) {
    errEl.textContent = 'Sila isi Kata Laluan.';
    return;
  }
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div>';

  try {
    const res = await Api.post('login', { password: password });
    if (res.success) {
      currentUser = res.user;
      sessionStorage.setItem('erondaan_user', JSON.stringify(currentUser));
      sessionStorage.setItem('erondaan_login_time', String(Date.now()));
      showApp();
    } else {
      errEl.textContent = res.message;
    }
  } catch (err) {
    errEl.textContent = 'Ralat sistem: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Log Masuk';
  }
}

function doLogout() {
  sessionStorage.removeItem('erondaan_user');
  currentUser = null;
  document.getElementById('screen-app').style.display = 'none';
  document.getElementById('screen-login').style.display = 'flex';
}

function showApp() {
  document.getElementById('screen-login').style.display = 'none';
  document.getElementById('screen-app').style.display = 'block';
  document.getElementById('headerUserInfo').textContent = currentUser.nama + ' • ' + currentUser.role;
  if (currentUser.role === 'Admin') {
    document.getElementById('nav-admin').style.display = 'flex';
  }
  initGPS();
  loadTetapan();
  document.getElementById('fMasaMula').value = new Date().toTimeString().slice(0, 5);
  autoDetectSesi();
}

/** ================= CLOCK / SESI ================= **/
function updateClock() {
  const now = new Date();
  const jamEl = document.getElementById('jamSekarang');
  if (jamEl) jamEl.textContent = now.toTimeString().slice(0, 5);
  const tarikhEl = document.getElementById('tarikhSekarang');
  if (tarikhEl) tarikhEl.textContent = now.toLocaleDateString('ms-MY', { day: '2-digit', month: 'long', year: 'numeric' });
  autoDetectSesi();
  updateNightArc(now);
}

function autoDetectSesi() {
  const h = new Date().getHours();
  if (!document.getElementById('fSesi')) return;
  let idx = 0;
  if (h >= 22 || h < 0) idx = 0;
  else if (h >= 0 && h < 2) idx = 1;
  else if (h >= 2 && h < 4) idx = 2;
  else if (h >= 4 && h < 6) idx = 3;
  else if (h >= 6 && h < 8) idx = 4;
  // Hanya auto-set jika pengguna belum sentuh segmented control secara manual
  if (!window._sesiDipilihManual) pilihSesi(idx);
}

/** Signature element: arka waktu malam 10PM -> 7AM dengan penanda masa semasa */
function updateNightArc(now) {
  const fill = document.getElementById('nightArcFill');
  const marker = document.getElementById('nightArcMarker');
  if (!fill || !marker) return;

  const h = now.getHours() + now.getMinutes() / 60;
  // Jam malam: 22:00 -> 07:00 (9 jam). Kira offset supaya 22:00=0, 07:00=9
  let jamOffset = h - 22;
  if (jamOffset < 0) jamOffset += 24;
  let progress = jamOffset / 9; // 0..1
  progress = Math.max(0, Math.min(1, progress));

  // Laluan quadratic Bezier: M 14 30 Q 160 6 306 30
  const t = progress;
  const x = (1 - t) * (1 - t) * 14 + 2 * (1 - t) * t * 160 + t * t * 306;
  const y = (1 - t) * (1 - t) * 30 + 2 * (1 - t) * t * 6 + t * t * 30;

  // Anggaran panjang laluan penuh ~330, guna dash untuk gambarkan progress
  const panjangAnggaran = 330;
  fill.setAttribute('stroke-dasharray', (panjangAnggaran * progress) + ' ' + panjangAnggaran);
  marker.setAttribute('cx', x.toFixed(1));
  marker.setAttribute('cy', y.toFixed(1));
}

/** ================= GPS ================= **/
async function loadTetapan() {
  try {
    const t = await Api.get('getTetapan');
    gpsEnabled = (t.GPS_TOGGLE || 'ON') === 'ON';
    document.getElementById('toggleGPS').checked = gpsEnabled;
    const chip = document.getElementById('gpsChip');
    if (!gpsEnabled) {
      chip.textContent = '📍 GPS: Dimatikan oleh Admin';
      chip.classList.remove('on');
    }
  } catch (err) {
    console.error(err);
  }
}

function initGPS() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(function (pos) {
    currentGPS.lat = pos.coords.latitude;
    currentGPS.long = pos.coords.longitude;
    const chip = document.getElementById('gpsChip');
    if (chip) {
      chip.textContent = '📍 GPS: ' + currentGPS.lat.toFixed(4) + ', ' + currentGPS.long.toFixed(4);
      chip.classList.add('on');
    }
  }, function () {
    const chip = document.getElementById('gpsChip');
    if (chip) chip.textContent = '📍 GPS: Tidak dapat dikesan';
  }, { enableHighAccuracy: true, timeout: 8000 });
}

async function updateGPSToggle() {
  const val = document.getElementById('toggleGPS').checked ? 'ON' : 'OFF';
  try {
    await Api.post('setTetapan', { kunci: 'GPS_TOGGLE', nilai: val });
    showToast('Tetapan GPS dikemaskini: ' + val);
  } catch (err) {
    showToast('Ralat: ' + err.message);
  }
}

/** ================= KECEMASAN ================= **/
function toggleKecemasan() {
  kecemasanAktif = !kecemasanAktif;
  const btn = document.getElementById('btnKecemasan');
  if (kecemasanAktif) {
    btn.classList.add('active');
    btn.querySelector('span').textContent = 'LAPORAN KECEMASAN AKTIF - Tekan untuk batal';
  } else {
    btn.classList.remove('active');
    btn.querySelector('span').textContent = 'Tandakan Sebagai LAPORAN KECEMASAN';
  }
}

/** ================= FOTO (terus ke Cloudinary) ================= **/
function handlePhotoSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  compressAndStore(file);
  event.target.value = '';
}

function compressAndStore(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const maxW = 1000;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function (blob) {
        photoFiles.push(blob);
        photoPreviews.push(canvas.toDataURL('image/jpeg', 0.6));
        renderPhotos();
      }, 'image/jpeg', 0.7);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function renderPhotos() {
  const container = document.getElementById('photoContainer');
  const addBtn = container.querySelector('.photo-add');
  container.innerHTML = '';
  photoPreviews.forEach(function (p, idx) {
    const wrap = document.createElement('div');
    wrap.className = 'photo-thumb-wrap';
    wrap.innerHTML = '<img class="photo-thumb" src="' + p + '">' +
      '<button class="photo-remove" onclick="removePhoto(' + idx + ')">×</button>';
    container.appendChild(wrap);
  });
  container.appendChild(addBtn);
}

function removePhoto(idx) {
  photoFiles.splice(idx, 1);
  photoPreviews.splice(idx, 1);
  renderPhotos();
}

/** ================= HANTAR BORANG ================= **/
async function hantarBorang() {
  const btn = document.getElementById('btnHantar');
  const btnText = document.getElementById('btnHantarText');
  btn.disabled = true;

  try {
    // 1. Upload semua gambar terus ke Cloudinary dahulu
    let gambarURLs = [];
    if (photoFiles.length > 0) {
      btnText.innerHTML = '<div class="spinner"></div><span style="margin-left:8px;">Memuat naik gambar...</span>';
      gambarURLs = await Promise.all(photoFiles.map(uploadKeCloudinary));
    }

    // 2. Hantar data (termasuk URL gambar sahaja) ke Sheets melalui GAS API
    btnText.innerHTML = '<div class="spinner"></div><span style="margin-left:8px;">Menghantar log...</span>';

    const payload = {
      noGaji: currentUser.noGaji,
      namaWarden: currentUser.nama,
      tarikh: new Date().toISOString().slice(0, 10),
      masaMula: document.getElementById('fMasaMula').value,
      masaTamat: document.getElementById('fMasaTamat').value || new Date().toTimeString().slice(0, 5),
      sesiRondaan: document.getElementById('fSesi').value,
      minumMalam: document.getElementById('c_minum').checked,
      pagarKunci: document.getElementById('c_pagar').checked,
      lampuBilik: document.getElementById('c_lampuBilik').checked,
      lampuKoridor: document.getElementById('c_lampuKoridor').checked,
      dalamDorm: document.getElementById('c_dorm').checked,
      tiadaBising: document.getElementById('c_bising').checked,
      bersediaTidur: document.getElementById('c_tidur').checked,
      tiadaBuli: document.getElementById('c_buli').checked,
      semakKebakaran: document.getElementById('c_kebakaran').checked,
      tandasBersih: document.getElementById('c_tandas').checked,
      bilPelajarSakit: document.getElementById('fBilSakit').value,
      aduan: document.getElementById('fAduan').value,
      catatan: document.getElementById('fCatatan').value,
      gambarURLs: gambarURLs,
      gpsLat: gpsEnabled ? currentGPS.lat : '',
      gpsLong: gpsEnabled ? currentGPS.long : '',
      alamat: gpsEnabled ? currentGPS.alamat : '',
      kecemasan: kecemasanAktif
    };

    await Api.post('hantarLogRondaan', { payload: payload });
    showToast('✅ Log rondaan berjaya dihantar!');
    resetForm();
  } catch (err) {
    showToast('❌ Ralat: ' + err.message);
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Hantar Log Rondaan';
  }
}

function resetForm() {
  photoFiles = [];
  photoPreviews = [];
  renderPhotos();
  document.getElementById('fAduan').value = '';
  document.getElementById('fCatatan').value = '';
  document.getElementById('fBilSakit').value = 0;
  document.getElementById('fMasaMula').value = new Date().toTimeString().slice(0, 5);
  document.getElementById('fMasaTamat').value = '';
  kecemasanAktif = false;
  window._sesiDipilihManual = false;
  document.getElementById('btnKecemasan').classList.remove('active');
  document.getElementById('btnKecemasan').querySelector('span').textContent = 'Tandakan Sebagai LAPORAN KECEMASAN';
}

/** ================= NAV / TABS ================= **/
function switchTab(tab) {
  ['borang', 'sejarah', 'admin'].forEach(function (t) {
    document.getElementById('tab-' + t).style.display = (t === tab) ? 'block' : 'none';
    const navEl = document.getElementById('nav-' + t);
    if (navEl) navEl.classList.toggle('active', t === tab);
  });
  if (tab === 'sejarah') loadSejarah();
  if (tab === 'admin') {
    loadAdminDashboard();
    loadFilterNamaOptions();
  }
}

function switchAdminTab(tab) {
  ['dashboard', 'pengguna', 'tetapan'].forEach(function (t) {
    document.getElementById('admin-' + t).style.display = (t === tab) ? 'block' : 'none';
    document.getElementById('atab-' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'pengguna') loadUserList();
}

/** ================= SEJARAH (WARDEN) ================= **/
async function loadSejarah() {
  document.getElementById('sejarahList').innerHTML = skeletonHTML(3);
  try {
    const logs = await Api.get('senaraiLog', { noGaji: currentUser.noGaji, limit: 30 });
    renderLogList(logs, 'sejarahList');
  } catch (err) {
    document.getElementById('sejarahList').innerHTML = '<div class="empty-state">Ralat: ' + err.message + '</div>';
  }
}

function skeletonHTML(count) {
  let html = '';
  for (let i = 0; i < count; i++) html += '<div class="skeleton skeleton-row"></div>';
  return html;
}

function renderLogList(logs, targetId) {
  const el = document.getElementById(targetId);
  if (!logs || logs.length === 0) {
    el.innerHTML = '<div class="empty-state">Tiada rekod lagi.</div>';
    return;
  }
  const bolehKlik = targetId === 'adminLogList';
  el.innerHTML = logs.map(function (l, idx) {
    const isEmergency = l.Kecemasan === 'YA - SEGERA';
    const ada_gambar = l.GambarURL && String(l.GambarURL).trim().length > 0;
    const namaHTML = bolehKlik
      ? '<span class="log-item-name" style="color:var(--primary);text-decoration:underline;cursor:pointer;" onclick="openLogDetail(' + targetId + 'Cache[' + idx + '])">' + l.NamaWarden + ' →</span>'
      : '<span class="log-item-name">' + l.NamaWarden + '</span>';
    return '<div class="log-item">' +
      '<div class="log-item-top">' +
      namaHTML +
      '<span class="badge ' + (isEmergency ? 'badge-emergency' : 'badge-ok') + '">' +
      (isEmergency ? '🚨 Kecemasan' : 'Selesai') + '</span>' +
      '</div>' +
      '<div class="log-item-date">' + l.Tarikh + ' • ' + l.SesiRondaan + ' • ' + l.MasaMula +
      (ada_gambar ? ' • 📷 ' + String(l.GambarURL).split(',').length + ' gambar' : ' • 📷 tiada gambar') + '</div>' +
      (l.Aduan ? '<div style="font-size:12.5px;margin-top:6px;">💬 ' + l.Aduan + '</div>' : '') +
      '</div>';
  }).join('');
  // simpan rujukan data penuh untuk dipetik semula bila diklik (elak masalah escape watak dalam onclick)
  window[targetId + 'Cache'] = logs;
}

/** ================= MODAL: PREVIEW LAPORAN BERGAMBAR ================= **/
let logDetailSemasa = null; // simpan log yang sedang dibuka, untuk cetak PDF individu

function openLogDetail(l) {
  if (!l) return;
  logDetailSemasa = l;
  const isEmergency = l.Kecemasan === 'YA - SEGERA';
  const semakan = [
    ['🥛 Minum Malam', l.MinumMalam], ['🔒 Pagar Dikunci', l.PagarKunci],
    ['💡 Lampu Bilik', l.LampuBilik], ['🏮 Lampu Koridor', l.LampuKoridor],
    ['🛌 Dalam Dorm', l.DalamDorm], ['🔇 Tiada Bising', l.TiadaBising],
    ['😴 Bersedia Tidur', l.BersediaTidur], ['🤝 Tiada Buli', l.TiadaBuli],
    ['🧯 Semak Kebakaran', l.SemakKebakaran], ['🚿 Tandas Bersih', l.TandasBersih]
  ];
  const semakanHTML = semakan.map(function (s) {
    const ok = s[1] === 'Ya';
    return '<div class="checklist-item" style="padding:9px 2px;">' +
      '<span class="checklist-label" style="font-size:13px;">' + s[0] + '</span>' +
      '<span class="badge ' + (ok ? 'badge-ok' : 'badge-emergency') + '">' + (s[1] || '-') + '</span>' +
      '</div>';
  }).join('');

  const urls = (l.GambarURL || '').split(',').map(function (u) { return u.trim(); }).filter(Boolean);
  const gambarHTML = urls.length > 0
    ? '<div class="photo-upload" style="margin-top:8px;">' +
      urls.map(function (u) {
        return '<a href="' + u + '" target="_blank" rel="noopener"><img class="photo-thumb" style="width:88px;height:88px;" src="' + u + '"></a>';
      }).join('') + '</div>'
    : '<div class="empty-state" style="padding:16px;">Tiada gambar dimuat naik untuk log ini.</div>';

  const content = document.getElementById('logDetailContent');
  content.innerHTML =
    '<div class="card-title">' + l.NamaWarden + (isEmergency ? ' <span class="badge badge-emergency" style="margin-left:6px;">🚨 Kecemasan</span>' : '') + '</div>' +
    '<div style="font-size:12.5px;color:var(--text-soft);margin-bottom:14px;">' +
    l.Tarikh + ' • ' + l.SesiRondaan + ' • ' + l.MasaMula + ' - ' + (l.MasaTamat || '-') + '</div>' +
    (l.BilPelajarSakit ? '<div style="font-size:13px;margin-bottom:8px;">🩺 Pelajar sakit/tidak sihat: <b>' + l.BilPelajarSakit + '</b></div>' : '') +
    (l.Aduan ? '<div style="font-size:13px;margin-bottom:8px;background:var(--danger-bg);color:var(--danger);padding:10px 12px;border-radius:10px;">⚠️ ' + l.Aduan + '</div>' : '') +
    (l.Catatan ? '<div style="font-size:13px;margin-bottom:10px;">📝 ' + l.Catatan + '</div>' : '') +
    '<div class="card-title" style="font-size:13px;margin-top:14px;">✅ Log Pemeriksaan</div>' +
    semakanHTML +
    '<div class="card-title" style="font-size:13px;margin-top:16px;">📷 Gambar Bukti</div>' +
    gambarHTML;

  document.getElementById('logDetailModal').style.display = 'flex';
}

function closeLogDetail() {
  document.getElementById('logDetailModal').style.display = 'none';
  logDetailSemasa = null;
}
function closeLogDetailOutside(e) {
  if (e.target.id === 'logDetailModal') closeLogDetail();
}

/** ================= ADMIN: DASHBOARD ================= **/
/** Isi dropdown penapis nama warden - guna 'senaraiWarden' (action sedia ada,
 *  elak perlukan redeploy Code.gs untuk action baharu) */
async function loadFilterNamaOptions() {
  const sel = document.getElementById('filterNama');
  if (!sel || sel.dataset.loaded === 'true') return; // elak fetch berulang
  try {
    const wardenList = await Api.get('senaraiWarden');
    const namaUnik = [];
    wardenList.forEach(function (w) {
      if (w.NamaWarden && namaUnik.indexOf(w.NamaWarden) === -1) namaUnik.push(w.NamaWarden);
    });
    namaUnik.sort();
    namaUnik.forEach(function (nama) {
      const opt = document.createElement('option');
      opt.value = nama;
      opt.textContent = nama;
      sel.appendChild(opt);
    });
    sel.dataset.loaded = 'true';
  } catch (err) {
    console.error('Gagal muat senarai nama warden:', err.message);
    showToast('Gagal muat senarai warden untuk penapis: ' + err.message);
  }
}

async function loadAdminDashboard() {
  document.getElementById('adminLogList').innerHTML = skeletonHTML(4);
  try {
    const filter = { limit: 200 };
    const namaEl = document.getElementById('filterNama');
    const tarikhEl = document.getElementById('filterTarikh');
    const bulanEl = document.getElementById('filterBulan');
    const nama = namaEl ? namaEl.value.trim() : '';
    const tarikh = tarikhEl ? tarikhEl.value : '';
    const bulan = bulanEl ? bulanEl.value : '';
    if (nama) filter.nama = nama;
    if (tarikh) filter.tarikh = tarikh;
    if (bulan) filter.bulan = bulan;

    const logs = await Api.get('senaraiLog', filter);
    allLogsCache = logs;
    renderLogList(logs, 'adminLogList');
  } catch (err) {
    document.getElementById('adminLogList').innerHTML = '<div class="empty-state">Ralat: ' + err.message + '</div>';
  }
}

function resetFilterLog() {
  const namaEl = document.getElementById('filterNama');
  const tarikhEl = document.getElementById('filterTarikh');
  const bulanEl = document.getElementById('filterBulan');
  if (namaEl) namaEl.value = '';
  if (tarikhEl) tarikhEl.value = '';
  if (bulanEl) bulanEl.value = '';
  loadAdminDashboard();
}

/** ================= ADMIN: PENGGUNA ================= **/
async function loadUserList() {
  document.getElementById('userList').innerHTML = skeletonHTML(3);
  try {
    const users = await Api.get('senaraiWarden');
    const el = document.getElementById('userList');
    if (!users || users.length === 0) {
      el.innerHTML = '<div class="empty-state">Tiada pengguna.</div>';
      return;
    }
    el.innerHTML = users.map(function (u) {
      return '<div class="log-item">' +
        '<div class="log-item-top">' +
        '<span class="log-item-name">' + u.NamaWarden + '</span>' +
        '<span class="badge badge-ok">' + u.Role + '</span>' +
        '</div>' +
        '<div class="log-item-date">No. Gaji: ' + u.NoGaji + ' • ' + u.Status + '</div>' +
        '<div style="display:flex;gap:8px;margin-top:8px;">' +
        '<button class="btn btn-outline btn-sm" onclick=\'editUser(' + JSON.stringify(u) + ')\'>Edit</button>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteUser(' + u.rowIndex + ')">Padam</button>' +
        '</div></div>';
    }).join('');
  } catch (err) {
    document.getElementById('userList').innerHTML = '<div class="empty-state">Ralat: ' + err.message + '</div>';
  }
}

function openUserModal() {
  document.getElementById('userModalTitle').textContent = 'Tambah Pengguna';
  document.getElementById('uRowIndex').value = '';
  document.getElementById('uNama').value = '';
  document.getElementById('uNoGaji').value = '';
  document.getElementById('uTelefon').value = '';
  document.getElementById('uPassword').value = '';
  document.getElementById('uRole').value = 'Warden';
  document.getElementById('uStatus').value = 'Aktif';
  document.getElementById('userModal').style.display = 'flex';
}

function editUser(u) {
  document.getElementById('userModalTitle').textContent = 'Edit Pengguna';
  document.getElementById('uRowIndex').value = u.rowIndex;
  document.getElementById('uNama').value = u.NamaWarden;
  document.getElementById('uNoGaji').value = u.NoGaji;
  document.getElementById('uTelefon').value = u.NoTelefon;
  document.getElementById('uPassword').value = u.Password;
  document.getElementById('uRole').value = u.Role;
  document.getElementById('uStatus').value = u.Status;
  document.getElementById('userModal').style.display = 'flex';
}

function closeUserModal() {
  document.getElementById('userModal').style.display = 'none';
}
function closeUserModalOutside(e) {
  if (e.target.id === 'userModal') closeUserModal();
}

async function saveUser() {
  const data = {
    nama: document.getElementById('uNama').value,
    noGaji: document.getElementById('uNoGaji').value,
    telefon: document.getElementById('uTelefon').value,
    password: document.getElementById('uPassword').value,
    role: document.getElementById('uRole').value,
    status: document.getElementById('uStatus').value
  };
  const rowIndex = document.getElementById('uRowIndex').value;
  if (!data.nama || !data.noGaji || !data.password) {
    showToast('Sila lengkapkan maklumat wajib.');
    return;
  }
  try {
    if (rowIndex) {
      await Api.post('kemaskiniWarden', { rowIndex: parseInt(rowIndex), data: data });
    } else {
      await Api.post('tambahWarden', { data: data });
    }
    closeUserModal();
    showToast('✅ Pengguna disimpan.');
    loadUserList();
  } catch (err) {
    showToast('❌ Ralat: ' + err.message);
  }
}

async function deleteUser(rowIndex) {
  if (!confirm('Padam pengguna ini?')) return;
  try {
    await Api.post('padamWarden', { rowIndex: rowIndex });
    showToast('Pengguna dipadam.');
    loadUserList();
  } catch (err) {
    showToast('❌ Ralat: ' + err.message);
  }
}

/** ================= CETAK LAPORAN PDF - REKA BENTUK PROFESIONAL ================= **/
/** Tukar URL gambar (Cloudinary) kepada data URL supaya boleh disisip dalam PDF */
async function urlKeDataURL(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Palet warna laporan (biru & putih)
const PDF_BIRU = [26, 77, 158];
const PDF_BIRU_MUDA = [91, 155, 213];
const PDF_BIRU_GELAP_TEKS = [13, 42, 82];
const PDF_HIJAU = [15, 122, 79];
const PDF_HIJAU_BG = [220, 245, 232];
const PDF_MERAH = [161, 38, 38];
const PDF_MERAH_BG = [253, 226, 226];
const PDF_KELABU = [119, 119, 119];
const PDF_KELABU_TERANG = [216, 216, 216];

const MARGIN_X = 15;
const LEBAR = 180; // lebar kandungan (A4 = 210mm, margin 15 setiap sisi)

/** Lukis bar tajuk seksyen (biru penuh, teks putih) - pulangkan y selepas bar */
function lukisTajukSeksyen(doc, huruf, tajuk, y) {
  doc.setFillColor.apply(doc, PDF_BIRU);
  doc.rect(MARGIN_X, y, LEBAR, 7, 'F');
  doc.setFillColor.apply(doc, PDF_BIRU_MUDA);
  doc.circle(MARGIN_X + 4.5, y + 3.5, 2.6, 'F');
  doc.setTextColor.apply(doc, PDF_BIRU_GELAP_TEKS);
  doc.setFontSize(8.5);
  doc.setFont(undefined, 'bold');
  doc.text(huruf, MARGIN_X + 4.5, y + 4.6, { align: 'center' });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10.5);
  doc.text(tajuk, MARGIN_X + 10, y + 4.9);
  doc.setTextColor(0, 0, 0);
  return y + 7;
}

/** Lukis sempadan badan seksyen (garis sahaja, tiada isi) */
function lukisSempadanBadan(doc, yMula, tinggi) {
  doc.setDrawColor.apply(doc, PDF_KELABU_TERANG);
  doc.rect(MARGIN_X, yMula, LEBAR, tinggi);
}

function lukisLencanaStatus(doc, teks, x, y) {
  const ok = teks === 'Ya';
  doc.setFillColor.apply(doc, ok ? PDF_HIJAU_BG : PDF_MERAH_BG);
  const w = ok ? 10 : 15;
  doc.roundedRect(x, y - 3.2, w, 4.4, 2, 2, 'F');
  doc.setTextColor.apply(doc, ok ? PDF_HIJAU : PDF_MERAH);
  doc.setFontSize(7.5);
  doc.setFont(undefined, 'bold');
  doc.text(String(teks || '-').toUpperCase(), x + w / 2, y - 0.2, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');
}

async function cetakLaporanIndividuPDF() {
  const l = logDetailSemasa;
  if (!l) {
    showToast('Tiada log dipilih untuk dicetak.');
    return;
  }
  showToast('Menjana PDF...');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 15;

  // ===== HEADER =====
  doc.setFillColor.apply(doc, PDF_BIRU);
  doc.rect(MARGIN_X, y, 12, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(6);
  doc.setFont(undefined, 'bold');
  doc.text('MRSM', MARGIN_X + 6, y + 5, { align: 'center' });
  doc.text('SAS', MARGIN_X + 6, y + 8.5, { align: 'center' });
  doc.setTextColor.apply(doc, PDF_BIRU);
  doc.setFontSize(11.5);
  doc.text('MAKTAB RENDAH SAINS MARA', MARGIN_X + 16, y + 5);
  doc.text('SULTAN AZLAN SHAH', MARGIN_X + 16, y + 10);

  doc.setTextColor.apply(doc, PDF_KELABU);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(7.5);
  const idRujukan = 'RD-' + l.Tarikh.replace(/-/g, '') + '-' + String(l.ID || '').slice(-4);
  doc.text('No. Rujukan: ' + idRujukan, MARGIN_X + LEBAR, y + 4, { align: 'right' });
  doc.text('Dijana: ' + new Date().toLocaleString('ms-MY'), MARGIN_X + LEBAR, y + 8, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  y += 15;
  doc.setDrawColor.apply(doc, PDF_BIRU);
  doc.setLineWidth(0.8);
  doc.line(MARGIN_X, y, MARGIN_X + LEBAR, y);
  doc.setLineWidth(0.2);
  y += 8;

  // ===== TAJUK LAPORAN =====
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('LAPORAN RONDAAN WARDEN MALAM', MARGIN_X + LEBAR / 2, y, { align: 'center' });
  y += 5;
  doc.setFontSize(8.5);
  doc.setFont(undefined, 'normal');
  doc.setTextColor.apply(doc, PDF_KELABU);
  doc.text('Sistem Pemeriksaan Warden Malam — Laporan Individu', MARGIN_X + LEBAR / 2, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 9;

  // ===== SEKSYEN A: MAKLUMAT AM =====
  y = lukisTajukSeksyen(doc, 'A', 'MAKLUMAT AM', y);
  const tinggiA = 20;
  lukisSempadanBadan(doc, y, tinggiA);
  const infoA = [
    ['Nama Warden', l.NamaWarden], ['No. Gaji', l.NoGaji],
    ['Tarikh', l.Tarikh], ['Sesi Rondaan', l.SesiRondaan],
    ['Masa Mula', l.MasaMula], ['Masa Tamat', l.MasaTamat || '-']
  ];
  doc.setFontSize(9);
  infoA.forEach(function (pair, idx) {
    const kolX = idx % 2 === 0 ? MARGIN_X + 4 : MARGIN_X + 94;
    const baris = Math.floor(idx / 2);
    const yy = y + 6 + baris * 6;
    doc.setTextColor.apply(doc, PDF_KELABU);
    doc.setFont(undefined, 'normal');
    doc.text(pair[0], kolX, yy);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'bold');
    doc.text(String(pair[1]), kolX + 82, yy, { align: 'right' });
  });
  y += tinggiA + 6;

  // ===== SEKSYEN B: LOG PEMERIKSAAN =====
  y = lukisTajukSeksyen(doc, 'B', 'LOG PEMERIKSAAN', y);
  const kategoriB = [
    ['KESELAMATAN FIZIKAL', [['Pagar Dikunci', l.PagarKunci], ['Lampu Bilik', l.LampuBilik], ['Lampu Koridor', l.LampuKoridor], ['Semakan Kebakaran', l.SemakKebakaran]]],
    ['KESEJAHTERAAN PELAJAR', [['Minum Malam Diberi', l.MinumMalam], ['Dalam Dorm', l.DalamDorm], ['Tiada Bising', l.TiadaBising], ['Bersedia Tidur', l.BersediaTidur], ['Tiada Insiden Buli', l.TiadaBuli]]],
    ['KEMUDAHAN', [['Tandas & Bilik Air Bersih', l.TandasBersih]]]
  ];
  const barisSetiapKategori = kategoriB.map(function (k) { return Math.ceil(k[1].length / 2); });
  const tinggiB = 4 + kategoriB.reduce(function (sum, k, i) { return sum + 6 + barisSetiapKategori[i] * 5.5 + 3; }, 0);
  lukisSempadanBadan(doc, y, tinggiB);
  let yB = y + 5;
  kategoriB.forEach(function (kategori) {
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor.apply(doc, PDF_BIRU);
    doc.text(kategori[0], MARGIN_X + 4, yB);
    doc.setDrawColor.apply(doc, PDF_BIRU_MUDA);
    doc.line(MARGIN_X + 4, yB + 1.2, MARGIN_X + LEBAR - 4, yB + 1.2);
    yB += 5.5;
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8.5);
    kategori[1].forEach(function (item, idx) {
      const kolX = idx % 2 === 0 ? MARGIN_X + 4 : MARGIN_X + 94;
      if (idx % 2 === 0 && idx > 0) yB += 5.5;
      doc.text(item[0], kolX, yB);
      lukisLencanaStatus(doc, item[1], kolX + 68, yB);
    });
    yB += 5.5 + 3;
  });
  y += tinggiB + 6;

  // Semak overflow sebelum Seksyen C
  if (y > 250) { doc.addPage(); y = 15; }

  // ===== SEKSYEN C: KESIHATAN & ADUAN =====
  const adaAduan = !!l.Aduan;
  const adaCatatan = !!l.Catatan;
  const aduanLines = adaAduan ? doc.splitTextToSize(String(l.Aduan), LEBAR - 16) : [];
  const catatanLines = adaCatatan ? doc.splitTextToSize(String(l.Catatan), LEBAR - 8) : [];
  const tinggiC = 8 + (adaAduan ? 6 + aduanLines.length * 4.2 + 3 : 0) + (adaCatatan ? 5 + catatanLines.length * 4.2 : 0);
  y = lukisTajukSeksyen(doc, 'C', 'KESIHATAN & ADUAN', y);
  lukisSempadanBadan(doc, y, tinggiC);
  let yC = y + 6;
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text('Bilangan Pelajar Sakit/Tidak Sihat: ', MARGIN_X + 4, yC);
  doc.setFont(undefined, 'bold');
  doc.text(String(l.BilPelajarSakit || 0) + ' orang', MARGIN_X + 68, yC);
  doc.setFont(undefined, 'normal');
  yC += 6;
  if (adaAduan) {
    doc.setFont(undefined, 'bold');
    doc.text('Aduan / Insiden:', MARGIN_X + 4, yC);
    yC += 4.5;
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor.apply(doc, PDF_KELABU_TERANG);
    doc.rect(MARGIN_X + 4, yC - 3.5, LEBAR - 8, aduanLines.length * 4.2 + 4, 'FD');
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8.5);
    doc.text(aduanLines, MARGIN_X + 7, yC + 1);
    yC += aduanLines.length * 4.2 + 6;
  }
  if (adaCatatan) {
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('Catatan:', MARGIN_X + 4, yC);
    yC += 4.5;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8.5);
    doc.text(catatanLines, MARGIN_X + 4, yC);
  }
  y += tinggiC + 6;

  // ===== SEKSYEN D: KECEMASAN (bersyarat) =====
  if (l.Kecemasan === 'YA - SEGERA') {
    if (y > 260) { doc.addPage(); y = 15; }
    doc.setFillColor.apply(doc, PDF_MERAH_BG);
    doc.setDrawColor.apply(doc, PDF_MERAH);
    doc.setLineWidth(0.6);
    doc.roundedRect(MARGIN_X, y, LEBAR, 12, 2, 2, 'FD');
    doc.setLineWidth(0.2);
    doc.setTextColor.apply(doc, PDF_MERAH);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(10.5);
    doc.text('⚠ LAPORAN INI DITANDAKAN SEBAGAI KECEMASAN', MARGIN_X + LEBAR / 2, y + 7.5, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    y += 12 + 6;
  }

  // ===== SEKSYEN E: GAMBAR BUKTI =====
  const urls = (l.GambarURL || '').split(',').map(function (u) { return u.trim(); }).filter(Boolean);
  if (urls.length > 0) {
    if (y > 240) { doc.addPage(); y = 15; }
    y = lukisTajukSeksyen(doc, 'E', 'GAMBAR BUKTI (' + urls.length + ')', y);
    y += 4;

    const gambarW = 85, gambarH = 62, gap = 10;
    let x = MARGIN_X;
    for (let i = 0; i < urls.length; i++) {
      if (y + gambarH + 6 > 280) { doc.addPage(); y = 15; x = MARGIN_X; }
      doc.setDrawColor.apply(doc, PDF_KELABU_TERANG);
      doc.rect(x, y, gambarW, gambarH);
      try {
        const dataUrl = await urlKeDataURL(urls[i]);
        doc.addImage(dataUrl, 'JPEG', x + 1, y + 1, gambarW - 2, gambarH - 2);
      } catch (e) {
        doc.setFontSize(8);
        doc.setTextColor.apply(doc, PDF_KELABU);
        doc.text('Gagal muat gambar', x + gambarW / 2, y + gambarH / 2, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      }
      doc.setFontSize(7.5);
      doc.setTextColor.apply(doc, PDF_KELABU);
      doc.text('Gambar ' + (i + 1), x + 2, y + gambarH + 4);
      doc.setTextColor(0, 0, 0);

      if (x === MARGIN_X) {
        x = MARGIN_X + gambarW + gap;
      } else {
        x = MARGIN_X;
        y += gambarH + 9;
      }
    }
    if (urls.length % 2 !== 0) y += gambarH + 9;
    y += 3;
  }

  // ===== SEKSYEN F: PENGESAHAN =====
  if (y > 235) { doc.addPage(); y = 15; }
  y = lukisTajukSeksyen(doc, 'F', 'PENGESAHAN', y);
  const tinggiF = 42;
  lukisSempadanBadan(doc, y, tinggiF);

  const kolKiriX = MARGIN_X + LEBAR * 0.27;
  const kolKananX = MARGIN_X + LEBAR * 0.73;

  doc.setFontSize(7.5);
  doc.setTextColor.apply(doc, PDF_KELABU);
  doc.text('DISEDIAKAN OLEH', kolKiriX, y + 8, { align: 'center' });
  doc.text('DISAHKAN OLEH', kolKananX, y + 8, { align: 'center' });

  // Ruang cop rasmi (bulatan bertitik)
  doc.setDrawColor.apply(doc, PDF_KELABU_TERANG);
  doc.setLineDashPattern([1, 1], 0);
  doc.circle(kolKananX, y + 20, 11);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(6.5);
  doc.text('RUANG COP RASMI', kolKananX, y + 19, { align: 'center' });
  doc.text('MRSM SAS', kolKananX, y + 22, { align: 'center' });

  // Garis tandatangan
  doc.setDrawColor(60, 60, 60);
  doc.line(kolKiriX - 30, y + 33, kolKiriX + 30, y + 33);
  doc.line(kolKananX - 30, y + 33, kolKananX + 30, y + 33);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text(l.NamaWarden, kolKiriX, y + 37.5, { align: 'center' });
  doc.setFont(undefined, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor.apply(doc, PDF_KELABU);
  doc.text('Warden Malam', kolKiriX, y + 41, { align: 'center' });

  doc.setFontSize(7.5);
  doc.text('Pengetua / Timbalan Pengetua', kolKananX, y + 37.5, { align: 'center' });
  doc.text('MRSM Sultan Azlan Shah', kolKananX, y + 40.5, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // ===== FOOTER (semua muka surat) =====
  const jumlahMukaSurat = doc.internal.getNumberOfPages();
  for (let p = 1; p <= jumlahMukaSurat; p++) {
    doc.setPage(p);
    const yFooter = 289;
    doc.setDrawColor.apply(doc, PDF_KELABU_TERANG);
    doc.line(MARGIN_X, yFooter - 3, MARGIN_X + LEBAR, yFooter - 3);
    doc.setFontSize(7);
    doc.setTextColor.apply(doc, PDF_KELABU);
    doc.text('Unit Pembangunan Pelajar & Unit ICT — Sistem eRondaan Malam', MARGIN_X, yFooter);
    doc.text('Muka Surat ' + p + ' daripada ' + jumlahMukaSurat, MARGIN_X + LEBAR, yFooter, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  const namaFail = 'Laporan_' + l.NamaWarden.replace(/[^a-zA-Z0-9]/g, '_') + '_' + l.Tarikh + '.pdf';
  doc.save(namaFail);
}
