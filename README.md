# FRC REBUILT Timer

An unofficial FRC match practice timer with scoreboard, audio visualizer, and music player. Built for players by players.

## Setup

To import match songs, click the music note button (bottom-right) -> open the admin panel (gear icon) -> click "Import MP3" in the Match Songs card.

## Timer Phases

| Phase | Duration | Color | Description |
|---|---|---|---|
| READY | — | Amber | Waiting to start. Displays "AUTO START", 0:20 shown. |
| AUTO | 20s | Amber | Autonomous period. Both alliances can score. |
| TRANSITION | 10s | Blue | Pause between Auto and Teleop. Both can score. |
| TELEOP | 130s | Shift colors | Teleoperated period subdivided into 5 shifts (see below). |
| FINISHED | — | Black | Match over. 2-second post-match scoring window, then end screen. |

### Teleop Shifts

| Time Remaining | Shift | Scoring Allowed | Color |
|---|---|---|---|
| 130s – 105s | Shift 1 | Blue only | Blue |
| 105s – 80s | Shift 2 | Red only | Red |
| 80s – 55s | Shift 3 | Blue only | Blue |
| 55s – 30s | Shift 4 | Red only | Red |
| 30s – 0s | Endgame | Both | Gold (pulse) |

During Endgame, the timer pulses red and a warning sound plays.

## Controls

| Button | Action |
|---|---|
| Start Match / Pause / Resume | Starts, pauses, or resumes the match timer |
| Reset Match | Ends the match and returns to READY state |
| Alliance Switch (↔) | Swaps which alliance's score/name is shown on the scoreboard |
| Music Note (bottom-right) | Opens the music player |
| High Score badge | Click to reset high score (with confirmation) |

### Inline Editing

Click any of these to edit (Enter saves, Escape cancels):

- **Match name** (top banner center)
- **Match number / total** (e.g. "Match 1 of 5" — click the number)
- **Alliance name** (e.g. "EVW Mystery Machine")
- **Team number** (auto-fetches team name + avatar from The Blue Alliance)

### Keyboard

| Key | Action |
|---|---|
| **Spacebar** | Add 1 point to the active alliance |

## Scoring

- Scores are tracked per alliance with animated digit roll effects.
- Scoring permissions change per shift (blue-only, red-only, or both).
- A score history is recorded every 5 seconds during the match.
- After the match, an end screen shows a score-over-time graph and a shift-by-shift breakdown.
- The high score is saved and displayed globally.

## Audio

### Event Sounds

| Sound | When it plays |
|---|---|
| Start | Match begins (READY → AUTO) |
| Resume | AUTO → TRANSITION (after brief pause) |
| Shift Change | Each shift boundary, also TRANSITION → TELEOP |
| Warning | Entering Endgame (30s remaining) |
| End | AUTO finishes, TELEOP finishes (match end) |

Event sounds duck the match music to 15% volume while playing.

### Match Music

- Import MP3 files via the Match Songs card in the admin panel.
- Songs shuffle automatically at match start and advance through the playlist.
- Music fades out over 2 seconds when the match ends.

### Music Player

- Import entire folders of songs.
- Two display modes: compact (mini bar) and full (expanded with playlist).
- Audio visualizer colors: light blue when playing from the music player, alliance color during match songs.
- Playlist is paginated (14 songs per page).

## Audio Visualizer

Renders frequency-reactive bars and particles on the background canvas. Uses Web Audio API's AnalyserNode when available, with a manual FFT fallback for `file://` protocol. Supports three color themes:

- **Music player:** Soft blue tones
- **Blue alliance:** Deep blue
- **Red alliance:** Dark red

## Modes

Add these classes to `<body>` for streaming/recording:

- `mode-transparent` — Transparent background (hides arena, for OBS overlays)
- `mode-chromakey` — Bright green background (for green screen compositing)

## Settings

All settings are saved to `localStorage` under key `frc-scoreboard-settings`:

- Match name, match number, total matches
- Alliance name and team number
- Active alliance (blue/red)
- High score
- TBA API key

Songs are stored in IndexedDB (`FRCTimerMusic`, v2) in two stores: `songs` (music player) and `matchSongs` (match playlist).

## File Structure

```
index.html          — Main HTML (scoreboard, admin panel, music player)
style.css           — All styles and animations
script.js           — All logic (timer, scoring, audio, visualizer)
server.js           — Optional local dev server (run: node server.js)
FRC-Logo.png        — FIRST Robotics logo
frc-*.mp3           — Event sound effects
SONGS/              — Built-in match background music (14 tracks)
Music Synthwave Bar Thingy/  — Standalone retro synthwave music player (reference)
```
