/**
 * Plans as URL fragments.
 *
 * The whole app is static, so there is nowhere to store a saved plan — but
 * every parameter is a small integer, so the plan fits comfortably in a URL.
 * The fragment (after `#`) is deliberate: fragments are never sent to the
 * server, so a shared link leaks nothing to GitHub Pages' logs.
 *
 * Lives in ui/, not core/: URLSearchParams is a web platform API, not ES2022,
 * so src/core/tsconfig.json rejects it — correctly. Encoding a plan into a URL
 * is a delivery concern, not a planning one. The functions themselves are still
 * pure string transforms, unit-tested in the Node environment.
 */

export interface SharedPlan {
    curveType: string;
    offset: number;
    firstLineLength: number;
    curvedLineLength: number;
    secondLineLength: number;
    viewPointHeight: number;
    cameraProfile: string;
    altitudeCeiling: number;
}

/** Bounds a shared value must satisfy to be accepted. */
const NUMERIC_FIELDS = {
    offset: [1, 10_000],
    firstLineLength: [1, 10_000],
    curvedLineLength: [1, 10_000],
    secondLineLength: [1, 10_000],
    viewPointHeight: [1, 10_000],
    altitudeCeiling: [1, 10_000],
} as const satisfies Record<string, readonly [number, number]>;

const TEXT_FIELDS = ['curveType', 'cameraProfile'] as const;

export function encodePlan(planParams: SharedPlan): string {
    const params = new URLSearchParams();
    for (const key of TEXT_FIELDS) {
        params.set(key, planParams[key]);
    }
    for (const key of Object.keys(NUMERIC_FIELDS) as (keyof typeof NUMERIC_FIELDS)[]) {
        params.set(key, String(planParams[key]));
    }
    return params.toString();
}

/**
 * Read a plan back out of a fragment.
 *
 * Returns a partial: a link may predate a field, and a hostile link may contain
 * anything at all. Every value is range-checked, so a shared URL cannot push
 * the planner into parameters the UI would never allow.
 */
export function decodePlan(fragment: string): Partial<SharedPlan> {
    const params = new URLSearchParams(fragment.startsWith('#') ? fragment.slice(1) : fragment);
    const out: Partial<SharedPlan> = {};

    for (const key of TEXT_FIELDS) {
        const value = params.get(key);
        // Bounded length, and no control characters: this reaches a <select>
        // value and an id lookup, never innerHTML, but keep it tight anyway.
        if (value !== null && value.length > 0 && value.length <= 64 && /^[\w.-]+$/.test(value)) {
            out[key] = value;
        }
    }

    for (const [key, [min, max]] of Object.entries(NUMERIC_FIELDS) as [
        keyof typeof NUMERIC_FIELDS,
        readonly [number, number],
    ][]) {
        const raw = params.get(key);
        if (raw === null) continue;

        const value = Number.parseFloat(raw);
        if (Number.isFinite(value) && value >= min && value <= max) {
            out[key] = value;
        }
    }

    return out;
}
