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
        await expect(page.locator('#asText li').first()).toContainText('Step #1');
        await expect(page.locator('#asText li').first()).toContainText('50m height');

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

        await expect(page.locator('#scene3D img')).toBeVisible({ timeout: 30_000 });
        await page.click('#generateButton3D');

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
            await page.click('#generateButton');
            await page.waitForTimeout(150);
        }

        await expect(page.locator('#scene3D img')).toBeVisible({ timeout: 30_000 });
        const stillRenders = await page
            .locator('#scene3D img')
            .evaluate(img => (img as HTMLImageElement).naturalWidth > 0);
        expect(stillRenders).toBe(true);
    });

    test('explains itself when the wrong number of photos is chosen', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        let message = '';
        page.on('dialog', async d => {
            message = d.message();
            await d.dismiss();
        });

        // No photos selected at all.
        await page.click('#generateButtonReal');
        await expect.poll(() => message, { timeout: 15_000 }).toContain('photos');
    });

    // Currently failing on exactly the issues the audit recorded: unlabelled
    // number inputs, a select with no accessible name, and insufficient
    // contrast. Phase 6 rewrites the page and removes this fixme.
    test.fixme('has no detectable accessibility violations', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

        const summary = results.violations.map(v => `${v.id} (${v.nodes.length}): ${v.help}`);
        expect(summary, summary.join('\n')).toEqual([]);
    });
});
