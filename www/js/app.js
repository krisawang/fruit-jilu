/**
 * 水果每日成本表 (v3.0 极简热修版 - 支持同一水果多规格/品种/果径自定义 + 自动折算单盒/单个成本)
 */

const STORAGE_KEY = 'FRUIT_PRICE_SPEC_V3';
const CLOUD_CONFIG_KEY = 'FRUIT_PRICE_CLOUD_CONFIG_V1';
const DEFAULT_GITHUB_REPO = 'krisawang/fruit-jilu';

const EMOJI_LIST = [
  '🫐', '🍎', '🍏', '🍐', '🍊', '🍋', '🍌', '🍉',
  '🍇', '🍓', '🍒', '🍑', '🥭', '🍍', '🥝', '🍅',
  '🥑', '🍈', '🥥', '🌰', '🍋‍🟩', '🫒', '🧺', '🎁'
];

let appState = {
  selectedDate: getTodayStr(),
  editMode: true, // true: ✏️直接记价模式 | false: 👀只读看价模式
  selectedFruitFilter: '全部',
  searchQuery: '',
  trendSpecId: '',
  trendDays: 7,
  selectedEmoji: '🫐',
  /**
   * specs 数组：每一项代表一个具体的「水果+品种规格」
   * {
   *   id: 's_1',
   *   fruitName: '蓝莓',
   *   emoji: '🫐',
   *   specTitle: 'L25 · 1箱12盒 · 单盒125g',
   *   unit: '元/箱',
   *   subCount: 12,
   *   subUnit: '盒'
   * }
   */
  specs: [],
  // records: { "YYYY-MM-DD": { [specId]: { price: 126 } } }
  records: {}
};

// ==================== 日期工具 ====================
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
  return dateStr.slice(5);
}

// ==================== 默认示例数据（按您的真实蓝莓、维纳斯苹果规格预置） ====================
function createDefaultDemoData() {
  const today = getTodayStr();
  const defaultSpecs = [
    {
      id: 's_blueberry_l25',
      fruitName: '蓝莓',
      emoji: '🫐',
      specTitle: 'L25 · 1箱12盒 · 单盒125g',
      unit: '元/箱',
      subCount: 12,
      subUnit: '盒'
    },
    {
      id: 's_blueberry_l18',
      fruitName: '蓝莓',
      emoji: '🫐',
      specTitle: 'L18 · 1箱12盒 · 单盒125g',
      unit: '元/箱',
      subCount: 12,
      subUnit: '盒'
    },
    {
      id: 's_venus_95',
      fruitName: '维纳斯苹果',
      emoji: '🍎',
      specTitle: '礼盒装 · 95mm+ (8个)',
      unit: '元/盒',
      subCount: 8,
      subUnit: '个'
    },
    {
      id: 's_venus_90',
      fruitName: '维纳斯苹果',
      emoji: '🍎',
      specTitle: '礼盒装 · 90mm+ (9个)',
      unit: '元/盒',
      subCount: 9,
      subUnit: '个'
    },
    {
      id: 's_venus_85',
      fruitName: '维纳斯苹果',
      emoji: '🍎',
      specTitle: '礼盒装 · 85mm+ (10个)',
      unit: '元/盒',
      subCount: 10,
      subUnit: '个'
    },
    {
      id: 's_grape_1',
      fruitName: '阳光玫瑰',
      emoji: '🍇',
      specTitle: '精品青提 · 9斤整箱',
      unit: '元/箱',
      subCount: 9,
      subUnit: '斤'
    },
    {
      id: 's_cherry_2j',
      fruitName: '进口车厘子',
      emoji: '🍒',
      specTitle: '2J级 · 5斤原箱',
      unit: '元/箱',
      subCount: 5,
      subUnit: '斤'
    }
  ];

  // 近 7 天演示价格
  const series = {
    s_blueberry_l25: [120, 120, 118, 122, 120, 120, 126],
    s_blueberry_l18: [96, 96, 95, 96, 94, 96, 92],
    s_venus_95:      [68, 68, 66, 66, 68, 68, 72],
    s_venus_90:      [62, 62, 60, 60, 62, 62, 62],
    s_venus_85:      [55, 55, 54, 54, 55, 56, 54],
    s_grape_1:       [78, 80, 78, 76, 75, 75, 72],
    s_cherry_2j:     [245, 240, 238, 235, 230, 228, 225]
  };

  const records = {};
  for (let i = 6; i >= 0; i--) {
    const dStr = addDays(today, -i);
    records[dStr] = {};
    const idx = 6 - i;
    defaultSpecs.forEach((sp) => {
      const val = series[sp.id] ? series[sp.id][idx] : null;
      if (val !== null && val !== undefined) {
        records[dStr][sp.id] = { price: Number(val), updatedAt: Date.now() };
      }
    });
  }

  return { specs: defaultSpecs, records };
}

// ==================== 本地存储 ====================
function loadDataFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const demo = createDefaultDemoData();
      appState.specs = demo.specs;
      appState.records = demo.records;
      saveDataToStorage(false);
    } else {
      const parsed = JSON.parse(raw);
      appState.specs = Array.isArray(parsed.specs) ? parsed.specs : [];
      appState.records = parsed.records && typeof parsed.records === 'object' ? parsed.records : {};
    }
  } catch (e) {
    const demo = createDefaultDemoData();
    appState.specs = demo.specs;
    appState.records = demo.records;
  }

  if (appState.specs.length > 0 && !appState.trendSpecId) {
    appState.trendSpecId = appState.specs[0].id;
  }
}

function saveDataToStorage(syncLocal = true) {
  try {
    const payload = {
      specs: appState.specs,
      records: appState.records,
      lastSavedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    if (syncLocal && location.protocol.startsWith('http')) {
      fetch('/api/shared-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    }
  } catch (e) {}
}

// ==================== 价格读取、单价折算与对比计算 ====================
function getPrice(dateStr, specId) {
  if (!appState.records[dateStr]) return null;
  const r = appState.records[dateStr][specId];
  if (!r || r.price === null || r.price === undefined || r.price === '' || isNaN(Number(r.price))) {
    return null;
  }
  return Number(r.price);
}

function getPrevPriceInfo(targetDate, specId) {
  const prevDay = addDays(targetDate, -1);
  const yPrice = getPrice(prevDay, specId);
  if (yPrice !== null) {
    return { isYesterday: true, date: prevDay, price: yPrice };
  }
  const earlierDates = Object.keys(appState.records)
    .filter((d) => d < targetDate)
    .sort((a, b) => (a > b ? -1 : 1));
  for (const d of earlierDates) {
    const p = getPrice(d, specId);
    if (p !== null) {
      return { isYesterday: false, date: d, price: p };
    }
  }
  return null;
}

function calcComparison(curPrice, prevInfo) {
  if (curPrice === null || curPrice === undefined || isNaN(curPrice)) {
    return { status: 'none', diff: 0, pct: 0, text: '未填' };
  }
  if (!prevInfo) {
    return { status: 'none', diff: 0, pct: 0, text: '首录' };
  }
  const diff = Number((curPrice - prevInfo.price).toFixed(2));
  const pct = prevInfo.price > 0 ? Number(((diff / prevInfo.price) * 100).toFixed(1)) : 0;

  if (Math.abs(diff) < 0.001) {
    return { status: 'flat', diff: 0, pct: 0, text: '持平' };
  } else if (diff > 0) {
    return { status: 'up', diff, pct, text: `↑ +${diff}` };
  } else {
    return { status: 'down', diff, pct, text: `↓ ${diff}` };
  }
}

function calcUnitBreakdownText(spec, price) {
  if (!spec.subCount || spec.subCount <= 1 || price === null || isNaN(price) || price <= 0) {
    return '';
  }
  const per = (price / spec.subCount).toFixed(2);
  return `折 ¥${per}/${spec.subUnit || '份'}`;
}

function setSpecPrice(dateStr, specId, val) {
  if (!appState.records[dateStr]) {
    appState.records[dateStr] = {};
  }
  if (val === '' || val === null || val === undefined || isNaN(Number(val))) {
    delete appState.records[dateStr][specId];
  } else {
    appState.records[dateStr][specId] = {
      price: Math.max(0, Number(Number(val).toFixed(2))),
      updatedAt: Date.now()
    };
  }
  saveDataToStorage(true);
}

// ==================== 渲染顶部日期与模式栏 ====================
function renderHeaderAndDate() {
  const dateInput = document.getElementById('selectedDateInput');
  const badge = document.getElementById('dateRelationTag');
  const backBtn = document.getElementById('backTodayBtn');
  const modeBtn = document.getElementById('modeToggleBtn');

  dateInput.value = appState.selectedDate;
  const rel = getRelativeDayLabel(appState.selectedDate);
  badge.textContent = rel;
  backBtn.classList.toggle('hidden', appState.selectedDate === getTodayStr());

  if (appState.editMode) {
    modeBtn.textContent = '✏️ 记价中';
    modeBtn.classList.remove('view-active');
  } else {
    modeBtn.textContent = '👀 只看模式';
    modeBtn.classList.add('view-active');
  }

  document.getElementById('topAddSpecBtn').classList.toggle('hidden', !appState.editMode);
  document.getElementById('bottomAddWrap').classList.toggle('hidden', !appState.editMode);
  document.getElementById('copyYesterdayAllBtn').classList.toggle('hidden', !appState.editMode);
}

// ==================== 渲染水果大类筛选条 ====================
function renderFruitFilterBar() {
  const bar = document.getElementById('categoryFilterBar');
  const fruitNames = ['全部', ...new Set(appState.specs.map((s) => s.fruitName))];

  bar.innerHTML = fruitNames
    .map(
      (name) => `
      <button class="filter-chip ${appState.selectedFruitFilter === name ? 'active' : ''}" data-fruit="${escapeHtml(name)}">
        ${escapeHtml(name)}
      </button>
    `
    )
    .join('');

  bar.querySelectorAll('.filter-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.selectedFruitFilter = btn.dataset.fruit;
      renderFruitFilterBar();
      renderDailyGroupedList();
    });
  });
}

// ==================== 核心：渲染按水果分组的多规格报价列表 ====================
function renderDailyGroupedList() {
  const container = document.getElementById('dailyFruitList');
  const q = appState.searchQuery.trim().toLowerCase();

  const filteredSpecs = appState.specs.filter((sp) => {
    if (appState.selectedFruitFilter !== '全部' && sp.fruitName !== appState.selectedFruitFilter) {
      return false;
    }
    if (q) {
      const matchFruit = sp.fruitName.toLowerCase().includes(q);
      const matchSpec = sp.specTitle.toLowerCase().includes(q);
      if (!matchFruit && !matchSpec) return false;
    }
    return true;
  });

  if (filteredSpecs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p style="font-size:26px;margin-bottom:6px;">🫐</p>
        <p>没有匹配的规格，您可以点击「＋ 加水果/规格」自定义添加</p>
      </div>
    `;
    return;
  }

  // 按水果名称分组
  const groupsMap = new Map();
  filteredSpecs.forEach((sp) => {
    if (!groupsMap.has(sp.fruitName)) {
      groupsMap.set(sp.fruitName, {
        fruitName: sp.fruitName,
        emoji: sp.emoji || '🍎',
        items: []
      });
    }
    groupsMap.get(sp.fruitName).items.push(sp);
  });

  const groupsHtml = Array.from(groupsMap.values())
    .map((group) => {
      const rowsHtml = group.items
        .map((sp) => {
          const curPrice = getPrice(appState.selectedDate, sp.id);
          const prevInfo = getPrevPriceInfo(appState.selectedDate, sp.id);
          const cmp = calcComparison(curPrice, prevInfo);
          const breakdown = calcUnitBreakdownText(sp, curPrice !== null ? curPrice : prevInfo ? prevInfo.price : null);
          const shortUnit = sp.unit.replace('元/', '/');

          const prevText = prevInfo
            ? `${prevInfo.isYesterday ? '昨' : '前'} ¥${prevInfo.price}`
            : '昨日无';

          const priceColHtml = appState.editMode
            ? `
              <div class="direct-price-box">
                <span class="direct-yen">¥</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  inputmode="decimal"
                  class="direct-price-input"
                  data-action="price-input"
                  data-id="${sp.id}"
                  placeholder="记价"
                  value="${curPrice !== null ? curPrice : ''}"
                />
                <span class="direct-unit">${escapeHtml(shortUnit)}</span>
              </div>
            `
            : `
              <div class="readonly-price-badge">
                ${
                  curPrice !== null
                    ? `<span class="readonly-price-num">¥${curPrice}</span><span class="readonly-price-u">${escapeHtml(shortUnit)}</span>`
                    : `<span style="color:#94a3b8;font-size:12px;">待录入</span>`
                }
              </div>
            `;

          return `
            <div class="spec-row" data-spec-id="${sp.id}">
              <!-- 左：规格名与折算单价 -->
              <div class="spec-info-col" data-action="edit-or-trend" data-id="${sp.id}" title="点击修改此规格或看走势">
                <div class="spec-title-line">
                  <span>${escapeHtml(sp.specTitle)}</span>
                  ${appState.editMode ? `<span class="spec-edit-hint">⚙️</span>` : ''}
                </div>
                <div class="spec-sub-line">
                  <span>单位: ${escapeHtml(sp.unit)}</span>
                  <span class="unit-calc-tag ${breakdown ? '' : 'hidden'}" id="calc-${sp.id}">${escapeHtml(breakdown)}</span>
                </div>
              </div>

              <!-- 中：昨日价格 & 涨跌对比 -->
              <div class="spec-compare-col">
                <span class="prev-price-line" data-action="copy-single-prev" data-id="${sp.id}" data-prev="${prevInfo ? prevInfo.price : ''}" title="点击沿用昨日价格">
                  ${prevText}
                </span>
                <span class="diff-pill ${cmp.status}" id="diff-${sp.id}">${cmp.text}</span>
              </div>

              <!-- 右：今日价格直接输入框 / 只读显示 -->
              <div class="spec-price-col">
                ${priceColHtml}
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div class="fruit-group-card">
          <div class="group-header">
            <div class="group-title">
              <span>${group.emoji}</span>
              <span>${escapeHtml(group.fruitName)}</span>
              <span class="group-count">${group.items.length}种规格</span>
            </div>
            ${
              appState.editMode
                ? `<button class="btn-group-add-spec" data-action="add-spec-for-fruit" data-fruit="${escapeHtml(group.fruitName)}" data-emoji="${group.emoji}">
                    ＋ 加规格
                  </button>`
                : ''
            }
          </div>
          <div class="group-rows">
            ${rowsHtml}
          </div>
        </div>
      `;
    })
    .join('');

  container.innerHTML = groupsHtml;
  bindGroupedListEvents(container);
}

/**
 * 输入价格时实时局部刷新涨跌标签与单盒折算价（不丢失输入框焦点）
 */
function updateSingleSpecRowUI(specId) {
  const sp = appState.specs.find((s) => s.id === specId);
  if (!sp) return;
  const curPrice = getPrice(appState.selectedDate, specId);
  const prevInfo = getPrevPriceInfo(appState.selectedDate, specId);
  const cmp = calcComparison(curPrice, prevInfo);

  const diffEl = document.getElementById(`diff-${specId}`);
  if (diffEl) {
    diffEl.className = `diff-pill ${cmp.status}`;
    diffEl.textContent = cmp.text;
  }

  const calcEl = document.getElementById(`calc-${specId}`);
  if (calcEl) {
    const breakdown = calcUnitBreakdownText(sp, curPrice !== null ? curPrice : prevInfo ? prevInfo.price : null);
    if (breakdown) {
      calcEl.textContent = breakdown;
      calcEl.classList.remove('hidden');
    } else {
      calcEl.classList.add('hidden');
    }
  }
}

function bindGroupedListEvents(container) {
  // 直接输入今日价格
  container.querySelectorAll('input[data-action="price-input"]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const specId = e.target.dataset.id;
      setSpecPrice(appState.selectedDate, specId, e.target.value);
      updateSingleSpecRowUI(specId);
    });
  });

  // 点击某水果右上角「＋加规格」直接为该水果新增一个规格
  container.querySelectorAll('button[data-action="add-spec-for-fruit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openSpecModal(null, btn.dataset.fruit, btn.dataset.emoji);
    });
  });

  // 点击左侧规格名称：记价模式下可编辑规格，只看模式下直接跳到该规格走势图
  container.querySelectorAll('[data-action="edit-or-trend"]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (appState.editMode) {
        openSpecModal(id);
      } else {
        appState.trendSpecId = id;
        switchTab('tab-trend');
      }
    });
  });

  // 点击“昨 ¥XX”一键填入今日
  container.querySelectorAll('[data-action="copy-single-prev"]').forEach((el) => {
    el.addEventListener('click', () => {
      if (!appState.editMode) return;
      const prevVal = el.dataset.prev;
      if (prevVal === '' || prevVal === undefined) return;
      const id = el.dataset.id;
      setSpecPrice(appState.selectedDate, id, Number(prevVal));
      renderDailyGroupedList();
      showToast('⚡ 已填入昨日价格');
    });
  });
}

// ==================== 新增 / 编辑水果规格弹窗 ====================
function renderEmojiPickerInModal() {
  const btn = document.getElementById('currentEmojiBtn');
  const grid = document.getElementById('emojiPickerGrid');
  btn.textContent = appState.selectedEmoji;

  grid.innerHTML = EMOJI_LIST.map(
    (em) => `
      <button type="button" class="emoji-option ${appState.selectedEmoji === em ? 'selected' : ''}" data-emoji="${em}">
        ${em}
      </button>
    `
  ).join('');

  grid.querySelectorAll('.emoji-option').forEach((b) => {
    b.addEventListener('click', () => {
      appState.selectedEmoji = b.dataset.emoji;
      btn.textContent = appState.selectedEmoji;
      grid.classList.add('hidden');
    });
  });
}

function openSpecModal(editSpecId = null, prefillFruitName = '', prefillEmoji = '') {
  const overlay = document.getElementById('specModalOverlay');
  const titleEl = document.getElementById('specModalTitle');
  const editIdInput = document.getElementById('editSpecIdInput');
  const fruitInput = document.getElementById('fruitGroupNameInput');
  const specTitleInput = document.getElementById('specTitleInput');
  const unitSelect = document.getElementById('specUnitSelect');
  const subCountInput = document.getElementById('specSubCountInput');
  const subUnitSelect = document.getElementById('specSubUnitSelect');
  const initPriceGroup = document.getElementById('initPriceGroup');
  const initPriceInput = document.getElementById('specInitPriceInput');
  const deleteBtn = document.getElementById('deleteSpecBtn');

  // 渲染已有水果快捷点选胶囊
  const existingFruitsMap = new Map();
  appState.specs.forEach((s) => {
    if (!existingFruitsMap.has(s.fruitName)) {
      existingFruitsMap.set(s.fruitName, s.emoji || '🍎');
    }
  });
  const quickPickEl = document.getElementById('existingFruitQuickPick');
  if (existingFruitsMap.size > 0) {
    quickPickEl.innerHTML =
      `<span style="font-size:11px;color:#94a3b8;align-self:center;">点选已有水果：</span>` +
      Array.from(existingFruitsMap.entries())
        .map(
          ([fName, em]) =>
            `<button type="button" class="quick-fruit-tag" data-fname="${escapeHtml(fName)}" data-femoji="${em}">${em} ${escapeHtml(fName)}</button>`
        )
        .join('');
    quickPickEl.querySelectorAll('.quick-fruit-tag').forEach((tag) => {
      tag.addEventListener('click', () => {
        fruitInput.value = tag.dataset.fname;
        appState.selectedEmoji = tag.dataset.femoji;
        document.getElementById('currentEmojiBtn').textContent = appState.selectedEmoji;
        specTitleInput.focus();
      });
    });
  } else {
    quickPickEl.innerHTML = '';
  }

  if (editSpecId) {
    const sp = appState.specs.find((s) => s.id === editSpecId);
    if (!sp) return;
    titleEl.textContent = '修改水果与规格';
    editIdInput.value = sp.id;
    fruitInput.value = sp.fruitName;
    appState.selectedEmoji = sp.emoji || '🍎';
    specTitleInput.value = sp.specTitle;
    unitSelect.value = sp.unit || '元/箱';
    subCountInput.value = sp.subCount || '';
    subUnitSelect.value = sp.subUnit || '盒';
    initPriceGroup.classList.add('hidden');
    deleteBtn.classList.remove('hidden');
  } else {
    titleEl.textContent = prefillFruitName ? `为「${prefillFruitName}」添加新规格` : '添加水果与规格';
    editIdInput.value = '';
    fruitInput.value = prefillFruitName || '';
    appState.selectedEmoji = prefillEmoji || '🫐';
    specTitleInput.value = '';
    unitSelect.value = '元/箱';
    subCountInput.value = '';
    subUnitSelect.value = '盒';
    initPriceInput.value = '';
    initPriceGroup.classList.remove('hidden');
    deleteBtn.classList.add('hidden');
  }

  renderEmojiPickerInModal();
  overlay.classList.remove('hidden');
  setTimeout(() => {
    if (fruitInput.value) specTitleInput.focus();
    else fruitInput.focus();
  }, 60);
}

function closeSpecModal() {
  document.getElementById('specModalOverlay').classList.add('hidden');
  document.getElementById('emojiPickerGrid').classList.add('hidden');
}

function saveSpecFromModal() {
  const editId = document.getElementById('editSpecIdInput').value.trim();
  const fruitName = document.getElementById('fruitGroupNameInput').value.trim();
  const specTitle = document.getElementById('specTitleInput').value.trim();
  const unit = document.getElementById('specUnitSelect').value;
  const subCountRaw = document.getElementById('specSubCountInput').value.trim();
  const subCount = subCountRaw ? Number(subCountRaw) : 0;
  const subUnit = document.getElementById('specSubUnitSelect').value;
  const initPrice = document.getElementById('specInitPriceInput').value.trim();

  if (!fruitName) {
    showToast('⚠️ 请填写水果名称（如：蓝莓、维纳斯苹果）');
    return;
  }
  if (!specTitle) {
    showToast('⚠️ 请填写品种或规格（如：L25 1箱12盒 或 95mm+ 8个）');
    return;
  }

  // 同步同水果的 emoji
  appState.specs.forEach((s) => {
    if (s.fruitName === fruitName) s.emoji = appState.selectedEmoji;
  });

  if (editId) {
    const sp = appState.specs.find((s) => s.id === editId);
    if (sp) {
      sp.fruitName = fruitName;
      sp.emoji = appState.selectedEmoji;
      sp.specTitle = specTitle;
      sp.unit = unit;
      sp.subCount = subCount;
      sp.subUnit = subUnit;
    }
    showToast(`✅ 已修改「${fruitName} - ${specTitle}」`);
  } else {
    const newId = 'sp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
    appState.specs.push({
      id: newId,
      fruitName,
      emoji: appState.selectedEmoji,
      specTitle,
      unit,
      subCount,
      subUnit
    });
    if (initPrice !== '' && !isNaN(Number(initPrice))) {
      setSpecPrice(appState.selectedDate, newId, Number(initPrice));
    }
    showToast(`🎉 已添加「${fruitName} · ${specTitle}」`);
  }

  saveDataToStorage(true);
  closeSpecModal();
  renderFruitFilterBar();
  renderDailyGroupedList();
}

// ==================== 页面 2：历史走势折线图 ====================
function renderTrendTab() {
  const selectEl = document.getElementById('trendFruitSelect');
  if (appState.specs.length === 0) {
    selectEl.innerHTML = '<option value="">暂无水果规格</option>';
    return;
  }
  if (!appState.specs.some((s) => s.id === appState.trendSpecId)) {
    appState.trendSpecId = appState.specs[0].id;
  }

  selectEl.innerHTML = appState.specs
    .map(
      (s) =>
        `<option value="${s.id}" ${s.id === appState.trendSpecId ? 'selected' : ''}>${s.emoji} ${escapeHtml(
          s.fruitName
        )} — ${escapeHtml(s.specTitle)} (${escapeHtml(s.unit)})</option>`
    )
    .join('');

  const sp = appState.specs.find((s) => s.id === appState.trendSpecId);
  if (!sp) return;

  document.getElementById('historyTableFruitName').textContent = `${sp.emoji} ${sp.fruitName} (${sp.specTitle})`;

  const today = appState.selectedDate;
  const startDay = addDays(today, -(appState.trendDays - 1));
  const allPoints = [];

  Object.keys(appState.records)
    .sort()
    .forEach((d) => {
      const p = getPrice(d, sp.id);
      if (p !== null) {
        allPoints.push({ date: d, price: p });
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

    document.getElementById('trendLatestPrice').textContent = `¥${latest}`;
    document.getElementById('trendMaxPrice').textContent = `¥${maxP}`;
    document.getElementById('trendMinPrice').textContent = `¥${minP}`;
    document.getElementById('trendAvgPrice').textContent = `¥${avgP.toFixed(1)}`;
  }

  renderSvgChart(periodPoints, sp);
  renderHistoryTable(allPoints, sp);
}

function renderSvgChart(points, sp) {
  const container = document.getElementById('chartContainer');
  if (points.length === 0) {
    container.innerHTML = `<div class="empty-state">暂无「${escapeHtml(sp.fruitName)} - ${escapeHtml(sp.specTitle)}」的价格记录</div>`;
    return;
  }

  const width = 360;
  const height = 190;
  const padLeft = 42;
  const padRight = 22;
  const padTop = 26;
  const padBottom = 30;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const prices = points.map((p) => p.price);
  let minVal = Math.min(...prices);
  let maxVal = Math.max(...prices);
  if (minVal === maxVal) {
    minVal = Math.max(0, minVal - 2);
    maxVal = maxVal + 2;
  } else {
    const pad = (maxVal - minVal) * 0.15;
    minVal = Math.max(0, minVal - pad);
    maxVal = maxVal + pad;
  }

  const getX = (idx) => (points.length === 1 ? padLeft + chartW / 2 : padLeft + (idx / (points.length - 1)) * chartW);
  const getY = (val) => padTop + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;

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
      <text x="${padLeft - 6}" y="${Number(y) + 4}" text-anchor="end" font-size="10" fill="#94a3b8">¥${val.toFixed(0)}</text>
    `;
  }

  const stepLabel = Math.max(1, Math.ceil(coords.length / 7));
  const circlesHtml = coords
    .map((c, idx) => {
      const showLabel = idx === 0 || idx === coords.length - 1 || idx % stepLabel === 0;
      return `
        <circle cx="${c.x}" cy="${c.y}" r="4" fill="#059669" stroke="#ffffff" stroke-width="2" />
        ${
          showLabel
            ? `<text x="${c.x}" y="${c.y - 8}" text-anchor="middle" font-size="10" font-weight="700" fill="#0f172a">¥${c.price}</text>
               <text x="${c.x}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#64748b">${c.date.slice(5)}</text>`
            : ''
        }
      `;
    })
    .join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="190">
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#059669" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#059669" stop-opacity="0.0" />
        </linearGradient>
      </defs>
      ${gridLines}
      ${coords.length > 1 ? `<polygon points="${areaPoints}" fill="url(#lineGrad)" />` : ''}
      ${coords.length > 1 ? `<polyline fill="none" stroke="#059669" stroke-width="2.5" points="${polylinePoints}" />` : ''}
      ${circlesHtml}
    </svg>
  `;
}

function renderHistoryTable(allPoints, sp) {
  const tbody = document.getElementById('fruitHistoryTableBody');
  if (allPoints.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:14px;">暂无记录</td></tr>`;
    return;
  }
  const rev = [...allPoints].reverse();
  tbody.innerHTML = rev
    .map((pt, idx) => {
      const prevPt = rev[idx + 1] || null;
      let cmpHtml = '--';
      if (prevPt) {
        const d = Number((pt.price - prevPt.price).toFixed(2));
        if (d > 0) cmpHtml = `<span class="text-up" style="font-weight:700;">↑ +${d}</span>`;
        else if (d < 0) cmpHtml = `<span class="text-down" style="font-weight:700;">↓ ${d}</span>`;
        else cmpHtml = `持平`;
      }
      const perText = calcUnitBreakdownText(sp, pt.price) || '-';
      return `
        <tr>
          <td><strong>${pt.date}</strong></td>
          <td>¥${pt.price} <span style="color:#94a3b8;font-size:11px;">${escapeHtml(sp.unit)}</span></td>
          <td style="color:#0284c7;">${escapeHtml(perText)}</td>
          <td>${cmpHtml}</td>
        </tr>
      `;
    })
    .join('');
}

// ==================== GitHub 云端同步与 Excel 导出 ====================
function loadCloudConfig() {
  try {
    const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
    if (!raw) return;
    const cfg = JSON.parse(raw);
    document.getElementById('githubRepoInput').value = cfg.githubRepo || DEFAULT_GITHUB_REPO;
    document.getElementById('cloudApiKeyInput').value = cfg.apiKey || '';
    if (cfg.lastSyncText) {
      document.getElementById('cloudSyncStatusText').textContent = cfg.lastSyncText;
    }
  } catch (e) {}
}

function saveCloudConfig() {
  const githubRepo = document.getElementById('githubRepoInput').value.trim() || DEFAULT_GITHUB_REPO;
  const apiKey = document.getElementById('cloudApiKeyInput').value.trim();
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify({ githubRepo, apiKey }));
  showToast('💾 同步配置已保存');
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))));
}

async function syncWithGithub(mode = 'download', silent = false) {
  const githubRepo = document.getElementById('githubRepoInput').value.trim() || DEFAULT_GITHUB_REPO;
  const token = document.getElementById('cloudApiKeyInput').value.trim();
  const statusEl = document.getElementById('cloudSyncStatusText');
  const apiUrl = `https://api.github.com/repos/${githubRepo}/contents/www/shared-data.json`;

  if (mode === 'upload') {
    if (!token) {
      showToast('⚠️ 首次发布价格请先填写 GitHub Token');
      switchTab('tab-settings');
      return;
    }
    statusEl.textContent = '⏳ 正在发布最新价格到 GitHub...';
    try {
      const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      let sha = undefined;
      const getRes = await fetch(apiUrl, { method: 'GET', headers, cache: 'no-store' });
      if (getRes.ok) {
        const info = await getRes.json();
        sha = info.sha;
      }
      const contentObj = {
        version: '3.0',
        syncedAt: new Date().toISOString(),
        specs: appState.specs,
        records: appState.records
      };
      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `更新每日水果价格 (${getTodayStr()})`,
          content: utf8ToBase64(JSON.stringify(contentObj, null, 2)),
          ...(sha ? { sha } : {})
        })
      });
      if (!putRes.ok) throw new Error(`HTTP ${putRes.status}`);
      const msg = `✅ 已发布最新价格：${new Date().toLocaleString()}`;
      statusEl.textContent = msg;
      localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify({ githubRepo, apiKey: token, lastSyncText: msg }));
      showToast('📢 最新价格已发布，所有人打开均可看到！');
    } catch (err) {
      statusEl.textContent = `❌ 发布失败: ${err.message}`;
      showToast(`❌ 发布失败: ${err.message}`);
    }
  } else {
    if (!silent) statusEl.textContent = '⏳ 正在同步最新价格...';
    try {
      let payload = null;
      const headers = { Accept: 'application/vnd.github+json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${apiUrl}?t=${Date.now()}`, { method: 'GET', headers, cache: 'no-store' });
      if (res.ok) {
        const fileData = await res.json();
        if (fileData.content) payload = JSON.parse(base64ToUtf8(fileData.content));
      }
      if (!payload) {
        const cdnRes = await fetch(`https://cdn.jsdelivr.net/gh/${githubRepo}@main/www/shared-data.json?t=${Date.now()}`, { cache: 'no-store' });
        if (cdnRes.ok) payload = await cdnRes.json();
      }
      if (payload && Array.isArray(payload.specs) && payload.specs.length > 0) {
        appState.specs = payload.specs;
        appState.records = payload.records || {};
        saveDataToStorage(false);
        renderAll();
        const msg = `✅ 已同步最新价格：${new Date().toLocaleTimeString()}`;
        statusEl.textContent = msg;
        if (!silent) showToast('🔄 已同步最新价格表！');
      }
    } catch (err) {
      if (!silent) showToast('ℹ️ 已显示当前最新本地价格');
    }
  }
}

function exportToCsv() {
  const rows = [['日期', '水果名称', '品种与规格', '当日成本价', '计价单位', '折合单价', '昨日参考价', '涨跌对比']];
  const sortedDates = Object.keys(appState.records).sort((a, b) => (a > b ? -1 : 1));
  sortedDates.forEach((d) => {
    appState.specs.forEach((sp) => {
      const curP = getPrice(d, sp.id);
      if (curP === null) return;
      const prev = getPrevPriceInfo(d, sp.id);
      const cmp = calcComparison(curP, prev);
      rows.push([
        d,
        sp.fruitName,
        sp.specTitle,
        curP,
        sp.unit,
        calcUnitBreakdownText(sp, curP),
        prev ? prev.price : '',
        cmp.text
      ]);
    });
  });

  if (rows.length <= 1) {
    showToast('⚠️ 暂无可导出的价格数据');
    return;
  }
  const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `水果每日成本表_${getTodayStr()}.csv`;
  a.click();
  showToast('📊 已导出 Excel 表格！');
}

function exportToJson() {
  const blob = new Blob([JSON.stringify({ specs: appState.specs, records: appState.records }, null, 2)], {
    type: 'application/json;charset=utf-8;'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `水果成本备份_${getTodayStr()}.json`;
  a.click();
  showToast('💾 备份已导出');
}

// ==================== 辅助函数与初始化 ====================
function switchTab(tabId) {
  document.querySelectorAll('.tab-page').forEach((s) => s.classList.toggle('active', s.id === tabId));
  document.querySelectorAll('.app-tabbar .tab-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
  if (tabId === 'tab-daily') renderDailyGroupedList();
  else if (tabId === 'tab-trend') renderTrendTab();
}

function showToast(msg) {
  const box = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast-msg';
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAll() {
  renderHeaderAndDate();
  renderFruitFilterBar();
  renderDailyGroupedList();
  renderTrendTab();
}

function initApp() {
  loadDataFromStorage();
  loadCloudConfig();

  // 顶部「记价中 / 只看模式」一键切换
  document.getElementById('modeToggleBtn').addEventListener('click', () => {
    appState.editMode = !appState.editMode;
    renderHeaderAndDate();
    renderDailyGroupedList();
    showToast(appState.editMode ? '✏️ 已切换为「直接记价模式」' : '👀 已切换为「只读看价模式」（防误触）');
  });

  // 日期控制
  document.getElementById('prevDayBtn').addEventListener('click', () => {
    appState.selectedDate = addDays(appState.selectedDate, -1);
    renderHeaderAndDate();
    renderDailyGroupedList();
  });
  document.getElementById('nextDayBtn').addEventListener('click', () => {
    appState.selectedDate = addDays(appState.selectedDate, 1);
    renderHeaderAndDate();
    renderDailyGroupedList();
  });
  document.getElementById('selectedDateInput').addEventListener('change', (e) => {
    if (e.target.value) {
      appState.selectedDate = e.target.value;
      renderHeaderAndDate();
      renderDailyGroupedList();
    }
  });
  document.getElementById('backTodayBtn').addEventListener('click', () => {
    appState.selectedDate = getTodayStr();
    renderHeaderAndDate();
    renderDailyGroupedList();
  });

  // 搜索与一键沿用昨日
  const searchInput = document.getElementById('fruitSearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  searchInput.addEventListener('input', (e) => {
    appState.searchQuery = e.target.value;
    clearBtn.classList.toggle('hidden', !appState.searchQuery);
    renderDailyGroupedList();
  });
  clearBtn.addEventListener('click', () => {
    appState.searchQuery = '';
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    renderDailyGroupedList();
  });

  document.getElementById('copyYesterdayAllBtn').addEventListener('click', () => {
    let count = 0;
    appState.specs.forEach((sp) => {
      if (getPrice(appState.selectedDate, sp.id) === null) {
        const prev = getPrevPriceInfo(appState.selectedDate, sp.id);
        if (prev) {
          setSpecPrice(appState.selectedDate, sp.id, prev.price);
          count++;
        }
      }
    });
    renderDailyGroupedList();
    showToast(count > 0 ? `⚡ 已为 ${count} 个未填规格填入昨日价` : 'ℹ️ 今日所有规格均已录入价格');
  });

  // 添加/编辑规格弹窗事件
  document.getElementById('topAddSpecBtn').addEventListener('click', () => openSpecModal(null));
  document.getElementById('bottomAddSpecBtn').addEventListener('click', () => openSpecModal(null));
  document.getElementById('closeSpecModalBtn').addEventListener('click', closeSpecModal);
  document.getElementById('cancelSpecModalBtn').addEventListener('click', closeSpecModal);
  document.getElementById('saveSpecModalBtn').addEventListener('click', saveSpecFromModal);

  document.getElementById('currentEmojiBtn').addEventListener('click', () => {
    document.getElementById('emojiPickerGrid').classList.toggle('hidden');
  });

  document.querySelectorAll('.chip-preset').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.getElementById('specTitleInput').value = chip.dataset.fill;
    });
  });

  document.getElementById('deleteSpecBtn').addEventListener('click', () => {
    const editId = document.getElementById('editSpecIdInput').value;
    const sp = appState.specs.find((s) => s.id === editId);
    if (sp && confirm(`确定删除「${sp.fruitName} - ${sp.specTitle}」吗？`)) {
      appState.specs = appState.specs.filter((s) => s.id !== editId);
      saveDataToStorage(true);
      closeSpecModal();
      renderAll();
      showToast('🗑️ 已删除该规格');
    }
  });

  // 底部导航
  document.querySelectorAll('.app-tabbar .tab-item').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 趋势页
  document.getElementById('trendFruitSelect').addEventListener('change', (e) => {
    appState.trendSpecId = e.target.value;
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

  // 同步与导出
  document.getElementById('saveCloudConfigBtn').addEventListener('click', saveCloudConfig);
  document.getElementById('uploadCloudBtn').addEventListener('click', () => syncWithGithub('upload', false));
  document.getElementById('downloadCloudBtn').addEventListener('click', () => syncWithGithub('download', false));
  document.getElementById('exportCsvBtn').addEventListener('click', exportToCsv);
  document.getElementById('quickExportCsvBtn').addEventListener('click', exportToCsv);
  document.getElementById('exportJsonBtn').addEventListener('click', exportToJson);

  document.getElementById('importJsonFileInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (Array.isArray(parsed.specs)) {
          appState.specs = parsed.specs;
          appState.records = parsed.records || {};
          saveDataToStorage(true);
          renderAll();
          showToast('✅ 已恢复备份数据');
        }
      } catch (err) {
        showToast('❌ 备份文件格式有误');
      }
    };
    reader.readAsText(file, 'utf-8');
  });

  document.getElementById('clearPricesOnlyBtn').addEventListener('click', () => {
    if (confirm('确定清空历史价格记录（保留您设置好的水果与规格）？')) {
      appState.records = {};
      saveDataToStorage(true);
      renderAll();
      showToast('🧹 已清空价格记录');
    }
  });

  document.getElementById('resetDemoDataBtn').addEventListener('click', () => {
    if (confirm('恢复默认示例（含蓝莓L25、维纳斯苹果各规格）？')) {
      const demo = createDefaultDemoData();
      appState.specs = demo.specs;
      appState.records = demo.records;
      saveDataToStorage(true);
      renderAll();
      showToast('🔄 已恢复示例数据');
    }
  });

  document.getElementById('toggleFrameBtn').addEventListener('click', () => {
    document.body.classList.toggle('phone-preview-mode');
  });

  renderAll();
  syncWithGithub('download', true);
  checkAndApplyHotfixFromGithub();
}

/**
 * 手机 APK 在线热更新引擎：
 * 安装此次新版 APK 后，后续在电脑上修改界面或逻辑并上传 GitHub，手机打开 App 会自动拉取最新脚本热更新，无需重新下载安装 APK！
 */
async function checkAndApplyHotfixFromGithub() {
  if (!navigator.onLine || window.__HOTFIX_APPLIED__) return;
  try {
    const githubRepo = DEFAULT_GITHUB_REPO;
    const cdnBase = `https://cdn.jsdelivr.net/gh/${githubRepo}@main/www`;
    const cssRes = await fetch(`${cdnBase}/css/style.css?t=${Date.now()}`, { cache: 'no-store' });
    if (cssRes.ok) {
      const cssText = await cssRes.text();
      let styleEl = document.getElementById('hotfix-live-css');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'hotfix-live-css';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = cssText;
    }
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', initApp);
