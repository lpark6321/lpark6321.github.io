// 市場設定檔的唯一讀取點：休市日、加權權重、台灣50、中型100、摩台、量能權重都在 data/config/marketConfig.json。
// 設定檔由 tools/rebuild-config.mjs 依 data/config/source/ 的原始檔重算產生；主程式只讀、不改。說明見 data/config/README.md。
import config from './config/marketConfig.json' with { type: 'json' };

export const MARKET_CONFIG = config;
