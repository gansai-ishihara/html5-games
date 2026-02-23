const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('Launching browser...');
    // Launching headful so the user can see it or intervene if a captcha appears
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        acceptDownloads: true
    });
    const page = await context.newPage();

    try {
        console.log('1. Navigating to Trellis Space...');
        await page.goto('https://huggingface.co/spaces/trellis-community/TRELLIS', { waitUntil: 'domcontentloaded', timeout: 90000 });

        console.log('2. Waiting for iframe to load and stabilize...');
        await page.waitForTimeout(5000); // Give frames time to load

        console.log('Finding Gradio iframe...');
        let gradioFrame = null;
        for (const f of page.frames()) {
            if (f.url().includes('v3') || f.url().includes('trellis')) {
                gradioFrame = f;
                break;
            }
        }

        if (!gradioFrame) {
            throw new Error("Could not find the Gradio iframe.");
        }

        console.log('3. Uploading image...');
        const imagePath = path.resolve('images/crystal_tex.png');

        // Wait for the upload input inside the specific frame
        await gradioFrame.waitForSelector('input[type="file"]', { state: 'attached', timeout: 90000 });
        const uploadInput = await gradioFrame.$('input[type="file"]');
        await uploadInput.setInputFiles(imagePath);

        console.log('4. Waiting for image preview...');
        await page.waitForTimeout(5000);

        console.log('5. Clicking Generate...');
        const generateBtn = await gradioFrame.$('button:has-text("Generate"), button:has-text("Run")');
        if (generateBtn) await generateBtn.click();
        else throw new Error("Could not find Generate button");

        console.log('6. Waiting for generation to complete (this takes 1-5 minutes)...');
        // Wait for the download button or link to appear
        await gradioFrame.waitForSelector('a[download], button:has-text("Download")', { state: 'visible', timeout: 600000 });
        const downloadBtn = await gradioFrame.$('a[download], button:has-text("Download")');
        console.log('Generation complete! Download button is visible.');

        console.log('7. Downloading GLB file...');
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 60000 }),
            downloadBtn.click()
        ]);

        const outputPath = path.resolve('images/crystal.glb');
        await download.saveAs(outputPath);
        console.log(`GLB saved successfully to: ${outputPath}`);

    } catch (error) {
        console.error('Error during automation:', error);
    } finally {
        console.log('Closing browser in 5 seconds...');
        await page.waitForTimeout(5000);
        await browser.close();
    }
})();
