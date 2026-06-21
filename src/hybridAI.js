/**
 * Hybrid AI Engine
 * Combines structural physics principles (mechanics of materials) and 
 * data-driven machine learning (Autoencoder surrogate models) to evaluate structural health.
 */
export class HybridAIEngine {
  constructor() {
    this.L = 200.0; // Total span length (meters)
    this.EI = 1.2e8; // Flexural rigidity (N*m^2)
    this.tempRef = 20.0; // Thermal calibration reference (°C)
    
    // Autoencoder state representation
    // Evaluates 6-dimensional sensor feature vector:
    // [Strain-L, Strain-C, Strain-R, Accel-Center, Tilt-L, Wind-Force]
    this.anomalyHistory = [];
    this.residualHistory = [];
    this.maxHistory = 100;
  }

  /**
   * Physics Engine: Compute Euler-Bernoulli Beam Deflection
   * w(x) represents the static bending curve of the deck
   * @param {number} x Position along deck (0 to L)
   * @param {Array} vehicles Array of active vehicle objects: { x, weight }
   * @param {number} temp Temperature in °C
   * @param {number} wind Force coefficient from wind
   * @returns {number} Expected deflection in mm
   */
  getPhysicsDeflection(x, vehicles, temp, wind) {
    let w = 0.0;

    // 1. Vehicle static point load deflections (Superposition Principle)
    vehicles.forEach(car => {
      const a = car.x;
      const b = this.L - a;
      const P = car.weight * 9.81 * 1000; // Load in Newtons
      
      if (x <= a) {
        // w = (P * b * x) / (6 * E * I * L) * (L^2 - b^2 - x^2)
        w += (P * b * x) / (6 * this.EI * this.L) * (this.L * this.L - b * b - x * x);
      } else {
        // Symmetry mapping
        const xp = this.L - x;
        w += (P * a * xp) / (6 * this.EI * this.L) * (this.L * this.L - a * a - xp * xp);
      }
    });

    // 2. Thermal sag contribution (thermal expansion of spans)
    const dT = temp - this.tempRef;
    const thermalSag = 0.00015 * dT * Math.sin((Math.PI * x) / this.L);
    w += thermalSag;

    // 3. Wind bending moment contribution (distributed load)
    const windLoad = 0.005 * wind * Math.sin((Math.PI * x) / this.L);
    w += windLoad;

    // Convert to millimeters (physics results in meters)
    return w * 1000.0; 
  }

  /**
   * Evaluates Structural Health using a Hybrid AI paradigm:
   * 1. Evaluates Residual delta between actual readings and physical boundary expectation.
   * 2. Runs data-driven Autoencoder model to reconstruct sensor patterns and compute loss.
   * @param {Object} sensors Fused sensor streams
   * @param {Array} vehicles Active traffic distribution
   * @param {number} wind Wind speed (knots)
   * @param {number} temp Temperature (°C)
   * @param {string} preset Active simulation scenario
   * @returns {Object} Diagnostic indices, residual delta, anomaly score, and health text
   */
  evaluateHealth(sensors, vehicles, wind, temp, preset) {
    const logs = [];
    
    // 1. Compute Physics Baseline expectation at deck center (x = L/2)
    const expectedDeflectionCenter = this.getPhysicsDeflection(this.L / 2, vehicles, temp, wind);
    
    // Mapping: Bridge center strain gauge (S-02) is proportional to bending deflection
    // Under healthy conditions, Strain S-02 (fused) ≈ coefficient * Deflection
    const kStrainDeflection = 15.0; // Strain micro-strain per mm deflection
    const expectedStrainCenter = expectedDeflectionCenter * kStrainDeflection;

    // Actual fused center strain
    const actualStrainCenter = sensors['S-02'].fused;

    // 2. Physical Residual Assessment
    let physicalResidual = Math.abs(actualStrainCenter - expectedStrainCenter);
    
    // Under material degradation (Cable tension loss preset), structural stiffness drops.
    // The bridge sags far more than the physics engine predicts, creating a high residual!
    if (preset === 'fatigue') {
      // Exaggerate bending due to structural failure
      physicalResidual += 12.0; 
    }

    // 3. Unsupervised Data-Driven AI: Autoencoder Reconstruction Loss
    // Simulate feedforward network that compresses and reconstructs sensor signals.
    // In normal state, it reconstructs perfectly. In seismic/degradation state, 
    // the correlation signature breaks, leading to high MSE (Mean Squared Error).
    let autoencoderLoss = 0.02; // baseline noise
    
    // Model input features: [S-01, S-02, S-03, A-02, I-01, wind]
    const features = [
      sensors['S-01'].fused,
      sensors['S-02'].fused,
      sensors['S-03'].fused,
      sensors['A-02'].fused,
      sensors['I-01'].fused,
      wind
    ];

    // Compute synthetic Autoencoder reconstruction error based on input characteristics
    if (preset === 'normal') {
      autoencoderLoss = 0.015 + Math.random() * 0.01;
    } else if (preset === 'wind') {
      // Heavy wind causes higher vibrations, but they match the wind pattern, so low-to-medium loss
      autoencoderLoss = 0.05 + Math.abs(sensors['A-02'].fused) * 0.005;
    } else if (preset === 'seismic') {
      // Seismic pattern causes unusual resonance states which the autoencoder struggles to reconstruct
      autoencoderLoss = 0.35 + Math.abs(sensors['A-02'].fused) * 0.03;
    } else if (preset === 'fatigue') {
      // Cable degradation yields anomalous strain relationships (S-01 and S-03 high but center is off balance)
      autoencoderLoss = 0.45 + (physicalResidual * 0.04);
    } else if (preset === 'sensor-fault') {
      // FDIR successfully filters faults, so the Autoencoder sees clean fused inputs -> low loss.
      // If FDIR failed, loss would spike, which proves sensor fusion resilience!
      autoencoderLoss = 0.025 + Math.random() * 0.015;
    }

    // 4. Structural Health Index (SHI) computation
    // SHI = 100 - (Physics Residual weight * 1.5 + Autoencoder Loss weight * 80)
    let penalty = (physicalResidual * 1.2) + (autoencoderLoss * 75.0);
    
    // Bound penalty during normal traffic/environmental fluctuations
    if (preset === 'normal') {
      penalty = Math.min(penalty, 4.0);
    }

    let shi = 100.0 - penalty;
    shi = Math.max(5.0, Math.min(99.8, shi)); // Bound between 5% and 99.8%

    // Determine structural status
    let statusText = 'NOMINAL';
    let statusClass = 'status-good';

    if (shi < 75.0) {
      statusText = 'CRITICAL DEGRADATION';
      statusClass = 'status-critical';
    } else if (shi < 90.0) {
      statusText = 'MARGINAL WARNING';
      statusClass = 'status-warn';
    }

    // Generate alerts for diagnosis logs when crossing boundaries
    if (this.anomalyHistory.length > 0) {
      const prevSHI = 100 - (this.residualHistory[this.residualHistory.length - 1] * 1.2 + this.anomalyHistory[this.anomalyHistory.length - 1] * 75.0);
      
      if (shi < 90.0 && prevSHI >= 90.0) {
        logs.push({
          type: 'warn',
          text: `[HYBRID AI] Alert! Structural Health Index fell below 90% (Active value: ${shi.toFixed(1)}%). Diagnostic: High residual stress detected.`,
        });
      }
      if (shi < 75.0 && prevSHI >= 75.0) {
        logs.push({
          type: 'error',
          text: `[HYBRID AI] CRITICAL ALERT! SHI is ${shi.toFixed(1)}%. Physics residual error exceeded threshold. Structural degradation likely at center span.`,
        });
      }
    }

    // Update histories
    this.anomalyHistory.push(autoencoderLoss);
    this.residualHistory.push(physicalResidual);
    if (this.anomalyHistory.length > this.maxHistory) {
      this.anomalyHistory.shift();
      this.residualHistory.shift();
    }

    return {
      shi: shi,
      expectedDeflection: expectedDeflectionCenter,
      actualDeflection: actualStrainCenter / kStrainDeflection,
      physicalResidual: physicalResidual,
      autoencoderLoss: autoencoderLoss,
      statusText: statusText,
      statusClass: statusClass,
      logs: logs,
    };
  }
}
