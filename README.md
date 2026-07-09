# 🏍️ CrashGuard

> Two-Wheeler Crash Detection & Emergency Response App for Indian Riders

CrashGuard is a mobile app that passively detects motorcycle/scooter crashes using phone sensors (accelerometer, gyroscope, GPS) and automatically triggers a cascading emergency response — alerting emergency services, notifying family, and routing the nearest hospital.

### ✨ Key Features (Android Native)
- **Zero-Click Emergency Response**: Once permissions are granted, calls and SMS are sent completely in the background. The injured rider does not need to touch their phone.
- **Offline & Free SMS/Calls**: Replaced Twilio with Android's native `SmsManager` and `ACTION_CALL` intents. Uses the rider's own SIM card via cellular networks, requiring no WiFi, data, or paid APIs.
- **Bilingual TTS (English & Hindi)**: Reads out the crash location and rider's blood type aloud on the phone speaker for bystanders, using native Text-to-Speech.

---

## 🛠️ Tech Stack

- **Mobile App**: React Native (Expo), TypeScript, Zustand
- **Backend API**: Node.js, TypeScript
- **Machine Learning**: Python, FastAPI, NumPy (Anomaly Detection)
- **Database & Auth**: Supabase (PostgreSQL)

---

## 🚀 How to Run the Project Locally

Follow these exact steps to run the complete project (Mobile App + ML Backend + Node Backend).

### 1. Prerequisites
Make sure you have installed on your machine:
- [Node.js](https://nodejs.org/en/) (v18 or higher)
- [Python](https://www.python.org/downloads/) (v3.11 or higher)
- **For iOS**: [Expo Go](https://expo.dev/go) app installed on your iPhone.
- **For Android**: [Android Studio](https://developer.android.com/studio) installed.

### 2. Install Dependencies
Open a terminal at the root of the project (`CrashGuard`) and run:
```bash
npm install
```

### 3. Get the Secret Keys (.env)
For security, the API keys are not uploaded to GitHub. 
1. Ask the project owner to send you the `.env` file.
2. Place that `.env` file directly inside the `apps/mobile/` folder.

### 4. Start the Application Servers
You will need to open **three separate terminals** to run all parts of the app.

#### Terminal 1: Start the Machine Learning API (Python)
This powers the crash-detection algorithms.
```bash
cd services/ml
python -m venv venv
# On Windows use: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

#### Terminal 2: Start the Node.js API (TypeScript)
This handles communication with emergency services and SMS.
```bash
cd services/api
npm run dev
```

#### Terminal 3: Start the Mobile App (React Native/Expo)
This is the actual app UI. We use custom native modules for Android (for silent SMS and calling), so the commands differ based on your device.

**For iOS (using Expo Go):**
```bash
cd apps/mobile
npm start -- -c
```

**For Android (Native Development Build):**
Because this app uses custom native Android code for background calling and silent SMS, it cannot run in the standard Expo Go app. You must build it natively onto your phone.

1. **Enable Developer Options on your phone**:
   - Go to **Settings** > **About Phone**.
   - Tap on **Build Number** 7 times (until it says "You are now a developer").
2. **Enable USB Debugging**:
   - Go to **Settings** > **System** (or Additional Settings) > **Developer Options**.
   - Turn on **USB Debugging**.
3. **Connect your phone** to your computer via a USB cable.

Once connected, run this command to build and install the app:
```bash
cd apps/mobile
npx expo run:android
```
> **Note for Android:** This command will compile the custom native modules (`NativeSms`, `NativeCall`) and install the `.apk` directly on your phone. It may take 3-5 minutes the first time as it downloads Gradle dependencies.

### 5. Open the App on your Phone

**For iOS:**
1. Once **Terminal 3** finishes loading, it will display a large QR code.
2. Open the **Camera app** on your iPhone and scan the QR code.
3. The CrashGuard app will instantly build and launch in Expo Go!

**For Android:**
1. The `npx expo run:android` command will automatically launch the app on your connected phone once the build finishes.
2. If you see an Expo development server terminal, you can press `r` to reload the app.

---

## 📂 Repository Structure

```text
CrashGuard/
├── apps/
│   └── mobile/          # The React Native Expo App (UI & Core Logic)
├── services/
│   ├── api/             # Node.js backend for SOS/SMS dispatch
│   └── ml/              # Python FastAPI backend for Crash Detection
├── supabase/            # Database schemas and SQL configurations
└── packages/            # Shared code across the monorepo
```

---

## ⚠️ Hackathon Notes & Tips
- The app uses **Apple Maps** on iOS (which is 100% free) and **Google Maps** on Android (which is free for development inside Expo Go). No paid API keys are required for testing.
- Phone Authentication is currently set to use **Test Phone Numbers**. To log in, use the phone number `+919999999999` and the OTP `123456`.
- Shake your phone to test the simulated crash forces!

---
License: MIT
