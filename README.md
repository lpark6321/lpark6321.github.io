# Taiwan Stock Dashboard

台股／台指期看盤儀表板。純 HTML + CSS + 原生 ES Modules，沒有建置流程、沒有 npm 相依套件，直接以 GitHub Pages 發佈（`lpark6321.github.io`）。

即時行情目前以 Yahoo 為主，經本機的 Yahoo 代理取得；券商 DDE 與 FinMind 介面保留。抓不到資料時畫面顯示「--」，不會用假資料頂替；想看假行情請在「資料來源」選「模擬資料」。

## 頁面

| 檔案 | 說明 |
|------|------|
| `index_hide.html` | **主儀表板**。7 個分頁，用 hash 切換（`#page1` ~ `#page7`），右上角可切換全站資料來源 |
| `index.html` | Market Data Lab：測試 Yahoo / FinMind / 期交所逐筆等資料提供者的實驗頁（`main.js`） |

主儀表板分頁：

| 分頁 | 內容 |
|------|------|
| Page 1 Futures Overview | 台指期總覽（需要期貨來源，Yahoo 模式整塊灰掉）、多空關卡（樞紐點／振幅倍數／固定點數可切換）、30 日振幅與 20 日均線月成本（日 K）、K 線主圖（`services/marketChart.js`）、TradingView 小工具 |
| Page 2 Market Temperature | 市場溫度：權值股、電子／金融／傳產分類統計、儀表與圓餅圖。拿不到資料的區塊各自灰掉 |
| Page 3 Watchlist Alerts | 自選股（含即時報價，存在瀏覽器，可匯出／匯入 JSON）與型態提醒：自選股日 K + 即時價計算 6 種技術型態，可開桌面通知 |
| Page 4 Options Strategy | 選擇權策略組合（腳位清單、匯出匯入、自動存在瀏覽器）、到期損益圖（元）、Black-Scholes Greeks、選擇權鏈（**示範資料**，等期交所盤後資料接上） |
| Page 5 Stock Screener | 上市股票條件選股：證交所盤後的本益比、殖利率、股價淨值比、成交量、漲跌幅（`services/filterEngine.js`） |
| Page 6 Market Map | 台股市場地圖：方塊圖與旭日圖，顏色可選今日漲跌或量比，可搜尋代碼；沒有報價的方塊畫斜線 |
| Page 7 Global Indices | 亞股、美股、外匯、加密貨幣與世界時鐘（卡片大小固定，只更新數字） |

## 本機執行

**一鍵啟動（Windows）：** 雙擊 `GIO.cmd`。它會先開 Yahoo 代理（8787），再在 8000 埠啟動網頁伺服器（優先用 Python，沒有就改用 `npx http-server`），然後用瀏覽器開啟 `http://127.0.0.1:8000/index_hide.html`。每個服務各開一個視窗，使用期間請保持開啟。

也可以只啟動指定的部分，參數可任意組合：

| 指令 | 啟動內容 |
|------|----------|
| `GIO.cmd`（雙擊） | `yahoo web` |
| `GIO.cmd yahoo` | 只開 Yahoo / FinMind 代理 |
| `GIO.cmd web` | 只開網頁伺服器並開啟瀏覽器 |
| `GIO.cmd kgi` | 凱基 XQ DDE 橋接（保留） |
| `GIO.cmd taishin` | 台新 DDE 橋接（保留） |
| `GIO.cmd yahoo web kgi` | 例：Yahoo、網頁加上凱基 DDE |

手動啟動：ES Modules 不能用 `file://` 開啟，必須透過 HTTP 伺服器，而且要用 8000 埠，因為本機代理只接受 8000 埠的網頁來源：

```bash
python -m http.server 8000
# 或
npx serve . -l 8000
```

然後開啟 `http://localhost:8000/index_hide.html`。

### 行情橋接（限 Windows）

瀏覽器無法直接呼叫 Yahoo（CORS）或券商 DDE，所以這些資料要經過本機服務轉送。目前以 Yahoo 為主要資料來源；DDE 與 FinMind 介面保留可用，但不再擴充。

| 服務 | 埠號 | 啟動方式 | 需求 |
|------|------|----------|------|
| Yahoo / FinMind 代理 | 8787 | `GIO.cmd yahoo`（預設會開） | Node.js 18+（需要內建 `fetch`） |
| 凱基 XQ DDE（保留） | 8788 | `GIO.cmd kgi` | XQ 全球贏家保持開啟 |
| 凱基 RTD（保留） | 8789 | 尚未實作，`GIO.cmd` 不會啟動 | — |
| 台新 DDE（保留） | 8790 | `GIO.cmd taishin` | 台新看盤軟體保持開啟 |

FinMind token：啟動時不再詢問。代理使用前端請求帶來的 token，沒有的話才用事先設定好的環境變數 `FINMIND_TOKEN`。token 從瀏覽器到代理、再從代理到 FinMind 都只放在 `Authorization` 標頭，不會出現在任何網址裡。不要把 token 寫進任何會 commit 的檔案。

DDE 橋接（`bridges/xqDdeBridge.ps1`）會優先使用 32 位元 PowerShell，因為看盤軟體的 DDE 是 32 位元。看盤軟體重開後會自動重新連線。提供兩個端點：

- `GET /api/xq-quote?symbol=TX`：即時報價。`symbol` 只接受 `TX`、`FITX*1`（日盤）、`FITXN*1`（全盤）、`INDEX:TWII`（加權指數），其他代號回傳錯誤。
- `GET /api/broker-candles?symbol=TX&timeframe=1m`：由報價累積成的 K 棒（`1s`、`1m`、`5m`、`D`），每個序列只保留最近 1200 根。

Yahoo 代理（`bridges/yahooProxyServer.js`）提供：

- `/api/yahoo-quote?symbols=^TWII`：一次最多 200 個代號，走 Yahoo v7 quote，一個請求取回全部代號（代理會自動取得 cookie 與 crumb，失效時重新取得）。v7 失敗時改用 chart 備援（每個代號一個請求），之後 60 秒內不再嘗試 v7。
- `/api/yahoo-chart?symbol=^TWII&interval=1d&range=6mo`
- `/api/finmind-futures-snapshot?data_id=TXF`
- `/api/finmind-futures-daily?data_id=TX`
- `/api/twse-valuation`、`/api/twse-daily`：證交所 OpenAPI 的本益比／殖利率／股價淨值比與當日行情（Page5 選股），快取 10 分鐘

代理只接受來自 `http://127.0.0.1:8000`、`http://localhost:8000`、`https://lpark6321.github.io` 的瀏覽器請求，其他網站一律回 403。送往上游的每個請求 8 秒逾時。

可用環境變數 `YAHOO_PROXY_PORT`（預設 8787）與 `YAHOO_PROXY_CACHE_MS`（預設 4000）調整。快取時間比預設 5 秒的輪詢短，所以每次輪詢都會拿到新資料，快取只用來合併同時送出的相同請求。

## 資料來源切換

主儀表板右上角有兩個下拉選單，都套用到所有分頁，選擇會存在 `localStorage`：

- **資料來源**（`dashboard.dataSource`）：見下表。
- **更新頻率**（`dashboard.pollSeconds`）：5／10／30／60 秒，預設 5 秒，Data Lab（`index.html`）也共用這個設定。台股報價只在週一到週五 09:00–13:35（台北時間）依頻率輪詢；非交易時段只在開頁、切換來源或按「手動更新」時抓一次。全球指數（Page 7）不受交易時段限制。
- **休市日**：交易時段判斷會排除證交所公布的休市日（`data/twMarketHolidays.js`，目前只有 2026 年）。證交所每年底公布隔年休市表，公布後要把新年度的日期補進去，否則那一年的假日會被當成交易日。

| 選項 | 來源 |
|------|------|
| YAHOO（預設） | 經 8787 代理：加權、權值股、市場地圖、全球指數、加權與權值股 1 分 K |
| 模擬資料 | `services/priceSimulator.js` 產生的假加權與十大權值股，每個節拍跳一次，不發任何即時行情請求 |
| FinMind（預留） | 只有 C 區圖表會用（FinMind 期貨 K 線），需要 token |
| 期交所CSV（預留） | 只有 C 區圖表會用（載入本機逐筆檔） |
| 凱基DDE／凱基RTD／台新DDE（預留） | 對應的本機橋接埠：台指(全)、台指日盤、加權現貨報價與加權 1 分 K |
| 券商API（預留） | 尚未接上。接上時寫一個提供 `/xq-quote`、`/broker-candles` 兩個端點的本機服務（和 DDE 橋接相同），再到 `services/dashboardDataSource.js` 的來源清單填上 `bridge` 位址 |

### 資料流

```
services/feedClock.js（全站唯一的計時器，依「更新頻率」打節拍）
  └ services/marketFeed.js 每個節拍只向「資料來源」選定的來源要資料，不改用其他來源補
  └ 寫進 data/store.js
        └ 目前開著的那一頁訂閱 store，只重畫用到的區塊
```

- 抓資料的程式都在 `services/`：`yahooTwQuotes.js`、`yahooGlobalQuotes.js`（Yahoo 報價）、`marketSources.js`（K 線與券商報價）、`priceSimulator.js`（模擬）。頁面不自己抓資料。
- 切換分頁時前一頁會卸載、取消訂閱，所以看不到的頁面不會重畫；資料仍照常更新，切回來時直接畫最新值。Page 1 的 6 區與 B 區也只畫目前選到的分頁。
- C 區圖表要的是使用者選的商品與週期，K 線由圖表自己經 `marketSources.js` 抓，但重抓時機跟著同一個節拍（`feedClock.js` 的 `subscribeFeedTick`），不另開計時器。Data Lab 也一樣只訂閱節拍，不會啟動主儀表板的 `marketFeed`。
- 「手動更新」立刻跑一輪，不等下一個節拍。
- 切換資料來源時，store 裡的行情會先清回空值（畫面顯示「--」），不讓上一個來源的數字冒充新來源。store 一開始也是空的，沒有示範數字。
- 預估量在資料寫進 store 的那一刻就算好（`dashboardDataSource.js` 的 `withVolumeEstimate`），頁面只讀 `volEstimate`。
- 各來源能做什麼（會不會定時抓、有沒有個股報價、橋接位址、是不是期貨 K 線）集中寫在 `dashboardDataSource.js` 的來源清單；台股交易時段集中在 `marketCalendar.js` 的 `TW_SESSIONS`；台指商品與每點價值在 `data/twDerivatives.js`。
- **盤後資料不受「資料來源」限制**：證交所盤後表（Page5、全上市股名）與型態提醒用的自選股日 K（Yahoo）屬於歷史資料，任何來源下都會抓，一天在收盤後（14:30、18:00）更新，失敗一分鐘後重試。型態判斷的「今天這一根」用目前來源的即時價，沒有就只用日 K（模擬資料的價格不拿來判斷）。
- 數字格式（「--」、千分位、百分比）與「依代碼找報價」統一在 `services/quoteUtils.js`。

## 目錄結構

```
index_hide.html      主儀表板外殼：分頁路由、資料來源選單、啟動 marketFeed
pages/pageN/         各分頁，每頁匯出 mount(container)，回傳清理函式（繪圖另放 pageNDraw.js，Page 1 的 K 線計算在 page1Series.js）
components/          可重用的 UI 元件（圖表、表格、面板…）
services/            瀏覽器端：取資料排程（feedClock.js、marketFeed.js）、各資料來源、Yahoo 共用請求（yahooApi.js）、CSV 解析、圖表、篩選／型態引擎
bridges/             本機服務（Node / PowerShell）：Yahoo 代理、券商 DDE 橋接，由 GIO.cmd 啟動
providers/           Data Lab 使用的資料提供者（Yahoo、FinMind、期交所、券商）
data/                全域 store（訂閱式狀態）與台股清單、成分股權重
style/               共用樣式（variables / layout / components）
style.css, main.js   Data Lab（index.html）專用
```

### 新增一個分頁

1. 建立 `pages/page8/page8.js`，匯出 `mount(container)`，回傳清理函式（清掉計時器、訂閱與事件監聽）。
2. 在 `index_hide.html` 的 `pageModules` 加入 `page8`，在 `.tabbar` 加上按鈕，並引入對應的 CSS。

各頁透過 `data/store.js` 取得資料、訂閱更新，不直接呼叫資料來源；需要新資料就在 `services/marketFeed.js` 加一項，寫進 store 的新鍵。外部資料或使用者輸入要放進 `innerHTML` 前，先經過 `services/html.js` 的 `esc()`。

## 注意事項

- 橋接服務只監聽 `127.0.0.1`，不會對外開放。開啟 GitHub Pages 線上版時，只有在同一台電腦上也有執行橋接服務，才拿得到即時資料。

## 當前架構

```
瀏覽器：index_hide.html（外殼：分頁切換、右上角兩個下拉選單）
│
├─ dashboardDataSource.js   「資料來源」（含各來源能做什麼）、「更新頻率」、成交量預估
├─ marketCalendar.js        台股交易時段、休市日
│
├─ feedClock.js             全站唯一的計時器，每 N 秒打一次拍
│   ├─ marketFeed.js        每一拍只向選定的來源要資料，結果寫進 store；切換來源時先清空
│   │   ├─ yahooTwQuotes.js      Yahoo：加權、權值股、市場地圖
│   │   ├─ yahooGlobalQuotes.js  Yahoo：全球指數
│   │   ├─ marketSources.js      券商橋接：期貨、加權報價與 K 線
│   │   ├─ priceSimulator.js     模擬資料
│   │   ├─ twseData.js           證交所盤後資料（不受來源限制）
│   │   └─ patternEngine.js      自選股日 K → 技術型態提醒（不受來源限制）
│   └─ marketChart.js       C 區圖表：自己抓你選的商品 K 線，但也跟著同一個拍子
│
├─ data/store.js            所有行情資料放這裡（一開始是空的）；資料一更新就通知訂閱的頁面
│
└─ pages/pageN/             只有目前這一頁是掛載的：訂閱 store → 重畫
                            切走就卸載、取消訂閱，看不到的頁面不會重畫

本機服務 bridges/（瀏覽器無法直接連 Yahoo 和券商，要經過它們轉送）
├─ yahooProxyServer.js  :8787   Yahoo、FinMind、證交所 OpenAPI 代理
└─ xqDdeBridge.ps1      :8788 / :8790   凱基、台新 DDE
```
