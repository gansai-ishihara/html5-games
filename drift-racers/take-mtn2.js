const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#start-btn', { state: 'visible', timeout: 30000 });
  await page.click('#start-btn');
  await page.waitForTimeout(7000);
  
  var zones = [
    { idx: 75, name: 'v92e-mountain.png' },
    { idx: 55, name: 'v92e-lake.png' },
    { idx: 95, name: 'v92e-garden.png' }
  ];
  
  for (var z of zones) {
    await page.evaluate((i) => {
      var node = trackNodes[i];
      var next = trackNodes[(i+1) % 100];
      var angle = Math.atan2(next.z - node.z, next.x - node.x);
      player.x = node.x; player.y = node.y + 2; player.z = node.z;
      player.ang = angle; player.spd = 0;
      camera.position.x = player.x - Math.cos(angle) * 5;
      camera.position.y = player.y + 2.8;
      camera.position.z = player.z - Math.sin(angle) * 5;
      camera.setTarget(new BABYLON.Vector3(
        player.x + Math.cos(angle) * 2, player.y + 1.4, player.z + Math.sin(angle) * 2
      ));
    }, z.idx);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(__dirname, 'screenshots', z.name) });
    console.log('Captured ' + z.name);
  }
  
  await browser.close();
})();
