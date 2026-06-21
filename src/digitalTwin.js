/**
 * Interactive 2D Digital Twin Bridge Renderer
 * Renders the structural components, load deflections, dynamic traffic,
 * and clickable sensor node overlays onto a high-DPI HTML5 Canvas.
 */
export class DigitalTwinRenderer {
  constructor(canvas, overlayElement, onNodeSelect) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.overlay = overlayElement;
    this.onNodeSelect = onNodeSelect;

    this.selectedNodeId = null;
    this.hoveredNodeId = null;
    this.mouse = { x: 0, y: 0 };
    
    // Bridge geometry constants
    this.paddingX = 50;
    this.pylonHeight = 130;
    
    // List of interactive sensor nodes
    // Coordinates are normalized percentages (0.0 to 1.0) of bridge span dimensions
    this.nodes = [
      { id: 'S-01', type: 'strain', xPct: 0.25, yPct: 0.65, label: 'S-01 (Strain L)', valUnit: 'µε' },
      { id: 'S-02', type: 'strain', xPct: 0.50, yPct: 0.65, label: 'S-02 (Strain C)', valUnit: 'µε' },
      { id: 'S-03', type: 'strain', xPct: 0.75, yPct: 0.65, label: 'S-03 (Strain R)', valUnit: 'µε' },
      { id: 'A-01', type: 'accel', xPct: 0.35, yPct: 0.25, label: 'A-01 (Accel Tower L)', valUnit: 'm/s²' },
      { id: 'A-02', type: 'accel', xPct: 0.50, yPct: 0.61, label: 'A-02 (Accel Center)', valUnit: 'm/s²' },
      { id: 'I-01', type: 'incline', xPct: 0.35, yPct: 0.45, label: 'I-01 (Tilt Tower L)', valUnit: '°' },
      { id: 'I-02', type: 'incline', xPct: 0.65, yPct: 0.45, label: 'I-02 (Tilt Tower R)', valUnit: '°' },
    ];

    // State placeholders
    this.sensors = null;
    this.healthData = null;
    this.vehicles = [];
    this.windSpeed = 0;
    this.preset = 'normal';
    this.time = 0;

    this.initEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  initEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
      this.checkHover();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredNodeId = null;
      if (!this.selectedNodeId) {
        this.overlay.classList.remove('visible');
      }
    });

    this.canvas.addEventListener('click', () => {
      if (this.hoveredNodeId) {
        this.selectedNodeId = this.hoveredNodeId;
        this.onNodeSelect(this.selectedNodeId);
      } else {
        this.selectedNodeId = null;
        this.overlay.classList.remove('visible');
      }
    });
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.scale(dpr, dpr);
  }

  checkHover() {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    
    let found = null;
    for (const node of this.nodes) {
      const coords = this.getNodePixelCoords(node, width, height);
      const dist = Math.hypot(this.mouse.x - coords.x, this.mouse.y - coords.y);
      if (dist < 12) {
        found = node.id;
        break;
      }
    }
    
    this.hoveredNodeId = found;
    if (this.hoveredNodeId) {
      this.canvas.style.cursor = 'pointer';
      this.updateTooltip(this.hoveredNodeId);
    } else {
      this.canvas.style.cursor = 'default';
      if (this.selectedNodeId) {
        this.updateTooltip(this.selectedNodeId);
      }
    }
  }

  updateTooltip(nodeId) {
    if (!this.sensors) return;
    const node = this.nodes.find(n => n.id === nodeId);
    const telemetry = this.sensors[nodeId];
    if (!node || !telemetry) return;

    document.getElementById('overlay-node-id').textContent = node.label;
    
    let typeName = 'Strain Gauge';
    if (node.type === 'accel') typeName = 'Accelerometer';
    if (node.type === 'incline') typeName = 'Inclinometer (Tilt)';
    document.getElementById('overlay-node-type').textContent = typeName;
    
    document.getElementById('overlay-node-raw').textContent = `${telemetry.raw.toFixed(2)} ${node.valUnit}`;
    document.getElementById('overlay-node-fused').textContent = `${telemetry.fused.toFixed(2)} ${node.valUnit}`;
    
    const statusEl = document.getElementById('overlay-node-status');
    statusEl.textContent = telemetry.status;
    statusEl.className = 'overlay-val';
    if (telemetry.status.includes('FAULT')) {
      statusEl.classList.add('status-critical');
    } else if (telemetry.status.includes('WARNING')) {
      statusEl.classList.add('status-warn');
    } else {
      statusEl.classList.add('status-good');
    }

    this.overlay.classList.add('visible');
  }

  /**
   * Helper to map percentage coords to canvas pixels
   */
  getNodePixelCoords(node, width, height) {
    const bridgeW = width - 2 * this.paddingX;
    const bridgeH = height * 0.7;
    const startX = this.paddingX;
    const startY = height * 0.15;

    // Apply deflection offset to nodes located on the deck
    let deflectionY = 0;
    if (node.yPct > 0.55 && this.healthData) {
      // Approximate localized deflection mapping based on x coordinate
      const deckSpanPct = (node.xPct - 0.1) / 0.8; // span begins at 10% and ends at 90%
      if (deckSpanPct >= 0 && deckSpanPct <= 1.0) {
        // Approximate deflection envelope using a sine wave
        const multiplier = Math.sin(deckSpanPct * Math.PI);
        // Deform node Y pixel coordinate matching simulated actual bending
        deflectionY = this.healthData.actualDeflection * multiplier * 2.2; 
      }
    }

    // Apply seismic vibration wobble
    let vibrateX = 0;
    let vibrateY = 0;
    if (this.preset === 'seismic' && this.sensors) {
      const vAmp = this.sensors['A-02'].fused * 0.5;
      vibrateX = Math.sin(this.time * 45) * vAmp;
      vibrateY = Math.cos(this.time * 50) * vAmp;
    }

    return {
      x: startX + node.xPct * bridgeW + vibrateX,
      y: startY + node.yPct * bridgeH + deflectionY + vibrateY
    };
  }

  /**
   * Set inputs for next frame render
   */
  updateData(time, sensors, healthData, vehicles, windSpeed, preset) {
    this.time = time;
    this.sensors = sensors;
    this.healthData = healthData;
    this.vehicles = vehicles;
    this.windSpeed = windSpeed;
    this.preset = preset;

    // Keep tooltip text values active
    if (this.selectedNodeId) {
      this.updateTooltip(this.selectedNodeId);
    }
  }

  /**
   * Primary Render Loop
   */
  draw() {
    const ctx = this.ctx;
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    // Clear and draw grid background
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, width, height);

    // Draw tech background grid lines
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.04)';
    ctx.lineWidth = 1;
    const gridSpacing = 30;
    for (let x = 0; x < width; x += gridSpacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSpacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // Bridge bounding definitions
    const startX = this.paddingX;
    const endX = width - this.paddingX;
    const bridgeW = endX - startX;
    const deckY = height * 0.6; // Anchor point for deck
    
    // Tower X coordinates (symmetric pylons at 35% and 65%)
    const tower1X = startX + bridgeW * 0.35;
    const tower2X = startX + bridgeW * 0.65;
    const towerTopY = deckY - this.pylonHeight;

    // Apply seismic screen shake effect if necessary
    let shakeX = 0, shakeY = 0;
    if (this.preset === 'seismic' && this.sensors) {
      const activeVibe = this.sensors['A-02'].fused * 0.8;
      shakeX = Math.sin(this.time * 60) * activeVibe;
      shakeY = Math.cos(this.time * 55) * activeVibe;
      ctx.translate(shakeX, shakeY);
    }

    // 1. Draw Pylons (Towers)
    ctx.strokeStyle = '#1e293b';
    ctx.fillStyle = '#0f172a';
    ctx.lineWidth = 6;

    // Tower Left
    ctx.beginPath();
    ctx.moveTo(tower1X - 8, deckY + 50);
    ctx.lineTo(tower1X, towerTopY);
    ctx.lineTo(tower1X + 8, deckY + 50);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Tower Right
    ctx.beginPath();
    ctx.moveTo(tower2X - 8, deckY + 50);
    ctx.lineTo(tower2X, towerTopY);
    ctx.lineTo(tower2X + 8, deckY + 50);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Tower crossbeams
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(tower1X - 6, towerTopY + 50); ctx.lineTo(tower1X + 6, towerTopY + 50);
    ctx.moveTo(tower1X - 7, towerTopY + 90); ctx.lineTo(tower1X + 7, towerTopY + 90);
    ctx.moveTo(tower2X - 6, towerTopY + 50); ctx.lineTo(tower2X + 5, towerTopY + 50);
    ctx.moveTo(tower2X - 7, towerTopY + 90); ctx.lineTo(tower2X + 7, towerTopY + 90);
    ctx.stroke();

    // 2. Draw Deforming Road Deck
    // Deflection curve is represented by a set of nodes
    const deckSegments = 60;
    const deckPoints = [];

    for (let i = 0; i <= deckSegments; i++) {
      const t = i / deckSegments; // 0.0 to 1.0
      const x = startX + t * bridgeW;
      
      // Calculate physics deflection envelope displacement
      let dY = 0;
      if (this.healthData) {
        // Base envelope using sinusoidal curve
        const wave = Math.sin(t * Math.PI);
        dY = this.healthData.actualDeflection * wave * 2.2; // scale for rendering visibility
      }

      // Wind sway displacement
      if (this.preset === 'wind') {
        dY += Math.sin(this.time * 6 + t * 4) * (this.windSpeed * 0.05);
      }

      deckPoints.push({ x, y: deckY + dY });
    }

    // Draw the main road girder
    ctx.beginPath();
    ctx.moveTo(deckPoints[0].x, deckPoints[0].y);
    for (let i = 1; i < deckPoints.length; i++) {
      ctx.lineTo(deckPoints[i].x, deckPoints[i].y);
    }
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Draw Stress Heatmap overlay below deck (red glows in high bending regions)
    if (this.healthData) {
      ctx.beginPath();
      ctx.moveTo(deckPoints[0].x, deckPoints[0].y + 4);
      for (let i = 1; i < deckPoints.length; i++) {
        ctx.lineTo(deckPoints[i].x, deckPoints[i].y + 4);
      }
      ctx.lineWidth = 2;
      
      // Create horizontal gradient matching bending moment stresses
      const grad = ctx.createLinearGradient(startX, 0, endX, 0);
      const residualFactor = Math.min(1.0, this.healthData.physicalResidual / 15.0);
      
      let baseGlowColor = 'rgba(16, 185, 129, 0.4)'; // Green glow
      if (this.preset === 'fatigue') {
        baseGlowColor = 'rgba(239, 68, 68, 0.8)'; // Fatal fatigue red
      } else if (this.preset === 'seismic') {
        baseGlowColor = 'rgba(245, 158, 11, 0.6)'; // Warning amber
      }

      grad.addColorStop(0, 'rgba(51, 65, 85, 0.2)');
      grad.addColorStop(0.3, baseGlowColor);
      grad.addColorStop(0.5, this.preset === 'fatigue' ? 'rgba(239, 68, 68, 1)' : baseGlowColor);
      grad.addColorStop(0.7, baseGlowColor);
      grad.addColorStop(1, 'rgba(51, 65, 85, 0.2)');

      ctx.strokeStyle = grad;
      ctx.stroke();
    }

    // 3. Draw Stay Cables
    // Stay cables connect from tower tops to points along the deck
    const anchorPointsDeck = [0.15, 0.22, 0.29, 0.41, 0.48, 0.55, 0.71, 0.78, 0.85]; // fractions
    ctx.lineWidth = 1.2;

    anchorPointsDeck.forEach((pct, idx) => {
      // Connect to nearest pylon
      const towerX = pct < 0.5 ? tower1X : tower2X;
      
      // Pick deck connection point coordinates
      const segIndex = Math.round(pct * deckSegments);
      const deckPt = deckPoints[segIndex];

      // Draw cable
      ctx.beginPath();
      ctx.moveTo(towerX, towerTopY + 12);
      ctx.lineTo(deckPt.x, deckPt.y);

      // Visual treatment for cable fatigue:
      // Cable 4 (idx 3, left tower center span) degrades under 'fatigue' preset
      if (idx === 3 && this.preset === 'fatigue') {
        // Red, dashed, flickering line
        ctx.strokeStyle = Math.random() > 0.3 ? '#ef4444' : 'rgba(239, 68, 68, 0.2)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = '#475569';
        ctx.setLineDash([]);
        ctx.lineWidth = 1.0;
      }

      ctx.stroke();
    });
    ctx.setLineDash([]); // Reset line dash style

    // 4. Draw Vehicles (Traffic)
    this.vehicles.forEach(car => {
      // Interpolate vehicle X position along the bending deck segments
      const pct = car.x / this.L; // 0.0 to 1.0
      const segmentIndex = Math.min(deckSegments, Math.max(0, Math.floor(pct * deckSegments)));
      const deckPt = deckPoints[segmentIndex];

      if (deckPt) {
        ctx.save();
        ctx.translate(deckPt.x, deckPt.y);

        // Draw vehicle box
        ctx.fillStyle = car.color || '#06b6d4';
        const carW = 12;
        const carH = 6;
        ctx.fillRect(-carW / 2, -carH - 1, carW, carH);
        
        // Draw small wheel dots
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-3, -1, 1.5, 0, 2 * Math.PI);
        ctx.arc(3, -1, 1.5, 0, 2 * Math.PI);
        ctx.fill();

        // Draw headlights
        ctx.fillStyle = 'rgba(253, 224, 71, 0.8)';
        ctx.beginPath();
        ctx.arc(5, -4, 1.2, 0, 2 * Math.PI);
        ctx.fill();

        ctx.restore();
      }
    });

    // 5. Draw Sensor Nodes (blinking indicator rings)
    this.nodes.forEach(node => {
      const coords = this.getNodePixelCoords(node, width, height);
      const isHovered = node.id === this.hoveredNodeId;
      const isSelected = node.id === this.selectedNodeId;
      
      let nodeColor = varColorMap(node.type);
      let ringScale = 1.0;

      // Pulse ring size based on trigonometric oscillation
      const pulse = 1.0 + 0.2 * Math.sin(this.time * 8 + node.xPct * 20);

      // Fault check
      if (this.sensors && this.sensors[node.id]) {
        const status = this.sensors[node.id].status;
        if (status.includes('FAULT')) {
          nodeColor = '#ef4444'; // Red for isolated fault
          ringScale = 1.4;
        } else if (status.includes('WARNING')) {
          nodeColor = '#f59e0b'; // Amber warning
        }
      }

      ctx.save();
      ctx.translate(coords.x, coords.y);

      // Draw sensor glowing shadow outer ring
      ctx.strokeStyle = nodeColor;
      ctx.lineWidth = isSelected ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, (isSelected ? 9 : 6) * pulse * ringScale, 0, 2 * Math.PI);
      ctx.stroke();

      // Draw sensor solid core dot
      ctx.fillStyle = isHovered || isSelected ? '#ffffff' : nodeColor;
      ctx.beginPath();
      ctx.arc(0, 0, isSelected ? 4 : 3, 0, 2 * Math.PI);
      ctx.fill();

      // Small typography sensor tag
      ctx.fillStyle = isSelected ? '#ffffff' : '#6b7280';
      ctx.font = '8px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(node.id, 0, isSelected ? -13 : -10);

      ctx.restore();
    });

    // Reset seismic translation matrix
    if (this.preset === 'seismic' && this.sensors) {
      ctx.translate(-shakeX, -shakeY);
    }

    // Helper functions inside render scope
    function varColorMap(type) {
      switch (type) {
        case 'strain': return '#10b981'; // Green
        case 'accel': return '#06b6d4'; // Cyan
        case 'incline': return '#f59e0b'; // Yellow
        default: return '#9ca3af';
      }
    }
  }
}
