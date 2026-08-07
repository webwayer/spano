import { clear, el, setMessage } from './dom';
import { stepsExceedingFieldOfView, waypointsAboveCeiling, type CameraProfile } from '../core/camera/profiles';
import type { Step } from '../core/types';

/**
 * The pilot's instructions, in order.
 *
 * Built from DOM nodes rather than an HTML string. Every value here is a number
 * the app computed, but building markup by concatenation is exactly how that
 * stops being true later.
 */
export function renderStepList(steps: Step[], camera: CameraProfile, altitudeCeiling: number): void {
    const list = el('asText');
    clear(list);

    const overCeiling = new Set(
        waypointsAboveCeiling(
            steps.map(s => s.shootingPoint.y),
            altitudeCeiling
        )
    );
    const overFov = new Set(
        stepsExceedingFieldOfView(
            steps.map(s => s.angleOfView),
            camera
        )
    );

    steps.forEach((step, i) => {
        const item = document.createElement('li');
        if (overCeiling.has(i) || overFov.has(i)) {
            item.classList.add('over-ceiling');
        }

        const heading = document.createElement('b');
        heading.className = 'step-number';
        heading.textContent = `Step ${i + 1}`;

        item.append(
            heading,
            document.createElement('br'),
            'Hover ',
            strong(`${step.shootingPoint.x.toFixed()} m`),
            ' from the start point, at ',
            strong(`${step.shootingPoint.y.toFixed()} m`),
            ' altitude.',
            document.createElement('br'),
            'Point the gimbal ',
            // The model stores pitch relative to horizontal with negative
            // meaning downward; pilots read it as "down N degrees".
            strong(`${(-1 * step.viewAngleToTheGround).toFixed()}° down`),
            '. This frame covers ',
            strong(`${step.angleOfView.toFixed(1)}°`),
            ` of ground, anchored on the ${step.shotOn} of its range.`
        );

        if (step.backwards) {
            item.append(' ', strong('Turn and face back toward the start point.'));
        }

        if (overCeiling.has(i)) {
            item.append(' ', strong(`Above the ${altitudeCeiling} m ceiling.`));
        }

        if (overFov.has(i)) {
            item.append(
                ' ',
                strong(`Wider than the ${camera.name} can see in one frame (${camera.vFov}°) — not capturable.`)
            );
        }

        list.append(item);
    });

    setMessage('planStatus', `${steps.length} shots. Fly them in order.`);

    const warnings: string[] = [];
    if (overCeiling.size > 0) {
        warnings.push(
            `${overCeiling.size} of ${steps.length} waypoints are above the ${altitudeCeiling} m ceiling. ` +
                'Check your local rules before flying this plan.'
        );
    }
    if (overFov.size > 0) {
        warnings.push(
            `${overFov.size} of ${steps.length} frames ask for more ground than the ${camera.name} can see ` +
                `in one shot (${camera.vFov}°). Those steps cannot be captured as planned — try a larger arc ` +
                'radius or a shorter trailing leg.'
        );
    }
    setMessage('ceilingWarning', warnings.length === 0 ? '' : `${warnings.join(' ')} Highlighted below.`);
}

function strong(text: string): HTMLElement {
    const node = document.createElement('b');
    node.textContent = text;
    return node;
}
