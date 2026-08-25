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

/** ================= CETAK LAPORAN PDF - INDIVIDU BERGAMBAR ================= **/
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

async function cetakLaporanIndividuPDF() {
  const l = logDetailSemasa;
  if (!l) {
    showToast('Tiada log dipilih untuk dicetak.');
    return;
  }
  showToast('Menjana PDF...');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 18;

  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('Laporan Rondaan Warden Malam', 14, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text('MRSM Sultan Azlan Shah', 14, y);
  y += 10;

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text(l.NamaWarden + ' (' + l.NoGaji + ')', 14, y);
  y += 6;
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.text('Tarikh: ' + l.Tarikh + '   Sesi: ' + l.SesiRondaan, 14, y);
  y += 5;
  doc.text('Masa: ' + l.MasaMula + ' - ' + (l.MasaTamat || '-'), 14, y);
  y += 7;

  if (l.Kecemasan === 'YA - SEGERA') {
    doc.setTextColor(210, 40, 40);
    doc.setFont(undefined, 'bold');
    doc.text('*** LAPORAN KECEMASAN ***', 14, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    y += 7;
  }

  doc.setFont(undefined, 'bold');
  doc.text('Log Pemeriksaan:', 14, y);
  y += 5;
  doc.setFont(undefined, 'normal');
  const semakan = [
    'Minum Malam: ' + l.MinumMalam, 'Pagar Dikunci: ' + l.PagarKunci,
    'Lampu Bilik: ' + l.LampuBilik, 'Lampu Koridor: ' + l.LampuKoridor,
    'Dalam Dorm: ' + l.DalamDorm, 'Tiada Bising: ' + l.TiadaBising,
    'Bersedia Tidur: ' + l.BersediaTidur, 'Tiada Buli: ' + l.TiadaBuli,
    'Semak Kebakaran: ' + l.SemakKebakaran, 'Tandas Bersih: ' + l.TandasBersih
  ];
  semakan.forEach(function (s, idx) {
    const kolX = idx % 2 === 0 ? 14 : 108;
    if (idx % 2 === 0 && idx > 0) y += 5;
    doc.text('• ' + s, kolX, y);
  });
  y += 9;

  if (l.BilPelajarSakit) {
    doc.text('Pelajar sakit/tidak sihat: ' + l.BilPelajarSakit, 14, y);
    y += 6;
  }
  if (l.Aduan) {
    doc.setFont(undefined, 'bold');
    doc.text('Aduan/Insiden:', 14, y);
    y += 5;
    doc.setFont(undefined, 'normal');
    const aduanLines = doc.splitTextToSize(String(l.Aduan), 180);
    doc.text(aduanLines, 14, y);
    y += aduanLines.length * 5 + 3;
  }
  if (l.Catatan) {
    doc.setFont(undefined, 'bold');
    doc.text('Catatan:', 14, y);
    y += 5;
    doc.setFont(undefined, 'normal');
    const catatanLines = doc.splitTextToSize(String(l.Catatan), 180);
    doc.text(catatanLines, 14, y);
    y += catatanLines.length * 5 + 3;
  }

  // Sisipkan gambar sebenar
  const urls = (l.GambarURL || '').split(',').map(function (u) { return u.trim(); }).filter(Boolean);
  if (urls.length > 0) {
    y += 4;
    doc.setFont(undefined, 'bold');
    doc.text('Gambar Bukti (' + urls.length + '):', 14, y);
    y += 6;
    doc.setFont(undefined, 'normal');

    const gambarW = 85, gambarH = 65, gap = 8;
    let x = 14;
    for (let i = 0; i < urls.length; i++) {
      if (y + gambarH > 280) { doc.addPage(); y = 18; }
      try {
        const dataUrl = await urlKeDataURL(urls[i]);
        doc.addImage(dataUrl, 'JPEG', x, y, gambarW, gambarH);
      } catch (e) {
        doc.setDrawColor(200, 200, 200);
        doc.rect(x, y, gambarW, gambarH);
        doc.setFontSize(8);
        doc.text('Gagal muat gambar', x + 10, y + gambarH / 2);
      }
      if (x === 14) {
        x = 14 + gambarW + gap;
      } else {
        x = 14;
        y += gambarH + gap;
      }
    }
  }

  const namaFail = 'Laporan_' + l.NamaWarden.replace(/[^a-zA-Z0-9]/g, '_') + '_' + l.Tarikh + '.pdf';
  doc.save(namaFail);
}
