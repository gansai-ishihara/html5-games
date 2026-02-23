const { chromium } = require('playwright');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

async function captureZone(page, idx, filename) {
  await page.evaluate((i) => {
    var node = trackNodes[i];
    var next = trackNodes[(i + 1) % 100];
    var angle = Math.atan2(next.z - node.z, next.x - node.x);
    player.x = node.x;
    player.y = node.y + 2;
    player.z = node.z;
    player.ang = angle;
    player.spd = 0;
    camera.position.x = player.x - Math.cos(angle) * 5;
    camera.position.y = player.y + 2.8;
    camera.position.z = player.z - Math.sin(angle) * 5;
    camera.setTarget(new BABYLON.Vector3(
      player.x + Math.cos(angle) * 2, player.y + 1.4, player.z + Math.sin(angle) * 2
    ));
  }, idx);
  await page.waitForTimeout(600);
  await page.screenshot({ path: filename });
  console.log(`Captured: ${filename}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  console.log('Opening http://localhost:8080 ...');
  await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded' });

  console.log('Waiting for #start-btn ...');
  await page.waitForSelector('#start-btn', { timeout: 30000 });
  await page.click('#start-btn');
  console.log('Clicked start button. Waiting 7 seconds for race to load...');

  await page.waitForTimeout(7000);

  const zones = [
    { idx: 15, file: 'v92c-forest.png' },
    { idx: 35, file: 'v92c-castle.png' },
    { idx: 55, file: 'v92c-lake.png' },
    { idx: 75, file: 'v92c-mountain.png' },
    { idx: 95, file: 'v92c-garden.png' },
  ];

  for (const zone of zones) {
    const filepath = path.join(SCREENSHOTS_DIR, zone.file);
    console.log(`Teleporting to track node ${zone.idx} ...`);
    await captureZone(page, zone.idx, filepath);
  }

  console.log('All screenshots captured. Closing browser.');
  await browser.close();
})();
