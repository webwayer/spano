import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The app generates a plan on load; wait for the step list to appear. */
async function waitForPlan(page: Page): Promise<void> {
    await expect(page.locator('#asText li').first()).toBeVisible({ timeout: 30_000 });
}

async function setParams(
    page: Page,
    params: { curve?: string; offset?: string; firstLeg?: string; radius?: string; secondLeg?: string; height?: string }
): Promise<void> {
    if (params.curve) await page.selectOption('#curveType', params.curve);
    if (params.offset) await page.fill('#offset', params.offset);
    if (params.firstLeg) await page.fill('#firstLineLength', params.firstLeg);
    if (params.radius) await page.fill('#curvedLineLength', params.radius);
    if (params.secondLeg) await page.fill('#secondLineLength', params.secondLeg);
    if (params.height) await page.fill('#viewPointHeight', params.height);
    await page.click('#generateButton');
}

test.describe('flight planner', () => {
    test('generates a plan on load', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto('/');
        await waitForPlan(page);

        // The default parameters have produced a ten-step plan since 2018; the
        // golden baselines pin the numbers, this pins that they reach the page.
        await expect(page.locator('#asText li')).toHaveCount(10);
        await expect(page.locator('#asText li').first()).toContainText('Step 1');
        await expect(page.locator('#asText li').first()).toContainText('50 m altitude');
        await expect(page.locator('#asText li').first()).toContainText('gimbal 36° down');

        expect(errors).toEqual([]);
    });

    test('draws both canvases', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        for (const id of ['#topCanvas', '#bottomCanvas']) {
            const drawn = await page.locator(id).evaluate((c: HTMLCanvasElement) => {
                const ctx = c.getContext('2d');
                if (!ctx) return false;
                const data = ctx.getImageData(0, 0, c.width, c.height).data;
                for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
                return false;
            });
            expect(drawn, `${id} should have pixels drawn on it`).toBe(true);
        }
    });

    test('renders the 3D preview and one cropped strip per step', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        // Nothing 3D exists until asked for — that is the lazy chunk working.
        await expect(page.locator('#scene3D img')).toHaveCount(0);

        await page.click('#generateButton3D');
        await expect(page.locator('#scene3D img')).toBeVisible({ timeout: 60_000 });
        await expect(page.locator('#preview3D img')).toHaveCount(10, { timeout: 60_000 });

        // Every strip must actually decode. A zero-height crop serialises to
        // "data:," which no <img> can load — that was a real defect in Phase 4.
        const allDecoded = await page
            .locator('#preview3D img')
            .evaluateAll(imgs => imgs.every(i => (i as HTMLImageElement).naturalWidth > 0));
        expect(allDecoded).toBe(true);
    });

    test('handles the parameters that used to crash the planner', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto('/');
        await waitForPlan(page);

        // Before Phase 4 this threw "Cannot read properties of undefined
        // (reading 'pointOnTheGround')" and produced no plan at all.
        await setParams(page, { curve: 'stunningCurve', radius: '40', secondLeg: '20', height: '200' });

        await expect(page.locator('#asText li')).toHaveCount(15, { timeout: 30_000 });
        expect(errors).toEqual([]);
    });

    test('survives repeated regeneration without losing the 3D context', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        // The 2018 code built a WebGLRenderer per click and never released it.
        // Chrome caps live contexts around 16, so this used to break the preview
        // for the rest of the session.
        for (let i = 0; i < 20; i++) {
            await page.click('#generateButton3D');
            await page.waitForTimeout(200);
            await page.click('#generateButton');
            await page.waitForTimeout(150);
        }

        await page.click('#generateButton3D');
        await expect(page.locator('#scene3D img')).toBeVisible({ timeout: 60_000 });
        const stillRenders = await page
            .locator('#scene3D img')
            .evaluate(img => (img as HTMLImageElement).naturalWidth > 0);
        expect(stillRenders).toBe(true);
    });

    test('explains itself when the wrong number of photos is chosen', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        // No photos selected at all. The message goes to an in-page live
        // region, not a blocking dialog.
        await page.click('#generateButtonReal');
        await expect(page.locator('#errorRegion')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('#errorRegion')).toContainText('photos');
    });

    test('warns when the plan exceeds the altitude ceiling', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        // The default parameters top out at 200 m against a 120 m ceiling.
        await expect(page.locator('#ceilingWarning')).toBeVisible();
        await expect(page.locator('#ceilingWarning')).toContainText('120 m ceiling');
        expect(await page.locator('.steps li.over-ceiling').count()).toBeGreaterThan(0);

        // Raise the ceiling and the warning goes away.
        await page.fill('#altitudeCeiling', '400');
        await page.click('#generateButton');
        await expect(page.locator('#ceilingWarning')).toBeHidden();
    });

    test('is usable at 320 CSS pixels without sideways scrolling', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await page.goto('/');
        await waitForPlan(page);

        const overflows = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        );
        expect(overflows, 'the page must not scroll horizontally at 320px').toBe(false);
    });

    test('puts the plan in the URL, and restores it from a shared link', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        // The fragment is deliberate: fragments are never sent to the server,
        // so a shared link leaks nothing to the host's logs.
        await expect.poll(() => page.evaluate(() => window.location.hash)).toContain('curvedLineLength=100');

        await setParams(page, { radius: '175', height: '65' });
        await expect.poll(() => page.evaluate(() => window.location.hash)).toContain('curvedLineLength=175');

        const shared = await page.evaluate(() => window.location.href);

        // A fresh visit to that link reproduces the form.
        const other = await page.context().newPage();
        await other.goto(shared);
        await expect(other.locator('#curvedLineLength')).toHaveValue('175');
        await expect(other.locator('#viewPointHeight')).toHaveValue('65');
        await other.close();
    });

    test('ignores out-of-range values in a hostile link', async ({ page }) => {
        await page.goto('/#offset=-99999&curvedLineLength=1e12&curveType=<script>');
        await waitForPlan(page);

        // Rejected values leave the defaults in place rather than reaching the
        // planner.
        await expect(page.locator('#offset')).toHaveValue('50');
        await expect(page.locator('#curvedLineLength')).toHaveValue('100');
        await expect(page.locator('#asText li')).toHaveCount(10);
    });

    test('has no detectable accessibility violations', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

        const summary = results.violations.map(v => `${v.id} (${v.nodes.length}): ${v.help}`);
        expect(summary, summary.join('\n')).toEqual([]);
    });
});
