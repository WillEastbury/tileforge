// Apollo's Time — Main Entry Point
"use strict";

function startNewGame() {
  const config = {
    civName: document.getElementById('civ-name').value || 'Player',
    mapSize: document.getElementById('map-size').value,
    aiCount: parseInt(document.getElementById('ai-count').value),
    difficulty: parseInt(document.getElementById('difficulty').value)
  };

  // Unlock audio immediately on user click — must happen before async work
  UI.initMusic();
  UI.unlockAudio();

  UI.showScreen('game-screen');

  if (!Renderer.initialized) {
    Renderer.init();
  }

  Game.init(config);

  // Center on player's first city
  const p = Game.state.players[0];
  if (p.cities.length > 0) {
    Renderer.centerOn(p.cities[0].r, p.cities[0].c);
  }

  // Auto-select starting research
  if (!p.currentResearch) {
    const available = Game.getAvailableTechs(p);
    if (available.length > 0) {
      UI.showTechTree();
    }
  }

  Renderer.render();
  Renderer.updateMinimap();
  UI.updateTopBar();
  UI.updateRightPanel();
  // Play intro video first, then show prologue text overlay
  UI.playIntroVideo(function() {
    UI.showPrologue();
  });
  UI.notify('Welcome to Apollo\'s Time! Found your civilization and conquer the world.');
}

function selectTech(techId) {
  const p = Game.state.players[0];
  p.currentResearch = techId;
  p.researchProgress = 0;
  UI.renderTechTree();
  UI.notify('Researching: ' + TECHS.find(t => t.id === techId).name);
}

function cancelResearch() {
  const p = Game.state.players[0];
  p.currentResearch = null;
  p.researchProgress = 0;
  UI.renderTechTree();
  UI.notify('Research cancelled.');
}

function selectCivic(civicId) {
  const p = Game.state.players[0];
  p.currentCivic = civicId;
  p.civicProgress = 0;
  UI.renderCivicsTree();
  UI.notify('Developing civic: ' + CIVICS.find(c => c.id === civicId).name);
}

function cancelCivic() {
  const p = Game.state.players[0];
  p.currentCivic = null;
  p.civicProgress = 0;
  UI.renderCivicsTree();
  UI.notify('Civic development cancelled.');
}

function adoptGovernment(govId) {
  const p = Game.state.players[0];
  const gov = GOVERNMENTS.find(g => g.id === govId);
  if (!gov) return;
  const prevGov = GOVERNMENTS.find(g => g.id === p.government) || {era:'caveman'};
  const anarchyTurns = p.government === 'chiefdom' ? 0 : Math.max(1, Math.abs(ERAS.indexOf(gov.era) - ERAS.indexOf(prevGov.era)));
  if (anarchyTurns > 0 && !confirm(`Adopting ${gov.name} will cause ${anarchyTurns} turn${anarchyTurns > 1 ? 's' : ''} of anarchy (all yields halved). Proceed?`)) return;
  Game.adoptGovernment(p, govId);
  UI.renderCivicsTree();
  if (anarchyTurns > 0) {
    UI.notify('Revolution! ' + anarchyTurns + ' turn' + (anarchyTurns > 1 ? 's' : '') + ' of anarchy as you transition to ' + gov.name + '.');
  } else {
    UI.notify('Government adopted: ' + gov.name);
  }
}

function buildInCity(cityId, type, itemId) {
  const city = Game.findCityById(cityId);
  if (!city || city.owner !== 0) return;
  // Warn if switching from an in-progress build
  if (city.buildQueue && city.buildQueue.progress > 0 && (city.buildQueue.type !== type || city.buildQueue.id !== itemId)) {
    const lost = Math.ceil(city.buildQueue.progress * 0.5);
    const kept = Math.floor(city.buildQueue.progress * 0.5);
    if (!confirm(`Switch from ${city.buildQueue.name}? You'll lose ${lost} production (${kept} will carry over to the new build).`)) return;
  }
  Game.startBuild(city, type, itemId);
  UI.showCityPanel(city);
}

function saveGameSlot(index) {
  if (SaveManager.save(index)) {
    UI.notify('Game saved to Slot ' + (index + 1));
    UI.renderSaveSlots('save');
  } else {
    UI.notify('Save failed!');
  }
}

function loadGameSlot(index) {
  const data = SaveManager.load(index);
  if (!data) {
    UI.notify('No save in this slot!');
    return;
  }

  UI.showScreen('game-screen');
  if (!Renderer.initialized) {
    Renderer.init();
  }

  Game.deserialize(data);

  const p = Game.state.players[0];
  if (p.cities.length > 0) {
    Renderer.centerOn(p.cities[0].r, p.cities[0].c);
  }

  Game.updateFogOfWar();
  Renderer.render();
  Renderer.updateMinimap();
  UI.updateTopBar();
  UI.updateRightPanel();
  if (!UI.musicPlayer) UI.initMusic();
  UI.unlockAudio();
  UI.playEraMusic(p.era);
  UI.notify('Game loaded from Slot ' + (index + 1));
}

function deleteGameSlot(index) {
  SaveManager.delete(index);
  const title = document.getElementById('save-load-title').textContent;
  UI.renderSaveSlots(title.includes('Save') ? 'save' : 'load');
}

// Keyboard shortcut handler for quick save (Ctrl+S)
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.code === 'KeyS') {
    e.preventDefault();
    if (Game.state) {
      SaveManager.save(0);
      UI.notify('Quick saved to Slot 1');
    }
  }
  if (e.ctrlKey && e.code === 'KeyL') {
    e.preventDefault();
    if (SaveManager.getSlotInfo(0)) {
      loadGameSlot(0);
    }
  }
});
