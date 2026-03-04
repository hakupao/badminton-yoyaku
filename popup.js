// =============================================
// popup.js - 横浜施設予約アシスタント Popup Controller
// =============================================

document.addEventListener('DOMContentLoaded', init);

let editingProfileIndex = null;

async function init() {
  // Load language first so UI renders in the correct language
  await loadLang();
  applyI18n();

  setupTabs();
  setupLangSwitcher();
  await loadDictionary();
  await loadLastSearchParams();
  updateDatePreview();
  await loadSettings();
  await loadProfiles();
  setupEventListeners();
  refreshProfileEditUi();
}

// ===== Language Switcher =====
function setupLangSwitcher() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await setLang(btn.dataset.lang);
      // Re-render dynamic content that isn't covered by data-i18n
      await loadDictionary();
      await loadProfiles();
      refreshProfileEditUi();
    });
  });
}

// ===== Tab Navigation =====
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
}

function activateTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  const tabContent = document.getElementById(`tab-${tabName}`);

  if (tabBtn) tabBtn.classList.add('active');
  if (tabContent) tabContent.classList.add('active');
}

// ===== Date Range Preview =====
function updateDatePreview() {
  const val = document.getElementById('dateRangeDays').value;
  const today = new Date();
  const endDate = calcEndDate(today, val);
  const preview = document.getElementById('datePreview');
  if (preview) {
    preview.textContent = `${formatDate(today)} ～ ${formatDate(endDate)}`;
  }
}

function calcEndDate(today, val) {
  if (val === 'month') {
    // Next month same date minus 1 day (e.g. 2/25 → 3/24)
    const end = new Date(today);
    end.setMonth(end.getMonth() + 1);
    end.setDate(end.getDate() - 1);
    return end;
  }
  const days = parseInt(val, 10) || 14;
  const end = new Date(today);
  end.setDate(end.getDate() + days);
  return end;
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolveDateRange(val) {
  const today = new Date();
  const endDate = calcEndDate(today, val);
  return { dateFrom: formatDate(today), dateTo: formatDate(endDate) };
}

function extractValueList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(item => {
      if (item && typeof item === 'object' && item.value !== undefined && item.value !== null) {
        return String(item.value);
      }
      if (item !== undefined && item !== null) return String(item);
      return '';
    })
    .filter(Boolean);
}

function setSelectValueIfExists(id, value) {
  if (value === undefined || value === null || value === '') return;
  const select = document.getElementById(id);
  if (!select) return;

  const target = String(value);
  const hasOption = Array.from(select.options).some(opt => opt.value === target);
  if (hasOption) select.value = target;
}

function applySearchParamsToForm(params) {
  if (!params || typeof params !== 'object') return;

  if (Array.isArray(params.purposes)) {
    const purposeValues = new Set(extractValueList(params.purposes));
    const purposeSelect = document.getElementById('purposeSelect');
    if (purposeSelect) {
      Array.from(purposeSelect.options).forEach(opt => {
        opt.selected = purposeValues.has(opt.value);
      });
    }
  }

  if (Array.isArray(params.areas)) {
    const areaValues = new Set(extractValueList(params.areas));
    document.querySelectorAll('#areaChips input[type="checkbox"]').forEach(cb => {
      cb.checked = areaValues.has(cb.value);
    });
  }

  setSelectValueIfExists('dateRangeDays', params.dateRangeDays);
  setSelectValueIfExists('timeFrom', params.timeFrom);
  setSelectValueIfExists('timeTo', params.timeTo);

  const hasDowConfig = Array.isArray(params.daysOfWeek) || typeof params.includeHoliday === 'boolean';
  if (hasDowConfig) {
    const dayValues = new Set((params.daysOfWeek || []).map(v => String(v)));
    document.querySelectorAll('.dow-chip input').forEach(cb => {
      if (cb.value === 'holiday') {
        cb.checked = !!params.includeHoliday;
      } else {
        cb.checked = dayValues.has(cb.value);
      }
    });
  }

  updateDatePreview();
}

function buildRememberedSearchParams(params) {
  const daysOfWeek = Array.isArray(params.daysOfWeek)
    ? params.daysOfWeek
      .map(v => Number(v))
      .filter(v => Number.isInteger(v) && v >= 0 && v <= 6)
    : [];

  return {
    purposes: Array.isArray(params.purposes) ? params.purposes : [],
    areas: Array.isArray(params.areas) ? params.areas : [],
    dateRangeDays: params.dateRangeDays || '14',
    timeFrom: params.timeFrom || '0900',
    timeTo: params.timeTo || '2400',
    daysOfWeek,
    includeHoliday: !!params.includeHoliday
  };
}

async function loadLastSearchParams() {
  const data = await chrome.storage.local.get('lastSearchParams');
  if (data.lastSearchParams) {
    applySearchParamsToForm(data.lastSearchParams);
  }
}

async function saveLastSearchParams(params) {
  await chrome.storage.local.set({ lastSearchParams: buildRememberedSearchParams(params) });
}

function getProfileDisplayName(profile, index) {
  return profile?.name || `方案 ${index + 1}`;
}

function refreshProfileEditUi() {
  const saveBtn = document.getElementById('btnSaveProfile');
  const cancelBtn = document.getElementById('btnCancelProfileEdit');
  if (!saveBtn || !cancelBtn) return;

  if (editingProfileIndex === null) {
    saveBtn.textContent = t('btn.saveProfile');
    cancelBtn.style.display = 'none';
  } else {
    saveBtn.textContent = t('btn.updateProfile');
    cancelBtn.style.display = 'block';
  }
}

// ===== Dictionary Management =====
async function loadDictionary() {
  const data = await chrome.storage.local.get(['dictionary', 'dictLastSync']);
  const dict = data.dictionary;
  const statusEl = document.getElementById('dictStatus');
  const preservedParams = gatherCurrentSearchParams();

  if (dict && dict.purposes && dict.purposes.length > 0) {
    statusEl.classList.add('synced');
    const syncTime = data.dictLastSync ? new Date(data.dictLastSync).toLocaleString('ja-JP') : '?';
    statusEl.querySelector('.status-text').textContent = `${t('dict.synced')} (${syncTime})`;
    populatePurposes(dict.purposes);
    populateAreas(dict.areas);
    applySearchParamsToForm(preservedParams);
  } else {
    statusEl.classList.remove('synced');
    statusEl.querySelector('.status-text').textContent = t('dict.notSynced');
  }
}

function populatePurposes(purposes) {
  const select = document.getElementById('purposeSelect');
  select.innerHTML = '';
  purposes.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.value;
    opt.textContent = p.label;
    select.appendChild(opt);
  });
}

function populateAreas(areas) {
  const container = document.getElementById('areaChips');
  container.innerHTML = '';
  if (!areas || areas.length === 0) {
    container.innerHTML = `<span class="chip-placeholder">${t('search.areaPlaceholder')}</span>`;
    return;
  }
  areas.forEach(a => {
    const label = document.createElement('label');
    label.className = 'area-chip';
    label.innerHTML = `<input type="checkbox" value="${a.value}"><span>${a.label}</span>`;
    container.appendChild(label);
  });
}

// ===== Settings =====
async function loadSettings() {
  const data = await chrome.storage.local.get(['loginId', 'loginPw', 'checkInterval']);
  if (data.loginId) document.getElementById('loginId').value = data.loginId;
  if (data.loginPw) document.getElementById('loginPw').value = data.loginPw;
  if (data.checkInterval !== undefined) document.getElementById('checkInterval').value = data.checkInterval;
}

async function saveSettings() {
  const loginId = document.getElementById('loginId').value;
  const loginPw = document.getElementById('loginPw').value;
  const checkInterval = parseInt(document.getElementById('checkInterval').value, 10);

  await chrome.storage.local.set({ loginId, loginPw, checkInterval });

  // Setup or clear alarm
  if (checkInterval > 0) {
    chrome.runtime.sendMessage({ action: 'setupAlarm', interval: checkInterval });
  } else {
    chrome.runtime.sendMessage({ action: 'clearAlarm' });
  }

  setStatus(t('settings.saved'), 'success');
}

// ===== Profiles =====
async function loadProfiles() {
  const data = await chrome.storage.local.get('profiles');
  const profiles = data.profiles || [];
  renderProfiles(profiles);
}

function renderProfiles(profiles) {
  const container = document.getElementById('profilesList');

  if (profiles.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>${t('profile.empty')}</p>
        <p class="empty-hint">${t('profile.emptyHint')}</p>
      </div>`;
    return;
  }

  container.innerHTML = '';
  profiles.forEach((profile, index) => {
    const card = document.createElement('div');
    card.className = `profile-card${editingProfileIndex === index ? ' editing' : ''}`;

    const purposeLabels = (profile.purposes || []).map(p => `<span class="profile-tag">${p.label}</span>`).join('');
    const areaLabels = (profile.areas || []).map(a => `<span class="profile-tag">📍${a.label}</span>`).join('');
    const dowLabels = (profile.daysOfWeek || []).map(d => {
      const namesJa = ['日', '月', '火', '水', '木', '金', '土'];
      const namesZh = ['日', '一', '二', '三', '四', '五', '六'];
      const names = currentLang === 'zh' ? namesZh : namesJa;
      return names[d];
    }).join('・');

    // Show resolved date range (computed from today + saved days/month)
    const rangeVal = profile.dateRangeDays || '14';
    const resolved = resolveDateRange(rangeVal);
    const daysLabel = rangeVal === 'month'
      ? (currentLang === 'zh' ? '1个月' : '1ヶ月')
      : (currentLang === 'zh' ? `${rangeVal}天` : `${rangeVal}日間`);

    // Holiday label
    const holidayLabel = profile.includeHoliday
      ? (currentLang === 'zh' ? '・假' : '・祝')
      : '';

    const isScheduled = profile.scheduledCheck || false;
    const schedLabel = currentLang === 'zh' ? '定时检查' : '定期チェック';

    card.innerHTML = `
      <div class="profile-header">
        <span class="profile-name">${getProfileDisplayName(profile, index)}</span>
        <div class="profile-actions">
          <button class="btn-small" data-action="edit" data-index="${index}" title="${currentLang === 'zh' ? '编辑此方案' : 'この方案を編集'}" style="background:var(--warning);">✎</button>
          <button class="btn-small" data-action="run" data-index="${index}" title="${currentLang === 'zh' ? '运行此方案' : 'この方案で検索'}">▶</button>
          <button class="btn-small" data-action="delete" data-index="${index}" title="${currentLang === 'zh' ? '删除' : '削除'}" style="background:var(--danger);">✕</button>
        </div>
      </div>
      <div>${purposeLabels}${areaLabels}</div>
      <div class="profile-detail">
        📅 ${daysLabel}（${resolved.dateFrom} ～ ${resolved.dateTo}）
        ⏰ ${formatTime(profile.timeFrom)} ～ ${formatTime(profile.timeTo)}
      </div>
      <div class="profile-detail">📆 ${dowLabels || t('profile.allDays')}${holidayLabel}</div>
      <div class="profile-schedule">
        <label class="schedule-toggle" title="${schedLabel}">
          <input type="checkbox" data-action="schedule" data-index="${index}" ${isScheduled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
          <span class="toggle-label">⏱️ ${schedLabel}</span>
        </label>
      </div>
    `;
    container.appendChild(card);
  });

  // Bind profile action buttons
  container.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => startEditProfile(parseInt(btn.dataset.index, 10)));
  });
  container.querySelectorAll('[data-action="run"]').forEach(btn => {
    btn.addEventListener('click', () => runProfile(parseInt(btn.dataset.index, 10)));
  });
  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteProfile(parseInt(btn.dataset.index, 10)));
  });
  container.querySelectorAll('[data-action="schedule"]').forEach(cb => {
    cb.addEventListener('change', () => toggleScheduledCheck(parseInt(cb.dataset.index, 10), cb.checked));
  });
}

async function toggleScheduledCheck(index, enabled) {
  const data = await chrome.storage.local.get('profiles');
  const profiles = data.profiles || [];
  if (profiles[index]) {
    profiles[index].scheduledCheck = enabled;
    await chrome.storage.local.set({ profiles });
    const label = enabled
      ? (currentLang === 'zh' ? '✓ 已启用定时检查' : '✓ 定期チェックを有効にしました')
      : (currentLang === 'zh' ? '定时检查已关闭' : '定期チェックを無効にしました');
    setStatus(label, 'success');
  }
}

function formatTime(val) {
  if (!val) return '?';
  return val.substring(0, 2) + ':' + val.substring(2);
}

async function startEditProfile(index) {
  const data = await chrome.storage.local.get('profiles');
  const profiles = data.profiles || [];
  const profile = profiles[index];
  if (!profile) return;

  editingProfileIndex = index;
  applySearchParamsToForm(profile);
  refreshProfileEditUi();
  renderProfiles(profiles);
  activateTab('search');
  setStatus(t('status.editingProfile', { name: getProfileDisplayName(profile, index) }), 'busy');
}

function cancelProfileEdit(showStatus = true) {
  if (editingProfileIndex === null) return;

  editingProfileIndex = null;
  refreshProfileEditUi();
  loadProfiles();

  if (showStatus) {
    setStatus(t('status.editCanceled'), 'success');
  }
}

async function saveCurrentAsProfile() {
  const profile = gatherCurrentSearchParams();
  if (!profile.purposes || profile.purposes.length === 0) {
    setStatus(t('status.noPurpose'), 'error');
    return;
  }

  const data = await chrome.storage.local.get('profiles');
  const profiles = data.profiles || [];

  if (editingProfileIndex !== null) {
    const index = editingProfileIndex;
    const original = profiles[index];

    if (original) {
      profile.name = getProfileDisplayName(original, index);
      profile.scheduledCheck = !!original.scheduledCheck;
      profiles[index] = profile;
      await chrome.storage.local.set({ profiles });

      editingProfileIndex = null;
      refreshProfileEditUi();
      renderProfiles(profiles);
      setStatus(t('profile.updated'), 'success');
      return;
    }

    editingProfileIndex = null;
    refreshProfileEditUi();
  }

  const name = prompt(t('profile.promptName'), `方案 ${Date.now()}`);
  if (!name) return;
  profile.name = name;

  profiles.push(profile);
  await chrome.storage.local.set({ profiles });

  renderProfiles(profiles);
  setStatus(t('profile.savedNamed', { name }), 'success');
}

async function deleteProfile(index) {
  const data = await chrome.storage.local.get('profiles');
  const profiles = data.profiles || [];
  if (!profiles[index]) return;

  profiles.splice(index, 1);
  await chrome.storage.local.set({ profiles });

  if (editingProfileIndex === index) {
    editingProfileIndex = null;
    refreshProfileEditUi();
  } else if (editingProfileIndex !== null && index < editingProfileIndex) {
    editingProfileIndex -= 1;
  }

  renderProfiles(profiles);
  setStatus(t('profile.deleted'), 'success');
}

async function runProfile(index) {
  const data = await chrome.storage.local.get('profiles');
  const profiles = data.profiles || [];
  const profile = profiles[index];
  if (!profile) {
    setStatus(t('status.noPurpose'), 'error');
    return;
  }

  // Validate profile data integrity
  if (!profile.purposes || profile.purposes.length === 0) {
    setStatus(t('status.noPurpose'), 'error');
    return;
  }

  // Resolve relative days to actual dates at run time
  const resolved = resolveDateRange(profile.dateRangeDays || '14');
  const runParams = { ...profile, dateFrom: resolved.dateFrom, dateTo: resolved.dateTo };

  console.log('[Popup] Running profile:', profile.name, runParams);
  setStatus(t('status.searching'), 'busy');
  chrome.runtime.sendMessage({ action: 'startSearch', params: runParams });
}

// ===== Gather Search Params =====
function gatherCurrentSearchParams() {
  const purposeSelect = document.getElementById('purposeSelect');
  const selectedPurposes = Array.from(purposeSelect.selectedOptions).map(opt => ({
    value: opt.value,
    label: opt.textContent
  }));

  const selectedAreas = Array.from(document.querySelectorAll('#areaChips input:checked')).map(cb => ({
    value: cb.value,
    label: cb.parentElement.querySelector('span').textContent
  }));

  const checkedValues = Array.from(document.querySelectorAll('.dow-chip input:checked')).map(cb => cb.value);
  const daysOfWeek = checkedValues.filter(v => v !== 'holiday').map(v => parseInt(v, 10));
  const includeHoliday = checkedValues.includes('holiday');

  const dateRangeDays = document.getElementById('dateRangeDays').value || '14';

  return {
    purposes: selectedPurposes,
    areas: selectedAreas,
    dateRangeDays: dateRangeDays,
    timeFrom: document.getElementById('timeFrom').value,
    timeTo: document.getElementById('timeTo').value,
    daysOfWeek: daysOfWeek,
    includeHoliday: includeHoliday
  };
}

// ===== Event Listeners =====
function setupEventListeners() {
  // Sync dictionary
  document.getElementById('btnSyncDict').addEventListener('click', syncDictionary);
  const btnSyncSettings = document.getElementById('btnSyncDictSettings');
  if (btnSyncSettings) btnSyncSettings.addEventListener('click', syncDictionary);

  // Search
  document.getElementById('btnSearch').addEventListener('click', startSearch);

  // Save profile
  document.getElementById('btnSaveProfile').addEventListener('click', saveCurrentAsProfile);
  const btnCancelProfileEdit = document.getElementById('btnCancelProfileEdit');
  if (btnCancelProfileEdit) {
    btnCancelProfileEdit.addEventListener('click', () => cancelProfileEdit(true));
  }

  // Save settings
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettings);

  // Date range days change → update preview
  document.getElementById('dateRangeDays').addEventListener('change', updateDatePreview);

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'statusUpdate') {
      setStatus(msg.text, msg.type || '');
    }
    if (msg.action === 'dictionarySynced') {
      loadDictionary();
      setStatus(t('status.syncDone'), 'success');
    }
    if (msg.action === 'searchComplete') {
      const count = msg.resultCount || 0;
      if (count > 0) {
        setStatus(t('status.found', { count }), 'success');
      } else {
        setStatus(t('status.notFound'), 'success');
      }
    }
  });
}

// ===== Sync Dictionary =====
async function syncDictionary() {
  const btn = document.getElementById('btnSyncDict');
  btn.disabled = true;
  btn.textContent = t('dict.syncing');
  setStatus(t('status.syncing'), 'busy');

  chrome.runtime.sendMessage({ action: 'syncDictionary' });

  // Reset button after timeout
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = t('dict.syncBtn');
  }, 30000);
}

// ===== Start Search =====
async function startSearch() {
  let params = gatherCurrentSearchParams();

  // If no purposes selected in UI, try to use saved profiles as fallback
  if (!params.purposes || params.purposes.length === 0) {
    const data = await chrome.storage.local.get('profiles');
    const profiles = data.profiles || [];

    if (profiles.length > 0) {
      // Use the first saved profile
      params = profiles[0];
      console.log('[Popup] No UI selection, using saved profile:', params.name);
      setStatus(
        currentLang === 'zh'
          ? `🔄 使用方案「${params.name}」开始搜索...`
          : `🔄 方案「${params.name}」で検索を開始...`,
        'busy'
      );
    } else {
      setStatus(t('status.noPurpose'), 'error');
      return;
    }
  } else {
    setStatus(t('status.searchStart'), 'busy');
  }

  // Resolve relative days to actual dates at search time
  const days = params.dateRangeDays || '14';
  const resolved = resolveDateRange(days);
  const searchParams = { ...params, dateFrom: resolved.dateFrom, dateTo: resolved.dateTo };

  await saveLastSearchParams(params);
  chrome.runtime.sendMessage({ action: 'startSearch', params: searchParams });
}

// ===== Status Bar =====
function setStatus(text, type) {
  const bar = document.getElementById('statusBar');
  const msg = document.getElementById('statusMessage');
  bar.className = 'status-bar';
  if (type === 'busy') bar.classList.add('busy');
  if (type === 'error') bar.classList.add('error');
  msg.textContent = text;

  // Auto-clear after some time
  if (type === 'success') {
    setTimeout(() => {
      msg.textContent = t('status.ready');
      bar.className = 'status-bar';
    }, 5000);
  }
}
