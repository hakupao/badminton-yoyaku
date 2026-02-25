// =============================================
// i18n.js - 多言語サポート (中文 / 日本語)
// =============================================

const I18N = {
  zh: {
    // Header
    'header.title': '横滨预约助手',
    'header.subtitle': '自动化场馆预约',

    // Tabs
    'tab.search': '🔍 搜索',
    'tab.profiles': '📋 方案',
    'tab.settings': '⚙️ 设置',

    // Dictionary status
    'dict.notSynced': '参数未获取 - 请先同步',
    'dict.synced': '已同步',
    'dict.syncBtn': '🔄 同步',
    'dict.syncing': '⏳ 同步中...',

    // Search form
    'search.purpose': '🎯 活动类型',
    'search.purposePlaceholder': '请先同步参数',
    'search.area': '📍 区域',
    'search.areaPlaceholder': '请先同步参数',
    'search.dateRange': '📅 搜索期间',
    'search.days7': '从今天起7天',
    'search.days14': '从今天起14天',
    'search.days21': '从今天起21天',
    'search.daysMonth': '从今天起1个月',
    'search.timeRange': '⏰ 时间段',
    'search.dowFilter': '📆 星期筛选',
    'search.dow.mon': '一',
    'search.dow.tue': '二',
    'search.dow.wed': '三',
    'search.dow.thu': '四',
    'search.dow.fri': '五',
    'search.dow.sat': '六',
    'search.dow.sun': '日',
    'search.dow.holiday': '假',

    // Action buttons
    'btn.search': '🚀 一键搜索（后台运行）',
    'btn.saveProfile': '💾 保存为方案',
    'btn.saveSettings': '💾 保存设置',
    'btn.resyncDict': '🔄 重新同步参数字典',
    'btn.resyncHint': '从网站获取最新的场馆和活动类型列表',

    // Profiles
    'profile.empty': '暂无已保存的方案',
    'profile.emptyHint': '请在「搜索」页设置条件并保存',
    'profile.promptName': '请输入方案名称:',
    'profile.saved': '方案已保存 ✓',
    'profile.deleted': '方案已删除',
    'profile.allDays': '全部',

    // Settings
    'settings.loginId': '🔑 登录ID',
    'settings.loginIdPlaceholder': '用户ID',
    'settings.loginPw': '🔒 密码',
    'settings.loginPwPlaceholder': '密码',
    'settings.interval': '⏱️ 定时检查间隔',
    'settings.intervalOff': '关闭',
    'settings.interval15': '每15分钟',
    'settings.interval30': '每30分钟',
    'settings.interval60': '每1小时',
    'settings.saved': '设置已保存 ✓',

    // Status
    'status.ready': '准备就绪',
    'status.searching': '🔄 后台搜索中...',
    'status.syncing': '🔄 正在从网站获取参数...',
    'status.syncDone': '✓ 参数字典已更新',
    'status.syncFail': '⚠️ 获取失败，请重试',
    'status.noPurpose': '⚠️ 请选择活动类型',
    'status.searchStart': '🔄 开始后台搜索...',
    'status.found': '✓ 找到 {count} 个空位！',
    'status.notFound': '搜索完成 - 未找到空位',

    // Notifications
    'notify.title': '🎉 找到空位了！',
    'notify.body': '在 {facilities} 个场馆找到 {slots} 个空位',
  },

  ja: {
    // Header
    'header.title': '横浜予約アシスタント',
    'header.subtitle': '施設予約を自動化',

    // Tabs
    'tab.search': '🔍 検索',
    'tab.profiles': '📋 方案',
    'tab.settings': '⚙️ 設定',

    // Dictionary status
    'dict.notSynced': 'パラメータ未取得 - 同期してください',
    'dict.synced': '同期済み',
    'dict.syncBtn': '🔄 同期',
    'dict.syncing': '⏳ 同期中...',

    // Search form
    'search.purpose': '🎯 利用目的',
    'search.purposePlaceholder': '先にパラメータを同期してください',
    'search.area': '📍 エリア（区）',
    'search.areaPlaceholder': '先にパラメータを同期してください',
    'search.dateRange': '📅 検索期間',
    'search.days7': '今日から7日間',
    'search.days14': '今日から14日間',
    'search.days21': '今日から21日間',
    'search.daysMonth': '今日から1ヶ月',
    'search.timeRange': '⏰ 時間帯',
    'search.dowFilter': '📆 曜日フィルター',
    'search.dow.mon': '月',
    'search.dow.tue': '火',
    'search.dow.wed': '水',
    'search.dow.thu': '木',
    'search.dow.fri': '金',
    'search.dow.sat': '土',
    'search.dow.sun': '日',
    'search.dow.holiday': '祝',

    // Action buttons
    'btn.search': '🚀 一键検索（バックグラウンド）',
    'btn.saveProfile': '💾 この条件を方案として保存',
    'btn.saveSettings': '💾 設定を保存',
    'btn.resyncDict': '🔄 パラメータ辞書を再同期',
    'btn.resyncHint': 'サイトから最新の施設・目的リストを取得します',

    // Profiles
    'profile.empty': '保存された方案はありません',
    'profile.emptyHint': '「検索」タブで条件を設定し保存してください',
    'profile.promptName': '方案名を入力してください:',
    'profile.saved': '方案を保存しました ✓',
    'profile.deleted': '方案を削除しました',
    'profile.allDays': '全曜日',

    // Settings
    'settings.loginId': '🔑 ログインID',
    'settings.loginIdPlaceholder': 'ユーザーID',
    'settings.loginPw': '🔒 パスワード',
    'settings.loginPwPlaceholder': 'パスワード',
    'settings.interval': '⏱️ 定期チェック間隔',
    'settings.intervalOff': 'オフ',
    'settings.interval15': '15分ごと',
    'settings.interval30': '30分ごと',
    'settings.interval60': '1時間ごと',
    'settings.saved': '設定を保存しました ✓',

    // Status
    'status.ready': '準備完了',
    'status.searching': '🔄 バックグラウンドで検索中...',
    'status.syncing': '🔄 サイトからパラメータを取得中...',
    'status.syncDone': '✓ パラメータ辞書を更新しました',
    'status.syncFail': '⚠️ データが取得できませんでした。再試行してください。',
    'status.noPurpose': '⚠️ 利用目的を選択してください',
    'status.searchStart': '🔄 バックグラウンドで検索を開始...',
    'status.found': '✓ {count}件の空きが見つかりました！',
    'status.notFound': '検索完了 - 空きは見つかりませんでした',

    // Notifications
    'notify.title': '🎉 空きが見つかりました！',
    'notify.body': '{facilities}施設で{slots}件の空きコマが見つかりました',
  }
};

// ===== i18n Engine =====
let currentLang = 'ja'; // default

function t(key, params) {
  const str = I18N[currentLang]?.[key] || I18N['ja']?.[key] || key;
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? _);
}

async function loadLang() {
  const data = await chrome.storage.local.get('language');
  currentLang = data.language || 'ja';
  return currentLang;
}

async function setLang(lang) {
  currentLang = lang;
  await chrome.storage.local.set({ language: lang });
  applyI18n();
}

function applyI18n() {
  // Apply to all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });

  // Apply to placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });

  // Apply to title attributes
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = t(key);
  });

  // Update language switcher active state
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
  });
}
