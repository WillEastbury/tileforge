// Apollo's Time — AI Opponent Logic
"use strict";

const AI = {
  takeTurn(playerId) {
    const p = Game.state.players[playerId];
    if (!p.alive) return;

    // City management
    for (const city of p.cities) {
      this.manageCity(city, p);
    }

    // Unit management
    for (const unit of [...p.units]) {
      if (!p.units.includes(unit)) continue; // May have been killed
      this.manageUnit(unit, p);
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
      // Prioritize by era and yield
      const scored = available.map(b => {
        let score = 0;
        score += b.food * 3;
        score += b.prod * 2.5;
        score += b.gold * 2;
        score += b.sci * 2;
        score += b.cul * 1.5;
        score += b.hap * 3;
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
          const nt = TERRAINS[Game.mapData[n.r][n.c].terrain];
          score += nt.food + nt.prod * 0.5;
          if (Game.mapData[n.r][n.c].resource) score += 2;
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
    // Simple: just move toward nearest unimproved resource in player territory
    // For now, just wander
    this.explorerAI(unit, player);
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

    // Score techs
    const scored = available.map(t => {
      let score = 0;
      // Prefer earlier eras
      score -= ERAS.indexOf(t.era) * 5;
      // Prefer techs that unlock buildings
      score += t.unlocks.length * 3;
      // Prefer military techs if at war or aggressive
      if (t.unlocks.some(u => UNIT_TYPES.find(ut => ut.id === u && ut.str > 0))) score += 5;
      // Prefer science/economy techs
      if (t.unlocks.some(u => BUILDINGS.find(b => b.id === u && b.sci > 0))) score += 4;
      if (t.unlocks.some(u => BUILDINGS.find(b => b.id === u && b.gold > 0))) score += 3;
      // Cheaper is better
      score -= t.cost * 0.01;
      return {t, score};
    });

    scored.sort((a, b) => b.score - a.score);
    player.currentResearch = scored[0].t.id;
    player.researchProgress = 0;
  }
};
