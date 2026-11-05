# 市場設定檔

主程式只讀 `marketConfig.json`，不會自己去抓或重算這些資料。資料過期時，照下面的說明把新的原始檔放進 `source/`，再執行重算：

```bash
node tools/rebuild-config.mjs              # 只用 source/ 現有的原始檔重算（會詢問量能權重用哪一段）
node tools/rebuild-config.mjs --download   # 先自動下載能下載的原始檔，再重算
```

重算完會印出摘要（休市日年度、權重資料日期、成分股數、量能權重天數），十大權值股有變動時會特別提醒。確認沒問題後把 `marketConfig.json` 和新的原始檔一起 commit。

## 設定檔內容與原始檔

| 設定檔欄位 | 用在哪裡 | 原始檔（放在 `source/`） | 多久要更新 |
|------------|----------|--------------------------|------------|
| `holidays` | 交易時段判斷（休市日不輪詢報價）、倒數 | `holidays/<西元年>.json` | 每年 12 月證交所公布隔年休市表後 |
| `taiex` | 十大權值股、Page2 分類、Page6 市場地圖（加權） | `taiex-weights/futuresQADetail_<資料日期>.html`＋`industry/t187ap03_L.json` | 每月底期交所更新後 |
| `tw50` | Page6 市場地圖（台灣50） | `tw50/0050_<資料日期>.csv` | 每季成分股調整後 |
| `mid100` | Page6 市場地圖（中型100） | `mid100/0051_<資料日期>.csv` | 每季成分股調整後 |
| `msci` | 預留（摩台），目前沒有檔案 | `msci/<任意名稱>_<資料日期>.csv` | — |
| `volumeWeights` | 預估全日成交量 | `volume-5sec/<YYYYMMDD>.json`（沒有就用 `legacy-weights.csv`） | 想更新權重時 |

同一個資料夾放多個檔案時，取檔名排序最後的一個（所以檔名裡的日期要用 `YYYY-MM-DD`）。資料日期取自檔名，權重頁的資料日期取自網頁內容。

開啟儀表板時，如果 `holidays` 沒有今年，右上角會提示「休市表需要重算」。

## 每個原始檔去哪裡找

### 休市日 `holidays/<西元年>.json`（`--download` 會自動抓今年和明年）

- 網頁：證交所 → 交易資訊 → 市場開休市日期 <https://www.twse.com.tw/zh/trading/holiday.html>
- 檔案：直接存這個網址的回應，檔名例如 `2027.json`：
  `https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?date=20270101&response=json`
- 只取平日的休市日；「開始交易」「最後交易」這類有交易的日子會自動排除。

### 加權指數權重 `taiex-weights/futuresQADetail_<資料日期>.html`（`--download` 會自動抓）

- 網頁：期交所 → 臺股期貨 → 加權股價指數成分股暨市值比重 <https://www.taifex.com.tw/cht/9/futuresQADetail>
- 檔案：瀏覽器打開後「另存網頁（僅 HTML）」，檔名例如 `futuresQADetail_2026-11-28.html`。網頁上方的「資料日期」就是設定檔的資料日期。
- 設定檔只保留權重 ≥ 0.1% 的個股（約前 100 名），產業權重則用全部成分股加總。

### 產業別 `industry/t187ap03_L.json`（`--download` 會自動抓）

- 來源：證交所 OpenAPI「上市公司基本資料」<https://openapi.twse.com.tw/v1/opendata/t187ap03_L>
- 檔名固定 `t187ap03_L.json`，直接覆蓋。用來把權重頁的個股分到半導體業、金融保險等產業。有新上市的權值股才需要更新。

### 台灣50 `tw50/0050_<資料日期>.csv`、中型100 `mid100/0051_<資料日期>.csv`（要手動整理）

- 網頁：玩股網 0050／0051 成分股 <https://www.wantgoo.com/stock/etf/0050/constituent>、<https://www.wantgoo.com/stock/etf/0051/constituent>，或元大投信 ETF 持股權重。
- 檔案：UTF-8 CSV，第一列是標題，欄位：

  ```csv
  code,name,weightPct,majorGroup
  2330,台積電,63.17,電子
  ```

  `weightPct` 是權重百分比（63.17 代表 63.17%），`majorGroup` 是市場地圖的大類：台灣50 用 `電子／金融／傳產`，中型100 用 `電子／金融／航運／傳產／其他`。依權重由大到小排，排名照列的順序。

### 摩台 `msci/`（預留）

格式同上面的 CSV。目前沒有檔案，設定檔裡是空清單。

### 量能權重 `volume-5sec/`（`--download` 會補最近的交易日）

- 來源：證交所 → 盤後資訊 → 每 5 秒委託成交統計 <https://www.twse.com.tw/zh/trading/historical/mi-5mins.html>
- 檔案：一天一個，存這個網址的回應，檔名是日期，例如 `20261104.json`：
  `https://www.twse.com.tw/rwd/zh/afterTrading/MI_5MINS?date=20261104&response=json`
- `--download --days=60` 會往回補最近 60 個交易日缺的檔（預設 20 天）。證交所會擋太密集的請求，每檔間隔 3 秒，60 天約 3 分鐘。
- 重算時會偵測有幾天的資料，詢問要用哪一段：月（20 天）、季（60 天）、年（250 天）、所有，或沿用 `legacy-weights.csv`。也可以直接指定 `--period=month|quarter|year|all|legacy`。
- 權重算法：每個時點的倍數 = 當天收盤累積成交金額 ÷ 該時點的累積成交金額，取所選天數的平均（標準差一起存）。預估全日量 = 目前累積量 × 倍數。
- `legacy-weights.csv` 是舊版的權重表（欄位：時間、加權、標準差），沒有每日檔時用它。

## 相關程式

- `tools/rebuild-config.mjs`：重算與下載
- `tools/configParsers.mjs`：各原始檔的解析（測試在 `tests/`）
- `data/marketConfig.js`：主程式讀設定檔的唯一入口
