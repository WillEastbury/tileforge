// Apollo's Time — PixiJS Map Renderer
"use strict";

const Renderer = {
  app: null,
  mapContainer: null,
  tileSize: 32,
  camera: {x: 0, y: 0, zoom: 1},
  isDragging: false,
  dragStart: {x: 0, y: 0},
  lastMouse: {x: 0, y: 0},
  tileSprites: [],
  unitSprites: [],
  citySprites: [],
  overlaySprites: [],
  fogSprites: [],
  highlightSprites: [],
  terrainTextures: [],
  terrainFogTextures: [],
  initialized: false,
  animations: [],
  animating: false,
  animatingUnitId: null,

  init() {
    const container = document.getElementById('map-container');
    const rect = container.getBoundingClientRect();

    this.app = new PIXI.Application({
      width: rect.width,
      height: rect.height,
      backgroundColor: 0x0a0a2e,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    container.appendChild(this.app.view);

    this.mapContainer = new PIXI.Container();
    this.app.stage.addChild(this.mapContainer);

    // Layers
    this.terrainLayer = new PIXI.Container();
    this.resourceLayer = new PIXI.Container();
    this.roadLayer = new PIXI.Container();
    this.cityLayer = new PIXI.Container();
    this.unitLayer = new PIXI.Container();
    this.fogLayer = new PIXI.Container();
    this.highlightLayer = new PIXI.Container();
    this.borderLayer = new PIXI.Container();

    this.mapContainer.addChild(this.terrainLayer);
    this.mapContainer.addChild(this.roadLayer);
    this.mapContainer.addChild(this.borderLayer);
    this.mapContainer.addChild(this.resourceLayer);
    this.mapContainer.addChild(this.cityLayer);
    this.mapContainer.addChild(this.unitLayer);
    this.mapContainer.addChild(this.highlightLayer);
    this.mapContainer.addChild(this.fogLayer);

    this.generateTerrainTextures();
    this.setupInteraction(container);
    this.initialized = true;

    window.addEventListener('resize', () => {
      const r = container.getBoundingClientRect();
      this.app.renderer.resize(r.width, r.height);
      this.render();
    });
  },

  generateTerrainTextures() {
    const ts = this.tileSize;
    const renderer = this.app.renderer;

    const rr = (c) => (c >> 16) & 0xFF;
    const gg = (c) => (c >> 8) & 0xFF;
    const bb = (c) => c & 0xFF;
    const rgb = (r, g, b) => ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
    const mix = (c1, c2, t) => rgb(
      Math.round(rr(c1) + (rr(c2) - rr(c1)) * t),
      Math.round(gg(c1) + (gg(c2) - gg(c1)) * t),
      Math.round(bb(c1) + (bb(c2) - bb(c1)) * t)
    );
    // Seeded pseudo-random for deterministic textures
    const seed = (s) => { let v = s; return () => { v = (v * 1664525 + 1013904223) & 0xFFFFFFFF; return (v >>> 0) / 4294967296; }; };

    for (let id = 0; id < 20; id++) {
      const terrain = TERRAINS[id];
      const base = terrain.color;
      const g = new PIXI.Graphics();
      const rng = seed(id * 9973 + 7);

      // Fill base color
      g.beginFill(base);
      g.drawRect(0, 0, ts, ts);
      g.endFill();

      switch (id) {
        case 0: { // Ice Sheet — crack lines + speckles
          const lighter = mix(base, 0xFFFFFF, 0.3);
          for (let i = 0; i < 3; i++) {
            g.lineStyle(1, mix(0x6688CC, base, 0.4), 0.6);
            const sx = rng() * ts, sy = rng() * ts;
            g.moveTo(sx, sy);
            g.lineTo(sx + (rng() - 0.5) * 20, sy + (rng() - 0.5) * 20);
            g.lineTo(sx + (rng() - 0.5) * 24, sy + (rng() - 0.5) * 24);
          }
          g.lineStyle(0);
          for (let i = 0; i < 12; i++) {
            g.beginFill(lighter, 0.5);
            g.drawCircle(rng() * ts, rng() * ts, 1);
            g.endFill();
          }
          break;
        }
        case 1: { // Tundra — lichen dot clusters
          for (let i = 0; i < 6; i++) {
            const cx = rng() * ts, cy = rng() * ts;
            const clr = rng() > 0.5 ? 0x6B5B3A : 0x7A9A60;
            for (let j = 0; j < 3; j++) {
              g.beginFill(clr, 0.7);
              g.drawCircle(cx + (rng() - 0.5) * 5, cy + (rng() - 0.5) * 5, 1);
              g.endFill();
            }
          }
          break;
        }
        case 2: { // Taiga — triangle trees
          const dark = mix(base, 0x001000, 0.3);
          for (let i = 0; i < 4; i++) {
            const tx = 4 + rng() * (ts - 8), ty = 6 + rng() * (ts - 10);
            g.beginFill(dark, 0.8);
            g.moveTo(tx, ty - 5);
            g.lineTo(tx - 3, ty + 3);
            g.lineTo(tx + 3, ty + 3);
            g.closePath();
            g.endFill();
            g.beginFill(0x3A2010, 0.8);
            g.drawRect(tx - 0.5, ty + 3, 1, 2);
            g.endFill();
          }
          break;
        }
        case 3: { // Frozen Coast — ice chunks + water
          for (let i = 0; i < 3; i++) {
            g.beginFill(0xD0E8F8, 0.6);
            const cx = rng() * ts, cy = rng() * ts;
            g.drawPolygon([cx, cy - 3, cx - 4, cy + 2, cx + 4, cy + 2]);
            g.endFill();
          }
          for (let i = 0; i < 4; i++) {
            g.beginFill(0x5080B0, 0.3);
            g.drawEllipse(rng() * ts, rng() * ts, 3 + rng() * 3, 1.5);
            g.endFill();
          }
          break;
        }
        case 4: { // Grassland — grass line marks
          const darker = mix(base, 0x003300, 0.25);
          g.lineStyle(1, darker, 0.5);
          for (let i = 0; i < 14; i++) {
            const gx = rng() * ts, gy = rng() * ts;
            g.moveTo(gx, gy);
            g.lineTo(gx + (rng() - 0.5) * 2, gy - 3 - rng() * 2);
          }
          g.lineStyle(0);
          break;
        }
        case 5: { // Plains — wheat stalks
          const stalkClr = mix(base, 0x806020, 0.3);
          g.lineStyle(1, stalkClr, 0.6);
          for (let i = 0; i < 8; i++) {
            const sx = rng() * ts, sy = 8 + rng() * (ts - 12);
            g.moveTo(sx, sy + 4);
            g.lineTo(sx, sy - 3);
            g.lineStyle(0);
            g.beginFill(mix(stalkClr, 0xCCBB44, 0.5), 0.7);
            g.drawEllipse(sx, sy - 4, 1.5, 2);
            g.endFill();
            g.lineStyle(1, stalkClr, 0.6);
          }
          g.lineStyle(0);
          break;
        }
        case 6: { // Forest — tree canopy circles
          for (let i = 0; i < 3; i++) {
            const cx = 6 + rng() * (ts - 12), cy = 6 + rng() * (ts - 12);
            const rad = 4 + rng() * 2;
            g.beginFill(mix(base, 0x002200, 0.3), 0.8);
            g.drawCircle(cx, cy, rad);
            g.endFill();
            g.beginFill(mix(base, 0x88FF88, 0.25), 0.5);
            g.drawCircle(cx - 1, cy - 1, rad * 0.5);
            g.endFill();
          }
          break;
        }
        case 7: { // Hills — contour lines
          g.lineStyle(1, mix(base, 0x000000, 0.2), 0.4);
          for (let i = 0; i < 3; i++) {
            const cy = 6 + i * 9;
            g.moveTo(2, cy + 4);
            g.quadraticCurveTo(ts * 0.3, cy - 2, ts * 0.5, cy + 2);
            g.quadraticCurveTo(ts * 0.7, cy + 6, ts - 2, cy);
          }
          g.lineStyle(0);
          break;
        }
        case 8: { // Mountains — white-tipped peaks
          for (let i = 0; i < 2; i++) {
            const mx = 6 + rng() * (ts - 12), my = ts - 4;
            const peak = 4 + rng() * 4;
            g.beginFill(mix(base, 0x444455, 0.2), 0.9);
            g.moveTo(mx, my - peak * 2.5);
            g.lineTo(mx - 7, my);
            g.lineTo(mx + 7, my);
            g.closePath();
            g.endFill();
            // Snow cap
            g.beginFill(0xF0F0FF, 0.85);
            g.moveTo(mx, my - peak * 2.5);
            g.lineTo(mx - 2.5, my - peak * 1.5);
            g.lineTo(mx + 2.5, my - peak * 1.5);
            g.closePath();
            g.endFill();
          }
          break;
        }
        case 9: { // Wetland — wavy water lines + reeds
          g.lineStyle(1, 0x3A6A8A, 0.4);
          for (let i = 0; i < 3; i++) {
            const wy = 6 + i * 9;
            g.moveTo(0, wy);
            for (let x = 0; x <= ts; x += 4) {
              g.lineTo(x, wy + Math.sin(x * 0.4 + i) * 2);
            }
          }
          g.lineStyle(1, 0x5A7040, 0.7);
          for (let i = 0; i < 4; i++) {
            const rx = rng() * ts, ry = rng() * ts;
            g.moveTo(rx, ry);
            g.lineTo(rx, ry - 5);
          }
          g.lineStyle(0);
          break;
        }
        case 10: { // Desert — dune curves
          g.lineStyle(1, mix(base, 0xFFEEAA, 0.3), 0.4);
          for (let i = 0; i < 3; i++) {
            const dy = 5 + i * 10;
            g.moveTo(0, dy);
            g.quadraticCurveTo(ts * 0.25, dy - 4, ts * 0.5, dy);
            g.quadraticCurveTo(ts * 0.75, dy + 4, ts, dy);
          }
          g.lineStyle(0);
          break;
        }
        case 11: { // Savanna — acacia tree silhouette
          const trunk = 0x6A5030;
          const canopy = mix(base, 0x556020, 0.3);
          const tx = ts * 0.5, ty = ts * 0.65;
          g.beginFill(trunk, 0.8);
          g.drawRect(tx - 1, ty, 2, ts * 0.3);
          g.endFill();
          g.beginFill(canopy, 0.7);
          g.drawEllipse(tx, ty - 1, 8, 3);
          g.endFill();
          break;
        }
        case 12: { // Mesa — horizontal stripe bands
          for (let i = 0; i < 5; i++) {
            const sy = i * 7;
            const stripe = i % 2 === 0 ? mix(base, 0xAA6622, 0.2) : mix(base, 0xFFBB77, 0.15);
            g.beginFill(stripe, 0.5);
            g.drawRect(0, sy, ts, 6);
            g.endFill();
          }
          break;
        }
        case 13: { // Oasis — sandy border, green circle, blue water
          g.beginFill(mix(base, 0xD4C088, 0.5), 0.4);
          g.drawRect(0, 0, ts, ts);
          g.endFill();
          g.beginFill(0x50A050, 0.7);
          g.drawCircle(ts / 2, ts / 2, 9);
          g.endFill();
          g.beginFill(0x3388CC, 0.8);
          g.drawCircle(ts / 2, ts / 2, 4);
          g.endFill();
          break;
        }
        case 14: { // Jungle — dense overlapping leaf/vine patterns
          for (let i = 0; i < 8; i++) {
            const lx = rng() * ts, ly = rng() * ts;
            g.beginFill(mix(base, rng() > 0.5 ? 0x003810 : 0x105020, 0.3), 0.6);
            g.drawEllipse(lx, ly, 3 + rng() * 3, 2 + rng() * 2);
            g.endFill();
          }
          g.lineStyle(1, 0x0A3A10, 0.3);
          for (let i = 0; i < 3; i++) {
            const vx = rng() * ts;
            g.moveTo(vx, 0);
            g.quadraticCurveTo(vx + (rng() - 0.5) * 10, ts * 0.5, vx + (rng() - 0.5) * 8, ts);
          }
          g.lineStyle(0);
          break;
        }
        case 15: { // Volcanic — orange/red glow spots
          for (let i = 0; i < 5; i++) {
            const lx = rng() * ts, ly = rng() * ts;
            const glowClr = rng() > 0.5 ? 0xCC4400 : 0xFF6600;
            g.beginFill(glowClr, 0.3 + rng() * 0.3);
            g.drawCircle(lx, ly, 2 + rng() * 2);
            g.endFill();
          }
          g.beginFill(0xFF3300, 0.15);
          g.drawCircle(ts * 0.5, ts * 0.5, 6);
          g.endFill();
          break;
        }
        case 16: { // Coast — subtle wave arcs
          g.lineStyle(1, mix(base, 0x88CCEE, 0.4), 0.35);
          for (let i = 0; i < 4; i++) {
            const wy = 4 + i * 8;
            g.moveTo(0, wy);
            g.quadraticCurveTo(ts * 0.25, wy - 3, ts * 0.5, wy);
            g.quadraticCurveTo(ts * 0.75, wy + 3, ts, wy);
          }
          g.lineStyle(0);
          break;
        }
        case 17: { // Ocean — darker wave patterns
          g.lineStyle(1, mix(base, 0x0A1A44, 0.3), 0.4);
          for (let i = 0; i < 4; i++) {
            const wy = 3 + i * 8;
            g.moveTo(0, wy);
            g.quadraticCurveTo(ts * 0.3, wy - 3, ts * 0.5, wy);
            g.quadraticCurveTo(ts * 0.7, wy + 3, ts, wy);
          }
          g.lineStyle(0);
          break;
        }
        case 18: { // Reef — coral blobs
          for (let i = 0; i < 5; i++) {
            const cx = 3 + rng() * (ts - 6), cy = 3 + rng() * (ts - 6);
            const clr = rng() > 0.5 ? 0xDD6688 : 0xDD8844;
            g.beginFill(clr, 0.6);
            g.drawCircle(cx, cy, 1.5 + rng() * 2);
            g.endFill();
          }
          break;
        }
        case 19: { // River Delta — branching blue river lines
          g.lineStyle(1, 0x3388BB, 0.6);
          const startX = ts * 0.5;
          g.moveTo(startX, 0);
          g.lineTo(startX, ts * 0.35);
          // Branches
          g.moveTo(startX, ts * 0.35);
          g.lineTo(startX - 8, ts * 0.7);
          g.lineTo(startX - 12, ts);
          g.moveTo(startX, ts * 0.35);
          g.lineTo(startX + 3, ts * 0.65);
          g.lineTo(startX + 10, ts);
          g.moveTo(startX + 3, ts * 0.65);
          g.lineTo(startX - 2, ts);
          g.lineStyle(0);
          break;
        }
      }

      // Render normal texture
      const rt = PIXI.RenderTexture.create({ width: ts, height: ts });
      renderer.render(g, { renderTexture: rt });
      this.terrainTextures[id] = rt;

      // Render fog-dimmed variant (multiply by 0.4)
      const fogG = new PIXI.Graphics();
      fogG.beginFill(base);
      fogG.drawRect(0, 0, ts, ts);
      fogG.endFill();

      // Redraw the same pattern but with dimmed colors via a dark overlay
      const fogRt = PIXI.RenderTexture.create({ width: ts, height: ts });
      renderer.render(g, { renderTexture: fogRt });
      // Apply darkening overlay
      const overlay = new PIXI.Graphics();
      overlay.beginFill(0x000000, 0.6);
      overlay.drawRect(0, 0, ts, ts);
      overlay.endFill();
      renderer.render(overlay, { renderTexture: fogRt, clear: false });
      this.terrainFogTextures[id] = fogRt;

      g.destroy(true);
      fogG.destroy(true);
      overlay.destroy(true);
    }
  },

  setupInteraction(container) {
    let pinchDist = 0;

    container.addEventListener('mousedown', e => {
      this.isDragging = true;
      this.dragStart = {x: e.clientX, y: e.clientY};
      this.lastMouse = {x: e.clientX, y: e.clientY};
    });

    container.addEventListener('mousemove', e => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.camera.x -= dx / this.camera.zoom;
      this.camera.y -= dy / this.camera.zoom;
      this.lastMouse = {x: e.clientX, y: e.clientY};
      this.render();
      this.updateMinimap();
    });

    container.addEventListener('mouseup', e => {
      const dx = Math.abs(e.clientX - this.dragStart.x);
      const dy = Math.abs(e.clientY - this.dragStart.y);
      if (dx < 5 && dy < 5) {
        this.handleClick(e);
      }
      this.isDragging = false;
    });

    container.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.camera.zoom = Math.max(0.3, Math.min(4, this.camera.zoom * factor));
      this.render();
      this.updateMinimap();
    }, {passive: false});

    // Touch support
    container.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.dragStart = {x: e.touches[0].clientX, y: e.touches[0].clientY};
        this.lastMouse = {x: e.touches[0].clientX, y: e.touches[0].clientY};
      } else if (e.touches.length === 2) {
        pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    });

    container.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 1 && this.isDragging) {
        const dx = e.touches[0].clientX - this.lastMouse.x;
        const dy = e.touches[0].clientY - this.lastMouse.y;
        this.camera.x -= dx / this.camera.zoom;
        this.camera.y -= dy / this.camera.zoom;
        this.lastMouse = {x: e.touches[0].clientX, y: e.touches[0].clientY};
        this.render();
      } else if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (pinchDist > 0) {
          this.camera.zoom = Math.max(0.3, Math.min(4, this.camera.zoom * (d / pinchDist)));
        }
        pinchDist = d;
        this.render();
      }
    }, {passive: false});

    container.addEventListener('touchend', e => {
      this.isDragging = false;
    });

    // Keyboard
    document.addEventListener('keydown', e => {
      if (e.code === 'Space') {
        e.preventDefault();
        Game.endTurn();
      } else if (e.code === 'KeyT') {
        UI.showTechTree();
      } else if (e.code === 'KeyE') {
        const ep = document.getElementById('encyclopedia-panel');
        if (ep && !ep.classList.contains('hidden')) {
          UI.closeEncyclopedia();
        } else {
          UI.showEncyclopedia();
        }
      } else if (e.code === 'Escape') {
        const ep = document.getElementById('encyclopedia-panel');
        if (ep && !ep.classList.contains('hidden')) {
          UI.closeEncyclopedia();
        }
      } else if (e.code === 'KeyF' && Game.selectedUnit) {
        Game.selectedUnit.fortified = true;
        Game.selectedUnit.movementLeft = 0;
        this.render();
        UI.updateRightPanel();
      }
    });
  },

  handleClick(e) {
    if (!Game.state || Game.state.gameOver) return;
    // Block clicks during animation
    if (this.animating) return;
    const container = document.getElementById('map-container');
    const rect = container.getBoundingClientRect();
    const mx = (e.clientX - rect.left);
    const my = (e.clientY - rect.top);

    // Convert screen coords to map coords
    const worldX = mx / this.camera.zoom + this.camera.x - this.app.screen.width / (2 * this.camera.zoom);
    const worldY = my / this.camera.zoom + this.camera.y - this.app.screen.height / (2 * this.camera.zoom);

    // Find which tile was clicked
    const eqWidth = Game.state.mapWidth;
    const ts = this.tileSize;
    const mapHeight = Game.state.mapHeight;

    // Row from Y
    const row = Math.floor(worldY / ts);
    if (row < 0 || row >= mapHeight) return;

    const rw = Game.rowWidths[row];
    const rowPixelWidth = rw * ts;
    const totalMapWidth = eqWidth * ts;
    const rowOffset = (totalMapWidth - rowPixelWidth) / 2;

    let colX = worldX - rowOffset;
    // Handle wrapping
    if (colX < 0) colX += rowPixelWidth;
    if (colX >= rowPixelWidth) colX -= rowPixelWidth;
    const col = Math.floor(colX / ts);
    if (col < 0 || col >= rw) return;

    const tile = Game.getTile(row, col);
    if (!tile) return;

    // Check fog
    if (tile.fogState[0] === 0) return;

    // If we have a selected unit with movement range, try to move
    if (Game.selectedUnit && Game.movementRange) {
      const key = row + ',' + col;
      if (Game.movementRange.has(key)) {
        const unit = Game.selectedUnit;
        const fromR = unit.r, fromC = unit.c;
        const mvLeft = Game.movementRange.get(key);

        // Combat case (mvLeft === -1 means attack)
        if (mvLeft < 0 && tile.unit && tile.unit.owner !== unit.owner) {
          const combatResult = Game.moveUnit(unit, row, col);
          Game.updateFogOfWar();
          this.animateCombat(unit, tile.unit, fromR, fromC, row, col, combatResult || {result:'ongoing'}, () => {
            if (unit.hp > 0 && unit.movementLeft > 0) {
              Game.movementRange = Game.getMovementRange(unit);
            } else {
              Game.movementRange = null;
            }
            this.render();
            this.updateMinimap();
            UI.updateTopBar();
            UI.updateRightPanel();
          });
          return;
        }

        // Normal move
        Game.moveUnit(unit, row, col);
        if (unit.movementLeft > 0 && unit.hp > 0) {
          Game.movementRange = Game.getMovementRange(unit);
        } else {
          Game.movementRange = null;
        }
        Game.updateFogOfWar();
        this.animateUnitMove(unit, fromR, fromC, row, col, 300, () => {
          this.render();
          this.updateMinimap();
          UI.updateTopBar();
          UI.updateRightPanel();
        });
        return;
      }
    }

    // Select unit
    if (tile.unit && tile.unit.owner === 0) {
      Game.selectedUnit = tile.unit;
      Game.selectedCity = null;
      Game.movementRange = Game.getMovementRange(tile.unit);
      this.render();
      UI.updateRightPanel();
      UI.updateActionButtons();
      return;
    }

    // Select city
    if (tile.cityId) {
      const city = Game.findCityById(tile.cityId);
      if (city && city.owner === 0) {
        Game.selectedCity = city;
        Game.selectedUnit = null;
        Game.movementRange = null;
        UI.showCityPanel(city);
        this.render();
        return;
      }
    }

    // Deselect and show tile info
    Game.selectedUnit = null;
    Game.selectedCity = null;
    Game.movementRange = null;
    this.render();
    UI.showTileInfo(tile);
  },

  // ========== RENDERING ==========

  render() {
    if (!this.initialized || !Game.state) return;

    this.terrainLayer.removeChildren();
    this.resourceLayer.removeChildren();
    this.cityLayer.removeChildren();
    this.unitLayer.removeChildren();
    this.fogLayer.removeChildren();
    this.highlightLayer.removeChildren();
    this.borderLayer.removeChildren();

    const ts = this.tileSize;
    const eqWidth = Game.state.mapWidth;
    const mapHeight = Game.state.mapHeight;
    const totalMapWidth = eqWidth * ts;
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const zoom = this.camera.zoom;

    // Determine visible area
    const viewLeft = this.camera.x - screenW / (2 * zoom);
    const viewRight = this.camera.x + screenW / (2 * zoom);
    const viewTop = this.camera.y - screenH / (2 * zoom);
    const viewBottom = this.camera.y + screenH / (2 * zoom);

    const minRow = Math.max(0, Math.floor(viewTop / ts) - 1);
    const maxRow = Math.min(mapHeight - 1, Math.ceil(viewBottom / ts) + 1);

    this.mapContainer.scale.set(zoom);
    this.mapContainer.position.set(
      screenW / 2 - this.camera.x * zoom,
      screenH / 2 - this.camera.y * zoom
    );

    for (let r = minRow; r <= maxRow; r++) {
      const rw = Game.rowWidths[r];
      const rowPixelWidth = rw * ts;
      const rowOffset = (totalMapWidth - rowPixelWidth) / 2;

      for (let c = 0; c < rw; c++) {
        const tile = Game.mapData[r][c];
        const px = rowOffset + c * ts;
        const py = r * ts;

        // Check if visible on screen (approximate)
        if (px + ts < viewLeft - ts * 2 || px > viewRight + ts * 2) continue;

        const fog = tile.fogState[0];
        if (fog === 0) continue; // Unexplored

        const terrain = TERRAINS[tile.terrain];

        // Terrain tile — use pre-generated textured sprites
        const tex = fog === 1 ? this.terrainFogTextures[tile.terrain] : this.terrainTextures[tile.terrain];
        const tileSprite = new PIXI.Sprite(tex);
        tileSprite.position.set(px, py);
        // Subtle per-tile variation via hash of (r, c)
        const hash = ((r * 7919 + c * 6271) & 0xFFFF) / 65535;
        const tintAmt = hash * 0.08;
        const tR = Math.round(255 + (((terrain.color >> 16) & 0xFF) - 255) * tintAmt);
        const tG = Math.round(255 + (((terrain.color >> 8) & 0xFF) - 255) * tintAmt);
        const tB = Math.round(255 + ((terrain.color & 0xFF) - 255) * tintAmt);
        tileSprite.tint = (tR << 16) | (tG << 8) | tB;
        tileSprite.rotation = (hash - 0.5) * 0.06;
        tileSprite.anchor.set(0.5);
        tileSprite.position.set(px + ts / 2, py + ts / 2);
        this.terrainLayer.addChild(tileSprite);

        // Territory border coloring
        if (tile.owner >= 0 && fog === 2) {
          const ownerColor = parseInt(CIV_COLORS[tile.owner].replace('#',''), 16);
          const borderGfx = new PIXI.Graphics();
          borderGfx.beginFill(ownerColor, 0.12);
          borderGfx.drawRect(px, py, ts - 1, ts - 1);
          borderGfx.endFill();
          this.borderLayer.addChild(borderGfx);
        }

        if (fog !== 2) continue; // Only show details for visible tiles

        // Resource icon
        if (tile.resource) {
          const resText = new PIXI.Text(this.getResourceIcon(tile.resource), {
            fontSize: 10, fill: 0xFFFFFF
          });
          resText.position.set(px + 1, py + 1);
          this.resourceLayer.addChild(resText);
        }

        // City
        if (tile.cityId) {
          const city = Game.findCityById(tile.cityId);
          if (city) {
            const tierInfo = CITY_TIERS[Game.getCityTier(city.population)];
            const ownerColor = parseInt(CIV_COLORS[city.owner].replace('#',''), 16);

            // City background
            const cityBg = new PIXI.Graphics();
            cityBg.beginFill(ownerColor, 0.6);
            cityBg.drawRoundedRect(px + 2, py + 2, ts - 5, ts - 5, 4);
            cityBg.endFill();
            cityBg.lineStyle(2, ownerColor);
            cityBg.drawRoundedRect(px + 2, py + 2, ts - 5, ts - 5, 4);
            this.cityLayer.addChild(cityBg);

            // City population number
            const popText = new PIXI.Text(city.population.toString(), {
              fontSize: 12, fill: 0xFFFFFF, fontWeight: 'bold'
            });
            popText.anchor.set(0.5);
            popText.position.set(px + ts / 2, py + ts / 2);
            this.cityLayer.addChild(popText);

            // City name label above
            const nameText = new PIXI.Text(city.name, {
              fontSize: 9, fill: 0xFFFFFF, fontWeight: 'bold',
              stroke: 0x000000, strokeThickness: 2
            });
            nameText.anchor.set(0.5, 1);
            nameText.position.set(px + ts / 2, py - 1);
            this.cityLayer.addChild(nameText);

            // HP bar if damaged
            if (city.hp < city.maxHp) {
              const hpPct = city.hp / city.maxHp;
              const hpBar = new PIXI.Graphics();
              hpBar.beginFill(0x333333);
              hpBar.drawRect(px + 2, py + ts - 4, ts - 5, 3);
              hpBar.endFill();
              hpBar.beginFill(hpPct > 0.5 ? 0x4caf50 : hpPct > 0.25 ? 0xff9800 : 0xe94560);
              hpBar.drawRect(px + 2, py + ts - 4, (ts - 5) * hpPct, 3);
              hpBar.endFill();
              this.cityLayer.addChild(hpBar);
            }
          }
        }

        // Unit
        if (tile.unit) {
          const unit = tile.unit;
          // Skip unit being animated — it has its own sprite
          if (this.animatingUnitId != null && unit.id === this.animatingUnitId) {
            // don't draw; animation sprite handles it
          } else {
          const uType = Game.getUnitType(unit);
          const ownerColor = parseInt(CIV_COLORS[unit.owner].replace('#',''), 16);

          // Don't draw units on city tiles if it's a different player's view tile
          // Just draw on all visible tiles
          const unitGfx = new PIXI.Graphics();

          if (uType.domain === 'sea') {
            // Naval: diamond shape
            unitGfx.beginFill(ownerColor, 0.85);
            unitGfx.moveTo(px + ts/2, py + 4);
            unitGfx.lineTo(px + ts - 4, py + ts/2);
            unitGfx.lineTo(px + ts/2, py + ts - 4);
            unitGfx.lineTo(px + 4, py + ts/2);
            unitGfx.closePath();
            unitGfx.endFill();
          } else if (uType.type === 'civilian' || uType.type === 'settler') {
            // Civilian: circle
            unitGfx.beginFill(ownerColor, 0.85);
            unitGfx.drawCircle(px + ts/2, py + ts/2, ts/3);
            unitGfx.endFill();
          } else {
            // Military: square with border
            unitGfx.lineStyle(2, ownerColor);
            unitGfx.beginFill(ownerColor, 0.7);
            unitGfx.drawRoundedRect(px + 5, py + 5, ts - 11, ts - 11, 3);
            unitGfx.endFill();
          }
          this.unitLayer.addChild(unitGfx);

          // Unit type icon
          const icon = this.getUnitIcon(uType);
          const unitText = new PIXI.Text(icon, {
            fontSize: 11, fill: 0xFFFFFF
          });
          unitText.anchor.set(0.5);
          unitText.position.set(px + ts/2, py + ts/2);
          this.unitLayer.addChild(unitText);

          // HP bar if damaged
          if (unit.hp < 100) {
            const hpPct = unit.hp / 100;
            const hpBar = new PIXI.Graphics();
            hpBar.beginFill(0x333333);
            hpBar.drawRect(px + 4, py + ts - 6, ts - 9, 3);
            hpBar.endFill();
            hpBar.beginFill(hpPct > 0.5 ? 0x4caf50 : hpPct > 0.25 ? 0xff9800 : 0xe94560);
            hpBar.drawRect(px + 4, py + ts - 6, (ts - 9) * hpPct, 3);
            hpBar.endFill();
            this.unitLayer.addChild(hpBar);
          }

          // Fortified indicator
          if (unit.fortified) {
            const fort = new PIXI.Text('🛡', {fontSize: 8});
            fort.position.set(px + ts - 12, py + 1);
            this.unitLayer.addChild(fort);
          }
          } // end else (not animating unit)
        }
      }
    }

    // Movement highlights
    if (Game.movementRange) {
      for (const [key, mvLeft] of Game.movementRange) {
        const [r, c] = key.split(',').map(Number);
        const rw = Game.rowWidths[r];
        const rowPixelWidth = rw * ts;
        const rowOffset = (totalMapWidth - rowPixelWidth) / 2;
        const px = rowOffset + c * ts;
        const py = r * ts;

        const hl = new PIXI.Graphics();
        if (mvLeft >= 0) {
          hl.beginFill(0x53a8b6, 0.3);
          hl.lineStyle(1, 0x53a8b6, 0.7);
        } else {
          // Attack highlight
          hl.beginFill(0xe94560, 0.3);
          hl.lineStyle(1, 0xe94560, 0.7);
        }
        hl.drawRect(px, py, ts - 1, ts - 1);
        hl.endFill();
        this.highlightLayer.addChild(hl);
      }
    }

    // Selected unit highlight
    if (Game.selectedUnit) {
      const u = Game.selectedUnit;
      const rw = Game.rowWidths[u.r];
      const rowPixelWidth = rw * ts;
      const rowOffset = (totalMapWidth - rowPixelWidth) / 2;
      const px = rowOffset + u.c * ts;
      const py = u.r * ts;

      const sel = new PIXI.Graphics();
      sel.lineStyle(2, 0xf0c040);
      sel.drawRect(px - 1, py - 1, ts + 1, ts + 1);
      this.highlightLayer.addChild(sel);
    }
  },

  // ========== ANIMATION ==========

  getTilePixelCenter(r, c) {
    const ts = this.tileSize;
    const eqWidth = Game.state.mapWidth;
    const rw = Game.rowWidths[r];
    const totalMapWidth = eqWidth * ts;
    const rowPixelWidth = rw * ts;
    const rowOffset = (totalMapWidth - rowPixelWidth) / 2;
    return {
      x: rowOffset + c * ts + ts / 2,
      y: r * ts + ts / 2
    };
  },

  createUnitSprite(unit) {
    const ts = this.tileSize;
    const uType = Game.getUnitType(unit);
    const ownerColor = parseInt(CIV_COLORS[unit.owner].replace('#',''), 16);
    const container = new PIXI.Container();

    const gfx = new PIXI.Graphics();
    if (uType.domain === 'sea') {
      gfx.beginFill(ownerColor, 0.85);
      gfx.moveTo(0, -ts/2 + 4);
      gfx.lineTo(ts/2 - 4, 0);
      gfx.lineTo(0, ts/2 - 4);
      gfx.lineTo(-ts/2 + 4, 0);
      gfx.closePath();
      gfx.endFill();
    } else if (uType.type === 'civilian' || uType.type === 'settler') {
      gfx.beginFill(ownerColor, 0.85);
      gfx.drawCircle(0, 0, ts/3);
      gfx.endFill();
    } else {
      gfx.lineStyle(2, ownerColor);
      gfx.beginFill(ownerColor, 0.7);
      gfx.drawRoundedRect(-ts/2 + 5, -ts/2 + 5, ts - 11, ts - 11, 3);
      gfx.endFill();
    }
    container.addChild(gfx);

    const icon = this.getUnitIcon(uType);
    const text = new PIXI.Text(icon, { fontSize: 11, fill: 0xFFFFFF });
    text.anchor.set(0.5);
    container.addChild(text);

    if (unit.hp < 100) {
      const hpPct = unit.hp / 100;
      const hpBar = new PIXI.Graphics();
      hpBar.beginFill(0x333333);
      hpBar.drawRect(-ts/2 + 4, ts/2 - 6, ts - 9, 3);
      hpBar.endFill();
      hpBar.beginFill(hpPct > 0.5 ? 0x4caf50 : hpPct > 0.25 ? 0xff9800 : 0xe94560);
      hpBar.drawRect(-ts/2 + 4, ts/2 - 6, (ts - 9) * hpPct, 3);
      hpBar.endFill();
      container.addChild(hpBar);
    }

    if (unit.fortified) {
      const fort = new PIXI.Text('🛡', {fontSize: 8});
      fort.position.set(ts/2 - 12, -ts/2 + 1);
      container.addChild(fort);
    }

    return container;
  },

  animateUnitMove(unit, fromR, fromC, toR, toC, duration, callback) {
    const from = this.getTilePixelCenter(fromR, fromC);
    const to = this.getTilePixelCenter(toR, toC);

    this.animating = true;
    this.animatingUnitId = unit.id;

    // Re-render to hide the unit from its new position in the normal draw
    this.render();

    const sprite = this.createUnitSprite(unit);
    sprite.x = from.x;
    sprite.y = from.y;
    this.unitLayer.addChild(sprite);

    let elapsed = 0;
    const tickerFn = (dt) => {
      elapsed += dt * (1000 / 60);
      const t = Math.min(elapsed / duration, 1);
      // ease in-out quad
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      sprite.x = from.x + (to.x - from.x) * eased;
      sprite.y = from.y + (to.y - from.y) * eased;
      if (t >= 1) {
        this.app.ticker.remove(tickerFn);
        sprite.destroy({children: true});
        this.animating = false;
        this.animatingUnitId = null;
        if (callback) callback();
      }
    };
    this.app.ticker.add(tickerFn);
  },

  animateCombat(attacker, defender, fromR, fromC, toR, toC, combatResult, callback) {
    const from = this.getTilePixelCenter(fromR, fromC);
    const to = this.getTilePixelCenter(toR, toC);
    const midX = from.x + (to.x - from.x) * 0.5;
    const midY = from.y + (to.y - from.y) * 0.5;

    this.animating = true;
    this.animatingUnitId = attacker.id;
    this.render();

    const sprite = this.createUnitSprite(attacker);
    sprite.x = from.x;
    sprite.y = from.y;
    this.unitLayer.addChild(sprite);

    const totalDuration = 400;
    let elapsed = 0;
    const tickerFn = (dt) => {
      elapsed += dt * (1000 / 60);
      const t = Math.min(elapsed / totalDuration, 1);

      if (t < 0.4) {
        // Move toward target
        const p = t / 0.4;
        const eased = p * p;
        sprite.x = from.x + (midX - from.x) * eased;
        sprite.y = from.y + (midY - from.y) * eased;
      } else if (t < 0.5) {
        // Flash: tint defender area red
        sprite.x = midX;
        sprite.y = midY;
      } else {
        // Bounce back
        const p = (t - 0.5) / 0.5;
        const eased = p * p;
        sprite.x = midX + (from.x - midX) * eased;
        sprite.y = midY + (from.y - midY) * eased;
      }

      if (t >= 1) {
        this.app.ticker.remove(tickerFn);
        sprite.destroy({children: true});
        this.animating = false;
        this.animatingUnitId = null;

        // Flash effect on defender tile
        if (combatResult.result !== 'defender_wins') {
          const flash = new PIXI.Graphics();
          flash.beginFill(0xe94560, 0.5);
          const ts = this.tileSize;
          const defPos = this.getTilePixelCenter(toR, toC);
          flash.drawRect(defPos.x - ts/2, defPos.y - ts/2, ts, ts);
          flash.endFill();
          this.unitLayer.addChild(flash);
          let flashElapsed = 0;
          const flashTicker = (fdt) => {
            flashElapsed += fdt * (1000 / 60);
            flash.alpha = 1 - flashElapsed / 200;
            if (flashElapsed >= 200) {
              this.app.ticker.remove(flashTicker);
              flash.destroy();
              if (callback) callback();
            }
          };
          this.app.ticker.add(flashTicker);
        } else {
          if (callback) callback();
        }
      }
    };
    this.app.ticker.add(tickerFn);
  },

  getResourceIcon(resource) {
    const icons = {
      wheat:'🌾', cattle:'🐄', fish:'🐟', deer:'🦌', stone:'🪨', timber:'🪵',
      maize:'🌽', rice:'🍚', bananas:'🍌', papyrus:'📜', marble:'⬜',
      wood:'🪵', sheep:'🐑', hardwood:'🪵', granite:'🪨', mammoth_bones:'🦣', peat:'🟫',
      whale:'🐋', seal:'🦭', tuna:'🐟', crab:'🦀', shellfish:'🐚', dates:'🌴', citrus:'🍊',
      flax:'🌿', sandstone:'🧱', glass_sand:'🔮',
      gold_ore:'✨', silver:'⚪', gems:'💎', spices:'🌶', silk:'🧵',
      wine:'🍷', furs:'🧥', cotton:'☁', incense:'🕯', salt:'🧂',
      coffee:'☕', tea:'🍵',
      amber:'💛', aurora_crystals:'✨', truffles:'🍄', tobacco:'🚬', ivory:'🦷', jade:'💚',
      dye:'🎨', sugar_cane:'🍬', coral_dye:'🪸', salt_flats:'🧂', medicinal_herbs:'🌿', pearl:'🫧',
      horses:'🐴', copper:'🟤', iron:'⚔', coal:'⬛', niter:'💥',
      oil:'🛢', uranium:'☢', aluminum:'🔩',
      flint:'🪨', tin:'🔩', zinc:'⚪', limestone:'🪨', clay:'🏺', obsidian:'🔮',
      lead:'⬛', sulfur:'💛', bauxite:'🟫', rubber:'⚫', chromium:'⬜', manganese:'⬛',
      tungsten:'⚪', nickel:'🔘', phosphate:'🟢', silicon:'💎', lithium:'🔋', cobalt:'🔵',
      graphite:'✏️', titanium:'💠', neodymium:'🧲', helium_3:'💨', geothermal:'♨️'
    };
    return icons[resource.id] || '◆';
  },

  getUnitIcon(uType) {
    const icons = {
      gatherer:'👷', nomad:'🏕', worker:'🔨', settler:'🏘',
      club_warrior:'🏏', rock_thrower:'🪨', scout:'👁',
      log_raft:'🪵', war_canoe:'🛶',
      warrior:'⚔', spearman:'🔱', archer:'🏹', horseman:'🐴',
      galley:'⛵', swordsman:'🗡', catapult:'🪨',
      trireme:'⛵', bireme:'🏹',
      longswordsman:'⚔', crossbowman:'🎯', knight:'🐎', trebuchet:'🏗',
      pikeman:'🔱', cog:'⛵', fire_ship:'🔥', landing_barge:'🚢',
      caravel:'⛵', musketman:'🔫', cannon:'💣', frigate:'🚢', marine:'🪖',
      lancer:'🏇', privateer:'🏴‍☠️',
      rifleman:'🎖', cavalry:'🏇', artillery:'💥', ironclad:'🚢',
      gatling_gun:'🔫', destroyer:'🚢', transport_ship:'🚢', observation_balloon:'🎈', amphibious_barge:'🚢',
      infantry:'🪖', tank:'🛡', rocket_artillery:'🚀',
      fighter:'✈', bomber:'💣', battleship:'🚢', submarine:'🐋',
      machine_gun:'🔫', paratrooper:'🪂', aircraft_carrier:'🛳', tactical_nuke:'☢️', seaplane:'🛩',
      cyber_infantry:'🤖', mech_walker:'🦿', drone_swarm:'🐝',
      railgun:'⚡', stealth_bomber:'✈️', autonomous_sub:'🐋', assault_vtol:'🚁', hovercraft:'🛥', cyber_ops:'💻', icbm:'☢️',
      titan_mech:'⚡', mars_shuttle:'🚀',
      exo_soldier:'🦾', plasma_artillery:'⚡', hypersonic:'🛩', orbital_drone:'🛰', fusion_battlecruiser:'🚢', ekranoplan:'🛥'
    };
    return icons[uType.id] || '•';
  },

  // Center camera on a position
  centerOn(r, c) {
    const ts = this.tileSize;
    const eqWidth = Game.state.mapWidth;
    const rw = Game.rowWidths[r];
    const totalMapWidth = eqWidth * ts;
    const rowPixelWidth = rw * ts;
    const rowOffset = (totalMapWidth - rowPixelWidth) / 2;

    this.camera.x = rowOffset + c * ts + ts / 2;
    this.camera.y = r * ts + ts / 2;
    this.render();
    this.updateMinimap();
  },

  // ========== MINIMAP ==========

  updateMinimap() {
    if (!Game.state) return;
    const canvas = document.getElementById('minimap');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const mapH = Game.state.mapHeight;
    const eqW = Game.state.mapWidth;

    ctx.fillStyle = '#0a0a2e';
    ctx.fillRect(0, 0, w, h);

    const scaleX = w / eqW;
    const scaleY = h / mapH;

    for (let r = 0; r < mapH; r++) {
      const rw = Game.rowWidths[r];
      const offset = (eqW - rw) / 2;
      for (let c = 0; c < rw; c++) {
        const tile = Game.mapData[r][c];
        if (tile.fogState[0] === 0) continue;

        const terrain = TERRAINS[tile.terrain];
        let color = '#' + terrain.color.toString(16).padStart(6, '0');

        if (tile.owner >= 0) {
          color = CIV_COLORS[tile.owner] || color;
        }
        if (tile.cityId) {
          color = '#f0c040';
        }

        ctx.fillStyle = color;
        ctx.fillRect(
          Math.floor((offset + c) * scaleX),
          Math.floor(r * scaleY),
          Math.max(1, Math.ceil(scaleX)),
          Math.max(1, Math.ceil(scaleY))
        );
      }
    }

    // Viewport rectangle
    const ts = this.tileSize;
    const zoom = this.camera.zoom;
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const viewL = (this.camera.x - screenW / (2 * zoom)) / ts;
    const viewT = (this.camera.y - screenH / (2 * zoom)) / ts;
    const viewW = screenW / (zoom * ts);
    const viewH = screenH / (zoom * ts);

    ctx.strokeStyle = '#f0c040';
    ctx.lineWidth = 1;
    ctx.strokeRect(viewL * scaleX, viewT * scaleY, viewW * scaleX, viewH * scaleY);
  }
};
