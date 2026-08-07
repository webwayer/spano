/**
 * Plans as URL fragments.
 *
 * The whole app is static, so there is nowhere to store a saved plan — but
 * every parameter is a small number, so the plan fits comfortably in a URL.
 * The fragment (after `#`) is deliberate: fragments are never sent to the
 * server, so a shared link leaks nothing to the host's logs.
 *
 * Lives in ui/, not core/: URLSearchParams is a web platform API, not ES2022,
 * so src/core/tsconfig.json rejects it — correctly. Encoding a plan into a URL
 * is a delivery concern, not a planning one. The functions themselves are pure
 * string transforms, unit-tested in the Node environment.
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

/** Accepted range for one numeric field, and whether it must be a whole number. */
export interface FieldBound {
    min: number;
    max: number;
    integer: boolean;
}

export type FieldBounds = Record<string, FieldBound>;

export const NUMERIC_FIELD_IDS = [
    'offset',
    'firstLineLength',
    'curvedLineLength',
    'secondLineLength',
    'viewPointHeight',
    'altitudeCeiling',
] as const;

const TEXT_FIELD_IDS = ['curveType', 'cameraProfile'] as const;

export function encodePlan(planParams: SharedPlan): string {
    const params = new URLSearchParams();
    for (const key of TEXT_FIELD_IDS) {
        params.set(key, planParams[key]);
    }
    for (const key of NUMERIC_FIELD_IDS) {
        params.set(key, String(planParams[key]));
    }
    return params.toString();
}

/**
 * Read a plan back out of a fragment.
 *
 * Returns a partial: a link may predate a field, and a hostile link may contain
 * anything at all.
 *
 * `bounds` comes from the form itself, so a link can never carry a value the
 * user could not have typed. Hard-coding a separate range here is what let an
 * earlier version accept values fifty times wider than the inputs allow, which
 * reached parts of the planner nothing had ever exercised.
 */
export function decodePlan(fragment: string, bounds: FieldBounds): Partial<SharedPlan> {
    const params = new URLSearchParams(fragment.startsWith('#') ? fragment.slice(1) : fragment);
    const out: Partial<SharedPlan> = {};

    for (const key of TEXT_FIELD_IDS) {
        const value = params.get(key);
        // Bounded length, and identifier characters only. This reaches a
        // <select> value and an id comparison, never innerHTML, but keep it
        // tight regardless.
        if (value !== null && value.length > 0 && value.length <= 64 && /^[\w.-]+$/.test(value)) {
            out[key] = value;
        }
    }

    for (const key of NUMERIC_FIELD_IDS) {
        const raw = params.get(key);
        const bound = bounds[key];
        if (raw === null || bound === undefined) continue;

        const value = parseStrictNumber(raw);
        if (value === undefined) continue;
        if (value < bound.min || value > bound.max) continue;
        if (bound.integer && !Number.isInteger(value)) continue;

        out[key] = value;
    }

    return out;
}

/**
 * HTML's "valid floating-point number" grammar: optional sign, digits, optional
 * fraction, optional exponent. Nothing else.
 */
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Parse a number the way a number field means it.
 *
 * Stricter than both alternatives in the standard library. `parseFloat('50abc')`
 * is 50, silently discarding the rest; `Number('0x32')` is 50, accepting a
 * notation no `<input type="number">` ever produces. Both are wrong for reading
 * a form value or an untrusted URL parameter.
 */
export function parseStrictNumber(raw: string): number | undefined {
    const trimmed = raw.trim();
    if (!DECIMAL.test(trimmed)) return undefined;

    const value = Number(trimmed);
    return Number.isFinite(value) ? value : undefined;
}
