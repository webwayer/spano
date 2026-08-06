import { clear, el } from './dom';
import type { Step } from '../core/types';

/**
 * The pilot's instructions, in order.
 *
 * Built with DOM nodes rather than an HTML string: every value here is a number
 * the app computed, but building markup by concatenation is how that stops
 * being true later.
 */
export function renderStepList(steps: Step[]): void {
    const list = el('asText');
    clear(list);

    steps.forEach((step, i) => {
        const item = document.createElement('li');

        const label = document.createElement('b');
        label.style.color = '#0c15ff';
        label.textContent = `Step #${i + 1}:`;
        item.append(label, ' Shot ');

        item.append(strong(`${step.shootingPoint.x.toFixed()}m`), ' from Start point on ');
        item.append(strong(`${step.shootingPoint.y.toFixed()}m`), ' height.');
        item.append(document.createElement('br'));

        item.append('Angle to the ground ');
        item.append(strong(`${(-1 * step.viewAngleToTheGround).toFixed()}°`), ' with active angle of view ');
        item.append(strong(`${step.angleOfView.toFixed()}°`), ' from ');
        item.append(strong(step.shotOn));

        list.append(item);
    });
}

function strong(text: string): HTMLElement {
    const node = document.createElement('b');
    node.textContent = text;
    return node;
}
