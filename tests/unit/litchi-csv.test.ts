import { describe, expect, it } from 'vitest';

import { makeLitchiMission, THREE_SHOT_BRACKET, type LitchiAction } from '../../src/core/export/litchi-csv';
import type { GeoStep } from '../../src/core/types';

const steps: GeoStep[] = [
    {
        geoPoint: { lat: 37.77068, lon: -122.393042 },
        shootingPoint: { x: 0, y: 50 },
        heading: 271,
        viewAngleToTheGround: -30,
    },
    {
        geoPoint: { lat: 37.770501, lon: -122.396027 },
        shootingPoint: { x: 120, y: 78.5 },
        heading: 91,
        viewAngleToTheGround: 8,
    },
];

const EXPECTED_COLUMNS = 8 + 15 * 2;

function rows(csv: string): string[][] {
    return csv.split('\n').map(line => line.split(','));
}

describe('makeLitchiMission', () => {
    it('emits a header plus one row per waypoint', () => {
        expect(rows(makeLitchiMission(steps, [])).length).toBe(steps.length + 1);
    });

    it('pads every row to Litchi’s fixed 15 action slots', () => {
        // A row of the wrong width silently mis-maps every field after the gap,
        // which in this context means a wrong flight plan.
        for (const actions of [[], THREE_SHOT_BRACKET] as LitchiAction[][]) {
            for (const row of rows(makeLitchiMission(steps, actions))) {
                expect(row.length).toBe(EXPECTED_COLUMNS);
            }
        }
    });

    it('puts altitude, heading and gimbal pitch in the documented columns', () => {
        const [, first] = rows(makeLitchiMission(steps, []));
        expect(first?.[0]).toBe('37.77068'); // latitude
        expect(first?.[1]).toBe('-122.393042'); // longitude
        expect(first?.[2]).toBe('50'); // altitude, from shootingPoint.y
        expect(first?.[3]).toBe('271'); // heading
        expect(first?.[6]).toBe('2'); // gimbalmode: hold a fixed angle
        expect(first?.[7]).toBe('-30'); // gimbal pitch
    });

    it('encodes wait as 0 and photo as 1, with empty slots at -1', () => {
        const [, first] = rows(makeLitchiMission(steps, [{ type: 'photo' }, { type: 'wait', param: 1500 }]));
        expect(first?.[8]).toBe('1'); // photo
        expect(first?.[9]).toBe('0'); // photo takes no param
        expect(first?.[10]).toBe('0'); // wait
        expect(first?.[11]).toBe('1500');
        expect(first?.[12]).toBe('-1'); // first empty slot
    });

    it('names every column in the header', () => {
        const [header] = rows(makeLitchiMission(steps, []));
        expect(header?.slice(0, 8)).toEqual([
            'latitude',
            'longitude',
            'altitude(m)',
            'heading(deg)',
            'curvesize(m)',
            'rotationdir',
            'gimbalmode',
            'gimbalpitchangle',
        ]);
        expect(header?.[8]).toBe('actiontype1');
        expect(header?.[EXPECTED_COLUMNS - 1]).toBe('actionparam15');
    });

    it('emits the header alone for an empty mission, with no trailing blank row', () => {
        const csv = makeLitchiMission([], []);
        expect(csv.endsWith('\n')).toBe(false);
        expect(csv.split('\n')).toHaveLength(1);
    });
});
