# Project Context: Two-Wheeler Crash Detection & Emergency Response App

## 1. What this app does

A mobile app for two-wheeler (motorcycle/scooter) riders in India that:

1. **Auto crash detection** — passively senses phone motion (accelerometer, gyroscope,
   barometer, GPS) while the user is riding. If a crash-like event is detected, the app
   sounds a loud alarm and starts a 20-second countdown. If not cancelled, it automatically
   calls the local emergency number, shares live location, and speaks a message describing
   the likely incident.
2. **Good Samaritan widget** — a home-screen widget any bystander can tap if they witness
   an accident (whether or not they have the app installed as a "user," this is for people
   nearby). It calls emergency services with the location, and optionally lets the bystander
   route a nearby hospital + share their own contact info.
3. **Cascading notification flow** — once an incident is confirmed: (1) call emergency
   services / ambulance first, (2) notify the injured person's emergency contacts with
   status + location, (3) if a Good Samaritan with a vehicle is helping, provide nearest
   hospital routing and pre-alert the hospital that patients are inbound.
4. **Multilingual voice interaction** — the spoken message to dispatchers/hospitals follows
   a locale → Hindi → English fallback chain based on detected location, not a hardcoded
   language.

**Target users:** primarily riders on mid-range Android devices (Oppo, Vivo, OnePlus, Redmi,
Realme, etc.) — explicitly NOT assuming premium hardware like iPhone/Pixel/Galaxy flagships,
since built-in OS-level crash detection (Apple, Google) is a premium-phone-only feature today.

---

## 2. Non-negotiable design principles

- **No LLM in the safety-critical decision loop.** Whether to trigger the alarm, whether to
  auto-dial emergency services — these must be deterministic, auditable logic (sensor
  thresholds + classifier output + countdown timer + user response), NOT an LLM judgment
  call. LLM/AI-agent components are used only downstream: composing spoken messages,
  translation, natural-language intake from bystanders, composing relative notifications.
- **False positives are the central risk.** Every design decision should bias toward
  minimizing false emergency calls (wasted dispatcher time, user distrust, potential
  blacklisting by emergency services) while not being so conservative that real crashes
  get missed. The 20-second cancellable countdown is the core safety valve — do not remove
  or shortcut it in any code path that leads to auto-dialing.
- **Personal calibration, not global thresholds.** Crash/anomaly detection should compare
  against a per-user (likely per-bike) baseline established during onboarding and refined
  over time, not a single hardcoded G-force threshold for all users.
- **Human-initiated flows ship before automatic ones.** The Good Samaritan widget has no
  ML dependency and much lower false-positive risk (a human deliberately chose to act) —
  build and validate the full calling/notification/hospital-alert pipeline through this
  flow BEFORE the automatic sensor-triggered flow goes anywhere near real emergency numbers.
- **Battery and background-sensing constraints are deferred, not ignored.** Per explicit
  product decision, get the app working first; OEM background-kill workarounds
  (MIUI/ColorOS/FuntouchOS/OxygenOS aggressive battery optimization) are a known later
  phase, not a blocker for early builds.
- **Duplicate triggers are a non-issue.** If two riders' phones both trigger for the same
  collision, do not build complex dedup logic — backend can pick whichever signal is
  stronger, and even if emergency services receive two calls for the same location, they
  naturally resolve this to one dispatch. Don't over-engineer this.
- **Regulatory reality on auto-dialing is unresolved and must be researched before any
  auto-call code goes near a real emergency number.** In most jurisdictions, silently
  auto-dialing emergency services from a third-party app is restricted — this needs
  concrete legal/telecom research (India ERSS/112 specifically) before Phase 3 (below)
  is built against real numbers. Build and test against mock/sandboxed endpoints until
  that's resolved.

---

## 3. Suggested build order (phases)

**Phase 0 — Data logging pipeline (start immediately, longest lead time)**
Passive sensor logging (accelerometer, gyroscope, GPS speed, barometer) from beta riders
during normal riding, no crash needed. This produces the negative-class dataset (potholes,
speed bumps, hard braking, phone drops, rough roads) that the false-positive-reduction work
depends on. Store raw windowed sensor sequences with metadata (phone model, mount position,
road type if known).

**Phase 1 — Good Samaritan widget (human-triggered, ship first)**
- Home-screen widget → tap → confirmation screen ("you are about to share your name/number
  and location with emergency services — proceed?") → call emergency number with location →
  optionally: route to nearest hospital + pre-alert hospital + notify injured person's
  emergency contacts if identifiable.
- This validates the entire downstream calling/notification/routing pipeline without
  needing any working ML model.

**Phase 2 — Personal calibration + Stage 1 anomaly detection**
- Onboarding flow: capture phone mount position, run/passively build a short calibration
  baseline of this user's normal riding vibration signature.
- Stage 1: lightweight, always-on anomaly detector — rolling comparison against personal
  baseline (start with a statistical/rolling z-score approach, not deep learning). Runs
  continuously while riding; cheap enough for background execution.
- At this stage, an anomaly should surface an in-app alert/log, NOT trigger any call —
  this phase is about validating detection quality against Phase 0 data before it's
  connected to anything user-facing beyond a notification.

**Phase 3 — Stage 2 classification + countdown + auto-call (only after legal research resolved)**
- Stage 2: heavier classifier (gradient-boosted trees on engineered features, or compact
  CNN/LSTM on raw windowed sequences) that only runs when Stage 1 fires. Classifies
  crash vs. drop/pothole/hard-braking.
- On positive classification: loud distinct alarm + 20-second cancellable countdown
  (screen tap AND voice-based cancel, since phone may be out of reach post-crash).
- Cancel flow: prompt user for cancel reason (drop / rough road / false trigger /
  I'm fine / other) — this labeled feedback feeds Phase 4.
- No response after countdown → auto-call flow: emergency number first, then emergency
  contacts, with the multilingual spoken message (see Section 5).

**Phase 4 — Feedback loop / model retraining**
- Every trigger (cancelled, confirmed, or auto-called) logged with full sensor window +
  cancel reason if applicable.
- Batch retraining (human-reviewed, NOT live online learning — safety-critical triggers
  need an auditable train → validate → deploy cycle).
- Shadow mode: new model versions run in parallel on real traffic without triggering
  anything, compared against production model + confirmed outcomes before promotion.

---

## 4. Key features to build, by module

### 4.1 Sensor pipeline
- Accelerometer (3-axis), gyroscope (3-axis), barometer, GPS — background collection
  while "riding mode" is active (not all-the-time; scope detection to driving state,
  similar to how Apple/Google scope their equivalent features).
- Feature extraction: peak acceleration magnitude + jerk, sudden deceleration
  (GPS-derived speed change fused with accelerometer), orientation change/rotation rate
  spike, post-event stillness vs. erratic motion pattern, barometric pressure delta.
- Windowed sequence storage (not raw continuous dump) for both real-time inference and
  later labeled dataset construction.

### 4.2 Personal calibration
- Per-user (evaluate: per-bike may matter more than per-person — vibration is largely a
  function of vehicle/road/mount, this is a testable assumption once real data exists)
  baseline of normal riding sensor distribution, established at onboarding and refined
  over time.

### 4.3 Alarm / countdown UI
- Loud, distinct sound (must be audible even if phone is in pocket/bag) — should be
  clearly distinguishable from a normal notification sound.
- 20-second countdown, dual cancel path: screen tap AND voice command (rider may be
  unconscious or phone knocked out of reach).
- Cancel reason capture (multi-select or single-select): drop / rough road / false
  trigger / I'm fine / other.

### 4.4 Calling & orchestration engine
- State machine (deterministic, auditable) driving: detection → countdown → cancel-or-call
  → emergency call → emergency contact notification → (optional) hospital pre-alert.
- LLM-backed components (downstream of the state machine's decisions, not making the
  decisions themselves):
  - Composes the spoken message to dispatcher (location, likely severity signals,
    number of probable occupants if inferable).
  - Translation/localization for the spoken message: locale-detected local language →
    Hindi → English fallback chain (not hardcoded to Hindi as default second language).
  - Handles natural-language intake from Good Samaritan bystanders (e.g., free-text/voice
    description of what they're seeing) and extracts structured severity/location info.
  - Composes the message to emergency contacts (informative, not panic-inducing).
- Fallback chain for emergency contacts: contact 1 → contact 2 → SMS with location link
  if no one picks up. Do not stop at a single missed call.

### 4.5 Good Samaritan widget
- Tap → confirmation/consent screen before sharing bystander's name/number with emergency
  services → call placed with location → optional hospital routing + pre-alert if
  bystander indicates they're transporting the injured person themselves.

### 4.6 Hospital pre-alert
- Requires a data-sharing integration/API with partner hospitals (not just an automated
  phone call) to be a real system rather than "a recorded message at reception" — treat
  this as its own integration workstream, likely later-phase / partnership-dependent.

---

## 5. Multilingual voice flow

Priority chain for the spoken emergency message: **local state/regional language (based on
detected GPS location) → Hindi → English**. This is NOT hardcoded to always use Hindi as the
second language — e.g., in Tamil Nadu the chain should be Tamil → Hindi → English, since a
dispatcher there may not speak Hindi either. Location-to-language mapping should be a
configurable table, not inferred ad hoc.

---

## 6. Explicit non-goals / deferred items (do not build yet)

- Blinkit or any third-party paid ambulance-service integration — deferred, revisit later.
  If/when revisited: treat as a pluggable regional partner (not a hard dependency, since
  such services are often city-limited), and default to public emergency numbers (112/108)
  for the actual emergency call, with paid/private options offered as a parallel/fallback
  choice rather than the default path (an unconscious rider can't consent to a paid service).
- Battery optimization / OEM background-kill workarounds (MIUI, ColorOS, FuntouchOS,
  OxygenOS) — known future work, not a blocker for early builds.
- Any actual auto-dial code path connected to a real emergency number — must wait on
  regulatory/telecom research (India ERSS/112 specifically). Build against mocked/sandboxed
  endpoints until this is resolved.
- Live/online model retraining — batch, human-reviewed retraining only.
- Complex multi-phone duplicate-trigger dedup logic — not needed, per product decision.

---

## 7. Open questions to revisit (not blocking current build, but noted)

- Per-bike vs. per-person calibration baseline — needs real sensor data to resolve.
- Whether Stage 1 anomaly detection should eventually move from statistical/rolling
  z-score to a learned lightweight on-device model, once enough data volume exists.
- Companion wearable consideration for cases where the phone itself is destroyed/thrown
  clear in a crash (more relevant for two-wheelers than cars).
- Data retention and consent policy for continuous motion/location (and optionally audio)
  sensing — needs a clear, simple user-facing policy before wider rollout.
