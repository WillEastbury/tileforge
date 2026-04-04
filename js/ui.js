// TileForge — UI Manager
"use strict";

const UI = {
  screens: ['main-menu', 'new-game-screen', 'save-load-screen', 'game-screen'],

  showScreen(id) {
    for (const s of this.screens) {
      const el = document.getElementById(s);
      el.classList.toggle('active', s === id);
    }
  },

  showMainMenu() {
    this.showScreen('main-menu');
  },

  showNewGame() {
    this.showScreen('new-game-screen');
  },

  showLoadGame() {
    this.showScreen('save-load-screen');
    document.getElementById('save-load-title').textContent = 'Load Game';
    this.renderSaveSlots('load');
  },

  showSaveGame() {
    document.getElementById('save-load-screen').classList.add('active');
    document.getElementById('game-screen').classList.add('active');
    document.getElementById('save-load-title').textContent = 'Save Game';
    this.renderSaveSlots('save');
  },

  showLoadGameInGame() {
    document.getElementById('save-load-screen').classList.add('active');
    document.getElementById('save-load-title').textContent = 'Load Game';
    this.renderSaveSlots('load');
    this.closeMenu();
  },

  renderSaveSlots(mode) {
    const container = document.getElementById('save-slots');
    container.innerHTML = '';

    for (let i = 0; i < 8; i++) {
      const save = SaveManager.getSlotInfo(i);
      const slot = document.createElement('div');
      slot.className = 'save-slot';

      if (save) {
        slot.innerHTML = `
          <div class="slot-info">
            <div class="slot-name">Slot ${i + 1}: ${save.civName}</div>
            <div class="slot-detail">Turn ${save.turn} | ${save.era} Era | ${save.date}</div>
          </div>
          <div class="slot-actions">
            ${mode === 'load'
              ? `<button class="btn btn-primary" onclick="loadGameSlot(${i})">Load</button>`
              : `<button class="btn btn-primary" onclick="saveGameSlot(${i})">Save</button>`
            }
            <button class="btn btn-danger" onclick="deleteGameSlot(${i})" style="padding:6px 10px">🗑</button>
          </div>
        `;
      } else {
        slot.innerHTML = `
          <div class="slot-info">
            <div class="slot-empty">Slot ${i + 1} — Empty</div>
          </div>
          <div class="slot-actions">
            ${mode === 'save'
              ? `<button class="btn btn-primary" onclick="saveGameSlot(${i})">Save</button>`
              : ''
            }
          </div>
        `;
      }
      container.appendChild(slot);
    }
  },

  toggleMenu() {
    const menu = document.getElementById('game-menu');
    menu.classList.toggle('hidden');
  },

  closeMenu() {
    document.getElementById('game-menu').classList.add('hidden');
  },

  quitToMenu() {
    this.closeMenu();
    document.getElementById('save-load-screen').classList.remove('active');
    this.showScreen('main-menu');
    Game.state = null;
  },

  // ========== GAME UI ==========

  updateTopBar() {
    if (!Game.state) return;
    const p = Game.state.players[0];
    if (!p) return;

    // Calculate totals
    let food = 0, prod = 0, gold = 0, sci = 0, cul = 0, hist = 0;
    for (const city of p.cities) {
      const y = Game.getCityYields(city);
      food += y.food;
      prod += y.prod;
      gold += y.gold;
      sci += y.sci;
      cul += y.cul;
    }

    document.querySelector('#res-food b').textContent = food;
    document.querySelector('#res-prod b').textContent = prod;
    document.querySelector('#res-money b').textContent = Math.floor(p.gold);
    document.querySelector('#res-science b').textContent = sci;
    document.querySelector('#res-culture b').textContent = cul;
    document.querySelector('#res-history b').textContent = Math.floor(p.totalHistory);

    document.getElementById('turn-display').textContent = 'Turn ' + Game.state.turn;
    document.getElementById('era-display').textContent = ERA_ICONS[p.era] + ' ' + ERA_NAMES[p.era] + ' Era';
  },

  updateRightPanel() {
    const panel = document.getElementById('panel-content');

    if (Game.selectedUnit) {
      const unit = Game.selectedUnit;
      const uType = Game.getUnitType(unit);
      const p = Game.state.players[unit.owner];
      panel.innerHTML = `
        <div class="unit-card">
          <h4>${Renderer.getUnitIcon(uType)} ${uType.name}</h4>
          <div class="stats">
            <div>Owner: ${p.name}</div>
            <div>Era: ${ERA_NAMES[uType.era]}</div>
            ${uType.str ? `<div>Strength: ${uType.str}</div>` : ''}
            ${uType.rng ? `<div>Range: ${uType.rng}</div>` : ''}
            <div>Movement: ${unit.movementLeft}/${uType.mv}</div>
            <div>HP: ${unit.hp}/100</div>
            <div>XP: ${unit.xp}</div>
            ${unit.fortified ? '<div>🛡 Fortified</div>' : ''}
          </div>
          <div class="hp-bar">
            <div class="hp-fill" style="width:${unit.hp}%;background:${unit.hp > 50 ? '#4caf50' : unit.hp > 25 ? '#ff9800' : '#e94560'}"></div>
          </div>
        </div>
      `;
    } else {
      panel.innerHTML = '<p class="hint">Click a tile, city, or unit</p>';
    }
  },

  showTileInfo(tile) {
    const terrain = TERRAINS[tile.terrain];
    const panel = document.getElementById('panel-content');
    let html = `<div class="tile-info">
      <h4>${terrain.emoji} ${terrain.name}</h4>
      <div class="yields">Food: ${terrain.food} | Prod: ${terrain.prod} | Gold: ${terrain.gold}</div>
      <div class="yields">Defense: ${terrain.def > 0 ? '+' : ''}${terrain.def}%</div>`;

    if (tile.resource) {
      html += `<div class="resource-info">${this.getResourceIcon(tile.resource)} ${tile.resource.name} (${tile.resource.type})</div>`;
      html += `<div class="yields">+${tile.resource.food}🌾 +${tile.resource.prod}⚙️ +${tile.resource.gold}💰</div>`;
    }

    if (tile.owner >= 0) {
      html += `<div style="margin-top:4px">Territory: ${Game.state.players[tile.owner].name}</div>`;
    }

    html += '</div>';

    // Show enemy unit info if present
    if (tile.unit && tile.unit.owner !== 0) {
      const unit = tile.unit;
      const uType = Game.getUnitType(unit);
      const p = Game.state.players[unit.owner];
      html += `
        <div class="unit-card" style="border-left:3px solid ${p.color}">
          <h4>${Renderer.getUnitIcon(uType)} ${uType.name}</h4>
          <div class="stats">
            <div>Owner: ${p.name}</div>
            ${uType.str ? `<div>Strength: ~${uType.str}</div>` : ''}
            <div>HP: ~${Math.round(unit.hp / 10) * 10}/100</div>
          </div>
        </div>
      `;
    }

    // Show city info if present
    if (tile.cityId) {
      const city = Game.findCityById(tile.cityId);
      if (city && city.owner !== 0) {
        const p = Game.state.players[city.owner];
        const tier = CITY_TIERS[Game.getCityTier(city.population)];
        html += `
          <div class="unit-card" style="border-left:3px solid ${p.color}">
            <h4>${tier.emoji} ${city.name}</h4>
            <div class="stats">
              <div>${tier.name} (Pop ${city.population})</div>
              <div>Owner: ${p.name}</div>
              <div>Defense: ${city.defenseStr.toFixed(0)} str</div>
            </div>
          </div>
        `;
      }
    }

    panel.innerHTML = html;
  },

  getResourceIcon(resource) {
    return Renderer.getResourceIcon(resource);
  },

  updateActionButtons() {
    const bar = document.getElementById('action-buttons');
    bar.innerHTML = '';

    if (Game.selectedUnit) {
      const unit = Game.selectedUnit;
      const uType = Game.getUnitType(unit);

      if (uType.type === 'settler') {
        const canSettle = !TERRAINS[Game.mapData[unit.r][unit.c].terrain].water &&
                          TERRAINS[Game.mapData[unit.r][unit.c].terrain].mv < 99 &&
                          !Game.mapData[unit.r][unit.c].cityId;
        const btn = document.createElement('button');
        btn.textContent = '🏘 Settle';
        btn.disabled = !canSettle;
        btn.onclick = () => {
          Game.foundCity(unit.owner, unit.r, unit.c);
          Game.killUnit(unit);
          Game.selectedUnit = null;
          Game.movementRange = null;
          Game.updateFogOfWar();
          Renderer.render();
          Renderer.updateMinimap();
          this.updateTopBar();
          this.updateRightPanel();
          bar.innerHTML = '';
        };
        bar.appendChild(btn);
      }

      // Fortify
      if (uType.str > 0) {
        const btn = document.createElement('button');
        btn.textContent = '🛡 Fortify';
        btn.onclick = () => {
          unit.fortified = true;
          unit.movementLeft = 0;
          Game.movementRange = null;
          Renderer.render();
          this.updateRightPanel();
        };
        bar.appendChild(btn);
      }

      // Skip turn
      const skipBtn = document.createElement('button');
      skipBtn.textContent = '⏭ Skip';
      skipBtn.onclick = () => {
        unit.movementLeft = 0;
        Game.selectedUnit = null;
        Game.movementRange = null;
        Renderer.render();
        this.updateRightPanel();
        bar.innerHTML = '';
      };
      bar.appendChild(skipBtn);
    }
  },

  // ========== CITY PANEL ==========

  showCityPanel(city) {
    const panel = document.getElementById('city-panel');
    panel.classList.remove('hidden');

    document.getElementById('city-name').textContent =
      CITY_TIERS[Game.getCityTier(city.population)].emoji + ' ' + city.name;

    const yields = Game.getCityYields(city);
    const tier = Game.getCityTier(city.population);
    const tierInfo = CITY_TIERS[tier];
    const foodConsumed = city.population * 2;
    const foodSurplus = yields.food - foodConsumed;
    const turnsToGrow = foodSurplus > 0 ? Math.ceil((city.foodNeeded - city.food) / foodSurplus) : '∞';

    let html = `
      <div style="margin-bottom:10px">
        <b>${tierInfo.name}</b> — Pop ${city.population} | Slots: ${city.buildings.length}/${tierInfo.slots}
      </div>
      <div class="city-yields">
        <span class="city-yield">🌾 <b>${yields.food}</b> (${foodSurplus >= 0 ? '+' : ''}${foodSurplus})</span>
        <span class="city-yield">⚙️ <b>${yields.prod}</b></span>
        <span class="city-yield">💰 <b>${yields.gold}</b></span>
        <span class="city-yield">🔬 <b>${yields.sci}</b></span>
        <span class="city-yield">🎭 <b>${yields.cul}</b></span>
        <span class="city-yield">😊 <b>${city.happiness}</b></span>
      </div>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">
        Growth: ${city.food}/${city.foodNeeded} (${turnsToGrow} turns) |
        Defense: ${city.defenseStr.toFixed(0)} | HP: ${city.hp}/${city.maxHp}
      </div>
    `;

    // Build queue
    html += '<div class="build-queue"><b>Production Queue</b>';
    if (city.buildQueue) {
      const pct = Math.floor((city.buildQueue.progress / city.buildQueue.cost) * 100);
      const turnsLeft = Math.max(1, Math.ceil((city.buildQueue.cost - city.buildQueue.progress) / Math.max(1, yields.prod)));
      html += `
        <div class="build-item">
          <span>${city.buildQueue.name} (${turnsLeft} turns)</span>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    } else {
      html += '<div style="color:var(--text-dim);font-size:12px;margin:4px 0">Nothing — choose below</div>';
    }
    html += '</div>';

    // Buildings list
    if (city.buildings.length > 0) {
      html += '<div style="margin:8px 0"><b>Buildings</b> (' + city.buildings.length + '/' + tierInfo.slots + ')<br>';
      for (const bId of city.buildings) {
        if (bId.startsWith('wonder_')) {
          const w = WONDERS.find(w => w.id === bId.replace('wonder_', ''));
          html += `<span style="display:inline-block;background:var(--bg-card);padding:2px 6px;border-radius:3px;margin:2px;font-size:11px;border:1px solid var(--gold);color:var(--gold)">${w ? w.name : bId}</span>`;
        } else {
          const b = BUILDINGS.find(b => b.id === bId);
          html += `<span style="display:inline-block;background:var(--bg-card);padding:2px 6px;border-radius:3px;margin:2px;font-size:11px">${b ? b.name : bId}</span>`;
        }
      }
      html += '</div>';
    }

    // Available builds
    html += '<div style="margin-top:10px"><b>Build Options</b></div>';
    html += '<div class="build-options">';

    // Buildings
    const availBuildings = Game.getAvailableBuildings(city);
    for (const b of availBuildings) {
      const turns = Math.max(1, Math.ceil(b.cost / Math.max(1, yields.prod)));
      html += `<div class="build-option" onclick="buildInCity(${city.id},'building','${b.id}')">
        <span>🏛 ${b.name}</span>
        <span style="color:var(--text-dim)">${turns}t | ${b.desc}</span>
      </div>`;
    }

    // Wonders
    const availWonders = Game.getAvailableWonders(city);
    for (const w of availWonders) {
      const turns = Math.max(1, Math.ceil(w.cost / Math.max(1, yields.prod)));
      html += `<div class="build-option" onclick="buildInCity(${city.id},'wonder','${w.id}')" style="border-color:var(--gold)">
        <span>⭐ ${w.name}</span>
        <span style="color:var(--gold)">${turns}t</span>
      </div>`;
    }

    // Units
    const availUnits = Game.getAvailableUnits(city);
    for (const u of availUnits) {
      const turns = Math.max(1, Math.ceil(u.cost / Math.max(1, yields.prod)));
      const icon = u.str > 0 ? '⚔' : (u.type === 'settler' ? '🏘' : '🔨');
      html += `<div class="build-option" onclick="buildInCity(${city.id},'unit','${u.id}')">
        <span>${icon} ${u.name}</span>
        <span style="color:var(--text-dim)">${turns}t | ${u.str > 0 ? 'Str '+u.str : u.type}</span>
      </div>`;
    }

    html += '</div>';

    document.getElementById('city-detail').innerHTML = html;
  },

  closeCityPanel() {
    document.getElementById('city-panel').classList.add('hidden');
    Game.selectedCity = null;
  },

  // ========== TECH TREE ==========

  showTechTree() {
    const panel = document.getElementById('tech-panel');
    panel.classList.remove('hidden');
    this.renderTechTree();
  },

  closeTechTree() {
    document.getElementById('tech-panel').classList.add('hidden');
  },

  renderTechTree() {
    const p = Game.state.players[0];
    const available = Game.getAvailableTechs(p);
    const availIds = new Set(available.map(t => t.id));

    let html = '';
    for (const era of ERAS) {
      const eraTechs = TECHS.filter(t => t.era === era);
      if (eraTechs.length === 0) continue;

      html += `<div class="tech-era">
        <h4>${ERA_ICONS[era]} ${ERA_NAMES[era]}</h4>
        <div class="tech-grid">`;

      for (const tech of eraTechs) {
        let cls = 'locked';
        if (p.techs.has(tech.id)) cls = 'researched';
        else if (p.currentResearch === tech.id) cls = 'current';
        else if (availIds.has(tech.id)) cls = 'available';

        const turns = p.currentResearch === tech.id
          ? Math.max(1, Math.ceil((tech.cost - p.researchProgress) / Math.max(1, this.getPlayerScience())))
          : '';

        html += `<div class="tech-item ${cls}" ${cls === 'available' ? `onclick="selectTech('${tech.id}')"` : ''}>
          <div class="tech-name">${tech.name}</div>
          <div class="tech-cost">${cls === 'current' ? `Researching... ${turns}t` : `🔬 ${tech.cost}`}</div>
        </div>`;
      }

      html += '</div></div>';
    }

    // Show current research
    if (p.currentResearch) {
      const tech = TECHS.find(t => t.id === p.currentResearch);
      const pct = Math.floor((p.researchProgress / tech.cost) * 100);
      html = `<div style="margin-bottom:12px;padding:8px;background:var(--bg-dark);border-radius:6px">
        <b>Researching:</b> ${tech.name} (${pct}%)
        <div class="progress-bar" style="margin-top:4px;width:100%;height:8px;background:var(--border);border-radius:4px">
          <div style="height:100%;width:${pct}%;background:var(--accent2);border-radius:4px"></div>
        </div>
      </div>` + html;
    } else {
      html = `<div style="margin-bottom:12px;padding:8px;background:var(--bg-dark);border-radius:6px;color:var(--gold)">
        <b>Select a technology to research</b>
      </div>` + html;
    }

    document.getElementById('tech-tree-content').innerHTML = html;
  },

  getPlayerScience() {
    const p = Game.state.players[0];
    let sci = 0;
    for (const city of p.cities) {
      sci += Game.getCityYields(city).sci;
    }
    return sci;
  },

  // ========== NOTIFICATIONS ==========

  notify(msg) {
    const container = document.getElementById('notifications');
    const el = document.createElement('div');
    el.className = 'notification';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  },

  showVictory(msg) {
    const container = document.getElementById('notifications');
    const el = document.createElement('div');
    el.className = 'notification';
    el.style.background = 'var(--gold)';
    el.style.color = '#000';
    el.style.fontWeight = 'bold';
    el.style.fontSize = '18px';
    el.style.padding = '20px 40px';
    el.textContent = msg;
    container.appendChild(el);
  }
};
