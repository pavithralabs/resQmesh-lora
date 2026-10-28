# ResQMesh: Internet-Independent Tactical & Disaster LoRa P2P Network

> **A 100% Standalone, Software-Only Hackathon Prototype**  
> *Peer-to-Peer Off-Grid Communication for Disaster Relief, Search & Rescue, Wilderness Expeditions, and Tactical Privacy.*

---

## 🚀 Quick Start

1. **Start the application:**
   ```bash
   cd "C:\Users\P Rahul\.gemini\antigravity\scratch\resqmesh-lora"
   python app.py
   ```
2. **Open in browser:**
   Open [http://localhost:5000](http://localhost:5000)

3. **Run Performance Benchmarks in Terminal (Optional):**
   ```bash
   python test_benchmarks.py
   ```

---

## 🎯 4 Mission-Critical Use Cases Addressed

1. **Disaster Relief & Power Grid Collapse (Floods, Earthquakes, Hurricanes):**
   * High-priority **SOS Emergency Broadcasts** that flood the mesh to reach emergency responders.
   * Civilian & responder triage classification (**Immediate / Urgent / Minor**).
   * Critical resource requests (water, insulin, medical evacuation).
2. **Search & Rescue (SAR) Operations:**
   * Live GPS coordinate beaconing & grid sector tracking on an offline tactical map.
   * Ground team status reports between Search Alpha, Field Medic, Incident Command, and Airborne Relays.
3. **Wilderness & Remote Expeditions (Mountaineering, Hiking, Sailing):**
   * Zero-coverage check-ins, route waypoints, and automated breadcrumb beacons.
   * Store-and-forward message caching when mountain ridges block line-of-sight.
4. **Tactical & Privacy-Preserving Communication:**
   * Decentralized End-to-End Encrypted (E2EE) messaging with zero central servers or ISP metadata logging.
   * Tamper-proof, censorship-resistant packet relaying.

---

## 🏗️ System Architecture & Engineering Highlights

* **Virtual LoRa Radio PHY (`lora_phy.py`):**
  - **Log-Distance Path Loss Model:** Models RF attenuation at 868.1 MHz with Friis reference calibration:
    $$PL(d) = PL(d_0) + 10\gamma \log_{10}(d/d_0) + X_\sigma$$
  - **Receiver Sensitivity & SNR:** Accurately models demodulation thresholds across Spreading Factors ($SF7$ to $SF12$, down to $-137\text{ dBm}$).
  - **Semtech Time-on-Air (ToA):** Calculates packet airtime based on symbol duration, preamble length, and explicit header byte formulas.
  - **Energy Consumption:** Simulates mAh depletion per packet transmission and 1% ISM duty cycle compliance.

* **Decentralized Mesh Routing Protocol (`mesh_router.py`):**
  - **Loop Prevention & Deduplication:** Sliding-window cache drops duplicate packet echoes.
  - **Controlled Flooding & TTL:** Enforces maximum hop limits (TTL=4–5).
  - **Store-and-Forward:** Caches pending packets in node buffers when out of radio range and automatically drains them when connectivity is restored.
  - **Priority Preemption:** Emergency SOS packets (Priority 0) bypass queue backoff and preempt standard traffic.

* **Tactical Command Center UI (`templates/index.html`, `static/`):**
  - Interactive HTML5 Canvas radar map with **draggable nodes** and real-time RF link color grading (Green / Amber / Red).
  - **Live packet hop animations** with pulsing energy rings traversing relays.
  - **Multi-node persona switching** to simulate chatting between Incident Command, Search & Rescue, Relays, and Survivors.
  - **Web Audio API emergency siren** synthesizer triggered on SOS broadcasts.
  - **Built-in Performance Benchmark Suite** with dynamic charts for PDR %, Latency vs SF, and Battery longevity.

---

## 🏆 3-Minute Hackathon Jury Pitch Script

| Time | Action | What to Say to the Judges |
| :--- | :--- | :--- |
| **0:00 - 0:45** | Introduce the problem | *"In major disasters like earthquakes or floods, 80% of cell towers collapse. ResQMesh turns ordinary devices into an internet-independent, self-healing LoRa mesh network requiring zero cellular infrastructure."* |
| **0:45 - 1:15** | Select **Disaster Relief** scenario | *"Notice Survivor Beacon is 8.5 km away from Incident Command. Direct radio is completely disconnected (red line) due to extreme path loss."* |
| **1:15 - 1:45** | Click **TRIGGER SOS** | *"The trapped survivor presses SOS. Watch the emergency beacon visibly jump across the Hilltop Relay and reach Command HQ in 450ms, triggering an audible alarm and GPS coordinates."* |
| **1:45 - 2:15** | Drag nodes & send chat | *"Our system recalculates RF physics in real time. Drag the relay away and notice the link break; move it back and buffered messages drain immediately."* |
| **2:15 - 3:00** | Click **BENCHMARKS** | *"We didn't just build a UI; we implemented real LoRa physics. Show the jury the 98% Packet Delivery Ratio curve, Semtech airtime metrics, and how our low-power node lasts 180+ days vs an 8-hour dead phone battery."* |

---

## 🌐 Deploy to Render (Cloud Hosting)

Deploy **ResQMesh** to Render for free so anyone worldwide can access it via a permanent `https://<your-app>.onrender.com` URL.

### Option A: Using Render Blueprint (Automatic via `render.yaml`)
1. Push this project to your GitHub account.
2. In [Render Dashboard](https://dashboard.render.com), click **New +** ➔ **Blueprint**.
3. Connect your GitHub repository.
4. Render automatically detects `render.yaml` and deploys the service with optimal SSE worker settings.

### Option B: Manual Web Service Setup
1. In [Render Dashboard](https://dashboard.render.com), click **New +** ➔ **Web Service**.
2. Connect your GitHub repository.
3. Configure the settings:
   * **Name:** `resqmesh`
   * **Environment:** `Python`
   * **Branch:** `main`
   * **Build Command:** `pip install -r requirements.txt`
   * **Start Command:** `gunicorn --workers 1 --threads 8 --timeout 0 --bind 0.0.0.0:$PORT app:app`
   * **Plan:** `Free`
4. Click **Create Web Service**. Your project will be live in 1-2 minutes!

---

## 📦 How to Push to GitHub

### Method 1: Using Git CLI
```bash
cd "C:\Users\P Rahul\.gemini\antigravity\scratch\resqmesh-lora"
git init
git add .
git commit -m "feat: ResQMesh Internet-Independent LoRa P2P Network"
git branch -M main
git remote add origin https://github.com/<YOUR-USERNAME>/<YOUR-REPO-NAME>.git
git push -u origin main
```

### Method 2: Using GitHub Desktop
1. Open [GitHub Desktop](https://desktop.github.com/).
2. Select **File ➔ Add Local Repository...**
3. Choose `C:\Users\P Rahul\.gemini\antigravity\scratch\resqmesh-lora`.
4. Click **Publish repository** to push it to your GitHub profile.

### Method 3: Drag & Drop on GitHub.com
1. Create a new repository at [github.com/new](https://github.com/new).
2. Click **uploading an existing file**.
3. Drag the project files into the browser and commit.

