const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  console.log('Opening http://localhost:8080 ...');
  await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('Waiting for #start-btn ...');
  await page.waitForSelector('#start-btn', { timeout: 30000 });

  console.log('Clicking START RACE ...');
  await page.click('#start-btn');

  console.log('Waiting 7 seconds for models + countdown ...');
  await page.waitForTimeout(7000);

  const zones = [
    { idx: 15, name: 'v92b-forest.png' },
    { idx: 35, name: 'v92b-castle.png' },
    { idx: 55, name: 'v92b-lake.png' },
    { idx: 75, name: 'v92b-mountain.png' },
    { idx: 95, name: 'v92b-garden.png' },
  ];

  for (const zone of zones) {
    console.log(`Teleporting to trackNodes[${zone.idx}] for ${zone.name} ...`);
    await page.evaluate((idx) => {
      var node = trackNodes[idx];
      var next = trackNodes[(idx + 1) % 100];
      var angle = Math.atan2(next.z - node.z, next.x - node.x);
      player.x = node.x;
      player.y = node.y + 2;
      player.z = node.z;
      player.ang = angle;
      player.spd = 0;
      camera.position.x = player.x - Math.cos(angle) * 5;
      camera.position.y = player.y + 2.8;
      camera.position.z = player.z - Math.sin(angle) * 5;
      camera.setTarget(new BABYLON.Vector3(player.x + Math.cos(angle) * 2, player.y + 1.4, player.z + Math.sin(angle) * 2));
    }, zone.idx);

    await page.waitForTimeout(500);

    const path = `C:/Users/tsuyo/games/drift-racers/screenshots/${zone.name}`;
    await page.screenshot({ path, fullPage: false });
    console.log(`Saved: ${path}`);
  }

  await browser.close();
  console.log('Done! All screenshots saved.');
})();
