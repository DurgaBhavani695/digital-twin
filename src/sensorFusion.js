/**
 * Sensor Fusion and Calibration Module
 * Implements a Kalman Filter for signal smoothing and a Fault Detection,
 * Isolation, and Recovery (FDIR) logic to isolate malfunctioning sensors.
 */
export class SensorFusionEngine {
  constructor() {
    // Kalman Filter variables for vertical acceleration (A-02 Deck Center)
    this.kalman = {
      x: 0.0, // State estimate (acceleration)
      P: 1.0, // Estimation error covariance
      Q: 0.02, // Process noise covariance
      R: 0.8, // Measurement noise covariance (dynamically modified by slider)
      K: 0.0, // Kalman gain
    };

    // Keep track of sensor status and sensor nodes
    this.sensors = {
      'S-01': { id: 'S-01', name: 'Strain Gauge (Span Left)', type: 'strain', raw: 0, fused: 0, status: 'HEALTHY', history: [] },
      'S-02': { id: 'S-02', name: 'Strain Gauge (Span Center)', type: 'strain', raw: 0, fused: 0, status: 'HEALTHY', history: [] },
      'S-03': { id: 'S-03', name: 'Strain Gauge (Span Right)', type: 'strain', raw: 0, fused: 0, status: 'HEALTHY', history: [] },
      'A-01': { id: 'A-01', name: 'Accelerometer (Tower Left)', type: 'accel', raw: 0, fused: 0, status: 'HEALTHY', history: [] },
      'A-02': { id: 'A-02', name: 'Accelerometer (Deck Center)', type: 'accel', raw: 0, fused: 0, status: 'HEALTHY', history: [] },
      'I-01': { id: 'I-01', name: 'Inclinometer (Tower Left)', type: 'incline', raw: 0, fused: 0, status: 'HEALTHY', history: [] },
      'I-02': { id: 'I-02', name: 'Inclinometer (Tower Right)', type: 'incline', raw: 0, fused: 0, status: 'HEALTHY', history: [] },
    };

    this.faultCounter = 0;
    this.historyLength = 100;
  }

  /**
   * Reset Kalman Filter state
   */
  resetKalman() {
    this.kalman.x = 0;
    this.kalman.P = 1.0;
  }

  /**
   * Step the sensor stream and run fusion
   * @param {number} time Elapsed time in seconds
   * @param {Object} physicalStates Ground truth values from physics engine
   * @param {number} noiseFactor Base noise level (from slider, 0.05 to 0.5)
   * @param {string} preset Active simulation scenario
   * @returns {Object} Updated sensors list and log messages (if any)
   */
  update(time, physicalStates, noiseFactor, preset) {
    const logs = [];
    const rNoise = () => (Math.random() - 0.5) * 2 * noiseFactor;

    // Set dynamic Kalman measurement noise covariance based on user setting
    this.kalman.R = noiseFactor * 5;

    // 1. Generate Raw Sensor values based on physics + noise
    // S-01 (Strain Left)
    this.sensors['S-01'].raw = physicalStates.deckStrainLeft + rNoise() * 1.5;
    
    // S-02 (Strain Center)
    let s02Raw = physicalStates.deckStrainCenter + rNoise() * 1.5;
    if (preset === 'sensor-fault') {
      // Inject slow sensor drift (over time)
      const drift = Math.sin(time * 0.1) * 12.0;
      s02Raw += drift;
    }
    this.sensors['S-02'].raw = s02Raw;

    // S-03 (Strain Right)
    this.sensors['S-03'].raw = physicalStates.deckStrainRight + rNoise() * 1.5;

    // A-01 (Accel Tower Left)
    this.sensors['A-01'].raw = physicalStates.towerAccelLeft + rNoise() * 0.5;

    // A-02 (Accel Deck Center)
    let a02Raw = physicalStates.deckAccelCenter + rNoise() * 2.0;
    if (preset === 'sensor-fault') {
      // Inject high-frequency massive outlier spikes (electromagnetic interference simulation)
      if (Math.random() < 0.15) {
        a02Raw += (Math.random() > 0.5 ? 1 : -1) * (15.0 + Math.random() * 10);
      }
    }
    this.sensors['A-02'].raw = a02Raw;

    // Inclinometers
    this.sensors['I-01'].raw = physicalStates.towerInclineLeft + rNoise() * 0.05;
    this.sensors['I-02'].raw = physicalStates.towerInclineRight + rNoise() * 0.05;

    // 2. Perform Kalman Filtering on Accelerometer A-02 (primary structural diagnostic)
    // Kalman Prediction step
    // Constant state model: x_k = x_k-1 + w
    // P_k = P_k-1 + Q
    let x_pred = this.kalman.x;
    let P_pred = this.kalman.P + this.kalman.Q;

    // Kalman Measurement Update step
    const z = this.sensors['A-02'].raw;
    const residual = z - x_pred;
    
    // FDIR algorithm: Chi-squared thresholding on residual
    // Check if measurement deviates from prediction too much
    const residualBound = 4.5 * Math.sqrt(P_pred + this.kalman.R);
    let isolated = false;

    if (Math.abs(residual) > residualBound && preset === 'sensor-fault') {
      this.sensors['A-02'].status = 'FAULT (ISOLATED)';
      isolated = true;
      this.faultCounter++;
      
      // Log fault detection throttling (max once every ~3 seconds equivalent cycles)
      if (this.faultCounter % 60 === 1) {
        logs.push({
          type: 'error',
          text: `[FUSION] A-02 Anomaly detected! Residual value |${residual.toFixed(2)}| > limit (${residualBound.toFixed(2)}). ISOLATING SENSOR.`,
        });
      }
    } else {
      this.sensors['A-02'].status = 'HEALTHY';
    }

    if (isolated) {
      // Recovery phase: Ignore measurement, update state estimate using physics prediction
      // Maintain previous prediction and let covariance grow slightly
      this.kalman.x = x_pred + 0.1 * (physicalStates.deckAccelCenter - x_pred); 
      this.kalman.P = P_pred;
      this.sensors['A-02'].fused = this.kalman.x;
    } else {
      // Normal Kalman update
      this.kalman.K = P_pred / (P_pred + this.kalman.R);
      this.kalman.x = x_pred + this.kalman.K * residual;
      this.kalman.P = (1 - this.kalman.K) * P_pred;
      this.sensors['A-02'].fused = this.kalman.x;
    }

    // 3. Simple spatial averaging and low-pass filter for Strain Gauges (S-01, S-02, S-03)
    // We demonstrate multi-sensor spatial validation:
    // Strain gauges should co-vary under vehicle loads. If one (S-02 in sensor-fault)
    // drifts significantly away from its spatial estimate, mark it as DRIFT WARNING.
    const S_expected_center = (this.sensors['S-01'].raw + this.sensors['S-03'].raw) / 2.0;
    const s02_residual = Math.abs(this.sensors['S-02'].raw - S_expected_center);

    // Filter S-01 and S-03 with simple exponential moving average (EMA)
    this.sensors['S-01'].fused = this.sensors['S-01'].fused * 0.8 + this.sensors['S-01'].raw * 0.2;
    this.sensors['S-03'].fused = this.sensors['S-03'].fused * 0.8 + this.sensors['S-03'].raw * 0.2;

    if (s02_residual > 6.0 && preset === 'sensor-fault') {
      this.sensors['S-02'].status = 'FAULT (DRIFT COMPENSATED)';
      // Perform spatial reconstruction: reconstruct center strain from spatial neighbors
      this.sensors['S-02'].fused = this.sensors['S-02'].fused * 0.95 + S_expected_center * 0.05;
      
      if (this.faultCounter % 60 === 1) {
        logs.push({
          type: 'warn',
          text: `[FUSION] S-02 Calibration Drift detected! Delta: ${s02_residual.toFixed(2)} µε. Applying spatial interpolation.`,
        });
      }
    } else {
      this.sensors['S-02'].status = 'HEALTHY';
      this.sensors['S-02'].fused = this.sensors['S-02'].fused * 0.8 + this.sensors['S-02'].raw * 0.2;
    }

    // Tower Inclinometers (fused via complimentary filter mapping)
    this.sensors['I-01'].fused = this.sensors['I-01'].fused * 0.9 + this.sensors['I-01'].raw * 0.1;
    this.sensors['I-02'].fused = this.sensors['I-02'].fused * 0.9 + this.sensors['I-02'].raw * 0.1;

    // 4. Update rolling history buffers
    Object.keys(this.sensors).forEach(id => {
      const s = this.sensors[id];
      s.history.push({ raw: s.raw, fused: s.fused });
      if (s.history.length > this.historyLength) {
        s.history.shift();
      }
    });

    return {
      sensors: this.sensors,
      logs: logs,
    };
  }
}
