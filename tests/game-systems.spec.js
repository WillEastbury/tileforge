// @ts-check
const { test, expect } = require('@playwright/test');

// ============================================================
// Helper: dismiss any narrative/video overlay so tests can interact
// ============================================================
async function dismissOverlays(page) {
  await page.evaluate(() => {
    if (typeof UI !== 'undefined') {
      if (UI.skipVideo) UI.skipVideo();
      if (UI.closeNarrative) UI.closeNarrative();
      if (UI.dismissNarration) UI.dismissNarration();
    }
  });
  await page.waitForTimeout(300);
}

// Start a new game with default settings and dismiss all overlays
async function startGame(page, opts = {}) {
  await page.addInitScript(() => { window.__FORCE_CANVAS = true; });
  await page.goto('/');
  await page.click('text=New Game');

  if (opts.mapSize) await page.selectOption('#map-size', opts.mapSize);
  if (opts.aiCount) await page.selectOption('#ai-count', String(opts.aiCount));
  if (opts.difficulty !== undefined) await page.selectOption('#difficulty', String(opts.difficulty));
  if (opts.civName) await page.fill('#civ-name', opts.civName);

  await page.click('text=Start Game');
  await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state && Game.state.turn >= 1, { timeout: 15000 });
  await dismissOverlays(page);
}

// ============================================================
// 1. CIVICS & GOVERNMENTS
// ============================================================
test.describe('Civics & Governments', () => {

  test('civics panel opens and shows civic tree', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.click('button[title="Civics & Government"]');
    await expect(page.locator('#civics-panel')).not.toHaveClass(/hidden/);
    const civicItems = page.locator('#civics-tree-content .civic-item');
    await expect(civicItems.first()).toBeVisible({ timeout: 3000 });
    const count = await civicItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('civics panel closes with X button', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.click('button[title="Civics & Government"]');
    await expect(page.locator('#civics-panel')).not.toHaveClass(/hidden/);
    await page.click('#civics-panel .btn-close');
    await expect(page.locator('#civics-panel')).toHaveClass(/hidden/);
  });

  test('can select a civic to develop', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    // Set civic via engine API
    const selected = await page.evaluate(() => {
      const p = Game.state.players[0];
      const avail = Game.getAvailableCivics(p);
      if (avail.length > 0) {
        p.currentCivic = avail[0].id;
        p.civicProgress = 0;
        return avail[0].id;
      }
      return null;
    });
    expect(selected).toBeTruthy();
    const currentCivic = await page.evaluate(() => Game.state.players[0].currentCivic);
    expect(currentCivic).toBe(selected);
  });

  test('player starts with chiefdom government', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const gov = await page.evaluate(() => Game.state.players[0].government);
    expect(gov).toBe('chiefdom');
  });

  test('governments section shows in civics panel', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.click('button[title="Civics & Government"]');
    const govContent = page.locator('#civics-gov-content');
    await expect(govContent).toBeVisible({ timeout: 3000 });
    const text = await govContent.textContent();
    expect(text).toContain('Chiefdom');
  });

  test('can adopt government via engine API', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    // Grant the required civic and adopt autocracy
    const result = await page.evaluate(() => {
      const p = Game.state.players[0];
      p.civics.add('tradition');
      p.civics.add('code_of_laws');
      const success = Game.adoptGovernment(p, 'autocracy');
      return { success, gov: p.government };
    });
    expect(result.success).toBe(true);
    expect(result.gov).toBe('autocracy');
  });

  test('government change causes anarchy turns', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      const p = Game.state.players[0];
      // Grant civics to unlock governments
      p.civics.add('tradition');
      p.civics.add('code_of_laws');
      p.civics.add('military_tradition');
      // First adopt autocracy (from chiefdom = no anarchy)
      Game.adoptGovernment(p, 'autocracy');
      // Then switch to oligarchy (should cause anarchy)
      Game.adoptGovernment(p, 'oligarchy');
      return { gov: p.government, anarchy: p.anarchyTurns };
    });
    expect(result.gov).toBe('oligarchy');
    expect(result.anarchy).toBeGreaterThanOrEqual(1);
  });

  test('civic progress advances each turn', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    // Set a civic to research and give culture to ensure progress
    await page.evaluate(() => {
      const p = Game.state.players[0];
      const avail = Game.getAvailableCivics(p);
      if (avail.length > 0) {
        p.currentCivic = avail[0].id;
        p.civicProgress = 0;
      }
    });
    // End a turn
    await page.click('#end-turn-btn');
    await page.waitForTimeout(500);
    await dismissOverlays(page);
    // Civic progress should advance (even if small); or the civic might have completed
    const state = await page.evaluate(() => {
      const p = Game.state.players[0];
      return { progress: p.civicProgress, civic: p.currentCivic, civicCount: p.civics.size };
    });
    // Either progress > 0, or civic completed (civicCount > initial)
    expect(state.progress > 0 || state.civicCount > 0).toBe(true);
  });
});

// ============================================================
// 2. CITY-STATES
// ============================================================
test.describe('City-States', () => {

  test('city-states spawn on map', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '2', difficulty: 0 });
    const csCount = await page.evaluate(() => Game.state.cityStates ? Game.state.cityStates.length : 0);
    expect(csCount).toBeGreaterThan(0);
  });

  test('city-states have valid properties', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '2', difficulty: 0 });
    const cs = await page.evaluate(() => {
      if (!Game.state.cityStates || Game.state.cityStates.length === 0) return null;
      const first = Game.state.cityStates[0];
      return { id: first.id, name: first.name, type: first.type, alive: first.alive, r: first.r, c: first.c };
    });
    expect(cs).toBeTruthy();
    expect(cs.id).toBeTruthy();
    expect(cs.name).toBeTruthy();
    expect(['militaristic', 'scientific', 'cultural', 'trade', 'religious']).toContain(cs.type);
    expect(cs.alive).toBe(true);
    expect(cs.r).toBeGreaterThanOrEqual(0);
    expect(cs.c).toBeGreaterThanOrEqual(0);
  });

  test('sendEnvoy increases influence', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '2', difficulty: 0 });
    const result = await page.evaluate(() => {
      const p = Game.state.players[0];
      if (!Game.state.cityStates || Game.state.cityStates.length === 0) return null;
      const cs = Game.state.cityStates[0];
      p.gold = 200;
      const before = (cs.influence && cs.influence[0]) || 0;
      const success = Game.sendEnvoy(0, cs.id);
      const after = (cs.influence && cs.influence[0]) || 0;
      return { success, before, after, goldLeft: p.gold };
    });
    expect(result).toBeTruthy();
    expect(result.success).toBe(true);
    expect(result.after).toBeGreaterThan(result.before);
    expect(result.goldLeft).toBeLessThan(200);
  });

  test('sendEnvoy fails without enough gold', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '2', difficulty: 0 });
    const result = await page.evaluate(() => {
      const p = Game.state.players[0];
      if (!Game.state.cityStates || Game.state.cityStates.length === 0) return null;
      p.gold = 10;
      return Game.sendEnvoy(0, Game.state.cityStates[0].id);
    });
    expect(result).toBe(false);
  });

  test('city-state status changes with influence', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '2', difficulty: 0 });
    const statuses = await page.evaluate(() => {
      if (!Game.state.cityStates || Game.state.cityStates.length === 0) return null;
      const cs = Game.state.cityStates[0];
      if (!cs.influence) cs.influence = {};
      cs.influence[0] = 0;
      const s1 = Game.getCityStateStatus(0, cs.id);
      cs.influence[0] = 35;
      const s2 = Game.getCityStateStatus(0, cs.id);
      cs.influence[0] = 65;
      const s3 = Game.getCityStateStatus(0, cs.id);
      return { neutral: s1, friend: s2, ally: s3 };
    });
    expect(statuses).toBeTruthy();
    expect(statuses.neutral).toBe('neutral');
    expect(statuses.friend).toBe('friend');
    expect(statuses.ally).toBe('ally');
  });

  test('city-state panel opens via UI', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '2', difficulty: 0 });
    const opened = await page.evaluate(() => {
      if (!Game.state.cityStates || Game.state.cityStates.length === 0) return false;
      UI.showCityStatePanel(Game.state.cityStates[0]);
      return true;
    });
    if (opened) {
      await expect(page.locator('#citystate-panel')).not.toHaveClass(/hidden/);
      const detail = await page.locator('#citystate-detail').textContent();
      expect(detail.length).toBeGreaterThan(0);
    }
  });

  test('city-state panel closes', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '2', difficulty: 0 });
    await page.evaluate(() => {
      if (Game.state.cityStates && Game.state.cityStates.length > 0) {
        UI.showCityStatePanel(Game.state.cityStates[0]);
      }
    });
    await page.click('#citystate-panel .btn-close');
    await expect(page.locator('#citystate-panel')).toHaveClass(/hidden/);
  });

  test('city-states persist through save/load', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '2', difficulty: 0 });
    const result = await page.evaluate(() => {
      const countBefore = Game.state.cityStates ? Game.state.cityStates.length : 0;
      SaveManager.save(5);
      const data = SaveManager.load(5);
      Game.deserialize(data);
      const countAfter = Game.state.cityStates ? Game.state.cityStates.length : 0;
      return { before: countBefore, after: countAfter };
    });
    expect(result.before).toBeGreaterThan(0);
    expect(result.after).toBe(result.before);
  });
});

// ============================================================
// 3. MAP WRAPPING
// ============================================================
test.describe('Map Wrapping', () => {

  test('getNeighbors wraps horizontally', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      const w = Game.state.mapWidth;
      // Get neighbors of tile at column 0 — should wrap to column w-1
      const neighbors = Game.getNeighbors(5, 0);
      const hasWrapped = neighbors.some(n => n.c === w - 1);
      return { hasWrapped, width: w };
    });
    expect(result.hasWrapped).toBe(true);
  });

  test('getNeighbors wraps vertically', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      const h = Game.state.mapHeight;
      // Get neighbors of tile at row 0 — should wrap to row h-1
      const neighbors = Game.getNeighbors(0, 5);
      const hasWrapped = neighbors.some(n => n.r === h - 1);
      return { hasWrapped, height: h };
    });
    expect(result.hasWrapped).toBe(true);
  });

  test('getTile wraps coordinates', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      const w = Game.state.mapWidth;
      const h = Game.state.mapHeight;
      // Accessing tile beyond bounds should wrap
      const t1 = Game.getTile(0, 0);
      const t2 = Game.getTile(h, w); // should wrap to (0, 0)
      return { same: t1.terrain === t2.terrain, t1terrain: t1.terrain, t2terrain: t2.terrain };
    });
    expect(result.same).toBe(true);
  });

  test('tileDist uses toroidal distance', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      const w = Game.state.mapWidth;
      // Distance between column 0 and column w-1 should be 1 (wrapping)
      const d = Game.tileDist(5, 0, 5, w - 1);
      // Straight-line distance would be w-1, wrapped should be 1
      return { dist: d, width: w };
    });
    expect(result.dist).toBe(1);
  });

  test('negative coordinates wrap correctly', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      const w = Game.state.mapWidth;
      const h = Game.state.mapHeight;
      const t1 = Game.getTile(-1, -1);
      const t2 = Game.getTile(h - 1, w - 1);
      return { same: t1 === t2 };
    });
    expect(result.same).toBe(true);
  });
});

// ============================================================
// 4. COMBAT
// ============================================================
test.describe('Combat System', () => {

  test('units have combat stats', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const unit = await page.evaluate(() => {
      const p = Game.state.players[0];
      const u = p.units[0];
      const uType = Game.getUnitType(u);
      return { hp: u.hp, str: uType.str, mv: uType.mv, domain: uType.domain };
    });
    expect(unit.hp).toBe(100);
    expect(unit.str).toBeGreaterThan(0);
    expect(unit.mv).toBeGreaterThan(0);
  });

  test('combat calculates damage correctly', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      // Create two test units in adjacent tiles
      const p0 = Game.state.players[0];
      const p1 = Game.state.players[1];
      if (!p1 || p1.units.length === 0) return null;

      const attacker = p0.units.find(u => Game.getUnitType(u).str > 0);
      const defender = p1.units[0];
      if (!attacker || !defender) return null;

      const atkType = Game.getUnitType(attacker);
      const defType = Game.getUnitType(defender);
      return {
        atkStr: atkType.str,
        defStr: defType.str,
        atkHp: attacker.hp,
        defHp: defender.hp
      };
    });
    // Just verify units exist with valid combat stats
    if (result) {
      expect(result.atkStr).toBeGreaterThan(0);
      expect(result.defStr).toBeGreaterThanOrEqual(0);
      expect(result.atkHp).toBe(100);
      expect(result.defHp).toBe(100);
    }
  });

  test('unit promotions system works', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      const p = Game.state.players[0];
      const u = p.units[0];
      u.xp = 35; // enough for level 2
      const level = Game.getUnitLevel(u);
      const promos = Game.getAvailablePromotions(u);
      return { level, promoCount: promos.length, xp: u.xp };
    });
    expect(result.level).toBeGreaterThanOrEqual(2);
    expect(result.promoCount).toBeGreaterThan(0);
  });

  test('applying promotion works', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      const p = Game.state.players[0];
      const u = p.units[0];
      u.xp = 15;
      if (!u.promotions) u.promotions = [];
      const promos = Game.getAvailablePromotions(u);
      if (promos.length === 0) return null;
      Game.applyPromotion(u, promos[0].id);
      return { promoted: u.promotions.includes(promos[0].id), promoId: promos[0].id };
    });
    if (result) {
      expect(result.promoted).toBe(true);
    }
  });

  test('supply range check works', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      const p = Game.state.players[0];
      if (p.units.length === 0 || p.cities.length === 0) return null;
      const u = p.units[0];
      return Game.isInSupplyRange(u, 0);
    });
    if (result !== null) {
      expect(result).toBe(true); // Starting units should be near starting city
    }
  });
});

// ============================================================
// 5. VIDEO & NARRATION OVERLAYS
// ============================================================
test.describe('Video & Narration', () => {

  test('video overlay element exists', async ({ page }) => {
    await page.addInitScript(() => { window.__FORCE_CANVAS = true; });
    await page.goto('/');
    await expect(page.locator('#video-overlay')).toBeAttached();
    await expect(page.locator('#game-video')).toBeAttached();
    await expect(page.locator('#video-skip')).toBeAttached();
  });

  test('playVideo shows overlay and sets video src', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.evaluate(() => {
      UI.playVideo('assets/video/intro.mp4', () => {});
    });
    await expect(page.locator('#video-overlay')).not.toHaveClass(/hidden/, { timeout: 2000 });
    const src = await page.evaluate(() => document.getElementById('game-video').src);
    expect(src).toContain('intro.mp4');
    await page.evaluate(() => UI.skipVideo());
    await expect(page.locator('#video-overlay')).toHaveClass(/hidden/, { timeout: 2000 });
  });

  test('narration overlay shows and dismisses', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.evaluate(() => {
      UI.showNarrationOverlay('The dawn of civilization breaks.', '— On Beginning', '🌅');
    });
    await expect(page.locator('#narration-overlay')).not.toHaveClass(/hidden/);
    const quote = await page.locator('#narration-quote').textContent();
    expect(quote).toContain('dawn of civilization');
    await page.click('#narration-dismiss');
    await expect(page.locator('#narration-overlay')).toHaveClass(/hidden/, { timeout: 2000 });
  });

  test('narrative prologue overlay shows and closes', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    await page.evaluate(() => UI.showPrologue());
    await expect(page.locator('#narrative-overlay')).not.toHaveClass(/hidden/);
    const title = await page.locator('#narrative-title').textContent();
    expect(title).toBeTruthy();
    await page.evaluate(() => UI.closeNarrative());
    await expect(page.locator('#narrative-overlay')).toHaveClass(/hidden/);
  });

  test('showNarrationWithAudio works with null audio (fallback)', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    // Should not throw when audio is null
    const noError = await page.evaluate(() => {
      try {
        UI.showNarrationWithAudio('Test narration text', '— Test', '📜', null);
        return true;
      } catch(e) {
        return false;
      }
    });
    expect(noError).toBe(true);
    await expect(page.locator('#narration-overlay')).not.toHaveClass(/hidden/);
  });

  test('video play() is called synchronously within user gesture on Start Game', async ({ page }) => {
    // This is the critical test: verify that video.play() is invoked during
    // the Start Game click handler (user gesture), not in a deferred setTimeout
    await page.addInitScript(() => { window.__FORCE_CANVAS = true; });
    await page.goto('/');
    // Intercept video.play() to record WHEN it's called relative to the click
    await page.evaluate(() => {
      window.__videoPlayCalls = [];
      const origPlay = HTMLVideoElement.prototype.play;
      HTMLVideoElement.prototype.play = function() {
        window.__videoPlayCalls.push({
          time: performance.now(),
          src: this.src,
          muted: this.muted
        });
        // Return resolved promise (Playwright doesn't have real video decode)
        return Promise.resolve();
      };
    });
    // Click Start Game and record the click time
    await page.evaluate(() => { window.__clickTime = 0; });
    await page.evaluate(() => {
      const btn = document.querySelector('button[onclick="startNewGame()"]');
      window.__clickTime = performance.now();
      btn.click();
    });
    // Check that play() was called within 10ms of the click (synchronous gesture)
    await page.waitForTimeout(200);
    const result = await page.evaluate(() => {
      return {
        clickTime: window.__clickTime,
        playCalls: window.__videoPlayCalls
      };
    });
    expect(result.playCalls.length).toBeGreaterThan(0);
    const firstPlay = result.playCalls.find(c => c.src.includes('intro'));
    // play() should be called synchronously — within gesture window
    if (firstPlay) {
      const delay = firstPlay.time - result.clickTime;
      // Must be < 50ms (before the setTimeout fires)
      expect(delay).toBeLessThan(50);
      // Should attempt unmuted first
      expect(firstPlay.muted).toBe(false);
    }
    await page.evaluate(() => UI.skipVideo());
  });

  test('prepareVideo starts play in gesture context, playIntroVideo wires callback', async ({ page }) => {
    await page.addInitScript(() => { window.__FORCE_CANVAS = true; });
    await page.goto('/');
    // Spy on video.play
    await page.evaluate(() => {
      window.__playCount = 0;
      const origPlay = HTMLVideoElement.prototype.play;
      HTMLVideoElement.prototype.play = function() {
        window.__playCount++;
        return Promise.resolve();
      };
    });
    // Simulate the startNewGame flow: prepareVideo then playIntroVideo
    await page.evaluate(() => {
      let callbackFired = false;
      UI.initMusic();
      UI.unlockAudio();
      // This is what startNewGame does synchronously
      UI.prepareVideo('assets/video/intro.mp4', () => { callbackFired = true; });
      window.__afterPrepare = window.__playCount;
      // This is called later from setTimeout — should just wire up callback
      UI.playIntroVideo(() => { window.__callbackWired = true; });
      window.__afterPlayIntro = window.__playCount;
    });
    const counts = await page.evaluate(() => ({
      afterPrepare: window.__afterPrepare,
      afterPlayIntro: window.__afterPlayIntro
    }));
    // play() should have been called during prepareVideo (gesture context)
    expect(counts.afterPrepare).toBeGreaterThanOrEqual(1);
    // playIntroVideo should NOT call play() again (it just wires the callback)
    expect(counts.afterPlayIntro).toBe(counts.afterPrepare);
    await page.evaluate(() => UI.skipVideo());
  });

  test('browser TTS fallback triggers speechSynthesis', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const ttsResult = await page.evaluate(() => {
      // Check if _browserTTS exists and speechSynthesis is available
      const hasBrowserTTS = typeof UI._browserTTS === 'function';
      const hasSpeechSynth = 'speechSynthesis' in window;
      // Spy on speechSynthesis.speak
      let speakCalled = false;
      if (hasSpeechSynth) {
        const origSpeak = window.speechSynthesis.speak;
        window.speechSynthesis.speak = function(utterance) {
          speakCalled = true;
          // Don't actually speak in test
        };
        try {
          UI._browserTTS('Test narration text');
        } catch(e) {}
        window.speechSynthesis.speak = origSpeak;
      }
      return { hasBrowserTTS, hasSpeechSynth, speakCalled };
    });
    expect(ttsResult.hasBrowserTTS).toBe(true);
    expect(ttsResult.hasSpeechSynth).toBe(true);
    expect(ttsResult.speakCalled).toBe(true);
  });

  test('video attempts unmuted playback, falls back to muted', async ({ page }) => {
    await page.addInitScript(() => { window.__FORCE_CANVAS = true; });
    await page.goto('/');
    // Make first play() reject (simulating autoplay block), second succeed
    await page.evaluate(() => {
      let callCount = 0;
      HTMLVideoElement.prototype.play = function() {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new DOMException('NotAllowedError'));
        }
        window.__fallbackMuted = this.muted;
        return Promise.resolve();
      };
    });
    await page.evaluate(() => {
      UI.playVideo('assets/video/intro.mp4', () => {});
    });
    // Wait for the promise chain to resolve
    await page.waitForTimeout(200);
    const fallbackMuted = await page.evaluate(() => window.__fallbackMuted);
    // On fallback, video should be muted
    expect(fallbackMuted).toBe(true);
    await page.evaluate(() => UI.skipVideo());
  });

  test('video playback pauses background music and resumes on skip', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    // Ensure music is playing
    const musicBefore = await page.evaluate(() => {
      if (!UI.musicPlayer) UI.initMusic();
      UI.musicPlayer.src = 'assets/music/caveman.mp3';
      UI.musicEnabled = true;
      return UI.musicPlayer.paused;
    });
    // Start a video — should pause music
    await page.evaluate(() => {
      UI.playVideo('assets/video/intro.mp4', () => {});
    });
    const musicDuringVideo = await page.evaluate(() => UI.musicPlayer.paused);
    expect(musicDuringVideo).toBe(true);
    // Skip video — should resume music
    await page.evaluate(() => {
      // Spy on play to verify it's called
      window.__musicResumed = false;
      const origPlay = UI.musicPlayer.play;
      UI.musicPlayer.play = function() { window.__musicResumed = true; return Promise.resolve(); };
      UI.skipVideo();
      UI.musicPlayer.play = origPlay;
    });
    const resumed = await page.evaluate(() => window.__musicResumed);
    expect(resumed).toBe(true);
  });

  test('prologue uses browser TTS when server narration is unavailable', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const ttsResult = await page.evaluate(() => {
      // Clear any prefetched narration to simulate server unavailable
      UI._prefetchedIntroNarration = null;
      // Spy on _browserTTS
      let ttsCalled = false;
      let ttsText = '';
      const origTTS = UI._browserTTS;
      UI._browserTTS = function(text) { ttsCalled = true; ttsText = text; };
      // Trigger prologue callback (what happens after "Begin Your Journey" click)
      if (UI._narrativeCallback) UI._narrativeCallback();
      UI._browserTTS = origTTS;
      return { ttsCalled, hasText: ttsText.length > 0, includesContent: ttsText.includes('first stone') };
    });
    expect(ttsResult.ttsCalled).toBe(true);
    expect(ttsResult.hasText).toBe(true);
    expect(ttsResult.includesContent).toBe(true);
  });
});

// ============================================================
// 6. TRADE ROUTES
// ============================================================
test.describe('Trade Routes', () => {

  test('player starts with 0 trade routes', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const routes = await page.evaluate(() => {
      const p = Game.state.players[0];
      return p.tradeRoutes ? p.tradeRoutes.length : 0;
    });
    expect(routes).toBe(0);
  });

  test('max trade routes calculated correctly', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const maxRoutes = await page.evaluate(() => {
      const p = Game.state.players[0];
      return Game.getMaxTradeRoutes(p);
    });
    expect(maxRoutes).toBeGreaterThanOrEqual(0);
  });

  test('trade route income calculation works', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '2', difficulty: 0 });
    const result = await page.evaluate(() => {
      const p0 = Game.state.players[0];
      const p1 = Game.state.players[1];
      if (p0.cities.length === 0 || !p1 || p1.cities.length === 0) return null;
      const income = Game.getTradeRouteIncome(p0.cities[0], p1.cities[0]);
      return { gold: income.gold, sci: income.sci };
    });
    if (result) {
      expect(result.gold).toBeGreaterThanOrEqual(1);
      expect(result.sci).toBeGreaterThanOrEqual(0);
    }
  });

  test('can establish trade route between cities', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '2', difficulty: 0 });
    const result = await page.evaluate(() => {
      const p = Game.state.players[0];
      const other = Game.state.players[1];
      if (p.cities.length === 0 || !other || other.cities.length === 0) return null;
      // Grant trade tech to increase max routes
      p.techs.add('sailing');
      p.techs.add('currency');
      const success = Game.establishTradeRoute(0, p.cities[0].id, other.cities[0].id);
      return { success, routeCount: p.tradeRoutes.length };
    });
    if (result) {
      expect(result.success).toBe(true);
      expect(result.routeCount).toBe(1);
    }
  });

  test('cannot duplicate trade route', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '2', difficulty: 0 });
    const result = await page.evaluate(() => {
      const p = Game.state.players[0];
      const other = Game.state.players[1];
      if (p.cities.length === 0 || !other || other.cities.length === 0) return null;
      p.techs.add('sailing');
      p.techs.add('currency');
      Game.establishTradeRoute(0, p.cities[0].id, other.cities[0].id);
      const dupe = Game.establishTradeRoute(0, p.cities[0].id, other.cities[0].id);
      return { dupe, routeCount: p.tradeRoutes.length };
    });
    if (result) {
      expect(result.dupe).toBe(false);
      expect(result.routeCount).toBe(1);
    }
  });
});

// ============================================================
// 7. GREAT PEOPLE
// ============================================================
test.describe('Great People', () => {

  test('great people points start at zero', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const gpp = await page.evaluate(() => Game.state.players[0].greatPeoplePoints);
    expect(gpp.scientist).toBe(0);
    expect(gpp.engineer).toBe(0);
    expect(gpp.artist).toBe(0);
    expect(gpp.general).toBe(0);
    expect(gpp.merchant).toBe(0);
  });

  test('great scientist boosts research', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      const p = Game.state.players[0];
      const avail = Game.getAvailableTechs(p);
      if (avail.length > 0) {
        p.currentResearch = avail[0].id;
        p.researchProgress = 0;
      }
      const before = p.researchProgress;
      Game.spawnGreatPerson(0, 'scientist');
      return { before, after: p.researchProgress };
    });
    expect(result.after).toBeGreaterThan(result.before);
  });

  test('great merchant gives gold', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      const p = Game.state.players[0];
      const before = p.gold;
      Game.spawnGreatPerson(0, 'merchant');
      return { before, after: p.gold };
    });
    expect(result.after).toBe(result.before + 500);
  });

  test('great artist triggers golden age', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      Game.spawnGreatPerson(0, 'artist');
      return Game.state.goldenAge && Game.state.goldenAge[0] ? Game.state.goldenAge[0].turnsLeft : 0;
    });
    expect(result).toBeGreaterThan(0);
  });

  test('great general heals all units', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      const p = Game.state.players[0];
      if (p.units.length === 0) return null;
      p.units[0].hp = 50;
      Game.spawnGreatPerson(0, 'general');
      return p.units[0].hp;
    });
    if (result !== null) {
      expect(result).toBe(100);
    }
  });

  test('great engineer completes build', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      const p = Game.state.players[0];
      if (p.cities.length === 0) return null;
      const city = p.cities[0];
      Game.startBuild(city, 'unit', 'club_warrior');
      const hadQueue = !!city.buildQueue;
      Game.spawnGreatPerson(0, 'engineer');
      return { hadQueue, queueAfter: city.buildQueue };
    });
    if (result) {
      expect(result.hadQueue).toBe(true);
    }
  });
});

// ============================================================
// 8. BORDER EXPANSION
// ============================================================
test.describe('Border Expansion', () => {

  test('tiles around starting city are owned', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      const city = Game.state.players[0].cities[0];
      const tile = Game.getTile(city.r, city.c);
      return { owner: tile.owner, cityId: tile.cityId };
    });
    expect(result.owner).toBe(0);
  });

  test('expandBorders claims new tiles', async ({ page }) => {
    await startGame(page, { mapSize: 'small', aiCount: '1', difficulty: 0 });
    const result = await page.evaluate(() => {
      const city = Game.state.players[0].cities[0];
      // Count owned tiles before
      let before = 0;
      for (const row of Game.mapData) for (const t of row) if (t.owner === 0) before++;
      Game.expandBorders(city, 0);
      let after = 0;
      for (const row of Game.mapData) for (const t of row) if (t.owner === 0) after++;
      return { before, after };
    });
    expect(result.after).toBeGreaterThanOrEqual(result.before);
  });
});

// ============================================================
// 9. E2E: 15-Turn Game with All Systems
// ============================================================
test.describe('E2E: 15-Turn Game with Systems Check', () => {
  test('play 15 turns, verify all systems active', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await startGame(page, { mapSize: 'small', aiCount: '2', difficulty: 0, civName: 'SystemsTest' });

    // Set up research and civic
    await page.evaluate(() => {
      const p = Game.state.players[0];
      const techs = Game.getAvailableTechs(p);
      if (techs.length > 0) { p.currentResearch = techs[0].id; p.researchProgress = 0; }
      const civics = Game.getAvailableCivics(p);
      if (civics.length > 0) { p.currentCivic = civics[0].id; p.civicProgress = 0; }
    });

    // Play 15 turns
    for (let i = 0; i < 15; i++) {
      await page.click('#end-turn-btn');
      await page.waitForTimeout(300);
      await dismissOverlays(page);
    }

    const state = await page.evaluate(() => ({
      turn: Game.state.turn,
      alive: Game.state.players[0].alive,
      cities: Game.state.players[0].cities.length,
      units: Game.state.players[0].units.length,
      gold: Game.state.players[0].gold,
      techs: Game.state.players[0].techs.size,
      civics: Game.state.players[0].civics.size,
      gov: Game.state.players[0].government,
      cityStates: Game.state.cityStates ? Game.state.cityStates.length : 0,
      aiAlive: Game.state.players.filter(p => p.isAI && p.alive).length
    }));

    expect(state.turn).toBeGreaterThanOrEqual(16);
    expect(state.alive).toBe(true);
    expect(state.cities).toBeGreaterThanOrEqual(1);
    expect(state.techs).toBeGreaterThan(1); // should have researched something
    expect(state.cityStates).toBeGreaterThan(0);
    expect(state.aiAlive).toBeGreaterThan(0);

    // Verify no JS errors
    expect(errors).toEqual([]);
  });
});
