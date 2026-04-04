// Browser smoke test for Apollo's Time using Playwright
import { chromium } from 'playwright';

const URL = 'https://tileforge-game.azurewebsites.net';

(async () => {
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium-1208/chrome-linux/chrome',
  });
  const page = await browser.newPage();
  const errors = [];
  const logs = [];

  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    logs.push(text);
    if (msg.type() === 'error') console.log(`   CONSOLE: ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));

  console.log('1. Loading game...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });

  // Check title
  const title = await page.title();
  console.log(`   Title: ${title}`);
  if (!title.includes('Apollo')) {
    errors.push(`Unexpected title: ${title}`);
  }

  // Check main menu visible
  const menuVisible = await page.isVisible('#main-menu');
  console.log(`   Main menu visible: ${menuVisible}`);
  if (!menuVisible) errors.push('Main menu not visible on load');

  // Check PixiJS loaded
  const pixiLoaded = await page.evaluate(() => typeof PIXI !== 'undefined');
  console.log(`   PixiJS loaded: ${pixiLoaded}`);
  if (!pixiLoaded) errors.push('PixiJS not loaded');

  // Check game data loaded
  const dataLoaded = await page.evaluate(() => typeof TERRAINS !== 'undefined' && TERRAINS.length === 20);
  console.log(`   Game data loaded: ${dataLoaded}`);
  if (!dataLoaded) errors.push('TERRAINS not loaded or wrong count');

  const improvementsLoaded = await page.evaluate(() => typeof IMPROVEMENTS !== 'undefined' && IMPROVEMENTS.length > 0);
  console.log(`   Improvements loaded: ${improvementsLoaded} (${await page.evaluate(() => IMPROVEMENTS?.length || 0)})`);
  if (!improvementsLoaded) errors.push('IMPROVEMENTS not loaded');

  console.log('\n2. Starting new game (small map, 1 AI)...');
  await page.click('button:text("New Game")');
  await page.waitForSelector('#new-game-screen.active', { timeout: 5000 });
  await page.selectOption('#map-size', 'small');
  await page.selectOption('#ai-count', '1');
  await page.click('button:text("Start Game")');

  // Wait for game screen
  await page.waitForSelector('#game-screen.active', { timeout: 15000 });
  console.log('   Game started!');

  // Wait for rendering
  await page.waitForTimeout(3000);

  // Check game state
  const gameState = await page.evaluate(() => ({
    turn: Game.state?.turn,
    mapW: Game.state?.mapWidth,
    mapH: Game.state?.mapHeight,
    players: Game.state?.players?.length,
    cities: Game.state?.players?.[0]?.cities?.length,
    units: Game.state?.players?.[0]?.units?.length,
    rowWidths: Game.rowWidths?.slice(0, 5),
    allSameWidth: Game.rowWidths?.every(w => w === Game.state?.mapWidth),
  }));
  console.log(`   Turn: ${gameState.turn}`);
  console.log(`   Map: ${gameState.mapW}x${gameState.mapH}`);
  console.log(`   Players: ${gameState.players}`);
  console.log(`   Cities: ${gameState.cities}, Units: ${gameState.units}`);
  console.log(`   All rows same width (flat grid): ${gameState.allSameWidth}`);
  if (!gameState.allSameWidth) errors.push('Row widths not uniform — flat grid not working');

  // Check top bar
  const topBarVisible = await page.isVisible('#top-bar');
  console.log(`   Top bar visible: ${topBarVisible}`);
  
  // Check city dropdown
  const cityDropdown = await page.isVisible('#city-jump-select');
  console.log(`   City dropdown visible: ${cityDropdown}`);

  // Check minimap
  const minimapVisible = await page.isVisible('#minimap');
  console.log(`   Minimap visible: ${minimapVisible}`);

  // Check canvas (PixiJS)
  const canvasExists = await page.evaluate(() => document.querySelector('#map-container canvas') !== null);
  console.log(`   PixiJS canvas exists: ${canvasExists}`);
  if (!canvasExists) errors.push('PixiJS canvas not found');

  console.log('\n3. Testing interactions...');

  // Test end turn
  await page.click('#end-turn-btn');
  await page.waitForTimeout(1000);
  const turn2 = await page.evaluate(() => Game.state.turn);
  console.log(`   After end turn: Turn ${turn2}`);
  if (turn2 !== 2) errors.push(`Expected turn 2, got ${turn2}`);

  // Check notifications appeared (idle city/unit)
  const notifications = await page.evaluate(() => document.querySelectorAll('.notification').length);
  console.log(`   Notifications shown: ${notifications}`);

  // Test tech tree
  await page.click('button[title="Tech Tree"]');
  await page.waitForTimeout(500);
  const techVisible = await page.isVisible('#tech-panel');
  console.log(`   Tech tree opened: ${techVisible}`);
  if (techVisible) await page.click('#tech-panel .btn-close');

  // Test Book of Apollo
  await page.click('button[title="Book of Apollo"]');
  await page.waitForTimeout(500);
  const encycVisible = await page.isVisible('#encyclopedia-panel');
  console.log(`   Book of Apollo opened: ${encycVisible}`);
  if (encycVisible) await page.click('#encyclopedia-panel .btn-close');
  await page.waitForTimeout(300);
  const encycClosed = await page.isHidden('#encyclopedia-panel') || await page.evaluate(() => document.getElementById('encyclopedia-panel').classList.contains('hidden'));
  console.log(`   Book of Apollo closed: ${encycClosed}`);

  // Test save panel
  await page.click('button[title="Save Game"]');
  await page.waitForTimeout(500);
  const saveVisible = await page.isVisible('#save-load-screen');
  console.log(`   Save panel opened: ${saveVisible}`);

  // Test city dropdown jump
  const cityOptions = await page.evaluate(() => {
    const sel = document.getElementById('city-jump-select');
    return sel ? Array.from(sel.options).map(o => ({value: o.value, text: o.textContent})) : [];
  });
  console.log(`   City dropdown options: ${cityOptions.length} (including placeholder)`);

  // Check for coast tiles rendering
  const coastInfo = await page.evaluate(() => {
    let coastCount = 0, landCount = 0, oceanCount = 0;
    for (let r = 0; r < Game.state.mapHeight; r++) {
      for (let c = 0; c < Game.rowWidths[r]; c++) {
        const t = Game.mapData[r][c].terrain;
        if (t === 16) coastCount++;
        else if (t === 17) oceanCount++;
        else if (!TERRAINS[t].water) landCount++;
      }
    }
    return { coastCount, landCount, oceanCount };
  });
  console.log(`\n4. Map analysis:`);
  console.log(`   Land tiles: ${coastInfo.landCount}`);
  console.log(`   Coast tiles: ${coastInfo.coastCount}`);
  console.log(`   Ocean tiles: ${coastInfo.oceanCount}`);

  // Check fog of war
  const fogInfo = await page.evaluate(() => {
    let visible = 0, explored = 0, unexplored = 0;
    for (let r = 0; r < Game.state.mapHeight; r++) {
      for (let c = 0; c < Game.rowWidths[r]; c++) {
        const f = Game.mapData[r][c].fogState?.[0] || 0;
        if (f === 2) visible++;
        else if (f === 1) explored++;
        else unexplored++;
      }
    }
    return { visible, explored, unexplored };
  });
  console.log(`   Fog: ${fogInfo.visible} visible, ${fogInfo.explored} explored, ${fogInfo.unexplored} unexplored`);

  // Run a few turns
  console.log('\n5. Running 5 more turns...');
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => Game.endTurn());
    await page.waitForTimeout(200);
  }
  const finalTurn = await page.evaluate(() => Game.state.turn);
  console.log(`   Now on turn ${finalTurn}`);

  // Check for JS errors
  const jsErrors = logs.filter(l => l.includes('[error]'));
  
  console.log('\n========== RESULTS ==========');
  console.log(`Console errors: ${jsErrors.length}`);
  for (const e of jsErrors) console.log(`  ${e}`);
  console.log(`Page errors: ${errors.length}`);
  for (const e of errors) console.log(`  ❌ ${e}`);
  
  if (errors.length === 0 && jsErrors.length === 0) {
    console.log('\n✅ ALL TESTS PASSED');
  } else {
    console.log('\n❌ SOME ISSUES FOUND');
  }

  await browser.close();
})();
