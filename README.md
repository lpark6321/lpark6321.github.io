# Taiwan Stock Dashboard

台股／台指期看盤儀表板。純 HTML + CSS + 原生 ES Modules，沒有建置流程、沒有 npm 相依套件，直接以 GitHub Pages 發佈（`lpark6321.github.io`）。

即時行情目前以「公開資料」為主：個股與全球指數走 Yahoo，加權成交金額、台指期、台指選擇權走證交所／期交所的公開網站資料（MIS），都經本機代理取得；券商 DDE 與 FinMind 介面保留。抓不到資料時畫面顯示「--」，不會用假資料頂替；想看假行情請在「資料來源」選「模擬資料」。

## 頁面

| 檔案 | 說明 |
|------|------|
| `index_hide.html` | **主儀表板**。8 個分頁，用 hash 切換（`#page1` ~ `#page8`），右上角可切換全站資料來源。外殼程式在 `app.js` |
| `index.html` | Market Data Lab：測試 Yahoo / FinMind / 期交所逐筆等資料提供者的實驗頁（`main.js`） |

主儀表板分頁：

| 分頁 | 內容 |
|------|------|
| Page 1 Futures Overview | 台指期總覽（公開資料或 DDE 來源；商品可選台指(全)／台指／加權；台指(全)＝前一晚夜盤＋日盤，夜盤時段顯示夜盤）。1 區：月成本＝結算月 K（上次結算隔天起）的 (最高＋最低)÷2、合約高低、加權價差、近遠月價差、K 棒可切「比前日」（高過高低不過低紅、高不過高低過低綠、都沒過黃、都過灰）、多空關卡（樞紐點／振幅倍數／固定點數）、振幅統計近 20 日／週／月（最大、大大、平均、小小、最小、本期；本期小於最小時標亮）、三大法人持倉成本（標出資料日期）。C 區主圖（`services/marketChart.js`）可疊「大戶」成本線（外資／投信／自營商）與多空差額（每日淨未平倉變化），只在日 K。B 區：個股對加權的貢獻點數、預估量對 20 日均量 |
| Page 2 Market Temperature | 市場溫度：1 區市場概況（加權、櫃買、台指期、台指 VIX；台積電與權值前 20 貢獻點數、預估量／20 日均量、振幅／20 日均振幅；上市、上櫃的漲跌停分布、創 5～240 日高低家數、站上週月季線與多頭排列家數，`services/marketBreadth.js`，切到 Page 2 才開始抓）、權值股、電子／金融／傳產分類統計、儀表與圓餅圖。拿不到資料的區塊各自灰掉 |
| Page 3 Watchlist Alerts | 自選股（含即時報價，存在瀏覽器，可匯出／匯入 JSON；群組可新增、改名、刪除，股票可拖曳換群組）與型態提醒：自選股日 K + 即時價計算 6 種技術型態，可開桌面通知；當天的提醒存在瀏覽器，重新整理不會重複或消失，隔天清掉 |
| Page 4 Options Strategy | 選擇權策略組合（腳位清單、匯出匯入、自動存在瀏覽器）、到期損益圖（元）、Black-Scholes Greeks、選擇權鏈（公開資料來源：日盤、夜盤用期交所 MIS 的**成交價**，其他時段改讀期交所每日行情；有真資料且沒動過預設腳位時，預設腳位換成價平買權；可選到期序列（週三、週五、月選）；其他來源是示範資料）。點價格＝買進一口，Shift＋點＝賣出 |
| Page 5 Stock Screener | 上市股票條件選股：證交所盤後的本益比、殖利率、股價淨值比、成交量、漲跌幅；公開資料來源另有技術指標條件（KD、MACD 黃金交叉、量增／量縮、站上 SMA／EMA、布林突破、布林進入上半／下半），只對成交量超過 1000 張的股票抓日 K 計算，預設依成交量取前 100 檔（旁邊可改 50／100／200／500／全部）。判斷和 Page3 型態提醒共用 `services/technicalSignals.js`。結果可匯出 CSV |
| Page 6 Market Map | 台股市場地圖：方塊圖與旭日圖，顏色可選今日漲跌或量比，可搜尋代碼；沒有報價的方塊畫斜線；控制列標示各權重名單的資料日期 |
| Page 7 Global Indices | 亞股、美股、外匯、加密貨幣與世界時鐘（卡片大小固定，只更新數字） |
| Page 8 Chips Monitor | 籌碼監控（只看整體，切到這頁才抓，可切 20／60 日）：三大法人上市現貨買賣超（億元）、大盤成交金額（盤中累計對前一交易日同時間、預估量、每日成交金額與 20 日均量）、期貨未平倉（大台／小台／微台分開與換算成大台的合計，全市場與三大法人淨未平倉及增減）、臺指選擇權三大法人買權／賣權淨未平倉與 Put/Call Ratio。每塊標出盤後資料的日期（`services/chipMonitor.js`） |

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
- `/api/twse-mis-index`：證交所 MIS 的加權指數每分鐘收盤與成交金額、累積成交金額
- `/api/taifex-mis?kind=futures|options&session=day|night`：期交所 MIS 的台指期／台指選擇權即時報價（選擇權壓成精簡陣列，快取 10 秒）
- `/api/taifex-opt-daily`：期交所 OpenAPI 選擇權每日行情（只留 TXO 一般時段），快取 30 分鐘
- `/api/taifex-fut-history?months=2`：期交所「期貨每日交易行情下載」的台指期日 K（日盤、夜盤分開，一個月一請求；過去的月份快取 12 小時）
- `/api/taifex-inst?days=365&commodity=TXF|MXF|TMF`：期交所三大法人大台／小台／微台交易與未平倉（持倉成本、多空差額、Page 8）
- `/api/taifex-oi?months=3`：大台、小台、微台全市場未平倉口數；`/api/taifex-opt-inst?months=3`：三大法人臺指選擇權買賣權未平倉；`/api/taifex-pc-ratio?months=3`：Put/Call Ratio
- `/api/twse-inst-amount?days=20`：證交所三大法人上市買賣金額（一天一請求）；`/api/twse-intraday-amount?date=YYYY-MM-DD`：某日盤中每分鐘累計成交金額
- 期交所下載一月一請求、證交所請求之間至少隔 0.6 秒（頻率限制）；網址帶 `disk=1` 時過去的月份／日期存到 `bridges/.cache/`
- `/api/taifex-vix`：台指 VIX 即時；`/api/tw-indices`：加權與櫃買指數即時（證交所 MIS）
- `/api/tpex-daily`：櫃買中心上櫃普通股每日收盤；`/api/twse-market-amount?months=2`：證交所每日成交金額（最近 N 個月）
- `/api/yahoo-spark?symbols=...&range=1y`：Yahoo 只有收盤價的日線（市場寬度統計用），每批快取 6 小時

MIS 是證交所、期交所網站自己用的資料介面，不是正式 API，格式可能改變；抓不到時標頭會提示代理或來源有問題。

代理只接受來自 `http://127.0.0.1:8000`、`http://localhost:8000`、`https://lpark6321.github.io` 的瀏覽器請求，其他網站一律回 403。送往上游的每個請求 8 秒逾時。

可用環境變數 `YAHOO_PROXY_PORT`（預設 8787）與 `YAHOO_PROXY_CACHE_MS`（預設 4000）調整。快取時間比預設 5 秒的輪詢短，所以每次輪詢都會拿到新資料，快取只用來合併同時送出的相同請求。

## 標頭

標頭分兩列：上列是標題與分頁（`1 期貨總覽` … `8 籌碼監控`），下列是資料來源、更新頻率、手動更新、狀態與提示；視窗窄或放大時自動換行。字級依視窗寬度縮放（`style/variables.css` 的 `--fs-*`）。

- **台股與期貨狀態**：台股盤前／盤中／收盤／休市（附原因，例如「週六」或假日名稱）；期貨日盤／休息／夜盤／休市；各自到開盤或收盤的倒數。
- **連線提示**：Yahoo 代理（8787）、券商橋接或證交所連不上時直接寫出是哪一個；在 GitHub Pages 線上版連不上代理時，提示要在本機執行 `GIO.cmd`。盤中超過更新頻率 3 倍沒有新資料時提示「資料延遲」。設定檔的休市表沒有今年、或加權權重資料超過一個月時，提示要重算設定檔。
- **提醒中心（鈴鐺）**：當天的型態提醒、資料延遲、連線問題、籌碼提醒（外資台指期淨未平倉單日增減 5000 口以上；09:30 後預估成交金額達 20 日均量 1.5 倍，門檻在 `services/chipAlerts.js`；之後的大單提醒也會進來），有未讀數字；可全部已讀或清除，換日自動清空。
- **「⋯」選單**：Data Lab 連結與**設定備份／設定還原**：把自選股與群組、策略腳位、選股條件、型態開關、多空關卡、資料來源、更新頻率一次存成一個 JSON 檔；還原後重新載入頁面生效。所有瀏覽器設定集中在 `data/storage.js`（鍵名 `gio.<名稱>`）。FinMind token 不在備份內。
  另有**盤後資料存本機**：依群組勾選（期貨日 K／未平倉、三大法人期貨／選擇權、證交所法人買賣／成交金額），預設都不存；勾選後本機代理把過去月份／日期的盤後資料（不會再變）存在 `bridges/.cache/`（不進 git），重開代理不必重抓。
- **快捷鍵**：`1`～`8` 切換分頁、`R` 手動更新（在輸入框裡打字時不作用）。

## 資料來源切換

主儀表板右上角有兩個下拉選單，都套用到所有分頁，選擇會存在瀏覽器：

- **資料來源**：見下表。
- **更新頻率**：5／10／30／60 秒，預設 5 秒，Data Lab（`index.html`）也共用這個設定。台股報價只在週一到週五 09:00–13:35（台北時間）依頻率輪詢；非交易時段只在開頁、切換來源或按「手動更新」時抓一次。全球指數（Page 7）不受交易時段限制。
- **休市日、加權權重、台灣50／中型100 成分股、量能權重**：都在設定檔 `data/config/marketConfig.json`，主程式只讀它。要更新時把新的原始檔放進 `data/config/source/`，執行 `node tools/rebuild-config.mjs`（加 `--download` 會自動下載能下載的部分）。每個原始檔去哪裡找、檔名格式，寫在 [`data/config/README.md`](data/config/README.md)。

| 選項 | 來源 |
|------|------|
| 公開資料（預設） | 經 8787 代理：Yahoo 的加權報價、權值股、市場地圖、全球指數、個股 1 分 K 與日 K；證交所 MIS 的加權成交金額（億）與每分鐘走勢；期交所 MIS 的台指期近月（日盤／夜盤）與台指選擇權成交價；收盤後選擇權改讀期交所每日行情 |
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

- 抓資料的程式都在 `services/`：`yahooTwQuotes.js`、`yahooGlobalQuotes.js`（Yahoo 報價）、`misQuotes.js`（證交所／期交所 MIS）、`marketSources.js`（K 線與券商報價）、`priceSimulator.js`（模擬）。頁面不自己抓資料（Page5 的技術指標日 K 是按「執行篩選」才經 `screenerHistory.js` 抓）。
- 大單提醒（N1）的判斷邏輯在 `services/bigOrder.js`（外盤／內盤大單、台指期一分鐘大量：日盤 1500 口、夜盤 400 口），等有逐筆資料再接上畫面。
- 三大法人持倉成本是自己算的：期交所未平倉淨口數逐日累計，部位變化用當天淨交易的均價（同向加碼加權平均、減碼成本不變、翻轉用當天價格），每個結算月從結算日（第三個星期三）當天重新起算。11/10 回推比對玩股網（46,164）：兩個月內最接近的是從 10/21 結算日起算（46,189，差 25 點）；玩股網沒公開算法，數字仍可能有幾十點差異。
- 每個節拍要讀很多次的大資料（市場地圖、證交所盤後表）用 `store.peek()` 唯讀取用，不複製；其他地方用 `store.get()` 拿複本。
- 切換分頁時前一頁會卸載、取消訂閱，所以看不到的頁面不會重畫；資料仍照常更新，切回來時直接畫最新值。Page 1 的 6 區與 B 區也只畫目前選到的分頁。
- C 區圖表要的是使用者選的商品與週期，K 線由圖表自己經 `marketSources.js` 抓，但重抓時機跟著同一個節拍（`feedClock.js` 的 `subscribeFeedTick`），不另開計時器。Data Lab 也一樣只訂閱節拍，不會啟動主儀表板的 `marketFeed`。
- 「手動更新」立刻跑一輪，不等下一個節拍。
- 切換資料來源時，store 裡的行情會先清回空值（畫面顯示「--」），不讓上一個來源的數字冒充新來源。store 一開始也是空的，沒有示範數字。
- 預估量在資料寫進 store 的那一刻就算好（`dashboardDataSource.js` 的 `withVolumeEstimate`），頁面只讀 `volEstimate`。
- 各來源能做什麼（會不會定時抓、有沒有個股報價、橋接位址、是不是期貨 K 線）集中寫在 `dashboardDataSource.js` 的來源清單；台股交易時段集中在 `marketCalendar.js` 的 `TW_SESSIONS`；台指商品與每點價值在 `data/twDerivatives.js`。
- **盤後資料不受「資料來源」限制**：證交所盤後表（Page5、全上市股名）與型態提醒用的自選股日 K（Yahoo）屬於歷史資料，任何來源下都會抓，一天在收盤後（14:30、18:00）更新，失敗一分鐘後重試。型態判斷的「今天這一根」用目前來源的即時價，沒有就只用日 K（模擬資料的價格不拿來判斷）。
- 數字格式（「--」、千分位、百分比）、加權平均與「依代碼找報價」統一在 `services/quoteUtils.js`；報價表只在 store 的報價變了才重建。
- 各頁時鐘、倒數與標頭狀態共用 `feedClock.js` 的 `subscribeSecond`（全站一個每秒計時器）。

## 目錄結構

```
index_hide.html      主儀表板外殼（HTML）；程式在 app.js：分頁路由、資料來源選單、狀態列、快捷鍵、啟動 marketFeed
pages/pageN/         各分頁，每頁匯出 mount(container)，回傳清理函式（繪圖另放 pageNDraw.js，Page 1 的 K 線計算在 page1Series.js）
components/          可重用的 UI 元件（圖表、表格、面板…）
services/            瀏覽器端：取資料排程（feedClock.js、marketFeed.js）、各資料來源、Yahoo 共用請求（yahooApi.js）、CSV 解析、圖表、篩選／型態引擎
bridges/             本機服務（Node / PowerShell）：Yahoo 代理、券商 DDE 橋接，由 GIO.cmd 啟動
providers/           Data Lab 使用的資料提供者（Yahoo、FinMind、期交所、券商）
data/                全域 store（訂閱式狀態）、瀏覽器設定（storage.js）、台股清單；成分股權重與休市日讀 data/config/marketConfig.json
data/config/         市場設定檔與它的原始檔（source/），說明見 data/config/README.md
tools/               設定檔重算工具（rebuild-config.mjs）
tests/               測試：node tests/run.mjs（靜態檢查 + 單元測試，不需要瀏覽器）；node tests/browser.mjs（無頭 Chrome 在三種畫面大小檢查 7 頁的版面，截圖到 tests/.browser-shots/）
style/               共用樣式（variables / layout / components）
style.css, main.js   Data Lab（index.html）專用
```

### 新增一個分頁

1. 建立 `pages/page9/page9.js`，匯出 `mount(container)`，回傳清理函式（清掉計時器、訂閱與事件監聽）。
2. 在 `app.js` 的 `pageModules` 加入 `page9`，在 `index_hide.html` 的 `.tabbar` 加上按鈕，並引入對應的 CSS。

各頁透過 `data/store.js` 取得資料、訂閱更新，不直接呼叫資料來源；需要新資料就在 `services/marketFeed.js` 加一項，寫進 store 的新鍵。外部資料或使用者輸入要放進 `innerHTML` 前，先經過 `services/html.js` 的 `esc()`。

## 注意事項

- 橋接服務只監聽 `127.0.0.1`，不會對外開放。開啟 GitHub Pages 線上版時，只有在同一台電腦上也有執行橋接服務，才拿得到即時資料。

## 當前架構

```
瀏覽器：index_hide.html + app.js（外殼：分頁切換、標頭選單、台股／期貨狀態、提示、快捷鍵）
│
├─ dashboardDataSource.js   「資料來源」（含各來源能做什麼）、「更新頻率」、成交量預估
├─ marketCalendar.js        台股交易時段、休市日、台股狀態與倒數
├─ serviceHealth.js         各服務連不連得上（標頭提示）
│
├─ feedClock.js             全站唯一的計時器，每 N 秒打一次拍
│   ├─ marketFeed.js        每一拍只向選定的來源要資料，結果寫進 store；切換來源時先清空
│   │   ├─ yahooTwQuotes.js      Yahoo：加權、權值股、市場地圖
│   │   ├─ yahooGlobalQuotes.js  Yahoo：全球指數
│   │   ├─ misQuotes.js          證交所／期交所 MIS：加權成交金額、台指期、選擇權、櫃買、VIX
│   │   ├─ taifexHistory.js      期交所盤後：台指期歷史日 K、三大法人持倉成本
│   │   ├─ chipMonitor.js        Page8 籌碼：法人買賣金額、未平倉、選擇權法人、P/C Ratio；盤後資料存本機設定
│   │   ├─ chipAlerts.js         籌碼提醒門檻（外資未平倉增減、預估量爆量）
│   │   ├─ marketBreadth.js      上市／上櫃漲跌停、創高低、站上均線家數
│   │   ├─ marketSources.js      券商橋接：期貨、加權報價與 K 線
│   │   ├─ priceSimulator.js     模擬資料
│   │   ├─ twseData.js           證交所盤後資料（不受來源限制）
│   │   └─ patternEngine.js      自選股日 K → 技術型態提醒（不受來源限制）
│   └─ marketChart.js       C 區圖表：自己抓你選的商品 K 線，但也跟著同一個拍子
│
├─ data/store.js            所有行情資料放這裡（一開始是空的）；資料一更新就通知訂閱的頁面
├─ data/storage.js          瀏覽器設定的唯一讀寫點、設定備份／還原
├─ data/marketConfig.js     讀 data/config/marketConfig.json（休市日、權重、量能權重）
│
└─ pages/pageN/             只有目前這一頁是掛載的：訂閱 store → 重畫
                            切走就卸載、取消訂閱，看不到的頁面不會重畫

本機服務 bridges/（瀏覽器無法直接連 Yahoo 和券商，要經過它們轉送）
├─ yahooProxyServer.js  :8787   Yahoo、FinMind、證交所 OpenAPI、證交所／期交所 MIS 代理
└─ xqDdeBridge.ps1      :8788 / :8790   凱基、台新 DDE
```
