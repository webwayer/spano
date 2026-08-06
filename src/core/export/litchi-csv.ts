import type { GeoStep } from '../types';

/**
 * Litchi Mission Hub CSV.
 *
 * WARNING: these columns were correct for Litchi in 2018 and have not been
 * re-checked against the current format. A stale header silently mis-maps every
 * field after the first missing one, which in this context means a wrong flight
 * plan. Validate against a fresh Litchi export before trusting this output —
 * see Phase 7.
 */
const HEADER = [
    'latitude',
    'longitude',
    'altitude(m)',
    'heading(deg)',
    'curvesize(m)',
    'rotationdir',
    'gimbalmode',
    'gimbalpitchangle',
    ...Array.from({ length: 15 }, (_, i) => [`actiontype${i + 1}`, `actionparam${i + 1}`]).flat(),
].join(',');

/** Litchi's fixed number of action slots per waypoint. */
const ACTION_SLOTS = 15;

/** Litchi's gimbalmode value for "hold this exact pitch". */
const GIMBAL_MODE_FIXED_ANGLE = 2;

const ACTION_TYPE = {
    wait: 0,
    photo: 1,
} as const;

/** An empty action slot. */
const NO_ACTION = -1;

export interface LitchiAction {
    type: 'wait' | 'photo';
    param?: string | number;
}

export function makeLitchiMission(steps: GeoStep[], actions: LitchiAction[]): string {
    const missionSteps = steps.map(step => {
        const missionStep: (string | number)[] = [
            step.geoPoint.lat,
            step.geoPoint.lon,
            step.shootingPoint.y, // altitude
            step.heading,
            0, // curvesize
            0, // rotationdir
            GIMBAL_MODE_FIXED_ANGLE,
            step.viewAngleToTheGround, // gimbal pitch, valid range -90..30
        ];

        for (const action of actions) {
            missionStep.push(ACTION_TYPE[action.type] ?? NO_ACTION);
            // `||` not `??`, matching the 2018 behaviour exactly. Phase 3 is a
            // move, not a semantics change; they differ for '' and NaN.
            missionStep.push(action.param || 0);
        }

        const usedSlots = (missionStep.length - 8) / 2;
        for (let i = 0; i < ACTION_SLOTS - usedSlots; i++) {
            missionStep.push(NO_ACTION, 0);
        }

        return missionStep;
    });

    return HEADER + '\n' + missionSteps.map(missionStep => missionStep.join(',')).join('\n');
}

/** The action sequence the UI uses: settle, shoot, settle, shoot, settle, shoot, settle. */
export const THREE_SHOT_BRACKET: LitchiAction[] = [
    { type: 'wait', param: 1000 },
    { type: 'photo' },
    { type: 'wait', param: 1000 },
    { type: 'photo' },
    { type: 'wait', param: 1000 },
    { type: 'photo' },
    { type: 'wait', param: 1000 },
];
