# Apollo's Time — Copilot Instructions

## What is this?

Apollo's Time (TileForge) is a browser-based 2D turn-based 4X strategy game inspired by Civilization, Caesar, and Age of Empires. It uses **PixiJS v7** for rendering and deploys to **Azure App Service** with an optional Phi-3.5 LLM sidecar for AI diplomacy dialogue.

- **Live URL**: https://tileforge-game.azurewebsites.net (also apollostime.willeastbury.com)
- **GitHub**: https://github.com/WillEastbury/tileforge

## Running locally

```bash
cd /root/tileforge
node server.js
# Serves on http://localhost:8080
```

There is no build step — all JS is vanilla ES5/browser globals loaded via `<script>` tags in `index.html`. No bundler, no transpiler.

### Syntax-checking all JS files

```bash
for f in js/*.js; do node -c "$f"; done
```

### Running Playwright game tests

Playwright tests validate game functionality in a real browser. **Prefer running in CI (GitHub Actions), not locally** — they are resource-heavy and frequently crash local sessions.

```bash
# In CI (automatic via GitHub Actions on push to main)
# Locally (only if needed — will consume significant resources):
npx playwright test
```

Config: `playwright.config.js` — single worker, 60s timeout, 1024×768 viewport. The web server (`node server.js`) auto-starts via Playwright's `webServer` config.

## Architecture

### Module structure (all browser globals, no imports/exports)

| File | Object | Role | Lines |
|------|--------|------|-------|
| `js/data.js` | `TERRAINS`, `RESOURCES`, `TECHS`, `BUILDINGS`, `WONDERS`, `UNITS`, `CITY_STATES`, etc. | All game content as const arrays/objects | ~1060 |
| `js/engine.js` | `Game` | Core game state, turn processing, combat, city management, city-states, all 16 game systems | ~2570 |
| `js/renderer.js` | `Renderer` | PixiJS rendering, camera, minimap, city-state markers, click handling, animations | ~2230 |
| `js/ui.js` | `UI` | DOM-based panels, modals, tech tree, city panel, city-state panel, diplomacy, video/TTS | ~2340 |
| `js/ai.js` | `AI` | Computer player decision-making (city mgmt, military, diplomacy, city-states, research) | ~580 |
| `js/save.js` | `SaveManager` | localStorage save/load with Set→Array JSON serialization | ~70 |
| `js/main.js` | (top-level functions) | Entry point, wires UI actions to engine | ~130 |
| `server.js` | — | Node.js static file server + proxy to Phi LLM sidecar | ~70 |

**Load order matters** — `index.html` loads: data.js → engine.js → renderer.js → ai.js → save.js → ui.js → main.js. Each file depends on globals from earlier scripts.

### Spherical grid system

The map uses a **variable-width row** system simulating a sphere (equirectangular projection):
- `tiles_in_row = max(1, round(eqWidth × cos(latitude)))` — rows are narrower near poles
- East-west wrapping on every row; vertical clamping at poles
- Column remapping between rows of different widths for neighbor lookups: `target_c = round(c * target_width / source_width) % target_width`
- Terrain ID 17 (ocean) returned for out-of-bounds rows

### Rendering

- PixiJS v7 layered containers: terrain → roads → borders → resources → cities → units → highlights → fog
- **Each frame redraws only visible tiles** (frustum culling by row)
- Coast autotiling: 16 pre-generated `PIXI.RenderTexture` variants from 4-bit cardinal mask
- Fog of war: per-tile `fogState` array indexed by player ID (0=unexplored, 1=explored/dimmed, 2=visible)
- Tile size: 48px (`Renderer.tileSize`)
- Unit/combat animations use PIXI ticker; `Renderer.animating` blocks clicks during animation

### Combat formula

`Damage = 30 × e^(0.04 × (attackerStr - defenderStr)) × modifiers`

Modifiers: terrain defense bonus, fortification (+50%), city defense. Ranged units deal damage without counter-attack at range > 1.5 tiles.

### Save system

`SaveManager` uses localStorage with key `tileforge_save_${slotIndex}`. Sets are serialized as `{__set: Array.from(value)}` via JSON replacer/reviver.

## Key conventions

- **No module system** — everything is global objects (`Game`, `Renderer`, `UI`, `AI`, `SaveManager`) and const arrays (`TECHS`, `BUILDINGS`, etc.)
- **PixiJS MUST be v7** (pinned to v7.3.3 via CDN). v8 has breaking API changes (`new PIXI.Application({options})` vs v8's `Application.init()`)
- **UI pattern**: full-screen views use `UI.showScreen(id)` toggling `.active`; overlays/modals use `classList.add/remove('hidden')`
- **CSS specificity**: ID selectors can override `.overlay-panel.hidden { display: none }` — use `!important` when needed for hidden class
- **Data validation**: use `new Function()` wrapping to eval data.js in headless tests (strict mode + const prevents direct eval)
- **Content arrays in data.js** use consistent object shapes per category — match existing field patterns when adding content

## Deployment

### Azure App Service (production)

```bash
# Zip deploy (code-based, fastest)
cd /root/tileforge
rm -f /tmp/tileforge.zip
zip -r /tmp/tileforge.zip . -x ".git/*" "node_modules/*" "test-*" -q
az webapp deploy --name tileforge-game --resource-group tileforge-rg --src-path /tmp/tileforge.zip --type zip -o none

# Container deploy (with Phi sidecar)
az acr build --registry tileforgeacr --image tileforge-main:latest .
az webapp restart --name tileforge-game --resource-group tileforge-rg
```

- **Resource group**: tileforge-rg (UK South)
- **App Service plan**: tileforge-plan (P1V3)
- **ACR**: tileforgeacr.azurecr.io
- **Sidecar config**: sitecontainers.json (main on 8080 + phi on 8000)

### CI/CD — GitHub Actions

CI/CD runs via GitHub Actions (`.github/workflows/ci-deploy.yml`):
- On push to `main`: **Playwright game tests run on the GitHub Actions runner** (not locally — they are resource-heavy and crash local sessions), then auto-deploy to Azure
- The BitNet sidecar Docker image is built and pushed to ACR (`tileforgeacr`)
- Azure OIDC federated credential (`tileforge-deploy` app) handles auth
- GitHub repo secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`

```bash
cd /root/tileforge
git add -A && git commit -m "description" && git push
# CI runs tests + deploys automatically
```

### Asset Generation — Environment Variables

The following environment variables should be set in `~/.bashrc` (or exported manually) for asset generation scripts in `/source/ApollosTime/`:

- **`OPENAI_API_KEY`** — Required by `generate_unit_sprites.py` (DALL-E) and `generate_wonder_videos.py` (Sora)
- **`SUNO_API_KEY`** — Required by `generate_music.py` and `generate_leader_music.py`

These keys are **not** stored in the repo or in these instructions. If they're missing, ask the user to export them before running generation scripts.

Generation scripts:
- `generate_unit_sprites.py` — DALL-E pixel art sprites for units → `assets/units/{id}.png`
- `generate_wonder_videos.py` — Sora cinematic videos for wonders → `assets/video/wonders/{id}.mp4`
- `generate_music.py` — Suno background music → `assets/music/`
- `generate_leader_music.py` — Suno leader theme music → `assets/leaders/`

## Known issues / incomplete areas

- BitNet sidecar has been **removed** from production (was crashing and blocking app startup). The main app runs without it; AI diplomacy uses fallback responses.
- AI plays conservatively and may not use all 16 game systems effectively
- ~80% of the original design doc content is implemented; religion/faith has been deliberately removed from scope
- City-states (minor factions) are now implemented with influence/envoy system, 5 types (militaristic, cultural, scientific, trade, religious), AI interaction
- Video playback uses muted autoplay with unmute attempt (browser autoplay policy workaround)
- TTS/narration falls back to browser `speechSynthesis` when `OPENAI_API_KEY` is not set
- 95 Playwright tests cover all major game systems (civics, city-states, combat, trade, etc.)

## Session Recovery — READ THIS FIRST

**Sessions frequently crash on this device.** At the start of every new session, you MUST:

1. **Query the session store** for recent sessions in this folder:
   ```sql
   SELECT s.id, s.summary, s.created_at
   FROM sessions s
   WHERE s.cwd LIKE '%tileforge%'
   ORDER BY s.created_at DESC LIMIT 5;
   ```
2. **Pull checkpoint details** from the most recent session:
   ```sql
   SELECT checkpoint_number, title, overview, work_done, next_steps
   FROM checkpoints
   WHERE session_id = '<latest_session_id>'
   ORDER BY checkpoint_number DESC LIMIT 1;
   ```
3. **Check for outstanding todos** in the SQL database:
   ```sql
   SELECT id, title, status, description FROM todos WHERE status != 'done' ORDER BY status;
   ```
4. **Present a brief review** to the user summarizing:
   - What was being worked on in the last session
   - What's done vs still pending
   - Suggested next steps from the checkpoint
5. **Ask the user** what to pick up or work on next before diving in
