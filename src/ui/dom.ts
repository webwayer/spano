/**
 * The whole of what jQuery was doing here.
 *
 * The 2018 code used ten jQuery methods — empty, prop, val, show, hide, on,
 * off, append, prepend and click — every one of which has a one-line native
 * equivalent. Replacing it drops a runtime dependency, ~85 KB from the bundle,
 * and the 49 "jQuery is not callable" type errors that came with it.
 */

import { runReporting } from './errors';
import { NUMERIC_FIELD_IDS, parseStrictNumber, type FieldBound, type FieldBounds } from './share';

/**
 * Look up a required element, failing loudly rather than returning null.
 *
 * The cast is the point: the caller states what it expects to find, and a
 * missing element throws with the id in the message instead of surfacing as
 * "cannot read property of null" somewhere downstream.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function el<T extends HTMLElement = HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) {
        throw new Error(`Expected an element with id "${id}" in the page.`);
    }
    return found as T;
}

export function input(id: string): HTMLInputElement {
    return el<HTMLInputElement>(id);
}

export function select(id: string): HTMLSelectElement {
    return el<HTMLSelectElement>(id);
}

export function canvas(id: string): HTMLCanvasElement {
    return el<HTMLCanvasElement>(id);
}

/** Remove all children. */
export function clear(node: HTMLElement): void {
    node.replaceChildren();
}

export function show(node: HTMLElement): void {
    node.hidden = false;
}

export function hide(node: HTMLElement): void {
    node.hidden = true;
}

export function setDisabled(node: HTMLButtonElement, disabled: boolean): void {
    node.disabled = disabled;
}

/**
 * Attach a click handler bound to the lifetime of `signal`.
 *
 * The 2018 code paired every .on('click') with an .off('click') to stop
 * handlers stacking up across regenerations, which only works while nobody
 * forgets the pairing. An AbortController drops every listener registered
 * against it in one call, so forgetting is not possible.
 */
export function onClick(node: HTMLElement, signal: AbortSignal, handler: () => void | Promise<void>): void {
    node.addEventListener(
        'click',
        () => {
            runReporting(handler);
        },
        { signal }
    );
}

/** The bounds an input declares in the markup. */
export function boundsOf(id: string): FieldBound {
    const field = input(id);
    return {
        min: parseStrictNumber(field.min) ?? Number.NEGATIVE_INFINITY,
        max: parseStrictNumber(field.max) ?? Number.POSITIVE_INFINITY,
        integer: field.step === '1',
    };
}

/** Bounds for every numeric field, read from the markup. */
export function readFieldBounds(): FieldBounds {
    return Object.fromEntries(NUMERIC_FIELD_IDS.map(id => [id, boundsOf(id)]));
}

/**
 * Read a number out of a form field, enforcing the range the markup declares.
 *
 * The form carries `novalidate` — the browser's own bubbles are replaced by a
 * proper live region — so nothing else enforces `min`, `max` and `step`. Until
 * this checked them they were decorative, and out-of-range values reached parts
 * of the planner that no test covers.
 *
 * Reading the constraints off the element keeps one definition: the markup.
 *
 * With a fallback, an empty field falls back rather than failing — useful for
 * optional settings like the altitude ceiling.
 */
export function numberFrom(id: string, fallback?: number): number {
    const field = input(id);
    const raw = field.value.trim();

    if (raw === '' && fallback !== undefined) {
        return fallback;
    }

    const label = document.querySelector(`label[for="${id}"]`)?.textContent.trim() ?? id;
    const value = parseStrictNumber(raw);
    if (value === undefined) {
        throw new Error(`“${raw}” is not a number. Check the ${label} field.`);
    }

    const { min, max, integer } = boundsOf(id);
    if (value < min || value > max) {
        throw new Error(`${label} must be between ${min} and ${max}. You entered ${value}.`);
    }
    if (integer && !Number.isInteger(value)) {
        throw new Error(`${label} must be a whole number. You entered ${value}.`);
    }

    return value;
}

/** Set the text of a status or message region, showing or hiding it. */
export function setMessage(id: string, text: string): void {
    const node = el(id);
    node.textContent = text;
    node.hidden = text === '';
}
