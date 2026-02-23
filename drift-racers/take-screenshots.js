const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const screenshotDir = 'C:/Users/tsuyo/games/drift-racers/screenshots';

  console.log('Opening game...');
  await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('Waiting for #start-btn to be visible...');
  await page.waitForSelector('#start-btn', { state: 'visible', timeout: 30000 });

  console.log('Clicking START RACE...');
  await page.click('#start-btn');

  console.log('Waiting 6 seconds for models to load and countdown to finish...');
  await page.waitForTimeout(6000);

  const zones = [
    { index: 15, name: 'v93-forest' },
    { index: 35, name: 'v93-castle' },
    { index: 55, name: 'v93-lake' },
    { index: 75, name: 'v93-mountain' },
    { index: 95, name: 'v93-garden' },
  ];

  for (const zone of zones) {
    console.log(`Teleporting to trackNodes[${zone.index}] for ${zone.name}...`);
    await page.evaluate((idx) => {
      var node = trackNodes[idx];
      var nextIdx = (idx + 1) % 100;
      var angle = Math.atan2(
        trackNodes[nextIdx].z - node.z,
        trackNodes[nextIdx].x - node.x
      );
      player.x = node.x;
      player.y = node.y + 2;
      player.z = node.z;
      player.ang = angle;
      player.spd = 0;
      camera.position.x = player.x - Math.cos(angle) * 5;
      camera.position.y = player.y + 2.8;
      camera.position.z = player.z - Math.sin(angle) * 5;
      camera.setTarget(new BABYLON.Vector3(
        player.x + Math.cos(angle) * 2,
        player.y + 1.4,
        player.z + Math.sin(angle) * 2
      ));
    }, zone.index);

    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotDir}/${zone.name}.png` });
    console.log(`  Saved ${zone.name}.png`);
  }

  console.log("Taking bird's eye overview shot...");
  await page.evaluate(() => {
    camera.position.x = 0;
    camera.position.y = 400;
    camera.position.z = 0;
    camera.setTarget(new BABYLON.Vector3(0, 0, 50));
  });

  await page.waitForTimeout(500);
  await page.screenshot({ path: `${screenshotDir}/v93-overview.png` });
  console.log('  Saved v93-overview.png');

  console.log('All screenshots taken successfully!');
  await browser.close();
})();
