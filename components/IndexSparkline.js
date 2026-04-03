import { Sparkline } from './Sparkline.js';

export class IndexSparkline {
  constructor(container, options = {}) {
    this.spark = new Sparkline(container, { width: options.width || 100, height: options.height || 40, color: options.color || 'rgb(240,58,95)' });
  }

  update(data, prevClose) { this.spark.update(data, prevClose); }
  destroy() { this.spark.destroy(); }
}
