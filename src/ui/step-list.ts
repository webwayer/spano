import { clear, el, setMessage } from './dom';
import { waypointsAboveCeiling } from '../core/camera/profiles';
import type { Step } from '../core/types';

/**
 * The pilot's instructions, in order.
 *
 * Built from DOM nodes rather than an HTML string. Every value here is a number
 * the app computed, but building markup by concatenation is exactly how that
 * stops being true later.
 */
export function renderStepList(steps: Step[], altitudeCeiling: number): void {
    const list = el('asText');
    clear(list);

    const overCeiling = new Set(
        waypointsAboveCeiling(
            steps.map(s => s.shootingPoint.y),
            altitudeCeiling
        )
    );

    steps.forEach((step, i) => {
        const item = document.createElement('li');
        if (overCeiling.has(i)) {
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

        list.append(item);
    });

    setMessage('planStatus', `${steps.length} shots. Fly them in order.`);

    setMessage(
        'ceilingWarning',
        overCeiling.size === 0
            ? ''
            : `${overCeiling.size} of ${steps.length} waypoints are above the ${altitudeCeiling} m ceiling ` +
                  '(highlighted below). Check your local rules before flying this plan.'
    );
}

function strong(text: string): HTMLElement {
    const node = document.createElement('b');
    node.textContent = text;
    return node;
}
