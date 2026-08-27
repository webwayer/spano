import type { CameraProfile } from '../core/camera/profiles';
import type { Curve } from '../core/curves/curve';
import { compareStrategies, type StrategyComparison } from '../core/quality/compare';
import { CAPTURE_STRATEGIES, type CaptureDensity, type CaptureStrategy } from '../core/strategy/capture';
import type { Point } from '../core/types';
import { el, setMessage } from './dom';

/**
 * Sensor height in pixels, for turning metres of seam slide into the only unit
 * that answers "will anyone notice".
 *
 * A constant rather than a form field: it is a property of the camera, and
 * CameraProfile does not carry one yet. The Mavic Pro's 12 MP sensor is
 * 4864x3648, and the figure is used only to scale a warning, so being wrong for
 * another airframe changes a number nobody acts on directly. Move it into
 * CameraProfile when a second camera arrives.
 */
const FRAME_HEIGHT_PX = 3648;

/** Two decimals, or an em dash for the things that have no number. */
function metres(value: number): string {
    if (Number.isNaN(value)) return '—';
    if (!Number.isFinite(value)) return '∞';
    return value.toFixed(value < 10 ? 2 : 1);
}

function whole(value: number): string {
    if (Number.isNaN(value)) return '—';
    if (!Number.isFinite(value)) return '∞';
    return String(Math.round(value));
}

function cell(text: string, className?: string): HTMLTableCellElement {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
}

function rowFor(row: StrategyComparison, isCurrent: boolean): HTMLTableRowElement {
    const tr = document.createElement('tr');
    if (isCurrent) {
        tr.className = 'current';
        // Marks the row the rest of the page is showing. aria-current is the
        // right tool here: it is a statement about which of several equivalent
        // rows is active, not a heading or a selection.
        tr.setAttribute('aria-current', 'true');
    }

    const label = document.createElement('th');
    label.scope = 'row';
    label.textContent = row.strategyName + (row.densityLabel === 'As planned' ? '' : ` — ${row.densityLabel}`);
    if (isCurrent) {
        // Real text, not a CSS ::after: the highlight must not be carried by
        // colour alone, and generated content is not reliably announced.
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'shown above';
        label.append(' ', badge);
    }
    tr.append(label);

    tr.append(
        cell(String(row.frameCount)),
        cell(whole(row.pathLengthMetres)),
        cell(whole(row.maxAltitudeMetres)),
        cell(metres(row.worstSlideMetres)),
        cell(whole(row.worstSlidePixels)),
        cell(row.framesOverCeiling > 0 ? String(row.framesOverCeiling) : '—', row.framesOverCeiling > 0 ? 'bad' : '')
    );

    return tr;
}

/**
 * Fill the comparison table.
 *
 * Cheap enough to run on every plan: it is arithmetic over a few hundred
 * samples with no image touched, which is why the comparison can exist before
 * any of the image pipelines do.
 */
export function renderComparison(
    curve: Curve,
    viewPoint: Point,
    camera: CameraProfile,
    altitudeCeiling: number,
    objectHeight: number,
    current: { strategy: CaptureStrategy; density: CaptureDensity }
): void {
    const rows = compareStrategies(CAPTURE_STRATEGIES, curve, viewPoint, {
        objectHeight,
        camera,
        altitudeCeiling,
        frameHeightPx: FRAME_HEIGHT_PX,
    });

    el('comparisonBody').replaceChildren(
        ...rows.map(row => rowFor(row, row.strategyId === current.strategy.id && row.densityId === current.density.id))
    );

    setMessage(
        'comparisonCaption',
        `How far a ${objectHeight} m object slides at the worst seam, against a ${String(altitudeCeiling)} m ceiling`
    );
}
