import { SensorFusionEngine } from './sensorFusion.js';
import { HybridAIEngine } from './hybridAI.js';
import { DigitalTwinRenderer } from './digitalTwin.js';
import { TelemetryChart } from './charts.js';

class AppController {
  constructor() {
    this.time = 0;
    this.lastTime = 0;
    this.frameIndex = 0;

    // Simulation parameter states
    this.preset = 'normal';
    this.trafficDensity = 1; // 0: None, 1: Moderate, 2: High, 3: Heavy Truck
    this.windSpeed = 12; // knots
    this.temperature = 24; // °C
    this.noiseLevel = 10; // raw slider (5 to 50)

    // Traffic simulation array
    this.vehicles = [];
    this.lastVehicleSpawn = 0;

    // Initialize core components
    this.fusion = new SensorFusionEngine();
    this.ai = new HybridAIEngine();

    // DOM selectors
    this.overlayNode = document.getElementById('node-overlay');
    this.logContainer = document.getElementById('logs-container');
    
    // Bind digital twin renderer
    const canvas = document.getElementById('bridge-canvas');
    this.renderer = new DigitalTwinRenderer(canvas, this.overlayNode, (nodeId) => {
      this.addLog('system', `[SYSTEM] User locked focus on sensor: ${nodeId}`);
    });

    // Initialize telemetry charts
    this.initCharts();

    // Bind UI elements
    this.bindEvents();

    // Start execution loop
    requestAnimationFrame((t) => this.loop(t));
  }

  initCharts() {
    // 1. Fusion Plotter: Accelerometer A-02 Raw (yellow) vs Fused (cyan)
    this.chartFusion = new TelemetryChart(document.getElementById('chart-fusion'), {
      title: 'A-02 Filtering',
      lineColor1: '#06b6d4', // cyan (fused)
      lineColor2: '#f97316', // orange (raw)
      fillColor1: 'rgba(6, 182, 212, 0.08)',
      fillColor2: 'rgba(249, 115, 22, 0.02)',
      minVal: -15.0,
      maxVal: 15.0,
    });

    // 2. Physics Residual Plotter: Center Span Deflection Deviation (green)
    this.chartResidual = new TelemetryChart(document.getElementById('chart-residual'), {
      title: 'Physics Residual',
      lineColor1: '#10b981', // green
      fillColor1: 'rgba(16, 185, 129, 0.08)',
      minVal: 0.0,
      maxVal: 20.0,
    });

    // 3. AI Anomaly Score (red)
    this.chartAnomaly = new TelemetryChart(document.getElementById('chart-anomaly'), {
      title: 'Autoencoder MSE Loss',
      lineColor1: '#ef4444', // red
      fillColor1: 'rgba(239, 68, 68, 0.08)',
      minVal: 0.0,
      maxVal: 1.0,
    });
  }

  bindEvents() {
    // Sliders
    const bindSlider = (id, valId, prop, suffix = '') => {
      const slider = document.getElementById(id);
      const output = document.getElementById(valId);
      
      const update = () => {
        let val = parseFloat(slider.value);
        this[prop] = val;
        
        let displayVal = val.toString() + suffix;
        if (id === 'slider-traffic') {
          const names = ['Empty Spans', 'Moderate Traffic', 'High Volume', 'Heavy Truck Load'];
          displayVal = names[val];
        } else if (id === 'slider-noise') {
          const names = ['Ultra Low', 'Low', 'Moderate', 'High', 'Severe'];
          const idx = Math.min(4, Math.floor((val - 5) / 10));
          displayVal = names[idx];
        }

        output.textContent = displayVal;
      };

      slider.addEventListener('input', update);
      // Run once to initialize
      update();
    };

    bindSlider('slider-traffic', 'val-traffic', 'trafficDensity');
    bindSlider('slider-wind', 'val-wind', 'windSpeed', ' kts');
    bindSlider('slider-temp', 'val-temp', 'temperature', '°C');
    bindSlider('slider-noise', 'val-noise', 'noiseLevel');

    // Preset buttons click listeners
    const presetBtns = document.querySelectorAll('.preset-buttons .btn');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Toggle active button
        presetBtns.forEach(b => b.classList.remove('active'));
        const activeBtn = e.currentTarget;
        activeBtn.classList.add('active');

        // Apply preset characteristics
        const scenario = activeBtn.getAttribute('data-preset');
        this.applyPreset(scenario);
      });
    });

    // Clear logs button
    document.getElementById('clear-logs').addEventListener('click', () => {
      this.logContainer.innerHTML = '';
      this.addLog('system', '[SYSTEM] Diagnostics logs cleared.');
    });
  }

  applyPreset(scenario) {
    this.preset = scenario;
    this.addLog('system', `[SYSTEM] Applying simulation profile: [${scenario.toUpperCase()}]`);

    // Fetch sliders
    const sliderTraffic = document.getElementById('slider-traffic');
    const sliderWind = document.getElementById('slider-wind');
    const sliderTemp = document.getElementById('slider-temp');
    const sliderNoise = document.getElementById('slider-noise');

    // Remove any severe stress warnings on preset resets
    this.fusion.resetKalman();

    switch (scenario) {
      case 'normal':
        sliderTraffic.value = 1;
        sliderWind.value = 12;
        sliderTemp.value = 24;
        sliderNoise.value = 10;
        break;
      case 'wind':
        sliderTraffic.value = 1;
        sliderWind.value = 65; // Gale wind force
        sliderTemp.value = 18;
        sliderNoise.value = 15;
        this.addLog('warn', '[ENV] Warning: High wind velocity advisory active. Dynamic loads increased.');
        break;
      case 'fatigue':
        sliderTraffic.value = 2; // High traffic density
        sliderWind.value = 15;
        sliderTemp.value = 35; // Heat expands bridge
        sliderNoise.value = 10;
        this.addLog('error', '[STRUCT] Critical Warning: Tension fatigue simulated on Cable Span C-4.');
        break;
      case 'seismic':
        sliderTraffic.value = 0; // Cars exit bridge in tremors
        sliderWind.value = 8;
        sliderTemp.value = 21;
        sliderNoise.value = 20;
        this.addLog('error', '[SEISMIC] Severe Earth Tremor detected! Activating structural excitation loops.');
        break;
      case 'sensor-fault':
        sliderTraffic.value = 1;
        sliderWind.value = 12;
        sliderTemp.value = 24;
        sliderNoise.value = 35; // Severe background noise
        this.addLog('warn', '[FUSION] Calibrating fault injection... Accelerometer outlier spikes active.');
        break;
    }

    // Trigger input events to update model state and sliders text
    const event = new Event('input');
    sliderTraffic.dispatchEvent(event);
    sliderWind.dispatchEvent(event);
    sliderTemp.dispatchEvent(event);
    sliderNoise.dispatchEvent(event);
  }

  addLog(type, text) {
    const logLine = document.createElement('div');
    logLine.className = `log-line ${type}`;
    logLine.textContent = text;
    this.logContainer.appendChild(logLine);

    // Scroll to bottom
    this.logContainer.scrollTop = this.logContainer.scrollHeight;

    // Prune excessive log histories
    while (this.logContainer.children.length > 50) {
      this.logContainer.removeChild(this.logContainer.firstChild);
    }
  }

  /**
   * Spawns vehicle instances moving across the bridge deck span
   */
  simulateTraffic() {
    // 1. Spawning check
    const now = Date.now();
    let spawnRateLimit = 2200; // milliseconds
    if (this.trafficDensity === 0) spawnRateLimit = 9999999;
    if (this.trafficDensity === 2) spawnRateLimit = 1200;
    if (this.trafficDensity === 3) spawnRateLimit = 6000; // Rare spawn rate for heavy trucks

    if (now - this.lastVehicleSpawn > spawnRateLimit && this.trafficDensity > 0) {
      let carType = 'car';
      let weight = 1.2; // tonnes
      let speed = 1.6 + Math.random() * 0.8; // speed along bridge x coordinate
      let color = '#06b6d4'; // default cyan

      if (this.trafficDensity === 3) {
        // Spawn heavy loader
        carType = 'truck';
        weight = 38.0; // Tonnes (Heavy truck load!)
        speed = 0.8; // slow moving
        color = '#ef4444'; // Red truck warning
        this.addLog('system', '[TRAFFIC] Heavy cargo truck (38.0 Tonnes) entering span. Monitoring deflection mechanics.');
      } else if (Math.random() < 0.25) {
        // Medium size van
        carType = 'van';
        weight = 3.5;
        speed = 1.4;
        color = '#10b981';
      }

      this.vehicles.push({
        x: 0,
        type: carType,
        weight: weight,
        speed: speed,
        color: color
      });
      this.lastVehicleSpawn = now;
    }

    // 2. Advance vehicles and prune if exited bridge (L = 200m)
    this.vehicles = this.vehicles.filter(car => {
      car.x += car.speed;
      return car.x <= 200.0;
    });
  }

  /**
   * Compute dynamic vibration waveforms based on environmental presets
   */
  getDynamicOscillations() {
    let accelBase = Math.sin(this.time * 18.0) * 0.15; // standard vehicle vibration rumble
    let pylonIncline = 0.0;

    // Wind oscillations
    if (this.windSpeed > 15) {
      // Wind induces flutter
      const windHz = 8.0 + this.windSpeed * 0.05;
      const windAmp = (this.windSpeed * this.windSpeed) * 0.0003;
      accelBase += Math.sin(this.time * windHz) * windAmp;
      pylonIncline += Math.sin(this.time * 2.0) * (this.windSpeed * 0.0005);
    }

    // Seismic excitation oscillations
    if (this.preset === 'seismic') {
      // Ground shaking (low frequency, massive force)
      const shakeHz = 4.5;
      const shakeAmp = 8.5 + Math.sin(this.time * 0.5) * 3.0;
      accelBase += Math.sin(this.time * shakeHz) * shakeAmp;
      pylonIncline += Math.cos(this.time * 3.5) * 0.08;
    }

    return {
      accelBase,
      pylonIncline
    };
  }

  /**
   * Primary Application Execution Loop
   */
  loop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    const dt = (timestamp - this.lastTime) / 1000.0;
    this.lastTime = timestamp;

    // Tick simulation clock
    // Cap dt during background tabs inactive cycles to prevent math instability spikes
    this.time += Math.min(0.1, dt);
    this.frameIndex++;

    // 1. Update dynamic traffic distribution
    this.simulateTraffic();

    // 2. Compute true physical parameters
    const dynamics = this.getDynamicOscillations();
    
    // Euler-Bernoulli static deflection under active vehicle loads
    const physicsCenterDeflection = this.ai.getPhysicsDeflection(100.0, this.vehicles, this.temperature, this.windSpeed);
    
    // Package ground truth states for the sensor system
    const physicalStates = {
      deckStrainLeft: this.ai.getPhysicsDeflection(50.0, this.vehicles, this.temperature, this.windSpeed) * 15.0,
      deckStrainCenter: physicsCenterDeflection * 15.0,
      deckStrainRight: this.ai.getPhysicsDeflection(150.0, this.vehicles, this.temperature, this.windSpeed) * 15.0,
      deckAccelCenter: dynamics.accelBase,
      towerAccelLeft: dynamics.accelBase * 0.4 + (Math.sin(this.time * 12) * 0.05),
      towerInclineLeft: dynamics.pylonIncline + 0.02 * (this.temperature - 20.0) / 10.0,
      towerInclineRight: -dynamics.pylonIncline - 0.02 * (this.temperature - 20.0) / 10.0
    };

    // 3. Sensor Fusion Step: Process raw telemetry stream through Kalman Filter & isolation
    const noiseFactor = this.noiseLevel / 100.0;
    const fusionResult = this.fusion.update(this.time, physicalStates, noiseFactor, this.preset);
    
    // Output fusion diagnostics to console UI
    fusionResult.logs.forEach(log => this.addLog(log.type, log.text));

    // 4. Hybrid AI Evaluation Step: Analyze fused sensors against physics calculations
    const aiResult = this.ai.evaluateHealth(
      fusionResult.sensors,
      this.vehicles,
      this.windSpeed,
      this.temperature,
      this.preset
    );

    // Output Hybrid AI warnings/alerts to console UI
    aiResult.logs.forEach(log => this.addLog(log.type, log.text));

    // 5. Update HTML Interface Metrics
    document.getElementById('health-index-val').textContent = `${aiResult.shi.toFixed(1)}%`;
    
    const shiVal = aiResult.shi;
    const statusValEl = document.getElementById('health-index-val');
    const systemStatusEl = document.getElementById('sys-status');
    
    // Set status headers text & styling
    systemStatusEl.textContent = aiResult.statusText;
    systemStatusEl.className = 'chip-value ' + aiResult.statusClass;

    if (shiVal < 75.0) {
      statusValEl.className = 'chip-value text-glowing-red';
    } else if (shiVal < 90.0) {
      statusValEl.className = 'chip-value text-glowing-yellow';
    } else {
      statusValEl.className = 'chip-value text-glowing-green';
    }

    // 6. Draw Digital Twin Canvas
    this.renderer.updateData(
      this.time,
      fusionResult.sensors,
      aiResult,
      this.vehicles,
      this.windSpeed,
      this.preset
    );
    this.renderer.draw();

    // 7. Update Telemetry Charts (rendered every frame or throttled every 2 frames for performance)
    if (this.frameIndex % 2 === 0) {
      const a02HistoryRaw = fusionResult.sensors['A-02'].history.map(pt => pt.raw);
      const a02HistoryFused = fusionResult.sensors['A-02'].history.map(pt => pt.fused);
      
      // Dynamic max scale for Accelerometer chart
      let accelMax = 8.0;
      if (this.preset === 'seismic') accelMax = 18.0;
      this.chartFusion.drawDual(a02HistoryRaw, a02HistoryFused, accelMax);

      // Physics Bending Residual
      this.chartResidual.draw(this.ai.residualHistory, 15.0);

      // Autoencoder Loss
      this.chartAnomaly.draw(this.ai.anomalyHistory, 1.0);
    }

    // Repeat execution
    requestAnimationFrame((t) => this.loop(t));
  }
}

// Instantiate App
window.addEventListener('DOMContentLoaded', () => {
  new AppController();
});
