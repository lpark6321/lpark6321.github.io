// 自選股側欄元件：管理自選清單與群組（新增、改名、刪除、拖曳換群組）；每列顯示現價與漲跌（報價更新時只改這兩格）。
import { PAGE1_GROUP, store, isValidStockCode, sanitizeWatchlist, watchGroupNames } from '../data/store.js';
import { esc } from '../services/html.js';
import { downloadJson, readJsonArrayFile } from '../services/jsonFile.js';
import { fmtNum, fmtPct, liveQuoteMap, stockName, trendClass } from '../services/quoteUtils.js';

// 舊版新增自選股時名稱會被寫成「股票2330」，顯示時改查真正的股名。
const displayName = (row) => (row.name && !/^股票\d/.test(row.name) ? row.name : stockName(row.code));

export class WatchlistSidebar {
  constructor(container) {
    this.zoom = 1;
    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__header">
        <span class="panel__badge">W</span>
        <h3 class="panel__title">自選列表</h3>
        <div class="wl-zoom">
          <button class="zoom-out" title="縮小">A-</button>
          <button class="zoom-in" title="放大">A+</button>
        </div>
      </div>
      <div class="panel__body wl-body">
        <div class="wl-addrow">
          <input class="input code-input" placeholder="輸入代碼" />
          <select class="group-select" aria-label="群組"></select>
          <button class="add-btn">+</button>
        </div>
        <div class="wl-tools">
          <button class="group-add" title="新增一個空群組">新增群組</button>
          <button class="group-rename" title="把上方選的群組改名">改名</button>
          <button class="group-delete" title="刪除上方選的群組">刪除群組</button>
        </div>
        <div class="wl-tools">
          <button class="export-btn">匯出</button>
          <input type="file" class="import-file" accept="application/json" hidden />
          <button class="import-btn">匯入</button>
          <span class="wl-msg"></span>
        </div>
        <div class="groups"></div>
      </div>
    `;
    container.appendChild(this.root);
    this.groupsEl = this.root.querySelector('.groups');
    this.groupSelect = this.root.querySelector('.group-select');
    this.fillGroupSelect();
    this.bindEvents();
    this.applyZoom();
    this.render(store.get('watchlist'));
  }

  applyZoom() {
    this.root.querySelector('.wl-body').style.zoom = String(this.zoom);
  }

  adjustZoom(delta) {
    this.zoom = Math.min(1.4, Math.max(0.8, +(this.zoom + delta).toFixed(2)));
    this.applyZoom();
  }

  // 重填選項時保留目前選的群組（還在的話）。
  fillGroupSelect(selected = this.groupSelect.value) {
    const groups = watchGroupNames(store.get('watchGroups'), store.get('watchlist'));
    this.groupSelect.innerHTML = groups.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    this.groupSelect.value = groups.includes(selected) ? selected : (groups[1] || groups[0]);
  }

  bindEvents() {
    this.root.querySelector('.zoom-out').addEventListener('click', () => this.adjustZoom(-0.1));
    this.root.querySelector('.zoom-in').addEventListener('click', () => this.adjustZoom(0.1));

    this.root.querySelector('.add-btn').addEventListener('click', () => {
      const input = this.root.querySelector('.code-input');
      const code = (input.value || '').trim().toUpperCase();
      const group = this.groupSelect.value || '自選1';
      if (!code) return;
      if (!isValidStockCode(code)) {
        this.showMessage(`代碼格式不符：${code}`);
        return;
      }
      const list = store.get('watchlist');
      if (list.some((x) => x.code === code && x.group === group)) {
        this.showMessage(`${code} 已在 ${group}`);
        return;
      }
      list.push({ code, name: stockName(code), group });
      store.set('watchlist', list);
      this.showMessage('');
      input.value = '';
    });

    this.root.querySelector('.group-add').addEventListener('click', () => this.addGroup());
    this.root.querySelector('.group-rename').addEventListener('click', () => this.renameGroup(this.groupSelect.value));
    this.root.querySelector('.group-delete').addEventListener('click', () => this.deleteGroup(this.groupSelect.value));

    this.root.querySelector('.export-btn').addEventListener('click', () => downloadJson('watchlist.json', store.get('watchlist')));

    const fileInput = this.root.querySelector('.import-file');
    this.root.querySelector('.import-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const data = await readJsonArrayFile(file);
        const rows = sanitizeWatchlist(data);
        store.set('watchlist', rows);
        const skipped = data.length - rows.length;
        this.showMessage(`已匯入 ${rows.length} 筆${skipped ? `，略過 ${skipped} 筆（代碼格式不符或重複）` : ''}`);
      } catch (error) {
        this.showMessage(`匯入失敗：檔案不是自選股 JSON 陣列（${error.message}）`);
      } finally {
        // 清空才能再次選同一個檔案。
        fileInput.value = '';
      }
    });

    // 清單每次更新都重建，事件一律掛在外層（委派）。
    this.groupsEl.addEventListener('click', (e) => {
      const row = e.target.closest('.wl-row');
      if (!row) return;
      if (e.target.closest('.remove')) this.removeItem(row.dataset.code, row.dataset.group);
      else store.set('selectedStock', row.dataset.code);
    });
    this.groupsEl.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.wl-row');
      if (row) e.dataTransfer.setData('text/plain', JSON.stringify({ code: row.dataset.code, group: row.dataset.group }));
    });
    this.groupsEl.addEventListener('dragover', (e) => {
      if (e.target.closest('[data-drop-group]')) e.preventDefault();
    });
    // 放在某一列上：移到那一列之前（可跨群組）；放在群組空白處或標題：移到該群組最後。
    this.groupsEl.addEventListener('drop', (e) => {
      const target = e.target.closest('[data-drop-group]');
      if (!target) return;
      e.preventDefault();
      let from;
      try {
        from = JSON.parse(e.dataTransfer.getData('text/plain'));
      } catch {
        return;
      }
      const beforeRow = e.target.closest('.wl-row');
      this.moveItem(from, target.dataset.dropGroup, beforeRow?.dataset.code);
    });
  }

  moveItem(from, toGroup, beforeCode) {
    const items = store.get('watchlist');
    const index = items.findIndex((x) => x.code === from?.code && x.group === from?.group);
    if (index < 0 || (from.group === toGroup && from.code === beforeCode)) return;
    const [moved] = items.splice(index, 1);
    // 目標群組已經有這檔：只把它從原群組拿掉。
    if (from.group !== toGroup && items.some((x) => x.code === moved.code && x.group === toGroup)) {
      store.set('watchlist', items);
      return;
    }
    const at = items.findIndex((x) => x.group === toGroup && x.code === beforeCode);
    const lastInGroup = items.findLastIndex((x) => x.group === toGroup);
    items.splice(at >= 0 ? at : (lastInGroup >= 0 ? lastInGroup + 1 : items.length), 0, { ...moved, group: toGroup });
    store.set('watchlist', items);
  }

  groupNames() {
    return watchGroupNames(store.get('watchGroups'), store.get('watchlist'));
  }

  // 群組名稱：去頭尾空白、最多 40 字、不能和現有群組重複。不合格回傳 null 並提示。
  askGroupName(message, current = '') {
    const name = (prompt(message, current) ?? '').trim().slice(0, 40);
    if (!name || name === current) return null;
    if (this.groupNames().includes(name)) {
      this.showMessage(`已經有「${name}」群組`);
      return null;
    }
    return name;
  }

  addGroup() {
    const name = this.askGroupName('新群組名稱');
    if (!name) return;
    store.set('watchGroups', [...this.groupNames(), name]);
    this.fillGroupSelect(name);
    this.showMessage(`已新增「${name}」`);
  }

  renameGroup(group) {
    if (group === PAGE1_GROUP) {
      this.showMessage(`「${PAGE1_GROUP}」是 Page1 走勢圖用的群組，不能改名`);
      return;
    }
    const name = this.askGroupName(`把「${group}」改名為`, group);
    if (!name) return;
    store.set('watchGroups', this.groupNames().map((g) => (g === group ? name : g)));
    store.set('watchlist', store.get('watchlist').map((row) => (row.group === group ? { ...row, group: name } : row)));
    this.fillGroupSelect(name);
    this.showMessage(`已改名為「${name}」`);
  }

  // 群組裡還有股票時，先問要移到哪個群組；留空就連股票一起刪。
  deleteGroup(group) {
    if (group === PAGE1_GROUP) {
      this.showMessage(`「${PAGE1_GROUP}」是 Page1 走勢圖用的群組，不能刪除`);
      return;
    }
    const list = store.get('watchlist');
    const stocks = list.filter((row) => row.group === group);
    const others = this.groupNames().filter((g) => g !== group);
    let target = '';
    if (stocks.length) {
      const answer = prompt(`「${group}」還有 ${stocks.length} 檔。要移到哪個群組？\n可選：${others.join('、')}\n留空＝連同股票一起刪除`, others.find((g) => g !== PAGE1_GROUP) || '');
      if (answer === null) return;
      target = answer.trim();
      if (target && !others.includes(target)) {
        this.showMessage(`沒有「${target}」群組，未刪除`);
        return;
      }
      if (!target && !confirm(`確定刪除「${group}」和裡面的 ${stocks.length} 檔股票？`)) return;
    } else if (!confirm(`確定刪除「${group}」？`)) {
      return;
    }
    // 移過去時目標群組已有的代碼不重複（sanitizeWatchlist 會去掉重複）。
    const next = target
      ? list.map((row) => (row.group === group ? { ...row, group: target } : row))
      : list.filter((row) => row.group !== group);
    store.set('watchGroups', others);
    store.set('watchlist', next);
    this.showMessage(target ? `已刪除「${group}」，${stocks.length} 檔移到「${target}」` : `已刪除「${group}」`);
  }

  // 報價更新：只改每列的現價／漲跌文字與顏色，不重建清單（不影響拖曳與點選）。
  updateQuotes() {
    const quotes = liveQuoteMap();
    this.groupsEl.querySelectorAll('.wl-quote').forEach((el) => {
      const quote = quotes.get(el.dataset.code);
      const text = quote ? `${fmtNum(quote.price)} ${fmtPct(quote.changePct)}` : '--';
      const className = `wl-quote ${quote ? trendClass(quote.changePct) : ''}`;
      if (el.textContent !== text) el.textContent = text;
      if (el.className !== className) el.className = className;
    });
  }

  removeItem(code, group) {
    const list = store.get('watchlist').filter((x) => !(x.code === code && x.group === group));
    store.set('watchlist', list);
  }

  showMessage(text) {
    this.root.querySelector('.wl-msg').textContent = text;
  }

  // 空群組也列出來（可以把股票拖進去）。
  render(list) {
    this.groupsEl.innerHTML = this.groupNames().map((name) => {
      const stocks = list.filter((row) => row.group === name);
      return `
      <details open data-drop-group="${esc(name)}">
        <summary>${esc(name)} (${stocks.length})</summary>
        <div class="wl-group" data-drop-group="${esc(name)}">${stocks.map((s) => `
          <div draggable="true" class="wl-row" data-code="${esc(s.code)}" data-group="${esc(name)}">
            <span class="wl-name">${esc(s.code)} ${esc(displayName(s))}</span>
            <span class="wl-quote" data-code="${esc(s.code)}">--</span>
            <button class="remove" title="移出群組">-</button>
          </div>`).join('') || '<div class="wl-empty">（空，可把股票拖進來）</div>'}</div>
      </details>
    `;
    }).join('');
  }

  update(list = store.get('watchlist')) {
    this.fillGroupSelect();
    this.render(list);
    this.updateQuotes();
  }

  destroy() { this.root.remove(); }
}
