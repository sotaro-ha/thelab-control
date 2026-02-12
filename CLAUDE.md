# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Interactive exhibit web app where visitors control a robot via body tracking. MediaPipe Pose detects body landmarks in the browser, sends data over WebSocket to a Node.js backend, which translates it to UDP servo commands for physical robots using the QubiLink protocol.

The UI is in Japanese with furigana (ruby annotations) for children.

## Commands

```bash
# Install dependencies (both frontend and server)
npm install && npm --prefix server install

# Start both frontend + backend concurrently
npm start

# Frontend only (Vite dev server on port 3000)
npm run dev

# Backend only (Express + WebSocket on port 3001)
npm --prefix server start

# Backend with auto-reload
npm --prefix server run dev

# Production build
npm run build
```

No test runner or linter is configured.

## Architecture

### Two-process system

- **Frontend** (`src/`): React 18 + Vite SPA with React Router
- **Backend** (`server/server.js`): Single-file Express + WebSocket + UDP server

Both run concurrently via `concurrently` when using `npm start`.

### Data flow

```
Camera -> MediaPipe Pose (browser) -> WebSocket -> server.js -> UDP -> Robot servo
```

### Routes (React Router)

| Path       | Component   | Purpose |
|------------|-------------|---------|
| `/`        | Home        | Landing page with start button |
| `/panel`   | Panel       | Visitor-facing step-by-step guide (portrait display) with voice feedback via Web Speech API |
| `/control` | Control     | Staff-facing control dashboard with slideshow and step management |
| `/motion`  | Motion      | Camera + MediaPipe pose tracking + WebSocket data transmission |

### Experience state machine

The exhibit follows a guided flow managed by server-side `experienceState`, broadcast to all WebSocket clients:

`explain` -> `capture_min` -> `capture_max` -> `robot` -> `feedback`

- **Panel** and **Control** pages both sync to this state via WebSocket `experience_update` / `experience_state` messages
- **Motion** page receives the state to enable/disable robot control and trigger calibration countdowns
- State patches are applied in `server.js:applyExperiencePatch()`

### Calibration system

`RobotWebSocket` class (`src/utils/websocket.js`) handles calibration:
- Measures hand-to-body-center distance at "contracted" (min) and "expanded" (max) poses
- After calibration, sends normalized 0-1 actuator values instead of raw landmarks
- Calibration data persists in `localStorage`
- Pre-calibration: sends `type: "pose"` with raw landmarks; post-calibration: sends `type: "actuator"` with normalized values

### WebSocket message types

| Type | Direction | Purpose |
|------|-----------|---------|
| `pose` | client->server | Raw MediaPipe landmarks (pre-calibration) |
| `actuator` | client->server | Normalized actuator values (post-calibration) |
| `experience_update` | client->server | State patches from Panel/Control |
| `experience_capture` | client->server | Calibration capture result |
| `experience_state` | server->client | Broadcast current experience state |
| `devices` | server->client | List of discovered QubiLink devices |

### Network ports

- **3000** (TCP): Vite dev server
- **3001** (TCP): Express HTTP + WebSocket
- **12340** (UDP): QubiLink device discovery (broadcast)
- **12345** (UDP): QubiLink servo control commands (unicast)

### Key files

- `server/server.js` — Entire backend: Express API, WebSocket, UDP discovery/control, experience state
- `src/utils/websocket.js` — `RobotWebSocket` class: calibration logic, WebSocket client, pose-to-actuator conversion
- `src/utils/wsUrl.js` — WebSocket URL resolver (uses current hostname + port 3001)
- `src/components/Ruby.jsx` — Furigana wrapper component used throughout UI

### Server REST API

- `GET /health` — Server status + device count
- `GET /api/devices` — Discovered QubiLink devices
- `POST /api/discover` — Trigger manual discovery broadcast
- `POST /api/command/:deviceId` — Send servo angle (0-180) to specific device
- `POST /api/feedback` — Store visitor feedback (currently logs only)

### App-level behaviors

- Triple-click toggles fullscreen (for kiosk use)
- Escape key toggles fullscreen
- 2-minute idle timer navigates back to `/` (disabled on main pages)
