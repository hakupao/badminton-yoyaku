// =============================================
// content.js - Automation Engine (Content Script)
// =============================================
// This script runs on every page load within the target site.
// It checks if there's an active automation task and executes the appropriate step.

(async function () {
    'use strict';

    const currentUrl = window.location.href;

    // Check if there's an active automation task
    const data = await chrome.storage.local.get('currentTask');
    const task = data.currentTask;

    if (!task || !task.active) {
        // No active task, do nothing
        return;
    }

    console.log('[CS] Active task detected. Current URL:', currentUrl, 'Step:', task.step);

    // Wait for page to be fully ready
    await waitForReady();

    // Determine which step to execute based on current URL
    const url = currentUrl.toLowerCase();

    if (url.includes('/user/home') || url.includes('/user/home/')) {
        await stepHomePage(task);
    } else if (url.includes('availabilitycheckapplyselectfacility')) {
        await stepSelectFacility(task);
    } else if (url.includes('vacantframefacilitystatus') || url.includes('availabilitycheckday')) {
        await stepAvailabilityCalendar(task);
    } else if (url.includes('availabilitychecktime') || url.includes('vacantframetimestatus')) {
        await stepTimeSlotSelection(task);
    } else if (url.includes('login') || url.includes('signin')) {
        await stepAutoLogin(task);
    } else {
        console.log('[CS] Unknown page, no action taken:', url);
    }
})();

// ===== Utilities =====

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForReady() {
    // Wait until the page has rendered its main content
    return new Promise(resolve => {
        if (document.readyState === 'complete') {
            setTimeout(resolve, 1500);
        } else {
            window.addEventListener('load', () => setTimeout(resolve, 1500));
        }
    });
}

function clickButton(textContent) {
    const buttons = document.querySelectorAll('button, a, input[type="submit"], input[type="button"]');
    for (const btn of buttons) {
        if (btn.textContent.trim().includes(textContent) || btn.value?.includes(textContent)) {
            btn.click();
            return true;
        }
    }
    return false;
}

function triggerChange(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
}

function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return el.offsetParent !== null || style.position === 'fixed';
}

function getActiveSearchTab() {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    return tabs.find(tab =>
        tab.getAttribute('aria-selected') === 'true' ||
        tab.classList.contains('active') ||
        tab.getAttribute('aria-expanded') === 'true'
    ) || null;
}

function isDateTimeSearchTab(tabEl) {
    if (!tabEl) return false;
    const text = (tabEl.textContent || '').replace(/\s+/g, '');
    return text.includes('日時から探す');
}

function getDateTimeSearchTab() {
    const roleTab = Array.from(document.querySelectorAll('[role="tab"]'))
        .find(tab => isDateTimeSearchTab(tab));
    if (roleTab) return roleTab;

    return Array.from(document.querySelectorAll('a, button, li, div'))
        .find(el => isDateTimeSearchTab(el)) || null;
}

function getDateTimeSearchPanel() {
    const activeTab = getActiveSearchTab();
    if (isDateTimeSearchTab(activeTab)) {
        const controls = activeTab.getAttribute('aria-controls');
        if (controls) {
            const panelById = document.getElementById(controls);
            if (panelById) return panelById;
        }
    }

    const labeledPanels = Array.from(document.querySelectorAll('[role="tabpanel"][aria-label*="日時から探す"]'));
    const visibleLabeled = labeledPanels.find(panel => isElementVisible(panel));
    if (visibleLabeled) return visibleLabeled;
    if (labeledPanels.length > 0) return labeledPanels[0];

    const panels = Array.from(document.querySelectorAll('[role="tabpanel"], .tab-pane'));
    const visiblePanel = panels.find(panel =>
        isElementVisible(panel) && (
            panel.querySelector('input[name="HomeModel.SearchByDateTimeModel.SelectedPurpose"]') ||
            panel.querySelector('input[name="HomeModel.SelectedWeekDays"]') ||
            panel.querySelector('input[name="HomeModel.DateFrom"]')
        )
    );
    if (visiblePanel) return visiblePanel;

    return panels.find(panel =>
        panel.querySelector('input[name="HomeModel.SearchByDateTimeModel.SelectedPurpose"]') ||
        panel.querySelector('input[name="HomeModel.SelectedWeekDays"]') ||
        panel.querySelector('input[name="HomeModel.DateFrom"]')
    ) || null;
}

async function ensureDateTimeSearchTabActive() {
    for (let attempt = 1; attempt <= 3; attempt++) {
        const activeTab = getActiveSearchTab();
        const activeText = (activeTab?.textContent || '').trim();
        if (isDateTimeSearchTab(activeTab)) {
            console.log('[CS] Date/time tab is active:', activeText);
            return true;
        }

        const dateTimeTab = getDateTimeSearchTab();
        if (!dateTimeTab) {
            console.warn('[CS] Date/time tab element not found');
            break;
        }

        console.log(`[CS] Switching to date/time tab (attempt ${attempt})...`);
        dateTimeTab.scrollIntoView({ block: 'center', inline: 'nearest' });
        dateTimeTab.click();
        dateTimeTab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        await sleep(800);
    }

    const activeTab = getActiveSearchTab();
    const ok = isDateTimeSearchTab(activeTab);
    if (!ok) {
        console.warn('[CS] Failed to activate date/time tab. Current active tab:', (activeTab?.textContent || '').trim());
    }
    return ok;
}

async function updateTaskStep(step) {
    const data = await chrome.storage.local.get('currentTask');
    if (data.currentTask) {
        data.currentTask.step = step;
        await chrome.storage.local.set({ currentTask: data.currentTask });
    }
}

function notifyStep(step, statusText) {
    chrome.runtime.sendMessage({
        action: 'searchStepComplete',
        step,
        statusText
    }).catch(() => { });
}

function sendAvailabilityResults(results) {
    chrome.runtime.sendMessage({
        action: 'availabilityResults',
        results
    }).catch(() => { });
}

// ===== Step 1: Home Page =====
async function stepHomePage(task) {
    console.log('[CS] Step: Home Page - starting automation');
    notifyStep('home', '検索条件を設定中...');

    const params = task.params;

    // Strategy: Always switch to "日時から探す" first.
    // If we stay on "お気に入りから探す", weekday/holiday settings won't be used.
    await ensureDateTimeSearchTabActive();
    const searchScope = getDateTimeSearchPanel() || document;

    // Step 1: Make sure purpose checkboxes are visible in date/time scope
    let purposeCheckboxes = Array.from(
        searchScope.querySelectorAll('input[name="HomeModel.SearchByDateTimeModel.SelectedPurpose"]')
    ).filter(cb => isElementVisible(cb) || isElementVisible(cb.closest('label') || cb.parentElement));

    // Fallback for unusual DOM visibility cases in background tabs
    if (purposeCheckboxes.length === 0) {
        purposeCheckboxes = Array.from(
            document.querySelectorAll('input[name="HomeModel.SearchByDateTimeModel.SelectedPurpose"]')
        );
    }

    console.log(`[CS] Found ${purposeCheckboxes.length} purpose checkboxes in date/time scope`);

    // Step 3: Select the purposes from our profile
    if (params.purposes && params.purposes.length > 0) {
        let selectedCount = 0;
        for (const purpose of params.purposes) {
            // Try exact match by value first
            let checkbox = searchScope.querySelector(
                `input[name="HomeModel.SearchByDateTimeModel.SelectedPurpose"][value="${purpose.value}"]`
            );

            if (!checkbox) {
                checkbox = document.querySelector(
                    `input[name="HomeModel.SearchByDateTimeModel.SelectedPurpose"][value="${purpose.value}"]`
                );
            }

            // If not found by value, try finding by label text
            if (!checkbox) {
                purposeCheckboxes.forEach(cb => {
                    const label = cb.closest('label') || cb.parentElement;
                    if (label && label.textContent.trim().includes(purpose.label)) {
                        checkbox = cb;
                    }
                });
            }

            if (checkbox) {
                if (!checkbox.checked) {
                    // Try clicking the label (more reliable than clicking the input directly)
                    const label = checkbox.closest('label');
                    if (label) {
                        label.click();
                    } else {
                        checkbox.click();
                    }
                    triggerChange(checkbox);
                    await sleep(300);
                }
                selectedCount++;
                console.log(`[CS] ✓ Selected purpose: ${purpose.label} (value=${purpose.value})`);
            } else {
                console.warn(`[CS] ✗ Purpose not found: ${purpose.label} (value=${purpose.value})`);
            }
        }

        // Verify selection
        await sleep(500);
        const checkedPurposes = searchScope.querySelectorAll(
            'input[name="HomeModel.SearchByDateTimeModel.SelectedPurpose"]:checked'
        );
        console.log(`[CS] Verification: ${checkedPurposes.length} purposes are checked (expected ${params.purposes.length})`);

        if (checkedPurposes.length === 0 && selectedCount === 0) {
            console.error('[CS] CRITICAL: Failed to select any purpose!');
            notifyStep('error', '❌ 利用目的の選択に失敗しました');
            return;
        }
    }

    // Step 4: Select areas
    if (params.areas && params.areas.length > 0) {
        // Try to reveal the area filter section
        const allElements = searchScope.querySelectorAll('button, a, span, div');
        for (const el of allElements) {
            const text = el.textContent.trim();
            if ((text.includes('区名') && text.includes('絞')) || text === '区名で絞り込む' || text.includes('区名などで絞り込む')) {
                el.click();
                await sleep(1500);
                console.log('[CS] Clicked area filter reveal button');
                break;
            }
        }

        for (const area of params.areas) {
            let checkbox = searchScope.querySelector(
                `input[name="HomeModel.SearchByDateTimeModel.SelectedArea"][value="${area.value}"]`
            );

            if (!checkbox) {
                checkbox = document.querySelector(
                    `input[name="HomeModel.SearchByDateTimeModel.SelectedArea"][value="${area.value}"]`
                );
            }

            if (checkbox && !checkbox.checked) {
                const label = checkbox.closest('label');
                if (label) {
                    label.click();
                } else {
                    checkbox.click();
                }
                triggerChange(checkbox);
                await sleep(300);
                console.log(`[CS] ✓ Selected area: ${area.label}`);
            }
        }
    }

    // Step 5: Set date range
    if (params.dateFrom) {
        const dateFromInput = searchScope.querySelector('input[name="HomeModel.DateFrom"]')
            || document.querySelector('input[name="HomeModel.DateFrom"]');
        if (dateFromInput) {
            setInputValue(dateFromInput, params.dateFrom);
            console.log('[CS] Set dateFrom:', params.dateFrom);
        }
    }

    if (params.dateTo) {
        const dateToInput = searchScope.querySelector('input[name="HomeModel.DateTo"]')
            || document.querySelector('input[name="HomeModel.DateTo"]');
        if (dateToInput) {
            setInputValue(dateToInput, params.dateTo);
            console.log('[CS] Set dateTo:', params.dateTo);
        }
    }

    // Step 6: Set time range
    if (params.timeFrom) {
        const timeFromSelect = searchScope.querySelector('#HomeModel_TimeFrom, select[name*="TimeFrom"]')
            || document.querySelector('#HomeModel_TimeFrom, select[name*="TimeFrom"]');
        if (timeFromSelect) {
            timeFromSelect.value = params.timeFrom;
            triggerChange(timeFromSelect);
            console.log('[CS] Set timeFrom:', params.timeFrom);
        }
    }

    if (params.timeTo) {
        const timeToSelect = searchScope.querySelector('#HomeModel_TimeTo, select[name*="TimeTo"]')
            || document.querySelector('#HomeModel_TimeTo, select[name*="TimeTo"]');
        if (timeToSelect) {
            timeToSelect.value = params.timeTo;
            triggerChange(timeToSelect);
            console.log('[CS] Set timeTo:', params.timeTo);
        }
    }

    // Step 7: Select days of week (利用曜日)
    const requestedDays = Array.isArray(params.daysOfWeek)
        ? Array.from(new Set(
            params.daysOfWeek
                .map(d => Number(d))
                .filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
        ))
        : [];
    const includeHoliday = params.includeHoliday === true;
    console.log('[CS] Requested DOW:', { raw: params.daysOfWeek, parsed: requestedDays, includeHoliday });

    const normalizeText = (str) => (str || '').replace(/\s+/g, '').toLowerCase();
    const getAssociatedLabel = (cb) => {
        if (cb.labels && cb.labels.length > 0) return cb.labels[0];
        const wrappedLabel = cb.closest('label');
        if (wrappedLabel) return wrappedLabel;
        if (cb.id && typeof CSS !== 'undefined' && CSS.escape) {
            const byFor = document.querySelector(`label[for="${CSS.escape(cb.id)}"]`);
            if (byFor) return byFor;
        }
        return cb.parentElement;
    };
    const getCheckboxText = (cb) => {
        const label = getAssociatedLabel(cb);
        return (label?.textContent || cb.getAttribute('aria-label') || '').trim();
    };
    const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return el.offsetParent !== null || style.position === 'fixed';
    };
    const isHolidayCheckbox = (cb) => {
        const labelText = getCheckboxText(cb).replace(/\s+/g, '');
        const meta = normalizeText(`${cb.name} ${cb.id} ${cb.value} ${labelText}`);
        return meta.includes('holiday') || meta.includes('祝日') || labelText === '祝' || labelText.includes('(祝)');
    };
    const detectDayNumber = (cb) => {
        const textNorm = normalizeText(getCheckboxText(cb));
        if (!textNorm) return null;

        const hasJpDay = (k) => textNorm.includes(`${k}曜日`) || textNorm.includes(`${k}曜`) || textNorm === k;
        const jpDaysPresent = ['月', '火', '水', '木', '金', '土', '日'].filter(hasJpDay);
        // Ambiguous text (e.g. whole container includes all weekdays) should not be used for mapping.
        if (jpDaysPresent.length === 1) {
            const one = jpDaysPresent[0];
            if (one === '月') return 1;
            if (one === '火') return 2;
            if (one === '水') return 3;
            if (one === '木') return 4;
            if (one === '金') return 5;
            if (one === '土') return 6;
            if (one === '日') return 0;
        }

        const metaLower = `${cb.name || ''} ${cb.id || ''} ${cb.value || ''}`.toLowerCase();
        if (/(^|[^a-z])monday([^a-z]|$)|(^|[^a-z])mon([^a-z]|$)/.test(metaLower)) return 1;
        if (/(^|[^a-z])tuesday([^a-z]|$)|(^|[^a-z])tue([^a-z]|$)/.test(metaLower)) return 2;
        if (/(^|[^a-z])wednesday([^a-z]|$)|(^|[^a-z])wed([^a-z]|$)/.test(metaLower)) return 3;
        if (/(^|[^a-z])thursday([^a-z]|$)|(^|[^a-z])thu([^a-z]|$)/.test(metaLower)) return 4;
        if (/(^|[^a-z])friday([^a-z]|$)|(^|[^a-z])fri([^a-z]|$)/.test(metaLower)) return 5;
        if (/(^|[^a-z])saturday([^a-z]|$)|(^|[^a-z])sat([^a-z]|$)/.test(metaLower)) return 6;
        if (/(^|[^a-z])sunday([^a-z]|$)|(^|[^a-z])sun([^a-z]|$)/.test(metaLower)) return 0;
        return null;
    };
    const clickCheckbox = async (cb, checked) => {
        if (!cb || cb.checked === checked) return;
        const label = getAssociatedLabel(cb);
        if (label && isVisible(label)) {
            label.click();
        } else {
            cb.click();
        }
        // Fallback: enforce state if click did not toggle (common with custom UI wrappers)
        if (cb.checked !== checked) {
            cb.checked = checked;
        }
        triggerChange(cb);
        await sleep(200);
    };

    const shouldApplyDowFilter = Array.isArray(params.daysOfWeek) || includeHoliday;
    let dowGroupCheckboxes = Array.from(searchScope.querySelectorAll('input[name="HomeModel.SelectedWeekDays"]'));

    if (dowGroupCheckboxes.length === 0) {
        const allCheckboxes = Array.from(searchScope.querySelectorAll('input[type="checkbox"]'));
        const checkboxPool = allCheckboxes.length > 0
            ? allCheckboxes
            : Array.from(document.querySelectorAll('input[type="checkbox"]'));
        const candidateCheckboxes = checkboxPool.filter(cb => {
            const meta = `${cb.name} ${cb.id}`;
            return /dayofweek|weekday|youbi|曜日/i.test(meta) || detectDayNumber(cb) !== null || isHolidayCheckbox(cb);
        });

        const visibleCandidateCheckboxes = candidateCheckboxes.filter(cb => {
            const container = getAssociatedLabel(cb) || cb.parentElement || cb;
            return isVisible(cb) || isVisible(container);
        });
        dowGroupCheckboxes = visibleCandidateCheckboxes.length > 0
            ? visibleCandidateCheckboxes
            : candidateCheckboxes;
    }

    if (dowGroupCheckboxes.length > 0 && shouldApplyDowFilter) {
        const isYokohamaWeekdayGroup = dowGroupCheckboxes.every(cb => cb.name === 'HomeModel.SelectedWeekDays');
        if (isYokohamaWeekdayGroup) {
            // Yokohama site mapping: 1=Mon ... 6=Sat, 7=Sun, 8=Holiday
            const desiredValues = requestedDays.map(d => String(d === 0 ? 7 : d));
            if (includeHoliday) desiredValues.push('8');

            for (const cb of dowGroupCheckboxes) {
                await clickCheckbox(cb, false);
            }

            for (const val of desiredValues) {
                const target = dowGroupCheckboxes.find(cb => String(cb.value).trim() === val);
                if (target) {
                    await clickCheckbox(target, true);
                    console.log(`[CS] ✓ Selected week day by value: ${val} (${getCheckboxText(target)})`);
                } else {
                    console.warn(`[CS] ✗ Weekday checkbox value not found: ${val}`);
                }
            }

            const checkedBoxes = dowGroupCheckboxes.filter(cb => cb.checked);
            console.log(
                `[CS] Day-of-week selection complete (Yokohama mapping), checked ${checkedBoxes.length} checkbox(es):`,
                checkedBoxes.map(cb => `${getCheckboxText(cb)}(value=${cb.value})`)
            );
        } else {
        const pickUnused = (list, usedSet) => (list || []).find(cb => !usedSet.has(cb)) || null;

        const dayToCheckboxes = new Map();
        for (const cb of dowGroupCheckboxes) {
            const dayNum = detectDayNumber(cb);
            if (dayNum === null) continue;
            if (!dayToCheckboxes.has(dayNum)) {
                dayToCheckboxes.set(dayNum, []);
            }
            dayToCheckboxes.get(dayNum).push(cb);
        }
        const holidayCheckboxes = dowGroupCheckboxes.filter(isHolidayCheckbox);

        const selectedTargets = [];
        const used = new Set();

        for (const dayNum of requestedDays) {
            let target = pickUnused(dayToCheckboxes.get(dayNum), used);

            // Numeric fallback for pages where labels are not readable
            if (!target) {
                target = pickUnused(
                    dowGroupCheckboxes.filter(cb => !isHolidayCheckbox(cb) && String(cb.value).trim() === String(dayNum)),
                    used
                );
            }

            if (target) {
                selectedTargets.push(target);
                used.add(target);
                console.log(`[CS] ✓ Matched day target: ${dayNum} -> "${getCheckboxText(target)}" (value=${target.value})`);
            } else {
                console.warn(`[CS] ✗ Day checkbox not matched: ${dayNum}`);
            }
        }

        if (includeHoliday) {
            const holidayTarget = pickUnused(holidayCheckboxes, used);
            if (holidayTarget) {
                selectedTargets.push(holidayTarget);
                used.add(holidayTarget);
                console.log(`[CS] ✓ Matched holiday target -> "${getCheckboxText(holidayTarget)}" (value=${holidayTarget.value})`);
            } else {
                console.warn('[CS] ✗ Holiday checkbox not matched');
            }
        }

        const explicitSelectionRequested = requestedDays.length > 0 || includeHoliday;
        if (explicitSelectionRequested && selectedTargets.length === 0) {
            console.warn('[CS] No valid weekday/holiday targets found; keeping existing checkbox state');
        } else {
            // Reset weekday/holiday group first, then apply selected targets
            for (const cb of dowGroupCheckboxes) {
                await clickCheckbox(cb, false);
            }
            for (const cb of selectedTargets) {
                await clickCheckbox(cb, true);
            }
        }

        const checkedBoxes = dowGroupCheckboxes.filter(cb => cb.checked);
        console.log(
            `[CS] Day-of-week selection complete, checked ${checkedBoxes.length} checkbox(es):`,
            checkedBoxes.map(cb => `${getCheckboxText(cb)}(value=${cb.value})`)
        );
        }
    } else {
        console.log('[CS] No day-of-week checkboxes found or no day filter specified, skipping');
    }

    // Step 8: Select search target: 空きコマ (available slots)
    const radioButtons = searchScope.querySelectorAll('input[type="radio"]');
    for (const radio of radioButtons) {
        const label = radio.closest('label') || radio.parentElement;
        if (label && label.textContent.includes('空きコマ')) {
            if (!radio.checked) {
                radio.click();
                triggerChange(radio);
                console.log('[CS] Selected search target: 空きコマ');
            }
            break;
        }
    }

    await sleep(1000);
    await updateTaskStep('facilitySelect');

    // Step 9: Click the search button in date/time tab
    await ensureDateTimeSearchTabActive();
    const finalSearchScope = getDateTimeSearchPanel() || searchScope || document;
    console.log('[CS] Looking for search button...');
    const searchBtn = findSearchButton(finalSearchScope);
    if (searchBtn) {
        console.log('[CS] Found search button, clicking...');
        searchBtn.click();
    } else {
        console.error('[CS] Search button not found!');
        notifyStep('error', '❌ 検索ボタンが見つかりません');
    }
}

function setInputValue(input, value) {
    // For date inputs, we need to use the native setter
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeInputValueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function findSearchButton(preferredScope = null) {
    console.log('[CS] Searching for 検索 button...');

    // Strategy 1: explicit preferred scope
    if (preferredScope) {
        const btns = preferredScope.querySelectorAll('button, input[type="button"], input[type="submit"]');
        for (const btn of btns) {
            const text = (btn.textContent || btn.value || '').trim();
            if (text.includes('検索')) {
                console.log('[CS] Found search button in preferred scope');
                return btn;
            }
        }
    }

    // Strategy 2: Find the search button inside the ACTIVE tab pane
    const activeTab = getActiveSearchTab();
    if (activeTab) {
        const controls = activeTab.getAttribute('aria-controls');
        const activePane = controls ? document.getElementById(controls) : null;
        const pane = activePane || document.querySelector('.tab-pane.active, .tab-pane.show, [role="tabpanel"][class*="active"]');
        const btns = pane ? pane.querySelectorAll('button, input[type="button"], input[type="submit"]') : [];
        for (const btn of btns) {
            const text = (btn.textContent || btn.value || '').trim();
            if (text.includes('検索')) {
                console.log('[CS] Found search button in active tab pane');
                return btn;
            }
        }
    }

    // Strategy 3: Find button with class containing 検索 text
    // that is NOT hidden (display:none or visibility:hidden)
    const allSearchBtns = [];
    document.querySelectorAll('button.btn-secondary, button.btn-primary').forEach(btn => {
        if (btn.textContent.includes('検索')) {
            allSearchBtns.push(btn);
        }
    });

    console.log(`[CS] Found ${allSearchBtns.length} candidate search buttons`);

    if (allSearchBtns.length > 0) {
        // Try to find the one that's not hidden
        for (const btn of allSearchBtns) {
            const style = window.getComputedStyle(btn);
            const parentStyle = window.getComputedStyle(btn.parentElement);
            const grandparent = btn.parentElement?.parentElement;
            const gpStyle = grandparent ? window.getComputedStyle(grandparent) : null;

            // Check if button itself and its ancestors are not display:none
            if (style.display !== 'none' && parentStyle.display !== 'none' &&
                (!gpStyle || gpStyle.display !== 'none')) {
                console.log('[CS] Found visible search button via style check');
                return btn;
            }
        }

        // In background tabs, computed styles might also fail
        // Fallback: pick the first one (the default/active tab's button)
        console.log('[CS] Style check inconclusive, using first candidate');
        return allSearchBtns[0];
    }

    // Strategy 4: Broadest search - any element with 検索 text
    const allElements = document.querySelectorAll('button, input[type="submit"], a, [role="button"]');
    for (const el of allElements) {
        const text = (el.textContent || el.value || '').trim();
        if (text.includes('検索')) {
            console.log('[CS] Found search element via broad search:', el.tagName, text);
            return el;
        }
    }

    console.error('[CS] No search button found at all!');
    return null;
}

// ===== Step 2: Facility Selection =====
async function stepSelectFacility(_task) {
    console.log('[CS] Step: Facility Selection');
    notifyStep('facilitySelect', '施設を選択中...');

    // The facility page shows all matching facilities with checkboxes or radio buttons
    // Select facilities based on area preferences
    const facilityInputs = document.querySelectorAll(
        'input[type="checkbox"][name*="facility"], input[type="radio"][name*="facility"], ' +
        'input[type="checkbox"][name*="Facility"], input[type="radio"][name*="Facility"]'
    );

    if (facilityInputs.length > 0) {
        // Check available facility checkboxes
        let selectedCount = 0;
        facilityInputs.forEach(input => {
            if (!input.checked && !input.disabled) {
                input.click();
                triggerChange(input);
                selectedCount++;
            }
        });
        console.log(`[CS] Selected ${selectedCount} facilities`);
    } else {
        // Try alternative: look for any checkboxes on the page that seem to be facility selections
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        let selectedCount = 0;
        checkboxes.forEach(cb => {
            const label = cb.closest('label') || cb.parentElement;
            const text = label?.textContent || '';
            // Select if it looks like a facility name (contains センター, 体育館, etc.)
            if (text.includes('センター') || text.includes('体育館') || text.includes('スポーツ') ||
                text.includes('公園') || text.includes('施設')) {
                if (!cb.checked && !cb.disabled) {
                    cb.click();
                    triggerChange(cb);
                    selectedCount++;
                }
            }
        });

        if (selectedCount === 0) {
            // Fallback: just select all available checkboxes
            checkboxes.forEach(cb => {
                if (!cb.checked && !cb.disabled) {
                    cb.click();
                    triggerChange(cb);
                    selectedCount++;
                }
            });
        }
        console.log(`[CS] Selected ${selectedCount} facilities (fallback mode)`);
    }

    await sleep(1000);
    await updateTaskStep('calendar');

    // Click "次へ進む" (Next)
    if (!clickButton('次へ進む')) {
        clickButton('次へ');
    }
}

// ===== Step 3: Availability Calendar =====
async function stepAvailabilityCalendar(task) {
    console.log('[CS] Step: Availability Calendar');
    notifyStep('calendar', '空き状況を確認中...');

    const params = task.params;
    const pageText = document.body?.textContent || '';
    if (pageText.includes('条件に該当する施設はありません')) {
        console.log('[CS] No facilities matched the search condition');
        sendAvailabilityResults([]);
        return;
    }

    // Analyze the availability table/grid
    // Look for available slots marked with 〇, ○, or the circle icon
    const allLabels = document.querySelectorAll('label, td');
    const availableSlots = [];

    allLabels.forEach(el => {
        const text = el.textContent.trim();
        const classes = el.className || '';
        const isDisabled = classes.includes('disabled') || el.closest('.disabled');

        // Check for availability icons
        const hasCircle = el.querySelector('.fa-circle-o, .fa-circle, [class*="circle"]');
        const hasTimes = el.querySelector('.fa-times, [class*="times"]');
        const hasTriangle = el.querySelector('.fa-triangle, [class*="triangle"]');

        if ((text === '〇' || text === '○' || text === 'O' || hasCircle ||
            text.includes('空きあり') || text.includes('空き')) && !isDisabled) {
            availableSlots.push({
                element: el,
                text: text,
                parentText: el.closest('tr')?.textContent?.substring(0, 100) || ''
            });
        } else if (text === '△' || hasTriangle) {
            availableSlots.push({
                element: el,
                text: '△',
                parentText: el.closest('tr')?.textContent?.substring(0, 100) || ''
            });
        }
    });

    // Also check for toggle buttons (btn-toggle) which represent slots
    const toggleBtns = document.querySelectorAll('.btn-toggle, [class*="btn-toggle"]');
    toggleBtns.forEach(btn => {
        const isDisabled = btn.classList.contains('disabled') || btn.hasAttribute('disabled');
        if (!isDisabled) {
            const text = btn.textContent.trim();
            if (text !== '✕' && text !== '×' && text !== '―' && text !== '-') {
                availableSlots.push({
                    element: btn,
                    text: text || '〇',
                    parentText: btn.closest('tr')?.textContent?.substring(0, 100) || ''
                });
            }
        }
    });

    console.log(`[CS] Found ${availableSlots.length} available slots`);

    // Build results summary
    const facilityNames = [];
    document.querySelectorAll('h2, h3, h4').forEach(h => {
        const text = h.textContent.trim();
        if (text.includes('センター') || text.includes('スポーツ') || text.includes('体育')) {
            facilityNames.push(text);
        }
    });

    // If we found available slots, apply day-of-week filter
    let filteredSlots = availableSlots;
    if (params.daysOfWeek && params.daysOfWeek.length < 7) {
        // Try to filter by day of week from the calendar headers
        // The calendar shows dates with day labels
        filteredSlots = availableSlots.filter(slot => {
            // Try to find the date from the column header
            const th = getColumnHeader(slot.element);
            if (th) {
                const dayMatch = th.textContent.match(/(月|火|水|木|金|土|日)/);
                if (dayMatch) {
                    const dayMap = { '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6 };
                    const dayNum = dayMap[dayMatch[1]];
                    return params.daysOfWeek.includes(dayNum);
                }
            }
            return true; // Keep if we can't determine the day
        });
    }

    // Report results to background
    const resultData = facilityNames.map(name => ({
        facility: name,
        available: filteredSlots.filter(s => {
            const parent = s.element.closest('section, div, article');
            return parent ? parent.textContent.includes(name) : true;
        }).map(s => ({
            text: s.text,
            info: s.parentText
        }))
    }));

    // If no specific facility grouping, report generically
    if (facilityNames.length === 0 && filteredSlots.length > 0) {
        resultData.push({
            facility: '検索結果',
            available: filteredSlots.map(s => ({
                text: s.text,
                info: s.parentText
            }))
        });
    }

    sendAvailabilityResults(resultData);

    // If there are available slots, click the first one to highlight / select
    if (filteredSlots.length > 0 && filteredSlots[0].element) {
        // Add visual highlighting
        filteredSlots.forEach(slot => {
            slot.element.style.outline = '3px solid #22c55e';
            slot.element.style.outlineOffset = '2px';
            slot.element.style.boxShadow = '0 0 12px rgba(34, 197, 94, 0.5)';
        });
    }
}

function getColumnHeader(element) {
    // Try to find the column header (th) for the given element in a table
    const cell = element.closest('td');
    if (!cell) return null;

    const row = cell.closest('tr');
    if (!row) return null;

    const cellIndex = Array.from(row.children).indexOf(cell);
    const table = cell.closest('table');
    if (!table) return null;

    const headerRow = table.querySelector('thead tr, tr:first-child');
    if (!headerRow) return null;

    return headerRow.children[cellIndex] || null;
}

// ===== Step 4: Time Slot Selection =====
async function stepTimeSlotSelection(_task) {
    console.log('[CS] Step: Time Slot Selection');
    notifyStep('timeSlot', '時間帯を確認中...');

    // Similar to calendar - analyze available time slots
    const availableSlots = [];

    // Look for available time slot elements
    const toggleBtns = document.querySelectorAll('.btn-toggle:not(.disabled), label:not(.disabled)');
    toggleBtns.forEach(btn => {
        const text = btn.textContent.trim();
        if (text.includes('〇') || text.includes('○') || text === 'O') {
            availableSlots.push(btn);
        }
    });

    // Highlight available slots
    availableSlots.forEach(slot => {
        slot.style.outline = '3px solid #22c55e';
        slot.style.outlineOffset = '2px';
        slot.style.boxShadow = '0 0 12px rgba(34, 197, 94, 0.5)';
    });

    // Report results
    sendAvailabilityResults([{
        facility: document.querySelector('h2, h3')?.textContent?.trim() || '施設',
        available: availableSlots.map(s => ({
            text: s.textContent.trim(),
            info: s.closest('tr')?.textContent?.substring(0, 100) || ''
        }))
    }]);
}

// ===== Step 5: Auto Login =====
async function stepAutoLogin(_task) {
    console.log('[CS] Step: Auto Login');
    notifyStep('login', 'ログイン中...');

    const settings = await chrome.storage.local.get(['loginId', 'loginPw']);

    if (settings.loginId && settings.loginPw) {
        const userInput = document.querySelector(
            'input[name*="userId"], input[name*="UserId"], input[name*="loginId"], input[name*="LoginId"], ' +
            'input[type="text"][id*="user"], input[type="text"][id*="User"], input[type="text"][id*="login"]'
        );
        const pwInput = document.querySelector(
            'input[type="password"]'
        );

        if (userInput && pwInput) {
            setInputValue(userInput, settings.loginId);
            await sleep(300);
            setInputValue(pwInput, settings.loginPw);
            await sleep(300);

            // Click login button
            if (!clickButton('ログイン')) {
                clickButton('Login');
            }
        }
    } else {
        notifyStep('login', 'ログイン情報が設定されていません。手動でログインしてください。');
    }
}
