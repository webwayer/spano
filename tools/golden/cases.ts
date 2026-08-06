/**
 * Parameter grid for the golden characterisation tests.
 *
 * Values are integers within the ranges the UI's number inputs actually allow
 * (see index.html: every field is min=10 max=200), because index.ts reads them
 * with parseInt() — so integers are the only reachable states.
 */

export type CurveKind = 'simple' | 'stunning';

export interface CaseParams {
    /** ground distance under the start point that should not appear in the panorama */
    offset: number;
    /** first flat leg, normal perspective */
    firstLeg: number;
    /** radius of the curved segment */
    radius: number;
    /** second flat leg, normal perspective */
    secondLeg: number;
    /** altitude of the viewpoint (the eye the panorama is composed for) */
    viewPointY: number;
}

export interface Case {
    id: string;
    curve: CurveKind;
    params: CaseParams;
    /** why this case is in the grid — kept in the baseline so the intent survives */
    note: string;
}

interface ParamSet extends CaseParams {
    name: string;
    note: string;
}

const PARAM_SETS: ParamSet[] = [
    {
        name: 'default',
        note: "the app's own default form values",
        offset: 50, firstLeg: 50, radius: 100, secondLeg: 50, viewPointY: 50,
    },
    {
        name: 'min-all',
        note: 'every field at the form minimum (10)',
        offset: 10, firstLeg: 10, radius: 10, secondLeg: 10, viewPointY: 10,
    },
    {
        name: 'max-all',
        note: 'every field at the form maximum (200)',
        offset: 200, firstLeg: 200, radius: 200, secondLeg: 200, viewPointY: 200,
    },
    {
        name: 'tiny-radius',
        note: 'smallest arc against ordinary legs — few shots in the curved segment',
        offset: 50, firstLeg: 50, radius: 10, secondLeg: 50, viewPointY: 50,
    },
    {
        name: 'tiny-radius-long-legs',
        note: 'short arc between long flat legs',
        offset: 50, firstLeg: 200, radius: 15, secondLeg: 200, viewPointY: 50,
    },
    {
        name: 'huge-radius',
        note: 'arc dominates the curve length',
        offset: 50, firstLeg: 50, radius: 200, secondLeg: 50, viewPointY: 50,
    },
    {
        name: 'min-offset',
        note: 'viewpoint close to the start of the visible ground',
        offset: 10, firstLeg: 50, radius: 100, secondLeg: 50, viewPointY: 50,
    },
    {
        name: 'max-offset',
        note: 'large blind zone under the start point',
        offset: 200, firstLeg: 50, radius: 100, secondLeg: 50, viewPointY: 50,
    },
    {
        name: 'short-first-leg',
        note: 'arc starts almost immediately',
        offset: 50, firstLeg: 10, radius: 100, secondLeg: 50, viewPointY: 50,
    },
    {
        name: 'short-second-leg',
        note: 'curve ends shortly after the arc',
        offset: 50, firstLeg: 50, radius: 100, secondLeg: 10, viewPointY: 50,
    },
    {
        name: 'low-viewpoint',
        note: 'viewpoint at the form minimum altitude',
        offset: 50, firstLeg: 50, radius: 100, secondLeg: 50, viewPointY: 10,
    },
    {
        name: 'high-viewpoint',
        note: 'viewpoint at the form maximum altitude',
        offset: 50, firstLeg: 50, radius: 100, secondLeg: 50, viewPointY: 200,
    },
    {
        name: 'viewpoint-above-curve',
        note: 'viewpoint higher than the top of the curve — sight lines point downward',
        offset: 50, firstLeg: 50, radius: 40, secondLeg: 20, viewPointY: 200,
    },
    {
        name: 'boundary-near-integer-simple',
        note: 'radius 14 makes the simple arc length 21.99 — total length lands just under an integer',
        offset: 50, firstLeg: 50, radius: 14, secondLeg: 50, viewPointY: 50,
    },
    {
        name: 'boundary-near-integer-stunning',
        note: 'radius 17 makes the stunning arc length 40.06 — total length lands just over an integer',
        offset: 50, firstLeg: 50, radius: 17, secondLeg: 50, viewPointY: 50,
    },
    {
        name: 'asymmetric-a',
        note: 'no two fields alike, long trailing leg',
        offset: 30, firstLeg: 120, radius: 60, secondLeg: 180, viewPointY: 40,
    },
    {
        name: 'asymmetric-b',
        note: 'no two fields alike, large offset and radius',
        offset: 170, firstLeg: 20, radius: 140, secondLeg: 30, viewPointY: 90,
    },
    {
        name: 'wide-flat',
        note: 'long flat legs, moderate arc — most samples land in near-zero-error segments',
        offset: 100, firstLeg: 200, radius: 50, secondLeg: 200, viewPointY: 120,
    },
];

/** Cases whose complete intermediate state is dumped, not just the digest. */
export const FULL_DUMP_IDS = new Set([
    'simple/default',
    'stunning/default',
    'simple/tiny-radius',
]);

export const CASES: Case[] = PARAM_SETS.flatMap((set): Case[] =>
    (['simple', 'stunning'] as CurveKind[]).map(curve => ({
        id: `${curve}/${set.name}`,
        curve,
        note: set.note,
        params: {
            offset: set.offset,
            firstLeg: set.firstLeg,
            radius: set.radius,
            secondLeg: set.secondLeg,
            viewPointY: set.viewPointY,
        },
    }))
);
