// 指數迷你走勢元件：包裝 Sparkline 用於指數卡片。
import { Sparkline } from './Sparkline.js';

// IndexSparkline：類別用途註解，集中管理相關狀態與方法。
export class IndexSparkline {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    this.spark = new Sparkline(container, { width: options.width || 100, height: options.height || 40, color: options.color || 'rgb(240,58,95)' });
  }

  // update：方法用途註解，處理此元件或類別的一段行為。
  update(data, prevClose) { this.spark.update(data, prevClose); }
  // destroy：方法用途註解，處理此元件或類別的一段行為。
  destroy() { this.spark.destroy(); }
}
