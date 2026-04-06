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

### Running browser tests

```bash
npx playwright test test-browser.mjs
```

## Architecture

### Module structure (all browser globals, no imports/exports)

| File | Object | Role | Lines |
|------|--------|------|-------|
| `js/data.js` | `TERRAINS`, `RESOURCES`, `TECHS`, `BUILDINGS`, `WONDERS`, `UNITS`, etc. | All game content as const arrays/objects | ~650 |
| `js/engine.js` | `Game` | Core game state, turn processing, combat, city management, all 16 game systems | ~2100 |
| `js/renderer.js` | `Renderer` | PixiJS rendering, camera, minimap, click handling, animations | ~2100 |
| `js/ui.js` | `UI` | DOM-based panels, modals, tech tree, city panel, diplomacy, notifications | ~1670 |
| `js/ai.js` | `AI` | Computer player decision-making (city mgmt, military, diplomacy, research) | ~510 |
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

### Git workflow

Single `main` branch, push directly. No CI pipeline — deploy manually.

```bash
cd /root/tileforge
git add -A && git commit -m "description" && git push
```

## Known issues / incomplete areas

- Container startup sometimes shows "StartupInterruption" — may need to fall back to zip deploy
- Game has limited real-browser testing; most validation was headless via Node.js VM
- AI plays conservatively and may not use all 16 game systems effectively
- ~65% of the original design doc content is implemented (missing: minor factions spawning, religion player choice UI, full map camera wrapping, governments/civics)
