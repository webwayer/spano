/**
 * Hand the browser a file the page generated.
 *
 * No CSP change is needed and none should be made: an object URL reached
 * through `<a download>` is not a fetch and not a navigation, so none of
 * `default-src`, `img-src` or `connect-src` govern it. The note in
 * vite.config.ts beside the policy says the same thing from the other side —
 * `blob:` was removed from `img-src` precisely because a download does not
 * need it.
 */
export function downloadText(filename: string, contents: string): void {
    downloadBlob(filename, new Blob([contents], { type: 'text/plain;charset=utf-8' }));
}

/**
 * Save a canvas result, which arrives as a `data:` URL.
 *
 * Decoded by hand rather than with `fetch(dataUrl)`. Fetching a data URL is
 * governed by `connect-src`, which this site sets to `'self'` plus two tile
 * hosts — so the tidy-looking version would fail under the production policy
 * and work in development, which is the worst way for a bug to be arranged.
 */
export function downloadDataUrl(filename: string, dataUrl: string): void {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) throw new Error('That is not a data URL.');

    const header = dataUrl.slice(0, comma);
    const payload = dataUrl.slice(comma + 1);
    const type = /:(.*?);/.exec(header)?.[1] ?? 'application/octet-stream';

    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    downloadBlob(filename, new Blob([bytes], { type }));
}

function downloadBlob(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    // Revoking synchronously cancels the download in some builds: the click is
    // queued, and the URL has to outlive the task that started it. A macrotask
    // is enough, and holding the blob for one tick costs nothing.
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 0);
}
