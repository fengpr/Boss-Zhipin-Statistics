// ==UserScript==
// @name         Boss直聘投递统计
// @namespace    http://tampermonkey.net/
// @version      2.7
// @author       fpr
// @description  彻底修复最小化后面板粘连鼠标的问题，优化拖拽判定
// @match        https://www.zhipin.com/web/geek/chat*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'boss_stats_data_v2.8';
    const POS_KEY = 'boss_stats_panel_pos';

    // --- 1. 数据初始化与跨天平移逻辑 ---
    function getInitialData() {
        const now = new Date().toLocaleDateString();
        const raw = localStorage.getItem(STORAGE_KEY);

        let data = raw ? JSON.parse(raw) : {
            lastDate: now,
            today: { hi: [], res: [] },
            yesterday: { hi: [], res: [] },
            other: { hi: [], res: [] }
        };

        if (data.lastDate !== now) {
            const lastDateObj = new Date(data.lastDate);
            const nowDateObj = new Date(now);
            const diffDays = Math.floor((nowDateObj - lastDateObj) / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                data.other.hi = Array.from(new Set([...data.other.hi, ...data.yesterday.hi]));
                data.other.res = Array.from(new Set([...data.other.res, ...data.yesterday.res]));
                data.yesterday = data.today;
                data.today = { hi: [], res: [] };
            } else {
                data.other.hi = Array.from(new Set([...data.other.hi, ...data.yesterday.hi, ...data.today.hi]));
                data.other.res = Array.from(new Set([...data.other.res, ...data.yesterday.res, ...data.today.res]));
                data.yesterday = { hi: [], res: [] };
                data.today = { hi: [], res: [] };
            }
            data.lastDate = now;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
        return data;
    }

    const savedData = getInitialData();
    const dailyStats = {
        today: { hi: new Set(savedData.today.hi), res: new Set(savedData.today.res) },
        yesterday: { hi: new Set(savedData.yesterday.hi), res: new Set(savedData.yesterday.res) },
        other: { hi: new Set(savedData.other.hi), res: new Set(savedData.other.res) }
    };

    function saveData() {
        const dataToStore = {
            lastDate: new Date().toLocaleDateString(),
            today: { hi: Array.from(dailyStats.today.hi), res: Array.from(dailyStats.today.res) },
            yesterday: { hi: Array.from(dailyStats.yesterday.hi), res: Array.from(dailyStats.yesterday.res) },
            other: { hi: Array.from(dailyStats.other.hi), res: Array.from(dailyStats.other.res) }
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore));
    }

    // --- 2. 核心扫描逻辑 ---
    function scanList() {
        const items = document.querySelectorAll('li[role="listitem"]');
        if (items.length === 0) return;

        const filterEl = document.querySelector('.ui-dropmenu-label .label-name');
        const isExchangedFilter = filterEl ? filterEl.innerText.includes('有交换') : false;

        let changedKey = null;

        items.forEach((item) => {
            const name = item.querySelector('.name')?.innerText || "";
            const company = item.querySelector('.company-text')?.innerText || "";
            const uid = (name + company).trim() || item.innerText.slice(0, 50);
            if (!uid || uid.length < 2) return;

            const timeText = item.querySelector('.time')?.innerText || "";
            let dayKey = "other";

            if (timeText.includes(':')) dayKey = "today";
            else if (timeText.includes('昨天')) dayKey = "yesterday";

            let itemChanged = false;
            if (!dailyStats[dayKey].hi.has(uid)) {
                dailyStats[dayKey].hi.add(uid);
                itemChanged = true;
            }
            if (isExchangedFilter && !dailyStats[dayKey].res.has(uid)) {
                dailyStats[dayKey].res.add(uid);
                itemChanged = true;
            }

            if(itemChanged) changedKey = dayKey;
        });

        if (changedKey) {
            saveData();
            updatePanel(changedKey, true);
        }
    }

    // --- 3. UI 逻辑 ---
    function createUI() {
        if(document.getElementById('stat-panel')) return;
        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes blink-yellow { 0% { color: #fff; } 50% { color: #fff200; transform: scale(1.1); } 100% { color: #fff; } }
            .stat-update { animation: blink-yellow 0.5s ease; }
            @keyframes breathe { 0% { opacity: 0.3; } 50% { opacity: 1; } 100% { opacity: 0.3; } }
            .breathe-dot { width: 8px; height: 8px; background: #52c41a; border-radius: 50%; display: inline-block; margin-right: 5px; animation: breathe 2s infinite; }
            #stat-panel.collapsed { width: 44px !important; min-width: 44px !important; height: 44px !important; padding: 0 !important; border-radius: 50% !important; display: flex !important; align-items: center; justify-content: center; overflow: hidden; cursor: pointer !important; }
        `;
        document.head.appendChild(style);

        const panel = document.createElement('div');
        panel.id = 'stat-panel';
        const savedPos = JSON.parse(localStorage.getItem(POS_KEY) || '{"bottom":"80px","right":"30px"}');
        panel.style.cssText = `position:fixed; z-index:10000; background:#00bebd; color:white; padding:15px; border-radius:12px; box-shadow:0 6px 20px rgba(0,0,0,0.4); min-width:210px; font-family:sans-serif; font-size:13px; cursor:default; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); touch-action: none;`;
        Object.assign(panel.style, savedPos);
        document.body.appendChild(panel);

        setupDragAndClick(panel);
        updatePanel(null, false);
    }

    function setupDragAndClick(el) {
        let isDragging = false;
        let startX, startY, startRight, startBottom;

        const onMouseDown = (e) => {
            if (e.target.id === 'clear-stats-btn' || e.target.id === 'toggle-btn') return;
            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = el.getBoundingClientRect();
            startRight = window.innerWidth - rect.right;
            startBottom = window.innerHeight - rect.bottom;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            el.style.transition = 'none';
        };

        const onMouseMove = (e) => {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) isDragging = true;
            if (isDragging) {
                el.style.right = (startRight - dx) + 'px';
                el.style.bottom = (startBottom - dy) + 'px';
            }
        };

        const onMouseUp = (e) => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            el.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            if (!isDragging) {
                if (el.classList.contains('collapsed') || e.target.id === 'toggle-btn') togglePanel();
            } else {
                localStorage.setItem(POS_KEY, JSON.stringify({ right: el.style.right, bottom: el.style.bottom }));
            }
            isDragging = false;
        };
        el.addEventListener('mousedown', onMouseDown);
    }

    function togglePanel() {
        const panel = document.getElementById('stat-panel');
        if (!panel.classList.contains('collapsed')) {
            panel.classList.add('collapsed');
            panel.innerHTML = `<div style="font-size:22px; user-select:none;">📊</div>`;
        } else {
            panel.classList.remove('collapsed');
            updatePanel(null, false);
        }
    }

    function updatePanel(changedKey, highlight = false) {
        const panel = document.getElementById('stat-panel');
        if (!panel || panel.classList.contains('collapsed')) return;

        const totalHi = dailyStats.today.hi.size + dailyStats.yesterday.hi.size + dailyStats.other.hi.size;
        const totalRes = dailyStats.today.res.size + dailyStats.yesterday.res.size + dailyStats.other.res.size;

        const getAnimClass = (key) => (highlight && changedKey === key) ? 'stat-update' : '';

        panel.innerHTML = `
            <div id="stat-header" style="font-weight:bold; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.3); padding-bottom:5px; display:flex; justify-content:space-between; align-items:center; cursor:move; user-select:none;">
                <span style="font-size:14px;"><span class="breathe-dot"></span>求职战报</span>
                <span id="toggle-btn" style="cursor:pointer; font-size:22px; padding:0 5px; line-height:1;">−</span>
            </div>
            <table style="width:100%; text-align:left; border-spacing: 0 5px; pointer-events:none;">
                <tr style="color:#fff200; font-weight:bold; font-size:11px;">
                    <td style="width:40%;">时间</td><td>招呼</td><td>简历</td>
                </tr>
                <tr>
                    <td>今天</td>
                    <td class="${getAnimClass('today')}">${dailyStats.today.hi.size}</td>
                    <td class="${getAnimClass('today')}">${dailyStats.today.res.size}</td>
                </tr>
                <tr>
                    <td>昨天</td>
                    <td class="${getAnimClass('yesterday')}">${dailyStats.yesterday.hi.size}</td>
                    <td class="${getAnimClass('yesterday')}">${dailyStats.yesterday.res.size}</td>
                </tr>
                <tr style="opacity:0.6;">
                    <td>更早</td>
                    <td class="${getAnimClass('other')}">${dailyStats.other.hi.size}</td>
                    <td class="${getAnimClass('other')}">${dailyStats.other.res.size}</td>
                </tr>
            </table>
            <div style="margin-top:10px; padding-top:8px; border-top:1px dashed rgba(255,255,255,0.5); pointer-events:none;">
                <div style="display:flex; justify-content:space-between;">
                    <span>👋 总招呼:</span>
                    <b class="${highlight ? 'stat-update' : ''}">${totalHi}</b>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:3px;">
                    <span>📄 总简历:</span>
                    <b style="color:#fff200; font-size:16px;" class="${highlight ? 'stat-update' : ''}">${totalRes}</b>
                </div>
            </div>
            <button id="clear-stats-btn" style="margin-top:10px; width:100%; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; border-radius:4px; padding:2px; cursor:pointer; font-size:10px; position:relative; z-index:10;">清空历史</button>
        `;

        document.getElementById('clear-stats-btn').onclick = (e) => {
            e.stopPropagation();
            if(confirm('清空所有记录？')){ localStorage.removeItem(STORAGE_KEY); location.reload(); }
        };
    }

    createUI();
    setInterval(scanList, 1000);
})();