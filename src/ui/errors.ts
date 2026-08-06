/**
 * One place that decides what the user sees when something fails.
 *
 * An in-page live region rather than window.alert: alert blocks the whole page,
 * cannot be styled, and is announced badly by screen readers. role="alert" on
 * the target element means assistive technology reads the message as soon as it
 * appears, without stealing focus.
 */
const ERROR_REGION_ID = 'errorRegion';

export function clearError(): void {
    const region = document.getElementById(ERROR_REGION_ID);
    if (region) {
        region.textContent = '';
        region.hidden = true;
    }
}

export function reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(error);

    const region = document.getElementById(ERROR_REGION_ID);
    if (region) {
        region.textContent = message;
        region.hidden = false;
        region.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    } else {
        // No region in the document — better a blocking dialog than silence.
        window.alert(message);
    }
}

/**
 * Run a handler, routing any failure to the user.
 *
 * Without this, `void handler()` silently drops rejections: an async click
 * handler that threw produced an unhandled promise rejection and no visible
 * feedback at all. An e2e test for "tell me when I pick the wrong number of
 * photos" is what caught it.
 */
export function runReporting(handler: () => void | Promise<void>): void {
    clearError();
    try {
        const result = handler();
        if (result instanceof Promise) {
            result.catch(reportError);
        }
    } catch (error) {
        reportError(error);
    }
}
