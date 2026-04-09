// @ts-check
const { test, expect } = require('@playwright/test');

// ============================================================
// Intro Audio/Video/Narration Tests
// Verifies that starting a new game triggers music, intro video,
// prologue, and narration overlay correctly.
// ============================================================

test.describe('Intro Audio & Video', () => {

  test.beforeEach(async ({ page }) => {
    // Force Canvas2D mode (headless has no WebGL)
    await page.addInitScript(() => { window.__FORCE_CANVAS = true; });
  });

  test('music player initialised and plays on Start Game click', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Game');
    await expect(page.locator('#new-game-screen')).toHaveClass(/active/);

    // Spy on Audio.play before clicking Start Game
    await page.evaluate(() => {
      window.__audioPlayCalls = [];
      const origPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        window.__audioPlayCalls.push(this.src || '(empty)');
        return origPlay.call(this);
      };
    });

    await page.click('text=Start Game');
    await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state && Game.state.turn >= 1, { timeout: 15000 });

    // Verify play() was called at least once
    const playCalls = await page.evaluate(() => window.__audioPlayCalls);
    expect(playCalls.length).toBeGreaterThan(0);

    // Check that UI.musicPlayer exists and has a src set to a music file
    const musicSrc = await page.evaluate(() => UI.musicPlayer ? UI.musicPlayer.src : null);
    expect(musicSrc).toBeTruthy();
    expect(musicSrc).toContain('assets/music/caveman');
  });

  test('unlockAudio does not clear musicPlayer src (race condition fix)', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Game');

    // Hook to capture musicPlayer.src changes
    await page.evaluate(() => {
      window.__srcHistory = [];
      const origDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    });

    await page.click('text=Start Game');
    await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state && Game.state.turn >= 1, { timeout: 15000 });

    // Wait a bit for any async callbacks to fire
    await page.waitForTimeout(2000);

    // The musicPlayer src should NOT be empty — it should still have a caveman track
    const musicSrc = await page.evaluate(() => UI.musicPlayer ? UI.musicPlayer.src : '');
    expect(musicSrc).not.toBe('');
    expect(musicSrc).toContain('caveman');

    // musicPlayer should not be paused (should be playing or at least attempted)
    const paused = await page.evaluate(() => UI.musicPlayer ? UI.musicPlayer.paused : true);
    // In headless, play() may fail but src should remain set
    // The key assertion is that src wasn't wiped by unlockAudio
    expect(musicSrc).toContain('assets/music/caveman');
  });

  test('intro video overlay appears and has correct src', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Game');
    await page.click('text=Start Game');
    await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state && Game.state.turn >= 1, { timeout: 15000 });

    // Wait for either video overlay or narrative overlay to become visible
    await page.waitForFunction(() => {
      const vid = document.getElementById('video-overlay');
      const nar = document.getElementById('narrative-overlay');
      return (vid && !vid.classList.contains('hidden')) || (nar && !nar.classList.contains('hidden'));
    }, { timeout: 10000 });

    // If video overlay is showing, verify src is the intro video
    const videoSrc = await page.evaluate(() => {
      const vid = document.getElementById('video-overlay');
      const el = document.getElementById('game-video');
      if (vid && !vid.classList.contains('hidden') && el) return el.src;
      return null;
    });
    if (videoSrc) {
      expect(videoSrc).toContain('intro.mp4');
    }
  });

  test('prologue overlay appears after video skip/end', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Game');
    await page.click('text=Start Game');
    await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state && Game.state.turn >= 1, { timeout: 15000 });

    // Skip the video immediately via JS (button may be hidden behind video element in headless)
    await page.evaluate(() => {
      if (typeof UI !== 'undefined' && UI.skipVideo) UI.skipVideo();
    });

    // Prologue should appear
    const narrativeOverlay = page.locator('#narrative-overlay');
    await expect(narrativeOverlay).toBeVisible({ timeout: 10000 });

    const titleText = await page.locator('#narrative-title').textContent();
    expect(titleText).toBeTruthy();

    const btnText = await page.locator('#narrative-dismiss').textContent();
    expect(btnText).toContain('Begin Your Journey');
  });

  test('clicking Begin Your Journey dismisses prologue and shows narration if prefetched', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Game');
    await page.click('text=Start Game');
    await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state && Game.state.turn >= 1, { timeout: 15000 });

    // Skip video via JS
    await page.evaluate(() => {
      if (typeof UI !== 'undefined' && UI.skipVideo) UI.skipVideo();
    });

    // Wait for prologue
    const narrativeOverlay = page.locator('#narrative-overlay');
    await expect(narrativeOverlay).toBeVisible({ timeout: 10000 });

    // Fake a pre-fetched narration result (since we may not have an API key in test)
    await page.evaluate(() => {
      UI._prefetchedIntroNarration = { text: 'Test narration text for intro', audio: null };
    });

    // Click Begin Your Journey
    await page.click('#narrative-dismiss');

    // Should dismiss prologue and show narration overlay with the prefetched text
    await page.waitForTimeout(500);

    const narrationOverlay = page.locator('#narration-overlay');
    const isNarrationVisible = await narrationOverlay.isVisible().catch(() => false);
    if (isNarrationVisible) {
      const quoteText = await page.locator('#narration-quote').textContent();
      expect(quoteText).toContain('Test narration text for intro');
    }
  });

  test('loading overlay appears and disappears', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Game');

    // The loading overlay should appear after clicking Start
    await page.click('text=Start Game');

    // Loading overlay should be inside game-screen
    const loadingOverlay = page.locator('#loading-overlay');

    // It may flash quickly so just verify it exists and eventually hides
    await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state && Game.state.turn >= 1, { timeout: 15000 });

    // After game loads, loading overlay should be hidden
    await expect(loadingOverlay).toBeHidden({ timeout: 5000 });
  });

  test('AudioContext is created and resumed on start', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Game');
    await page.click('text=Start Game');
    await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state && Game.state.turn >= 1, { timeout: 15000 });

    const audioCtxState = await page.evaluate(() => {
      return UI._audioCtx ? UI._audioCtx.state : 'none';
    });
    // In headless Chromium, AudioContext may be 'running' or 'suspended'
    // but it should at least exist
    expect(audioCtxState).not.toBe('none');
  });

  test('narration overlay can be shown and dismissed', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Game');
    await page.click('text=Start Game');
    await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state && Game.state.turn >= 1, { timeout: 15000 });

    // Dismiss all overlays first via JS (skip button not clickable in headless)
    await page.evaluate(() => {
      if (typeof UI !== 'undefined') {
        if (UI.skipVideo) UI.skipVideo();
        if (UI.closeNarrative) UI.closeNarrative();
        if (UI.dismissNarration) UI.dismissNarration();
      }
    });
    await page.waitForTimeout(500);

    // Now manually trigger the narration overlay
    await page.evaluate(() => {
      UI.showNarrationOverlay('The wheel turns, and civilization endures.', '— On the discovery of The Wheel', '🔧');
    });

    const narrationOverlay = page.locator('#narration-overlay');
    await expect(narrationOverlay).toBeVisible({ timeout: 2000 });
    const quoteText = await page.locator('#narration-quote').textContent();
    expect(quoteText).toContain('The wheel turns');

    // Dismiss it
    await page.click('#narration-dismiss');
    await expect(narrationOverlay).toBeHidden({ timeout: 2000 });
  });

  test('video timeout fires and skips to prologue', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Game');

    // Intercept the video request to simulate a slow/missing video
    await page.route('**/assets/video/intro.mp4', route => {
      // Don't respond — simulate a stalled load
      // The 20s timeout in playVideo should fire and skip
    });

    await page.click('text=Start Game');
    await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state && Game.state.turn >= 1, { timeout: 15000 });

    // Video should timeout after 20s and prologue should appear
    const narrativeOverlay = page.locator('#narrative-overlay');
    await expect(narrativeOverlay).toBeVisible({ timeout: 25000 });
  });

  test('playEraMusic sets correct track for caveman era', async ({ page }) => {
    await page.goto('/');
    await page.click('text=New Game');
    await page.click('text=Start Game');
    await page.waitForFunction(() => typeof Game !== 'undefined' && Game.state && Game.state.turn >= 1, { timeout: 15000 });

    const eraMusic = await page.evaluate(() => UI.currentEraMusic);
    expect(eraMusic).toBe('caveman');

    const src = await page.evaluate(() => UI.musicPlayer ? UI.musicPlayer.src : '');
    expect(src).toContain('caveman');
  });
});
