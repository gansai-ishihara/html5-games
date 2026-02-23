const { chromium } = require('playwright');
const path = require('path');

(async () => {
    // Launch headless so it runs completely in the background without bothering the user
    // (We can use headless: true now that we are bypassing the iframe mess)
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    try {
        console.log('1. Navigating directly to the Gradio App (bypassing Hugging Face iframe)...');
        // Going straight to the internal space URL
        await page.goto('https://trellis-community-trellis.hf.space/', { waitUntil: 'domcontentloaded', timeout: 90000 });

        console.log('2. Waiting for upload input...');
        const uploadInput = page.locator('input[type="file"]').first();
        await uploadInput.waitFor({ state: 'attached', timeout: 60000 });

        console.log('3. Uploading image...');
        const imagePath = path.resolve('images/crystal_tex.png');
        await uploadInput.setInputFiles(imagePath);

        console.log('4. Waiting for image to register...');
        await page.waitForTimeout(5000);

        console.log('5. Clicking Generate...');
        const generateBtn = page.getByRole('button', { name: /generate|run/i }).filter({ hasText: 'Extract GLB' }).first().or(
            page.locator('button:has-text("Generate"), button:has-text("Run")').first()
        );
        await generateBtn.waitFor({ state: 'visible', timeout: 15000 });
        await generateBtn.click();

        console.log('6. Waiting for 3D generation to complete (this takes 1-5 minutes, GPU quota permitting)...');
        // Wait for a download button or link
        const downloadBtn = page.locator('a[download], button:has-text("Download")').first();

        // Wait up to 15 minutes for the generation queue
        await downloadBtn.waitFor({ state: 'visible', timeout: 900000 });
        console.log('Generation complete! Download button is visible.');

        console.log('7. Downloading GLB file...');
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 60000 }),
            downloadBtn.click()
        ]);

        const outputPath = path.resolve('images/crystal.glb');
        await download.saveAs(outputPath);
        console.log(`[SUCCESS] GLB completely saved to: ${outputPath}`);

    } catch (error) {
        console.error('[ERROR] Automation failed:', error);
    } finally {
        await browser.close();
    }
})();
