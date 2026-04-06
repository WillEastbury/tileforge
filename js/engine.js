// Apollo's Time — Core Game Engine
"use strict";

const Game = {
  state: null,
  mapData: null,
  selectedUnit: null,
  selectedCity: null,
  movementRange: null,
  attackTargets: null,

  START_YEAR: -3000, // 3000 BC

  // Era-based year steps: ~2000 turns spans 3000 BC → 2100 AD
  ERA_YEAR_STEPS: {
    caveman: 8, ancient: 5, classical: 4, medieval: 3,
    renaissance: 2, industrial: 1, modern: 0.5, ai: 0.25, mars: 0.25
  },

  getYear() {
    if (!this.state) return this.START_YEAR;
    let year = this.START_YEAR;
    for (let t = 0; t < this.state.turn; t++) {
      const era = this.getEraAtTurn(t);
      year += this.ERA_YEAR_STEPS[era] || 1;
    }
    return year;
  },

  // Determine which era the human player was in at a given turn
  getEraAtTurn(turn) {
    if (!this.state || !this.state.eraHistory) return 'caveman';
    let era = 'caveman';
    for (const entry of this.state.eraHistory) {
      if (entry.turn <= turn) era = entry.era;
      else break;
    }
    return era;
  },

  getYearString() {
    const y = this.getYear();
    if (y < 0) return Math.abs(y) + ' BC';
    if (y === 0) return '1 AD';
    return y + ' AD';
  },

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
      marsShuttles: {}, // playerId -> count
      eraHistory: [{turn: 0, era: 'caveman'}], // track era transitions for year calc
      goldenAge: {} // playerId -> {turnsLeft}
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
      strategicRes: {}, // resourceId -> count
      cultureAccum: {}, // cityId -> accumulated culture for border expansion
      greatPeoplePoints: {scientist:0, engineer:0, artist:0, general:0, merchant:0, prophet:0},
      greatPeopleThreshold: 100, // increases each time a GP spawns
      faith: 0,
      pantheon: null,
      religion: null,
      relations: {} // playerId -> {score, treaties: Set}
    };
  },

  // ========== MAP GENERATION ==========

  buildMap() {
    const {mapWidth, mapHeight} = this.state;
    this.mapData = [];
    this.rowWidths = [];
    for (let r = 0; r < mapHeight; r++) {
      const w = mapWidth;
      this.rowWidths.push(w);
      const row = [];
      for (let c = 0; c < w; c++) {
        row.push({
          r, c, terrain: 17, // ocean default
          resource: null,
          improvement: null,
          road: null,
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
    const w = this.state.mapWidth;
    const results = [];
    // E, W (wrap horizontally)
    results.push({r, c: (c + 1) % w});
    results.push({r, c: (c - 1 + w) % w});
    // N, S (wrap vertically)
    results.push({r: (r + 1) % h, c});
    results.push({r: (r - 1 + h) % h, c});
    // Diagonals (NE, NW, SE, SW)
    const nr = (r + 1) % h, sr = (r - 1 + h) % h;
    results.push({r: nr, c: (c + 1) % w});
    results.push({r: nr, c: (c - 1 + w) % w});
    results.push({r: sr, c: (c + 1) % w});
    results.push({r: sr, c: (c - 1 + w) % w});
    return results;
  },

  getTile(r, c) {
    const h = this.state.mapHeight, w = this.state.mapWidth;
    r = ((r % h) + h) % h;
    c = ((c % w) + w) % w;
    return this.mapData[r][c];
  },

  tileDist(r1, c1, r2, c2) {
    const w = this.state.mapWidth, h = this.state.mapHeight;
    let dx = Math.abs(c1 - c2);
    if (dx > w / 2) dx = w - dx;
    let dy = Math.abs(r1 - r2);
    if (dy > h / 2) dy = h - dy;
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
      // Improvement yields
      if (tile.improvement) {
        const imp = IMPROVEMENTS.find(i => i.id === tile.improvement);
        if (imp) {
          food += imp.yields.food;
          prod += imp.yields.prod;
          gold += imp.yields.gold;
        }
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

    // City specialization bonuses
    const spec = this.getCitySpecialization(city);
    if (spec.bonuses) {
      if (spec.bonuses.goldMod) goldMod += spec.bonuses.goldMod;
      if (spec.bonuses.sciMod) sciMod += spec.bonuses.sciMod;
      if (spec.bonuses.prodMod) prodMod += spec.bonuses.prodMod;
      if (spec.bonuses.culMod) culMod += spec.bonuses.culMod;
      if (spec.bonuses.growthMod) growthMod += spec.bonuses.growthMod;
    }

    // Apply modifiers
    gold = Math.floor(gold * (1 + goldMod + allMod) * p.resMod);
    sci = Math.floor(sci * (1 + sciMod + allMod) * p.resMod);
    prod = Math.max(1, Math.floor(prod * (1 + prodMod + allMod) * p.resMod));
    cul = Math.floor(cul * (1 + culMod + allMod) * p.resMod);
    food = Math.floor(food * (1 + allMod) * p.resMod);

    return {food, prod, gold, sci, cul, hist, growthMod, defBonus, spec};
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
      sleeping: false,
      buildingImprovement: null,
      buildProgress: 0,
      buildTurnsNeeded: 0,
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
    // Roads/railways/motorways reduce movement cost for land units
    if (tile.road && uType.domain === 'land') {
      if (tile.road === 'motorway') return 0.2;
      if (tile.road === 'railway') return 0.33;
      return 0.5; // basic road (true or 'road')
    }
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
    unit.sleeping = false;
    // Cancel improvement building if unit moves away
    if (unit.buildingImprovement) {
      unit.buildingImprovement = null;
      unit.buildProgress = 0;
    }

    return true;
  },

  // ========== TILE IMPROVEMENTS ==========

  startBuildImprovement(unit, improvementId) {
    const imp = IMPROVEMENTS.find(i => i.id === improvementId);
    if (!imp) return;
    const tile = this.getTile(unit.r, unit.c);
    // Railway requires existing road
    if (improvementId === 'railway' && (!tile.road || tile.road === 'railway' || tile.road === 'motorway')) return;
    // Motorway requires existing railway
    if (improvementId === 'motorway' && tile.road !== 'railway') return;
    unit.buildingImprovement = improvementId;
    unit.buildProgress = 0;
    unit.buildTurnsNeeded = imp.turns;
    unit.movementLeft = 0;
    unit.hasActed = true;
    UI.notify(`🔨 ${this.getUnitType(unit).name} started building ${imp.name} (${imp.turns} turns)`);
  },

  processImprovementBuilding() {
    for (const p of this.state.players) {
      for (const unit of p.units) {
        if (!unit.buildingImprovement) continue;
        unit.buildProgress = (unit.buildProgress || 0) + 1;
        if (unit.buildProgress >= unit.buildTurnsNeeded) {
          const tile = this.mapData[unit.r][unit.c];
          const impId = unit.buildingImprovement;
          const imp = IMPROVEMENTS.find(i => i.id === impId);
          if (impId === 'road') {
            tile.road = tile.road ? tile.road : 'road';
          } else if (impId === 'railway') {
            tile.road = 'railway';
          } else if (impId === 'motorway') {
            tile.road = 'motorway';
          } else {
            tile.improvement = impId;
          }
          if (unit.owner === 0) {
            UI.notify(`✅ ${imp.name} completed at (${unit.r},${unit.c})!`, () => {
              Renderer.centerOn(unit.r, unit.c);
            });
          }
          unit.buildingImprovement = null;
          unit.buildProgress = 0;
          unit.buildTurnsNeeded = 0;
        } else {
          unit.movementLeft = 0;
          unit.hasActed = true;
        }
      }
    }
  },

  // ========== COMBAT ==========

  combat(attacker, defender) {
    const aType = this.getUnitType(attacker);
    const dType = this.getUnitType(defender);
    const aPlayer = this.state.players[attacker.owner];
    const dPlayer = this.state.players[defender.owner];

    let aStr = aType.str * (attacker.hp / 100) * aPlayer.combatMod;
    let dStr = dType.str * (defender.hp / 100) * dPlayer.combatMod;

    // Promotion bonuses
    const aPromos = this.getPromotionBonuses(attacker);
    const dPromos = this.getPromotionBonuses(defender);
    aStr *= (1 + aPromos.strMod);
    dStr *= (1 + dPromos.defMod);

    // Supply line penalty (-25% strength when out of supply)
    if (attacker.outOfSupply) aStr *= 0.75;
    if (defender.outOfSupply) dStr *= 0.75;

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
      // Heal on kill promotion
      if (aPromos.healOnKill) attacker.hp = Math.min(100, attacker.hp + 30);
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
      // Check for promotion availability
      if (attacker.owner === 0 && this.getAvailablePromotions(attacker).length > 0) {
        UI.notify('Unit ready for promotion!');
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

      // Production (build queue) — golden age gives +50%
      if (city.buildQueue) {
        let prodAmount = Math.floor(yields.prod * p.devMod);
        if (this.state.goldenAge && this.state.goldenAge[city.owner] && this.state.goldenAge[city.owner].turnsLeft > 0) {
          prodAmount = Math.floor(prodAmount * 1.5);
        }
        city.buildQueue.progress += prodAmount;
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

    // Happiness effects on yields
      const happinessMod = city.happiness < 0
        ? Math.max(-0.5, city.happiness * 0.1) // -10% per unhappy point, floor at -50%
        : Math.min(0.25, city.happiness * 0.02); // +2% per happy point, cap at +25%

      // Accumulate
      totalGold += Math.floor(yields.gold * (1 + happinessMod));
      totalSci += Math.floor(yields.sci * (1 + happinessMod));
      totalCul += Math.floor(yields.cul * (1 + happinessMod));
    }

    // Unit maintenance
    const unitMaint = p.units.filter(u => {
      const ut = this.getUnitType(u);
      return ut.str > 0;
    }).length;
    totalGold -= unitMaint;

    // Golden age gold bonus
    const isGoldenAge = this.state.goldenAge && this.state.goldenAge[playerId] && this.state.goldenAge[playerId].turnsLeft > 0;
    if (isGoldenAge) totalGold = Math.floor(totalGold * 1.5);

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
        if (eraIdx > currentEraIdx) {
          p.era = tech.era;
          if (playerId === 0 && this.state.eraHistory) {
            this.state.eraHistory.push({turn: this.state.turn, era: tech.era});
            UI.narrateEvent('civilization entered the ' + tech.era + ' era');
          }
        }
        // Check for free tech from wonders
        // Auto-select next research for AI
        if (p.isAI) AI.chooseResearch(p);
      }
    } else if (p.isAI) {
      AI.chooseResearch(p);
    }

    // Heal units in friendly territory + supply line check
    for (const unit of p.units) {
      const tile = this.getTile(unit.r, unit.c);
      const inSupply = this.isInSupplyRange(unit, playerId);
      if (!inSupply) {
        unit.outOfSupply = true;
        if (unit.hp < 100) unit.hp = Math.min(100, unit.hp + 0); // no healing
      } else {
        unit.outOfSupply = false;
        if (tile.owner === playerId && unit.hp < 100) {
          unit.hp = Math.min(100, unit.hp + 10);
        } else if (unit.hp < 100) {
          unit.hp = Math.min(100, unit.hp + 5);
        }
      }
    }

    // Culture-driven border expansion
    for (const city of p.cities) {
      if (!p.cultureAccum) p.cultureAccum = {};
      if (!p.cultureAccum[city.id]) p.cultureAccum[city.id] = 0;
      const yields = this.getCityYields(city);
      p.cultureAccum[city.id] += yields.cul;
      const expansionCost = 15 * Math.pow(1.5, (city.borderExpansions || 0));
      if (p.cultureAccum[city.id] >= expansionCost) {
        const claimed = this.expandBorders(city, playerId);
        if (claimed) {
          p.cultureAccum[city.id] -= expansionCost;
          city.borderExpansions = (city.borderExpansions || 0) + 1;
          if (playerId === 0) UI.notify(city.name + ' expanded its borders!');
        }
      }
    }

    // Golden age processing
    if (this.state.goldenAge && this.state.goldenAge[playerId]) {
      const ga = this.state.goldenAge[playerId];
      if (ga.turnsLeft > 0) {
        ga.turnsLeft--;
        if (ga.turnsLeft <= 0) {
          delete this.state.goldenAge[playerId];
          if (playerId === 0) UI.notify('Golden Age has ended.');
        }
      }
    }

    // Great People point accumulation
    if (p.greatPeoplePoints) {
      for (const city of p.cities) {
        for (const bId of city.buildings) {
          const b = BUILDINGS.find(b => b.id === bId);
          if (!b) continue;
          if (b.sci > 2) p.greatPeoplePoints.scientist += 0.5;
          if (b.prod > 2) p.greatPeoplePoints.engineer += 0.5;
          if (b.cul > 2) p.greatPeoplePoints.artist += 0.5;
          if (b.gold > 2) p.greatPeoplePoints.merchant += 0.5;
        }
      }
      // Check for Great Person spawn
      for (const [type, points] of Object.entries(p.greatPeoplePoints)) {
        if (points >= p.greatPeopleThreshold) {
          p.greatPeoplePoints[type] -= p.greatPeopleThreshold;
          p.greatPeopleThreshold = Math.floor(p.greatPeopleThreshold * 1.5);
          this.spawnGreatPerson(playerId, type);
        }
      }
    }

    // Revolt check (very unhappy cities)
    for (const city of p.cities) {
      if (city.happiness <= -10) {
        // Guaranteed revolt — lose city to rebels
        if (playerId === 0) UI.notify(city.name + ' has revolted!');
        city.population = Math.max(1, Math.floor(city.population / 2));
        city.happiness = 0;
      } else if (city.happiness <= -5 && Math.random() < 0.15) {
        // 15% chance of revolt
        if (playerId === 0) UI.notify('Unrest in ' + city.name + '! Citizens are rioting!');
        city.population = Math.max(1, city.population - 1);
        city.happiness += 2;
      }
    }

    // Legacy building conversion
    this.processLegacyBuildings(p);

    // Trade routes
    this.processTradeRoutes(playerId);

    // Sports & entertainment
    this.processSports(playerId);

    // Religion & faith
    this.processFaith(playerId);

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
        if (city.owner === 0) UI.narrateEvent(city.name + ' completed ' + q.name);
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
        // Golden age from wonders (e.g. Taj Mahal)
        if (w && w.goldenAge) {
          this.triggerGoldenAge(city.owner, 10);
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
        // Try immediate neighbors, then 2-ring neighbors
        const neighbors = this.getNeighbors(city.r, city.c);
        // Sort by actual visual distance to city to avoid pole-wrap surprises
        const withDist = neighbors.map(n => ({...n, d: this.tileDist(city.r, city.c, n.r, n.c)}));
        withDist.sort((a, b) => a.d - b.d);
        for (const n of withDist) {
          const t = this.getTile(n.r, n.c);
          if (t && !t.unit && this.canPlaceUnit(uType, n.r, n.c)) {
            this.createUnit(city.owner, q.id, n.r, n.c);
            placed = true;
            break;
          }
        }
        // Try 2-ring if still not placed
        if (!placed) {
          const ring2 = new Set();
          for (const n of neighbors) {
            for (const n2 of this.getNeighbors(n.r, n.c)) {
              const key = n2.r + ',' + n2.c;
              if (key !== city.r + ',' + city.c && !ring2.has(key)) {
                ring2.add(key);
                const t2 = this.getTile(n2.r, n2.c);
                if (t2 && !t2.unit && this.canPlaceUnit(uType, n2.r, n2.c)) {
                  this.createUnit(city.owner, q.id, n2.r, n2.c);
                  placed = true;
                  break;
                }
              }
            }
            if (placed) break;
          }
        }
      }
      if (!placed) {
        // Delay production — don't lose the unit, re-queue it
        city.buildQueue = q;
        city.buildQueue.progress = q.cost; // Keep it ready
        if (city.owner === 0) UI.notify(city.name + ': no room for ' + q.name + '! Waiting...');
        return; // Don't clear buildQueue
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
    // Refund 50% of invested production as gold when switching
    if (city.buildQueue && city.buildQueue.progress > 0) {
      const refund = Math.floor(city.buildQueue.progress * 0.5);
      const player = this.state.players[city.owner];
      if (player) player.gold += refund;
    }
    city.buildQueue = {type, id, name, progress: 0, cost};
  },

  // ========== SUPPLY LINES ==========

  isInSupplyRange(unit, playerId) {
    const p = this.state.players[playerId];
    const maxRange = 8; // base supply range in tiles
    for (const city of p.cities) {
      const dist = this.tileDistance(unit.r, unit.c, city.r, city.c);
      // Roads extend supply range
      if (dist <= maxRange) return true;
    }
    return false;
  },

  tileDistance(r1, c1, r2, c2) {
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    const mapW = this.state.mapWidth;
    const wrappedDc = Math.min(dc, mapW - dc);
    return Math.max(dr, wrappedDc);
  },

  // ========== BORDER EXPANSION ==========

  expandBorders(city, playerId) {
    const tier = this.getCityTier(city.population);
    const maxRadius = CITY_TIERS[tier].radius + 1;
    let bestTile = null, bestDist = Infinity;

    // Find closest unclaimed tile within range
    for (let dr = -maxRadius; dr <= maxRadius; dr++) {
      for (let dc = -maxRadius; dc <= maxRadius; dc++) {
        const nr = city.r + dr;
        const nc = (city.c + dc + this.state.mapWidth) % this.state.mapWidth;
        if (nr < 0 || nr >= this.state.mapHeight) continue;
        const tile = this.getTile(nr, nc);
        if (tile && tile.owner === -1) {
          const dist = Math.abs(dr) + Math.abs(dc);
          if (dist < bestDist) {
            bestDist = dist;
            bestTile = {r: nr, c: nc};
          }
        }
      }
    }
    if (bestTile) {
      const tile = this.getTile(bestTile.r, bestTile.c);
      tile.owner = playerId;
      tile.cityId = city.id;
      return true;
    }
    return false;
  },

  // ========== GOLDEN AGES ==========

  triggerGoldenAge(playerId, duration) {
    if (!this.state.goldenAge) this.state.goldenAge = {};
    const existing = this.state.goldenAge[playerId];
    if (existing && existing.turnsLeft > 0) {
      existing.turnsLeft += duration; // extend
    } else {
      this.state.goldenAge[playerId] = {turnsLeft: duration};
    }
    if (playerId === 0) UI.notify('A Golden Age has begun! (+50% Gold & Production for ' + duration + ' turns)');
    if (playerId === 0) UI.narrateEvent('A golden age has begun');
  },

  // ========== GREAT PEOPLE ==========

  spawnGreatPerson(playerId, type) {
    const p = this.state.players[playerId];
    if (p.cities.length === 0) return;
    const capital = p.cities[0];

    // Apply immediate effect based on type
    switch (type) {
      case 'scientist':
        // Free tech boost — add 50% of current research cost
        if (p.currentResearch) {
          const tech = TECHS.find(t => t.id === p.currentResearch);
          if (tech) p.researchProgress += Math.floor(tech.cost * 0.5);
        } else {
          p.totalScience += 200;
        }
        if (playerId === 0) UI.notify('A Great Scientist appears! Research boosted.');
        break;
      case 'engineer':
        // Production rush — complete current build in capital
        if (capital.buildQueue) {
          capital.buildQueue.progress = capital.buildQueue.cost;
          this.completeBuild(capital);
        } else {
          p.gold += 200;
        }
        if (playerId === 0) UI.notify('A Great Engineer appears! Build completed in ' + capital.name + '.');
        break;
      case 'artist':
        // Golden age
        this.triggerGoldenAge(playerId, 10);
        if (playerId === 0) UI.notify('A Great Artist appears! Golden Age triggered.');
        break;
      case 'general':
        // Buff all units
        for (const u of p.units) u.hp = 100;
        if (playerId === 0) UI.notify('A Great General appears! All units fully healed.');
        break;
      case 'merchant':
        p.gold += 500;
        if (playerId === 0) UI.notify('A Great Merchant appears! +500 Gold.');
        break;
      case 'prophet':
        p.faith = (p.faith || 0) + 100;
        if (playerId === 0) UI.notify('A Great Prophet appears! +100 Faith.');
        break;
    }
  },

  // ========== LEGACY BUILDINGS ==========

  processLegacyBuildings(player) {
    const playerEraIdx = ERAS.indexOf(player.era);
    let historyGain = 0, legacyGold = 0;

    for (const city of player.cities) {
      if (!city.legacyBuildings) city.legacyBuildings = [];
      const toConvert = [];

      for (const bId of city.buildings) {
        const b = BUILDINGS.find(b => b.id === bId);
        if (!b || !b.era) continue;
        const buildingEraIdx = ERAS.indexOf(b.era);
        // Building becomes legacy when player is 2+ eras ahead
        if (playerEraIdx - buildingEraIdx >= 2 && !city.legacyBuildings.includes(bId)) {
          toConvert.push(bId);
        }
      }

      for (const bId of toConvert) {
        city.legacyBuildings.push(bId);
        const b = BUILDINGS.find(b => b.id === bId);
        if (!b) continue;
        const eraDist = playerEraIdx - ERAS.indexOf(b.era);
        const scale = Math.min(3.0, 1.0 + (eraDist - 2) * 0.5);
        historyGain += Math.floor(2 * scale);
        legacyGold += Math.floor(1 * scale);
      }

      // Ongoing legacy yields
      for (const bId of city.legacyBuildings) {
        const b = BUILDINGS.find(b => b.id === bId);
        if (!b) continue;
        const eraDist = playerEraIdx - ERAS.indexOf(b.era);
        const scale = Math.min(3.0, 1.0 + (eraDist - 2) * 0.5);
        historyGain += Math.floor(1 * scale);
        legacyGold += Math.floor(0.5 * scale);
      }
    }
    player.totalHistory = (player.totalHistory || 0) + historyGain;
    player.gold += legacyGold;
  },

  // ========== PROMOTIONS ==========

  PROMOTION_THRESHOLDS: [10, 30, 60, 100, 150],

  PROMOTIONS: [
    {id: 'shock', name: 'Shock', desc: '+25% vs melee', strBonus: 0, strMod: 0.25, domain: 'land'},
    {id: 'drill', name: 'Drill', desc: '+1 Movement', mvBonus: 1, domain: 'land'},
    {id: 'cover', name: 'Cover', desc: '+25% vs ranged', defBonus: 0.25, domain: 'land'},
    {id: 'medic', name: 'Medic', desc: 'Heal on kill', healOnKill: true, domain: 'land'},
    {id: 'accuracy', name: 'Accuracy', desc: '+1 Range', rangeBonus: 1, domain: 'land'},
    {id: 'blitz', name: 'Blitz', desc: 'Attack twice', extraAttack: true, domain: 'land'},
    {id: 'ironclad', name: 'Ironclad', desc: '+25% defense', defBonus: 0.25, domain: 'sea'},
    {id: 'boarding', name: 'Boarding Party', desc: '+25% attack', strMod: 0.25, domain: 'sea'},
  ],

  getUnitLevel(unit) {
    let level = 0;
    for (const threshold of this.PROMOTION_THRESHOLDS) {
      if ((unit.xp || 0) >= threshold) level++;
      else break;
    }
    return level;
  },

  getAvailablePromotions(unit) {
    const level = this.getUnitLevel(unit);
    const promotionCount = (unit.promotions || []).length;
    if (promotionCount >= level) return []; // already promoted up to level
    const uType = this.getUnitType(unit);
    return this.PROMOTIONS.filter(p =>
      (p.domain === uType.domain || p.domain === 'any') &&
      !(unit.promotions || []).includes(p.id)
    );
  },

  applyPromotion(unit, promotionId) {
    if (!unit.promotions) unit.promotions = [];
    if (unit.promotions.includes(promotionId)) return false;
    unit.promotions.push(promotionId);
    const promo = this.PROMOTIONS.find(p => p.id === promotionId);
    if (promo && promo.mvBonus) {
      const uType = this.getUnitType(unit);
      unit.movementLeft = (unit.movementLeft || 0) + promo.mvBonus;
    }
    return true;
  },

  getPromotionBonuses(unit) {
    let strMod = 0, defMod = 0, mvBonus = 0, rangeBonus = 0, healOnKill = false, extraAttack = false;
    for (const pid of (unit.promotions || [])) {
      const p = this.PROMOTIONS.find(p => p.id === pid);
      if (!p) continue;
      if (p.strMod) strMod += p.strMod;
      if (p.defBonus) defMod += p.defBonus;
      if (p.mvBonus) mvBonus += p.mvBonus;
      if (p.rangeBonus) rangeBonus += p.rangeBonus;
      if (p.healOnKill) healOnKill = true;
      if (p.extraAttack) extraAttack = true;
    }
    return {strMod, defMod, mvBonus, rangeBonus, healOnKill, extraAttack};
  },

  // ========== ROAD NETWORK & RESOURCE CONNECTION ==========

  isResourceConnected(tileR, tileC, playerId) {
    const tile = this.getTile(tileR, tileC);
    if (!tile || !tile.improvement || !tile.resource) return false;
    if (tile.owner !== playerId) return false;
    // BFS from tile along roads to find a city owned by player
    return this.hasRoadPathToCity(tileR, tileC, playerId);
  },

  hasRoadPathToCity(startR, startC, playerId) {
    const visited = new Set();
    const queue = [{r: startR, c: startC}];
    visited.add(startR + ',' + startC);

    while (queue.length > 0) {
      const {r, c} = queue.shift();
      const tile = this.getTile(r, c);
      // Check if this tile has a city owned by the player
      const p = this.state.players[playerId];
      for (const city of p.cities) {
        if (city.r === r && city.c === c) return true;
      }
      // Only traverse roads
      if (r !== startR || c !== startC) {
        if (!tile.road) continue;
      }
      // Expand neighbors
      const neighbors = this.getNeighbors(r, c);
      for (const n of neighbors) {
        const key = n.r + ',' + n.c;
        if (!visited.has(key)) {
          visited.add(key);
          const nTile = this.getTile(n.r, n.c);
          if (nTile && nTile.owner === playerId) {
            queue.push(n);
          }
        }
      }
    }
    return false;
  },

  getConnectedResources(playerId) {
    const connected = new Set();
    const p = this.state.players[playerId];
    for (const city of p.cities) {
      const tier = this.getCityTier(city.population);
      const radius = CITY_TIERS[tier].radius;
      const tiles = this.getWorkedTiles(city, radius + 1);
      for (const wt of tiles) {
        const tile = this.getTile(wt.r, wt.c);
        if (tile && tile.resource && tile.improvement && tile.owner === playerId) {
          // Connected if road path exists OR directly adjacent to city
          const dist = this.tileDistance(wt.r, wt.c, city.r, city.c);
          if (dist <= 1 || this.hasRoadPathToCity(wt.r, wt.c, playerId)) {
            connected.add(tile.resource.id || tile.resource.name);
          }
        }
      }
    }
    return connected;
  },

  // ========== COMPOSITE RESOURCES ==========

  canProduceComposite(compositeId, playerId) {
    const composite = COMPOSITES ? COMPOSITES.find(c => c.id === compositeId) : null;
    if (!composite) return false;
    const connected = this.getConnectedResources(playerId);
    return composite.ingredients.every(ing => connected.has(ing));
  },

  // ========== DIPLOMACY ==========

  initRelations(playerId, otherPlayerId) {
    const p = this.state.players[playerId];
    if (!p.relations) p.relations = {};
    if (!p.relations[otherPlayerId]) {
      p.relations[otherPlayerId] = {score: 0, treaties: [], atWar: false};
    }
  },

  modifyRelation(playerId, otherPlayerId, delta) {
    this.initRelations(playerId, otherPlayerId);
    this.initRelations(otherPlayerId, playerId);
    const p = this.state.players[playerId];
    p.relations[otherPlayerId].score = Math.max(-100, Math.min(100, p.relations[otherPlayerId].score + delta));
    // Mirror (reduced)
    const other = this.state.players[otherPlayerId];
    other.relations[playerId].score = Math.max(-100, Math.min(100, other.relations[playerId].score + Math.floor(delta * 0.5)));
  },

  declareWar(playerId, otherPlayerId) {
    this.initRelations(playerId, otherPlayerId);
    this.initRelations(otherPlayerId, playerId);
    this.state.players[playerId].relations[otherPlayerId].atWar = true;
    this.state.players[otherPlayerId].relations[playerId].atWar = true;
    this.modifyRelation(playerId, otherPlayerId, -50);
    if (playerId === 0) UI.notify('You declared war on ' + this.state.players[otherPlayerId].name + '!');
    else if (otherPlayerId === 0) {
      UI.notify(this.state.players[playerId].name + ' declared war on you!');
      UI.requestDiplomacyDialogue(playerId, 'war_declaration').then(text => {
        UI.showDialogue(this.state.players[playerId].name, text, [
          {label: 'Bring it on!', action: null}
        ]);
      });
    }
  },

  makePeace(playerId, otherPlayerId) {
    this.initRelations(playerId, otherPlayerId);
    this.initRelations(otherPlayerId, playerId);
    this.state.players[playerId].relations[otherPlayerId].atWar = false;
    this.state.players[otherPlayerId].relations[playerId].atWar = false;
    this.modifyRelation(playerId, otherPlayerId, 20);
    if (playerId === 0) UI.notify('Peace treaty signed with ' + this.state.players[otherPlayerId].name + '.');
  },

  // ========== CITY SPECIALIZATIONS ==========

  SPECIALIZATIONS: [
    {id: 'mining', name: 'Mining', check: b => b.prod >= 2, bonus: {prodMod: 0.1}},
    {id: 'farming', name: 'Farming', check: b => b.food >= 2, bonus: {growthMod: 0.1}},
    {id: 'science', name: 'Science', check: b => b.sci >= 2, bonus: {sciMod: 0.1}},
    {id: 'commerce', name: 'Commerce', check: b => b.gold >= 2, bonus: {goldMod: 0.1}},
    {id: 'military', name: 'Military', check: b => b.defense > 0, bonus: {defMod: 0.1}},
    {id: 'culture', name: 'Culture', check: b => b.cul >= 2, bonus: {culMod: 0.1}},
    {id: 'industrial', name: 'Industrial', check: b => b.prodMod > 0, bonus: {prodMod: 0.15}},
    {id: 'maritime', name: 'Maritime', check: b => b.needsCoast, bonus: {goldMod: 0.15}},
  ],

  getCitySpecialization(city) {
    const counts = {};
    for (const spec of this.SPECIALIZATIONS) {
      counts[spec.id] = 0;
      for (const bId of city.buildings) {
        const b = BUILDINGS.find(b => b.id === bId);
        if (b && spec.check(b)) counts[spec.id]++;
      }
    }
    // Find dominant specialization
    let best = null, bestCount = 0;
    for (const [specId, count] of Object.entries(counts)) {
      if (count > bestCount) { bestCount = count; best = specId; }
    }
    if (!best || bestCount < 3) return {id: null, tier: null, bonuses: {}};
    const tier = bestCount >= 8 ? 'dominant' : bestCount >= 5 ? 'established' : 'emerging';
    const spec = this.SPECIALIZATIONS.find(s => s.id === best);
    const multiplier = tier === 'dominant' ? 3 : tier === 'established' ? 2 : 1;
    const bonuses = {};
    for (const [k, v] of Object.entries(spec.bonus)) {
      bonuses[k] = v * multiplier;
    }
    return {id: best, name: spec.name, tier, bonuses};
  },

  // ========== MINOR FACTIONS ==========

  // Minor factions are tracked as special non-player cities
  // They provide bonuses to the player with highest influence

  getMinorFactionBonus(factionType) {
    switch (factionType) {
      case 'militaristic': return {desc: '+2 XP for new units', xpBonus: 2};
      case 'maritime': return {desc: '+1 food in all cities', foodBonus: 1};
      case 'cultural': return {desc: '+2 culture in capital', culBonus: 2};
      case 'scientific': return {desc: '+2 science in capital', sciBonus: 2};
      case 'mercantile': return {desc: '+3 gold in capital', goldBonus: 3};
      default: return {};
    }
  },

  // ========== TRADE ROUTES ==========

  TRADE_ROUTE_TYPES: [
    {id: 'caravan', name: 'Caravan', domain: 'land'},
    {id: 'cargo_ship', name: 'Cargo Ship', domain: 'sea'}
  ],

  getMaxTradeRoutes(player) {
    let max = 1; // base
    for (const city of player.cities) {
      for (const bId of city.buildings) {
        const b = BUILDINGS.find(b => b.id === bId);
        if (b && (bId === 'market' || bId === 'trade_depot' || bId === 'stock_exchange' || bId === 'autonomous_port')) max++;
      }
    }
    return Math.min(max, 8);
  },

  getTradeRouteIncome(fromCity, toCity) {
    const dist = this.tileDistance(fromCity.r, fromCity.c, toCity.r, toCity.c);
    const goldIncome = Math.max(1, Math.floor(dist * 0.5 + fromCity.population * 0.3 + toCity.population * 0.3));
    const sciIncome = Math.floor(goldIncome * 0.3);
    return {gold: goldIncome, sci: sciIncome};
  },

  processTradeRoutes(playerId) {
    const p = this.state.players[playerId];
    if (!p.tradeRoutes) p.tradeRoutes = [];
    let totalGold = 0, totalSci = 0;
    for (const route of p.tradeRoutes) {
      const fromCity = this.findCityById(route.fromCityId);
      const toCity = this.findCityById(route.toCityId);
      if (!fromCity || !toCity) continue;
      const income = this.getTradeRouteIncome(fromCity, toCity);
      totalGold += income.gold;
      totalSci += income.sci;
    }
    p.gold += totalGold;
    p.totalScience += totalSci;
    return {gold: totalGold, sci: totalSci};
  },

  establishTradeRoute(playerId, fromCityId, toCityId) {
    const p = this.state.players[playerId];
    if (!p.tradeRoutes) p.tradeRoutes = [];
    if (p.tradeRoutes.length >= this.getMaxTradeRoutes(p)) {
      if (playerId === 0) UI.notify('Maximum trade routes reached!');
      return false;
    }
    if (p.tradeRoutes.some(r => r.fromCityId === fromCityId && r.toCityId === toCityId)) return false;
    p.tradeRoutes.push({fromCityId, toCityId});
    if (playerId === 0) UI.notify('Trade route established!');
    return true;
  },

  // ========== SPORTS & ENTERTAINMENT ==========

  SPORT_VENUES: ['stadium', 'athletics_track', 'golf_course', 'cricket_ground'],

  processSports(playerId) {
    const p = this.state.players[playerId];
    if (!p.sportsState) p.sportsState = {teams: [], seasonCounter: 0, dynastyCount: 0, lastChamp: null};

    // Build team list from venue buildings
    p.sportsState.teams = [];
    for (const city of p.cities) {
      for (const bId of city.buildings) {
        if (this.SPORT_VENUES.includes(bId) || bId === 'wembley' || bId === 'lords_cricket_ground') {
          const existing = p.sportsState.teams.find(t => t.cityId === city.id);
          if (!existing) {
            p.sportsState.teams.push({
              cityId: city.id, cityName: city.name,
              rating: 30 + city.population * 3 + Math.floor(Math.random() * 20),
              wins: 0
            });
          }
        }
      }
    }

    // Season every 10 turns
    p.sportsState.seasonCounter++;
    if (p.sportsState.seasonCounter >= 10 && p.sportsState.teams.length >= 2) {
      p.sportsState.seasonCounter = 0;
      // Run season — best rated team wins
      let bestTeam = p.sportsState.teams.reduce((a, b) =>
        (a.rating + Math.random() * 20) > (b.rating + Math.random() * 20) ? a : b
      );
      bestTeam.wins++;

      // Dynasty bonus
      if (p.sportsState.lastChamp === bestTeam.cityId) {
        p.sportsState.dynastyCount++;
        if (p.sportsState.dynastyCount >= 3) {
          p.totalCulture += 5;
          if (playerId === 0) UI.notify(bestTeam.cityName + ' dynasty! +5 Culture!');
        }
      } else {
        p.sportsState.lastChamp = bestTeam.cityId;
        p.sportsState.dynastyCount = 1;
      }
      if (playerId === 0) UI.notify('⚽ ' + bestTeam.cityName + ' wins the season!');

      // Olympics every 40 turns
      if (this.state.turn % 40 === 0 && p.sportsState.teams.length > 0) {
        const hostCity = p.cities.find(c => c.id === p.sportsState.teams[0].cityId);
        if (hostCity) {
          p.totalCulture += 10;
          p.gold += 20;
          if (playerId === 0) UI.notify('🏅 Olympics hosted in ' + hostCity.name + '! +10 Culture, +20 Gold');
        }
      }
    }
  },

  // ========== RELIGION & FAITH ==========

  PANTHEONS: [
    {id: 'sun_god', name: 'God of the Sun', desc: '+1 food from farms', effect: {farmFood: 1}},
    {id: 'earth_mother', name: 'Earth Mother', desc: '+1 faith from mines', effect: {mineFaith: 1}},
    {id: 'god_of_war', name: 'God of War', desc: '+10% combat str', effect: {combatMod: 0.1}},
    {id: 'sea_god', name: 'God of the Sea', desc: '+1 food from coast', effect: {coastFood: 1}},
    {id: 'god_of_craft', name: 'God of Craftsmen', desc: '+1 prod in cities', effect: {cityProd: 1}},
    {id: 'goddess_of_love', name: 'Goddess of Love', desc: '+1 happiness in all cities', effect: {empHappy: 1}},
  ],

  BELIEFS: [
    {id: 'tithe', name: 'Tithe', desc: '+1 gold per 4 followers'},
    {id: 'religious_community', name: 'Religious Community', desc: '+1% prod per follower'},
    {id: 'choral_music', name: 'Choral Music', desc: 'Shrines & Temples give +culture'},
    {id: 'scripture', name: 'Scripture', desc: '+1 science from shrines'},
    {id: 'pilgrimage', name: 'Pilgrimage', desc: '+2 faith per foreign city with religion'},
  ],

  processFaith(playerId) {
    const p = this.state.players[playerId];
    if (!p.faith) p.faith = 0;

    // Faith from buildings
    let faithGain = 0;
    for (const city of p.cities) {
      for (const bId of city.buildings) {
        if (bId === 'shrine') faithGain += 1;
        if (bId === 'temple' || bId === 'cathedral' || bId === 'monastery') faithGain += 2;
        if (bId === 'pagoda') faithGain += 3;
      }
    }
    p.faith += faithGain;

    // Pantheon threshold
    if (!p.pantheon && p.faith >= 25) {
      // Auto-select first available pantheon
      const taken = this.state.players.filter(pl => pl.pantheon).map(pl => pl.pantheon);
      const available = this.PANTHEONS.filter(pa => !taken.includes(pa.id));
      if (available.length > 0) {
        p.pantheon = available[0].id;
        if (playerId === 0) UI.notify('Pantheon founded: ' + available[0].name + '!');
      }
    }

    // Religion threshold
    if (!p.religion && p.pantheon && p.faith >= 100) {
      const religionNames = ['Buddhism','Christianity','Hinduism','Islam','Judaism','Taoism','Zoroastrianism','Confucianism'];
      const taken = this.state.players.filter(pl => pl.religion).map(pl => pl.religion);
      const available = religionNames.filter(r => !taken.includes(r));
      if (available.length > 0) {
        p.religion = available[0];
        if (playerId === 0) UI.notify('Religion founded: ' + p.religion + '!');
      }
    }

    // Pantheon combat bonus
    if (p.pantheon === 'god_of_war') {
      p.combatMod = (p.isAI ? this.state.difficulty.aiCombat : 1.0) * 1.1;
    }
  },

  // ========== FOG OF WAR ==========

  updateFogOfWar() {
    const {mapHeight} = this.state;
    // Reset all visible→explored for ALL players
    for (let r = 0; r < mapHeight; r++) {
      for (let c = 0; c < this.rowWidths[r]; c++) {
        const tile = this.mapData[r][c];
        for (let p = 0; p < this.state.players.length; p++) {
          if (tile.fogState[p] === 2) tile.fogState[p] = 1;
        }
      }
    }

    // Reveal around each player's cities and units — explicitly pass playerId
    const revealFor = (playerId, r, c, range) => {
      const visited = new Set();
      const queue = [{r, c, d: 0}];
      visited.add(r + ',' + c);
      while (queue.length > 0) {
        const {r: cr, c: cc, d} = queue.shift();
        const tile = this.getTile(cr, cc);
        if (tile) tile.fogState[playerId] = 2;
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

    for (let pi = 0; pi < this.state.players.length; pi++) {
      const p = this.state.players[pi];
      if (!p.alive) continue;
      const sightRange = 2;
      for (const city of p.cities) revealFor(pi, city.r, city.c, sightRange + 1);
      for (const unit of p.units) {
        const uType = this.getUnitType(unit);
        const sight = uType.type === 'recon' ? 3 : sightRange;
        revealFor(pi, unit.r, unit.c, sight);
      }
    }
  },

  // ========== END TURN ==========

  endTurn() {
    if (this.state.gameOver) return;

    // Process human player
    this.processImprovementBuilding();
    this.processTurn(0);

    // Reset human units
    for (const u of this.state.players[0].units) {
      const uType = this.getUnitType(u);
      const promos = this.getPromotionBonuses(u);
      u.movementLeft = uType.mv + promos.mvBonus;
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
        const promos = this.getPromotionBonuses(u);
        u.movementLeft = uType.mv + promos.mvBonus;
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

    // Check for idle cities and units
    UI.checkIdleNotifications();

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

    // Score victory at 2100 AD
    if (this.getYear() >= 2100) {
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
      // Backward-compat for new systems
      if (!p.cultureAccum) p.cultureAccum = {};
      if (!p.greatPeoplePoints) p.greatPeoplePoints = {scientist:0,engineer:0,artist:0,general:0,merchant:0,prophet:0};
      if (!p.greatPeopleThreshold) p.greatPeopleThreshold = 100;
      if (!p.faith) p.faith = 0;
      if (!p.relations) p.relations = {};
      if (p.treaties && p.treaties.__set) p.treaties = new Set(p.treaties.__set);
    }
    if (!this.state.eraHistory) this.state.eraHistory = [{turn: 0, era: 'caveman'}];
    if (!this.state.goldenAge) this.state.goldenAge = {};
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
          road: td.rd === true ? 'road' : td.rd, // backward-compat: true → 'road'
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
