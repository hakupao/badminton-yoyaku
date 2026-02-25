// =============================================
// background.js - Service Worker (Background Controller)
// =============================================

const SITE_BASE = 'https://www.shisetsu.city.yokohama.lg.jp';
const HOME_URL = `${SITE_BASE}/user/Home`;
const ALARM_NAME = 'yokohama-facility-check';

// Bilingual notification strings
const BG_I18N = {
    zh: {
        notifyTitle: '🎉 找到空位了！',
        notifyBody: '在 {facilities} 个场馆找到 {slots} 个空位',
        foundStatus: '✓ 找到 {count} 个空位！',
        notFoundStatus: '搜索完成 - 未找到空位',
        syncDone: '✓ 参数字典已更新',
        syncFail: '⚠️ 获取失败，请重试',
        searchStart: '🔄 搜索开始: 正在打开页面...',
        searchFail: '❌ 搜索启动失败',
        syncStart: '🔄 字典同步: 正在打开网站...',
        syncError: '❌ 字典同步失败',
    },
    ja: {
        notifyTitle: '🎉 空きが見つかりました！',
        notifyBody: '{facilities}施設で{slots}件の空きコマが見つかりました',
        foundStatus: '✓ {count}件の空きが見つかりました！',
        notFoundStatus: '検索完了 - 空きは見つかりませんでした',
        syncDone: '✓ パラメータ辞書を更新しました',
        syncFail: '⚠️ データが取得できませんでした。再試行してください。',
        searchStart: '🔄 検索開始: ページを開いています...',
        searchFail: '❌ 検索の開始に失敗しました',
        syncStart: '🔄 辞書同期: サイトを開いています...',
        syncError: '❌ 辞書同期に失敗しました',
    }
};

async function bgT(key, params) {
    const data = await chrome.storage.local.get('language');
    const lang = data.language || 'ja';
    let str = BG_I18N[lang]?.[key] || BG_I18N['ja']?.[key] || key;
    if (params) {
        str = str.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? _);
    }
    return str;
}

// ===== Message Handler =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.action) {
        case 'syncDictionary':
            handleSyncDictionary();
            break;
        case 'startSearch':
            handleStartSearch(msg.params);
            break;
        case 'setupAlarm':
            setupAlarm(msg.interval);
            break;
        case 'clearAlarm':
            chrome.alarms.clear(ALARM_NAME);
            break;
        case 'dictDataCollected':
            handleDictDataCollected(msg.data, sender.tab?.id);
            break;
        case 'searchStepComplete':
            handleSearchStepComplete(msg, sender.tab?.id);
            break;
        case 'availabilityResults':
            handleAvailabilityResults(msg.results, sender.tab?.id);
            break;
    }
    return true;
});

// ===== Helper: resolve relative days to actual dates =====
function resolveDateRangeBg(val) {
    const today = new Date();
    let endDate;
    if (val === 'month') {
        // Next month same date minus 1 day (e.g. 2/25 → 3/24)
        endDate = new Date(today);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(endDate.getDate() - 1);
    } else {
        const days = parseInt(val) || 14;
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() + days);
    }
    const fmt = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    return { dateFrom: fmt(today), dateTo: fmt(endDate) };
}

// ===== Alarm for periodic checks =====
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        console.log('[BG] Alarm triggered, running periodic check');
        const data = await chrome.storage.local.get('profiles');
        const profiles = data.profiles || [];

        // Filter profiles with scheduledCheck enabled
        const scheduledProfiles = profiles.filter(p => p.scheduledCheck === true);

        if (scheduledProfiles.length === 0) {
            console.log('[BG] No profiles with scheduled check enabled, skipping');
            return;
        }

        console.log(`[BG] Running ${scheduledProfiles.length} scheduled profile(s)`);

        // Run each scheduled profile sequentially
        for (const profile of scheduledProfiles) {
            const resolved = resolveDateRangeBg(profile.dateRangeDays || '14');
            const params = { ...profile, dateFrom: resolved.dateFrom, dateTo: resolved.dateTo };
            await handleStartSearch(params, true);
            // Wait between profiles to avoid overlapping searches
            if (scheduledProfiles.length > 1) {
                await new Promise(r => setTimeout(r, 60000)); // 1 min between each
            }
        }
    }
});

function setupAlarm(intervalMinutes) {
    chrome.alarms.clear(ALARM_NAME, () => {
        if (intervalMinutes > 0) {
            chrome.alarms.create(ALARM_NAME, {
                delayInMinutes: intervalMinutes,
                periodInMinutes: intervalMinutes
            });
            console.log(`[BG] Alarm set for every ${intervalMinutes} minutes`);
        }
    });
}

// ===== Dictionary Sync =====
async function handleSyncDictionary() {
    console.log('[BG] Starting dictionary sync...');
    broadcastStatus(await bgT('syncStart'), 'busy');

    try {
        // Open the homepage in a background tab
        const tab = await chrome.tabs.create({
            url: HOME_URL,
            active: false,
            pinned: true
        });

        // Wait for the page to load, then inject the dictionary crawler
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === tab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);

                // Inject the dictionary collection script
                setTimeout(() => {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: collectDictionaryData
                    });
                }, 2000);
            }
        });
    } catch (err) {
        console.error('[BG] Sync error:', err);
        broadcastStatus(await bgT('syncError'), 'error');
    }
}

// This function runs IN the page context
function collectDictionaryData() {
    // Click the "利用目的から探す" tab to reveal purpose checkboxes
    const tabs = document.querySelectorAll('[role="tab"]');
    let purposeTab = null;
    tabs.forEach(t => {
        if (t.textContent.includes('利用目的から探す')) {
            purposeTab = t;
        }
    });

    if (purposeTab) {
        purposeTab.click();
    }

    // Wait for tab content to render, then collect data
    setTimeout(() => {
        // Collect purposes
        const purposeInputs = document.querySelectorAll(
            'input[name="HomeModel.SearchByDateTimeModel.SelectedPurpose"]'
        );
        const purposes = [];
        purposeInputs.forEach(input => {
            const label = input.closest('label');
            const text = label ? label.textContent.trim() : input.parentElement?.textContent?.trim() || '';
            if (text && input.value) {
                purposes.push({ value: input.value, label: text });
            }
        });

        // Try to reveal area checkboxes by clicking the filter button
        const filterBtns = document.querySelectorAll('button, a');
        filterBtns.forEach(btn => {
            if (btn.textContent.includes('区名') || btn.textContent.includes('絞り込む')) {
                btn.click();
            }
        });

        // Collect areas after a short delay
        setTimeout(() => {
            const areaInputs = document.querySelectorAll(
                'input[name="HomeModel.SearchByDateTimeModel.SelectedArea"]'
            );
            const areas = [];
            areaInputs.forEach(input => {
                const label = input.closest('label');
                const text = label ? label.textContent.trim() : input.parentElement?.textContent?.trim() || '';
                if (text && input.value) {
                    areas.push({ value: input.value, label: text });
                }
            });

            // Send data back to background
            chrome.runtime.sendMessage({
                action: 'dictDataCollected',
                data: { purposes, areas }
            });
        }, 1500);
    }, 2000);
}

async function handleDictDataCollected(data, tabId) {
    console.log('[BG] Dictionary data collected:', data);

    if (data && data.purposes && data.purposes.length > 0) {
        await chrome.storage.local.set({
            dictionary: data,
            dictLastSync: Date.now()
        });

        broadcastStatus(await bgT('syncDone'), 'success');

        // Notify popup to refresh
        chrome.runtime.sendMessage({ action: 'dictionarySynced' }).catch(() => { });
    } else {
        broadcastStatus(await bgT('syncFail'), 'error');
    }

    // Close the background tab
    if (tabId) {
        try {
            chrome.tabs.remove(tabId);
        } catch (e) { }
    }
}

// ===== Search Execution =====
async function handleStartSearch(params, triggeredByAlarm = false) {
    console.log('[BG] Starting search with params:', params, 'alarm:', triggeredByAlarm);
    broadcastStatus(await bgT('searchStart'), 'busy');

    // Store current search task
    await chrome.storage.local.set({
        currentTask: {
            active: true,
            step: 'init',
            params: params,
            startedAt: Date.now(),
            triggeredByAlarm: triggeredByAlarm
        }
    });

    try {
        // Open homepage - must be active so DOM renders fully
        // (background tabs have limited rendering, breaking element detection)
        const tab = await chrome.tabs.create({
            url: HOME_URL,
            active: !triggeredByAlarm,  // foreground for manual, background for alarm
            pinned: true
        });

        // The content script will pick up from here using the currentTask
        console.log('[BG] Tab created:', tab.id, 'active:', !triggeredByAlarm);
    } catch (err) {
        console.error('[BG] Search start error:', err);
        broadcastStatus(await bgT('searchFail'), 'error');
    }
}

function handleSearchStepComplete(msg, tabId) {
    console.log(`[BG] Search step complete: ${msg.step}`, msg);
    broadcastStatus(`🔄 ${msg.statusText || msg.step}`, 'busy');
}

async function handleAvailabilityResults(results, tabId) {
    console.log('[BG] Availability results received:', results);

    // Read current task to check if this was triggered by alarm or manually
    const taskData = await chrome.storage.local.get('currentTask');
    const isAlarmTriggered = taskData.currentTask?.triggeredByAlarm === true;

    const availableSlots = results.filter(r => r.available && r.available.length > 0);

    if (availableSlots.length > 0) {
        // Found available slots! Notify user
        const totalSlots = availableSlots.reduce((sum, f) => sum + f.available.length, 0);

        const notifyTitle = await bgT('notifyTitle');
        const notifyBody = await bgT('notifyBody', { facilities: availableSlots.length, slots: totalSlots });

        chrome.notifications.create('facility-found', {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: notifyTitle,
            message: notifyBody,
            priority: 2,
            requireInteraction: true
        });

        // Bring the tab to foreground
        if (tabId) {
            chrome.tabs.update(tabId, { active: true, pinned: false });
        }

        broadcastStatus(await bgT('foundStatus', { count: totalSlots }), 'success');
        chrome.runtime.sendMessage({
            action: 'searchComplete',
            resultCount: totalSlots
        }).catch(() => { });
    } else {
        broadcastStatus(await bgT('notFoundStatus'), 'success');

        // Only auto-close if this was an alarm-triggered background check
        // Keep the tab open for manual searches so user can review
        if (isAlarmTriggered && tabId) {
            setTimeout(() => {
                try { chrome.tabs.remove(tabId); } catch (e) { }
            }, 3000);
        } else if (tabId) {
            // For manual searches: keep tab open, just unpin it
            chrome.tabs.update(tabId, { pinned: false });
        }

        chrome.runtime.sendMessage({
            action: 'searchComplete',
            resultCount: 0
        }).catch(() => { });
    }

    // Clear current task
    await chrome.storage.local.set({
        currentTask: { active: false }
    });
}

// ===== Broadcast status to popup =====
function broadcastStatus(text, type) {
    chrome.runtime.sendMessage({
        action: 'statusUpdate',
        text,
        type
    }).catch(() => {
        // Popup may not be open, that's fine
    });
}

// ===== On Install =====
chrome.runtime.onInstalled.addListener(() => {
    console.log('[BG] Extension installed');
});
