import { select } from './dom';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'spano.theme';

function isPreference(value: string | null): value is ThemePreference {
    return value === 'system' || value === 'light' || value === 'dark';
}

/** What the viewer last chose, or "system" if they never did. */
export function storedPreference(): ThemePreference {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return isPreference(stored) ? stored : 'system';
    } catch {
        // Storage can be unavailable in private modes or with cookies blocked.
        // A theme preference is not worth failing the page over.
        return 'system';
    }
}

/**
 * Apply a preference.
 *
 * "system" removes the attribute rather than computing a value, so the page
 * falls back to the `prefers-color-scheme` media query and keeps following the
 * OS live — including when the viewer changes it while the page is open.
 */
export function applyTheme(preference: ThemePreference): void {
    if (preference === 'system') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', preference);
    }

    try {
        localStorage.setItem(STORAGE_KEY, preference);
    } catch {
        // Not persisting is a smaller problem than throwing.
    }
}

export function setupThemeSwitch(): void {
    const picker = select('theme');
    const preference = storedPreference();

    picker.value = preference;
    applyTheme(preference);

    picker.addEventListener('change', () => {
        if (isPreference(picker.value)) {
            applyTheme(picker.value);
        }
    });
}
