const { chromium } = require('playwright');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`  [PAGE ERROR] ${msg.text()}`);
    }
  });
  
  console.log('Navigating to game...');
  await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  console.log('Waiting for #start-btn...');
  await page.waitForSelector('#start-btn', { state: 'visible', timeout: 60000 });
  
  await sleep(2000);
  
  console.log('Clicking START RACE...');
  await page.click('#start-btn');
  
  console.log('Waiting 10 seconds for countdown + model loading...');
  await sleep(10000);
  
  // Pause all karts
  await page.evaluate(() => {
    if (typeof karts !== 'undefined') {
      karts.forEach(k => { k.spd = 0; });
    }
  });
  
  // Bird's eye overview using Babylon.js FreeCamera API
  console.log("Taking Bird's Eye Overview...");
  await page.evaluate(() => {
    let cx = 0, cz = 0;
    for (let i = 0; i < trackNodes.length; i++) {
      cx += trackNodes[i].x;
      cz += trackNodes[i].z;
    }
    cx /= trackNodes.length;
    cz /= trackNodes.length;
    
    // Babylon.js FreeCamera - use position and setTarget
    camera.position.x = cx;
    camera.position.y = 150;
    camera.position.z = cz - 30;
    camera.setTarget(new BABYLON.Vector3(cx, 0, cz));
  });
  
  await sleep(2000);
  
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'v91-overview.png'),
    fullPage: false,
    timeout: 60000
  });
  console.log('  Saved: v91-overview.png');
  
  console.log('Done!');
  await browser.close();
})();
