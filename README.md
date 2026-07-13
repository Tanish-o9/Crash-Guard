# Crash-Guard
CrashGuard is an intelligent two-wheeler crash detection and emergency response system designed to improve rider safety. The application uses smartphone sensors such as the accelerometer, gyroscope, GPS, and motion data to monitor riding patterns and identify potential crash events in real time.
# 🚨 CrashGuard

**Intelligent Two-Wheeler Crash Detection & Emergency Response System**

CrashGuard is a smart rider safety application designed to detect potential motorcycle and scooter crashes using smartphone sensor data and automatically initiate an emergency response workflow.

The system monitors motion and location signals in real time, analyzes unusual riding events, and triggers a safety alarm when a potential crash is detected.

---

## 🏍️ The Problem

Two-wheeler accidents can leave riders unable to manually call for help. Delays in emergency response can make critical situations worse.

CrashGuard aims to reduce this delay by automatically detecting potential crash events and starting an emergency response process.

---

## 💡 Our Solution

CrashGuard uses smartphone sensors and real-time anomaly detection to identify unusual events associated with a possible crash.

When a potential crash is detected:

1. 🚨 CrashGuard triggers an alarm.
2. ⏱️ A safety countdown begins.
3. 👤 The rider can cancel a false alert.
4. 📍 Crash information and location are processed.
5. 🆘 If the rider does not respond, the emergency workflow is initiated.

---

## ✨ Key Features

* 📱 Real-time smartphone sensor monitoring
* 🚨 Automatic potential crash detection
* 📊 Explainable anomaly detection
* ⏱️ Emergency safety countdown
* ❌ False alert cancellation
* 📍 GPS and speed-change analysis
* 🔄 Post-event stillness detection
* 🧠 Rider-specific motion baseline
* 🆘 Automated emergency response workflow
* 🔧 Built-in diagnostics and alarm testing

---

## 🧠 Crash Detection System

CrashGuard analyzes multiple sensor-based features:

| Feature                     | Purpose                              |
| --------------------------- | ------------------------------------ |
| Peak Acceleration Magnitude | Detect sudden impact-like movement   |
| Peak Jerk                   | Measure rapid acceleration changes   |
| GPS Speed Delta             | Identify sudden speed drops          |
| Rotation Rate Spike         | Detect abnormal device rotation      |
| Post-Event Stillness        | Analyze movement after an event      |
| Barometric Delta            | Detect elevation or pressure changes |

These signals are combined using a weighted anomaly scoring system based on a **Rolling Z-Score approach**.

The detection system is designed to be deterministic and explainable rather than relying entirely on a black-box AI model.

---

## 🏗️ System Architecture

```text
Smartphone Sensors
        ↓
Sensor Data Collection
        ↓
Feature Extraction
        ↓
ML / Anomaly Detection Service
        ↓
Composite Risk Score
        ↓
Potential Crash Detected
        ↓
Crash Alarm & Safety Countdown
        ↓
Emergency Agent Service
        ↓
Emergency Response Workflow
```

---

## 🛠️ Tech Stack

### Mobile Application

* React Native
* Expo
* TypeScript / JavaScript
* Smartphone Motion Sensors
* GPS and Location Services

### Backend

* Python
* FastAPI
* Uvicorn
* REST APIs

### Detection System

* Rolling Z-Score Anomaly Detection
* Composite Risk Scoring
* Sensor Feature Engineering
* Rider-Specific Baseline Analysis

### Development Tools

* Git
* GitHub
* VS Code
* Expo Go

---

## 📂 Project Structure

```text
CrashGuard/
│
├── apps/
│   └── mobile/
│       ├── app/
│       ├── components/
│       ├── hooks/
│       └── android/
│
├── services/
│   ├── ml/
│   │   └── app/
│   │       ├── main.py
│   │       └── detection services
│   │
│   └── agent/
│       └── app/
│           ├── main.py
│           └── emergency workflow
│
├── packages/
│
└── README.md
```

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd CrashGuard
```

### 2. Start the ML Service

```bash
cd services/ml
python -m uvicorn app.main:app --reload --port 8001
```

### 3. Start the Agent Service

```bash
cd services/agent
python -m uvicorn app.main:app --reload --port 8002
```

### 4. Start the Mobile Application

```bash
cd apps/mobile
npx expo start --lan
```

Scan the generated QR code using Expo Go.

Make sure the mobile device and development computer are connected to the same network.

---

## 🔍 Diagnostics

CrashGuard includes a diagnostics section for testing important application components.

The **Test Alarm** feature allows developers to manually verify the crash alarm screen and safety countdown flow.

---

## 🔮 Future Improvements

* Live emergency contact notifications
* Automatic emergency service integration
* Hospital routing and discovery
* Cloud-based crash event storage
* Advanced personalized crash detection
* Smartwatch and wearable integration
* Offline emergency detection
* Improved false-positive reduction

---

## 🎯 Project Goal

CrashGuard aims to build a practical, explainable, and scalable safety system for two-wheeler riders.

By combining smartphone sensors, real-time anomaly detection, and automated emergency workflows, CrashGuard explores how modern mobile and AI technologies can reduce emergency response delays after serious road incidents.

---

## 👨‍💻 Developer

**Tanish Kumar**

Built with a focus on AI, mobile technology, and rider safety.

---

## ⭐ Support

If you find CrashGuard useful or interesting, consider giving the repository a ⭐ on GitHub.
