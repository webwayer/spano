import { readFileSync } from 'node:fs';

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

    test('switches capture mode, and the comparison follows', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        // The density picker is hidden for the incumbent mode, which offers one.
        await expect(page.locator('#captureDensityField')).toBeHidden();
        // One row per capture mode per density. An exact count rather than a
        // lower bound: it is a tripwire for a strategy or a density being added
        // without anyone looking at what the table then says.
        await expect(page.locator('#comparisonBody tr')).toHaveCount(11);
        await expect(page.locator('#comparisonBody tr.current th')).toContainText('Wide strips');

        await page.selectOption('#captureStrategy', 'nodal-sweep');
        await expect(page.locator('#captureDensityField')).toBeVisible();
        await page.selectOption('#captureDensity', 'narrow');
        await page.click('#generateButton');

        // One hover point: every step reports the same altitude and position,
        // and the plan stops breaking the ceiling because it never climbs.
        await expect(page.locator('#asText li')).toHaveCount(8);
        await expect(page.locator('#asText li').first()).toContainText('50 m altitude');
        await expect(page.locator('#ceilingWarning')).toBeHidden();
        await expect(page.locator('#comparisonBody tr.current th')).toContainText('Single hover');

        // And the link carries the mode, not just the shape.
        expect(page.url()).toContain('captureStrategy=nodal-sweep');
        expect(page.url()).toContain('captureDensity=narrow');
    });

    test('exports the planned camera poses, under the production CSP', async ({ page }) => {
        // The dev server injects no CSP, so this is the only place the policy is
        // actually exercised. An object URL behind <a download> is neither a
        // fetch nor a navigation, so default-src 'none' does not govern it —
        // but that is a claim worth testing rather than reasoning about.
        const errors: string[] = [];
        page.on('console', message => {
            if (message.type() === 'error') errors.push(message.text());
        });

        await page.goto('/');
        await waitForPlan(page);

        const download = await Promise.all([page.waitForEvent('download'), page.click('#downloadImages')]).then(
            ([event]) => event
        );

        expect(download.suggestedFilename()).toBe('images.txt');

        const text = readFileSync(await download.path(), 'utf8');

        // Ten planned frames, and the caution that they are planned.
        expect(text).toContain('# Number of images: 10');
        expect(text).toContain('PLANNED poses');
        expect(text).toContain('frame_0001.jpg');

        await expect(page.locator('#posesStatus')).toContainText('10 planned frames');
        expect(errors.join('\n')).not.toContain('Content Security Policy');
    });

    test('reprojects the strips into one panorama when asked to', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        await page.selectOption('#processingMode', 'homography');
        await page.click('#generateButton3D');

        // One composited image, not ten stacked crops.
        const panorama = page.locator('#preview3D img');
        await expect(panorama).toHaveCount(1, { timeout: 30_000 });
        await expect(panorama).toHaveAttribute('alt', /resampled onto the viewer/);

        const filled = await panorama.evaluate((node: HTMLImageElement) => {
            const canvas = document.createElement('canvas');
            canvas.width = node.naturalWidth;
            canvas.height = node.naturalHeight;
            const context = canvas.getContext('2d');
            if (!context) return { width: 0, coverage: 0 };
            context.drawImage(node, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

            // Sample rows across the whole height: a gap between strips would
            // show as a band of transparent pixels, which is exactly the defect
            // the tiling property in the unit tests exists to prevent.
            let opaque = 0;
            let seen = 0;
            for (let y = 0; y < canvas.height; y += 13) {
                for (let x = 0; x < canvas.width; x += 17) {
                    seen++;
                    if ((pixels[(y * canvas.width + x) * 4 + 3] ?? 0) > 128) opaque++;
                }
            }
            return { width: canvas.width, coverage: opaque / seen };
        });

        expect(filled.width).toBeGreaterThan(0);
        expect(filled.coverage).toBeGreaterThan(0.99);
    });

    test('still stacks one crop per step in the plain mode', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        await expect(page.locator('#processingMode')).toHaveValue('crop');
        await page.click('#generateButton3D');
        await expect(page.locator('#preview3D img')).toHaveCount(10);
    });

    test('saves the finished panorama, in either processing mode', async ({ page }) => {
        // The plain mode has never produced a panorama as a file: it produces a
        // column of <img> elements that CSS stacks, and the picture existed only
        // as an arrangement in the document.
        for (const mode of ['crop', 'homography']) {
            await page.goto('/');
            await waitForPlan(page);

            await page.selectOption('#processingMode', mode);
            await expect(page.locator('#savePanorama3D')).toBeHidden();

            await page.click('#generateButton3D');
            await expect(page.locator('#savePanorama3D')).toBeVisible({ timeout: 30_000 });

            const download = await Promise.all([page.waitForEvent('download'), page.click('#savePanorama3D')]).then(
                ([event]) => event
            );

            expect(download.suggestedFilename(), mode).toBe('panorama.png');

            const bytes = readFileSync(await download.path());
            // Real PNG, not an empty file or a stray data: URL written verbatim.
            expect([...bytes.subarray(0, 4)], mode).toEqual([0x89, 0x50, 0x4e, 0x47]);
            expect(bytes.length, mode).toBeGreaterThan(10_000);

            await expect(page.locator('#planStatus')).toContainText('Saved panorama.png');
        }
    });

    test('routes the seams somewhere other than straight across', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        const capture = async (mode: string, slot: string): Promise<void> => {
            await page.selectOption('#processingMode', mode);
            await page.click('#generateButton');
            await waitForPlan(page);
            await page.click('#generateButton3D');
            await expect(page.locator('#preview3D img')).toHaveCount(1, { timeout: 30_000 });

            await page.locator('#preview3D img').evaluate((node: HTMLImageElement, key: string) => {
                const canvas = document.createElement('canvas');
                canvas.width = node.naturalWidth;
                canvas.height = node.naturalHeight;
                canvas.getContext('2d')?.drawImage(node, 0, 0);
                const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
                (window as unknown as Record<string, unknown>)[key] = data;
            }, slot);
        };

        await capture('homography', '__warped');
        await capture('seam-blend', '__blended');

        const report = await page.evaluate(() => {
            const scope = window as unknown as Record<string, ImageData | undefined>;
            const warped = scope.__warped;
            const blended = scope.__blended;
            if (!warped || warped.width !== blended?.width) return null;

            const width = warped.width;
            const rowsChanged: number[] = [];
            let holes = 0;

            for (let y = 0; y < warped.height; y++) {
                let changed = 0;
                for (let x = 0; x < width; x += 3) {
                    const i = (y * width + x) * 4;
                    if ((blended.data[i + 3] ?? 0) < 128) holes++;
                    const d =
                        Math.abs((warped.data[i] ?? 0) - (blended.data[i] ?? 0)) +
                        Math.abs((warped.data[i + 1] ?? 0) - (blended.data[i + 1] ?? 0)) +
                        Math.abs((warped.data[i + 2] ?? 0) - (blended.data[i + 2] ?? 0));
                    if (d > 8) changed++;
                }
                if (changed > width / 30) rowsChanged.push(y);
            }

            // Group the affected rows into runs: each run is one seam's
            // neighbourhood, and there should be several, not one big smear.
            let runs = 0;
            for (let i = 0; i < rowsChanged.length; i++) {
                if (i === 0 || (rowsChanged[i] ?? 0) > (rowsChanged[i - 1] ?? 0) + 4) runs++;
            }

            return { holes, affectedRows: rowsChanged.length, runs, height: warped.height };
        });

        expect(report).not.toBeNull();
        // Blending must not punch holes in the panorama.
        expect(report?.holes).toBe(0);
        // It must actually move the cut — a no-op would change nothing at all…
        expect(report?.affectedRows ?? 0).toBeGreaterThan(20);
        // …and the change must sit around the seams rather than across the
        // whole picture, which is what a broken layer assignment would look like.
        expect(report?.affectedRows ?? 0).toBeLessThan((report?.height ?? 1) / 3);
        expect(report?.runs ?? 0).toBeGreaterThan(3);
    });

    test('plans a survey grid, and refuses to pretend it is a panorama', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        await page.selectOption('#captureStrategy', 'photogrammetry');
        await page.click('#generateButton');
        await waitForPlan(page);

        // A grid, not a line: many more frames, flown straight down.
        await expect(page.locator('#asText li')).toHaveCount(112);
        await expect(page.locator('#asText li').first()).toContainText('120 m altitude');
        await expect(page.locator('#asText li').first()).toContainText('gimbal 90° down');

        // Every processing mode is off, with the reason given rather than the
        // control silently vanishing.
        await expect(page.locator('#processingMode')).toBeDisabled();
        await expect(page.locator('#processingNote')).toContainText('several frames claim the same rows');

        // And the comparison prints nothing rather than a seam figure computed
        // from frames that share no edge.
        const row = page.locator('#comparisonBody tr.current');
        await expect(row.locator('th')).toContainText('Survey grid');
        await expect(row.locator('td').nth(3)).toHaveText('—');
    });

    test('measures the disagreement at each seam and morphs across it', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        // Fine strips, because the flow has to be able to find the match: at
        // fifteen degrees between frames the ground moves further than the
        // search covers, which is why the wide mode does not offer this.
        await page.selectOption('#captureStrategy', 'fine-strips');
        await expect(page.locator('#processingMode')).toBeEnabled();
        await page.selectOption('#processingMode', 'flow-blend');
        await page.click('#generateButton');
        await waitForPlan(page);
        await expect(page.locator('#asText li')).toHaveCount(43);

        await page.click('#generateButton3D');
        await expect(page.locator('#preview3D img')).toHaveCount(1, { timeout: 60_000 });

        // The count in the message is the assertion that matters: a mode that
        // measured nothing would report zero seams and quietly be a cross-fade.
        const alt = await page.locator('#preview3D img').getAttribute('alt');
        const measured = /with (\d+) of (\d+) seams/.exec(alt ?? '');
        expect(measured).not.toBeNull();
        expect(Number(measured?.[1])).toBeGreaterThan(0);
        expect(Number(measured?.[1])).toBe(Number(measured?.[2]));
    });

    test('offers every mode on every capture that produces strips at all', async ({ page }) => {
        // Watching a mode do nothing is a finding about the flight, so access
        // is not what varies — the expectation is.
        await page.goto('/');
        await waitForPlan(page);

        for (const capture of ['arc-strips', 'fine-strips', 'dense-linear', 'nodal-sweep']) {
            await page.selectOption('#captureStrategy', capture);
            await expect(page.locator('#processingMode'), capture).toBeEnabled();

            for (const mode of ['crop', 'homography', 'seam-blend', 'depth-warp', 'flow-blend']) {
                await expect(
                    page.locator(`#processingMode option[value="${mode}"]`),
                    `${capture} / ${mode}`
                ).toBeEnabled();
            }
        }

        // The survey is the one genuine impossibility: several lines cover the
        // same ground, so several frames claim the same panorama rows.
        await page.selectOption('#captureStrategy', 'photogrammetry');
        await expect(page.locator('#processingMode')).toBeDisabled();
    });

    test('says what to expect from a mode the capture is not suited to', async ({ page }) => {
        // The reasons run in both directions, and nobody is going to guess
        // either: the morph needs a finer capture than the default, the height
        // measurement needs a coarser one.
        await page.goto('/');
        await waitForPlan(page);

        await page.selectOption('#processingMode', 'flow-blend');
        await expect(page.locator('#processingNote')).toContainText('expect little');
        await expect(page.locator('#processingNote')).toContainText('too far apart');

        await page.selectOption('#captureStrategy', 'dense-linear');
        await page.selectOption('#processingMode', 'depth-warp');
        await expect(page.locator('#processingNote')).toContainText('parallax here is too small');

        // Silent where the pair is a good one.
        await page.selectOption('#processingMode', 'flow-blend');
        await expect(page.locator('#processingNote')).toHaveText('');
    });

    test('measures how tall things are, and says what it cannot see', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        // Wide strips, which is the reverse of every other rule here: height
        // comes from the parallax between two frames, and narrowing the strips
        // exists to make that parallax small.
        await expect(page.locator('#captureStrategy')).toHaveValue('arc-strips');
        await page.selectOption('#processingMode', 'depth-warp');
        await page.click('#generateButton3D');

        await expect(page.locator('#preview3D img')).toHaveCount(1, { timeout: 60_000 });

        const status = await page.locator('#planStatus').textContent();
        const measured = /Tallest thing measured: ([\d.]+) m/.exec(status ?? '');
        expect(measured, status ?? '').not.toBeNull();

        // The synthetic scene has boxes standing 5 to 60 m above the ground, so
        // a plausible reading is metres, not centimetres and not hundreds.
        const tallest = Number(measured?.[1]);
        expect(tallest).toBeGreaterThan(1);
        expect(tallest).toBeLessThan(200);

        // And the ceiling has to be stated: a number without one invites the
        // reader to believe there was nothing taller.
        expect(status).toContain('beyond what these overlaps can see');
    });

    test('lets every processing mode be tried on the synthetic preview, without files or replanning', async ({
        page,
    }) => {
        // The workflow the synthetic preview exists for. It used to be
        // impossible twice over: the processing control lived two sections
        // further down under "Your photos", and the build button disabled
        // itself on the way in and came back only on failure — so the preview
        // could be built exactly once per plan.
        await page.goto('/');
        await waitForPlan(page);

        // The control has to be reachable from the preview it governs.
        const section = page.locator('section', { has: page.locator('#generateButton3D') });
        await expect(section.locator('#processingMode')).toBeVisible();

        await page.click('#generateButton3D');
        await expect(page.locator('#preview3D img')).toHaveCount(10, { timeout: 60_000 });
        await expect(page.locator('#generateButton3D')).toBeEnabled();

        // Switching rebuilds on its own, and each mode replaces the last rather
        // than stacking under it.
        for (const mode of ['homography', 'seam-blend', 'depth-warp']) {
            await page.selectOption('#processingMode', mode);
            await expect(page.locator('#preview3D img'), mode).toHaveCount(1, { timeout: 60_000 });
            await expect(page.locator('#savePanorama3D'), mode).toBeVisible();
            await expect(page.locator('#generateButton3D'), mode).toBeEnabled();
        }

        // Back to the stacked crop, which is a different shape of output.
        await page.selectOption('#processingMode', 'crop');
        await expect(page.locator('#preview3D img')).toHaveCount(10, { timeout: 60_000 });
    });

    test('declares the bounds the rest of the code assumes', async ({ page }) => {
        // numberFrom and decodePlan both read their limits off these attributes,
        // and tests/unit/share.test.ts mirrors them. Pinning them here is what
        // stops the mirror drifting from the markup.
        await page.goto('/');

        const expected: Record<string, [string, string, string]> = {
            offset: ['10', '200', '1'],
            firstLineLength: ['10', '200', '1'],
            curvedLineLength: ['10', '200', '1'],
            secondLineLength: ['10', '200', '1'],
            viewPointHeight: ['10', '200', '1'],
            altitudeCeiling: ['10', '500', '1'],
            objectHeight: ['0', '100', '1'],
        };

        for (const [id, [min, max, step]] of Object.entries(expected)) {
            const field = page.locator(`#${id}`);
            await expect(field, `#${id} min`).toHaveAttribute('min', min);
            await expect(field, `#${id} max`).toHaveAttribute('max', max);
            await expect(field, `#${id} step`).toHaveAttribute('step', step);
        }
    });

    test('rejects out-of-range input typed into the form, not just shared links', async ({ page }) => {
        // The form carries novalidate, so nothing but numberFrom enforces these.
        await page.goto('/');
        await waitForPlan(page);

        await page.fill('#firstLineLength', '0');
        await page.click('#generateButton');

        await expect(page.locator('#errorRegion')).toBeVisible();
        await expect(page.locator('#errorRegion')).toContainText('between 10 and 200');
    });

    test('has no detectable accessibility violations', async ({ page }) => {
        await page.goto('/');
        await waitForPlan(page);

        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

        const summary = results.violations.map(v => `${v.id} (${v.nodes.length}): ${v.help}`);
        expect(summary, summary.join('\n')).toEqual([]);
    });
});
