const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

  await page.goto('http://localhost:8080/view-glb.html?file=models/castle.glb', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Rotate to get multiple angles
  var angles = [
    { name: 'front', alpha: -Math.PI/4, beta: Math.PI/3 },
    { name: 'side', alpha: Math.PI/3, beta: Math.PI/3 },
    { name: 'back', alpha: Math.PI, beta: Math.PI/4 },
    { name: 'top', alpha: 0, beta: 0.3 },
  ];

  for (var i = 0; i < angles.length; i++) {
    var a = angles[i];
    await page.evaluate(function(params) {
      var cam = scene.activeCamera;
      cam.alpha = params.alpha;
      cam.beta = params.beta;
    }, a);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/castle-' + a.name + '.png' });
    console.log('Saved castle-' + a.name + '.png');
  }

  await browser.close();
})();
