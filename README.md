# 🏍️ CrashGuard

> Two-Wheeler Crash Detection & Emergency Response App for Indian Riders

CrashGuard is a mobile app that passively detects motorcycle/scooter crashes using phone sensors (accelerometer, gyroscope, barometer, GPS) and automatically triggers a cascading emergency response — alerting emergency services, notifying family, and routing the nearest hospital.

---

## Repository Structure

```
crashguard/
├── apps/
│   ├── mobile/          # React Native (Expo) — main rider app
│   └── web/             # Next.js — public incident tracking page
├── services/
│   ├── api/             # Node.js + Fastify — backend REST API
│   └── ml/              # Python + FastAPI — anomaly detection service
├── packages/
│   ├── types/           # Shared TypeScript types/interfaces
│   ├── constants/       # Shared constants (thresholds, language maps)
│   └── utils/           # Shared utility functions
├── supabase/
│   └── migrations/      # PostgreSQL schema migrations
├── turbo.json
└── package.json
```

---

## Quick Start

### Prerequisites
- Node.js >= 20
- Python >= 3.11
- Expo CLI (`npm install -g expo`)
- Supabase CLI (`npm install -g supabase`)

### Install dependencies
```bash
npm install
```

### Set up environment variables
```bash
cp apps/mobile/.env.example apps/mobile/.env
cp services/api/.env.example services/api/.env
cp services/ml/.env.example services/ml/.env
```

### Run everything (dev)
```bash
# Run all services in parallel
npm run dev

# Or run individually:
npm run mobile    # Expo dev server
npm run api       # Node.js API server
```

---

## Build Phases

| Phase | Status | Description |
|---|---|---|
| Phase 0 | 🔄 In Progress | Data logging pipeline |
| Phase 1 | ⏳ Next | Good Samaritan widget |
| Phase 2 | 📅 Planned | Personal calibration + anomaly detection |
| Phase 3 | 🔒 Blocked | Auto-call (awaiting legal research on India ERSS/112) |
| Phase 4 | 📅 Planned | Feedback loop + model retraining |

---

## Key Design Principles

- **No LLM in the crash-detection decision path** — sensor thresholds + classifier only
- **False positives are the primary risk** — 20-second cancellable countdown is sacred
- **Good Samaritan ships before auto-detection** — validates the pipeline safely
- **Per-user calibration** — not global G-force thresholds
- **Auto-dial uses mocked endpoints** — real 112 requires regulatory clearance

---

## Tech Stack

- **Mobile**: React Native (Expo), TypeScript, Expo Router, Zustand
- **Backend**: Node.js, Fastify, TypeScript, Supabase
- **ML**: Python, FastAPI, NumPy, SciPy
- **Database**: Supabase (PostgreSQL + Realtime)
- **AI/LLM**: Google Gemini API (message composition only)
- **Maps**: Google Maps API, Google Places API
- **SMS**: Twilio / MSG91

---

## License

MIT
