// Apollo's Time — PixiJS Map Renderer
"use strict";

function getTerrainCategory(terrainId) {
  if (terrainId < 0) return 'edge';
  if (terrainId === 0) return 'ice';
  if (terrainId === 3) return 'frozen_water';
  if (terrainId === 16) return 'coast';
  if (terrainId === 17) return 'ocean';
  if (terrainId === 18) return 'reef';
  if (TERRAINS[terrainId] && TERRAINS[terrainId].water) return 'water';
  if ([10, 12].includes(terrainId)) return 'desert';
  if ([0, 1].includes(terrainId)) return 'snow';
  if ([2, 6, 14].includes(terrainId)) return 'forest';
  return 'land';
}

function isWaterTerrain(terrainId) {
  return terrainId >= 0 && TERRAINS[terrainId] && TERRAINS[terrainId].water;
}

const Renderer = {
  app: null,
  mapContainer: null,
  tileSize: 48,
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
  coastTextures: [],
  coastFogTextures: [],
  contextTextureCache: {},
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
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const brighten = (c, amt) => rgb(clamp(rr(c) + amt), clamp(gg(c) + amt), clamp(bb(c) + amt));
    const darken = (c, amt) => brighten(c, -amt);
    const seed = (s) => { let v = s; return () => { v = (v * 1664525 + 1013904223) & 0xFFFFFFFF; return (v >>> 0) / 4294967296; }; };

    // Pixel noise: scatter many tiny rects with color variation
    const fillNoise = (g, rng, base, count, variance) => {
      for (let i = 0; i < count; i++) {
        const shift = (rng() - 0.5) * variance;
        const c = brighten(base, shift);
        g.beginFill(c, 0.6 + rng() * 0.4);
        const sz = 1 + Math.floor(rng() * 2);
        g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), sz, sz);
        g.endFill();
      }
    };

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
        case 0: { // Ice Sheet
          fillNoise(g, rng, 0xDDE8FF, 180, 20);
          // Pale ice pools
          for (let i = 0; i < 4; i++) {
            g.beginFill(mix(0xB0D0F0, 0xD0E8FF, rng()), 0.25 + rng() * 0.15);
            g.drawEllipse(rng() * ts, rng() * ts, 4 + rng() * 6, 3 + rng() * 4);
            g.endFill();
          }
          // Jagged crack lines in 3 directions
          for (let i = 0; i < 3; i++) {
            g.lineStyle(1, mix(0x5577BB, 0x88AADD, rng()), 0.5 + rng() * 0.3);
            let cx = rng() * ts, cy = rng() * ts;
            g.moveTo(cx, cy);
            const segs = 4 + Math.floor(rng() * 4);
            for (let s = 0; s < segs; s++) {
              cx += (rng() - 0.5) * 14;
              cy += (rng() - 0.5) * 14;
              g.lineTo(cx, cy);
            }
          }
          g.lineStyle(0);
          // Sparkle highlights
          for (let i = 0; i < 25; i++) {
            g.beginFill(0xFFFFFF, 0.5 + rng() * 0.5);
            g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), 1, 1);
            g.endFill();
          }
          break;
        }

        case 1: { // Tundra
          fillNoise(g, rng, base, 150, 25);
          // Grey-brown mottling
          for (let i = 0; i < 40; i++) {
            const c = rng() > 0.5 ? mix(0x9A9888, 0xB0A890, rng()) : mix(0x808878, 0xA0A898, rng());
            g.beginFill(c, 0.3 + rng() * 0.3);
            g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), 1 + Math.floor(rng() * 2), 1 + Math.floor(rng() * 2));
            g.endFill();
          }
          // Lichen patches
          for (let i = 0; i < 8; i++) {
            const cx = rng() * ts, cy = rng() * ts;
            const clr = rng() > 0.5 ? 0x8B7B4A : 0x9AAA60;
            for (let j = 0; j < 4; j++) {
              g.beginFill(clr, 0.6 + rng() * 0.3);
              g.drawCircle(cx + (rng() - 0.5) * 6, cy + (rng() - 0.5) * 6, 1);
              g.endFill();
            }
          }
          // Tiny stones
          for (let i = 0; i < 3; i++) {
            g.beginFill(mix(0x808080, 0x999999, rng()), 0.7);
            g.drawEllipse(rng() * ts, rng() * ts, 1.5 + rng(), 1 + rng() * 0.5);
            g.endFill();
          }
          // Frost dusting
          for (let i = 0; i < 15; i++) {
            g.beginFill(0xFFFFFF, 0.2 + rng() * 0.2);
            g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), 1, 1);
            g.endFill();
          }
          break;
        }

        case 2: { // Taiga
          fillNoise(g, rng, base, 150, 30);
          // Ground shadow base
          for (let i = 0; i < 30; i++) {
            g.beginFill(darken(base, 20 + rng() * 20), 0.3);
            g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), 2, 2);
            g.endFill();
          }
          // 5-7 conifer trees
          const treeCount = 5 + Math.floor(rng() * 3);
          for (let i = 0; i < treeCount; i++) {
            const tx = 6 + rng() * (ts - 12);
            const ty = 10 + rng() * (ts - 18);
            // Shadow under tree
            g.beginFill(0x0A200A, 0.3);
            g.drawEllipse(tx, ty + 10, 5, 2);
            g.endFill();
            // Trunk
            g.beginFill(0x4A3020, 0.9);
            g.drawRect(tx - 1, ty + 5, 2, 6);
            g.endFill();
            // 3 layered triangle tiers
            const greens = [darken(base, 15), base, brighten(base, 10)];
            for (let t = 0; t < 3; t++) {
              const w = 3 + t * 2.5;
              const yOff = ty - 2 + t * 4;
              g.beginFill(greens[t], 0.9);
              g.moveTo(tx, yOff - 4);
              g.lineTo(tx - w, yOff + 2);
              g.lineTo(tx + w, yOff + 2);
              g.closePath();
              g.endFill();
              // Snow on branches
              g.beginFill(0xE8F0FF, 0.5 + rng() * 0.3);
              g.drawRect(tx - w * 0.6, yOff - 1, w * 0.5, 1);
              g.drawRect(tx + w * 0.2, yOff - 2, w * 0.4, 1);
              g.endFill();
            }
          }
          break;
        }

        case 3: { // Frozen Coast — grey-blue icy water, ocean-compatible
          g.beginFill(0x5588AA);
          g.drawRect(0, 0, ts, ts);
          g.endFill();
          fillNoise(g, rng, 0x5588AA, 120, 18);
          // Subtle ocean-toned wave lines
          for (let i = 0; i < 6; i++) {
            const wy = rng() * ts;
            g.lineStyle(1, mix(0x3D6E99, 0x6699BB, rng()), 0.3);
            g.moveTo(0, wy);
            for (let x = 0; x <= ts; x += 4) {
              g.lineTo(x, wy + Math.sin(x * 0.3 + i * 2) * 1.5);
            }
          }
          g.lineStyle(0);
          // Ice floes (irregular polygons)
          for (let i = 0; i < 4; i++) {
            const cx = rng() * ts, cy = rng() * ts;
            const pts = [];
            const verts = 5 + Math.floor(rng() * 3);
            for (let v = 0; v < verts; v++) {
              const ang = (v / verts) * Math.PI * 2;
              const r = 3 + rng() * 5;
              pts.push(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
            }
            g.beginFill(0xD8E8F4, 0.7 + rng() * 0.2);
            g.drawPolygon(pts);
            g.endFill();
            g.beginFill(0xF0F8FF, 0.4);
            g.drawEllipse(cx - 1, cy - 1, 2, 1.5);
            g.endFill();
          }
          // Dark water gaps in ocean-compatible blue
          for (let i = 0; i < 6; i++) {
            g.beginFill(0x2A5577, 0.4);
            g.drawEllipse(rng() * ts, rng() * ts, 2 + rng() * 3, 1 + rng());
            g.endFill();
          }
          break;
        }

        case 4: { // Grassland
          // Multi-shade green noise
          const greens = [0x68A040, 0x7AB648, 0x88C450, 0x60A038];
          for (let i = 0; i < 200; i++) {
            const c = greens[Math.floor(rng() * greens.length)];
            g.beginFill(brighten(c, (rng() - 0.5) * 20), 0.5 + rng() * 0.5);
            g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), 1 + Math.floor(rng() * 2), 1);
            g.endFill();
          }
          // Dense grass tufts
          for (let i = 0; i < 40; i++) {
            const gx = rng() * ts, gy = rng() * ts;
            const gc = greens[Math.floor(rng() * greens.length)];
            g.lineStyle(1, darken(gc, 15 + rng() * 15), 0.6 + rng() * 0.3);
            g.moveTo(gx, gy);
            g.quadraticCurveTo(gx + (rng() - 0.5) * 3, gy - 3 - rng() * 3, gx + (rng() - 0.3) * 2, gy - 4 - rng() * 3);
          }
          g.lineStyle(0);
          // Wildflower dots
          for (let i = 0; i < 8; i++) {
            g.beginFill(rng() > 0.5 ? 0xFFFF88 : 0xFFFFFF, 0.7 + rng() * 0.3);
            g.drawCircle(rng() * ts, rng() * ts, 0.5 + rng() * 0.5);
            g.endFill();
          }
          // Occasional small rock
          if (rng() > 0.5) {
            g.beginFill(0x888888, 0.6);
            g.drawEllipse(rng() * ts, rng() * ts, 1.5, 1);
            g.endFill();
          }
          break;
        }

        case 5: { // Plains
          fillNoise(g, rng, base, 160, 20);
          // Brown dirt patches
          for (let i = 0; i < 8; i++) {
            g.beginFill(mix(0x907848, 0xA89060, rng()), 0.25 + rng() * 0.2);
            g.drawEllipse(rng() * ts, rng() * ts, 3 + rng() * 5, 2 + rng() * 3);
            g.endFill();
          }
          // Wheat/grain stalks leaning right (wind direction)
          for (let i = 0; i < 18; i++) {
            const sx = rng() * ts, sy = 6 + rng() * (ts - 10);
            const stalkClr = mix(0x908840, 0xC0B060, rng());
            g.lineStyle(1, stalkClr, 0.6 + rng() * 0.3);
            g.moveTo(sx, sy + 5);
            g.quadraticCurveTo(sx + 1.5, sy, sx + 3, sy - 4);
            g.lineStyle(0);
            // Seed head
            g.beginFill(mix(0xCCBB44, 0xDDCC55, rng()), 0.8);
            g.drawEllipse(sx + 3, sy - 5, 1.5, 2.5);
            g.endFill();
          }
          break;
        }

        case 6: { // Forest
          fillNoise(g, rng, base, 150, 30);
          // Dark floor
          for (let i = 0; i < 20; i++) {
            g.beginFill(darken(base, 30 + rng() * 20), 0.4);
            g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), 2 + Math.floor(rng() * 3), 2);
            g.endFill();
          }
          // 4-5 deciduous trees
          const fTreeCount = 4 + Math.floor(rng() * 2);
          for (let i = 0; i < fTreeCount; i++) {
            const cx = 6 + rng() * (ts - 12), cy = 6 + rng() * (ts - 14);
            const rad = 5 + rng() * 3;
            // Shadow
            g.beginFill(0x0A200A, 0.35);
            g.drawEllipse(cx + 2, cy + rad + 3, rad * 0.8, 2);
            g.endFill();
            // Trunk peeking
            g.beginFill(mix(0x5A3820, 0x6A4830, rng()), 0.85);
            g.drawRect(cx - 1, cy + rad * 0.4, 2, rad * 0.8);
            g.endFill();
            // Main canopy
            const canopyClr = mix(base, brighten(base, 15), rng());
            g.beginFill(darken(canopyClr, 15), 0.85);
            g.drawCircle(cx, cy, rad);
            g.endFill();
            // Sub-canopy clusters
            for (let j = 0; j < 3; j++) {
              g.beginFill(mix(canopyClr, brighten(base, 20 + rng() * 15), 0.5), 0.7);
              g.drawCircle(cx + (rng() - 0.5) * rad, cy + (rng() - 0.5) * rad, rad * (0.4 + rng() * 0.3));
              g.endFill();
            }
            // Highlight crescent (top-left)
            g.beginFill(brighten(canopyClr, 30), 0.45);
            g.drawEllipse(cx - rad * 0.3, cy - rad * 0.3, rad * 0.5, rad * 0.4);
            g.endFill();
          }
          // Occasional gap showing forest floor
          for (let i = 0; i < 3; i++) {
            g.beginFill(mix(0x2A4A20, 0x3A5A2A, rng()), 0.5);
            g.drawEllipse(rng() * ts, rng() * ts, 2 + rng() * 2, 1.5 + rng());
            g.endFill();
          }
          break;
        }

        case 7: { // Hills
          fillNoise(g, rng, base, 140, 25);
          // 2-3 rounded hill profiles
          const hillCount = 2 + Math.floor(rng() * 2);
          for (let i = 0; i < hillCount; i++) {
            const hx = rng() * ts;
            const hy = ts * (0.4 + i * 0.2);
            const hw = 15 + rng() * 12;
            const hh = 8 + rng() * 8;
            // Dark shadow side (right/bottom)
            g.beginFill(darken(base, 25 + rng() * 15), 0.5);
            g.drawEllipse(hx + 2, hy + 1, hw, hh * 0.9);
            g.endFill();
            // Main hill body
            g.beginFill(mix(base, brighten(base, 10), 0.5), 0.7);
            g.drawEllipse(hx, hy, hw, hh);
            g.endFill();
            // Light highlight (top-left)
            g.beginFill(brighten(base, 25), 0.4);
            g.drawEllipse(hx - hw * 0.25, hy - hh * 0.3, hw * 0.5, hh * 0.4);
            g.endFill();
            // Sparse grass on hilltop
            g.lineStyle(1, mix(0x6A8A40, 0x7A9A50, rng()), 0.5);
            for (let j = 0; j < 4; j++) {
              const gx = hx + (rng() - 0.5) * hw * 0.8;
              const gy2 = hy - hh * 0.4 + rng() * hh * 0.3;
              g.moveTo(gx, gy2);
              g.lineTo(gx + (rng() - 0.5) * 2, gy2 - 2 - rng() * 2);
            }
            g.lineStyle(0);
          }
          // Rocky outcrops
          for (let i = 0; i < 4; i++) {
            g.beginFill(mix(0x808080, 0x9A9A8A, rng()), 0.6);
            const rx = rng() * ts, ry = rng() * ts;
            g.drawPolygon([rx, ry - 2, rx - 2, ry + 1, rx + 2, ry + 1]);
            g.endFill();
          }
          break;
        }

        case 8: { // Mountains
          // Dark grey rocky base noise
          fillNoise(g, rng, 0x5A5A6A, 160, 30);
          // Rocky cliff texture
          for (let i = 0; i < 25; i++) {
            g.beginFill(mix(0x4A4A5A, 0x6A6A7A, rng()), 0.4);
            g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), 1 + Math.floor(rng() * 3), 1 + Math.floor(rng() * 2));
            g.endFill();
          }
          // 2-3 mountain peaks
          const peakCount = 2 + Math.floor(rng() * 2);
          for (let i = 0; i < peakCount; i++) {
            const mx = 8 + rng() * (ts - 16);
            const mBase = ts;
            const peakH = 18 + rng() * 14;
            const halfW = 8 + rng() * 6;
            // Shadow side (right)
            g.beginFill(0x3A3A4A, 0.7);
            g.moveTo(mx + 2, mBase - peakH);
            g.lineTo(mx + halfW + 3, mBase);
            g.lineTo(mx + 2, mBase);
            g.closePath();
            g.endFill();
            // Main mountain body (irregular sides)
            g.beginFill(mix(0x5A5A6A, 0x7A7A8A, rng()), 0.9);
            g.moveTo(mx, mBase - peakH);
            g.lineTo(mx - halfW, mBase);
            g.lineTo(mx + halfW, mBase);
            g.closePath();
            g.endFill();
            // Light side (left)
            g.beginFill(brighten(0x6A6A7A, 15), 0.4);
            g.moveTo(mx, mBase - peakH);
            g.lineTo(mx - halfW * 0.6, mBase - peakH * 0.3);
            g.lineTo(mx - 1, mBase - peakH * 0.3);
            g.closePath();
            g.endFill();
            // Snow cap (top third)
            g.beginFill(0xF0F4FF, 0.9);
            g.moveTo(mx, mBase - peakH);
            g.lineTo(mx - halfW * 0.35, mBase - peakH * 0.65);
            g.lineTo(mx + halfW * 0.35, mBase - peakH * 0.65);
            g.closePath();
            g.endFill();
            // Snow drip edge
            g.beginFill(0xE0E8F8, 0.5);
            const snowY = mBase - peakH * 0.65;
            for (let s = 0; s < 4; s++) {
              const sx2 = mx + (rng() - 0.5) * halfW * 0.6;
              g.drawRect(sx2, snowY, 1 + rng() * 2, 1 + rng() * 2);
            }
            g.endFill();
          }
          break;
        }

        case 9: { // Wetland
          fillNoise(g, rng, base, 130, 20);
          // Murky water layer
          for (let i = 0; i < 30; i++) {
            g.beginFill(mix(0x3A6A5A, 0x5A8A7A, rng()), 0.3);
            g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), 2 + Math.floor(rng() * 3), 1);
            g.endFill();
          }
          // Horizontal wavy water lines
          for (let i = 0; i < 5; i++) {
            const wy = 3 + i * (ts / 5);
            g.lineStyle(1, mix(0x3A6A8A, 0x508898, rng()), 0.35);
            g.moveTo(0, wy);
            for (let x = 0; x <= ts; x += 3) {
              g.lineTo(x, wy + Math.sin(x * 0.35 + i * 1.5) * 2);
            }
          }
          g.lineStyle(0);
          // Muddy patches
          for (let i = 0; i < 5; i++) {
            g.beginFill(mix(0x5A5030, 0x6A6040, rng()), 0.3);
            g.drawEllipse(rng() * ts, rng() * ts, 3 + rng() * 4, 2 + rng() * 2);
            g.endFill();
          }
          // Lily pads
          for (let i = 0; i < 6; i++) {
            g.beginFill(0x408838, 0.7);
            g.drawCircle(rng() * ts, rng() * ts, 1.5 + rng());
            g.endFill();
          }
          // Reed/cattail stalks
          for (let i = 0; i < 7; i++) {
            const rx = rng() * ts, ry = rng() * ts;
            g.lineStyle(1, mix(0x5A7040, 0x6A8050, rng()), 0.8);
            g.moveTo(rx, ry + 4);
            g.lineTo(rx + (rng() - 0.5) * 2, ry - 6);
            g.lineStyle(0);
            // Cattail top
            g.beginFill(0x6A4020, 0.85);
            g.drawEllipse(rx + (rng() - 0.5), ry - 7, 1, 2.5);
            g.endFill();
          }
          break;
        }

        case 10: { // Desert
          // Fine sandy grain texture
          const sandColors = [0xD4C088, 0xDDC890, 0xCCB878, 0xE0D098, 0xC8B070];
          for (let i = 0; i < 220; i++) {
            const c = sandColors[Math.floor(rng() * sandColors.length)];
            g.beginFill(brighten(c, (rng() - 0.5) * 15), 0.5 + rng() * 0.5);
            g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), 1, 1);
            g.endFill();
          }
          // Sweeping dune curves
          for (let i = 0; i < 3; i++) {
            const dy = 8 + i * (ts / 3);
            // Shadow trough
            g.beginFill(darken(base, 20 + rng() * 10), 0.35);
            for (let x = 0; x < ts; x += 2) {
              const yOff = Math.sin(x * 0.12 + i * 1.5) * 5;
              g.drawRect(x, dy + yOff + 2, 2, 3);
            }
            g.endFill();
            // Light crest
            g.beginFill(brighten(base, 20 + rng() * 15), 0.4);
            for (let x = 0; x < ts; x += 2) {
              const yOff = Math.sin(x * 0.12 + i * 1.5) * 5;
              g.drawRect(x, dy + yOff - 2, 2, 2);
            }
            g.endFill();
          }
          // Heat shimmer band
          g.beginFill(brighten(base, 18), 0.15);
          g.drawRect(0, ts * 0.3, ts, 3);
          g.endFill();
          // Tiny dark pebbles
          for (let i = 0; i < 4; i++) {
            g.beginFill(0x806848, 0.5);
            g.drawCircle(rng() * ts, rng() * ts, 0.5 + rng() * 0.5);
            g.endFill();
          }
          break;
        }

        case 11: { // Savanna
          fillNoise(g, rng, base, 160, 22);
          // Dry grass tufts
          for (let i = 0; i < 30; i++) {
            const gx = rng() * ts, gy = rng() * ts;
            g.lineStyle(1, mix(0xA09040, 0xC0A848, rng()), 0.5 + rng() * 0.3);
            g.moveTo(gx, gy);
            g.lineTo(gx + (rng() - 0.5) * 2, gy - 2 - rng() * 3);
          }
          g.lineStyle(0);
          // Brown dirt patches
          for (let i = 0; i < 6; i++) {
            g.beginFill(mix(0x907848, 0xA88858, rng()), 0.25);
            g.drawEllipse(rng() * ts, rng() * ts, 3 + rng() * 4, 2 + rng() * 2);
            g.endFill();
          }
          // 1-2 flat-topped acacia trees
          const acaciaCount = 1 + Math.floor(rng() * 2);
          for (let i = 0; i < acaciaCount; i++) {
            const tx = 10 + rng() * (ts - 20), ty = ts * (0.5 + rng() * 0.2);
            // Shadow
            g.beginFill(0x504020, 0.25);
            g.drawEllipse(tx + 2, ty + 14, 10, 2);
            g.endFill();
            // Trunk
            g.beginFill(0x6A4828, 0.85);
            g.drawRect(tx - 1, ty, 2, 14);
            g.endFill();
            // Wide flat canopy
            g.beginFill(mix(0x708830, 0x889840, rng()), 0.8);
            g.drawEllipse(tx, ty - 2, 10 + rng() * 4, 3 + rng() * 2);
            g.endFill();
            // Canopy highlight
            g.beginFill(brighten(0x809838, 15), 0.4);
            g.drawEllipse(tx - 2, ty - 3, 6, 2);
            g.endFill();
          }
          break;
        }

        case 12: { // Mesa
          fillNoise(g, rng, base, 120, 20);
          // Horizontal stratification layers
          const strataColors = [0xC07840, 0xD09050, 0xB06830, 0xE0A060, 0xA05828, 0xCC8848, 0xD89858];
          for (let i = 0; i < 8; i++) {
            const sy = Math.floor(i * (ts / 8));
            const h = Math.floor(ts / 8) + 1;
            const sc = strataColors[i % strataColors.length];
            g.beginFill(brighten(sc, (rng() - 0.5) * 15), 0.5);
            g.drawRect(0, sy, ts, h);
            g.endFill();
          }
          // Flat top plateau shape
          g.beginFill(brighten(base, 12), 0.35);
          g.drawRect(4, 2, ts - 8, ts * 0.15);
          g.endFill();
          // Cliff face vertical cracks
          g.lineStyle(1, darken(base, 30), 0.4);
          for (let i = 0; i < 5; i++) {
            const cx = 4 + rng() * (ts - 8);
            g.moveTo(cx, ts * 0.15);
            g.lineTo(cx + (rng() - 0.5) * 3, ts * 0.5);
            g.lineTo(cx + (rng() - 0.5) * 4, ts * 0.85);
          }
          g.lineStyle(0);
          // Shadow at base
          g.beginFill(0x000000, 0.15);
          g.drawRect(0, ts * 0.85, ts, ts * 0.15);
          g.endFill();
          break;
        }

        case 13: { // Oasis
          // Sandy border
          g.beginFill(0xD4C088);
          g.drawRect(0, 0, ts, ts);
          g.endFill();
          fillNoise(g, rng, 0xD4C088, 100, 15);
          // Green vegetation ring
          g.beginFill(0x50A050, 0.8);
          g.drawCircle(ts / 2, ts / 2, ts * 0.38);
          g.endFill();
          // Lush green detail in ring
          for (let i = 0; i < 30; i++) {
            const ang = rng() * Math.PI * 2;
            const r = ts * 0.22 + rng() * ts * 0.16;
            const px = ts / 2 + Math.cos(ang) * r;
            const py = ts / 2 + Math.sin(ang) * r;
            g.beginFill(mix(0x408838, 0x60B058, rng()), 0.6 + rng() * 0.3);
            g.drawCircle(px, py, 1 + rng() * 2);
            g.endFill();
          }
          // Blue water pool
          g.beginFill(0x3088CC, 0.9);
          g.drawCircle(ts / 2, ts / 2, ts * 0.18);
          g.endFill();
          // Water highlight
          g.beginFill(0x60B0E8, 0.4);
          g.drawEllipse(ts / 2 - 2, ts / 2 - 2, ts * 0.1, ts * 0.08);
          g.endFill();
          // 2-3 palm trees
          for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
            const ang = rng() * Math.PI * 2;
            const r = ts * 0.26;
            const px = ts / 2 + Math.cos(ang) * r;
            const py = ts / 2 + Math.sin(ang) * r;
            // Curved trunk
            g.lineStyle(2, 0x7A5A30, 0.85);
            g.moveTo(px, py + 4);
            g.quadraticCurveTo(px + (rng() - 0.5) * 4, py, px + (rng() - 0.5) * 3, py - 5);
            g.lineStyle(0);
            // Frond cluster
            for (let f = 0; f < 5; f++) {
              const fa = (f / 5) * Math.PI * 2;
              g.lineStyle(1, 0x308828, 0.8);
              g.moveTo(px + (rng() - 0.5) * 3, py - 5);
              g.lineTo(px + Math.cos(fa) * 5, py - 5 + Math.sin(fa) * 4);
            }
            g.lineStyle(0);
          }
          break;
        }

        case 14: { // Jungle
          // Very dark dense base
          g.beginFill(0x0E3818);
          g.drawRect(0, 0, ts, ts);
          g.endFill();
          fillNoise(g, rng, 0x1A5028, 180, 30);
          // Dense shadow throughout
          for (let i = 0; i < 40; i++) {
            g.beginFill(0x0A2010, 0.3 + rng() * 0.2);
            g.drawEllipse(rng() * ts, rng() * ts, 2 + rng() * 4, 1 + rng() * 3);
            g.endFill();
          }
          // Packed overlapping leaf shapes
          const leafColors = [0x1A5028, 0x226030, 0x2A7038, 0x185020, 0x307040];
          for (let i = 0; i < 25; i++) {
            const c = leafColors[Math.floor(rng() * leafColors.length)];
            g.beginFill(brighten(c, (rng() - 0.5) * 20), 0.6 + rng() * 0.3);
            g.drawEllipse(rng() * ts, rng() * ts, 3 + rng() * 5, 2 + rng() * 3);
            g.endFill();
          }
          // Hanging vines
          g.lineStyle(1, 0x0A3A10, 0.5);
          for (let i = 0; i < 5; i++) {
            const vx = rng() * ts;
            g.moveTo(vx, 0);
            g.quadraticCurveTo(vx + (rng() - 0.5) * 12, ts * 0.4, vx + (rng() - 0.5) * 10, ts);
          }
          g.lineStyle(0);
          // Bright flower dots
          for (let i = 0; i < 5; i++) {
            const fc = rng() > 0.5 ? 0xDD3030 : 0xDDCC20;
            g.beginFill(fc, 0.6 + rng() * 0.3);
            g.drawCircle(rng() * ts, rng() * ts, 0.8 + rng() * 0.8);
            g.endFill();
          }
          // Topmost dark canopy overlay
          for (let i = 0; i < 15; i++) {
            g.beginFill(0x0A2810, 0.2 + rng() * 0.15);
            g.drawEllipse(rng() * ts, rng() * ts, 4 + rng() * 6, 3 + rng() * 4);
            g.endFill();
          }
          break;
        }

        case 15: { // Volcanic
          // Dark basalt base
          g.beginFill(0x3A2020);
          g.drawRect(0, 0, ts, ts);
          g.endFill();
          fillNoise(g, rng, 0x4A2828, 160, 20);
          // Dark rocky texture
          for (let i = 0; i < 30; i++) {
            g.beginFill(mix(0x2A1818, 0x4A3030, rng()), 0.5);
            g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), 1 + Math.floor(rng() * 3), 1 + Math.floor(rng() * 2));
            g.endFill();
          }
          // Lava vein cracks
          for (let i = 0; i < 4; i++) {
            let cx = rng() * ts, cy = rng() * ts;
            // Glow around crack
            g.lineStyle(3, 0xFF4400, 0.15);
            g.moveTo(cx, cy);
            const segs = 3 + Math.floor(rng() * 4);
            for (let s = 0; s < segs; s++) {
              cx += (rng() - 0.5) * 16;
              cy += (rng() - 0.5) * 16;
              g.lineTo(cx, cy);
            }
            // Bright crack core
            cx = rng() * ts; cy = rng() * ts;
            g.lineStyle(1, mix(0xFF6600, 0xFFAA00, rng()), 0.7 + rng() * 0.3);
            g.moveTo(cx, cy);
            for (let s = 0; s < segs; s++) {
              cx += (rng() - 0.5) * 14;
              cy += (rng() - 0.5) * 14;
              g.lineTo(cx, cy);
            }
          }
          g.lineStyle(0);
          // Glowing red hotspots
          for (let i = 0; i < 5; i++) {
            const hx = rng() * ts, hy = rng() * ts;
            g.beginFill(0xFF2200, 0.2);
            g.drawCircle(hx, hy, 3 + rng() * 3);
            g.endFill();
            g.beginFill(0xFF6600, 0.4);
            g.drawCircle(hx, hy, 1.5 + rng());
            g.endFill();
          }
          // Smoke/steam wisps
          for (let i = 0; i < 4; i++) {
            g.beginFill(0x888888, 0.1 + rng() * 0.1);
            g.drawCircle(rng() * ts, rng() * ts * 0.5, 3 + rng() * 4);
            g.endFill();
          }
          break;
        }

        case 16: { // Coast — shallow water base (autotiling adds beach strips)
          // Full-tile shallow water base, ocean-compatible
          g.beginFill(0x3388BB);
          g.drawRect(0, 0, ts, ts);
          g.endFill();
          fillNoise(g, rng, 0x3388BB, 140, 18);
          // Subtle sandy bottom patches visible through shallow water
          for (let i = 0; i < 12; i++) {
            const sx = rng() * ts, sy = rng() * ts;
            g.beginFill(mix(0x8BA870, 0xA0B080, rng()), 0.08 + rng() * 0.07);
            g.drawEllipse(sx, sy, 4 + rng() * 6, 3 + rng() * 4);
            g.endFill();
          }
          // Lighter shallow-water patches
          for (let i = 0; i < 8; i++) {
            g.beginFill(brighten(0x3388BB, 15 + rng() * 10), 0.15 + rng() * 0.1);
            g.drawEllipse(rng() * ts, rng() * ts, 5 + rng() * 6, 3 + rng() * 4);
            g.endFill();
          }
          // Gentle wave arcs across the whole tile
          for (let i = 0; i < 5; i++) {
            const wy = 3 + i * (ts / 5);
            g.lineStyle(1, mix(0x4498CC, 0x66AADD, rng()), 0.3);
            g.moveTo(0, wy);
            for (let x = 0; x <= ts; x += 4) {
              g.lineTo(x, wy + Math.sin(x * 0.2 + i) * 2);
            }
          }
          g.lineStyle(0);
          // White shimmer specks (light on shallow water)
          for (let i = 0; i < 10; i++) {
            g.beginFill(0xFFFFFF, 0.12 + rng() * 0.15);
            g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), 2 + Math.floor(rng() * 2), 1);
            g.endFill();
          }
          break;
        }

        case 17: { // Ocean
          fillNoise(g, rng, base, 180, 25);
          // Deep dark areas
          for (let i = 0; i < 15; i++) {
            g.beginFill(darken(base, 20 + rng() * 20), 0.3);
            g.drawEllipse(rng() * ts, rng() * ts, 3 + rng() * 5, 2 + rng() * 3);
            g.endFill();
          }
          // Undulating wave patterns — curved lines
          for (let i = 0; i < 6; i++) {
            const wy = 2 + i * (ts / 6);
            const lightWave = mix(base, 0x4488CC, 0.3 + rng() * 0.2);
            g.lineStyle(1, lightWave, 0.35);
            g.moveTo(0, wy);
            for (let x = 0; x <= ts; x += 3) {
              g.lineTo(x, wy + Math.sin(x * 0.2 + i * 1.2) * 2.5);
            }
          }
          g.lineStyle(0);
          // Lighter wave depth bands
          for (let i = 0; i < 3; i++) {
            const by = rng() * ts;
            g.beginFill(brighten(base, 12), 0.2);
            g.drawRect(0, by, ts, 2 + rng() * 3);
            g.endFill();
          }
          // White wave caps
          for (let i = 0; i < 8; i++) {
            g.beginFill(0xFFFFFF, 0.15 + rng() * 0.2);
            g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), 2 + Math.floor(rng() * 2), 1);
            g.endFill();
          }
          break;
        }

        case 18: { // Reef — ocean-blue water base with underwater coral
          // Ocean-compatible water base
          g.beginFill(0x2D77AA);
          g.drawRect(0, 0, ts, ts);
          g.endFill();
          fillNoise(g, rng, 0x2D77AA, 140, 20);
          // Lighter blue patches suggesting shallow water over reef
          for (let i = 0; i < 6; i++) {
            g.beginFill(mix(0x3388BB, 0x4499CC, rng()), 0.15 + rng() * 0.12);
            g.drawEllipse(rng() * ts, rng() * ts, 5 + rng() * 6, 3 + rng() * 5);
            g.endFill();
          }
          // Subtle wave ripples matching ocean style
          for (let i = 0; i < 4; i++) {
            const wy = rng() * ts;
            g.lineStyle(1, mix(0x2266AA, 0x4488CC, rng()), 0.25);
            g.moveTo(0, wy);
            for (let x = 0; x <= ts; x += 3) {
              g.lineTo(x, wy + Math.sin(x * 0.25 + i) * 1.5);
            }
          }
          g.lineStyle(0);
          // Underwater coral structures — vibrant but lower opacity to feel submerged
          const coralColors = [0xDD6688, 0xDD8844, 0xDDCC44, 0xFF8866, 0xCC66AA];
          for (let i = 0; i < 7; i++) {
            const cx = 4 + rng() * (ts - 8), cy = 4 + rng() * (ts - 8);
            const cc = coralColors[Math.floor(rng() * coralColors.length)];
            // Core coral blob — reduced opacity for underwater look
            g.beginFill(cc, 0.45 + rng() * 0.15);
            g.drawCircle(cx, cy, 2 + rng() * 2);
            g.endFill();
            for (let b = 0; b < 3; b++) {
              const bx = cx + (rng() - 0.5) * 6;
              const by = cy + (rng() - 0.5) * 6;
              g.beginFill(brighten(cc, (rng() - 0.5) * 20), 0.35 + rng() * 0.15);
              g.drawCircle(bx, by, 1 + rng() * 1.5);
              g.endFill();
            }
          }
          // Blue-tinted water overlay to push coral further underwater
          g.beginFill(0x2266AA, 0.12);
          g.drawRect(0, 0, ts, ts);
          g.endFill();
          // Fish-like tiny dots — reduced opacity
          for (let i = 0; i < 5; i++) {
            const fc = rng() > 0.5 ? 0xFFCC00 : 0xFF6644;
            g.beginFill(fc, 0.35);
            g.drawEllipse(rng() * ts, rng() * ts, 1.5, 0.8);
            g.endFill();
          }
          break;
        }

        case 19: { // River Delta
          fillNoise(g, rng, base, 150, 22);
          // Dense vegetation between channels
          for (let i = 0; i < 30; i++) {
            g.beginFill(mix(0x50A048, 0x70B060, rng()), 0.4 + rng() * 0.3);
            g.drawEllipse(rng() * ts, rng() * ts, 2 + rng() * 3, 1.5 + rng() * 2);
            g.endFill();
          }
          // Main channel splitting into tributaries
          const startX = ts * 0.45 + rng() * ts * 0.1;
          g.lineStyle(3, 0x3088BB, 0.7);
          g.moveTo(startX, 0);
          g.quadraticCurveTo(startX + 2, ts * 0.15, startX + 1, ts * 0.3);
          g.lineStyle(2, 0x3088BB, 0.7);
          // Left branch
          g.moveTo(startX + 1, ts * 0.3);
          g.quadraticCurveTo(startX - 6, ts * 0.5, startX - 12, ts * 0.75);
          g.lineStyle(1, 0x3088BB, 0.6);
          g.lineTo(startX - 16, ts);
          // Middle branch
          g.lineStyle(2, 0x3088BB, 0.65);
          g.moveTo(startX + 1, ts * 0.3);
          g.quadraticCurveTo(startX + 2, ts * 0.55, startX, ts * 0.75);
          g.lineStyle(1, 0x3088BB, 0.55);
          g.lineTo(startX - 2, ts);
          // Right branch
          g.lineStyle(2, 0x3088BB, 0.65);
          g.moveTo(startX + 1, ts * 0.3);
          g.quadraticCurveTo(startX + 8, ts * 0.5, startX + 14, ts * 0.8);
          g.lineStyle(1, 0x3088BB, 0.5);
          g.lineTo(startX + 18, ts);
          // Far-right sub-branch
          g.lineStyle(1, 0x3088BB, 0.45);
          g.moveTo(startX + 8, ts * 0.5);
          g.lineTo(startX + 20, ts * 0.85);
          g.lineStyle(0);
          // Silt deposits near water
          for (let i = 0; i < 8; i++) {
            g.beginFill(mix(0xC0B080, 0xD0C090, rng()), 0.3 + rng() * 0.2);
            const sx2 = startX + (rng() - 0.5) * 20;
            const sy2 = ts * 0.4 + rng() * ts * 0.5;
            g.drawEllipse(sx2, sy2, 2 + rng() * 3, 1 + rng() * 2);
            g.endFill();
          }
          break;
        }
      }

      // Render normal texture
      const rt = PIXI.RenderTexture.create({ width: ts, height: ts });
      renderer.render(g, { renderTexture: rt });
      this.terrainTextures[id] = rt;

      // Render fog-dimmed variant
      const fogRt = PIXI.RenderTexture.create({ width: ts, height: ts });
      renderer.render(g, { renderTexture: fogRt });
      const overlay = new PIXI.Graphics();
      overlay.beginFill(0x000000, 0.6);
      overlay.drawRect(0, 0, ts, ts);
      overlay.endFill();
      renderer.render(overlay, { renderTexture: fogRt, clear: false });
      this.terrainFogTextures[id] = fogRt;

      g.destroy(true);
      overlay.destroy(true);
    }

    // Generate 16 coast autotile variants based on which edges border land
    this.generateCoastAutotiles();
  },

  generateCoastAutotiles() {
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
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const brighten = (c, amt) => rgb(clamp(rr(c) + amt), clamp(gg(c) + amt), clamp(bb(c) + amt));
    const darken = (c, amt) => brighten(c, -amt);
    const seed = (s) => { let v = s; return () => { v = (v * 1664525 + 1013904223) & 0xFFFFFFFF; return (v >>> 0) / 4294967296; }; };

    const waterBase = 0x4488BB;
    const sandColor = 0xD8C890;
    const sandDark = 0xC8B878;
    const sandLight = 0xE0D098;
    const foamColor = 0xFFFFFF;
    const deepWater = 0x2A6690;
    const waveColor1 = 0x5AA0CC;
    const waveColor2 = 0x88C0E0;

    this.coastTextures = [];
    this.coastFogTextures = [];

    for (let mask = 0; mask < 16; mask++) {
      const landN = !!(mask & 1);
      const landE = !!(mask & 2);
      const landS = !!(mask & 4);
      const landW = !!(mask & 8);
      const landCount = (landN ? 1 : 0) + (landE ? 1 : 0) + (landS ? 1 : 0) + (landW ? 1 : 0);

      const g = new PIXI.Graphics();
      const rng = seed(mask * 7717 + 4201);
      const beachWidth = 12;

      // Fill water base
      g.beginFill(waterBase);
      g.drawRect(0, 0, ts, ts);
      g.endFill();

      // Water noise
      for (let i = 0; i < 120; i++) {
        g.beginFill(mix(0x3878AA, 0x5098CC, rng()), 0.4 + rng() * 0.4);
        g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), 1 + Math.floor(rng() * 2), 1);
        g.endFill();
      }

      // Deeper water tint in center if surrounded by land
      if (landCount >= 3) {
        g.beginFill(deepWater, 0.3);
        g.drawEllipse(ts / 2, ts / 2, ts / 4, ts / 4);
        g.endFill();
      }

      // Wave arcs in water areas
      for (let i = 0; i < 5; i++) {
        const wy = 4 + i * (ts / 5);
        g.lineStyle(1, mix(waveColor1, waveColor2, rng()), 0.3 + rng() * 0.15);
        g.moveTo(0, wy);
        for (let x = 0; x <= ts; x += 4) {
          g.lineTo(x, wy + Math.sin(x * 0.2 + i * 1.3 + mask) * 2);
        }
      }
      g.lineStyle(0);

      // Draw sand strips on each land-bordering edge
      const edges = [
        { land: landN, drawSand: (depth, alpha) => { g.beginFill(sandColor, alpha); g.drawRect(0, 0, ts, depth); g.endFill(); }, foamY: (fy) => { return { x1: 0, y1: beachWidth - 1, x2: ts, y2: beachWidth - 1, dir: 'h' }; }, dir: 'N' },
        { land: landE, drawSand: (depth, alpha) => { g.beginFill(sandColor, alpha); g.drawRect(ts - depth, 0, depth, ts); g.endFill(); }, foamY: (fy) => { return { x1: ts - beachWidth, y1: 0, x2: ts - beachWidth, y2: ts, dir: 'v' }; }, dir: 'E' },
        { land: landS, drawSand: (depth, alpha) => { g.beginFill(sandColor, alpha); g.drawRect(0, ts - depth, ts, depth); g.endFill(); }, foamY: (fy) => { return { x1: 0, y1: ts - beachWidth, x2: ts, y2: ts - beachWidth, dir: 'h' }; }, dir: 'S' },
        { land: landW, drawSand: (depth, alpha) => { g.beginFill(sandColor, alpha); g.drawRect(0, 0, depth, ts); g.endFill(); }, foamY: (fy) => { return { x1: beachWidth, y1: 0, x2: beachWidth, y2: ts, dir: 'v' }; }, dir: 'W' }
      ];

      for (const edge of edges) {
        if (!edge.land) continue;

        // Sandy gradient from edge inward (multiple strips with decreasing alpha)
        for (let d = 0; d < beachWidth; d += 2) {
          const alpha = 0.9 - (d / beachWidth) * 0.7;
          const col = mix(sandColor, waterBase, d / beachWidth);
          g.beginFill(col, alpha);
          if (edge.dir === 'N') g.drawRect(0, d, ts, 2);
          else if (edge.dir === 'S') g.drawRect(0, ts - beachWidth + d, ts, 2);
          else if (edge.dir === 'E') g.drawRect(ts - beachWidth + d, 0, 2, ts);
          else if (edge.dir === 'W') g.drawRect(d, 0, 2, ts);
          g.endFill();
        }

        // Sand noise on beach portion
        for (let i = 0; i < 35; i++) {
          g.beginFill(mix(sandDark, sandLight, rng()), 0.4 + rng() * 0.4);
          let sx, sy;
          if (edge.dir === 'N') { sx = Math.floor(rng() * ts); sy = Math.floor(rng() * beachWidth); }
          else if (edge.dir === 'S') { sx = Math.floor(rng() * ts); sy = ts - beachWidth + Math.floor(rng() * beachWidth); }
          else if (edge.dir === 'E') { sx = ts - beachWidth + Math.floor(rng() * beachWidth); sy = Math.floor(rng() * ts); }
          else { sx = Math.floor(rng() * beachWidth); sy = Math.floor(rng() * ts); }
          g.drawRect(sx, sy, 1, 1);
          g.endFill();
        }

        // Foam/surf line at the water-sand boundary
        const foam = edge.foamY();
        if (foam.dir === 'h') {
          for (let x = 0; x < ts; x += 2) {
            const fy = foam.y1 + Math.sin(x * 0.3 + mask * 0.7) * 1.5;
            g.beginFill(foamColor, 0.5 + rng() * 0.3);
            g.drawRect(x, fy, 2 + rng() * 2, 1.5);
            g.endFill();
          }
        } else {
          for (let y = 0; y < ts; y += 2) {
            const fx = foam.x1 + Math.sin(y * 0.3 + mask * 0.7) * 1.5;
            g.beginFill(foamColor, 0.5 + rng() * 0.3);
            g.drawRect(fx, y, 1.5, 2 + rng() * 2);
            g.endFill();
          }
        }

        // Gentle wave arcs near shore
        g.lineStyle(1, mix(waveColor1, waveColor2, rng()), 0.25);
        for (let w = 0; w < 2; w++) {
          const offset = beachWidth + 2 + w * 5;
          if (edge.dir === 'N') {
            g.moveTo(0, offset);
            for (let x = 0; x <= ts; x += 4) g.lineTo(x, offset + Math.sin(x * 0.25 + w) * 1.5);
          } else if (edge.dir === 'S') {
            g.moveTo(0, ts - offset);
            for (let x = 0; x <= ts; x += 4) g.lineTo(x, ts - offset + Math.sin(x * 0.25 + w) * 1.5);
          } else if (edge.dir === 'E') {
            g.moveTo(ts - offset, 0);
            for (let y = 0; y <= ts; y += 4) g.lineTo(ts - offset + Math.sin(y * 0.25 + w) * 1.5, y);
          } else {
            g.moveTo(offset, 0);
            for (let y = 0; y <= ts; y += 4) g.lineTo(offset + Math.sin(y * 0.25 + w) * 1.5, y);
          }
        }
        g.lineStyle(0);
      }

      // Corner handling: fill sand in corners where two adjacent edges both have land
      const corners = [
        { a: landN, b: landE, x: ts - beachWidth, y: 0 },
        { a: landE, b: landS, x: ts - beachWidth, y: ts - beachWidth },
        { a: landS, b: landW, x: 0, y: ts - beachWidth },
        { a: landN, b: landW, x: 0, y: 0 }
      ];
      for (const corner of corners) {
        if (corner.a && corner.b) {
          // Fill corner with solid sand
          g.beginFill(sandColor, 0.85);
          g.drawRect(corner.x, corner.y, beachWidth, beachWidth);
          g.endFill();
          // Sand noise in corner
          for (let i = 0; i < 10; i++) {
            g.beginFill(mix(sandDark, sandLight, rng()), 0.5 + rng() * 0.3);
            g.drawRect(corner.x + Math.floor(rng() * beachWidth), corner.y + Math.floor(rng() * beachWidth), 1, 1);
            g.endFill();
          }
        }
      }

      // All-land (island lagoon, mask=15): mostly sand with small central water pool
      if (landCount === 4) {
        g.beginFill(sandColor, 0.9);
        g.drawRect(0, 0, ts, ts);
        g.endFill();
        for (let i = 0; i < 60; i++) {
          g.beginFill(mix(sandDark, sandLight, rng()), 0.4 + rng() * 0.4);
          g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), 1, 1);
          g.endFill();
        }
        // Small central water pool
        g.beginFill(waterBase, 0.8);
        g.drawEllipse(ts / 2, ts / 2, 8 + rng() * 4, 6 + rng() * 4);
        g.endFill();
        g.beginFill(brighten(waterBase, 15), 0.4);
        g.drawEllipse(ts / 2, ts / 2, 5, 4);
        g.endFill();
        // Foam ring around pool
        g.lineStyle(1, foamColor, 0.4);
        g.drawEllipse(ts / 2, ts / 2, 9, 7);
        g.lineStyle(0);
      }

      // White wave caps in remaining water areas
      for (let i = 0; i < 6; i++) {
        g.beginFill(0xFFFFFF, 0.12 + rng() * 0.15);
        g.drawRect(Math.floor(rng() * ts), Math.floor(rng() * ts), 2 + Math.floor(rng() * 2), 1);
        g.endFill();
      }

      // Render normal coast texture
      const rt = PIXI.RenderTexture.create({ width: ts, height: ts });
      renderer.render(g, { renderTexture: rt });
      this.coastTextures[mask] = rt;

      // Render fog variant
      const fogRt = PIXI.RenderTexture.create({ width: ts, height: ts });
      renderer.render(g, { renderTexture: fogRt });
      const fogOverlay = new PIXI.Graphics();
      fogOverlay.beginFill(0x000000, 0.6);
      fogOverlay.drawRect(0, 0, ts, ts);
      fogOverlay.endFill();
      renderer.render(fogOverlay, { renderTexture: fogRt, clear: false });
      this.coastFogTextures[mask] = fogRt;

      g.destroy(true);
      fogOverlay.destroy(true);
    }
  },

  getCardinalNeighborTerrains(r, c) {
    const h = Game.state.mapHeight;
    const w = Game.state.mapWidth;
    const eT = Game.mapData[r][(c + 1) % w].terrain;
    const wT = Game.mapData[r][(c - 1 + w) % w].terrain;
    const nT = Game.mapData[(r - 1 + h) % h][c].terrain;
    const sT = Game.mapData[(r + 1) % h][c].terrain;
    return [nT, eT, sT, wT];
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
      // Wrap horizontally and vertically (flat torus)
      const totalW = Game.state.mapWidth * this.tileSize;
      const totalH = Game.state.mapHeight * this.tileSize;
      this.camera.x = ((this.camera.x % totalW) + totalW) % totalW;
      this.camera.y = ((this.camera.y % totalH) + totalH) % totalH;
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
        // Wrap horizontally and vertically (flat torus)
        const totalW = Game.state.mapWidth * this.tileSize;
        const totalH = Game.state.mapHeight * this.tileSize;
        this.camera.x = ((this.camera.x % totalW) + totalW) % totalW;
        this.camera.y = ((this.camera.y % totalH) + totalH) % totalH;
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

    // Row from Y (wrap vertically)
    const totalMapWidth = eqWidth * ts;
    const totalMapHeight = mapHeight * ts;
    let wrappedY = ((worldY % totalMapHeight) + totalMapHeight) % totalMapHeight;
    const row = Math.floor(wrappedY / ts);
    if (row < 0 || row >= mapHeight) return;

    const rw = Game.rowWidths[row];
    const tileW = totalMapWidth / rw;

    let colX = ((worldX % totalMapWidth) + totalMapWidth) % totalMapWidth;
    const col = Math.floor(colX / tileW);
    if (col < 0 || col >= rw) return;

    const tile = Game.getTile(row, col);
    if (!tile) return;

    // Check fog
    if (!tile.fogState || tile.fogState[0] !== 2) return;

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
    const totalMapHeight = mapHeight * ts;
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const zoom = this.camera.zoom;

    // Determine visible area
    const viewLeft = this.camera.x - screenW / (2 * zoom);
    const viewRight = this.camera.x + screenW / (2 * zoom);
    const viewTop = this.camera.y - screenH / (2 * zoom);
    const viewBottom = this.camera.y + screenH / (2 * zoom);

    // With vertical wrapping, iterate all rows; per-tile visibility checks handle culling
    const minRow = 0;
    const maxRow = mapHeight - 1;

    this.mapContainer.scale.set(zoom);
    this.mapContainer.position.set(
      screenW / 2 - this.camera.x * zoom,
      screenH / 2 - this.camera.y * zoom
    );

    for (let r = minRow; r <= maxRow; r++) {
      const rw = Game.rowWidths[r];
      for (let c = 0; c < rw; c++) {
        const tile = Game.mapData[r][c];
        // Scale tile width so every row fills totalMapWidth
        const tileW = totalMapWidth / rw;
        const basePx = c * tileW;

        // Draw tile at normal position and wrapped positions for seamless scroll (both axes)
        for (const wrapX of [0, -totalMapWidth, totalMapWidth]) {
          for (const wrapY of [0, -totalMapHeight, totalMapHeight]) {
          const px = basePx + wrapX;
          const py = r * ts + wrapY;

          // Check if visible on screen (approximate)
          if (px + tileW < viewLeft - ts * 2 || px > viewRight + ts * 2) continue;
          if (py + ts < viewTop - ts * 2 || py > viewBottom + ts * 2) continue;

        const fog = tile.fogState ? (tile.fogState[0] || 0) : 0;
        if (fog === 0) continue; // Unexplored — skip

        const terrain = TERRAINS[tile.terrain];

        // Terrain tile — use pre-generated textured sprites
        // For coast tiles, select autotile variant based on neighbors
        let tex;
        if (tile.terrain === 16 && this.coastTextures.length > 0) {
          const [nT, eT, sT, wT] = this.getCardinalNeighborTerrains(r, c);
          const coastMask = (!isWaterTerrain(nT) ? 1 : 0) | (!isWaterTerrain(eT) ? 2 : 0) | (!isWaterTerrain(sT) ? 4 : 0) | (!isWaterTerrain(wT) ? 8 : 0);
          tex = fog === 1 ? this.coastFogTextures[coastMask] : this.coastTextures[coastMask];
        } else {
          tex = fog === 1 ? this.terrainFogTextures[tile.terrain] : this.terrainTextures[tile.terrain];
        }
        const tileSprite = new PIXI.Sprite(tex);
        tileSprite.position.set(px, py);
        tileSprite.width = tileW;
        tileSprite.height = ts;
        // Subtle per-tile variation via hash of (r, c)
        const hash = ((r * 7919 + c * 6271) & 0xFFFF) / 65535;
        const tintAmt = hash * 0.08;
        const tR = Math.round(255 + (((terrain.color >> 16) & 0xFF) - 255) * tintAmt);
        const tG = Math.round(255 + (((terrain.color >> 8) & 0xFF) - 255) * tintAmt);
        const tB = Math.round(255 + ((terrain.color & 0xFF) - 255) * tintAmt);
        tileSprite.tint = (tR << 16) | (tG << 8) | tB;
        this.terrainLayer.addChild(tileSprite);

        // Edge blending overlay for terrain transitions
        if (fog === 2) {
          const [nT, eT, sT, wT] = this.getCardinalNeighborTerrains(r, c);
          const myCat = getTerrainCategory(tile.terrain);
          const myIsWater = isWaterTerrain(tile.terrain);
          const cardinals = [nT, eT, sT, wT]; // N, E, S, W
          const edgeGfx = new PIXI.Graphics();
          let hasEdge = false;
          const stripWidth = 10;
          const steps = 5;
          const stepSize = stripWidth / steps;

          for (let dir = 0; dir < 4; dir++) {
            const nt = cardinals[dir];
            if (nt < 0) continue;
            if (nt === tile.terrain) continue; // blend whenever terrain IDs differ
            const nCat = getTerrainCategory(nt);
            const nIsWater = isWaterTerrain(nt);
            const sameCat = (nCat === myCat);

            hasEdge = true;

            // Same-category transitions get subtle/thin blending
            const blendStrip = sameCat ? 6 : stripWidth;
            const blendSteps = sameCat ? 3 : steps;
            const blendAlpha = sameCat ? 0.15 : 0.25;
            const blendStepSize = blendStrip / blendSteps;

            if (myIsWater && !nIsWater) {
              const nColor = TERRAINS[nt].color;
              for (let s = 0; s < blendSteps; s++) {
                const alpha = 0.2 * (1 - s / blendSteps);
                edgeGfx.beginFill(nColor, alpha);
                if (dir === 0) edgeGfx.drawRect(px, py + ts - blendStrip + s * blendStepSize, tileW, blendStepSize);
                else if (dir === 1) edgeGfx.drawRect(px + tileW - blendStrip + s * blendStepSize, py, blendStepSize, ts);
                else if (dir === 2) edgeGfx.drawRect(px, py + s * blendStepSize, tileW, blendStepSize);
                else edgeGfx.drawRect(px + s * blendStepSize, py, blendStepSize, ts);
                edgeGfx.endFill();
              }
            } else if (!myIsWater && nIsWater) {
              const shoreColor = 0x8B7355;
              for (let s = 0; s < 3; s++) {
                const alpha = 0.18 * (1 - s / 3);
                edgeGfx.beginFill(shoreColor, alpha);
                if (dir === 0) edgeGfx.drawRect(px, py + ts - 4 + s, tileW, 1.5);
                else if (dir === 1) edgeGfx.drawRect(px + tileW - 4 + s, py, 1.5, ts);
                else if (dir === 2) edgeGfx.drawRect(px, py + s, tileW, 1.5);
                else edgeGfx.drawRect(px + s, py, 1.5, ts);
                edgeGfx.endFill();
              }
            } else {
              const nColor = TERRAINS[nt].color;
              for (let s = 0; s < blendSteps; s++) {
                const alpha = blendAlpha * (1 - s / blendSteps);
                edgeGfx.beginFill(nColor, alpha);
                if (dir === 0) edgeGfx.drawRect(px, py + ts - blendStrip + s * blendStepSize, tileW, blendStepSize);
                else if (dir === 1) edgeGfx.drawRect(px + tileW - blendStrip + s * blendStepSize, py, blendStepSize, ts);
                else if (dir === 2) edgeGfx.drawRect(px, py + s * blendStepSize, tileW, blendStepSize);
                else edgeGfx.drawRect(px + s * blendStepSize, py, blendStepSize, ts);
                edgeGfx.endFill();
              }
            }
          }

          if (hasEdge) this.terrainLayer.addChild(edgeGfx);
          else edgeGfx.destroy(true);
        }

        // Territory border coloring
        if (tile.owner >= 0 && fog === 2) {
          const ownerColor = parseInt(CIV_COLORS[tile.owner].replace('#',''), 16);
          const borderGfx = new PIXI.Graphics();
          borderGfx.beginFill(ownerColor, 0.12);
          borderGfx.drawRect(px, py, tileW - 1, ts - 1);
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
            cityBg.drawRoundedRect(px + 2, py + 2, tileW - 5, ts - 5, 4);
            cityBg.endFill();
            cityBg.lineStyle(2, ownerColor);
            cityBg.drawRoundedRect(px + 2, py + 2, tileW - 5, ts - 5, 4);
            this.cityLayer.addChild(cityBg);

            // City population number
            const popText = new PIXI.Text(city.population.toString(), {
              fontSize: 12, fill: 0xFFFFFF, fontWeight: 'bold'
            });
            popText.anchor.set(0.5);
            popText.position.set(px + tileW / 2, py + ts / 2);
            this.cityLayer.addChild(popText);

            // City name label above
            const nameText = new PIXI.Text(city.name, {
              fontSize: 9, fill: 0xFFFFFF, fontWeight: 'bold',
              stroke: 0x000000, strokeThickness: 2
            });
            nameText.anchor.set(0.5, 1);
            nameText.position.set(px + tileW / 2, py - 1);
            this.cityLayer.addChild(nameText);

            // HP bar if damaged
            if (city.hp < city.maxHp) {
              const hpPct = city.hp / city.maxHp;
              const hpBar = new PIXI.Graphics();
              hpBar.beginFill(0x333333);
              hpBar.drawRect(px + 2, py + ts - 4, tileW - 5, 3);
              hpBar.endFill();
              hpBar.beginFill(hpPct > 0.5 ? 0x4caf50 : hpPct > 0.25 ? 0xff9800 : 0xe94560);
              hpBar.drawRect(px + 2, py + ts - 4, (tileW - 5) * hpPct, 3);
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
            unitGfx.moveTo(px + tileW/2, py + 4);
            unitGfx.lineTo(px + tileW - 4, py + ts/2);
            unitGfx.lineTo(px + tileW/2, py + ts - 4);
            unitGfx.lineTo(px + 4, py + ts/2);
            unitGfx.closePath();
            unitGfx.endFill();
          } else if (uType.type === 'civilian' || uType.type === 'settler') {
            // Civilian: circle
            unitGfx.beginFill(ownerColor, 0.85);
            unitGfx.drawCircle(px + tileW/2, py + ts/2, ts/3);
            unitGfx.endFill();
          } else {
            // Military: square with border
            unitGfx.lineStyle(2, ownerColor);
            unitGfx.beginFill(ownerColor, 0.7);
            unitGfx.drawRoundedRect(px + 5, py + 5, tileW - 11, ts - 11, 3);
            unitGfx.endFill();
          }
          this.unitLayer.addChild(unitGfx);

          // Unit type icon
          const icon = this.getUnitIcon(uType);
          const unitText = new PIXI.Text(icon, {
            fontSize: 11, fill: 0xFFFFFF
          });
          unitText.anchor.set(0.5);
          unitText.position.set(px + tileW/2, py + ts/2);
          this.unitLayer.addChild(unitText);

          // HP bar if damaged
          if (unit.hp < 100) {
            const hpPct = unit.hp / 100;
            const hpBar = new PIXI.Graphics();
            hpBar.beginFill(0x333333);
            hpBar.drawRect(px + 4, py + ts - 6, tileW - 9, 3);
            hpBar.endFill();
            hpBar.beginFill(hpPct > 0.5 ? 0x4caf50 : hpPct > 0.25 ? 0xff9800 : 0xe94560);
            hpBar.drawRect(px + 4, py + ts - 6, (tileW - 9) * hpPct, 3);
            hpBar.endFill();
            this.unitLayer.addChild(hpBar);
          }

          // Fortified indicator
          if (unit.fortified) {
            const fort = new PIXI.Text('🛡', {fontSize: 8});
            fort.position.set(px + tileW - 12, py + 1);
            this.unitLayer.addChild(fort);
          }
          } // end else (not animating unit)
        }
        } // end wrapY loop
        } // end wrapX loop
      }
    }

    // Movement highlights
    if (Game.movementRange) {
      for (const [key, mvLeft] of Game.movementRange) {
        const [r, c] = key.split(',').map(Number);
        const rw = Game.rowWidths[r];
        const tileW = totalMapWidth / rw;
        const basePx = c * tileW;

        for (const wrapX of [0, -totalMapWidth, totalMapWidth]) {
          for (const wrapY of [0, -totalMapHeight, totalMapHeight]) {
          const px = basePx + wrapX;
          const py = r * ts + wrapY;
          if (px + tileW < viewLeft - ts * 2 || px > viewRight + ts * 2) continue;
          if (py + ts < viewTop - ts * 2 || py > viewBottom + ts * 2) continue;
          const hl = new PIXI.Graphics();
          if (mvLeft >= 0) {
            hl.beginFill(0x53a8b6, 0.3);
            hl.lineStyle(1, 0x53a8b6, 0.7);
          } else {
            hl.beginFill(0xe94560, 0.3);
            hl.lineStyle(1, 0xe94560, 0.7);
          }
          hl.drawRect(px, py, tileW - 1, ts - 1);
          hl.endFill();
          this.highlightLayer.addChild(hl);
          }
        }
      }
    }

    // Selected unit highlight
    if (Game.selectedUnit) {
      const u = Game.selectedUnit;
      const rw = Game.rowWidths[u.r];
      const tileW = totalMapWidth / rw;
      const px = u.c * tileW;
      const py = u.r * ts;

      const sel = new PIXI.Graphics();
      sel.lineStyle(2, 0xf0c040);
      sel.drawRect(px - 1, py - 1, tileW + 1, ts + 1);
      this.highlightLayer.addChild(sel);
    }
  },

  // ========== ANIMATION ==========

  getTilePixelCenter(r, c) {
    const ts = this.tileSize;
    const rw = Game.rowWidths[r];
    const totalMapWidth = Game.state.mapWidth * ts;
    const tileW = totalMapWidth / rw;
    return {
      x: c * tileW + tileW / 2,
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
    const rw = Game.rowWidths[r];
    const totalMapWidth = Game.state.mapWidth * ts;
    const tileW = totalMapWidth / rw;

    this.camera.x = c * tileW + tileW / 2;
    this.camera.y = r * ts + ts / 2;
    this.render();
    this.updateMinimap();
  },

  minimapClick(e) {
    if (!Game.state) return;
    const canvas = document.getElementById('minimap');
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const scaleX = canvas.width / Game.state.mapWidth;
    const scaleY = canvas.height / Game.state.mapHeight;
    const tileCol = mx / scaleX;
    const tileRow = my / scaleY;
    this.camera.x = tileCol * this.tileSize;
    this.camera.y = tileRow * this.tileSize;
    // Wrap both axes (flat torus)
    const totalW = Game.state.mapWidth * this.tileSize;
    const totalH = Game.state.mapHeight * this.tileSize;
    this.camera.x = ((this.camera.x % totalW) + totalW) % totalW;
    this.camera.y = ((this.camera.y % totalH) + totalH) % totalH;
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
      for (let c = 0; c < rw; c++) {
        const tile = Game.mapData[r][c];
        if (!tile.fogState || tile.fogState[0] === 0) continue;

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
          Math.floor(c * scaleX),
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
    // Draw viewport rect with wrapping on both axes
    const rw = viewW * scaleX;
    const rh = viewH * scaleY;
    for (const dx of [0, -w, w]) {
      for (const dy of [0, -h, h]) {
        ctx.strokeRect(viewL * scaleX + dx, viewT * scaleY + dy, rw, rh);
      }
    }
  }
};
