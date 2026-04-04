// TileForge — PixiJS Map Renderer
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

    this.setupInteraction(container);
    this.initialized = true;

    window.addEventListener('resize', () => {
      const r = container.getBoundingClientRect();
      this.app.renderer.resize(r.width, r.height);
      this.render();
    });
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

        // Terrain tile
        const tileGfx = new PIXI.Graphics();
        let color = terrain.color;
        if (fog === 1) {
          // Explored but not visible — darken
          const r2 = ((color >> 16) & 0xFF) * 0.4;
          const g2 = ((color >> 8) & 0xFF) * 0.4;
          const b2 = (color & 0xFF) * 0.4;
          color = (Math.floor(r2) << 16) | (Math.floor(g2) << 8) | Math.floor(b2);
        }
        tileGfx.beginFill(color);
        tileGfx.drawRect(px, py, ts - 1, ts - 1);
        tileGfx.endFill();
        this.terrainLayer.addChild(tileGfx);

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
