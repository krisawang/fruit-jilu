/**
 * 每日水果成本记账与对比 App 核心逻辑 (v2.0 多角色登录与全员共享版)
 * 支持：
 * 1. 手机号/账号登录与注册（区分「采购管理员」可录价改价 vs「普通成员/店员」只读看价防误改）
 * 2. 每日水果成本录入、自动对比昨日涨跌额与涨跌幅
 * 3. 自定义水果种类、计价单位（斤/公斤/箱/件等）、按日期补录与往期查询
 * 4. 历史价格趋势 SVG 折线图、Excel(CSV)导出、联网实时共享同步
 */

const STORAGE_KEY = 'FRUIT_PRICE_TRACKER_DATA_V1';
const CLOUD_CONFIG_KEY = 'FRUIT_PRICE_CLOUD_CONFIG_V1';
const USERS_STORAGE_KEY = 'FRUIT_PRICE_USERS_V1';
const SESSION_STORAGE_KEY = 'FRUIT_PRICE_CURRENT_USER_V1';

const EMOJI_LIST = [
  '🍎', '🍏', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇',
  '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥',
  '🥝', '🍅', '🥑', '🍈', '🍋‍🟩', '🫒', '🌰', '🧺'
];

const UNIT_OPTIONS = ['元/斤', '元/公斤', '元/箱', '元/件', '元/筐', '元/盒', '元/个'];

const DEFAULT_USERS = [
  {
    id: 'u_admin_1',
    account: '13800000001',
    password: '123456',
    name: '张店长(采购员)',
    role: 'admin',
    storeCode: '8888'
  },
  {
    id: 'u_viewer_1',
    account: '13800000002',
    password: '123456',
    name: '小李(门店店员)',
    role: 'viewer',
    storeCode: '8888'
  },
  {
    id: 'u_viewer_2',
    account: '13800000003',
    password: '123456',
    name: '小王(收银店员)',
    role: 'viewer',
    storeCode: '8888'
  }
];

// 全局状态
let appState = {
  currentUser: null, // { id, account, name, role: 'admin'|'viewer', storeCode }
  users: [],
  selectedDate: getTodayStr(),
  selectedCategory: '全部',
  statusFilter: 'all', // all | up | down | flat
  searchQuery: '',
  trendFruitId: '',
  trendDays: 7,
  selectedEmoji: '🍎',
  fruits: [],
  // records: { "YYYY-MM-DD": { [fruitId]: { price: 5.5, note: "A级果", updatedBy: "张店长", updatedAt: 1700000000 } } }
  records: {}
};

function isAdmin() {
  return appState.currentUser && appState.currentUser.role === 'admin';
}

// ==================== 日期工具函数 ====================
function formatDateStr(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayStr() {
  return formatDateStr(new Date());
}

function addDays(dateStr, offsetDays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + offsetDays);
  return formatDateStr(dt);
}

function getRelativeDayLabel(dateStr) {
  const today = getTodayStr();
  if (dateStr === today) return '今天';
  if (dateStr === addDays(today, -1)) return '昨天';
  if (dateStr === addDays(today, -2)) return '前天';
  if (dateStr > today) return '未来日期';
  return '历史记录';
}

// ==================== 默认演示数据生成 ====================
function createDefaultDemoData() {
  const today = getTodayStr();
  const defaultFruits = [
    { id: 'f_apple', name: '烟台红富士', emoji: '🍎', unit: '元/斤', category: '日常水果' },
    { id: 'f_orange', name: '广西砂糖橘', emoji: '🍊', unit: '元/斤', category: '时令鲜果' },
    { id: 'f_grape', name: '阳光玫瑰青提', emoji: '🍇', unit: '元/斤', category: '时令鲜果' },
    { id: 'f_straw', name: '丹东奶油草莓', emoji: '🍓', unit: '元/斤', category: '时令鲜果' },
    { id: 'f_banana', name: '海南香蕉', emoji: '🍌', unit: '元/斤', category: '日常水果' },
    { id: 'f_melon', name: '麒麟西瓜', emoji: '🍉', unit: '元/斤', category: '瓜果类' },
    { id: 'f_mango', name: '海南贵妃芒', emoji: '🥭', unit: '元/箱', category: '整箱批发' },
    { id: 'f_pear', name: '库尔勒香梨', emoji: '🍐', unit: '元/箱', category: '整箱批发' },
    { id: 'f_cherry', name: '进口车厘子(JJ)', emoji: '🍒', unit: '元/箱', category: '进口精品' },
    { id: 'f_kiwi', name: '翠香绿心猕猴桃', emoji: '🥝', unit: '元/斤', category: '日常水果' }
  ];

  const priceSeries = {
    f_apple:  [4.20, 4.20, 4.30, 4.50, 4.40, 4.50, 4.80],
    f_orange: [3.80, 3.60, 3.50, 3.50, 3.40, 3.50, 3.20],
    f_grape:  [9.50, 9.80, 9.50, 9.20, 9.00, 8.80, 8.50],
    f_straw:  [15.0, 14.5, 14.8, 15.5, 16.0, 15.8, 16.5],
    f_banana: [2.60, 2.60, 2.50, 2.50, 2.60, 2.60, 2.60],
    f_melon:  [2.80, 2.90, 3.00, 3.10, 3.00, 2.90, 3.10],
    f_mango:  [48.0, 48.0, 46.0, 45.0, 46.0, 46.0, 44.0],
    f_pear:   [55.0, 55.0, 54.0, 54.0, 56.0, 55.0, 55.0],
    f_cherry: [260,  255,  250,  248,  245,  240,  235],
    f_kiwi:   [5.50, 5.50, 5.60, 5.80, 5.60, 5.50, 5.50]
  };

  const notesToday = {
    f_apple: '一级果80#，产地雨天微涨',
    f_orange: '今日大车到货充足，降0.3元',
    f_grape: '精品无核套袋',
    f_straw: '周末需求旺，进价上调',
    f_cherry: '5斤装原箱到货'
  };

  const records = {};
  for (let i = 6; i >= 0; i--) {
    const dStr = addDays(today, -i);
    records[dStr] = {};
    const idx = 6 - i;
    defaultFruits.forEach((f) => {
      const val = priceSeries[f.id] ? priceSeries[f.id][idx] : null;
      if (val !== null && val !== undefined) {
        records[dStr][f.id] = {
          price: Number(val),
          note: i === 0 && notesToday[f.id] ? notesToday[f.id] : '',
          updatedBy: '张店长(采购员)',
          updatedAt: Date.now()
        };
      }
    });
  }

  return {
    fruits: defaultFruits,
    records
  };
}

// ==================== 用户与权限管理 ====================
function loadUsersAndSession() {
  try {
    const rawUsers = localStorage.getItem(USERS_STORAGE_KEY);
    if (!rawUsers) {
      appState.users = [...DEFAULT_USERS];
      saveUsersToStorage();
    } else {
      const parsed = JSON.parse(rawUsers);
      appState.users = Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_USERS];
    }

    const rawSession = localStorage.getItem(SESSION_STORAGE_KEY);
    if (rawSession) {
      appState.currentUser = JSON.parse(rawSession);
    }
  } catch (e) {
    appState.users = [...DEFAULT_USERS];
  }
}

function saveUsersToStorage() {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(appState.users));
}

function loginWithUser(userObj, storeCode = '8888') {
  appState.currentUser = {
    id: userObj.id,
    account: userObj.account,
    name: userObj.name,
    role: userObj.role,
    storeCode: storeCode || userObj.storeCode || '8888'
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(appState.currentUser));
  document.getElementById('loginScreen').classList.add('hidden');
  applyRolePermissionsUI();
  renderAll();
  // 登录后自动尝试从共享服务端拉取一次最新报价
  tryAutoSyncFromLocalServer();
}

function logoutCurrentUser() {
  appState.currentUser = null;
  localStorage.removeItem(SESSION_STORAGE_KEY);
  document.getElementById('loginScreen').classList.remove('hidden');
}

function applyRolePermissionsUI() {
  const user = appState.currentUser;
  const loginScreen = document.getElementById('loginScreen');
  if (!user) {
    loginScreen.classList.remove('hidden');
    return;
  }
  loginScreen.classList.add('hidden');

  const adminMode = isAdmin();

  // 控制所有 .admin-only 元素的显隐
  document.querySelectorAll('.admin-only').forEach((el) => {
    el.classList.toggle('hidden', !adminMode);
  });

  // 更新顶部栏用户胶囊与店铺编号
  document.getElementById('headerStoreBadge').textContent = `店铺#${user.storeCode || '8888'}`;
  document.getElementById('currentUserRoleIcon').textContent = adminMode ? '👑' : '👀';
  document.getElementById('currentUserNameText').textContent = user.name;

  // 更新角色状态提示条
  const roleBar = document.getElementById('roleStatusBar');
  const roleBarText = document.getElementById('roleBarLeftText');
  roleBar.classList.toggle('viewer-mode', !adminMode);
  if (adminMode) {
    roleBarText.innerHTML = `👑 <strong>管理员录入模式</strong>（${escapeHtml(user.name)}）：可直接录入修改每日成本价`;
    document.getElementById('tabDailyLabel').textContent = '今日记价';
  } else {
    roleBarText.innerHTML = `👀 <strong>全员公开查看模式</strong>（${escapeHtml(user.name)}）：您可查看所有水果价格与对比（只读防误改）`;
    document.getElementById('tabDailyLabel').textContent = '今日报价';
  }

  // 更新个人中心卡片
  document.getElementById('settingsUserIcon').textContent = adminMode ? '👑' : '👀';
  document.getElementById('settingsUserName').textContent = user.name;
  const roleBadge = document.getElementById('settingsRoleBadge');
  roleBadge.textContent = adminMode ? '采购管理员 (可改价)' : '普通成员 (只读看价)';
  roleBadge.className = 'role-tag ' + (adminMode ? 'admin' : 'viewer');
  document.getElementById('settingsUserAccount').textContent = `登录账号：${user.account} ｜ 店铺共享码：${user.storeCode || '8888'}`;
}

// ==================== 本地存储读写 ====================
function loadDataFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const demo = createDefaultDemoData();
      appState.fruits = demo.fruits;
      appState.records = demo.records;
      saveDataToStorage(false);
    } else {
      const parsed = JSON.parse(raw);
      appState.fruits = Array.isArray(parsed.fruits) ? parsed.fruits : [];
      appState.records = parsed.records && typeof parsed.records === 'object' ? parsed.records : {};
    }
  } catch (e) {
    const demo = createDefaultDemoData();
    appState.fruits = demo.fruits;
    appState.records = demo.records;
  }

  if (appState.fruits.length > 0 && !appState.trendFruitId) {
    appState.trendFruitId = appState.fruits[0].id;
  }
}

function saveDataToStorage(syncServer = true) {
  try {
    const payload = {
      fruits: appState.fruits,
      records: appState.records,
      lastSavedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    if (syncServer && isAdmin()) {
      tryAutoPushToLocalServer();
    }
  } catch (e) {
    showToast('⚠️ 本地存储空间不足或保存失败');
  }
}

// ==================== 局域网/内置共享服务器自动同步 ====================
async function tryAutoSyncFromLocalServer() {
  const repoEl = document.getElementById('githubRepoInput');
  const githubRepo = (repoEl ? repoEl.value.trim() : '') || detectGithubRepoFromUrl();
  if (githubRepo && navigator.onLine) {
    try {
      const apiKey = document.getElementById('cloudApiKeyInput') ? document.getElementById('cloudApiKeyInput').value.trim() : '';
      await syncWithGithubRepo(githubRepo, apiKey, 'download');
      return;
    } catch (e) {}
  }

  if (!location.protocol.startsWith('http')) return;
  try {
    // 先尝试本地/同源实时共享接口，再尝试静态 shared-data.json
    let res = await fetch('/api/shared-data', { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      res = await fetch('./shared-data.json?t=' + Date.now(), { method: 'GET', cache: 'no-store' });
    }
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.fruits) && data.fruits.length > 0 && typeof data.records === 'object') {
      appState.fruits = data.fruits;
      appState.records = data.records;
      saveDataToStorage(false);
      renderAll();
    }
  } catch (e) {
    // 静态预览环境无后端时静默忽略
  }
}

async function tryAutoPushToLocalServer() {
  if (!location.protocol.startsWith('http')) return;
  try {
    await fetch('/api/shared-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fruits: appState.fruits,
        records: appState.records,
        updatedBy: appState.currentUser ? appState.currentUser.name : '管理员',
        updatedAt: new Date().toISOString()
      })
    });
  } catch (e) {}
}

// ==================== 价格查询与对比计算核心 ====================
function getPriceRecord(dateStr, fruitId) {
  if (!appState.records[dateStr]) return null;
  const rec = appState.records[dateStr][fruitId];
  if (!rec || rec.price === null || rec.price === undefined || rec.price === '' || isNaN(Number(rec.price))) {
    return null;
  }
  return {
    price: Number(rec.price),
    note: rec.note || '',
    updatedBy: rec.updatedBy || ''
  };
}

function getPreviousRecordedPrice(targetDate, fruitId) {
  const prevDay = addDays(targetDate, -1);
  const yesterdayRec = getPriceRecord(prevDay, fruitId);
  if (yesterdayRec) {
    return {
      isYesterday: true,
      date: prevDay,
      price: yesterdayRec.price,
      note: yesterdayRec.note
    };
  }

  const allDates = Object.keys(appState.records)
    .filter((d) => d < targetDate)
    .sort((a, b) => (a > b ? -1 : 1));

  for (const d of allDates) {
    const r = getPriceRecord(d, fruitId);
    if (r) {
      return {
        isYesterday: false,
        date: d,
        price: r.price,
        note: r.note
      };
    }
  }
  return null;
}

function calculateComparison(currentPrice, prevInfo) {
  if (currentPrice === null || currentPrice === undefined || isNaN(currentPrice)) {
    return { status: 'unrecorded', diff: 0, pct: 0, label: '今日待出价' };
  }
  if (!prevInfo || prevInfo.price === null || prevInfo.price === undefined) {
    return { status: 'no_prev', diff: 0, pct: 0, label: '首次报价' };
  }

  const diff = Number((currentPrice - prevInfo.price).toFixed(2));
  const pct = prevInfo.price > 0 ? Number(((diff / prevInfo.price) * 100).toFixed(1)) : 0;
  const prefixTag = prevInfo.isYesterday ? '' : '(较上次) ';

  if (Math.abs(diff) < 0.001) {
    return {
      status: 'flat',
      diff: 0,
      pct: 0,
      label: `${prefixTag}持平 0.00`
    };
  } else if (diff > 0) {
    return {
      status: 'up',
      diff,
      pct,
      label: `${prefixTag}↑ +${diff.toFixed(2)} (${pct > 0 ? '+' : ''}${pct}%)`
    };
  } else {
    return {
      status: 'down',
      diff,
      pct,
      label: `${prefixTag}↓ ${diff.toFixed(2)} (${pct}%)`
    };
  }
}

// ==================== 录入或更新某日某水果价格 ====================
function setFruitPrice(dateStr, fruitId, priceVal, noteVal) {
  if (!isAdmin()) {
    showToast('🔒 当前为只读查看账号，请切换管理员账号修改价格');
    return;
  }

  if (!appState.records[dateStr]) {
    appState.records[dateStr] = {};
  }
  const existing = appState.records[dateStr][fruitId] || {};
  const authorName = appState.currentUser ? appState.currentUser.name : '管理员';

  if (priceVal === '' || priceVal === null || priceVal === undefined || isNaN(Number(priceVal))) {
    const nextNote = noteVal !== undefined ? noteVal : (existing.note || '');
    if (!nextNote) {
      delete appState.records[dateStr][fruitId];
    } else {
      appState.records[dateStr][fruitId] = {
        price: null,
        note: nextNote,
        updatedBy: authorName,
        updatedAt: Date.now()
      };
    }
  } else {
    const numPrice = Math.max(0, Number(Number(priceVal).toFixed(2)));
    appState.records[dateStr][fruitId] = {
      price: numPrice,
      note: noteVal !== undefined ? noteVal : (existing.note || ''),
      updatedBy: authorName,
      updatedAt: Date.now()
    };
  }

  saveDataToStorage(true);
}

// ==================== UI 渲染：顶部日期与统计 ====================
function renderDateBarAndStats() {
  const dateInput = document.getElementById('selectedDateInput');
  const tagEl = document.getElementById('dateRelationTag');
  const prevDateText = document.getElementById('prevDateText');
  const backTodayBanner = document.getElementById('backTodayBanner');
  const bannerDateStr = document.getElementById('bannerDateStr');

  dateInput.value = appState.selectedDate;
  const relLabel = getRelativeDayLabel(appState.selectedDate);
  tagEl.textContent = relLabel;
  tagEl.classList.toggle('history', relLabel !== '今天');

  const prevDay = addDays(appState.selectedDate, -1);
  prevDateText.textContent = prevDay;

  if (appState.selectedDate !== getTodayStr()) {
    backTodayBanner.classList.remove('hidden');
    bannerDateStr.textContent = `${appState.selectedDate} (${relLabel})`;
  } else {
    backTodayBanner.classList.add('hidden');
  }

  let recordedCount = 0;
  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;

  appState.fruits.forEach((f) => {
    const curRec = getPriceRecord(appState.selectedDate, f.id);
    const prevInfo = getPreviousRecordedPrice(appState.selectedDate, f.id);
    if (curRec) {
      recordedCount++;
      const cmp = calculateComparison(curRec.price, prevInfo);
      if (cmp.status === 'up') upCount++;
      else if (cmp.status === 'down') downCount++;
      else if (cmp.status === 'flat') flatCount++;
    }
  });

  document.getElementById('statRecorded').textContent = `${recordedCount}/${appState.fruits.length}`;
  document.getElementById('statUpCount').textContent = `↑ ${upCount}`;
  document.getElementById('statDownCount').textContent = `↓ ${downCount}`;
  document.getElementById('statFlatCount').textContent = `= ${flatCount}`;

  document.querySelectorAll('.summary-card').forEach((card) => {
    card.classList.toggle('active-filter', card.dataset.filter === appState.statusFilter);
  });
}

// ==================== UI 渲染：分类筛选栏 ====================
function renderCategoryBar() {
  const bar = document.getElementById('categoryFilterBar');
  const categories = ['全部', ...new Set(appState.fruits.map((f) => f.category || '日常水果'))];

  bar.innerHTML = categories
    .map(
      (cat) => `
      <button class="cat-chip ${appState.selectedCategory === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">
        ${escapeHtml(cat)}
      </button>
    `
    )
    .join('');

  bar.querySelectorAll('.cat-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.selectedCategory = btn.dataset.cat;
      renderCategoryBar();
      renderDailyFruitList();
    });
  });
}

// ==================== UI 渲染：每日水果记价/查看列表 ====================
function renderDailyFruitList() {
  const container = document.getElementById('dailyFruitList');
  const q = appState.searchQuery.trim().toLowerCase();
  const adminMode = isAdmin();

  const filtered = appState.fruits.filter((f) => {
    if (appState.selectedCategory !== '全部' && f.category !== appState.selectedCategory) {
      return false;
    }

    const curRec = getPriceRecord(appState.selectedDate, f.id);
    const prevInfo = getPreviousRecordedPrice(appState.selectedDate, f.id);
    const cmp = calculateComparison(curRec ? curRec.price : null, prevInfo);

    if (appState.statusFilter === 'up' && cmp.status !== 'up') return false;
    if (appState.statusFilter === 'down' && cmp.status !== 'down') return false;
    if (appState.statusFilter === 'flat' && cmp.status !== 'flat') return false;

    if (q) {
      const noteStr = curRec && curRec.note ? curRec.note.toLowerCase() : '';
      const matchName = f.name.toLowerCase().includes(q);
      const matchCat = (f.category || '').toLowerCase().includes(q);
      const matchNote = noteStr.includes(q);
      if (!matchName && !matchCat && !matchNote) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p style="font-size:28px;margin-bottom:8px;">🍎</p>
        <p>没有找到符合筛选条件的水果品种</p>
        <button class="btn-outline" style="margin-top:10px;" id="resetFilterQuickBtn">显示全部水果</button>
      </div>
    `;
    const resetBtn = document.getElementById('resetFilterQuickBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        appState.selectedCategory = '全部';
        appState.statusFilter = 'all';
        appState.searchQuery = '';
        document.getElementById('fruitSearchInput').value = '';
        renderCategoryBar();
        renderDateBarAndStats();
        renderDailyFruitList();
      });
    }
    return;
  }

  container.innerHTML = filtered
    .map((f) => {
      const curRec = getPriceRecord(appState.selectedDate, f.id);
      const prevInfo = getPreviousRecordedPrice(appState.selectedDate, f.id);
      const curPrice = curRec ? curRec.price : null;
      const curNote =
        (appState.records[appState.selectedDate] &&
          appState.records[appState.selectedDate][f.id] &&
          appState.records[appState.selectedDate][f.id].note) ||
        '';
      const cmp = calculateComparison(curPrice, prevInfo);

      let cardBorderClass = '';
      let badgeClass = 'none';
      if (curPrice !== null) {
        if (cmp.status === 'up') {
          cardBorderClass = 'price-up';
          badgeClass = 'up';
        } else if (cmp.status === 'down') {
          cardBorderClass = 'price-down';
          badgeClass = 'down';
        } else {
          cardBorderClass = 'has-price';
          badgeClass = 'flat';
        }
      }

      const prevText = prevInfo
        ? `${prevInfo.isYesterday ? '昨日' : `上次(${prevInfo.date.slice(5)})`}: ¥${prevInfo.price.toFixed(2)}`
        : '昨日: 暂无记录';

      const unitOptionsHtml = UNIT_OPTIONS.map(
        (u) => `<option value="${u}" ${f.unit === u ? 'selected' : ''}>${u}</option>`
      ).join('');

      // 区分管理员录入视图 vs 普通店员只读查看视图
      const bottomRowHtml = adminMode
        ? `
          <div class="fruit-input-row">
            <div class="price-input-group">
              <span class="currency-prefix">¥</span>
              <input
                type="number"
                step="0.1"
                min="0"
                inputmode="decimal"
                class="price-input"
                data-action="input-price"
                data-id="${f.id}"
                placeholder="输入成本价"
                value="${curPrice !== null ? curPrice : ''}"
              />
              <span class="unit-suffix">${escapeHtml(f.unit.replace('元/', '/'))}</span>
              <div class="step-btns">
                <button class="btn-step" data-action="step-price" data-id="${f.id}" data-delta="-0.5" title="减0.5元">－</button>
                <button class="btn-step" data-action="step-price" data-id="${f.id}" data-delta="0.5" title="加0.5元">＋</button>
              </div>
            </div>

            <div class="note-input-group">
              <input
                type="text"
                class="note-input"
                data-action="input-note"
                data-id="${f.id}"
                placeholder="备注(如产地/等级)"
                value="${escapeHtml(curNote)}"
              />
            </div>
          </div>
        `
        : `
          <div class="readonly-price-row">
            <div class="readonly-price-main">
              <span class="readonly-price-label">当日成本：</span>
              ${
                curPrice !== null
                  ? `<span class="readonly-price-val">¥${curPrice.toFixed(2)}</span>
                     <span class="readonly-price-unit">${escapeHtml(f.unit.replace('元/', '/'))}</span>`
                  : `<span style="color:#94a3b8;font-size:13px;font-weight:600;">今日暂未出价</span>`
              }
            </div>
            <div class="readonly-note">
              ${curNote ? `📌 ${escapeHtml(curNote)}` : '<span style="color:#cbd5e1;">无备注</span>'}
            </div>
          </div>
        `;

      return `
        <div class="fruit-card ${cardBorderClass}" data-fruit-id="${f.id}">
          <div class="fruit-card-top">
            <div class="fruit-info">
              <div class="fruit-emoji">${f.emoji || '🍎'}</div>
              <div>
                <div class="fruit-title-row">
                  <span class="fruit-name">${escapeHtml(f.name)}</span>
                  <span class="fruit-cat-badge">${escapeHtml(f.category || '日常')}</span>
                  ${
                    adminMode
                      ? `<select class="fruit-unit-select-inline" data-action="change-unit" data-id="${f.id}" title="切换计价单位">${unitOptionsHtml}</select>`
                      : `<span class="fruit-unit-static">${escapeHtml(f.unit)}</span>`
                  }
                </div>
                <div class="fruit-prev-meta">
                  <span>${prevText}</span>
                  ${
                    adminMode && prevInfo
                      ? `<button class="btn-use-prev" data-action="copy-prev" data-id="${f.id}" data-price="${prevInfo.price}">填入¥${prevInfo.price.toFixed(2)}</button>`
                      : ''
                  }
                </div>
              </div>
            </div>

            <div class="compare-badge-wrap">
              <span class="compare-badge ${badgeClass}" id="badge-${f.id}">${cmp.label}</span>
              <button class="btn-card-trend" data-action="jump-trend" data-id="${f.id}">📈 查看走势</button>
            </div>
          </div>

          ${bottomRowHtml}
        </div>
      `;
    })
    .join('');

  bindDailyCardEvents(container);
}

function updateSingleCardComparisonUI(fruitId) {
  const card = document.querySelector(`.fruit-card[data-fruit-id="${fruitId}"]`);
  const badge = document.getElementById(`badge-${fruitId}`);
  if (!card || !badge) return;

  const curRec = getPriceRecord(appState.selectedDate, fruitId);
  const prevInfo = getPreviousRecordedPrice(appState.selectedDate, fruitId);
  const curPrice = curRec ? curRec.price : null;
  const cmp = calculateComparison(curPrice, prevInfo);

  card.classList.remove('has-price', 'price-up', 'price-down');
  badge.classList.remove('up', 'down', 'flat', 'none');

  if (curPrice !== null) {
    if (cmp.status === 'up') {
      card.classList.add('price-up');
      badge.classList.add('up');
    } else if (cmp.status === 'down') {
      card.classList.add('price-down');
      badge.classList.add('down');
    } else {
      card.classList.add('has-price');
      badge.classList.add('flat');
    }
  } else {
    badge.classList.add('none');
  }
  badge.textContent = cmp.label;
  renderDateBarAndStats();
}

function bindDailyCardEvents(container) {
  container.querySelectorAll('input[data-action="input-price"]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const id = e.target.dataset.id;
      const val = e.target.value;
      setFruitPrice(appState.selectedDate, id, val, undefined);
      updateSingleCardComparisonUI(id);
    });
  });

  container.querySelectorAll('input[data-action="input-note"]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const id = e.target.dataset.id;
      const curRec = getPriceRecord(appState.selectedDate, id);
      setFruitPrice(appState.selectedDate, id, curRec ? curRec.price : '', e.target.value);
    });
  });

  container.querySelectorAll('select[data-action="change-unit"]').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      const fruit = appState.fruits.find((f) => f.id === id);
      if (fruit) {
        fruit.unit = e.target.value;
        saveDataToStorage();
        renderDailyFruitList();
        showToast(`✅ 已将「${fruit.name}」单位改为 ${fruit.unit}`);
      }
    });
  });

  container.querySelectorAll('button[data-action="copy-prev"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const price = Number(btn.dataset.price);
      setFruitPrice(appState.selectedDate, id, price, undefined);
      renderDailyFruitList();
      renderDateBarAndStats();
      showToast('⚡ 已沿用前一日价格');
    });
  });

  container.querySelectorAll('button[data-action="step-price"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const delta = Number(btn.dataset.delta);
      const curRec = getPriceRecord(appState.selectedDate, id);
      const prevInfo = getPreviousRecordedPrice(appState.selectedDate, id);
      const base = curRec ? curRec.price : prevInfo ? prevInfo.price : 0;
      const nextPrice = Math.max(0, Number((base + delta).toFixed(2)));
      setFruitPrice(appState.selectedDate, id, nextPrice, undefined);
      const inputEl = container.querySelector(`input[data-action="input-price"][data-id="${id}"]`);
      if (inputEl) inputEl.value = nextPrice;
      updateSingleCardComparisonUI(id);
    });
  });

  container.querySelectorAll('button[data-action="jump-trend"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.trendFruitId = btn.dataset.id;
      switchTab('tab-trend');
    });
  });
}

// ==================== TAB 2: 趋势分析与 SVG 折线图 ====================
function renderTrendTab() {
  const selectEl = document.getElementById('trendFruitSelect');
  if (appState.fruits.length === 0) {
    selectEl.innerHTML = '<option value="">暂无水果品种</option>';
    return;
  }

  if (!appState.fruits.some((f) => f.id === appState.trendFruitId)) {
    appState.trendFruitId = appState.fruits[0].id;
  }

  selectEl.innerHTML = appState.fruits
    .map(
      (f) =>
        `<option value="${f.id}" ${f.id === appState.trendFruitId ? 'selected' : ''}>${f.emoji} ${escapeHtml(
          f.name
        )} (${escapeHtml(f.unit)})</option>`
    )
    .join('');

  const fruit = appState.fruits.find((f) => f.id === appState.trendFruitId);
  if (!fruit) return;

  document.getElementById('historyTableFruitName').textContent = `${fruit.emoji} ${fruit.name}`;

  const today = appState.selectedDate;
  const startDay = addDays(today, -(appState.trendDays - 1));
  const allPoints = [];

  Object.keys(appState.records)
    .sort()
    .forEach((d) => {
      const rec = getPriceRecord(d, fruit.id);
      if (rec) {
        allPoints.push({ date: d, price: rec.price, note: rec.note, updatedBy: rec.updatedBy });
      }
    });

  const periodPoints =
    appState.trendDays >= 90
      ? allPoints
      : allPoints.filter((pt) => pt.date >= startDay && pt.date <= today);

  if (periodPoints.length === 0) {
    document.getElementById('trendLatestPrice').textContent = '--';
    document.getElementById('trendMaxPrice').textContent = '--';
    document.getElementById('trendMinPrice').textContent = '--';
    document.getElementById('trendAvgPrice').textContent = '--';
  } else {
    const prices = periodPoints.map((p) => p.price);
    const latest = prices[prices.length - 1];
    const maxP = Math.max(...prices);
    const minP = Math.min(...prices);
    const avgP = prices.reduce((a, b) => a + b, 0) / prices.length;

    document.getElementById('trendLatestPrice').textContent = `¥${latest.toFixed(2)}`;
    document.getElementById('trendMaxPrice').textContent = `¥${maxP.toFixed(2)}`;
    document.getElementById('trendMinPrice').textContent = `¥${minP.toFixed(2)}`;
    document.getElementById('trendAvgPrice').textContent = `¥${avgP.toFixed(2)}`;
  }

  renderSvgLineChart(periodPoints, fruit);
  renderDailyRankingList();
  renderFruitHistoryTable(allPoints, fruit);
}

function renderSvgLineChart(points, fruit) {
  const container = document.getElementById('chartContainer');
  if (points.length === 0) {
    container.innerHTML = `<div class="empty-state">该时间段内暂无「${escapeHtml(fruit.name)}」的价格记录</div>`;
    return;
  }

  const width = 360;
  const height = 195;
  const padLeft = 40;
  const padRight = 22;
  const padTop = 28;
  const padBottom = 32;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const prices = points.map((p) => p.price);
  let minVal = Math.min(...prices);
  let maxVal = Math.max(...prices);
  if (minVal === maxVal) {
    minVal = Math.max(0, minVal - 1);
    maxVal = maxVal + 1;
  } else {
    const pad = (maxVal - minVal) * 0.15;
    minVal = Math.max(0, minVal - pad);
    maxVal = maxVal + pad;
  }

  const getX = (idx) => {
    if (points.length === 1) return padLeft + chartW / 2;
    return padLeft + (idx / (points.length - 1)) * chartW;
  };
  const getY = (val) => {
    return padTop + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
  };

  const coords = points.map((p, idx) => ({
    x: Number(getX(idx).toFixed(1)),
    y: Number(getY(p.price).toFixed(1)),
    date: p.date,
    price: p.price
  }));

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const areaPoints = `${coords[0].x},${padTop + chartH} ${polylinePoints} ${coords[coords.length - 1].x},${padTop + chartH}`;

  let gridLines = '';
  for (let i = 0; i <= 2; i++) {
    const val = minVal + ((maxVal - minVal) * i) / 2;
    const y = getY(val).toFixed(1);
    gridLines += `
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3,3" />
      <text x="${padLeft - 6}" y="${Number(y) + 4}" text-anchor="end" font-size="10" fill="#94a3b8">¥${val.toFixed(1)}</text>
    `;
  }

  const stepLabel = Math.max(1, Math.ceil(coords.length / 7));
  const circlesHtml = coords
    .map((c, idx) => {
      const showLabel = idx === 0 || idx === coords.length - 1 || idx % stepLabel === 0;
      const shortDate = c.date.slice(5);
      return `
        <circle cx="${c.x}" cy="${c.y}" r="4" fill="#10b981" stroke="#ffffff" stroke-width="2" />
        ${
          showLabel
            ? `<text x="${c.x}" y="${c.y - 9}" text-anchor="middle" font-size="10" font-weight="700" fill="#0f172a">¥${c.price.toFixed(2)}</text>
               <text x="${c.x}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#64748b">${shortDate}</text>`
            : ''
        }
      `;
    })
    .join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="195">
      <defs>
        <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.28" />
          <stop offset="100%" stop-color="#10b981" stop-opacity="0.0" />
        </linearGradient>
      </defs>
      ${gridLines}
      ${coords.length > 1 ? `<polygon points="${areaPoints}" fill="url(#lineAreaGrad)" />` : ''}
      ${
        coords.length > 1
          ? `<polyline fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${polylinePoints}" />`
          : ''
      }
      ${circlesHtml}
    </svg>
  `;
}

function renderDailyRankingList() {
  const rankEl = document.getElementById('dailyRankingList');
  document.getElementById('rankingDateLabel').textContent = appState.selectedDate;

  const items = [];
  appState.fruits.forEach((f) => {
    const curRec = getPriceRecord(appState.selectedDate, f.id);
    if (!curRec) return;
    const prevInfo = getPreviousRecordedPrice(appState.selectedDate, f.id);
    const cmp = calculateComparison(curRec.price, prevInfo);
    items.push({ fruit: f, curPrice: curRec.price, cmp });
  });

  if (items.length === 0) {
    rankEl.innerHTML = `<div class="empty-state" style="padding:14px;">当日暂未录入价格</div>`;
    return;
  }

  items.sort((a, b) => Math.abs(b.cmp.pct) - Math.abs(a.cmp.pct));

  rankEl.innerHTML = items
    .map(({ fruit, curPrice, cmp }) => {
      const cls = cmp.status === 'up' ? 'up' : cmp.status === 'down' ? 'down' : 'flat';
      return `
        <div class="ranking-item">
          <div class="ranking-left">
            <span>${fruit.emoji}</span>
            <strong>${escapeHtml(fruit.name)}</strong>
            <span style="color:#64748b;font-size:12px;">¥${curPrice.toFixed(2)} ${escapeHtml(fruit.unit)}</span>
          </div>
          <span class="compare-badge ${cls}">${cmp.label}</span>
        </div>
      `;
    })
    .join('');
}

function renderFruitHistoryTable(allPoints, fruit) {
  const tbody = document.getElementById('fruitHistoryTableBody');
  if (allPoints.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:16px;">暂无历史价格记录</td></tr>`;
    return;
  }

  const reversed = [...allPoints].reverse();
  tbody.innerHTML = reversed
    .map((pt, idx) => {
      const prevPt = reversed[idx + 1] || null;
      let deltaHtml = '<span style="color:#94a3b8;">--</span>';
      if (prevPt) {
        const d = Number((pt.price - prevPt.price).toFixed(2));
        if (d > 0) deltaHtml = `<span class="text-up" style="font-weight:700;">↑ +${d.toFixed(2)}</span>`;
        else if (d < 0) deltaHtml = `<span class="text-down" style="font-weight:700;">↓ ${d.toFixed(2)}</span>`;
        else deltaHtml = `<span class="text-flat">持平 0.00</span>`;
      }
      const noteText = [pt.note, pt.updatedBy ? `(${pt.updatedBy})` : ''].filter(Boolean).join(' ') || '-';
      return `
        <tr>
          <td><strong>${pt.date}</strong></td>
          <td>¥${pt.price.toFixed(2)} <span style="color:#94a3b8;font-size:11px;">${escapeHtml(fruit.unit)}</span></td>
          <td>${deltaHtml}</td>
          <td style="color:#64748b;">${escapeHtml(noteText)}</td>
        </tr>
      `;
    })
    .join('');
}

// ==================== TAB 3: 水果品种与团队成员管理 ====================
function renderManageFruitsTab() {
  const listEl = document.getElementById('manageFruitList');
  const adminMode = isAdmin();

  if (appState.fruits.length === 0) {
    listEl.innerHTML = `<div class="empty-state">暂无水果品种</div>`;
  } else {
    listEl.innerHTML = appState.fruits
      .map(
        (f, idx) => `
        <div class="manage-item">
          <div class="manage-item-left">
            <span style="font-size:24px;">${f.emoji || '🍎'}</span>
            <div>
              <div style="font-weight:700;font-size:14px;">${escapeHtml(f.name)}</div>
              <div style="font-size:11px;color:#64748b;">分类：${escapeHtml(f.category || '日常水果')} ｜ 默认单位：${escapeHtml(f.unit)}</div>
            </div>
          </div>
          ${
            adminMode
              ? `<div class="manage-item-actions">
                  ${idx > 0 ? `<button class="btn-sm" data-action="move-up" data-idx="${idx}" title="上移">↑</button>` : ''}
                  <button class="btn-sm" data-action="edit-fruit" data-id="${f.id}">编辑</button>
                  <button class="btn-sm danger" data-action="delete-fruit" data-id="${f.id}">删除</button>
                </div>`
              : `<span class="fruit-unit-static">只读</span>`
          }
        </div>
      `
      )
      .join('');
  }

  if (adminMode) {
    listEl.querySelectorAll('button[data-action="move-up"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        if (idx > 0) {
          const temp = appState.fruits[idx - 1];
          appState.fruits[idx - 1] = appState.fruits[idx];
          appState.fruits[idx] = temp;
          saveDataToStorage();
          renderManageFruitsTab();
          renderDailyFruitList();
        }
      });
    });

    listEl.querySelectorAll('button[data-action="edit-fruit"]').forEach((btn) => {
      btn.addEventListener('click', () => openFruitModal(btn.dataset.id));
    });

    listEl.querySelectorAll('button[data-action="delete-fruit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const fruit = appState.fruits.find((f) => f.id === id);
        if (!fruit) return;
        if (confirm(`确定要删除水果品种「${fruit.name}」吗？`)) {
          appState.fruits = appState.fruits.filter((f) => f.id !== id);
          saveDataToStorage();
          renderManageFruitsTab();
          renderCategoryBar();
          renderDateBarAndStats();
          renderDailyFruitList();
          showToast(`🗑️ 已删除「${fruit.name}」`);
        }
      });
    });
  }

  // 渲染团队成员列表
  const memberListEl = document.getElementById('teamMemberList');
  if (memberListEl) {
    memberListEl.innerHTML = appState.users
      .map((u) => {
        const isCur = appState.currentUser && appState.currentUser.account === u.account;
        const roleLabel = u.role === 'admin' ? '👑 采购管理员 (可录价/改价)' : '👀 普通成员 (只读看价)';
        return `
          <div class="manage-item">
            <div class="manage-item-left">
              <span style="font-size:22px;">${u.role === 'admin' ? '👑' : '👤'}</span>
              <div>
                <div style="font-weight:700;font-size:13px;">
                  ${escapeHtml(u.name)} ${isCur ? '<span style="color:#10b981;font-size:11px;">(当前登录)</span>' : ''}
                </div>
                <div style="font-size:11px;color:#64748b;">账号：${escapeHtml(u.account)} ｜ ${roleLabel}</div>
              </div>
            </div>
            <div class="manage-item-actions">
              ${
                !isCur
                  ? `<button class="btn-sm" data-action="quick-switch-user" data-account="${escapeHtml(u.account)}">切换此号</button>`
                  : ''
              }
              ${
                adminMode && !isCur
                  ? `<button class="btn-sm" data-action="toggle-user-role" data-account="${escapeHtml(u.account)}">
                      ${u.role === 'admin' ? '设为只读' : '设为管理员'}
                    </button>`
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');

    memberListEl.querySelectorAll('button[data-action="quick-switch-user"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = appState.users.find((u) => u.account === btn.dataset.account);
        if (target) {
          loginWithUser(target, target.storeCode);
          showToast(`🔄 已切换为「${target.name}」`);
        }
      });
    });

    memberListEl.querySelectorAll('button[data-action="toggle-user-role"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = appState.users.find((u) => u.account === btn.dataset.account);
        if (target) {
          target.role = target.role === 'admin' ? 'viewer' : 'admin';
          saveUsersToStorage();
          renderManageFruitsTab();
          showToast(`✅ 已更新「${target.name}」的角色权限`);
        }
      });
    });
  }
}

// ==================== 新增/编辑水果 Modal 逻辑 ====================
function renderEmojiPicker() {
  const grid = document.getElementById('emojiPickerGrid');
  grid.innerHTML = EMOJI_LIST.map(
    (em) => `
      <button type="button" class="emoji-option ${appState.selectedEmoji === em ? 'selected' : ''}" data-emoji="${em}">
        ${em}
      </button>
    `
  ).join('');

  grid.querySelectorAll('.emoji-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.selectedEmoji = btn.dataset.emoji;
      renderEmojiPicker();
    });
  });
}

function openFruitModal(editFruitId = null) {
  if (!isAdmin()) {
    showToast('🔒 仅管理员可添加或编辑水果品种');
    return;
  }
  const overlay = document.getElementById('fruitModalOverlay');
  const titleEl = document.getElementById('fruitModalTitle');
  const idInput = document.getElementById('editFruitIdInput');
  const nameInput = document.getElementById('fruitNameInput');
  const unitSelect = document.getElementById('fruitUnitSelect');
  const catSelect = document.getElementById('fruitCategorySelect');
  const initPriceGroup = document.getElementById('initialPriceGroup');
  const initPriceInput = document.getElementById('fruitInitPriceInput');

  if (editFruitId) {
    const f = appState.fruits.find((item) => item.id === editFruitId);
    if (!f) return;
    titleEl.textContent = '编辑水果品种';
    idInput.value = f.id;
    nameInput.value = f.name;
    unitSelect.value = f.unit;
    catSelect.value = f.category || '日常水果';
    appState.selectedEmoji = f.emoji || '🍎';
    initPriceGroup.classList.add('hidden');
  } else {
    titleEl.textContent = '新增水果品种';
    idInput.value = '';
    nameInput.value = '';
    unitSelect.value = '元/斤';
    catSelect.value = '日常水果';
    appState.selectedEmoji = '🍎';
    initPriceInput.value = '';
    initPriceGroup.classList.remove('hidden');
  }

  renderEmojiPicker();
  overlay.classList.remove('hidden');
  setTimeout(() => nameInput.focus(), 80);
}

function closeFruitModal() {
  document.getElementById('fruitModalOverlay').classList.add('hidden');
}

function saveFruitFromModal() {
  const editId = document.getElementById('editFruitIdInput').value.trim();
  const name = document.getElementById('fruitNameInput').value.trim();
  const unit = document.getElementById('fruitUnitSelect').value;
  const category = document.getElementById('fruitCategorySelect').value;
  const initPrice = document.getElementById('fruitInitPriceInput').value.trim();

  if (!name) {
    showToast('⚠️ 请输入水果名称');
    return;
  }

  if (editId) {
    const f = appState.fruits.find((item) => item.id === editId);
    if (f) {
      f.name = name;
      f.unit = unit;
      f.category = category;
      f.emoji = appState.selectedEmoji;
    }
    showToast(`✅ 已更新「${name}」`);
  } else {
    const newId = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    appState.fruits.unshift({
      id: newId,
      name,
      emoji: appState.selectedEmoji,
      unit,
      category
    });
    if (initPrice !== '' && !isNaN(Number(initPrice))) {
      setFruitPrice(appState.selectedDate, newId, Number(initPrice), '新增录入');
    }
    showToast(`🎉 已添加新品种「${name}」`);
  }

  saveDataToStorage();
  closeFruitModal();
  renderCategoryBar();
  renderDateBarAndStats();
  renderDailyFruitList();
  renderManageFruitsTab();
}

// ==================== Excel(CSV) 导出与 JSON 备份恢复 ====================
function exportToCsv() {
  const rows = [
    ['日期', '水果名称', '所属分类', '当日成本价', '计价单位', '前次参考价', '涨跌金额(元)', '涨跌幅度(%)', '备注', '录入人']
  ];

  const sortedDates = Object.keys(appState.records).sort((a, b) => (a > b ? -1 : 1));
  sortedDates.forEach((dateStr) => {
    appState.fruits.forEach((f) => {
      const curRec = getPriceRecord(dateStr, f.id);
      if (!curRec) return;
      const prevInfo = getPreviousRecordedPrice(dateStr, f.id);
      const cmp = calculateComparison(curRec.price, prevInfo);
      rows.push([
        dateStr,
        f.name,
        f.category || '',
        curRec.price.toFixed(2),
        f.unit,
        prevInfo ? prevInfo.price.toFixed(2) : '',
        prevInfo ? cmp.diff.toFixed(2) : '',
        prevInfo ? `${cmp.pct}%` : '',
        curRec.note || '',
        curRec.updatedBy || ''
      ]);
    });
  });

  if (rows.length <= 1) {
    showToast('⚠️ 当前暂无可导出的价格记录');
    return;
  }

  const csvContent =
    '\uFEFF' +
    rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `水果成本价格表_${getTodayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📊 已导出 Excel (CSV) 报表！');
}

function exportToJsonBackup() {
  const payload = {
    appName: '水果成本记账',
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    fruits: appState.fruits,
    records: appState.records
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `水果成本记账备份_${getTodayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('💾 备份文件已导出！');
}

function importFromJsonBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!Array.isArray(parsed.fruits) || typeof parsed.records !== 'object') {
        showToast('❌ 备份文件格式不正确');
        return;
      }
      appState.fruits = parsed.fruits;
      appState.records = parsed.records;
      saveDataToStorage();
      renderAll();
      showToast(`✅ 成功恢复 ${appState.fruits.length} 种水果与历史价格数据！`);
    } catch (err) {
      showToast('❌ 解析备份文件失败');
    }
  };
  reader.readAsText(file, 'utf-8');
}

// ==================== 联网状态与全员共享云同步 ====================
function updateNetworkIndicator() {
  const isOnline = navigator.onLine;
  const dot = document.getElementById('netDot');
  const txt = document.getElementById('netText');
  dot.className = 'net-dot ' + (isOnline ? 'online' : 'offline');
  txt.textContent = isOnline ? '已联网' : '离线模式';
}

const DEFAULT_GITHUB_REPO = 'krisawang/fruit-jilu';

function detectGithubRepoFromUrl() {
  try {
    // 如果是通过 https://<owner>.github.io/<repo>/ 打开，自动识别仓库名！
    if (location.hostname.endsWith('.github.io')) {
      const owner = location.hostname.replace('.github.io', '');
      const pathParts = location.pathname.split('/').filter(Boolean);
      if (owner && pathParts.length > 0) {
        return `${owner}/${pathParts[0]}`;
      }
    }
  } catch (e) {}
  return DEFAULT_GITHUB_REPO;
}

function loadCloudConfig() {
  try {
    const autoRepo = detectGithubRepoFromUrl();
    const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
    const repoInput = document.getElementById('githubRepoInput');
    if (!raw) {
      if (repoInput && autoRepo) repoInput.value = autoRepo;
      return;
    }
    const cfg = JSON.parse(raw);
    if (repoInput) repoInput.value = cfg.githubRepo || autoRepo || '';
    document.getElementById('cloudEndpointInput').value = cfg.endpoint || '';
    document.getElementById('cloudApiKeyInput').value = cfg.apiKey || '';
    if (cfg.lastSyncText) {
      document.getElementById('cloudSyncStatusText').textContent = cfg.lastSyncText;
    }
  } catch (e) {}
}

function saveCloudConfig() {
  const repoEl = document.getElementById('githubRepoInput');
  const githubRepo = repoEl ? repoEl.value.trim() : '';
  const endpoint = document.getElementById('cloudEndpointInput').value.trim();
  const apiKey = document.getElementById('cloudApiKeyInput').value.trim();
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify({ githubRepo, endpoint, apiKey }));
  showToast('✅ GitHub / 云端共享配置已保存');
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))));
}

async function syncWithGithubRepo(githubRepo, token, mode = 'upload') {
  const statusEl = document.getElementById('cloudSyncStatusText');
  const apiUrl = `https://api.github.com/repos/${githubRepo}/contents/www/shared-data.json`;

  if (mode === 'upload') {
    if (!token) {
      showToast('⚠️ 管理员发布报价到 GitHub 需填写 GitHub Token');
      return;
    }
    statusEl.textContent = `⏳ 正在将最新价格发布到 GitHub (${githubRepo})...`;
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 1. 先获取当前 shared-data.json 的 sha
    let sha = undefined;
    const getRes = await fetch(apiUrl, { method: 'GET', headers, cache: 'no-store' });
    if (getRes.ok) {
      const fileInfo = await getRes.json();
      sha = fileInfo.sha;
    }

    // 2. 提交更新后的价格数据到 GitHub 仓库
    const contentObj = {
      appName: '水果成本记账',
      updatedBy: appState.currentUser ? appState.currentUser.name : '采购管理员',
      syncedAt: new Date().toISOString(),
      fruits: appState.fruits,
      records: appState.records
    };
    const bodyPayload = {
      message: `📢 更新每日水果报价 (${getTodayStr()})`,
      content: utf8ToBase64(JSON.stringify(contentObj, null, 2))
    };
    if (sha) bodyPayload.sha = sha;

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(bodyPayload)
    });
    if (!putRes.ok) {
      throw new Error(`GitHub API ${putRes.status}`);
    }
    const msg = `✅ 已发布至 GitHub (${githubRepo})：${new Date().toLocaleString()}`;
    statusEl.textContent = msg;
    localStorage.setItem(
      CLOUD_CONFIG_KEY,
      JSON.stringify({ githubRepo, endpoint: '', apiKey: token, lastSyncText: msg })
    );
    showToast('📢 今日报价已成功发布到 GitHub，所有人均可查看！');
  } else {
    statusEl.textContent = `⏳ 正在从 GitHub (${githubRepo}) 同步最新报价...`;
    // 优先通过 GitHub API 或 jsDelivr CDN / 同源 shared-data.json 拉取（无需Token，店员直接可读）
    let payload = null;
    try {
      const headers = { Accept: 'application/vnd.github+json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${apiUrl}?t=${Date.now()}`, { method: 'GET', headers, cache: 'no-store' });
      if (res.ok) {
        const fileData = await res.json();
        if (fileData.content) {
          payload = JSON.parse(base64ToUtf8(fileData.content));
        }
      }
    } catch (e) {}

    if (!payload) {
      // 国内免代理 CDN 加速备用通道
      const cdnUrl = `https://cdn.jsdelivr.net/gh/${githubRepo}@main/www/shared-data.json?t=${Date.now()}`;
      const cdnRes = await fetch(cdnUrl, { cache: 'no-store' });
      if (cdnRes.ok) {
        payload = await cdnRes.json();
      }
    }

    if (!payload || !Array.isArray(payload.fruits) || payload.fruits.length === 0) {
      throw new Error('仓库中暂无已发布的报价数据');
    }

    appState.fruits = payload.fruits;
    appState.records = payload.records || {};
    saveDataToStorage(false);
    renderAll();
    const msg = `✅ 已从 GitHub 同步最新报价 (${payload.updatedBy || '管理员'} 发布于 ${new Date().toLocaleTimeString()})`;
    statusEl.textContent = msg;
    showToast('🔄 已从 GitHub 同步最新水果价格！');
  }
}

async function syncToCloud(mode = 'upload') {
  const repoEl = document.getElementById('githubRepoInput');
  const githubRepo = (repoEl ? repoEl.value.trim() : '') || detectGithubRepoFromUrl();
  const customEndpoint = document.getElementById('cloudEndpointInput').value.trim();
  const apiKey = document.getElementById('cloudApiKeyInput').value.trim();

  // 如果填写了 GitHub 仓库名（如 zhangsan/fruit-app），直接使用 GitHub 作为免费云数据库！
  if (githubRepo) {
    try {
      await syncWithGithubRepo(githubRepo, apiKey, mode);
      return;
    } catch (err) {
      document.getElementById('cloudSyncStatusText').textContent = `⚠️ GitHub 同步提示：${err.message}`;
      showToast(`⚠️ ${err.message}`);
      return;
    }
  }

  const endpoint = customEndpoint || (location.protocol.startsWith('http') ? '/api/shared-data' : '');
  const statusEl = document.getElementById('cloudSyncStatusText');

  if (!endpoint) {
    loadDataFromStorage();
    renderAll();
    const msg = `已完成同机多角色共享同步：${new Date().toLocaleTimeString()}`;
    statusEl.textContent = msg;
    showToast(mode === 'upload' ? '📢 已发布最新价格，所有成员登录可见！' : '🔄 已刷新最新报价！');
    return;
  }

  statusEl.textContent = mode === 'upload' ? '⏳ 正在发布最新报价...' : '⏳ 正在拉取最新报价...';

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-Master-Key'] = apiKey;
    headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
  }

  try {
    if (mode === 'upload') {
      const method = customEndpoint ? 'PUT' : 'POST';
      const res = await fetch(endpoint, {
        method,
        headers,
        body: JSON.stringify({
          fruits: appState.fruits,
          records: appState.records,
          updatedBy: appState.currentUser ? appState.currentUser.name : '管理员',
          syncedAt: new Date().toISOString()
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const msg = `上次发布共享成功：${new Date().toLocaleString()}`;
      statusEl.textContent = msg;
      localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify({ githubRepo, endpoint: customEndpoint, apiKey, lastSyncText: msg }));
      showToast('📢 今日价格已发布，所有人均可查看！');
    } else {
      const res = await fetch(endpoint, { method: 'GET', headers, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const payload = data.record || data.data || data;
      if (!Array.isArray(payload.fruits) || typeof payload.records !== 'object') {
        throw new Error('返回数据格式不匹配');
      }
      appState.fruits = payload.fruits;
      appState.records = payload.records;
      saveDataToStorage(false);
      renderAll();
      const msg = `上次同步最新报价：${new Date().toLocaleString()}`;
      statusEl.textContent = msg;
      localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify({ githubRepo, endpoint: customEndpoint, apiKey, lastSyncText: msg }));
      showToast('🔄 已同步最新报价！');
    }
  } catch (err) {
    loadDataFromStorage();
    renderAll();
    showToast('🔄 已刷新本地最新共享价格表');
  }
}

// ==================== 底部导航切换 ====================
function switchTab(tabId) {
  document.querySelectorAll('.tab-page').forEach((sec) => {
    sec.classList.toggle('active', sec.id === tabId);
  });
  document.querySelectorAll('.app-tabbar .tab-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  if (tabId === 'tab-daily') {
    renderDateBarAndStats();
    renderDailyFruitList();
  } else if (tabId === 'tab-trend') {
    renderTrendTab();
  } else if (tabId === 'tab-fruits') {
    renderManageFruitsTab();
  }
}

// ==================== 通用辅助函数 ====================
function showToast(text) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast-msg';
  el.textContent = text;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 2400);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAll() {
  renderDateBarAndStats();
  renderCategoryBar();
  renderDailyFruitList();
  renderTrendTab();
  renderManageFruitsTab();
}

// ==================== 登录与注册事件绑定 ====================
function bindAuthEvents() {
  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const tabRegisterBtn = document.getElementById('tabRegisterBtn');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const regRoleSelect = document.getElementById('regRoleSelect');
  const adminSecretGroup = document.getElementById('adminSecretGroup');

  tabLoginBtn.addEventListener('click', () => {
    tabLoginBtn.classList.add('active');
    tabRegisterBtn.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  });

  tabRegisterBtn.addEventListener('click', () => {
    tabRegisterBtn.classList.add('active');
    tabLoginBtn.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  });

  regRoleSelect.addEventListener('change', (e) => {
    adminSecretGroup.classList.toggle('hidden', e.target.value !== 'admin');
  });

  // 账号密码登录提交
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!document.getElementById('agreePrivacyCheckbox').checked) {
      showToast('⚠️ 请先勾选同意《用户协议与隐私政策》');
      return;
    }
    const account = document.getElementById('loginAccountInput').value.trim();
    const password = document.getElementById('loginPasswordInput').value.trim();
    const storeCode = document.getElementById('loginStoreCodeInput').value.trim() || '8888';

    const matched = appState.users.find((u) => u.account === account && u.password === password);
    if (!matched) {
      showToast('❌ 账号或密码错误（管理员测试号: 13800000001 / 密码: 123456）');
      return;
    }
    loginWithUser(matched, storeCode);
    showToast(`🎉 欢迎回来，${matched.name}！`);
  });

  // 注册新账号提交
  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('regNameInput').value.trim();
    const account = document.getElementById('regAccountInput').value.trim();
    const password = document.getElementById('regPasswordInput').value.trim();
    const role = document.getElementById('regRoleSelect').value;
    const adminCode = document.getElementById('regAdminCodeInput').value.trim();

    if (!name || !account || !password) {
      showToast('⚠️ 请完整填写姓名、账号和密码');
      return;
    }
    if (appState.users.some((u) => u.account === account)) {
      showToast('⚠️ 该手机号/账号已注册，请直接登录');
      return;
    }
    if (role === 'admin' && adminCode !== '6666') {
      showToast('❌ 管理员授权码不正确（默认授权码：6666）');
      return;
    }

    const newUser = {
      id: 'u_' + Date.now(),
      account,
      password,
      name,
      role,
      storeCode: '8888'
    };
    appState.users.push(newUser);
    saveUsersToStorage();
    loginWithUser(newUser, '8888');
    showToast(`🎉 注册成功！已登录为「${name}」`);
  });

  // 快捷一键体验管理员 / 普通店员
  document.getElementById('demoAdminLoginBtn').addEventListener('click', () => {
    const adminUser = appState.users.find((u) => u.role === 'admin') || DEFAULT_USERS[0];
    loginWithUser(adminUser, '8888');
    showToast('👑 已使用「采购管理员」身份登录（可录入/修改价格）');
  });

  document.getElementById('demoViewerLoginBtn').addEventListener('click', () => {
    const viewerUser = appState.users.find((u) => u.role === 'viewer') || DEFAULT_USERS[1];
    loginWithUser(viewerUser, '8888');
    showToast('👀 已使用「普通店员」身份登录（只读查看价格，防止误改）');
  });

  // 顶部与设置页切换账号/退出登录
  document.getElementById('userProfileBtn').addEventListener('click', () => {
    logoutCurrentUser();
  });
  document.getElementById('logoutBtn').addEventListener('click', () => {
    logoutCurrentUser();
    showToast('👋 已退出登录');
  });
  document.getElementById('switchAccountInTabBtn').addEventListener('click', () => {
    logoutCurrentUser();
  });

  // 电脑端顶部快速切换角色视角按钮
  const quickSwitchRoleBtn = document.getElementById('quickSwitchRoleBtn');
  if (quickSwitchRoleBtn) {
    quickSwitchRoleBtn.addEventListener('click', () => {
      if (isAdmin()) {
        const viewerUser = appState.users.find((u) => u.role === 'viewer') || DEFAULT_USERS[1];
        loginWithUser(viewerUser, '8888');
        showToast('👀 已切换至「普通成员/店员」只读视角');
      } else {
        const adminUser = appState.users.find((u) => u.role === 'admin') || DEFAULT_USERS[0];
        loginWithUser(adminUser, '8888');
        showToast('👑 已切换至「采购管理员」可编辑视角');
      }
    });
  }

  // 隐私政策弹窗
  const privacyModal = document.getElementById('privacyModalOverlay');
  document.getElementById('openPrivacyModalLink').addEventListener('click', () => {
    privacyModal.classList.remove('hidden');
  });
  document.getElementById('closePrivacyModalBtn').addEventListener('click', () => {
    privacyModal.classList.add('hidden');
  });
  document.getElementById('acceptPrivacyBtn').addEventListener('click', () => {
    document.getElementById('agreePrivacyCheckbox').checked = true;
    privacyModal.classList.add('hidden');
  });
}

// ==================== 初始化与全局事件绑定 ====================
function initApp() {
  loadDataFromStorage();
  loadUsersAndSession();
  loadCloudConfig();
  updateNetworkIndicator();
  bindAuthEvents();

  window.addEventListener('online', () => {
    updateNetworkIndicator();
    showToast('🟢 网络已连接');
  });
  window.addEventListener('offline', () => {
    updateNetworkIndicator();
    showToast('⚪ 已切换至离线模式');
  });

  // 底部 Tab 切换
  document.querySelectorAll('.app-tabbar .tab-item').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 日期控制
  document.getElementById('prevDayBtn').addEventListener('click', () => {
    appState.selectedDate = addDays(appState.selectedDate, -1);
    renderDateBarAndStats();
    renderDailyFruitList();
  });

  document.getElementById('nextDayBtn').addEventListener('click', () => {
    appState.selectedDate = addDays(appState.selectedDate, 1);
    renderDateBarAndStats();
    renderDailyFruitList();
  });

  document.getElementById('selectedDateInput').addEventListener('change', (e) => {
    if (e.target.value) {
      appState.selectedDate = e.target.value;
      renderDateBarAndStats();
      renderDailyFruitList();
    }
  });

  document.getElementById('backTodayBtn').addEventListener('click', () => {
    appState.selectedDate = getTodayStr();
    renderDateBarAndStats();
    renderDailyFruitList();
    showToast('📅 已回到今天');
  });

  // 4宫格状态筛选
  document.querySelectorAll('.summary-card').forEach((card) => {
    card.addEventListener('click', () => {
      const targetFilter = card.dataset.filter;
      appState.statusFilter = appState.statusFilter === targetFilter ? 'all' : targetFilter;
      renderDateBarAndStats();
      renderDailyFruitList();
    });
  });

  // 搜索框
  const searchInput = document.getElementById('fruitSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  searchInput.addEventListener('input', (e) => {
    appState.searchQuery = e.target.value;
    clearSearchBtn.classList.toggle('hidden', !appState.searchQuery);
    renderDailyFruitList();
  });
  clearSearchBtn.addEventListener('click', () => {
    appState.searchQuery = '';
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    renderDailyFruitList();
  });

  // 一键将当日未录品种沿用昨日价格
  document.getElementById('copyYesterdayAllBtn').addEventListener('click', () => {
    if (!isAdmin()) return;
    let copied = 0;
    appState.fruits.forEach((f) => {
      const curRec = getPriceRecord(appState.selectedDate, f.id);
      if (!curRec) {
        const prevInfo = getPreviousRecordedPrice(appState.selectedDate, f.id);
        if (prevInfo) {
          setFruitPrice(appState.selectedDate, f.id, prevInfo.price, '');
          copied++;
        }
      }
    });
    if (copied > 0) {
      renderDateBarAndStats();
      renderDailyFruitList();
      showToast(`⚡ 已为 ${copied} 个未录入品种填入前一日价格`);
    } else {
      showToast('ℹ️ 所有品种今日均已录入或无前日参考价');
    }
  });

  // 顶部同步按钮
  document.getElementById('syncNowHeaderBtn').addEventListener('click', () => {
    syncToCloud('download');
  });
  document.getElementById('networkStatusPill').addEventListener('click', () => {
    syncToCloud('download');
  });

  // 新增水果弹窗绑定
  document.getElementById('headerAddFruitBtn').addEventListener('click', () => openFruitModal(null));
  document.getElementById('openAddFruitModalBtn').addEventListener('click', () => openFruitModal(null));
  document.getElementById('closeFruitModalBtn').addEventListener('click', closeFruitModal);
  document.getElementById('cancelFruitModalBtn').addEventListener('click', closeFruitModal);
  document.getElementById('saveFruitModalBtn').addEventListener('click', saveFruitFromModal);

  // 趋势页切换
  document.getElementById('trendFruitSelect').addEventListener('change', (e) => {
    appState.trendFruitId = e.target.value;
    renderTrendTab();
  });

  document.querySelectorAll('#trendPeriodTabs .period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#trendPeriodTabs .period-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      appState.trendDays = Number(btn.dataset.days);
      renderTrendTab();
    });
  });

  // 导出与备份
  document.getElementById('exportCsvBtn').addEventListener('click', exportToCsv);
  document.getElementById('quickExportCsvBtn').addEventListener('click', exportToCsv);
  document.getElementById('exportJsonBtn').addEventListener('click', exportToJsonBackup);
  document.getElementById('importJsonFileInput').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      importFromJsonBackup(e.target.files[0]);
      e.target.value = '';
    }
  });

  // 云端同步按钮
  document.getElementById('saveCloudConfigBtn').addEventListener('click', saveCloudConfig);
  document.getElementById('uploadCloudBtn').addEventListener('click', () => syncToCloud('upload'));
  document.getElementById('downloadCloudBtn').addEventListener('click', () => syncToCloud('download'));

  // 演示数据清理与重置
  document.getElementById('clearPricesOnlyBtn').addEventListener('click', () => {
    if (!isAdmin()) return;
    if (confirm('确定要清空所有历史价格记录吗？（您添加的水果品种将保留，方便从零开始正式记账）')) {
      appState.records = {};
      saveDataToStorage();
      renderAll();
      showToast('🧹 已清空历史价格记录，水果品种已保留');
    }
  });

  document.getElementById('resetDemoDataBtn').addEventListener('click', () => {
    if (!isAdmin()) return;
    if (confirm('确定要恢复默认演示水果和近7天示例价格数据吗？')) {
      const demo = createDefaultDemoData();
      appState.fruits = demo.fruits;
      appState.records = demo.records;
      appState.selectedDate = getTodayStr();
      saveDataToStorage();
      renderAll();
      showToast('🔄 已恢复默认演示数据');
    }
  });

  // 电脑端切换手机边框/全宽预览
  document.getElementById('toggleFrameBtn').addEventListener('click', () => {
    document.body.classList.toggle('phone-preview-mode');
    const isPhone = document.body.classList.contains('phone-preview-mode');
    document.getElementById('toggleFrameBtn').textContent = isPhone ? '🖥️ 切换全宽视图' : '📱 切换手机外壳';
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  applyRolePermissionsUI();
  renderAll();
}

document.addEventListener('DOMContentLoaded', initApp);
