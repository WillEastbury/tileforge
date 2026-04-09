// Apollo's Time — UI Manager
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
    const screen = document.getElementById('save-load-screen');
    screen.classList.add('active', 'overlay-mode');
    document.getElementById('save-load-title').textContent = 'Save Game';
    this.renderSaveSlots('save');
    this._saveOverlay = true;
  },

  showLoadGameInGame() {
    const screen = document.getElementById('save-load-screen');
    screen.classList.add('active', 'overlay-mode');
    document.getElementById('save-load-title').textContent = 'Load Game';
    this.renderSaveSlots('load');
    this._saveOverlay = true;
    this.closeMenu();
  },

  closeSaveOverlay() {
    const screen = document.getElementById('save-load-screen');
    screen.classList.remove('active', 'overlay-mode');
    this._saveOverlay = false;
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
            <div class="slot-detail">${save.year || ('Turn ' + save.turn)} | ${save.era} Era | ${save.date}</div>
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

    // Calculate totals and per-city breakdowns
    let food = 0, prod = 0, gold = 0, sci = 0, cul = 0, hist = 0;
    const cityBreakdowns = [];
    for (const city of p.cities) {
      const y = Game.getCityYields(city);
      food += y.food;
      prod += y.prod;
      gold += y.gold;
      sci += y.sci;
      cul += y.cul;
      cityBreakdowns.push({ name: city.name, food: y.food, prod: y.prod, gold: y.gold, sci: y.sci, cul: y.cul });
    }

    // Unit maintenance (military units with str > 0)
    const unitMaint = p.units.filter(u => {
      const ut = Game.getUnitType(u);
      return ut.str > 0;
    }).length;

    document.querySelector('#res-food b').textContent = food;
    document.querySelector('#res-prod b').textContent = prod;
    document.querySelector('#res-money b').textContent = Math.floor(p.gold);
    document.querySelector('#res-science b').textContent = sci;
    document.querySelector('#res-culture b').textContent = cul;
    document.querySelector('#res-history b').textContent = Math.floor(p.totalHistory);

    document.getElementById('turn-display').textContent = Game.getYearString() + ' (Turn ' + Game.state.turn + ')';

    // Golden Age indicator
    let eraText = ERA_ICONS[p.era] + ' ' + ERA_NAMES[p.era] + ' Era';
    const eraEl = document.getElementById('era-display');
    if (Game.state.goldenAge && Game.state.goldenAge[0] && Game.state.goldenAge[0].turnsLeft > 0) {
      eraEl.innerHTML = eraText + ' <span class="golden-age-badge">🌟 Golden Age (' + Game.state.goldenAge[0].turnsLeft + ' turns)</span>';
    } else {
      eraEl.textContent = eraText;
    }

    // Government indicator
    const gov = GOVERNMENTS.find(g => g.id === (p.government || 'chiefdom'));
    if (gov) {
      const govBadge = p.anarchyTurns > 0
        ? ' <span style="color:var(--red);font-size:11px">⚠️ Anarchy (' + p.anarchyTurns + 't)</span>'
        : ' <span style="color:var(--purple);font-size:11px">🏛 ' + gov.name + '</span>';
      eraEl.innerHTML += govBadge;
    }

    // Resource tooltip hover handlers
    const tooltip = document.getElementById('resource-tooltip');
    const resMap = [
      { el: '#res-food',    icon: '🌾', label: 'Food',       key: 'food', total: food },
      { el: '#res-prod',    icon: '⚙️', label: 'Production', key: 'prod', total: prod },
      { el: '#res-money',   icon: '💰', label: 'Money',      key: 'gold', total: gold, isMoney: true },
      { el: '#res-science', icon: '🔬', label: 'Science',    key: 'sci',  total: sci },
      { el: '#res-culture', icon: '🎭', label: 'Culture',    key: 'cul',  total: cul },
    ];

    for (const r of resMap) {
      const span = document.querySelector(r.el);
      span.onmouseenter = (e) => {
        let lines = `<div class="rt-header">${r.icon} ${r.label}: <b>${r.isMoney ? Math.floor(p.gold) + ' treasury' : r.total + ' total'}</b></div>`;
        lines += '<div class="rt-sep"></div>';
        if (cityBreakdowns.length === 0) {
          lines += '<div class="rt-row"><span>No cities</span></div>';
        } else {
          for (const cb of cityBreakdowns) {
            lines += `<div class="rt-row"><span>${cb.name}</span><span>${cb[r.key]}</span></div>`;
          }
        }
        if (r.isMoney) {
          const netIncome = gold - unitMaint;
          lines += '<div class="rt-sep"></div>';
          lines += `<div class="rt-row"><span>Unit upkeep</span><span style="color:var(--red)">-${unitMaint}</span></div>`;
          lines += `<div class="rt-row rt-net"><span>Net income</span><span style="color:${netIncome >= 0 ? 'var(--green)' : 'var(--red)'}">${netIncome >= 0 ? '+' : ''}${netIncome}</span></div>`;
        }
        tooltip.innerHTML = lines;
        tooltip.classList.remove('hidden');
        const rect = span.getBoundingClientRect();
        tooltip.style.left = rect.left + 'px';
        tooltip.style.top = (rect.bottom + 6) + 'px';
      };
      span.onmouseleave = () => {
        tooltip.classList.add('hidden');
      };
    }

    // Update city jump dropdown
    const citySelect = document.getElementById('city-jump-select');
    if (citySelect) {
      const prev = citySelect.value;
      citySelect.innerHTML = '<option value="">🏛 Cities</option>';
      for (const city of p.cities) {
        const opt = document.createElement('option');
        opt.value = city.id;
        opt.textContent = `${city.name} (pop ${city.population})`;
        citySelect.appendChild(opt);
      }
      citySelect.value = prev;
    }
  },

  jumpToCity(cityId) {
    if (!cityId || !Game.state) return;
    const city = Game.findCityById(parseInt(cityId));
    if (!city) return;
    Renderer.centerOn(city.r, city.c);
    UI.showCityPanel(city);
    // Reset dropdown to placeholder
    const sel = document.getElementById('city-jump-select');
    if (sel) sel.value = '';
  },

  updateRightPanel() {
    const panel = document.getElementById('panel-content');

    if (Game.selectedUnit) {
      const unit = Game.selectedUnit;
      const uType = Game.getUnitType(unit);
      const p = Game.state.players[unit.owner];
      const promos = unit.owner === 0 ? Game.getAvailablePromotions(unit) : [];
      panel.innerHTML = `
        <div class="unit-card">
          <h4>${Renderer.getUnitIcon(uType)} ${uType.name} <span class="ency-ref" onclick="UI.showEncyclopedia('units','${uType.id}')" title="Book of Apollo">📖</span></h4>
          <div class="stats">
            <div>Owner: ${p.name}</div>
            <div>Era: ${ERA_NAMES[uType.era]}</div>
            ${uType.str ? `<div>Strength: ${uType.str}</div>` : ''}
            ${uType.rng ? `<div>Range: ${uType.rng}</div>` : ''}
            <div>Movement: ${unit.movementLeft}/${uType.mv}</div>
            <div>HP: ${unit.hp}/100</div>
            <div>XP: ${unit.xp}</div>
            ${unit.fortified ? '<div>🛡 Fortified</div>' : ''}
            ${unit.sleeping ? '<div>💤 Sleeping</div>' : ''}
            ${unit.buildingImprovement ? `<div>🔨 Building ${IMPROVEMENTS.find(i=>i.id===unit.buildingImprovement)?.name || unit.buildingImprovement} (${unit.buildProgress || 0}/${unit.buildTurnsNeeded})</div>` : ''}
            ${unit.outOfSupply ? '<div style="color:var(--red);font-weight:600">⚠️ Out of Supply (-25% str)</div>' : ''}
          </div>
          <div class="hp-bar">
            <div class="hp-fill" style="width:${unit.hp}%;background:${unit.hp > 50 ? '#4caf50' : unit.hp > 25 ? '#ff9800' : '#e94560'}"></div>
          </div>
          ${promos.length > 0 ? '<button class="btn-promote" onclick="UI.showPromotionPicker()">⭐ Promote</button>' : ''}
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

    if (tile.improvement) {
      const imp = IMPROVEMENTS.find(i => i.id === tile.improvement);
      if (imp) html += `<div style="margin-top:4px">${imp.icon} ${imp.name} (+${imp.yields.food}🌾 +${imp.yields.prod}⚙️ +${imp.yields.gold}💰)</div>`;
    }
    if (tile.road) {
      const roadLabel = tile.road === 'motorway' ? '🛣️ Motorway' : tile.road === 'railway' ? '🚂 Railway' : '🛤️ Road';
      html += `<div>${roadLabel}</div>`;
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

      // Build improvement (civilian units with canBuild)
      if (uType.canBuild) {
        const tile = Game.mapData[unit.r][unit.c];
        const terrain = TERRAINS[tile.terrain];
        const available = IMPROVEMENTS.filter(imp => {
          if (imp.id === 'road') {
            return !terrain.water && terrain.mv < 99 && !tile.road;
          }
          if (tile.improvement === imp.id) return false;
          if (imp.req && (!Game.state.players[unit.owner].techs || !Game.state.players[unit.owner].techs.has(imp.req))) return false;
          if (imp.terrains === 'any_land') return !terrain.water && terrain.mv < 99;
          return imp.terrains.includes(tile.terrain);
        });
        for (const imp of available) {
          const btn = document.createElement('button');
          btn.textContent = `${imp.icon} Build ${imp.name}`;
          btn.title = `${imp.turns} turns — ${imp.desc}`;
          btn.onclick = () => {
            Game.startBuildImprovement(unit, imp.id);
            unit.movementLeft = 0;
            Game.selectedUnit = null;
            Game.movementRange = null;
            Renderer.render();
            this.updateRightPanel();
            this.updateActionButtons();
          };
          bar.appendChild(btn);
        }
      }

      // Sleep (mark unit as sleeping — won't trigger idle notifications)
      const sleepBtn = document.createElement('button');
      sleepBtn.textContent = unit.sleeping ? '☀️ Wake' : '💤 Sleep';
      sleepBtn.onclick = () => {
        unit.sleeping = !unit.sleeping;
        if (unit.sleeping) unit.movementLeft = 0;
        Game.selectedUnit = null;
        Game.movementRange = null;
        Renderer.render();
        this.updateRightPanel();
        bar.innerHTML = '';
      };
      bar.appendChild(sleepBtn);

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
    this.closeTechTree();
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
      </div>`;

    // City specialization
    const spec = Game.getCitySpecialization(city);
    if (spec.id) {
      const bonusStr = Object.entries(spec.bonuses).map(([k, v]) => '+' + Math.round(v * 100) + '% ' + k.replace('Mod', '')).join(', ');
      html += `<div class="city-spec-badge" title="${bonusStr}">⚙️ ${spec.name} (${spec.tier})</div>`;
    }

    html += `
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
          <small style="color:var(--text-dim)">${city.buildQueue.progress}/${city.buildQueue.cost} ⚙️${pct > 0 ? ' — switching loses 50% progress' : ''}</small>
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
          html += `<span onclick="UI.showEncyclopedia('wonders','${bId.replace('wonder_','')}')" style="display:inline-block;background:var(--bg-card);padding:2px 6px;border-radius:3px;margin:2px;font-size:11px;border:1px solid var(--gold);color:var(--gold);cursor:pointer">${w ? w.name : bId}</span>`;
        } else {
          const b = BUILDINGS.find(b => b.id === bId);
          html += `<span onclick="UI.showEncyclopedia('buildings','${bId}')" style="display:inline-block;background:var(--bg-card);padding:2px 6px;border-radius:3px;margin:2px;font-size:11px;cursor:pointer">${b ? b.name : bId}</span>`;
        }
      }
      html += '</div>';
    }

    // Trade routes
    const p = Game.state.players[0];
    const tradeRoutes = (p.tradeRoutes || []).filter(r => r.fromCityId === city.id);
    const maxRoutes = Game.getMaxTradeRoutes(p);
    html += '<div style="margin:8px 0"><b>Trade Routes</b> (' + tradeRoutes.length + '/' + maxRoutes + ')';
    if (tradeRoutes.length > 0) {
      for (const route of tradeRoutes) {
        const toCity = Game.findCityById(route.toCityId);
        if (toCity) {
          const income = Game.getTradeRouteIncome(city, toCity);
          html += `<div class="trade-route-item">📦 → ${toCity.name} <span style="color:var(--gold)">+${income.gold}💰 +${income.sci}🔬</span></div>`;
        }
      }
    }
    if (p.tradeRoutes.length < maxRoutes) {
      const otherCities = p.cities.filter(c => c.id !== city.id && !tradeRoutes.some(r => r.toCityId === c.id));
      if (otherCities.length > 0) {
        html += '<select class="trade-route-select" onchange="UI.establishTradeFromCity(' + city.id + ', this.value)">';
        html += '<option value="">+ Establish Trade Route...</option>';
        for (const oc of otherCities) {
          const income = Game.getTradeRouteIncome(city, oc);
          html += `<option value="${oc.id}">${oc.name} (+${income.gold}💰 +${income.sci}🔬)</option>`;
        }
        html += '</select>';
      }
    }
    html += '</div>';

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

    // National Buildings
    const availNational = Game.getAvailableNationalBuildings(city);
    for (const nb of availNational) {
      const turns = Math.max(1, Math.ceil(nb.cost / Math.max(1, yields.prod)));
      html += `<div class="build-option" onclick="buildInCity(${city.id},'national','${nb.id}')" style="border-color:var(--culture)">
        <span>🏛️ ${nb.name}</span>
        <span style="color:var(--culture)">${turns}t | ${nb.desc}</span>
      </div>`;
    }

    html += '</div>';

    // Artifacts collection display
    if (p.artifacts && p.artifacts.length > 0) {
      html += '<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:6px">';
      html += '<b>📜 Artifacts (' + p.artifacts.length + '/' + ARTIFACTS.length + ')</b>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">';
      for (const aId of p.artifacts) {
        const a = ARTIFACTS.find(ar => ar.id === aId);
        if (!a) continue;
        const bonusStr = Object.entries(a.bonus).map(([k,v]) => '+' + v + ' ' + k).join(', ');
        html += `<span class="artifact-badge" title="${a.desc}\n${bonusStr}">${a.name}</span>`;
      }
      html += '</div></div>';
    }

    document.getElementById('city-detail').innerHTML = html;
  },

  closeCityPanel() {
    document.getElementById('city-panel').classList.add('hidden');
    Game.selectedCity = null;
  },

  // ========== TECH TREE ==========

  showTechTree() {
    this.closeCityPanel();
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

        html += `<div class="tech-item ${cls}">
          <div class="tech-name">${tech.name}</div>
          <div class="tech-cost">${cls === 'current' ? `Researching... ${turns}t` : `🔬 ${tech.cost}`}</div>
          <div class="tech-buttons">
            ${cls === 'available' ? `<button class="tech-btn-research" onclick="event.stopPropagation();selectTech('${tech.id}')">Research</button>` : ''}
            ${cls === 'current' ? `<button class="tech-btn-cancel" onclick="event.stopPropagation();cancelResearch()">Cancel</button>` : ''}
            <button class="tech-btn-ency" onclick="event.stopPropagation();UI.showEncyclopedia('technologies','${tech.id}')" title="Book of Apollo">📖</button>
          </div>
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

  getPlayerCulture() {
    const p = Game.state.players[0];
    let cul = 0;
    for (const city of p.cities) {
      cul += Game.getCityYields(city).cul;
    }
    return cul;
  },

  // ========== CIVICS & GOVERNMENT ==========

  showCivicsTree() {
    this.closeCityPanel();
    const panel = document.getElementById('civics-panel');
    panel.classList.remove('hidden');
    this.renderCivicsTree();
  },

  closeCivicsTree() {
    document.getElementById('civics-panel').classList.add('hidden');
  },

  renderCivicsTree() {
    const p = Game.state.players[0];
    const available = Game.getAvailableCivics(p);
    const availIds = new Set(available.map(c => c.id));

    // Government section
    let govHtml = '<div class="gov-section">';
    const currentGov = GOVERNMENTS.find(g => g.id === (p.government || 'chiefdom'));
    if (p.anarchyTurns > 0) {
      govHtml += `<div class="gov-current gov-anarchy">⚠️ <b>ANARCHY</b> — ${p.anarchyTurns} turn${p.anarchyTurns > 1 ? 's' : ''} remaining. All yields halved.</div>`;
    } else {
      govHtml += `<div class="gov-current">Current: <b>${currentGov ? currentGov.name : 'Chiefdom'}</b> ${currentGov ? '— ' + currentGov.desc : ''}</div>`;
    }

    const availGovs = Game.getAvailableGovernments(p);
    if (availGovs.length > 0) {
      govHtml += '<div class="gov-grid">';
      for (const gov of availGovs) {
        govHtml += `<div class="gov-card">
          <div class="gov-name">${gov.name}</div>
          <div class="gov-era">${ERA_ICONS[gov.era]} ${ERA_NAMES[gov.era]}</div>
          <div class="gov-desc">${gov.desc}</div>
          <button class="civic-btn-adopt" onclick="event.stopPropagation();adoptGovernment('${gov.id}')">Adopt</button>
        </div>`;
      }
      govHtml += '</div>';
    }
    govHtml += '</div>';
    document.getElementById('civics-gov-content').innerHTML = govHtml;

    // Civics tree section
    let html = '';

    // Current civic progress
    if (p.currentCivic) {
      const civic = CIVICS.find(c => c.id === p.currentCivic);
      const pct = Math.floor((p.civicProgress / civic.cost) * 100);
      const turns = Math.max(1, Math.ceil((civic.cost - p.civicProgress) / Math.max(1, this.getPlayerCulture())));
      html += `<div style="margin-bottom:12px;padding:8px;background:var(--bg-dark);border-radius:6px">
        <b>Developing:</b> ${civic.name} (${pct}% — ${turns}t)
        <div class="progress-bar" style="margin-top:4px;width:100%;height:8px;background:var(--border);border-radius:4px">
          <div style="height:100%;width:${pct}%;background:var(--purple);border-radius:4px"></div>
        </div>
      </div>`;
    } else {
      html += `<div style="margin-bottom:12px;padding:8px;background:var(--bg-dark);border-radius:6px;color:var(--gold)">
        <b>Select a civic to develop</b>
      </div>`;
    }

    for (const era of ERAS) {
      const eraCivics = CIVICS.filter(c => c.era === era);
      if (eraCivics.length === 0) continue;

      html += `<div class="civic-era">
        <h4>${ERA_ICONS[era]} ${ERA_NAMES[era]}</h4>
        <div class="civic-grid">`;

      for (const civic of eraCivics) {
        let cls = 'locked';
        if (p.civics.has(civic.id)) cls = 'researched';
        else if (p.currentCivic === civic.id) cls = 'current';
        else if (availIds.has(civic.id)) cls = 'available';

        const turns = p.currentCivic === civic.id
          ? Math.max(1, Math.ceil((civic.cost - p.civicProgress) / Math.max(1, this.getPlayerCulture())))
          : '';

        // Show what governments this civic unlocks
        const unlockedGovs = GOVERNMENTS.filter(g => g.unlockedBy === civic.id);
        const govBadge = unlockedGovs.length > 0
          ? `<div class="civic-unlocks">🏛 ${unlockedGovs.map(g => g.name).join(', ')}</div>`
          : '';

        html += `<div class="civic-item ${cls}">
          <div class="civic-name">${civic.name}</div>
          <div class="civic-cost">${cls === 'current' ? `Developing... ${turns}t` : `🎭 ${civic.cost}`}</div>
          ${govBadge}
          <div class="civic-buttons">
            ${cls === 'available' ? `<button class="civic-btn-research" onclick="event.stopPropagation();selectCivic('${civic.id}')">Develop</button>` : ''}
            ${cls === 'current' ? `<button class="civic-btn-cancel" onclick="event.stopPropagation();cancelCivic()">Cancel</button>` : ''}
          </div>
        </div>`;
      }

      html += '</div></div>';
    }

    document.getElementById('civics-tree-content').innerHTML = html;
  },

  // ========== ENCYCLOPEDIA ==========

  encyclopediaCategory: 'units',
  encyclopediaItem: null,

  showEncyclopedia(category, itemId) {
    document.getElementById('encyclopedia-panel').classList.remove('hidden');
    this.encyclopediaCategory = category || 'units';
    this.renderEncyclopediaSidebar();
    this.renderEncyclopediaList(this.encyclopediaCategory);
    if (itemId) {
      this.showEncyclopediaDetail(this.encyclopediaCategory, itemId);
    } else {
      this.showFirstItem(this.encyclopediaCategory);
    }
  },

  closeEncyclopedia() {
    document.getElementById('encyclopedia-panel').classList.add('hidden');
  },

  renderEncyclopediaSidebar() {
    const sidebar = document.getElementById('ency-sidebar');
    const categories = [
      {id:'terrain', label:'🌍 Terrain'},
      {id:'resources', label:'💎 Resources'},
      {id:'composites', label:'🔧 Composites'},
      {id:'techs', label:'🔬 Technologies'},
      {id:'buildings', label:'🏛 Buildings'},
      {id:'wonders', label:'⭐ Wonders'},
      {id:'units', label:'⚔️ Units'},
      {id:'concepts', label:'📘 Concepts'}
    ];
    sidebar.innerHTML = categories.map(c =>
      `<button class="${c.id === this.encyclopediaCategory ? 'active' : ''}" onclick="UI.selectEncyCategory('${c.id}')">${c.label}</button>`
    ).join('');
  },

  selectEncyCategory(category) {
    this.encyclopediaCategory = category;
    this.renderEncyclopediaSidebar();
    this.renderEncyclopediaList(category);
    this.showFirstItem(category);
  },

  showFirstItem(category) {
    const items = this.getEncyItems(category);
    if (items.length > 0) {
      this.showEncyclopediaDetail(category, items[0].id);
    } else {
      document.getElementById('ency-detail').innerHTML = '<p style="color:#888">Select an item</p>';
    }
  },

  getEncyItems(category) {
    switch (category) {
      case 'terrain': return TERRAINS.map(t => ({id: t.id, name: t.name, sub: t.zone, icon: t.emoji}));
      case 'resources': return RESOURCES.map(r => ({id: r.id, name: r.name, sub: r.type, icon: ''}));
      case 'composites': return COMPOSITES.map(c => ({id: c.id, name: c.name, sub: ERA_NAMES[c.era], icon: ''}));
      case 'techs': return TECHS.map(t => ({id: t.id, name: t.name, sub: ERA_NAMES[t.era], icon: ''}));
      case 'buildings': return BUILDINGS.map(b => ({id: b.id, name: b.name, sub: ERA_NAMES[b.era], icon: ''}));
      case 'wonders': return WONDERS.map(w => ({id: w.id, name: w.name, sub: ERA_NAMES[w.era], icon: ''}));
      case 'units': return UNIT_TYPES.map(u => ({id: u.id, name: u.name, sub: ERA_NAMES[u.era], icon: ''}));
      case 'concepts': return [
        {id:'eras', name:'Eras', sub:'Game Mechanics', icon:'📅'},
        {id:'city_tiers', name:'City Tiers', sub:'Game Mechanics', icon:'🏘️'},
        {id:'combat', name:'Combat', sub:'Game Mechanics', icon:'⚔️'},
        {id:'happiness', name:'Happiness', sub:'Game Mechanics', icon:'😊'},
        {id:'victory', name:'Victory Conditions', sub:'Game Mechanics', icon:'🏆'},
        {id:'difficulty', name:'Difficulty Levels', sub:'Game Mechanics', icon:'🎚️'},
        {id:'fog_of_war', name:'Fog of War', sub:'Game Mechanics', icon:'🌫️'},
        {id:'legacy', name:'Legacy & History', sub:'Game Mechanics', icon:'📜'}
      ];
      default: return [];
    }
  },

  renderEncyclopediaList(category) {
    const list = document.getElementById('ency-list');
    const items = this.getEncyItems(category);
    list.innerHTML = items.map(item =>
      `<div class="ency-item" id="ency-item-${item.id}" onclick="UI.showEncyclopediaDetail('${category}','${item.id}')">${item.icon ? item.icon + ' ' : ''}${item.name}<br><small style="color:#888">${item.sub}</small></div>`
    ).join('');
  },

  showEncyclopediaDetail(category, id) {
    this.encyclopediaItem = id;
    // Highlight active item
    document.querySelectorAll('#ency-list .ency-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.getElementById('ency-item-' + id);
    if (activeEl) { activeEl.classList.add('active'); activeEl.scrollIntoView({block:'nearest'}); }

    const detail = document.getElementById('ency-detail');
    switch (category) {
      case 'terrain': detail.innerHTML = this.renderTerrainDetail(id); break;
      case 'resources': detail.innerHTML = this.renderResourceDetail(id); break;
      case 'composites': detail.innerHTML = this.renderCompositeDetail(id); break;
      case 'techs': detail.innerHTML = this.renderTechDetail(id); break;
      case 'buildings': detail.innerHTML = this.renderBuildingDetail(id); break;
      case 'wonders': detail.innerHTML = this.renderWonderDetail(id); break;
      case 'units': detail.innerHTML = this.renderUnitDetail(id); break;
      case 'concepts': detail.innerHTML = this.renderConceptDetail(id); break;
      default: detail.innerHTML = '';
    }
  },

  encyLink(category, id, label) {
    return `<span class="ency-link" onclick="UI.showEncyclopedia('${category}','${id}')">${label}</span>`;
  },

  statBox(label, value) {
    return `<div class="stat-box"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;
  },

  renderTerrainDetail(id) {
    const t = TERRAINS.find(x => x.id === id || x.id === +id);
    if (!t) return '';
    const resources = RESOURCES.filter(r => r.terrains && r.terrains.includes(t.id));
    let html = `<h2>${t.emoji} ${t.name}</h2>`;
    html += `<span class="badge badge-era">${t.zone}</span>`;
    if (t.water) html += ` <span class="badge badge-domain">Water</span>`;
    if (t.mv >= 99) html += ` <span class="badge badge-type">Impassable</span>`;
    if (t.desc) html += `<div class="flavor">${t.desc}</div>`;
    html += `<div class="section-title">Statistics</div>`;
    html += `<div class="stat-grid">`;
    html += this.statBox('Movement Cost', t.mv >= 99 ? '∞' : t.mv);
    html += this.statBox('🌾 Food', t.food);
    html += this.statBox('⚙️ Production', t.prod);
    html += this.statBox('💰 Gold', t.gold);
    html += this.statBox('🛡️ Defense', (t.def >= 0 ? '+' : '') + t.def + '%');
    html += `</div>`;
    if (resources.length > 0) {
      html += `<div class="section-title">Resources Found Here</div>`;
      html += resources.map(r => this.encyLink('resources', r.id, r.name)).join(', ');
    }
    return html;
  },

  renderResourceDetail(id) {
    const r = RESOURCES.find(x => x.id === id);
    if (!r) return '';
    const terrainNames = (r.terrains || []).map(tid => {
      const t = TERRAINS.find(x => x.id === tid);
      return t ? this.encyLink('terrain', t.id, t.emoji + ' ' + t.name) : '';
    });
    let html = `<h2>${r.name}</h2>`;
    html += `<span class="badge badge-type">${r.type}</span>`;
    if (r.revealTech) {
      const tech = TECHS.find(t => t.id === r.revealTech);
      html += ` <span class="badge badge-era">Revealed by: ${tech ? tech.name : r.revealTech}</span>`;
    }
    if (r.desc) html += `<div class="flavor">${r.desc}</div>`;
    html += `<div class="section-title">Yields</div>`;
    html += `<div class="stat-grid">`;
    if (r.food) html += this.statBox('🌾 Food', '+' + r.food);
    if (r.prod) html += this.statBox('⚙️ Production', '+' + r.prod);
    if (r.gold) html += this.statBox('💰 Gold', '+' + r.gold);
    if (r.sci) html += this.statBox('🔬 Science', '+' + r.sci);
    if (r.cul) html += this.statBox('🎭 Culture', '+' + r.cul);
    html += `</div>`;
    if (terrainNames.length > 0) {
      html += `<div class="section-title">Found On</div>`;
      html += terrainNames.join(', ');
    }
    if (r.revealTech) {
      html += `<div class="section-title">Reveal Technology</div>`;
      const tech = TECHS.find(t => t.id === r.revealTech);
      html += tech ? this.encyLink('techs', tech.id, '🔬 ' + tech.name) : r.revealTech;
    }
    return html;
  },

  renderCompositeDetail(id) {
    const c = COMPOSITES.find(x => x.id === id);
    if (!c) return '';
    let html = `<h2>🔧 ${c.name}</h2>`;
    html += `<span class="badge badge-era">${ERA_NAMES[c.era]}</span>`;
    html += `<div class="section-title">Recipe</div>`;
    html += `<div class="stat-grid">`;
    for (const ing of c.ingredients) {
      const res = RESOURCES.find(r => r.id === ing);
      const comp = COMPOSITES.find(x => x.id === ing);
      const name = res ? res.name : (comp ? comp.name : ing);
      const cat = res ? 'resources' : 'composites';
      html += `<div class="stat-box"><div class="stat-label">Ingredient</div><div class="stat-value">${this.encyLink(cat, ing, name)}</div></div>`;
    }
    html += `</div>`;
    html += `<div class="section-title">Unlocking Tech</div>`;
    const tech = TECHS.find(t => t.id === c.tech);
    html += tech ? this.encyLink('techs', tech.id, '🔬 ' + tech.name) : c.tech;
    html += `<div class="section-title">Effects</div>`;
    html += `<p style="color:#8f8">${c.desc}</p>`;
    return html;
  },

  renderTechDetail(id) {
    const t = TECHS.find(x => x.id === id);
    if (!t) return '';
    let html = `<h2>🔬 ${t.name}</h2>`;
    html += `<span class="badge badge-era">${ERA_ICONS[t.era]} ${ERA_NAMES[t.era]}</span>`;
    if (t.desc) html += `<div class="flavor">${t.desc}</div>`;
    html += `<div class="section-title">Statistics</div>`;
    html += `<div class="stat-grid">`;
    html += this.statBox('🔬 Research Cost', t.cost);
    html += this.statBox('Era', ERA_NAMES[t.era]);
    html += `</div>`;
    if (t.prereqs && t.prereqs.length > 0) {
      html += `<div class="section-title">Prerequisites</div>`;
      html += t.prereqs.map(pid => {
        const pt = TECHS.find(x => x.id === pid);
        return pt ? this.encyLink('techs', pt.id, '🔬 ' + pt.name) : pid;
      }).join(', ');
    }
    // What it unlocks
    const unlockedBuildings = BUILDINGS.filter(b => b.req === t.id);
    const unlockedWonders = WONDERS.filter(w => w.req === t.id);
    const unlockedUnits = UNIT_TYPES.filter(u => u.req === t.id);
    const revealedRes = RESOURCES.filter(r => r.revealTech === t.id);
    if (unlockedBuildings.length || unlockedWonders.length || unlockedUnits.length || revealedRes.length) {
      html += `<div class="section-title">Unlocks</div><ul class="effects-list">`;
      for (const b of unlockedBuildings) html += `<li>🏛 ${this.encyLink('buildings', b.id, b.name)}</li>`;
      for (const w of unlockedWonders) html += `<li>⭐ ${this.encyLink('wonders', w.id, w.name)}</li>`;
      for (const u of unlockedUnits) html += `<li>⚔️ ${this.encyLink('units', u.id, u.name)}</li>`;
      for (const r of revealedRes) html += `<li>💎 Reveals ${this.encyLink('resources', r.id, r.name)}</li>`;
      html += `</ul>`;
    }
    return html;
  },

  renderBuildingDetail(id) {
    const b = BUILDINGS.find(x => x.id === id);
    if (!b) return '';
    let html = `<h2>🏛 ${b.name}</h2>`;
    html += `<span class="badge badge-era">${ERA_ICONS[b.era]} ${ERA_NAMES[b.era]}</span>`;
    if (b.flavor) html += `<div class="flavor">${b.flavor}</div>`;
    html += `<div class="section-title">Statistics</div>`;
    html += `<div class="stat-grid">`;
    html += this.statBox('⚙️ Cost', b.cost);
    const tech = TECHS.find(t => t.id === b.req);
    html += this.statBox('🔬 Requires', tech ? tech.name : b.req);
    html += `</div>`;
    // Yields
    const yields = [];
    if (b.food) yields.push('🌾 +' + b.food + ' Food');
    if (b.prod) yields.push('⚙️ +' + b.prod + ' Prod');
    if (b.gold) yields.push('💰 +' + b.gold + ' Gold');
    if (b.sci) yields.push('🔬 +' + b.sci + ' Science');
    if (b.cul) yields.push('🎭 +' + b.cul + ' Culture');
    if (b.hap) yields.push('😊 ' + (b.hap > 0 ? '+' : '') + b.hap + ' Happy');
    if (yields.length > 0) {
      html += `<div class="section-title">Yields</div><div class="stat-grid">`;
      for (const y of yields) html += `<div class="stat-box"><div class="stat-value">${y}</div></div>`;
      html += `</div>`;
    }
    // Special effects
    const effects = [];
    if (b.growthMod) effects.push(`+${Math.round(b.growthMod*100)}% city growth rate`);
    if (b.goldMod) effects.push(`+${Math.round(b.goldMod*100)}% gold income`);
    if (b.sciMod) effects.push(`+${Math.round(b.sciMod*100)}% science output`);
    if (b.prodMod) effects.push(`+${Math.round(b.prodMod*100)}% production output`);
    if (b.culMod) effects.push(`+${Math.round(b.culMod*100)}% culture output`);
    if (b.histMod) effects.push(`+${Math.round(b.histMod*100)}% history generation`);
    if (b.allMod) effects.push(`+${Math.round(b.allMod*100)}% all yields`);
    if (b.defense) effects.push(`+${b.defense}% city defense strength`);
    if (b.xpBonus) effects.push(`+${b.xpBonus} XP for new units`);
    if (b.unitProdMod) effects.push(`+${Math.round(b.unitProdMod*100)}% unit production speed`);
    if (b.needsCoast) effects.push('Requires coastal city');
    if (b.cityRanged) effects.push('City gains ranged attack');
    if (b.airSlots) effects.push(`Bases ${b.airSlots} air units`);
    if (b.antiAir) effects.push('Intercepts enemy aircraft (75%)');
    if (effects.length > 0) {
      html += `<div class="section-title">Special Effects</div><ul class="effects-list">`;
      for (const e of effects) html += `<li>${e}</li>`;
      html += `</ul>`;
    }
    if (tech) {
      html += `<div class="section-title">Required Technology</div>`;
      html += this.encyLink('techs', tech.id, '🔬 ' + tech.name);
    }
    return html;
  },

  renderWonderDetail(id) {
    const w = WONDERS.find(x => x.id === id);
    if (!w) return '';
    let html = `<h2>⭐ ${w.name}</h2>`;
    html += `<span class="badge badge-era">${ERA_ICONS[w.era]} ${ERA_NAMES[w.era]}</span>`;
    if (w.flavor) html += `<div class="flavor">${w.flavor}</div>`;
    html += `<div class="section-title">Statistics</div>`;
    html += `<div class="stat-grid">`;
    html += this.statBox('⚙️ Cost', w.cost);
    const tech = TECHS.find(t => t.id === w.req);
    html += this.statBox('🔬 Requires', tech ? tech.name : w.req);
    html += `</div>`;
    // Effects
    const effects = [];
    if (w.empFood) effects.push(`+${w.empFood} Food in all cities`);
    if (w.empProd) effects.push(`+${w.empProd} Production in all cities`);
    if (w.empGold) effects.push(`+${w.empGold} Gold in all cities`);
    if (w.empScience) effects.push(`+${w.empScience} Science in all cities`);
    if (w.empCulture) effects.push(`+${w.empCulture} Culture in all cities`);
    if (w.empHappy) effects.push(`+${w.empHappy} Happiness empire-wide`);
    if (w.empDef) effects.push(`+${w.empDef} Defense in all cities`);
    if (w.food) effects.push(`+${w.food} Food in this city`);
    if (w.cul) effects.push(`+${w.cul} Culture in this city`);
    if (w.sci) effects.push(`+${w.sci} Science in this city`);
    if (w.freeTech) effects.push('Grants 1 free technology');
    if (w.goldenAge) effects.push('Triggers a Golden Age');
    if (w.nukes) effects.push('Enables nuclear weapons');
    if (w.diplomatic) effects.push('Opens diplomatic victory path');
    if (w.revealMap) effects.push('Reveals entire map');
    if (w.sciBoost) effects.push('+100% Science for 20 turns');
    if (w.sciMod) effects.push(`+${Math.round(w.sciMod*100)}% Science output`);
    if (w.culMod) effects.push(`+${Math.round(w.culMod*100)}% Culture output`);
    if (w.allMod) effects.push(`+${Math.round(w.allMod*100)}% all yields`);
    if (w.histMod) effects.push(`+${Math.round(w.histMod*100)}% History generation`);
    if (w.techDiscount) effects.push(`-${Math.round(w.techDiscount*100)}% technology costs`);
    if (w.rushDiscount) effects.push(`-${Math.round(w.rushDiscount*100)}% rush buy costs`);
    if (w.shuttleDiscount) effects.push(`-${Math.round(w.shuttleDiscount*100)}% shuttle production cost`);
    if (w.needsCoast) effects.push('Requires coastal city');
    if (effects.length > 0) {
      html += `<div class="section-title">Effects</div><ul class="effects-list">`;
      for (const e of effects) html += `<li>${e}</li>`;
      html += `</ul>`;
    }
    html += `<div class="section-title">Game Effect Description</div><p>${w.desc}</p>`;
    if (tech) {
      html += `<div class="section-title">Required Technology</div>`;
      html += this.encyLink('techs', tech.id, '🔬 ' + tech.name);
    }
    return html;
  },

  getUnitUpgradeLine(unitId) {
    const typeMap = {};
    for (const u of UNIT_TYPES) {
      if (!typeMap[u.type]) typeMap[u.type] = [];
      typeMap[u.type].push(u);
    }
    const unit = UNIT_TYPES.find(u => u.id === unitId);
    if (!unit) return [];
    const line = typeMap[unit.type] || [];
    line.sort((a, b) => ERAS.indexOf(a.era) - ERAS.indexOf(b.era));
    return line;
  },

  renderUnitDetail(id) {
    const u = UNIT_TYPES.find(x => x.id === id);
    if (!u) return '';
    const domainIcons = {land:'🟤 Land', sea:'🔵 Naval', air:'✈️ Air'};
    let html = `<h2>${u.name}</h2>`;
    html += `<span class="badge badge-era">${ERA_ICONS[u.era]} ${ERA_NAMES[u.era]}</span> `;
    html += `<span class="badge badge-domain">${domainIcons[u.domain] || u.domain}</span> `;
    html += `<span class="badge badge-type">${u.type}</span>`;
    if (u.desc) html += `<div class="flavor">${u.desc}</div>`;
    html += `<div class="section-title">Statistics</div>`;
    html += `<div class="stat-grid">`;
    if (u.str) html += this.statBox('⚔️ Strength', u.str);
    if (u.rng) html += this.statBox('🏹 Range', u.rng);
    html += this.statBox('🚶 Movement', u.mv);
    html += this.statBox('💰 Cost', u.cost);
    html += `</div>`;
    // Requirements
    html += `<div class="section-title">Requirements</div>`;
    const tech = TECHS.find(t => t.id === u.req);
    html += `<p>Technology: ${tech ? this.encyLink('techs', tech.id, '🔬 ' + tech.name) : u.req}</p>`;
    if (u.resReq) {
      const res = RESOURCES.find(r => r.id === u.resReq);
      html += `<p>Resource: ${res ? this.encyLink('resources', res.id, '💎 ' + res.name) : u.resReq}</p>`;
    }
    // Special abilities
    const abilities = [];
    if (u.amphibious) abilities.push('Amphibious — no penalty attacking from sea');
    if (u.capacity) abilities.push(`Transport — can carry ${u.capacity} land unit(s)`);
    if (u.canBuild) abilities.push('Can build improvements');
    if (u.founds) abilities.push(`Founds a ${u.founds}`);
    if (u.popCost) abilities.push(`Costs ${u.popCost} population to produce`);
    if (u.airSlots) abilities.push(`Carries ${u.airSlots} air units`);
    if (abilities.length > 0) {
      html += `<div class="section-title">Special Abilities</div><ul class="effects-list">`;
      for (const a of abilities) html += `<li>${a}</li>`;
      html += `</ul>`;
    }
    // Upgrade line
    const line = this.getUnitUpgradeLine(u.id);
    if (line.length > 1) {
      html += `<div class="section-title">Upgrade Line (${u.type})</div>`;
      html += `<div class="upgrade-chain">`;
      for (let i = 0; i < line.length; i++) {
        const cls = line[i].id === u.id ? 'current' : '';
        html += `<span class="${cls}" style="cursor:pointer" onclick="UI.showEncyclopediaDetail('units','${line[i].id}')">${line[i].name}</span>`;
        if (i < line.length - 1) html += `<span style="color:#888">→</span>`;
      }
      html += `</div>`;
    }
    return html;
  },

  renderConceptDetail(id) {
    const concepts = {
      eras: `<h2>📅 Eras</h2>
        <div class="flavor">From the first spark of fire to the red sands of Mars, your civilization must traverse nine distinct ages of progress.</div>
        <div class="section-title">The Nine Eras</div>
        <div class="stat-grid">
          ${ERAS.map(e => `<div class="stat-box"><div class="stat-value">${ERA_ICONS[e]} ${ERA_NAMES[e]}</div></div>`).join('')}
        </div>
        <div class="section-title">How Eras Work</div>
        <p>Your civilization\'s era is determined by the technologies you\'ve researched. When you research a technology from a later era, you begin transitioning into that era. Your current era affects which buildings, units, and wonders you can build.</p>
        <p>Eras can overlap — you may still be building medieval units while researching renaissance technology. The key is that each era\'s content becomes available as you research its technologies.</p>
        <p>Later eras have more expensive technologies but unlock dramatically more powerful units and buildings. Rushing to a new era can give you a military advantage, but neglecting earlier techs may leave gaps in your economy.</p>`,

      city_tiers: `<h2>🏘️ City Tiers</h2>
        <div class="flavor">A small campfire grows into a hamlet, then a village, and eventually a sprawling metropolis. Your city\'s size determines its potential.</div>
        <div class="section-title">Tier Thresholds</div>
        <div class="stat-grid">
          ${CITY_TIERS.map(t => `<div class="stat-box">
            <div class="stat-label">${t.emoji} ${t.name}</div>
            <div class="stat-value">Pop ${t.pop}+</div>
            <div style="color:#888;font-size:11px">Radius: ${t.radius} | Slots: ${t.slots}</div>
          </div>`).join('')}
        </div>
        <div class="section-title">How Tiers Work</div>
        <p>As a city\'s population grows, it automatically upgrades to higher tiers. Each tier increases the city\'s territory radius (how many tiles it can work) and building slots (how many buildings it can hold).</p>
        <p>A Hamlet starts with just 3 building slots and a radius of 1 tile. A Metropolis at 35+ population commands 22 building slots and a 3-tile radius, making it an economic powerhouse.</p>
        <p>Plan your buildings carefully — slot-limited cities must prioritize the most impactful buildings for their role (production hub, science city, gold generator, etc.).</p>`,

      combat: `<h2>⚔️ Combat</h2>
        <div class="flavor">War is not simply about who has the bigger army — terrain, technology, and tactics all play crucial roles on the battlefield.</div>
        <div class="section-title">Damage Formula</div>
        <p>When two units fight, damage is calculated based on the <b>strength ratio</b> between attacker and defender. The base damage formula considers:</p>
        <ul class="effects-list">
          <li><b>Base Strength</b> — each unit\'s inherent combat strength stat</li>
          <li><b>HP Modifier</b> — wounded units deal less damage (proportional to remaining HP)</li>
          <li><b>Terrain Defense</b> — the defender gets a bonus from terrain (Hills +50%, Forest +25%, etc.)</li>
          <li><b>Fortification</b> — fortified units receive a defense bonus</li>
          <li><b>City Defense</b> — units in cities benefit from walls, castles, and other defensive buildings</li>
        </ul>
        <div class="section-title">Ranged Combat</div>
        <p>Ranged units can attack at a distance without taking counter-damage. However, they are typically fragile in melee — protect them with front-line units.</p>
        <div class="section-title">Unit Types</div>
        <ul class="effects-list">
          <li><b>Melee</b> — standard front-line fighters</li>
          <li><b>Ranged</b> — attacks from distance, weak in melee</li>
          <li><b>Mounted</b> — fast, strong, but vulnerable to anti-cavalry</li>
          <li><b>Anti-Cavalry</b> — bonus vs mounted units</li>
          <li><b>Siege</b> — powerful ranged, bonus vs cities</li>
          <li><b>Naval</b> — operates on water tiles</li>
          <li><b>Air</b> — operates from cities or carriers, high mobility</li>
          <li><b>Recon</b> — fast scouts with terrain bonuses</li>
        </ul>`,

      happiness: `<h2>😊 Happiness</h2>
        <div class="flavor">A content populace is a productive one. Let them grow miserable, and revolution follows.</div>
        <div class="section-title">What Affects Happiness</div>
        <ul class="effects-list">
          <li><b>Population</b> — each citizen consumes happiness; larger cities need more entertainment</li>
          <li><b>Buildings</b> — many buildings provide happiness (Tavern, Cathedral, Stadium, etc.)</li>
          <li><b>Wonders</b> — empire-wide happiness from wonders like Notre Dame (+10) or Taj Mahal (+10)</li>
          <li><b>Luxury Resources</b> — each unique luxury provides happiness to your empire</li>
          <li><b>War Weariness</b> — prolonged wars decrease happiness</li>
        </ul>
        <div class="section-title">Golden Ages</div>
        <p>When happiness is exceptionally high, your civilization enters a <b>Golden Age</b> — a period of dramatically increased yields across all cities. Golden Ages last several turns and provide bonus food, production, gold, and culture.</p>
        <div class="section-title">Revolts</div>
        <p>If happiness drops below zero, cities become unhappy. Severely unhappy cities may experience <b>revolts</b>, temporarily losing production and potentially spawning rebel units. Keep your people content!</p>`,

      victory: `<h2>🏆 Victory Conditions</h2>
        <div class="flavor">There are many paths to glory. Choose yours wisely, for each demands a different strategy.</div>
        <div class="section-title">The Six Paths to Victory</div>
        <ul class="effects-list">
          <li><b>🗡️ Domination</b> — capture all enemy capital cities. The classic military victory for warmongers.</li>
          <li><b>🔬 Science</b> — launch three Mars Shuttles. Requires the most advanced technologies and massive production. Build Launch Pads and reach the Mars Colony tech.</li>
          <li><b>🎭 Cultural</b> — accumulate enough culture to become the dominant civilization. Build theatres, museums, and wonders that generate culture.</li>
          <li><b>🤝 Diplomatic</b> — win through diplomatic influence. Requires the United Nations wonder. Build relationships and influence.</li>
          <li><b>📜 History</b> — achieve the highest history score. Legacy buildings, heritage centres, and historic wonders contribute. The long game.</li>
          <li><b>💰 Economic</b> — accumulate massive wealth and trade dominance. Markets, banks, stock exchanges — become the economic superpower.</li>
        </ul>
        <div class="section-title">Score Victory</div>
        <p>If no other victory is achieved by the end of the game, the civilization with the highest composite score wins. Score is based on population, technology, territory, wonders, and military strength, modified by difficulty level.</p>`,

      difficulty: `<h2>🎚️ Difficulty Levels</h2>
        <div class="flavor">From the gentle ooze of Amoeba to the merciless calculations of the Singularity AI — choose your challenge.</div>
        <div class="section-title">The Eight Levels</div>
        <div class="stat-grid">
          ${DIFFICULTY.map(d => `<div class="stat-box">
            <div class="stat-label">${d.emoji} ${d.name}</div>
            <div style="color:#ccc;font-size:12px;margin-top:4px">
              Player: ${Math.round(d.pRes*100)}% research, ${Math.round(d.pDev*100)}% dev<br>
              AI: ${Math.round(d.aiRes*100)}% research, ${Math.round(d.aiDev*100)}% dev<br>
              AI Combat: ${Math.round(d.aiCombat*100)}%<br>
              Score: ×${d.scoreMul}
              ${d.startBonus ? '<br>AI starts with extra units/techs' : ''}
            </div>
          </div>`).join('')}
        </div>
        <div class="section-title">How Difficulty Works</div>
        <p>Lower difficulties give the player bonuses to research and development speed while handicapping the AI. Higher difficulties do the opposite — the AI gets faster research, cheaper units, and starting bonuses like extra settlers, warriors, techs, and gold.</p>
        <p>Score multipliers reward playing on harder difficulties. A victory on Singularity AI is worth 4× the score of the same victory on Amoeba.</p>`,

      fog_of_war: `<h2>🌫️ Fog of War</h2>
        <div class="flavor">Beyond the edge of your scouts\' sight, the world is shrouded in mystery. What dangers — or opportunities — lurk in the unknown?</div>
        <div class="section-title">Visibility</div>
        <p>Each of your units and cities has a <b>sight radius</b> — the area of the map they can see. Tiles outside any unit or city\'s sight are hidden by the Fog of War.</p>
        <div class="section-title">Explored vs Unexplored</div>
        <ul class="effects-list">
          <li><b>Unexplored</b> — tiles you\'ve never seen appear completely black</li>
          <li><b>Explored (fogged)</b> — tiles you\'ve seen before but can\'t currently see show terrain but no unit/city updates</li>
          <li><b>Visible</b> — tiles currently in a unit or city\'s sight radius show everything in real-time</li>
        </ul>
        <p>Scout units are invaluable for exploring — they move fast and have extended sight range. Maintaining vision across your borders helps you spot incoming invasions.</p>`,

      legacy: `<h2>📜 Legacy Buildings & History</h2>
        <div class="flavor">Great civilizations are remembered not just for their armies, but for the stories they leave behind.</div>
        <div class="section-title">History Points</div>
        <p><b>History</b> (📜) is a resource that accumulates over time. It represents your civilization\'s cultural legacy and historical significance. History is generated by:</p>
        <ul class="effects-list">
          <li>Certain buildings (Burial Mound, Museum, Heritage Centre, Heritage Vault)</li>
          <li>Wonders (Ark of Civilization provides +100% History)</li>
          <li>Cultural achievements and territorial expansion</li>
        </ul>
        <div class="section-title">Legacy Buildings</div>
        <p>Some buildings have a <b>history modifier</b> (histMod) that multiplies your history generation in that city. Stacking these in a single "history city" can generate enormous amounts of legacy points.</p>
        <div class="section-title">History Victory</div>
        <p>Accumulating the most history points is one of the six victory conditions. It rewards long-term planning and cultural investment over military conquest.</p>`
    };
    return concepts[id] || '<p>Unknown concept</p>';
  },

  // ========== NOTIFICATIONS ==========

  notify(msg, onClick) {
    const container = document.getElementById('notifications');
    const el = document.createElement('div');
    el.className = 'notification';
    el.textContent = msg;
    if (onClick) {
      el.style.cursor = 'pointer';
      el.style.borderLeft = '3px solid var(--accent)';
      el.addEventListener('click', () => { el.remove(); onClick(); });
    }
    container.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  },

  checkIdleNotifications() {
    if (!Game.state) return;
    const p = Game.state.players[0];
    if (!p) return;

    // Idle cities (no build queue)
    for (const city of p.cities) {
      if (!city.buildQueue) {
        this.notify(`🏛 ${city.name} is idle — nothing in production!`, () => {
          Renderer.centerOn(city.r, city.c);
          this.showCityPanel(city);
        });
      }
    }

    // Idle civilian/settler units (not sleeping, not building)
    for (const unit of p.units) {
      const uType = Game.getUnitType(unit);
      if ((uType.type === 'civilian' || uType.type === 'settler') && !unit.hasActed && !unit.sleeping && !unit.buildingImprovement) {
        this.notify(`⚠️ Idle ${uType.name} at (${unit.r},${unit.c}) — put them to work!`, () => {
          Renderer.centerOn(unit.r, unit.c);
          Game.selectedUnit = unit;
          Game.movementRange = Game.getMovementRange(unit);
          Renderer.render();
          this.updateRightPanel();
        });
      }
    }
  },

  showVictory(msg, victoryType) {
    if (victoryType) this.showVictoryNarrative(victoryType);
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
  },

  // ========== PROMOTION PICKER ==========

  showPromotionPicker() {
    const unit = Game.selectedUnit;
    if (!unit) return;
    const promos = Game.getAvailablePromotions(unit);
    if (promos.length === 0) return;
    // Remove existing popup if any
    const existing = document.getElementById('promotion-popup');
    if (existing) existing.remove();

    let html = '<div class="panel-header"><h3>⭐ Choose Promotion</h3><button class="btn-close" onclick="document.getElementById(\'promotion-popup\').remove()">&times;</button></div>';
    for (const p of promos) {
      html += `<div class="promo-option" onclick="UI.pickPromotion('${p.id}')">
        <b>${p.name}</b><br><span style="color:var(--text-dim);font-size:12px">${p.desc}</span>
      </div>`;
    }

    const popup = document.createElement('div');
    popup.id = 'promotion-popup';
    popup.className = 'overlay-panel';
    popup.innerHTML = html;
    document.getElementById('game-screen').appendChild(popup);
  },

  pickPromotion(promoId) {
    const unit = Game.selectedUnit;
    if (!unit) return;
    Game.applyPromotion(unit, promoId);
    const popup = document.getElementById('promotion-popup');
    if (popup) popup.remove();
    this.updateRightPanel();
    this.updateActionButtons();
  },

  // ========== TRADE ROUTE HELPER ==========

  establishTradeFromCity(fromCityId, toCityIdStr) {
    if (!toCityIdStr) return;
    Game.establishTradeRoute(0, fromCityId, parseInt(toCityIdStr));
    const city = Game.findCityById(fromCityId);
    if (city) this.showCityPanel(city);
  },

  // ========== DIPLOMACY PANEL ==========

  showDiplomacy() {
    const panel = document.getElementById('diplomacy-panel');
    panel.classList.remove('hidden');
    this.renderDiplomacy();
  },

  closeDiplomacy() {
    document.getElementById('diplomacy-panel').classList.add('hidden');
  },

  // ========== CITY-STATE PANEL ==========

  showCityStatePanel(cs) {
    const panel = document.getElementById('citystate-panel');
    panel.classList.remove('hidden');
    this.renderCityStateDetail(cs);
  },

  closeCityStatePanel() {
    document.getElementById('citystate-panel').classList.add('hidden');
  },

  renderCityStateDetail(cs) {
    const container = document.getElementById('citystate-detail');
    if (!cs || !cs.alive) {
      container.innerHTML = '<p style="color:var(--text-dim)">This city-state has been conquered.</p>';
      return;
    }
    const csType = CITY_STATE_TYPES[cs.type];
    const inf = cs.influence[0] || 0;
    const status = Game.getCityStateStatus(0, cs.id);
    const statusClass = 'cs-status-' + status;
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const player = Game.state.players[0];
    const canAfford = player.gold >= 50;

    let bonusHtml = '';
    const b = cs.bonus;
    if (b.gold) bonusHtml += '<span>💰 Gold +' + Math.round(b.gold * 100) + '%</span> ';
    if (b.sci) bonusHtml += '<span>🔬 Science +' + Math.round(b.sci * 100) + '%</span> ';
    if (b.cul) bonusHtml += '<span>🎭 Culture +' + Math.round(b.cul * 100) + '%</span> ';
    if (b.prod) bonusHtml += '<span>⚙️ Production +' + Math.round(b.prod * 100) + '%</span> ';
    if (b.combat) bonusHtml += '<span>⚔️ Combat +' + Math.round(b.combat * 100) + '%</span> ';
    if (b.hap) bonusHtml += '<span>😊 Happiness +' + b.hap + '</span> ';

    const friendPct = Math.min(inf, 30) / 30 * 100;
    const allyPct = inf >= 30 ? Math.min(inf - 30, 30) / 30 * 100 : 0;

    let html = '<div style="text-align:center;margin-bottom:12px;">';
    html += '<h3 style="margin:0">' + csType.icon + ' ' + cs.name + '</h3>';
    html += '<span style="color:' + csType.color + ';font-size:13px;font-weight:600">' + csType.label + ' City-State</span>';
    html += '</div>';
    html += '<p style="font-size:12px;color:var(--text-dim);margin:6px 0">' + cs.desc + '</p>';
    html += '<div style="margin:10px 0">';
    html += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">';
    html += '<span>Influence: <b>' + inf + '</b>/100</span>';
    html += '<span class="' + statusClass + '" style="font-weight:700">' + statusLabel + '</span>';
    html += '</div>';
    html += '<div class="cs-influence-bar">';
    html += '<div class="cs-influence-fill" style="width:' + inf + '%;background:linear-gradient(90deg, #888 0%, #4caf50 30%, #ffc107 60%, #ffc107 100%)"></div>';
    html += '</div>';
    html += '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-dim)">';
    html += '<span>Neutral</span><span>Friend (30)</span><span>Ally (60)</span>';
    html += '</div>';
    html += '</div>';
    html += '<div style="margin:10px 0;padding:8px;background:var(--bg-dark);border-radius:4px;border:1px solid var(--border)">';
    html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">Ally Bonuses:</div>';
    html += '<div style="font-size:13px">' + bonusHtml + '</div>';
    if (status === 'friend') html += '<div style="font-size:10px;color:var(--text-dim);margin-top:4px">Currently receiving 50% bonuses (friend)</div>';
    if (status === 'ally') html += '<div style="font-size:10px;color:var(--green);margin-top:4px">Receiving full bonuses (ally)</div>';
    html += '</div>';
    html += '<div style="display:flex;gap:8px;margin-top:12px">';
    html += '<button class="btn btn-secondary" style="flex:1" ' + (canAfford ? '' : 'disabled') + ' onclick="Game.sendEnvoy(0,\'' + cs.id + '\');UI.renderCityStateDetail(Game.findCityState(\'' + cs.id + '\'))">Send Envoy (50💰)</button>';
    html += '<button class="btn btn-danger" style="flex:1" onclick="UI.confirmAttackCityState(\'' + cs.id + '\')">⚔️ Declare War</button>';
    html += '</div>';
    if (!canAfford) html += '<p style="font-size:11px;color:var(--red);margin-top:4px">Not enough gold for envoy</p>';
    html += '<div style="margin-top:8px;font-size:11px;color:var(--text-dim)">HP: ' + cs.hp + '/' + cs.maxHp + ' | Defense: ' + cs.defense + '</div>';
    container.innerHTML = html;
  },

  confirmAttackCityState(csId) {
    const cs = Game.findCityState(csId);
    if (!cs) return;
    if (confirm('Attack ' + cs.name + '? This will anger all city-states!')) {
      // Find a human unit adjacent to the city-state
      const neighbors = Game.getNeighbors(cs.r, cs.c);
      let attacker = null;
      for (const n of neighbors) {
        const tile = Game.getTile(n.r, n.c);
        if (tile && tile.unit && tile.unit.owner === 0 && !tile.unit.hasActed) {
          const uType = Game.getUnitType(tile.unit);
          if (uType.str > 0) { attacker = tile.unit; break; }
        }
      }
      if (!attacker) {
        UI.notify('❌ No available military unit adjacent to ' + cs.name);
        return;
      }
      const result = Game.attackCityState(attacker, csId);
      if (result) {
        if (result.result === 'conquered') {
          this.closeCityStatePanel();
        } else {
          this.renderCityStateDetail(cs);
        }
      }
      Renderer.render();
      Renderer.updateMinimap();
      UI.updateTopBar();
    }
  },

  renderDiplomacy() {
    if (!Game.state) return;
    const myPlayer = Game.state.players[0];
    let html = '';
    for (let i = 1; i < Game.state.players.length; i++) {
      const other = Game.state.players[i];
      if (!other.alive) continue;
      Game.initRelations(0, i);
      const rel = myPlayer.relations[i];
      const score = rel.score || 0;
      const atWar = rel.atWar || false;
      const scoreColor = score > 0 ? 'var(--green)' : score < 0 ? 'var(--red)' : 'var(--text-dim)';
      html += `<div class="diplo-row">
        <span class="diplo-color-swatch" style="background:${other.color}"></span>
        <span class="diplo-name" style="cursor:pointer;text-decoration:underline" onclick="UI.diplomacyGreet(${i})">${other.name}</span>
        <span class="diplo-score" style="color:${scoreColor}">${score > 0 ? '+' : ''}${score}</span>
        <span class="diplo-status" style="color:${atWar ? 'var(--red)' : 'var(--green)'}">${atWar ? '⚔️ War' : '☮️ Peace'}</span>
        <span class="diplo-actions">
          ${!atWar ? `<button class="btn-sm diplo-btn-war" onclick="UI.diplomacyDeclareWar(${i})">Declare War</button>` : ''}
          ${atWar && (rel.warTurns || 0) >= 10 ? `<button class="btn-sm diplo-btn-peace" onclick="UI.diplomacyMakePeace(${i})">Make Peace</button>` : ''}
        </span>
      </div>`;
    }
    if (!html) html = '<p style="color:var(--text-dim);text-align:center">No other civilizations discovered.</p>';
    document.getElementById('diplomacy-content').innerHTML = html;
  },

  // ========== DIALOGUE SYSTEM ==========

  FALLBACK_RESPONSES: {
    greet: {
      Caesar: 'Rome greets you.', Cleopatra: 'Welcome, traveler.', Genghis: 'Speak quickly.',
      Victoria: 'Good day to you.', Montezuma: 'The gods watch us.', Bismarck: 'State your business.',
      Tokugawa: 'Honor demands respect.', Catherine: 'What brings you here?', _default: 'Greetings.'
    },
    war_declaration: {
      Caesar: 'Rome will crush you!', Cleopatra: 'You will regret this, fool.', Genghis: 'Your cities will burn!',
      Victoria: 'The Empire strikes without mercy.', Montezuma: 'Blood will flow!', Bismarck: 'Prepare for total war.',
      Tokugawa: 'You face the fury of the samurai!', Catherine: 'Russia will bury you.', _default: 'Prepare for war!'
    },
    peace_offer: {
      Caesar: 'Perhaps we can negotiate...', Cleopatra: 'Let us end this bloodshed.', Genghis: 'You wish to surrender?',
      Victoria: 'Terms may be discussed.', Montezuma: 'The gods may allow it.', Bismarck: 'A pragmatic choice.',
      Tokugawa: 'Peace has its own honor.', Catherine: 'Very well, let us talk.', _default: 'Perhaps we can find peace.'
    }
  },

  _getFallback(action, leaderName) {
    const pool = this.FALLBACK_RESPONSES[action] || this.FALLBACK_RESPONSES.greet;
    return pool[leaderName] || pool._default;
  },

  showDialogue(leader, text, options) {
    const overlay = document.getElementById('dialogue-overlay');
    const portrait = document.getElementById('dialogue-portrait');
    const nameEl = document.getElementById('dialogue-name');
    const textEl = document.getElementById('dialogue-text');
    const actionsEl = document.getElementById('dialogue-actions');

    // Portrait: use leader image if available, else colored square with initial
    const player = Game.state ? Game.state.players.find(p => p.name === leader) : null;
    const color = player ? player.color : '#556';
    const leaderData = typeof LEADERS !== 'undefined' ? LEADERS.find(l => l.color === color) || LEADERS[0] : null;
    if (leaderData && leaderData.portrait) {
      portrait.style.background = `url(${leaderData.portrait}) center/cover no-repeat, linear-gradient(135deg, ${color}, ${color}88)`;
      portrait.textContent = '';
    } else {
      portrait.style.background = `linear-gradient(135deg, ${color}, ${color}88)`;
      portrait.textContent = leader ? leader.charAt(0).toUpperCase() : '?';
    }

    // Play leader-specific diplomacy music
    if (leaderData && typeof LEADER_MUSIC !== 'undefined' && LEADER_MUSIC[leaderData.id]) {
      this._savedEraMusic = this.currentEraMusic;
      this.fadeOutMusic(() => {
        this.musicPlayer.src = LEADER_MUSIC[leaderData.id];
        this.musicPlayer.loop = true;
        this.musicPlayer.play().catch(() => {});
        this.fadeInMusic();
      });
    }

    nameEl.textContent = leader || 'Unknown';

    if (text === null) {
      textEl.innerHTML = '<span class="dlg-loading">Thinking</span>';
    } else {
      textEl.textContent = text;
    }

    actionsEl.innerHTML = '';
    if (options && options.length) {
      for (const opt of options) {
        const btn = document.createElement('button');
        btn.textContent = opt.label;
        if (opt.danger) btn.classList.add('dlg-btn-danger');
        btn.addEventListener('click', () => { this.closeDialogue(); if (opt.action) opt.action(); });
        actionsEl.appendChild(btn);
      }
    }

    overlay.classList.remove('hidden');
  },

  closeDialogue() {
    document.getElementById('dialogue-overlay').classList.add('hidden');
    // Stop any active speech recognition
    if (this._recognition) {
      this._recognition.stop();
      this._recognition = null;
    }
    // Stop dialogue audio
    if (this._dialogueAudio) {
      this._dialogueAudio.pause();
      this._dialogueAudio = null;
    }
    // Reset player speech
    const pSpeech = document.getElementById('dialogue-player-speech');
    if (pSpeech) pSpeech.style.display = 'none';
    // Restore era music after diplomacy
    if (this._savedEraMusic) {
      this.fadeOutMusic(() => {
        this.currentEraMusic = null;
        this.playEraMusic(this._savedEraMusic);
      });
      this._savedEraMusic = null;
    }
  },

  _updateDialogueText(text) {
    const textEl = document.getElementById('dialogue-text');
    if (textEl) textEl.textContent = text;
  },

  async _fetchWithTimeout(url, body, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timer);
      const data = await resp.json();
      if (data.error) return null;
      return data.response;
    } catch {
      clearTimeout(timer);
      return null;
    }
  },

  async requestDiplomacyDialogue(playerId, action) {
    const player = Game.state.players[playerId];
    const human = Game.state.players[0];
    Game.initRelations(0, playerId);
    const relation = human.relations[playerId] ? human.relations[playerId].score : 0;
    const context = `Turn ${Game.state.turn}, Year ${Game.getYearString()}, ${player.cities.length} cities, relation score ${relation}`;
    const result = await this._fetchWithTimeout('/api/chat', {
      leader: player.name, context, action, relation, player_name: human.name
    }, 10000);
    return result || this._getFallback(action, player.name);
  },

  async requestNarration(event) {
    const context = Game.state
      ? `Turn ${Game.state.turn}, Year ${Game.getYearString()}, Era: ${Game.state.players[0].era || 'caveman'}`
      : '';
    const result = await this._fetchWithTimeout('/api/narrate', {event, context}, 10000);
    return result || event;
  },

  // Show narration as a styled notification
  showNarration(text) {
    const container = document.getElementById('notifications');
    const el = document.createElement('div');
    el.className = 'notification narration-notif';
    el.textContent = '📜 ' + text;
    container.appendChild(el);
    setTimeout(() => el.remove(), 8000);
  },

  // Fire-and-forget narration for game events
  narrateEvent(event) {
    this.requestNarration(event).then(text => this.showNarration(text));
  },

  // ========== VOICE NARRATION OVERLAY ==========

  _narrationAudio: null,
  _narrationQueue: [],

  showNarrationOverlay(quote, attribution, icon) {
    const overlay = document.getElementById('narration-overlay');
    const quoteEl = document.getElementById('narration-quote');
    const attrEl = document.getElementById('narration-attribution');
    const iconEl = document.getElementById('narration-icon');
    if (!overlay) return;
    iconEl.textContent = icon || '📜';
    quoteEl.textContent = '"' + quote + '"';
    attrEl.textContent = attribution || '';
    overlay.classList.remove('hidden');
  },

  // Show narration with pre-fetched audio (base64 mp3) — plays OVER music
  showNarrationWithAudio(text, attribution, icon, audioBase64) {
    this.showNarrationOverlay(text, attribution, icon);
    if (audioBase64) {
      try {
        // Duck music volume but keep it playing
        if (this.musicPlayer) this.musicPlayer.volume = this.musicVolume * 0.3;
        const audioUrl = 'data:audio/mpeg;base64,' + audioBase64;
        this._narrationAudio = new Audio(audioUrl);
        this._narrationAudio.volume = 1.0;
        this._narrationAudio.play().catch(() => {});
        this._narrationAudio.onended = () => {
          if (this.musicPlayer) this.musicPlayer.volume = this.musicVolume;
          this._narrationAudio = null;
        };
      } catch (e) {}
    } else {
      this._browserTTS(text);
    }
  },

  dismissNarration() {
    const overlay = document.getElementById('narration-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (this._narrationAudio) {
      this._narrationAudio.pause();
      this._narrationAudio = null;
    }
    // Restore music volume
    if (this.musicPlayer) this.musicPlayer.volume = this.musicVolume;
    // Process next queued narration
    if (this._narrationQueue.length > 0) {
      const next = this._narrationQueue.shift();
      setTimeout(() => next.fn(), 300);
    }
  },

  async _requestNarrateVoice(prompt, context) {
    try {
      const resp = await fetch('/api/narrate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          context: Game.state ? 'Turn ' + Game.state.turn + ', Year ' + Game.getYearString() + ', Era: ' + (Game.state.players[0].era || 'caveman') : '',
          style: NARRATION_PROMPTS.narrator_style
        })
      });
      if (!resp.ok) return { text: null, audio: null };
      return await resp.json();
    } catch (e) {
      return { text: null, audio: null };
    }
  },

  queueNarration(narrateFn) {
    if (!document.getElementById('narration-overlay').classList.contains('hidden')) {
      this._narrationQueue.push({ fn: narrateFn });
    } else {
      narrateFn();
    }
  },

  narrateWonder(wonderId) {
    const prompt = NARRATION_PROMPTS.wonders[wonderId];
    if (!prompt) return;
    const w = WONDERS.find(w => w.id === wonderId);
    const name = w ? w.name : wonderId;
    this.queueNarration(async () => {
      const result = await this._requestNarrateVoice(prompt);
      if (result && result.text) {
        this.showNarrationWithAudio(result.text, '— On the completion of ' + name, '🏛️', result.audio);
      }
    });
  },

  narrateTech(techId) {
    const prompt = NARRATION_PROMPTS.techs[techId];
    if (!prompt) return;
    const t = TECHS.find(t => t.id === techId);
    const name = t ? t.name : techId;
    this.queueNarration(async () => {
      const result = await this._requestNarrateVoice(prompt);
      if (result && result.text) {
        this.showNarrationWithAudio(result.text, '— On the discovery of ' + name, '🔬', result.audio);
      }
    });
  },

  narrateEra(era) {
    const prompt = NARRATION_PROMPTS.eras[era];
    if (!prompt) return;
    const eraName = typeof ERA_NAMES !== 'undefined' ? ERA_NAMES[era] : era;
    this.queueNarration(async () => {
      const result = await this._requestNarrateVoice(prompt);
      if (result && result.text) {
        this.showNarrationWithAudio(result.text, '— The ' + eraName + ' Era dawns', '🌅', result.audio);
      }
    });
  },

  narrateArtifact(artifact) {
    const prompt = NARRATION_PROMPTS.artifacts[artifact.type];
    if (!prompt) return;
    const extraContext = 'The specific artifact is: ' + artifact.name;
    this.queueNarration(async () => {
      const result = await this._requestNarrateVoice(prompt + ' ' + extraContext);
      if (result && result.text) {
        this.showNarrationWithAudio(result.text, '— ' + artifact.name + ' acquired', '📖', result.audio);
      }
    });
  },

  // ========== DIPLOMACY DIALOGUE INTEGRATION ==========

  async diplomacyGreet(playerId) {
    const player = Game.state.players[playerId];
    this.showDialogue(player.name, null, []);
    // Reset player speech display
    const pSpeech = document.getElementById('dialogue-player-speech');
    if (pSpeech) pSpeech.style.display = 'none';
    const text = await this.requestDiplomacyDialogue(playerId, 'greet');
    this._updateDialogueText(text);
    // TTS the greeting
    this._ttsDialogue(text);
    // Show default voice actions
    this._showIntentActions(playerId, 'greet');
  },

  async diplomacyDeclareWar(playerId) {
    const player = Game.state.players[playerId];
    this.showDialogue(player.name, null, []);
    const text = await this.requestDiplomacyDialogue(playerId, 'war_declaration');
    this._updateDialogueText(text);
    this._ttsDialogue(text);
    const actionsEl = document.getElementById('dialogue-actions');
    actionsEl.innerHTML = '';
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Declare War';
    confirmBtn.classList.add('dlg-btn-danger');
    confirmBtn.addEventListener('click', () => {
      this.closeDialogue();
      Game.declareWar(0, playerId);
      this.renderDiplomacy();
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Stand Down';
    cancelBtn.addEventListener('click', () => this.closeDialogue());
    actionsEl.appendChild(confirmBtn);
    actionsEl.appendChild(cancelBtn);
  },

  async diplomacyMakePeace(playerId) {
    const player = Game.state.players[playerId];
    this.showDialogue(player.name, null, []);
    const text = await this.requestDiplomacyDialogue(playerId, 'peace_offer');
    this._updateDialogueText(text);
    this._ttsDialogue(text);
    const actionsEl = document.getElementById('dialogue-actions');
    actionsEl.innerHTML = '';
    const acceptBtn = document.createElement('button');
    acceptBtn.textContent = 'Accept Peace';
    acceptBtn.addEventListener('click', () => {
      this.closeDialogue();
      Game.makePeace(0, playerId);
      this.renderDiplomacy();
    });
    const refuseBtn = document.createElement('button');
    refuseBtn.textContent = 'Refuse';
    refuseBtn.classList.add('dlg-btn-danger');
    refuseBtn.addEventListener('click', () => this.closeDialogue());
    actionsEl.appendChild(acceptBtn);
    actionsEl.appendChild(refuseBtn);
  },

  // ========== VOICE DIPLOMACY ==========

  _voicePlayerId: null,
  _recognition: null,
  _dialogueAudio: null,

  async _ttsDialogue(text) {
    try {
      const resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!resp.ok || !resp.headers.get('content-type')?.includes('audio')) {
        this._browserTTS(text);
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      if (this._dialogueAudio) { this._dialogueAudio.pause(); }
      if (this.musicPlayer) this.musicPlayer.volume = this.musicVolume * 0.3;
      this._dialogueAudio = new Audio(url);
      this._dialogueAudio.volume = 1.0;
      this._dialogueAudio.play().catch(() => {});
      this._dialogueAudio.onended = () => {
        URL.revokeObjectURL(url);
        if (this.musicPlayer) this.musicPlayer.volume = this.musicVolume;
        this._dialogueAudio = null;
      };
    } catch (e) {
      this._browserTTS(text);
    }
  },

  _browserTTS(text) {
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 0.8;
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('male'))
      || voices.find(v => v.lang.startsWith('en'))
      || voices[0];
    if (preferred) utterance.voice = preferred;
    speechSynthesis.speak(utterance);
  },

  startVoiceChat() {
    const micBtn = document.getElementById('dialogue-mic');
    const status = document.getElementById('dialogue-speech-status');
    if (!micBtn) return;

    // Check for Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      status.textContent = 'Speech recognition not supported in this browser';
      return;
    }

    // If already listening, stop
    if (this._recognition) {
      this._recognition.stop();
      this._recognition = null;
      micBtn.classList.remove('listening');
      status.textContent = '';
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    this._recognition = recognition;

    micBtn.classList.add('listening');
    micBtn.textContent = '🔴 Listening...';
    status.textContent = 'Speak now...';

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      status.textContent = transcript;
      // If final result, process it
      if (event.results[event.results.length - 1].isFinal) {
        recognition.stop();
      }
    };

    recognition.onend = () => {
      this._recognition = null;
      micBtn.classList.remove('listening');
      micBtn.textContent = '🎤 Speak';
      const transcript = status.textContent;
      if (transcript && transcript !== 'Speak now...' && transcript !== '') {
        this._processVoiceChat(transcript);
      }
    };

    recognition.onerror = (event) => {
      this._recognition = null;
      micBtn.classList.remove('listening');
      micBtn.textContent = '🎤 Speak';
      if (event.error === 'not-allowed') {
        status.textContent = 'Microphone access denied';
      } else if (event.error === 'no-speech') {
        status.textContent = 'No speech detected — try again';
      } else {
        status.textContent = 'Error: ' + event.error;
      }
    };

    recognition.start();
  },

  async _processVoiceChat(speech) {
    const micBtn = document.getElementById('dialogue-mic');
    const status = document.getElementById('dialogue-speech-status');
    const textEl = document.getElementById('dialogue-text');
    const actionsEl = document.getElementById('dialogue-actions');

    micBtn.classList.add('processing');
    micBtn.disabled = true;
    status.textContent = 'Processing...';

    // Show player's speech
    const playerSpeechEl = document.getElementById('dialogue-player-speech');
    if (playerSpeechEl) {
      playerSpeechEl.textContent = 'You said: "' + speech + '"';
      playerSpeechEl.style.display = 'block';
    }

    // Determine which leader we're talking to
    const nameEl = document.getElementById('dialogue-name');
    const leaderName = nameEl ? nameEl.textContent : '';
    const playerId = Game.state ? Game.state.players.findIndex(p => p.name === leaderName) : -1;

    if (playerId <= 0) {
      textEl.textContent = '(Could not identify leader)';
      micBtn.classList.remove('processing');
      micBtn.disabled = false;
      return;
    }

    const player = Game.state.players[playerId];
    const human = Game.state.players[0];
    Game.initRelations(0, playerId);
    const relation = human.relations[playerId] ? human.relations[playerId].score : 0;
    const context = 'Turn ' + Game.state.turn + ', Year ' + Game.getYearString() + ', ' + player.cities.length + ' cities';

    // Show thinking indicator
    textEl.innerHTML = '<span class="dlg-loading">Thinking</span>';

    try {
      const resp = await fetch('/api/chat-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speech,
          leader: leaderName,
          context,
          relation,
          player_name: human.name
        })
      });
      const data = await resp.json();

      // Update dialogue text with leader's response
      textEl.textContent = data.response || 'Hmm...';

      // Play TTS audio of leader's response
      if (data.audio) {
        if (this._dialogueAudio) { this._dialogueAudio.pause(); }
        const audioUrl = 'data:audio/mpeg;base64,' + data.audio;
        this._dialogueAudio = new Audio(audioUrl);
        // Lower the leader music while speaking
        if (this.musicPlayer) this.musicPlayer.volume = this.musicVolume * 0.3;
        this._dialogueAudio.volume = 1.0;
        this._dialogueAudio.play().catch(() => {});
        this._dialogueAudio.onended = () => {
          if (this.musicPlayer) this.musicPlayer.volume = this.musicVolume;
          this._dialogueAudio = null;
        };
      }

      // Show action buttons based on intent
      actionsEl.innerHTML = '';
      const intent = data.intent || 'other';
      this._showIntentActions(playerId, intent);

      status.textContent = '(' + intent + ')';
    } catch (e) {
      textEl.textContent = '...';
      status.textContent = 'Connection failed';
    }

    micBtn.classList.remove('processing');
    micBtn.disabled = false;
  },

  _showIntentActions(playerId, intent) {
    const actionsEl = document.getElementById('dialogue-actions');
    actionsEl.innerHTML = '';
    const self = this;

    function addBtn(label, action, danger) {
      const btn = document.createElement('button');
      btn.textContent = label;
      if (danger) btn.classList.add('dlg-btn-danger');
      btn.addEventListener('click', action);
      actionsEl.appendChild(btn);
    }

    const atWar = Game.state.players[0].wars && Game.state.players[0].wars.includes(playerId);
    const warTurns = Game.state.players[0].relations[playerId] ? Game.state.players[0].relations[playerId].warTurns || 0 : 0;

    switch (intent) {
      case 'trade_offer':
        addBtn('Propose Trade', () => { self.closeDialogue(); UI.notify('Trade proposed (not yet implemented)'); });
        addBtn('Nevermind', () => self.closeDialogue());
        break;
      case 'alliance_offer':
        addBtn('Form Alliance', () => { self.closeDialogue(); UI.notify('Alliance formed!'); });
        addBtn('Decline', () => self.closeDialogue());
        break;
      case 'peace_offer':
        if (atWar && warTurns >= 10) {
          addBtn('Accept Peace', () => { self.closeDialogue(); Game.makePeace(0, playerId); self.renderDiplomacy(); });
        }
        addBtn('Close', () => self.closeDialogue());
        break;
      case 'threaten':
      case 'demand':
        if (!atWar) {
          addBtn('Declare War', () => { self.closeDialogue(); Game.declareWar(0, playerId); self.renderDiplomacy(); }, true);
        }
        addBtn('Back Down', () => self.closeDialogue());
        break;
      case 'insult':
        if (!atWar) {
          addBtn('Declare War', () => { self.closeDialogue(); Game.declareWar(0, playerId); self.renderDiplomacy(); }, true);
        }
        addBtn('Dismiss', () => self.closeDialogue());
        break;
      default:
        // greet, compliment, farewell, ask_about, other
        addBtn('🎤 Say More', () => self.startVoiceChat());
        if (!atWar) {
          addBtn('Declare War', () => { self.closeDialogue(); Game.declareWar(0, playerId); self.renderDiplomacy(); }, true);
        }
        if (atWar && warTurns >= 10) {
          addBtn('Make Peace', () => { self.closeDialogue(); Game.makePeace(0, playerId); self.renderDiplomacy(); });
        }
        addBtn('Farewell', () => self.closeDialogue());
        break;
    }
  },

  // ========== NARRATIVE SYSTEM ==========

  _narrativeCallback: null,

  showPrologue() {
    const overlay = document.getElementById('narrative-overlay');
    const title = document.getElementById('narrative-title');
    const subtitle = document.getElementById('narrative-subtitle');
    const text = document.getElementById('narrative-text');
    const btn = document.getElementById('narrative-dismiss');
    overlay.classList.remove('era-intro');
    title.textContent = NARRATIVE.title;
    subtitle.textContent = NARRATIVE.subtitle;
    text.textContent = NARRATIVE.prologue;
    btn.textContent = 'Begin Your Journey';
    overlay.classList.remove('hidden');
    this._narrativeCallback = () => {
      // Show intro narration scroll with TTS
      const result = this._prefetchedIntroNarration;
      if (result && result.text) {
        this.showNarrationWithAudio(result.text, "— Apollo's Time", '🔥', result.audio);
      } else {
        // Server narration unavailable — use browser TTS with prologue text
        this.showNarrationOverlay(NARRATIVE.prologue, "— Apollo's Time", '🔥');
        this._browserTTS(NARRATIVE.prologue);
      }
    };
  },

  showEraIntro(era) {
    const overlay = document.getElementById('narrative-overlay');
    const title = document.getElementById('narrative-title');
    const subtitle = document.getElementById('narrative-subtitle');
    const text = document.getElementById('narrative-text');
    const btn = document.getElementById('narrative-dismiss');
    overlay.classList.add('era-intro');
    title.textContent = ERA_ICONS[era] + ' ' + ERA_NAMES[era] + ' Era';
    subtitle.textContent = '';
    text.textContent = NARRATIVE.eraIntros[era] || '';
    btn.textContent = 'Continue';
    overlay.classList.remove('hidden');
    this._narrativeCallback = null;
    // Auto-dismiss after 20 seconds (longer texts need more reading time)
    this._eraIntroTimer = setTimeout(() => this.closeNarrative(), 20000);
  },

  showRandomEvent(era) {
    if (Math.random() > 0.10) return;
    const eraEvents = NARRATIVE.events.filter(e => e.era === era);
    if (eraEvents.length === 0) return;
    const evt = eraEvents[Math.floor(Math.random() * eraEvents.length)];
    const container = document.getElementById('notifications');
    const el = document.createElement('div');
    el.className = 'notification narrative-event';
    el.textContent = '\u{1F4DC} ' + evt.text;
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => el.remove());
    container.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 10000);
  },

  showVictoryNarrative(type) {
    const victoryText = NARRATIVE.victoryTexts[type];
    if (!victoryText) return;
    const overlay = document.getElementById('narrative-overlay');
    const title = document.getElementById('narrative-title');
    const subtitle = document.getElementById('narrative-subtitle');
    const text = document.getElementById('narrative-text');
    const btn = document.getElementById('narrative-dismiss');
    overlay.classList.remove('era-intro');
    title.textContent = '\u{1F3C6} Victory!';
    subtitle.textContent = '';
    text.textContent = victoryText;
    btn.textContent = 'Continue';
    overlay.classList.remove('hidden');
    this._narrativeCallback = null;
  },

  closeNarrative() {
    const overlay = document.getElementById('narrative-overlay');
    overlay.classList.add('hidden');
    if (this._eraIntroTimer) {
      clearTimeout(this._eraIntroTimer);
      this._eraIntroTimer = null;
    }
    // Re-unlock audio on this user gesture
    if (!this._audioUnlocked) this.unlockAudio();
    if (this._narrativeCallback) {
      this._narrativeCallback();
      this._narrativeCallback = null;
    }
  },

  // ========== MUSIC SYSTEM ==========

  musicPlayer: null,
  currentEraMusic: null,
  musicEnabled: true,
  musicVolume: 0.3,
  eraTrackIndex: {},  // tracks which variant was last played per era

  initMusic() {
    this.musicPlayer = new Audio();
    this.musicPlayer.loop = false;
    this.musicPlayer.volume = this.musicVolume;
    // When a track ends, play the next variant for the same era
    this.musicPlayer.addEventListener('ended', () => {
      if (this.musicEnabled && this.currentEraMusic) {
        this.playNextTrack(this.currentEraMusic);
      }
    });
  },

  // Unlock audio context on user gesture — browsers block audio until interaction
  unlockAudio() {
    // Create and resume AudioContext to unlock web audio
    if (!this._audioCtx) {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume().catch(() => {});
    }
    // Warm up audio pipeline with a throwaway element (don't touch musicPlayer)
    const warmup = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    warmup.volume = 0;
    warmup.play().then(() => warmup.pause()).catch(() => {});
    this._audioUnlocked = true;
  },

  pickNextTrack(era) {
    const tracks = ERA_MUSIC[era];
    if (!tracks || tracks.length === 0) return null;
    if (tracks.length === 1) return tracks[0];
    const lastIdx = this.eraTrackIndex[era] ?? -1;
    // Pick a random track that isn't the one we just played
    let idx;
    do { idx = Math.floor(Math.random() * tracks.length); } while (idx === lastIdx && tracks.length > 1);
    this.eraTrackIndex[era] = idx;
    return tracks[idx];
  },

  playNextTrack(era) {
    const track = this.pickNextTrack(era);
    if (!track) return;
    this.musicPlayer.src = track;
    this.musicPlayer.play().catch(() => {});
    this.fadeInMusic();
  },

  playEraMusic(era) {
    if (!this.musicEnabled || this.currentEraMusic === era) return;
    this.currentEraMusic = era;
    const track = this.pickNextTrack(era);
    if (!track) return;
    if (this.musicPlayer.src) {
      this.fadeOutMusic(() => {
        this.musicPlayer.src = track;
        this.musicPlayer.play().catch(() => {});
        this.fadeInMusic();
      });
    } else {
      this.musicPlayer.src = track;
      this.musicPlayer.play().catch(() => {});
      this.fadeInMusic();
    }
  },

  fadeOutMusic(callback) {
    let vol = this.musicPlayer.volume;
    const fade = setInterval(() => {
      vol -= 0.05;
      if (vol <= 0) {
        clearInterval(fade);
        this.musicPlayer.pause();
        if (callback) callback();
      } else {
        this.musicPlayer.volume = vol;
      }
    }, 100);
  },

  fadeInMusic() {
    this.musicPlayer.volume = 0;
    let vol = 0;
    const fade = setInterval(() => {
      vol += 0.05;
      if (vol >= this.musicVolume) {
        clearInterval(fade);
        this.musicPlayer.volume = this.musicVolume;
      } else {
        this.musicPlayer.volume = vol;
      }
    }, 100);
  },

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    const btn = document.getElementById('music-toggle');
    if (!this.musicEnabled) {
      this.musicPlayer.pause();
      if (btn) btn.textContent = '\u{1F507}';
    } else {
      if (btn) btn.textContent = '\u{1F50A}';
      if (this.currentEraMusic) {
        this.currentEraMusic = null; // Reset so playEraMusic will re-trigger
        this.playEraMusic(Game.state.players[0].era);
      }
    }
  },

    // Prepare a video element synchronously during a user gesture so play() is allowed.
  // Call this inside the click handler BEFORE any setTimeout.
  prepareVideo(src, callback) {
    const overlay = document.getElementById('video-overlay');
    const video = document.getElementById('game-video');
    if (!overlay || !video || window.__SKIP_VIDEO) { if (callback) callback(); return; }
    this._videoCallback = callback;
    this._videoPrepared = true;
    // Mute background music while video plays
    if (this.musicPlayer && !this.musicPlayer.paused) {
      this._musicWasPlaying = true;
      this.musicPlayer.pause();
    }
    video.preload = 'auto';
    video.playsInline = true;
    video.muted = false;
    overlay.classList.remove('hidden');
    video.src = src;
    video.load();
    this._videoPlayPromise = video.play().catch(() => {
      video.muted = true;
      return video.play();
    }).catch(() => {});
    video.onended = () => { this.skipVideo(); };
    video.onerror = () => { this.skipVideo(); };
    this._videoLoadTimer = setTimeout(() => { this.skipVideo(); }, 20000);
  },

  playVideo(src, callback) {
    // If already prepared via prepareVideo, just wire up the callback
    if (this._videoPrepared) {
      this._videoPrepared = false;
      this._videoCallback = callback;
      return;
    }
    const overlay = document.getElementById('video-overlay');
    const video = document.getElementById('game-video');
    if (!overlay || !video || window.__SKIP_VIDEO) { if (callback) callback(); return; }
    this._videoCallback = callback;
    // Mute background music while video plays
    if (this.musicPlayer && !this.musicPlayer.paused) {
      this._musicWasPlaying = true;
      this.musicPlayer.pause();
    }
    video.preload = 'auto';
    video.playsInline = true;
    video.muted = false;
    overlay.classList.remove('hidden');
    video.src = src;
    video.load();
    this._videoLoadTimer = setTimeout(() => { this.skipVideo(); }, 20000);
    video.oncanplaythrough = () => {
      if (this._videoLoadTimer) { clearTimeout(this._videoLoadTimer); this._videoLoadTimer = null; }
      video.play().catch(() => {
        video.muted = true;
        return video.play();
      }).catch(() => { this.skipVideo(); });
    };
    video.onended = () => { this.skipVideo(); };
    video.onerror = () => { this.skipVideo(); };
  },

  skipVideo() {
    if (this._videoLoadTimer) { clearTimeout(this._videoLoadTimer); this._videoLoadTimer = null; }
    const overlay = document.getElementById('video-overlay');
    const video = document.getElementById('game-video');
    if (overlay) overlay.classList.add('hidden');
    if (video) { video.pause(); video.src = ''; video.oncanplay = null; video.oncanplaythrough = null; }
    // Resume background music if it was playing before video
    if (this._musicWasPlaying && this.musicPlayer && this.musicEnabled) {
      this._musicWasPlaying = false;
      this.musicPlayer.play().catch(() => {});
    }
    if (this._videoCallback) {
      const cb = this._videoCallback;
      this._videoCallback = null;
      cb();
    }
  },

  playIntroVideo(callback) {
    this.playVideo('assets/video/intro.mp4', callback);
  },

  playEraVideo(era, callback) {
    this.playVideo('assets/video/era/' + era + '.mp4', callback);
  },

  playWonderVideo(wonderId, callback) {
    this.playVideo('assets/video/wonders/' + wonderId + '.mp4', callback);
  }
};
