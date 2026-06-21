/**
 * Lightweight, high-DPI canvas-based telemetry plotter
 * Draws custom charts with neon glow lines, grids, and text values.
 */
export class TelemetryChart {
  /**
   * @param {HTMLCanvasElement} canvas The canvas DOM element
   * @param {Object} options Visual configuration options
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = {
      lineColor1: options.lineColor1 || '#06b6d4',
      lineColor2: options.lineColor2 || '#f59e0b',
      fillColor1: options.fillColor1 || 'rgba(6, 182, 212, 0.05)',
      fillColor2: options.fillColor2 || 'rgba(245, 158, 11, 0.03)',
      gridColor: options.gridColor || 'rgba(55, 65, 81, 0.25)',
      labelColor: options.labelColor || '#9ca3af',
      glow: options.glow !== undefined ? options.glow : true,
      maxVal: options.maxVal || 1.0,
      minVal: options.minVal || 0.0,
      title: options.title || '',
      ...options
    };

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * Adjust canvas resolution for retina displays
   */
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.scale(dpr, dpr);
  }

  /**
   * Render single time series data
   * @param {Array<number>} history Time series dataset
   * @param {number} customMax Optional dynamic axis ceiling scale override
   */
  draw(history, customMax = null) {
    this.drawDual(history, null, customMax);
  }

  /**
   * Render dual overlapping time series curves (e.g. Raw vs Fused)
   * @param {Array<number>} history1 First dataset (underlay/raw)
   * @param {Array<number>|null} history2 Second dataset (overlay/fused)
   * @param {number|null} customMax Custom max scale override
   */
  drawDual(history1, history2 = null, customMax = null) {
    const ctx = this.ctx;
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    // Clear background
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Grid Lines
    ctx.strokeStyle = this.options.gridColor;
    ctx.lineWidth = 1;
    ctx.font = '9px "JetBrains Mono"';
    ctx.fillStyle = this.options.labelColor;

    const gridLines = 4;
    const maxVal = customMax !== null ? customMax : this.options.maxVal;
    const minVal = this.options.minVal;
    const valueRange = maxVal - minVal;

    for (let i = 0; i <= gridLines; i++) {
      const y = 15 + (i * (height - 25)) / gridLines;
      
      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(25, y);
      ctx.lineTo(width - 10, y);
      ctx.stroke();

      // Horizontal value label
      const val = maxVal - (i * valueRange) / gridLines;
      ctx.fillText(val.toFixed(2), 2, y + 3);
    }

    // Vertical reference grid (time steps)
    const timeLines = 6;
    for (let i = 1; i < timeLines; i++) {
      const x = 25 + (i * (width - 35)) / timeLines;
      ctx.beginPath();
      ctx.moveTo(x, 15);
      ctx.lineTo(x, height - 10);
      ctx.stroke();
    }

    // Helper to calculate X/Y coordinates
    const getCoords = (history) => {
      const pts = [];
      if (!history || history.length === 0) return pts;
      const count = history.length;
      
      for (let i = 0; i < count; i++) {
        // Map elements horizontally across the canvas width from index 0 (oldest) to last (newest)
        const x = 25 + (i * (width - 35)) / (count - 1);
        
        // Normalize value
        const val = history[i];
        const normalized = (val - minVal) / (valueRange || 1.0);
        const y = height - 10 - normalized * (height - 25);
        pts.push({ x, y });
      }
      return pts;
    };

    // 2. Draw first line (Raw or Primary)
    const points1 = getCoords(history1);
    if (points1.length > 1) {
      this.drawLinePath(points1, this.options.lineColor2, this.options.fillColor2, false);
    }

    // 3. Draw second line (Fused or AI Output)
    if (history2) {
      const points2 = getCoords(history2);
      if (points2.length > 1) {
        this.drawLinePath(points2, this.options.lineColor1, this.options.fillColor1, this.options.glow);
      }
    }
  }

  /**
   * Internal helper to trace line paths and fill area under the curve
   */
  drawLinePath(points, strokeColor, fillColor, glowEffect) {
    const ctx = this.ctx;
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    ctx.save();
    
    // Draw Stroke
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.8;
    
    if (glowEffect) {
      ctx.shadowColor = strokeColor;
      ctx.shadowBlur = 8;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      // Smooth interpolation using simple line segment mapping
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0; // disable shadow for fill

    // Draw Fill
    ctx.lineTo(points[points.length - 1].x, height - 10);
    ctx.lineTo(points[0].x, height - 10);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.restore();
  }
}
