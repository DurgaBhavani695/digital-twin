# AetherBridge: Digital Twin Infrastructure Monitoring Dashboard

A real-time, interactive Digital Twin application demonstrating intelligent infrastructure health monitoring on a smart cable-stayed suspension bridge using **Sensor Fusion** and **Hybrid AI** (Physics-Informed + Data-Driven) models.

This project is built using vanilla HTML5, CSS, and ES6 Javascript with **Vite** for optimized assets compilation and dev serving. It features zero heavy chart framework dependencies, ensuring high-frequency rendering performance.

---

## 🚀 Key Features

* **Interactive 2D Spatial Digital Twin**: Real-time representation of the bridge structure. The road deck visually sags/deforms under dynamic traffic point loads (vehicles) and sways under environmental wind shear.
* **Sensor Fusion Engine**: 
  * Fuses multiple telemetry inputs (accelerometers, strain gauges, inclinometers).
  * Smooths vibration noise using a discrete **Kalman Filter**.
  * Executes **FDIR (Fault Detection, Isolation, and Recovery)** using a Chi-Squared residual outlier detector to isolate malfunctioning sensors.
* **Hybrid AI Engine**:
  * **Physics-Informed Mechanics**: Evaluates static load bending deflections using Euler-Bernoulli beam calculations in real-time.
  * **Data-Driven Diagnostics**: Simulates a surrogate Autoencoder neural network to map reconstruction errors (MSE) under unmodeled structural fatigue.
* **Structural Health Index (SHI)**: Evaluates structural integrity as a dynamic index, outputting warnings or critical alerts on threshold crossings.
* **Simulation Controller**: Binds presets representing different operational profiles (Normal Operations, High Wind Gale, Cable Tension Loss, Seismic Perturbation, Sensor Drift/Fault).

---

## 🛠️ Mathematical Implementation

### 1. Kalman Filtering & FDIR
In [src/sensorFusion.js](src/sensorFusion.js), accelerometer noise is filtered using the following state space update loop:
$$x_{pred} = x_{k-1}$$
$$P_{pred} = P_{k-1} + Q$$
$$K = \frac{P_{pred}}{P_{pred} + R}$$
$$x_{new} = x_{pred} + K \cdot (z_{raw} - x_{pred})$$
$$P_{new} = (1 - K) \cdot P_{pred}$$

To prevent sensor malfunctions from corrupting the health analysis, a **Chi-squared residual validator** isolates out-of-bounds measurements:
$$\text{Residual} = |z_{raw} - x_{pred}| > 4.5 \sqrt{P_{pred} + R}$$
If true, the sensor state is marked as `FAULT` and bypassed, and the state estimate is reconstructed using the temporal transition model.

### 2. Euler-Bernoulli Beam Mechanics
In [src/hybridAI.js](src/hybridAI.js), the expected static deck bending deflection $w(x)$ at position $x$ is computed by superposing active vehicle point loads $P_i$:
$$w(x) = \sum_{i} \frac{P_i \cdot b_i \cdot x}{6 E I L} (L^2 - b_i^2 - x^2) \quad \text{for } x \le a_i$$
where $a_i$ is the load position along the span, $b_i = L - a_i$, $L$ is span length, and $EI$ is flexural stiffness.

---

## 📂 Project Structure

```text
├── index.html          # Main HTML dashboard structure
├── package.json        # Project and Vite configurations
├── README.md           # Documentation
├── src
│   ├── main.js         # Main coordinator and execution loop
│   ├── style.css       # Core layout styling and aesthetics (glassmorphism)
│   ├── digitalTwin.js  # Interactive bridge canvas renderer
│   ├── sensorFusion.js # Kalman filtering and FDIR logic
│   ├── hybridAI.js     # Physics calculations and autoencoder surrogate
│   └── charts.js       # Custom high-DPI canvas charting utility
```

---

## 💻 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/DurgaBhavani695/digital-twin.git
   cd digital-twin
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally
1. Start the Vite local development server:
   ```bash
   npm run dev
   ```
2. Open [http://localhost:5173/](http://localhost:5173/) in your web browser.

### Building for Production
To build the project and output highly optimized, compressed assets into the `dist/` directory:
```bash
npm run build
```
