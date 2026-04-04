// TileForge — Core Game Engine
"use strict";

const Game = {
  state: null,
  mapData: null,
  selectedUnit: null,
  selectedCity: null,
  movementRange: null,
  attackTargets: null,

  // Initialize a new game
  init(config) {
    const sz = MAP_SIZES[config.mapSize];
    const diff = DIFFICULTY[config.difficulty];
    this.state = {
      config,
      turn: 1,
      mapWidth: sz.eqWidth,
      mapHeight: sz.rows,
      difficulty: diff,
      players: [],
      nextCityId: 1,
      nextUnitId: 1,
      usedCityNames: [],
      builtWonders: {}, // wonderId -> playerId
      gameOver: false,
      winner: null,
      marsShuttles: {} // playerId -> count
    };

    // Build map
    this.buildMap();
    this.generateTerrain();
    this.placeResources();

    // Create players
    const colors = [...CIV_COLORS];
    // Player 0 = human
    this.state.players.push(this.createPlayer(0, config.civName, colors[0], false, diff));
    for (let i = 0; i < config.aiCount; i++) {
      const aiNames = ['Caesar','Cleopatra','Genghis','Victoria','Montezuma','Bismarck','Tokugawa','Catherine'];
      this.state.players.push(this.createPlayer(i+1, aiNames[i]||'AI '+(i+1), colors[i+1]||'#888', true, diff));
    }

    // Place starting positions
    this.placeStartingPositions();

    // Grant starting techs
    for (const p of this.state.players) {
      for (const t of TECHS.filter(t => t.era === 'caveman' && t.prereqs.length === 0)) {
        p.techs.add(t.id);
      }
      // AI starting bonuses for higher difficulty
      if (p.isAI && diff.startBonus) {
        const sb = diff.startBonus;
        if (sb.techs) {
          const available = TECHS.filter(t => !p.techs.has(t.id) && t.prereqs.every(pr => p.techs.has(pr)));
          for (let j = 0; j < sb.techs && j < available.length; j++) p.techs.add(available[j].id);
        }
        if (sb.gold) p.gold += sb.gold;
      }
    }

    this.updateFogOfWar();
    return this.state;
  },

  createPlayer(id, name, color, isAI, diff) {
    return {
      id, name, color, isAI,
      cities: [],
      units: [],
      techs: new Set(),
      currentResearch: null,
      researchProgress: 0,
      gold: 0,
      totalScience: 0,
      totalCulture: 0,
      totalHistory: 0,
      happiness: 0,
      era: 'caveman',
      alive: true,
      resMod: isAI ? diff.aiRes : diff.pRes,
      devMod: isAI ? diff.aiDev : diff.pDev,
      combatMod: isAI ? diff.aiCombat : 1.0,
      strategicRes: {} // resourceId -> count
    };
  },

  // ========== MAP GENERATION ==========

  buildMap() {
    const {mapWidth, mapHeight} = this.state;
    this.mapData = [];
    this.rowWidths = [];
    for (let r = 0; r < mapHeight; r++) {
      const lat = -90 + (r + 0.5) * (180 / mapHeight);
      const w = Math.max(1, Math.round(mapWidth * Math.cos(lat * Math.PI / 180)));
      this.rowWidths.push(w);
      const row = [];
      for (let c = 0; c < w; c++) {
        row.push({
          r, c, terrain: 17, // ocean default
          resource: null,
          improvement: null,
          road: false,
          owner: -1,
          cityId: null,
          unit: null,
          fogState: new Array(this.state.config.aiCount + 1).fill(0) // 0=unexplored, 1=explored, 2=visible
        });
      }
      this.mapData.push(row);
    }
  },

  generateTerrain() {
    const {mapWidth, mapHeight} = this.state;
    const seed = Math.random() * 10000;

    // Simple Perlin-like noise using sin combinations
    const noise = (x, y, s) => {
      const n = Math.sin(x * 12.9898 * s + y * 78.233 * s + seed) * 43758.5453;
      return n - Math.floor(n);
    };
    const fbm = (x, y, oct) => {
      let v = 0, amp = 0.5, freq = 1;
      for (let i = 0; i < oct; i++) {
        v += amp * noise(x * freq, y * freq, 1.0);
        amp *= 0.5; freq *= 2;
      }
      return v;
    };

    for (let r = 0; r < mapHeight; r++) {
      const lat = -90 + (r + 0.5) * (180 / mapHeight);
      const absLat = Math.abs(lat);
      const w = this.rowWidths[r];
      for (let c = 0; c < w; c++) {
        const lon = (c / w) * 360;
        const nx = lon / 360;
        const ny = r / mapHeight;

        const elev = fbm(nx * 4, ny * 4, 5);
        const moist = fbm(nx * 3 + 100, ny * 3 + 100, 4);
        const temp = 1.0 - (absLat / 90); // 1=equator, 0=pole

        let terrain;

        // Poles
        if (absLat > 82) {
          terrain = 0; // Ice Sheet
        } else if (absLat > 70) {
          terrain = elev > 0.55 ? 1 : (elev > 0.4 ? 1 : 3); // Tundra or Frozen Coast
          if (elev < 0.35) terrain = 3;
        }
        // Water vs land based on elevation
        else if (elev < 0.38) {
          // Water
          if (elev < 0.25) terrain = 17; // Ocean
          else if (temp > 0.6 && moist > 0.6) terrain = 18; // Reef
          else terrain = 16; // Coast
        }
        // Land
        else if (absLat > 58) {
          // Cold zone
          terrain = moist > 0.5 ? 2 : 1; // Taiga or Tundra
        } else if (absLat > 25) {
          // Temperate zone
          if (elev > 0.82) terrain = 8; // Mountains
          else if (elev > 0.72) terrain = 7; // Hills
          else if (moist > 0.7) terrain = 9; // Wetland
          else if (moist > 0.55) terrain = 6; // Forest
          else if (moist > 0.4) terrain = 4; // Grassland
          else terrain = 5; // Plains
        } else if (temp > 0.7 && moist < 0.35) {
          // Arid zone
          if (elev > 0.75) terrain = 12; // Mesa
          else if (moist > 0.25 && Math.random() < 0.05) terrain = 13; // Oasis (rare)
          else if (moist > 0.2) terrain = 11; // Savanna
          else terrain = 10; // Desert
        } else {
          // Tropical zone
          if (elev > 0.8) terrain = 15; // Volcanic (rare)
          else if (moist > 0.5) terrain = 14; // Jungle
          else if (moist > 0.35) terrain = 11; // Savanna
          else terrain = 10; // Desert
        }

        // River deltas near coast transitions
        if (!TERRAINS[terrain].water && Math.random() < 0.02 && moist > 0.5) {
          // Check if adjacent to water
          const neighbors = this.getNeighbors(r, c);
          const hasWater = neighbors.some(n => n && TERRAINS[this.mapData[n.r][n.c].terrain].water);
          if (hasWater && temp > 0.4) terrain = 19; // River Delta
        }

        this.mapData[r][c].terrain = terrain;
      }
    }

    // Ensure coast tiles exist between land and ocean
    for (let r = 0; r < mapHeight; r++) {
      for (let c = 0; c < this.rowWidths[r]; c++) {
        const tile = this.mapData[r][c];
        if (tile.terrain === 17) { // Ocean
          const neighbors = this.getNeighbors(r, c);
          const hasLand = neighbors.some(n => n && !TERRAINS[this.mapData[n.r][n.c].terrain].water);
          if (hasLand) tile.terrain = 16; // Convert to coast
        }
      }
    }
  },

  placeResources() {
    const {mapHeight} = this.state;
    for (let r = 0; r < mapHeight; r++) {
      for (let c = 0; c < this.rowWidths[r]; c++) {
        if (Math.random() > 0.15) continue; // 15% chance
        const tile = this.mapData[r][c];
        const eligible = RESOURCES.filter(res => res.terrains.includes(tile.terrain));
        if (eligible.length > 0) {
          tile.resource = eligible[Math.floor(Math.random() * eligible.length)];
        }
      }
    }
  },

  // ========== TILE ADJACENCY (spherical) ==========

  getNeighbors(r, c) {
    const h = this.state.mapHeight;
    const results = [];
    // East
    const ew = this.rowWidths[r];
    results.push({r, c: (c + 1) % ew});
    // West
    results.push({r, c: (c - 1 + ew) % ew});
    // North
    if (r < h - 1) {
      const nw = this.rowWidths[r + 1];
      const nc = Math.round(c * nw / ew) % nw;
      results.push({r: r + 1, c: nc});
    }
    // South
    if (r > 0) {
      const sw = this.rowWidths[r - 1];
      const sc = Math.round(c * sw / ew) % sw;
      results.push({r: r - 1, c: sc});
    }
    // Diagonals (NE, NW, SE, SW)
    if (r < h - 1) {
      const nw = this.rowWidths[r + 1];
      const nc = Math.round(c * nw / ew);
      results.push({r: r+1, c: (nc + 1) % nw});
      results.push({r: r+1, c: (nc - 1 + nw) % nw});
    }
    if (r > 0) {
      const sw = this.rowWidths[r - 1];
      const sc = Math.round(c * sw / ew);
      results.push({r: r-1, c: (sc + 1) % sw});
      results.push({r: r-1, c: (sc - 1 + sw) % sw});
    }
    return results;
  },

  getTile(r, c) {
    if (r < 0 || r >= this.state.mapHeight) return null;
    const w = this.rowWidths[r];
    return this.mapData[r][((c % w) + w) % w];
  },

  tileDist(r1, c1, r2, c2) {
    // Approximate distance on spherical grid
    const w1 = this.rowWidths[r1], w2 = this.rowWidths[r2];
    const lon1 = c1 / w1, lon2 = c2 / w2;
    let dLon = Math.abs(lon1 - lon2);
    if (dLon > 0.5) dLon = 1 - dLon;
    const avgW = (w1 + w2) / 2;
    const dx = dLon * avgW;
    const dy = Math.abs(r1 - r2);
    return Math.sqrt(dx * dx + dy * dy);
  },

  // ========== STARTING POSITIONS ==========

  placeStartingPositions() {
    const players = this.state.players;
    const {mapHeight} = this.state;
    const positions = [];

    // Find good starting tiles (land, decent food, not too extreme)
    const candidates = [];
    for (let r = Math.floor(mapHeight * 0.15); r < Math.floor(mapHeight * 0.85); r++) {
      for (let c = 0; c < this.rowWidths[r]; c++) {
        const tile = this.mapData[r][c];
        const t = TERRAINS[tile.terrain];
        if (t.water || t.mv >= 99) continue;
        if (t.food >= 1 || tile.resource) {
          // Check neighbors for food
          const neighbors = this.getNeighbors(r, c);
          let foodCount = 0;
          for (const n of neighbors) {
            const nt = this.mapData[n.r][n.c];
            foodCount += TERRAINS[nt.terrain].food;
          }
          if (foodCount >= 4) {
            candidates.push({r, c, score: foodCount + (tile.resource ? 3 : 0)});
          }
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    // Pick well-spaced positions
    for (const p of players) {
      let best = null;
      let bestDist = 0;
      for (const cand of candidates) {
        let minDist = Infinity;
        for (const pos of positions) {
          const d = this.tileDist(cand.r, cand.c, pos.r, pos.c);
          if (d < minDist) minDist = d;
        }
        if (positions.length === 0) minDist = 1000;
        if (minDist > bestDist) {
          bestDist = minDist;
          best = cand;
        }
      }
      if (best) {
        positions.push(best);
        // Found a city for this player
        const city = this.foundCity(p.id, best.r, best.c);
        // Create starting units
        const neighbors = this.getNeighbors(best.r, best.c);
        const landNeighbors = neighbors.filter(n => !TERRAINS[this.mapData[n.r][n.c].terrain].water && TERRAINS[this.mapData[n.r][n.c].terrain].mv < 99);
        let placed = 0;
        // Scout
        if (landNeighbors.length > placed) {
          this.createUnit(p.id, 'scout', landNeighbors[placed].r, landNeighbors[placed].c);
          placed++;
        }
        // Club Warrior
        if (landNeighbors.length > placed) {
          this.createUnit(p.id, 'club_warrior', landNeighbors[placed].r, landNeighbors[placed].c);
          placed++;
        }
        // Gatherer
        if (landNeighbors.length > placed) {
          this.createUnit(p.id, 'gatherer', landNeighbors[placed].r, landNeighbors[placed].c);
          placed++;
        }
        // AI bonus units
        if (p.isAI && this.state.difficulty.startBonus) {
          const sb = this.state.difficulty.startBonus;
          for (let i = 0; i < (sb.warriors||0) && placed < landNeighbors.length; i++) {
            this.createUnit(p.id, 'club_warrior', landNeighbors[placed].r, landNeighbors[placed].c);
            placed++;
          }
        }
      }
    }
  },

  // ========== CITY MANAGEMENT ==========

  foundCity(playerId, r, c, name) {
    const p = this.state.players[playerId];
    if (!name) {
      const available = CITY_NAMES.filter(n => !this.state.usedCityNames.includes(n));
      name = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : 'City ' + this.state.nextCityId;
    }
    this.state.usedCityNames.push(name);

    const city = {
      id: this.state.nextCityId++,
      name,
      owner: playerId,
      r, c,
      population: 1,
      food: 0,
      foodNeeded: 15,
      production: 0,
      buildings: [],
      buildQueue: null, // {type:'building'|'unit'|'wonder', id, progress, cost}
      happiness: 3,
      defense: 100,
      defenseStr: 7,
      hp: 100,
      maxHp: 110,
    };

    p.cities.push(city);
    this.mapData[r][c].cityId = city.id;
    this.mapData[r][c].owner = playerId;

    // Claim surrounding tiles
    const neighbors = this.getNeighbors(r, c);
    for (const n of neighbors) {
      const tile = this.mapData[n.r][n.c];
      if (tile.owner === -1) tile.owner = playerId;
    }

    return city;
  },

  getCityTier(pop) {
    for (let i = CITY_TIERS.length - 1; i >= 0; i--) {
      if (pop >= CITY_TIERS[i].pop) return i;
    }
    return 0;
  },

  getCityYields(city) {
    const p = this.state.players[city.owner];
    const tier = this.getCityTier(city.population);
    const radius = CITY_TIERS[tier].radius;

    let food = 0, prod = 0, gold = 0, sci = 0, cul = 0, hist = 0;

    // Tile yields (citizens work tiles)
    const workedTiles = this.getWorkedTiles(city, radius);
    for (const wt of workedTiles) {
      const tile = this.mapData[wt.r][wt.c];
      const t = TERRAINS[tile.terrain];
      food += t.food;
      prod += t.prod;
      gold += t.gold;
      if (tile.resource && !tile.resource.revealTech) {
        food += tile.resource.food;
        prod += tile.resource.prod;
        gold += tile.resource.gold;
        sci += tile.resource.sci || 0;
      } else if (tile.resource && tile.resource.revealTech && p.techs.has(tile.resource.revealTech)) {
        food += tile.resource.food;
        prod += tile.resource.prod;
        gold += tile.resource.gold;
        sci += tile.resource.sci || 0;
      }
    }

    // Building yields
    let goldMod = 0, sciMod = 0, prodMod = 0, culMod = 0, growthMod = 0, allMod = 0, defBonus = 0;
    for (const bId of city.buildings) {
      const b = BUILDINGS.find(b => b.id === bId);
      if (!b) continue;
      food += b.food;
      prod += b.prod;
      gold += b.gold;
      sci += b.sci;
      cul += b.cul;
      if (b.goldMod) goldMod += b.goldMod;
      if (b.sciMod) sciMod += b.sciMod;
      if (b.prodMod) prodMod += b.prodMod;
      if (b.culMod) culMod += b.culMod;
      if (b.growthMod) growthMod += b.growthMod;
      if (b.allMod) allMod += b.allMod;
      if (b.defense) defBonus += b.defense;
    }

    // Wonder empire bonuses
    for (const [wId, ownerId] of Object.entries(this.state.builtWonders)) {
      if (ownerId !== city.owner) continue;
      const w = WONDERS.find(w => w.id === wId);
      if (!w) continue;
      if (w.empFood) food += w.empFood;
      if (w.empProd) prod += w.empProd;
      if (w.empCulture) cul += w.empCulture;
      if (w.empScience) sci += w.empScience;
    }

    // Science from population
    sci += Math.floor(city.population * 0.5);

    // Apply modifiers
    gold = Math.floor(gold * (1 + goldMod + allMod) * p.resMod);
    sci = Math.floor(sci * (1 + sciMod + allMod) * p.resMod);
    prod = Math.max(1, Math.floor(prod * (1 + prodMod + allMod) * p.resMod));
    cul = Math.floor(cul * (1 + culMod + allMod) * p.resMod);
    food = Math.floor(food * (1 + allMod) * p.resMod);

    return {food, prod, gold, sci, cul, hist, growthMod, defBonus};
  },

  getWorkedTiles(city, radius) {
    const tiles = [{r: city.r, c: city.c}]; // city center always worked
    const visited = new Set();
    visited.add(city.r + ',' + city.c);

    let frontier = [{r: city.r, c: city.c}];
    for (let ring = 0; ring < radius; ring++) {
      const nextFrontier = [];
      for (const f of frontier) {
        const neighbors = this.getNeighbors(f.r, f.c);
        for (const n of neighbors) {
          const key = n.r + ',' + n.c;
          if (visited.has(key)) continue;
          visited.add(key);
          const tile = this.mapData[n.r][n.c];
          if (tile.owner === city.owner || tile.owner === -1) {
            tiles.push(n);
            nextFrontier.push(n);
          }
        }
      }
      frontier = nextFrontier;
    }
    // Limit to population + 1 (center tile)
    return tiles.slice(0, city.population + 1);
  },

  // ========== UNIT MANAGEMENT ==========

  createUnit(playerId, typeId, r, c) {
    const uType = UNIT_TYPES.find(u => u.id === typeId);
    if (!uType) return null;
    const p = this.state.players[playerId];
    const unit = {
      id: this.state.nextUnitId++,
      type: typeId,
      owner: playerId,
      r, c,
      hp: 100,
      movement: uType.mv,
      movementLeft: uType.mv,
      xp: 0,
      fortified: false,
      hasActed: false,
    };
    p.units.push(unit);
    this.mapData[r][c].unit = unit;
    return unit;
  },

  getUnitType(unit) {
    return UNIT_TYPES.find(u => u.id === unit.type);
  },

  canUnitMoveTo(unit, tr, tc) {
    const uType = this.getUnitType(unit);
    const tile = this.getTile(tr, tc);
    if (!tile) return false;
    const terrain = TERRAINS[tile.terrain];

    // Domain check
    if (uType.domain === 'land' && terrain.water) return false;
    if (uType.domain === 'sea' && !terrain.water) return false;

    // Impassable
    if (terrain.mv >= 99 && uType.domain !== 'air') return false;

    // Occupied by friendly unit
    if (tile.unit && tile.unit.owner === unit.owner) return false;

    return true;
  },

  getMovementCost(unit, tr, tc) {
    const uType = this.getUnitType(unit);
    if (uType.domain === 'air') return 1;
    if (uType.type === 'recon') return 1; // Scouts ignore terrain
    const tile = this.getTile(tr, tc);
    const terrain = TERRAINS[tile.terrain];
    return terrain.mv;
  },

  getMovementRange(unit) {
    const range = new Map(); // 'r,c' -> remaining movement
    const queue = [{r: unit.r, c: unit.c, mv: unit.movementLeft}];
    range.set(unit.r + ',' + unit.c, unit.movementLeft);

    while (queue.length > 0) {
      const {r, c, mv} = queue.shift();
      const neighbors = this.getNeighbors(r, c);
      for (const n of neighbors) {
        if (!this.canUnitMoveTo(unit, n.r, n.c)) {
          // Can still attack enemy units
          const tile = this.getTile(n.r, n.c);
          if (tile && tile.unit && tile.unit.owner !== unit.owner && mv > 0) {
            const key = n.r + ',' + n.c;
            if (!range.has(key)) range.set(key, -1); // -1 = attack only
          }
          continue;
        }
        const cost = this.getMovementCost(unit, n.r, n.c);
        const remaining = mv - cost;
        const key = n.r + ',' + n.c;
        if (remaining >= 0 && (!range.has(key) || remaining > range.get(key))) {
          range.set(key, remaining);
          queue.push({r: n.r, c: n.c, mv: remaining});
        }
      }
    }
    range.delete(unit.r + ',' + unit.c);
    return range;
  },

  moveUnit(unit, tr, tc) {
    const tile = this.getTile(tr, tc);
    if (!tile) return false;

    // Combat?
    if (tile.unit && tile.unit.owner !== unit.owner) {
      return this.combat(unit, tile.unit);
    }

    // City capture?
    if (tile.cityId && tile.owner !== unit.owner) {
      const uType = this.getUnitType(unit);
      if (uType.str > 0 && uType.type !== 'ranged' && uType.type !== 'siege') {
        this.captureCity(unit, tile);
      }
    }

    // Move
    this.mapData[unit.r][unit.c].unit = null;
    unit.r = tr;
    unit.c = tc;
    tile.unit = unit;

    const cost = this.getMovementCost(unit, tr, tc);
    unit.movementLeft = Math.max(0, unit.movementLeft - cost);
    unit.fortified = false;

    return true;
  },

  // ========== COMBAT ==========

  combat(attacker, defender) {
    const aType = this.getUnitType(attacker);
    const dType = this.getUnitType(defender);
    const aPlayer = this.state.players[attacker.owner];
    const dPlayer = this.state.players[defender.owner];

    let aStr = aType.str * (attacker.hp / 100) * aPlayer.combatMod;
    let dStr = dType.str * (defender.hp / 100) * dPlayer.combatMod;

    // Terrain defense bonus
    const dTerrain = TERRAINS[this.mapData[defender.r][defender.c].terrain];
    dStr *= (1 + dTerrain.def / 100);

    // Fortification bonus
    if (defender.fortified) dStr *= 1.5;

    // City defense
    const dTile = this.getTile(defender.r, defender.c);
    if (dTile.cityId) {
      const city = this.findCityById(dTile.cityId);
      if (city) {
        const yields = this.getCityYields(city);
        dStr *= (1 + yields.defBonus / 100);
      }
    }

    // Ranged attack (no counter-damage)
    if (aType.rng > 0 && this.tileDist(attacker.r, attacker.c, defender.r, defender.c) > 1.5) {
      const dmg = Math.max(5, Math.floor(30 * Math.exp(0.04 * (aType.rng - dStr))));
      defender.hp -= dmg;
      attacker.xp += 5;
      attacker.movementLeft = 0;
      attacker.hasActed = true;
    } else {
      // Melee combat
      const aDmg = Math.max(5, Math.floor(30 * Math.exp(0.04 * (aStr - dStr))));
      const dDmg = Math.max(3, Math.floor(30 * Math.exp(0.04 * (dStr - aStr))));
      defender.hp -= aDmg;
      attacker.hp -= dDmg;
      attacker.xp += 5;
      defender.xp += 3;
      attacker.movementLeft = 0;
      attacker.hasActed = true;
    }

    // Check deaths
    if (defender.hp <= 0) {
      this.killUnit(defender);
      // Move attacker to defender's position if melee
      if (aType.rng === 0 || this.tileDist(attacker.r, attacker.c, defender.r, defender.c) <= 1.5) {
        this.mapData[attacker.r][attacker.c].unit = null;
        attacker.r = defender.r;
        attacker.c = defender.c;
        this.mapData[attacker.r][attacker.c].unit = attacker;
      }
      // City capture
      const tile = this.getTile(attacker.r, attacker.c);
      if (tile.cityId && tile.owner !== attacker.owner) {
        this.captureCity(attacker, tile);
      }
      return {result: 'attacker_wins', aDmg: 0, dDmg: 0};
    }
    if (attacker.hp <= 0) {
      this.killUnit(attacker);
      return {result: 'defender_wins'};
    }
    return {result: 'ongoing'};
  },

  captureCity(unit, tile) {
    const cityId = tile.cityId;
    const oldOwner = tile.owner;
    const newOwner = unit.owner;
    const city = this.findCityById(cityId);
    if (!city) return;

    // Transfer city
    const oldPlayer = this.state.players[oldOwner];
    const newPlayer = this.state.players[newOwner];
    oldPlayer.cities = oldPlayer.cities.filter(c => c.id !== cityId);
    city.owner = newOwner;
    newPlayer.cities.push(city);
    city.population = Math.max(1, Math.floor(city.population * 0.75));
    city.hp = Math.floor(city.maxHp * 0.5);

    // Update tile ownership
    tile.owner = newOwner;
    const neighbors = this.getNeighbors(city.r, city.c);
    for (const n of neighbors) {
      if (this.mapData[n.r][n.c].owner === oldOwner) {
        this.mapData[n.r][n.c].owner = newOwner;
      }
    }

    // Check if player eliminated
    if (oldPlayer.cities.length === 0) {
      oldPlayer.alive = false;
      // Kill remaining units
      for (const u of [...oldPlayer.units]) this.killUnit(u);
      UI.notify(oldPlayer.name + ' has been eliminated!');
    }

    UI.notify(newPlayer.name + ' captured ' + city.name + '!');
  },

  killUnit(unit) {
    const p = this.state.players[unit.owner];
    p.units = p.units.filter(u => u.id !== unit.id);
    const tile = this.getTile(unit.r, unit.c);
    if (tile && tile.unit && tile.unit.id === unit.id) tile.unit = null;
  },

  findCityById(id) {
    for (const p of this.state.players) {
      for (const c of p.cities) {
        if (c.id === id) return c;
      }
    }
    return null;
  },

  findCityAt(r, c) {
    for (const p of this.state.players) {
      for (const city of p.cities) {
        if (city.r === r && city.c === c) return city;
      }
    }
    return null;
  },

  // ========== TURN PROCESSING ==========

  processTurn(playerId) {
    const p = this.state.players[playerId];
    if (!p.alive) return;

    let totalGold = 0, totalSci = 0, totalCul = 0, totalHist = 0;

    for (const city of p.cities) {
      const yields = this.getCityYields(city);

      // Food & growth
      const foodConsumed = city.population * 2;
      const foodSurplus = Math.floor((yields.food - foodConsumed) * (1 + yields.growthMod) * p.devMod);
      city.food += foodSurplus;

      const growthThreshold = 10 + city.population * 5 + city.population * city.population * 0.5;
      city.foodNeeded = Math.floor(growthThreshold);
      if (city.food >= city.foodNeeded) {
        city.population++;
        city.food = 0;
        city.maxHp = 100 + city.population * 10;
      } else if (city.food < 0 && city.population > 1) {
        city.population--;
        city.food = 0;
      }

      // Production (build queue)
      if (city.buildQueue) {
        city.buildQueue.progress += Math.floor(yields.prod * p.devMod);
        if (city.buildQueue.progress >= city.buildQueue.cost) {
          this.completeBuild(city);
        }
      }

      // Happiness
      city.happiness = 3; // base
      for (const bId of city.buildings) {
        const b = BUILDINGS.find(b => b.id === bId);
        if (b) city.happiness += b.hap;
      }
      // Wonder happiness
      for (const [wId, ownerId] of Object.entries(this.state.builtWonders)) {
        if (ownerId !== playerId) continue;
        const w = WONDERS.find(w => w.id === wId);
        if (w && w.empHappy) city.happiness += Math.floor(w.empHappy / p.cities.length);
      }
      city.happiness -= Math.max(0, city.population - 5); // unhappiness from large pop

      // Defense
      city.defenseStr = 5 + city.population * 1.5;
      city.maxHp = 100 + city.population * 10;
      if (city.hp < city.maxHp) city.hp = Math.min(city.maxHp, city.hp + 5); // heal

      // Accumulate
      totalGold += yields.gold;
      totalSci += yields.sci;
      totalCul += yields.cul;
    }

    // Unit maintenance
    const unitMaint = p.units.filter(u => {
      const ut = this.getUnitType(u);
      return ut.str > 0;
    }).length;
    totalGold -= unitMaint;

    p.gold += totalGold;
    p.totalScience += totalSci;
    p.totalCulture += totalCul;

    // Research
    if (p.currentResearch) {
      p.researchProgress += totalSci;
      const tech = TECHS.find(t => t.id === p.currentResearch);
      if (tech && p.researchProgress >= tech.cost) {
        p.techs.add(tech.id);
        p.researchProgress = 0;
        p.currentResearch = null;
        if (playerId === 0) UI.notify('Research complete: ' + tech.name);
        // Update era
        const eraIdx = ERAS.indexOf(tech.era);
        const currentEraIdx = ERAS.indexOf(p.era);
        if (eraIdx > currentEraIdx) p.era = tech.era;
        // Check for free tech from wonders
        // Auto-select next research for AI
        if (p.isAI) AI.chooseResearch(p);
      }
    } else if (p.isAI) {
      AI.chooseResearch(p);
    }

    // Heal units in friendly territory
    for (const unit of p.units) {
      const tile = this.getTile(unit.r, unit.c);
      if (tile.owner === playerId && unit.hp < 100) {
        unit.hp = Math.min(100, unit.hp + 10);
      } else if (unit.hp < 100) {
        unit.hp = Math.min(100, unit.hp + 5);
      }
    }

    // Check bankruptcy
    if (p.gold < -50) {
      // Disband cheapest unit
      const military = p.units.filter(u => this.getUnitType(u).str > 0);
      if (military.length > 0) {
        const cheapest = military.reduce((a, b) => {
          const at = UNIT_TYPES.find(u => u.id === a.type);
          const bt = UNIT_TYPES.find(u => u.id === b.type);
          return at.cost < bt.cost ? a : b;
        });
        this.killUnit(cheapest);
        p.gold += 20;
        if (playerId === 0) UI.notify('Unit disbanded due to bankruptcy!');
      }
    }
  },

  completeBuild(city) {
    const q = city.buildQueue;
    if (!q) return;
    const p = this.state.players[city.owner];

    if (q.type === 'building') {
      if (!city.buildings.includes(q.id)) {
        city.buildings.push(q.id);
      }
      if (city.owner === 0) UI.notify(city.name + ' built ' + q.name);
    } else if (q.type === 'wonder') {
      if (!this.state.builtWonders[q.id]) {
        this.state.builtWonders[q.id] = city.owner;
        if (!city.buildings.includes('wonder_' + q.id)) {
          city.buildings.push('wonder_' + q.id);
        }
        if (city.owner === 0) UI.notify(city.name + ' completed ' + q.name + '!');
        // Free tech
        const w = WONDERS.find(w => w.id === q.id);
        if (w && w.freeTech) {
          const available = TECHS.filter(t => !p.techs.has(t.id) && t.prereqs.every(pr => p.techs.has(pr)));
          if (available.length > 0) {
            const freeTech = available[0];
            p.techs.add(freeTech.id);
            if (city.owner === 0) UI.notify('Free tech: ' + freeTech.name);
          }
        }
      } else {
        // Another player already built it — refund
        p.gold += Math.floor(q.cost * 0.5);
        if (city.owner === 0) UI.notify(q.name + ' already built by another civ! Refunded.');
      }
    } else if (q.type === 'unit') {
      // Find empty tile near city
      let placed = false;
      const uType = UNIT_TYPES.find(u => u.id === q.id);
      // Try city tile first
      const cityTile = this.getTile(city.r, city.c);
      if (!cityTile.unit) {
        this.createUnit(city.owner, q.id, city.r, city.c);
        placed = true;
      } else {
        const neighbors = this.getNeighbors(city.r, city.c);
        for (const n of neighbors) {
          const t = this.getTile(n.r, n.c);
          if (!t.unit && this.canPlaceUnit(uType, n.r, n.c)) {
            this.createUnit(city.owner, q.id, n.r, n.c);
            placed = true;
            break;
          }
        }
      }
      if (!placed) {
        // Queue overflow — just spawn on city tile
        this.createUnit(city.owner, q.id, city.r, city.c);
      }
      if (city.owner === 0) UI.notify(city.name + ' trained ' + q.name);

      // Settler reduces population
      if (uType.popCost && city.population > 1) {
        city.population -= uType.popCost;
      }

      // Mars shuttle tracking
      if (q.id === 'mars_shuttle') {
        if (!this.state.marsShuttles[city.owner]) this.state.marsShuttles[city.owner] = 0;
        this.state.marsShuttles[city.owner]++;
        if (this.state.marsShuttles[city.owner] >= 3) {
          this.state.gameOver = true;
          this.state.winner = city.owner;
        }
      }
    }

    city.buildQueue = null;
    city.production = 0;
  },

  canPlaceUnit(uType, r, c) {
    const tile = this.getTile(r, c);
    const terrain = TERRAINS[tile.terrain];
    if (uType.domain === 'land' && terrain.water) return false;
    if (uType.domain === 'sea' && !terrain.water) return false;
    if (terrain.mv >= 99 && uType.domain !== 'air') return false;
    return true;
  },

  startBuild(city, type, id) {
    let name, cost;
    if (type === 'building') {
      const b = BUILDINGS.find(b => b.id === id);
      if (!b) return;
      name = b.name; cost = b.cost;
    } else if (type === 'wonder') {
      const w = WONDERS.find(w => w.id === id);
      if (!w) return;
      name = w.name; cost = w.cost;
    } else if (type === 'unit') {
      const u = UNIT_TYPES.find(u => u.id === id);
      if (!u) return;
      name = u.name; cost = u.cost;
    }
    city.buildQueue = {type, id, name, progress: 0, cost};
  },

  // ========== FOG OF WAR ==========

  updateFogOfWar() {
    const {mapHeight} = this.state;
    // Reset all to explored (keep explored state)
    for (let r = 0; r < mapHeight; r++) {
      for (let c = 0; c < this.rowWidths[r]; c++) {
        const tile = this.mapData[r][c];
        for (let p = 0; p < this.state.players.length; p++) {
          if (tile.fogState[p] === 2) tile.fogState[p] = 1;
        }
      }
    }

    // Set visible around cities and units
    for (const p of this.state.players) {
      const sightRange = 2;
      const reveal = (r, c, range) => {
        const visited = new Set();
        const queue = [{r, c, d: 0}];
        visited.add(r + ',' + c);
        while (queue.length > 0) {
          const {r: cr, c: cc, d} = queue.shift();
          const tile = this.getTile(cr, cc);
          if (tile) tile.fogState[p.id] = 2;
          if (d < range) {
            for (const n of this.getNeighbors(cr, cc)) {
              const key = n.r + ',' + n.c;
              if (!visited.has(key)) {
                visited.add(key);
                queue.push({r: n.r, c: n.c, d: d + 1});
              }
            }
          }
        }
      };

      for (const city of p.cities) reveal(city.r, city.c, sightRange + 1);
      for (const unit of p.units) {
        const uType = this.getUnitType(unit);
        const sight = uType.type === 'recon' ? 3 : sightRange;
        reveal(unit.r, unit.c, sight);
      }
    }
  },

  // ========== END TURN ==========

  endTurn() {
    if (this.state.gameOver) return;

    // Process human player
    this.processTurn(0);

    // Reset human units
    for (const u of this.state.players[0].units) {
      const uType = this.getUnitType(u);
      u.movementLeft = uType.mv;
      u.hasActed = false;
    }

    // AI turns
    for (let i = 1; i < this.state.players.length; i++) {
      if (!this.state.players[i].alive) continue;
      AI.takeTurn(i);
      this.processTurn(i);
      // Reset AI units
      for (const u of this.state.players[i].units) {
        const uType = this.getUnitType(u);
        u.movementLeft = uType.mv;
        u.hasActed = false;
      }
    }

    this.state.turn++;
    this.updateFogOfWar();
    this.checkVictory();

    // Update selection
    this.selectedUnit = null;
    this.movementRange = null;
    this.attackTargets = null;
    this.selectedCity = null;

    Renderer.render();
    UI.updateTopBar();
    UI.updateRightPanel();
    Renderer.updateMinimap();
  },

  checkVictory() {
    // Domination: player controls all capitals
    const player = this.state.players[0];
    const allCapitals = this.state.players.filter(p => p.id !== 0).every(p => !p.alive);
    if (allCapitals && this.state.players.length > 1) {
      this.state.gameOver = true;
      this.state.winner = 0;
      UI.showVictory('Domination Victory! You have conquered all civilizations!');
      return;
    }

    // Mars Race
    for (const [pid, count] of Object.entries(this.state.marsShuttles)) {
      if (count >= 3) {
        this.state.gameOver = true;
        this.state.winner = parseInt(pid);
        const winner = this.state.players[parseInt(pid)];
        UI.showVictory(winner.name + ' wins by Mars Race! 3 shuttles launched!');
        return;
      }
    }

    // Score victory at turn 400
    if (this.state.turn >= 400) {
      this.state.gameOver = true;
      let best = null, bestScore = -1;
      for (const p of this.state.players) {
        if (!p.alive) continue;
        const score = this.calcScore(p);
        if (score > bestScore) { bestScore = score; best = p; }
      }
      this.state.winner = best ? best.id : 0;
      UI.showVictory((best ? best.name : 'Unknown') + ' wins by Score! (' + bestScore + ' points)');
    }
  },

  calcScore(player) {
    let score = 0;
    for (const c of player.cities) score += c.population * 3;
    score += player.techs.size * 5;
    score += Object.values(this.state.builtWonders).filter(v => v === player.id).length * 20;
    score += player.units.length * 2;
    return Math.floor(score * this.state.difficulty.scoreMul);
  },

  // ========== AVAILABLE BUILDS ==========

  getAvailableBuildings(city) {
    const p = this.state.players[city.owner];
    const tier = this.getCityTier(city.population);
    const maxSlots = CITY_TIERS[tier].slots;

    return BUILDINGS.filter(b => {
      if (city.buildings.includes(b.id)) return false;
      if (city.buildings.length >= maxSlots) return false;
      if (!p.techs.has(b.req)) return false;
      if (b.needsCoast) {
        const neighbors = this.getNeighbors(city.r, city.c);
        const hasCoast = neighbors.some(n => TERRAINS[this.mapData[n.r][n.c].terrain].water);
        if (!hasCoast) return false;
      }
      return true;
    });
  },

  getAvailableUnits(city) {
    const p = this.state.players[city.owner];
    return UNIT_TYPES.filter(u => {
      if (!p.techs.has(u.req)) return false;
      return true;
    });
  },

  getAvailableWonders(city) {
    const p = this.state.players[city.owner];
    return WONDERS.filter(w => {
      if (this.state.builtWonders[w.id] !== undefined) return false;
      if (!p.techs.has(w.req)) return false;
      return true;
    });
  },

  getAvailableTechs(player) {
    return TECHS.filter(t => {
      if (player.techs.has(t.id)) return false;
      return t.prereqs.every(pr => player.techs.has(pr));
    });
  },

  // ========== SERIALIZATION ==========

  serialize() {
    const s = JSON.parse(JSON.stringify(this.state, (key, value) => {
      if (value instanceof Set) return {__set: Array.from(value)};
      return value;
    }));
    // Save map data compactly
    const mapCompact = [];
    for (let r = 0; r < this.state.mapHeight; r++) {
      const row = [];
      for (let c = 0; c < this.rowWidths[r]; c++) {
        const tile = this.mapData[r][c];
        row.push({
          t: tile.terrain,
          r: tile.resource ? tile.resource.id : null,
          i: tile.improvement,
          rd: tile.road,
          o: tile.owner,
          ci: tile.cityId,
          u: tile.unit ? tile.unit.id : null,
          f: tile.fogState
        });
      }
      mapCompact.push(row);
    }
    s.map = mapCompact;
    s.rowWidths = this.rowWidths;
    return s;
  },

  deserialize(data) {
    this.state = data;
    // Restore Sets
    for (const p of this.state.players) {
      if (p.techs && p.techs.__set) p.techs = new Set(p.techs.__set);
      else if (Array.isArray(p.techs)) p.techs = new Set(p.techs);
      else if (!(p.techs instanceof Set)) p.techs = new Set();
    }
    this.rowWidths = data.rowWidths;

    // Rebuild map
    this.mapData = [];
    for (let r = 0; r < this.state.mapHeight; r++) {
      const row = [];
      for (let c = 0; c < this.rowWidths[r]; c++) {
        const td = data.map[r][c];
        row.push({
          r, c,
          terrain: td.t,
          resource: td.r ? RESOURCES.find(res => res.id === td.r) : null,
          improvement: td.i,
          road: td.rd,
          owner: td.o,
          cityId: td.ci,
          unit: null,
          fogState: td.f
        });
      }
      this.mapData.push(row);
    }

    // Place units back on map
    for (const p of this.state.players) {
      for (const u of p.units) {
        const tile = this.getTile(u.r, u.c);
        if (tile) tile.unit = u;
      }
    }

    this.selectedUnit = null;
    this.selectedCity = null;
    this.movementRange = null;
  }
};
