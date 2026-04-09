// Apollo's Time — AI Opponent Logic
"use strict";

const AI = {
  takeTurn(playerId) {
    const p = Game.state.players[playerId];
    if (!p.alive) return;

    // Diplomacy decisions
    this.manageDiplomacy(playerId, p);

    // City management
    for (const city of p.cities) {
      this.manageCity(city, p);
    }

    // Trade route management
    this.manageTradeRoutes(playerId, p);

    // City-state interactions
    this.manageCityStates(playerId, p);

    // Unit management
    for (const unit of [...p.units]) {
      if (!p.units.includes(unit)) continue; // May have been killed
      this.manageUnit(unit, p);
    }
  },

  manageDiplomacy(playerId, player) {
    const myMilitary = player.units.filter(u => Game.getUnitType(u).str > 0).length;

    for (const other of Game.state.players) {
      if (other.id === playerId || !other.alive) continue;

      Game.initRelations(playerId, other.id);
      const rel = player.relations[other.id];
      if (!rel) continue;

      // Adjust relation scores based on borders
      const hasSharedBorder = player.cities.some(myCity =>
        other.cities.some(theirCity => Game.tileDist(myCity.r, myCity.c, theirCity.r, theirCity.c) <= 5)
      );
      if (hasSharedBorder) rel.score = (rel.score || 0) - 5;

      // Trade boosts relations
      if (player.tradeRoutes && player.tradeRoutes.some(r => r.partnerId === other.id)) {
        rel.score = (rel.score || 0) + 5;
      }

      const score = rel.score || 0;
      const theirMilitary = other.units.filter(u => Game.getUnitType(u).str > 0).length;

      if (score < -30 && !rel.war && myMilitary > theirMilitary) {
        Game.declareWar(playerId, other.id);
      } else if (rel.war && (score > -10 || player.cities.length < 2)) {
        Game.makePeace(playerId, other.id);
      }
    }
  },

  manageTradeRoutes(playerId, player) {
    if (!player.tradeRoutes) player.tradeRoutes = [];
    if (player.tradeRoutes.length < Game.getMaxTradeRoutes(player) && player.cities.length >= 2) {
      for (let i = 0; i < player.cities.length; i++) {
        for (let j = i + 1; j < player.cities.length; j++) {
          const a = player.cities[i], b = player.cities[j];
          if (!player.tradeRoutes.some(r => r.fromCityId === a.id && r.toCityId === b.id)) {
            Game.establishTradeRoute(playerId, a.id, b.id);
            break;
          }
        }
        if (player.tradeRoutes.length >= Game.getMaxTradeRoutes(player)) break;
      }
    }
  },

  manageCityStates(playerId, player) {
    if (!Game.state.cityStates || Game.state.cityStates.length === 0) return;
    if (player.gold < 200) return;

    // Determine preferred city-state type based on leader style
    const militaryStr = player.units.filter(u => Game.getUnitType(u).str > 0).length;
    const isAggressive = militaryStr > player.cities.length * 3;

    // If aggressive, consider attacking nearby city-states
    if (isAggressive && player.gold > 300) {
      for (const cs of Game.state.cityStates) {
        if (!cs.alive) continue;
        // Check if we have a military unit adjacent
        const neighbors = Game.getNeighbors(cs.r, cs.c);
        for (const n of neighbors) {
          const tile = Game.getTile(n.r, n.c);
          if (tile && tile.unit && tile.unit.owner === playerId && !tile.unit.hasActed) {
            const uType = Game.getUnitType(tile.unit);
            if (uType.str >= 8) {
              Game.attackCityState(tile.unit, cs.id);
              return;
            }
          }
        }
      }
    }

    // Peaceful: send envoys to preferred city-state types
    const preferredTypes = [];
    const sciTotal = player.totalScience || 0;
    const culTotal = player.totalCulture || 0;
    if (sciTotal > culTotal) preferredTypes.push('scientific', 'trade');
    else preferredTypes.push('cultural', 'religious');
    preferredTypes.push('militaristic');

    for (const cs of Game.state.cityStates) {
      if (!cs.alive) continue;
      const inf = cs.influence[playerId] || 0;
      if (inf >= 60) continue; // already ally
      if (player.gold < 100) break;
      // Prefer matching types
      const isPreferred = preferredTypes.indexOf(cs.type) < 2;
      if (isPreferred || inf >= 20) {
        Game.sendEnvoy(playerId, cs.id);
        if (player.gold < 100) break;
      }
    }
  },

  manageCity(city, player) {
    if (city.buildQueue) return; // Already building

    const yields = Game.getCityYields(city);
    const tier = Game.getCityTier(city.population);

    // Priority: military if threatened, settlers if few cities, buildings otherwise
    const needsMilitary = this.isThreatened(city, player);
    const needsSettler = player.cities.length < 4 && city.population > 3 && player.techs.has('agriculture');
    const needsBuilder = player.units.filter(u => Game.getUnitType(u).type === 'civilian' && Game.getUnitType(u).canBuild).length < 1;

    if (needsMilitary) {
      const bestUnit = this.getBestMilitaryUnit(player);
      if (bestUnit) {
        Game.startBuild(city, 'unit', bestUnit.id);
        return;
      }
    }

    if (needsSettler && !city.buildQueue) {
      Game.startBuild(city, 'unit', 'settler');
      return;
    }

    if (needsBuilder && player.techs.has('mining')) {
      Game.startBuild(city, 'unit', 'worker');
      return;
    }

    // Build buildings
    const available = Game.getAvailableBuildings(city);
    if (available.length > 0) {
      const scored = available.map(b => {
        let score = 0;
        score += (b.food || 0) * 3;
        score += (b.prod || 0) * 2.5;
        score += (b.gold || 0) * 2;
        score += (b.sci || 0) * 2;
        score += (b.cul || 0) * 1.5;
        score += (b.hap || 0) * 3;
        if (b.defense) score += b.defense * 0.5;
        if (b.growthMod) score += b.growthMod * 20;
        if (b.sciMod) score += b.sciMod * 15;
        if (b.goldMod) score += b.goldMod * 10;
        if (b.prodMod) score += b.prodMod * 15;
        return {b, score};
      });
      scored.sort((a, b) => b.score - a.score);
      Game.startBuild(city, 'building', scored[0].b.id);
      return;
    }

    // Build wonders
    const wonders = Game.getAvailableWonders(city);
    if (wonders.length > 0 && Math.random() < 0.3) {
      Game.startBuild(city, 'wonder', wonders[0].id);
      return;
    }

    // Build national buildings (high priority — one per empire)
    const nationals = Game.getAvailableNationalBuildings(city);
    if (nationals.length > 0 && Math.random() < 0.5) {
      Game.startBuild(city, 'national', nationals[0].id);
      return;
    }

    // Default: build military
    const bestUnit = this.getBestMilitaryUnit(player);
    if (bestUnit) {
      Game.startBuild(city, 'unit', bestUnit.id);
    }
  },

  getBestMilitaryUnit(player) {
    const available = UNIT_TYPES.filter(u => {
      if (!player.techs.has(u.req)) return false;
      if (u.type === 'civilian' || u.type === 'settler' || u.type === 'victory') return false;
      if (u.domain !== 'land') return false;
      return true;
    });
    if (available.length === 0) return null;
    // Pick strongest
    return available.reduce((a, b) => (a.str > b.str ? a : b));
  },

  isThreatened(city, player) {
    // Check for enemy units near city
    const neighbors = Game.getNeighbors(city.r, city.c);
    for (const n of neighbors) {
      const tile = Game.getTile(n.r, n.c);
      if (tile && tile.unit && tile.unit.owner !== player.id) {
        const uType = Game.getUnitType(tile.unit);
        if (uType.str > 0) return true;
      }
    }
    return false;
  },

  manageUnit(unit, player) {
    const uType = Game.getUnitType(unit);
    if (unit.movementLeft <= 0) return;

    // Handle promotions before other actions
    const promos = Game.getAvailablePromotions(unit);
    if (promos.length > 0) {
      let pick = promos[0];
      if (uType.type === 'melee' || uType.type === 'mounted') {
        pick = promos.find(p => p.strMod) || promos.find(p => p.mvBonus) || promos[0];
      } else if (uType.type === 'ranged') {
        pick = promos.find(p => p.id === 'accuracy') || promos.find(p => p.strMod) || promos[0];
      } else {
        pick = promos.find(p => p.defBonus) || promos[0];
      }
      Game.applyPromotion(unit, pick.id);
    }

    if (uType.type === 'settler') {
      this.settlerAI(unit, player);
    } else if (uType.type === 'civilian') {
      this.workerAI(unit, player);
    } else if (uType.type === 'recon') {
      this.explorerAI(unit, player);
    } else if (uType.str > 0) {
      this.militaryAI(unit, player);
    }
  },

  settlerAI(unit, player) {
    // Find a good spot to settle
    let bestTile = null, bestScore = -1;

    const searchRadius = 10;
    for (let dr = -searchRadius; dr <= searchRadius; dr++) {
      for (let dc = -searchRadius; dc <= searchRadius; dc++) {
        const r = unit.r + dr;
        const c = unit.c + dc;
        if (r < 0 || r >= Game.state.mapHeight) continue;
        const rw = Game.rowWidths[r];
        const cc = ((c % rw) + rw) % rw;
        const tile = Game.getTile(r, cc);
        if (!tile) continue;
        const terrain = TERRAINS[tile.terrain];
        if (terrain.water || terrain.mv >= 99) continue;
        if (tile.cityId) continue;
        if (tile.owner >= 0 && tile.owner !== player.id) continue;

        // Check distance from other cities
        let tooClose = false;
        for (const p of Game.state.players) {
          for (const city of p.cities) {
            if (Game.tileDist(r, cc, city.r, city.c) < 4) {
              tooClose = true;
              break;
            }
          }
          if (tooClose) break;
        }
        if (tooClose) continue;

        // Score based on nearby food
        let score = terrain.food * 2 + terrain.prod;
        const neighbors = Game.getNeighbors(r, cc);
        for (const n of neighbors) {
          const nt_tile = Game.getTile(n.r, n.c);
          if (!nt_tile) continue;
          const nt = TERRAINS[nt_tile.terrain];
          score += nt.food + nt.prod * 0.5;
          if (nt_tile.resource) score += 2;
        }

        // Prefer closer spots
        score -= Game.tileDist(unit.r, unit.c, r, cc) * 0.3;

        if (score > bestScore) {
          bestScore = score;
          bestTile = {r, c: cc};
        }
      }
    }

    if (bestTile) {
      if (bestTile.r === unit.r && bestTile.c === unit.c) {
        // Settle here
        Game.foundCity(player.id, unit.r, unit.c);
        Game.killUnit(unit);
        return;
      }
      // Move toward it
      this.moveToward(unit, bestTile.r, bestTile.c);
    }
  },

  workerAI(unit, player) {
    const tile = Game.getTile(unit.r, unit.c);
    if (!tile) { this.explorerAI(unit, player); return; }

    // If on an owned tile with no improvement, build one
    if (tile.owner === player.id && !tile.improvement) {
      const terrain = TERRAINS[tile.terrain];
      if (!terrain.water && terrain.mv < 99) {
        // Find best improvement for this tile
        const bestImp = this.pickImprovement(tile, terrain, player);
        if (bestImp) {
          Game.startBuildImprovement(unit, bestImp);
          return;
        }
      }
    }

    // If tile has improvement but no road, build a road
    if (tile.owner === player.id && tile.improvement && !tile.road) {
      const roadImp = IMPROVEMENTS.find(imp => imp.id === 'road' &&
        (!imp.req || player.techs.has(imp.req)));
      if (roadImp) {
        Game.startBuildImprovement(unit, 'road');
        return;
      }
    }

    // Upgrade roads: railway if has steam_power, motorway if has combustion
    if (tile.owner === player.id && tile.road) {
      if (player.techs.has('combustion') && tile.road !== 'motorway') {
        const motorImp = IMPROVEMENTS.find(imp => imp.id === 'motorway');
        if (motorImp) {
          Game.startBuildImprovement(unit, 'motorway');
          return;
        }
      } else if (player.techs.has('steam_power') && tile.road !== 'railway' && tile.road !== 'motorway') {
        const railImp = IMPROVEMENTS.find(imp => imp.id === 'railway');
        if (railImp) {
          Game.startBuildImprovement(unit, 'railway');
          return;
        }
      }
    }

    // Move toward nearest unimproved owned tile
    let bestTile = null, bestDist = Infinity;
    const searchRadius = 8;
    for (let dr = -searchRadius; dr <= searchRadius; dr++) {
      for (let dc = -searchRadius; dc <= searchRadius; dc++) {
        const r = unit.r + dr;
        const c = unit.c + dc;
        if (r < 0 || r >= Game.state.mapHeight) continue;
        const rw = Game.rowWidths[r];
        const cc = ((c % rw) + rw) % rw;
        const t = Game.getTile(r, cc);
        if (!t || t.owner !== player.id || t.improvement) continue;
        const terr = TERRAINS[t.terrain];
        if (terr.water || terr.mv >= 99) continue;
        const d = Game.tileDist(unit.r, unit.c, r, cc);
        if (d > 0 && d < bestDist) {
          bestDist = d;
          bestTile = {r, c: cc};
        }
      }
    }

    if (bestTile) {
      this.moveToward(unit, bestTile.r, bestTile.c);
    } else {
      this.explorerAI(unit, player);
    }
  },

  pickImprovement(tile, terrain, player) {
    // Priority: farm on grassland/plains, mine on hills/mountains
    const candidates = [];
    for (const imp of IMPROVEMENTS) {
      if (imp.id === 'road' || imp.id === 'railway' || imp.id === 'motorway') continue;
      if (imp.req && !player.techs.has(imp.req)) continue;
      if (imp.terrains && !imp.terrains.includes(terrain.id) && !imp.terrains.includes('any_land')) continue;
      let priority = 0;
      if (imp.id === 'farm' && (terrain.id === 'grassland' || terrain.id === 'plains')) priority = 10;
      else if (imp.id === 'mine' && (terrain.id === 'hills' || terrain.id === 'mountains')) priority = 9;
      else if (imp.id === 'farm') priority = 6;
      else if (imp.id === 'mine') priority = 5;
      else if (imp.id === 'plantation' || imp.id === 'camp' || imp.id === 'pasture') priority = 7;
      else priority = 3;
      candidates.push({id: imp.id, priority});
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0].id;
  },

  explorerAI(unit, player) {
    // Move toward unexplored territory
    const range = Game.getMovementRange(unit);
    let bestKey = null, bestScore = -1;

    for (const [key, mvLeft] of range) {
      if (mvLeft < 0) continue; // Don't attack with scouts
      const [r, c] = key.split(',').map(Number);
      const tile = Game.getTile(r, c);
      if (!tile || tile.unit) continue;

      // Score: prefer tiles near unexplored areas
      let score = 0;
      const neighbors = Game.getNeighbors(r, c);
      for (const n of neighbors) {
        const nt = Game.getTile(n.r, n.c);
        if (nt && nt.fogState[player.id] === 0) score += 3;
        if (nt && nt.fogState[player.id] === 1) score += 1;
      }
      score += Math.random() * 2; // Add some randomness

      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }

    if (bestKey) {
      const [r, c] = bestKey.split(',').map(Number);
      Game.moveUnit(unit, r, c);
    }
  },

  militaryAI(unit, player) {
    const range = Game.getMovementRange(unit);

    // First: attack any enemy in range
    for (const [key, mvLeft] of range) {
      const [r, c] = key.split(',').map(Number);
      const tile = Game.getTile(r, c);
      if (tile && tile.unit && tile.unit.owner !== player.id) {
        const enemy = tile.unit;
        const eType = Game.getUnitType(enemy);
        const uType = Game.getUnitType(unit);
        // Only attack if we're stronger or close
        if (uType.str >= eType.str * 0.7) {
          Game.moveUnit(unit, r, c);
          return;
        }
      }
    }

    // If near a city that's threatened, stay and fortify
    for (const city of player.cities) {
      if (Game.tileDist(unit.r, unit.c, city.r, city.c) <= 2 && this.isThreatened(city, player)) {
        // Move toward city
        this.moveToward(unit, city.r, city.c);
        return;
      }
    }

    // Patrol: move toward nearest enemy territory or explore
    let nearestEnemy = null, nearestDist = Infinity;
    for (const other of Game.state.players) {
      if (other.id === player.id || !other.alive) continue;
      for (const city of other.cities) {
        const d = Game.tileDist(unit.r, unit.c, city.r, city.c);
        if (d < nearestDist) {
          nearestDist = d;
          nearestEnemy = city;
        }
      }
    }

    if (nearestEnemy && nearestDist < 15 && player.units.filter(u => Game.getUnitType(u).str > 0).length > 3) {
      // Aggressive: move toward enemy
      this.moveToward(unit, nearestEnemy.r, nearestEnemy.c);
    } else {
      // Defensive: patrol near own cities
      if (player.cities.length > 0) {
        const randomCity = player.cities[Math.floor(Math.random() * player.cities.length)];
        if (Game.tileDist(unit.r, unit.c, randomCity.r, randomCity.c) > 4) {
          this.moveToward(unit, randomCity.r, randomCity.c);
        } else {
          this.explorerAI(unit, player);
        }
      }
    }
  },

  moveToward(unit, targetR, targetC) {
    const range = Game.getMovementRange(unit);
    let bestKey = null, bestDist = Infinity;

    for (const [key, mvLeft] of range) {
      if (mvLeft < 0) continue;
      const [r, c] = key.split(',').map(Number);
      const tile = Game.getTile(r, c);
      if (tile && tile.unit) continue;
      const d = Game.tileDist(r, c, targetR, targetC);
      if (d < bestDist) {
        bestDist = d;
        bestKey = key;
      }
    }

    if (bestKey) {
      const [r, c] = bestKey.split(',').map(Number);
      Game.moveUnit(unit, r, c);
    }
  },

  chooseResearch(player) {
    if (player.currentResearch) return;
    const available = Game.getAvailableTechs(player);
    if (available.length === 0) return;

    const atWar = player.relations && Object.values(player.relations).some(r => r && r.war);
    const hasRoadTech = player.techs.has('the_wheel') || player.techs.has('engineering');

    const scored = available.map(t => {
      let score = 0;
      // Prefer earlier eras
      score -= ERAS.indexOf(t.era) * 5;
      // Prefer techs that unlock buildings
      score += t.unlocks.length * 3;

      // At war: strongly prefer military techs
      if (atWar && t.unlocks.some(u => UNIT_TYPES.find(ut => ut.id === u && ut.str > 0))) score += 12;
      else if (t.unlocks.some(u => UNIT_TYPES.find(ut => ut.id === u && ut.str > 0))) score += 5;

      // Need roads: prefer road-enabling techs
      if (!hasRoadTech && t.unlocks.some(u => u === 'road' || IMPROVEMENTS.find(imp => imp.id === u))) score += 8;

      // Prefer science/economy techs
      if (t.unlocks.some(u => BUILDINGS.find(b => b.id === u && b.sci > 0))) score += 4;
      if (t.unlocks.some(u => BUILDINGS.find(b => b.id === u && b.gold > 0))) score += 3;

      // Prefer techs that unlock improvements
      if (t.unlocks.some(u => IMPROVEMENTS.find(imp => imp.id === u))) score += 3;

      // Cheaper is better
      score -= t.cost * 0.01;
      return {t, score};
    });

    scored.sort((a, b) => b.score - a.score);
    player.currentResearch = scored[0].t.id;
    player.researchProgress = 0;
  },

  chooseCivic(player) {
    if (player.currentCivic) return;
    const available = Game.getAvailableCivics(player);
    if (available.length === 0) return;

    const leader = LEADERS.find(l => l.name === player.name);
    const preferredGovs = leader && leader.politics ? leader.politics.preferredGovs : [];

    const scored = available.map(c => {
      let score = 0;
      score -= ERAS.indexOf(c.era) * 5;
      // Prefer civics that unlock governments
      const unlockedGovs = GOVERNMENTS.filter(g => g.unlockedBy === c.id);
      score += unlockedGovs.length * 10;
      // Strongly prefer civics that unlock preferred governments
      for (const g of unlockedGovs) {
        if (preferredGovs.includes(g.id)) score += 20;
      }
      score -= c.cost * 0.01;
      return {c, score};
    });

    scored.sort((a, b) => b.score - a.score);
    player.currentCivic = scored[0].c.id;
    player.civicProgress = 0;
  },

  chooseGovernment(player) {
    const available = Game.getAvailableGovernments(player);
    if (available.length === 0) return;

    const leader = LEADERS.find(l => l.name === player.name);
    const preferredGovs = leader && leader.politics ? leader.politics.preferredGovs : [];
    const influence = leader && leader.politics ? leader.politics.influence : 5;

    let best = null;
    let bestScore = -Infinity;

    for (const gov of available) {
      let score = ERAS.indexOf(gov.era) * 3; // prefer later-era govs
      const b = gov.bonuses;
      // Score based on bonuses
      if (b.prod) score += b.prod * 50;
      if (b.sci) score += b.sci * 40;
      if (b.gold) score += b.gold * 35;
      if (b.cul) score += b.cul * 30;
      if (b.combat) score += b.combat * 45;
      if (b.hap) score += b.hap * 5;
      // Penalties
      if (gov.penalty && gov.penalty.hap) score += gov.penalty.hap * 8;
      // Leader political preference — heavily weighted by influence
      if (preferredGovs.includes(gov.id)) score += influence * 5;
      if (score > bestScore) { bestScore = score; best = gov; }
    }

    if (best && best.id !== player.government) {
      Game.adoptGovernment(player, best.id);
    }
  }
};
