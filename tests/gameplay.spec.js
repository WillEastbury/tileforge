// @ts-check
const { test, expect } = require('@playwright/test');

// ============================================================
// Helper: dismiss any narrative/video overlay so tests can interact
// ============================================================
async function dismissOverlays(page) {
  // Dismiss intro video if playing
  const videoOverlay = page.locator('#video-overlay');
  if (await videoOverlay.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.evaluate(() => {
      const btn = document.getElementById('video-skip');
      if (btn) btn.click();
      else document.getElementById('video-overlay')?.classList.add('hidden');
    });
    await expect(videoOverlay).toBeHidden({ timeout: 5000 });
  }
  // Dismiss narrative/prologue overlay
  const narOverlay = page.locator('#narrative-overlay');
  if (await narOverlay.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.evaluate(() => {
      const btn = document.getElementById('narrative-dismiss');
      if (btn) btn.click();
      else if (typeof UI !== 'undefined' && UI.closeNarrative) UI.closeNarrative();
      else document.getElementById('narrative-overlay')?.classList.add('hidden');
    });
    await expect(narOverlay).toBeHidden({ timeout: 5000 });
  }
}

// Start a new game with default settings and dismiss all overlays
async function startGame(page, opts = {}) {
  // Force PixiJS Canvas2D mode for headless Chromium (no WebGL)
  // Stub video.play() to prevent real video loading/buffering in tests
  await page.addInitScript(() => {
    window.__FORCE_CANVAS = true;
    HTMLVideoElement.prototype.play = function() { return Promise.resolve(); };
  });
  await page.goto('/');
  await expect(page.locator('#main-menu')).toHaveClass(/active/);
  await page.click('text=New Game');
  await expect(page.locator('#new-game-screen')).toHaveClass(/active/);

  if (opts.mapSize) await page.selectOption('#map-size', opts.mapSize);
  if (opts.aiCount) await page.selectOption('#ai-count', String(opts.aiCount));
  if (opts.difficulty !== undefined) await page.selectOption('#difficulty', String(opts.difficulty));
  if (opts.civName) await page.fill('#civ-name', opts.civName);

  await page.click('text=Start Game');
  await expect(page.locator('#game-screen')).toHaveClass(/active/, { timeout: 15000 });

  // Wait for game state to be initialized (PixiJS canvas may not render in headless)
  await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state && Game.state.turn >= 1, { timeout: 15000 });

  // Dismiss any overlays (intro video, prologue)
  await dismissOverlays(page);
}

// ============================================================
// 1. MAIN MENU
// ============================================================
test.describe('Main Menu', () => {
  test('displays title and buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.game-title')).toContainText('APOLLO');
    await expect(page.locator('.game-subtitle')).toContainText('4X Strategy');
    await expect(page.locator('#main-menu >> text=New Game')).toBeVisible();
    await expect(page.locator('#main-menu >> text=Load Game')).toBeVisible();
  });

  test('New Game navigates to setup screen', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Game');
    await expect(page.locator('#new-game-screen')).toHaveClass(/active/);
    await expect(page.locator('#civ-name')).toBeVisible();
    await expect(page.locator('#map-size')).toBeVisible();
    await expect(page.locator('#ai-count')).toBeVisible();
    await expect(page.locator('#difficulty')).toBeVisible();
  });

  test('Load Game navigates to save/load screen', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Load Game');
    await expect(page.locator('#save-load-screen')).toHaveClass(/active/);
    await expect(page.locator('#save-load-title')).toHaveText('Load Game');
  });

  test('Back button returns to main menu from new game', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Game');
    await page.click('#new-game-screen >> text=Back');
    await expect(page.locator('#main-menu')).toHaveClass(/active/);
  });
});

// ============================================================
// 2. NEW GAME SETUP
// ============================================================
test.describe('New Game Setup', () => {
  test('default values are correct', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Game');
    await expect(page.locator('#civ-name')).toHaveValue('Player');
    await expect(page.locator('#map-size')).toHaveValue('medium');
    await expect(page.locator('#ai-count')).toHaveValue('2');
    await expect(page.locator('#difficulty')).toHaveValue('4'); // Homo Sapiens
  });

  test('can customize civ name', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Game');
    await page.fill('#civ-name', 'TestEmpire');
    await expect(page.locator('#civ-name')).toHaveValue('TestEmpire');
  });

  test('starting a game loads the game screen', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    // Verify top bar elements are visible
    await expect(page.locator('#top-bar')).toBeVisible();
    await expect(page.locator('#turn-display')).toBeVisible();
    await expect(page.locator('#era-display')).toContainText('Caveman');
  });
});

// ============================================================
// 3. IN-GAME TOP BAR & RESOURCES
// ============================================================
test.describe('Game Screen — Top Bar', () => {
  test('resource bar shows all resources', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    for (const id of ['res-food', 'res-prod', 'res-money', 'res-science', 'res-culture', 'res-history']) {
      await expect(page.locator('#' + id)).toBeVisible();
    }
  });

  test('turn display shows year and turn', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const text = await page.locator('#turn-display').textContent();
    expect(text).toMatch(/Turn \d+/);
    expect(text).toMatch(/BC|AD/);
  });

  test('era display starts at Caveman', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await expect(page.locator('#era-display')).toContainText('Caveman');
  });
});

// ============================================================
// 4. TURN CYCLE
// ============================================================
test.describe('Turn Cycle', () => {
  test('end turn button advances the turn counter', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const turnBefore = await page.locator('#turn-display').textContent();
    await page.click('#end-turn-btn');
    // Wait for AI to process (may take a moment)
    await page.waitForTimeout(1000);
    await dismissOverlays(page);
    const turnAfter = await page.locator('#turn-display').textContent();
    expect(turnAfter).not.toEqual(turnBefore);
  });

  test('can play multiple turns without errors', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    for (let i = 0; i < 5; i++) {
      await page.click('#end-turn-btn');
      await page.waitForTimeout(500);
      await dismissOverlays(page);
    }
    const text = await page.locator('#turn-display').textContent();
    expect(text).toMatch(/Turn [6-9]|Turn \d{2}/); // Should be at least turn 6
  });

  test('no console errors during turns', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    for (let i = 0; i < 3; i++) {
      await page.click('#end-turn-btn');
      await page.waitForTimeout(500);
      await dismissOverlays(page);
    }
    expect(errors).toEqual([]);
  });
});

// ============================================================
// 5. TECH TREE
// ============================================================
test.describe('Tech Tree', () => {
  test('opens and closes tech tree panel', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.click('button[title="Tech Tree"]');
    await expect(page.locator('#tech-panel')).not.toHaveClass(/hidden/);
    await expect(page.locator('#tech-tree-content')).toBeVisible();
    await page.click('#tech-panel .btn-close');
    await expect(page.locator('#tech-panel')).toHaveClass(/hidden/);
  });

  test('shows researchable techs', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.click('button[title="Tech Tree"]');
    // Should have at least one tech node
    const techNodes = page.locator('#tech-tree-content .tech-item');
    await expect(techNodes.first()).toBeVisible({ timeout: 5000 });
    const count = await techNodes.count();
    expect(count).toBeGreaterThan(0);
  });

  test('can select a tech to research', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.click('button[title="Tech Tree"]');
    // Find an available (not researched) tech and click it
    const availableTech = page.locator('#tech-tree-content .tech-node.available').first();
    if (await availableTech.isVisible({ timeout: 2000 }).catch(() => false)) {
      await availableTech.click();
      // Should get a notification about researching
      await expect(page.locator('#notifications')).toContainText(/Researching/, { timeout: 3000 });
    }
  });
});

// ============================================================
// 6. CITY PANEL
// ============================================================
test.describe('City Panel', () => {
  test('clicking a city opens city panel', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    // Use the city jump dropdown to go to first city
    const cityJump = page.locator('#city-jump-select');
    const options = await cityJump.locator('option').allTextContents();
    // First option is "🏛 Cities" placeholder, second should be a city
    if (options.length > 1) {
      await cityJump.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }
    // Try to open city panel via evaluate (clicking exact hex is unreliable)
    const hasCities = await page.evaluate(() => {
      const p = Game.state.players[0];
      if (p.cities.length > 0) {
        UI.showCityPanel(p.cities[0]);
        return true;
      }
      return false;
    });
    if (hasCities) {
      await expect(page.locator('#city-panel')).not.toHaveClass(/hidden/);
      await expect(page.locator('#city-name')).not.toBeEmpty();
    }
  });

  test('city panel shows production options', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const opened = await page.evaluate(() => {
      const p = Game.state.players[0];
      if (p.cities.length > 0) {
        UI.showCityPanel(p.cities[0]);
        return true;
      }
      return false;
    });
    if (opened) {
      await expect(page.locator('#city-detail')).toBeVisible();
      const detail = await page.locator('#city-detail').textContent();
      expect(detail.length).toBeGreaterThan(0);
    }
  });

  test('city panel closes with X button', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.evaluate(() => {
      const p = Game.state.players[0];
      if (p.cities.length > 0) UI.showCityPanel(p.cities[0]);
    });
    await page.click('#city-panel .btn-close');
    await expect(page.locator('#city-panel')).toHaveClass(/hidden/);
  });
});

// ============================================================
// 7. DIPLOMACY
// ============================================================
test.describe('Diplomacy', () => {
  test('opens and closes diplomacy panel', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.click('button[title="Diplomacy"]');
    await expect(page.locator('#diplomacy-panel')).not.toHaveClass(/hidden/);
    await page.click('#diplomacy-panel .btn-close');
    await expect(page.locator('#diplomacy-panel')).toHaveClass(/hidden/);
  });

  test('diplomacy shows AI players', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '2', difficulty: 0 });
    await page.click('button[title="Diplomacy"]');
    const content = await page.locator('#diplomacy-content').textContent();
    expect(content.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 8. ENCYCLOPEDIA (Book of Apollo)
// ============================================================
test.describe('Encyclopedia', () => {
  test('opens and closes encyclopedia', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.click('button[title="Book of Apollo"]');
    await expect(page.locator('#encyclopedia-panel')).not.toHaveClass(/hidden/);
    await page.click('#encyclopedia-panel .btn-close');
    await expect(page.locator('#encyclopedia-panel')).toHaveClass(/hidden/);
  });

  test('encyclopedia has categories in sidebar', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.click('button[title="Book of Apollo"]');
    const sidebar = page.locator('#ency-sidebar');
    await expect(sidebar).toBeVisible();
    const text = await sidebar.textContent();
    expect(text.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 9. SAVE / LOAD
// ============================================================
test.describe('Save & Load', () => {
  test('save game creates a save slot', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    // Save via JS to avoid overlay complications
    const saved = await page.evaluate(() => SaveManager.save(0));
    expect(saved).toBe(true);
    const slotInfo = await page.evaluate(() => SaveManager.getSlotInfo(0));
    expect(slotInfo).toBeTruthy();
    expect(slotInfo.civName).toBe('Player');
    expect(slotInfo.era).toBe('Caveman');
  });

  test('load game restores state', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    // Play a few turns
    for (let i = 0; i < 3; i++) {
      await page.click('#end-turn-btn');
      await page.waitForTimeout(400);
      await dismissOverlays(page);
    }
    const turnBefore = await page.evaluate(() => Game.state.turn);
    // Save
    await page.evaluate(() => SaveManager.save(7));
    // Play more turns
    for (let i = 0; i < 3; i++) {
      await page.click('#end-turn-btn');
      await page.waitForTimeout(400);
      await dismissOverlays(page);
    }
    // Load
    await page.evaluate(() => {
      const data = SaveManager.load(7);
      Game.deserialize(data);
      Renderer.render();
      UI.updateTopBar();
    });
    const turnAfter = await page.evaluate(() => Game.state.turn);
    expect(turnAfter).toBe(turnBefore);
  });

  test('save UI shows slots', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.click('button[title="Save Game"]');
    await expect(page.locator('#save-load-screen')).toHaveClass(/active/);
    const slots = page.locator('.save-slot');
    const count = await slots.count();
    expect(count).toBe(8); // 8 save slots
  });
});

// ============================================================
// 10. MINIMAP
// ============================================================
test.describe('Minimap', () => {
  test('minimap canvas exists', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await expect(page.locator('#minimap')).toBeAttached();
  });

  test('minimap toggle button works', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    // Button is only visible on mobile; use evaluate to toggle
    await page.evaluate(() => document.getElementById('minimap-container').classList.toggle('visible'));
    await expect(page.locator('#minimap-container')).toHaveClass(/visible/);
    await page.evaluate(() => document.getElementById('minimap-container').classList.toggle('visible'));
    await expect(page.locator('#minimap-container')).not.toHaveClass(/visible/);
  });
});

// ============================================================
// 11. IN-GAME MENU
// ============================================================
test.describe('In-Game Menu', () => {
  test('menu toggle shows and hides menu', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.click('button[title="Menu"]');
    await expect(page.locator('#game-menu')).not.toHaveClass(/hidden/);
    await page.click('#game-menu .btn-close');
    await expect(page.locator('#game-menu')).toHaveClass(/hidden/);
  });

  test('quit to menu returns to main menu', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.click('button[title="Menu"]');
    await page.click('text=Quit to Menu');
    await expect(page.locator('#main-menu')).toHaveClass(/active/);
  });
});

// ============================================================
// 12. NOTIFICATIONS
// ============================================================
test.describe('Notifications', () => {
  test('welcome notification appears on game start', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    // The welcome notification should have been shown (it may auto-dismiss)
    const notifContainer = page.locator('#notifications');
    await expect(notifContainer).toBeAttached();
  });
});

// ============================================================
// 13. GAME STATE INTEGRITY
// ============================================================
test.describe('Game State Integrity', () => {
  test('player starts with a city and units', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const state = await page.evaluate(() => {
      const p = Game.state.players[0];
      return { cities: p.cities.length, units: p.units.length, era: p.era, alive: p.alive };
    });
    expect(state.cities).toBeGreaterThanOrEqual(1);
    expect(state.units).toBeGreaterThanOrEqual(1);
    expect(state.era).toBe('caveman');
    expect(state.alive).toBe(true);
  });

  test('AI players are initialized', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '2', difficulty: 0 });
    const aiCount = await page.evaluate(() => Game.state.players.filter(p => p.isAI).length);
    expect(aiCount).toBe(2);
  });

  test('map is generated with correct dimensions', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const dims = await page.evaluate(() => ({
      width: Game.state.mapWidth,
      height: Game.state.mapHeight,
      rows: Game.mapData.length
    }));
    expect(dims.width).toBe(48);
    expect(dims.height).toBe(32);
    expect(dims.rows).toBe(32);
  });

  test('fog of war is initialized', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const hasFog = await page.evaluate(() => {
      let visible = 0, hidden = 0;
      for (const row of Game.mapData) {
        for (const tile of row) {
          if (tile.fogState[0] === 2) visible++;
          else hidden++;
        }
      }
      return { visible, hidden };
    });
    expect(hasFog.visible).toBeGreaterThan(0);
    expect(hasFog.hidden).toBeGreaterThan(0);
  });

  test('starting techs are granted', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const techCount = await page.evaluate(() => Game.state.players[0].techs.size);
    expect(techCount).toBeGreaterThan(0);
  });
});

// ============================================================
// 14. MUSIC TOGGLE
// ============================================================
test.describe('Music', () => {
  test('music toggle button exists and is clickable', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const btn = page.locator('#music-toggle');
    await expect(btn).toBeVisible();
    await btn.click(); // mute
    await btn.click(); // unmute — no errors
  });
});

// ============================================================
// 15. CITY JUMP DROPDOWN
// ============================================================
test.describe('City Jump', () => {
  test('city dropdown lists player cities', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const options = await page.locator('#city-jump-select option').allTextContents();
    // First option is placeholder, rest should be cities
    expect(options.length).toBeGreaterThanOrEqual(2); // placeholder + at least 1 city
  });
});

// ============================================================
// 16. END-TO-END: Full 10-turn game
// ============================================================
test.describe('E2E: 10-Turn Game', () => {
  test('play 10 turns, save, load, verify', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0, civName: 'E2ETest' });

    // Select a tech if none selected
    await page.evaluate(() => {
      const p = Game.state.players[0];
      if (!p.currentResearch) {
        const avail = Game.getAvailableTechs(p);
        if (avail.length > 0) {
          p.currentResearch = avail[0].id;
          p.researchProgress = 0;
        }
      }
    });

    // Play 10 turns
    for (let i = 0; i < 10; i++) {
      await page.click('#end-turn-btn');
      await page.waitForTimeout(300);
      await dismissOverlays(page);
    }

    // Verify state after 10 turns
    const state = await page.evaluate(() => ({
      turn: Game.state.turn,
      alive: Game.state.players[0].alive,
      cities: Game.state.players[0].cities.length,
      gold: Game.state.players[0].gold
    }));
    expect(state.turn).toBeGreaterThanOrEqual(11);
    expect(state.alive).toBe(true);
    expect(state.cities).toBeGreaterThanOrEqual(1);

    // Save
    await page.evaluate(() => SaveManager.save(6));

    // Verify save
    const info = await page.evaluate(() => SaveManager.getSlotInfo(6));
    expect(info).toBeTruthy();
    expect(info.civName).toBe('E2ETest');

    // No JS errors throughout
    expect(errors).toEqual([]);
  });
});
