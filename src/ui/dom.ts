/**
 * The whole of what jQuery was doing here.
 *
 * The 2018 code used ten jQuery methods — empty, prop, val, show, hide, on,
 * off, append, prepend and click — every one of which has a one-line native
 * equivalent. Replacing it drops a runtime dependency, ~85 KB from the bundle,
 * and the 49 "jQuery is not callable" type errors that came with it.
 */

import { runReporting } from './errors';

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

/** Read a number out of a form field, rejecting anything that is not one. */
export function numberFrom(id: string): number {
    const raw = input(id).value;
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) {
        throw new Error(`"${raw}" is not a valid number for ${id}.`);
    }
    return value;
}
