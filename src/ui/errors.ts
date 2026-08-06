/**
 * One place that decides what the user sees when something fails.
 *
 * Phase 6 replaces the alert with an in-page live region; keeping the decision
 * here means that is a one-file change.
 */
export function reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(error);
    window.alert(message);
}

/**
 * Run an async handler, routing any failure to the user.
 *
 * Without this, `void handler()` silently drops rejections: an async click
 * handler that threw produced an unhandled promise rejection and no visible
 * feedback at all. An e2e test for "tell me when I pick the wrong number of
 * photos" is what caught it.
 */
export function runReporting(handler: () => void | Promise<void>): void {
    try {
        const result = handler();
        if (result instanceof Promise) {
            result.catch(reportError);
        }
    } catch (error) {
        reportError(error);
    }
}
