/**
 * Turns pipeline output into the plain JSON structures we commit as baselines.
 *
 * capture.ts and verify.ts both go through here, so there is exactly one
 * definition of "what a golden record looks like" and the two cannot drift.
 */

import { getBearingBetween2GeoPoints, getGeoPointFromStartPointDistanceBearing } from '../../src/core/geo/great-circle';
import { getGeoSteps, getPointsForViewport } from '../../src/core/geo/flight-path';
import { makeLitchiMission } from '../../src/core/export/litchi-csv';
import type { LitchiAction } from '../../src/core/export/litchi-csv';
import { CASES, type Case } from './cases';
import { makeCurve, runPipeline, type PipelineResult } from './pipeline';

// ─── Sentinel encoding ────────────────────────────────────────────────────────
//
// JSON cannot represent NaN, ±Infinity or undefined: JSON.stringify turns the
// first three into null and drops the last. All four are reachable here —
// angleFromLines() calls Math.acos, which returns NaN once floating-point error
// pushes its argument outside [-1, 1] on a degenerate triangle. If the code
// currently produces NaN, that is behaviour worth pinning, not losing.

const NAN = '__NaN__';
const POS_INF = '__Infinity__';
const NEG_INF = '__-Infinity__';
const UNDEF = '__undefined__';

export function normalize(value: unknown): unknown {
    if (value === undefined) return UNDEF;
    if (typeof value === 'number') {
        if (Number.isNaN(value)) return NAN;
        if (value === Infinity) return POS_INF;
        if (value === -Infinity) return NEG_INF;
        return value;
    }
    if (Array.isArray(value)) return value.map(normalize);
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value)) {
            out[key] = normalize((value as Record<string, unknown>)[key]);
        }
        return out;
    }
    return value;
}

export function toJson(value: unknown): string {
    return JSON.stringify(normalize(value), null, 2) + '\n';
}

// ─── Digest: one compact record per case ──────────────────────────────────────

function summariseSteps(steps: any[]): unknown[] {
    return steps.map(step => ({
        shotOn: step.shotOn,
        backwards: step.backwards,
        angleOfView: step.angleOfView,
        viewAngleToTheGround: step.viewAngleToTheGround,
        shootingPoint: step.shootingPoint,
        shootedPoint: step.shootedPoint,
    }));
}

export function buildDigestEntry(testCase: Case): unknown {
    // getTotalLength() is pure curve geometry and cannot throw, so record it
    // even for cases where the planner chain blows up.
    const totalCurveLength = makeCurve(testCase.curve, testCase.params).getTotalLength();

    const head = {
        id: testCase.id,
        curve: testCase.curve,
        note: testCase.note,
        params: testCase.params,
        totalCurveLength,
    };

    let result: PipelineResult;
    try {
        result = runPipeline(testCase);
    } catch (error) {
        // A throw is behaviour too. Record it rather than aborting the run —
        // Phase 4 fixes these against a recorded baseline, not a guess.
        const err = error as Error;
        return {
            ...head,
            outcome: 'error',
            error: { name: err.name, message: err.message },
        };
    }

    return {
        ...head,
        outcome: 'ok',
        error: null,
        counts: {
            pointTriples: result.pointTriples.length,
            shootingErrors: result.shootingErrors.length,
            segments: result.segments.length,
            shots: result.shots.length,
            steps: result.steps.length,
        },
        segmentAvgErrors: result.segments.map(s => s.avgError),
        segmentTripleCounts: result.segments.map(s => s.triples.length),
        shotSummaries: result.shots.map(s => ({
            shotOn: s.shotOn,
            tripleCount: Array.isArray(s.triples) ? s.triples.length : null,
        })),
        steps: summariseSteps(result.steps),
    };
}

export function buildDigest(): unknown {
    return {
        description:
            'Characterisation baseline for the spano planner chain. Captured from the ' +
            'unmodified 2018 sources before any restructuring. These record current ' +
            'behaviour, bugs included — they are not a claim that the output is correct.',
        maxViewAngle: 20,
        maxDistortionAngle: 7,
        stepLength: 1,
        cases: CASES.map(buildDigestEntry),
    };
}

// ─── Full dump: complete intermediate state, references de-duplicated ─────────
//
// segments, shots and steps do not *contain* triples — they hold references to
// the same objects in pointTriples, and divideSegmentsIntoShots (model.ts:140)
// deliberately unshifts each shot's last triple into the next so consecutive
// shots overlap by one sample. Serialising them inline would both explode the
// file size and silently discard that aliasing. Replacing each reference with
// its index keeps the files small and makes the overlap structure itself part
// of what the baseline protects.

export function buildFullDump(testCase: Case): unknown {
    const totalCurveLength = makeCurve(testCase.curve, testCase.params).getTotalLength();

    let result: PipelineResult;
    try {
        result = runPipeline(testCase);
    } catch (error) {
        const err = error as Error;
        return {
            id: testCase.id,
            curve: testCase.curve,
            params: testCase.params,
            totalCurveLength,
            outcome: 'error',
            error: { name: err.name, message: err.message },
        };
    }

    const indexOfTriple = new Map<unknown, number>();
    result.pointTriples.forEach((triple, i) => indexOfTriple.set(triple, i));

    const ref = (triple: unknown): unknown => {
        if (triple === undefined) return UNDEF;
        const found = indexOfTriple.get(triple);
        // A triple that is not in pointTriples would mean the planner
        // synthesised one; nothing does today, but say so loudly if it starts.
        return found ?? { unresolved: triple };
    };

    return {
        id: testCase.id,
        curve: testCase.curve,
        params: testCase.params,
        totalCurveLength,
        outcome: 'ok',
        pointTriples: result.pointTriples,
        shootingErrors: result.shootingErrors,
        segments: result.segments.map(segment => ({
            avgError: segment.avgError,
            tripleRefs: segment.triples.map(ref),
        })),
        shots: result.shots.map(shot => ({
            shotOn: shot.shotOn,
            tripleRefs: Array.isArray(shot.triples) ? shot.triples.map(ref) : ref(shot.triples),
        })),
        steps: result.steps.map(step => ({
            shotOn: step.shotOn,
            backwards: step.backwards,
            angleOfView: step.angleOfView,
            viewAngleToTheGround: step.viewAngleToTheGround,
            shootingPoint: step.shootingPoint,
            shootedPoint: step.shootedPoint,
            firstElementRef: ref(step.firstElement),
            centerElementRef: ref(step.centerElement),
            lastElementRef: ref(step.lastElement),
        })),
    };
}

// ─── Geodesy ──────────────────────────────────────────────────────────────────
//
// lib/math_geo.ts is pure and importable on its own. The two anchor points are
// the ones hard-coded in index.ts:182-188.

const ORIGIN = { lat: 37.77068, lon: -122.393042 };
const TARGET = { lat: 37.770501, lon: -122.396027 };

export function buildGeo(): unknown {
    const distances = [0, 0.6, 10, 100, 1000, 10000];
    const bearings = [0, 45, 90, 180, 270, 359];

    const destinations = distances.flatMap(distance =>
        bearings.map(bearing => ({
            from: ORIGIN,
            distance,
            bearing,
            result: getGeoPointFromStartPointDistanceBearing(ORIGIN, distance, bearing),
        }))
    );

    const bearingPairs = [
        { name: 'index.ts start → direction point', a: ORIGIN, b: TARGET },
        { name: 'identical points', a: ORIGIN, b: ORIGIN },
        { name: 'due north', a: { lat: 0, lon: 0 }, b: { lat: 10, lon: 0 } },
        { name: 'due east on the equator', a: { lat: 0, lon: 0 }, b: { lat: 0, lon: 10 } },
        { name: 'across the antimeridian', a: { lat: 10, lon: 179 }, b: { lat: 10, lon: -179 } },
        { name: 'high latitude', a: { lat: 78, lon: 15 }, b: { lat: 78.1, lon: 16 } },
        { name: 'south of the equator', a: { lat: -33.86, lon: 151.2 }, b: { lat: -37.81, lon: 144.96 } },
    ].map(pair => ({
        name: pair.name,
        a: pair.a,
        b: pair.b,
        bearing: getBearingBetween2GeoPoints(pair.a, pair.b),
    }));

    // The round trip the planner implicitly relies on: walking `distance` along
    // `bearing` and then measuring the bearing back should return `bearing`.
    const roundTrips = bearings.map(bearing => {
        const destination = getGeoPointFromStartPointDistanceBearing(ORIGIN, 250, bearing);
        return {
            bearing,
            destination,
            measuredBack: getBearingBetween2GeoPoints(ORIGIN, destination),
        };
    });

    return {
        description: 'Baseline for lib/math_geo.ts — great-circle destination and initial bearing.',
        destinations,
        bearingPairs,
        roundTrips,
    };
}

// ─── Flight path placement ────────────────────────────────────────────────────
//
// getGeoSteps and getPointsForViewport lived inside index.ts next to jQuery
// until Phase 3, so they could not be imported headless and went uncovered.
// This baseline was captured immediately after the move and before any other
// change to them — a copy in the harness would have drifted and ended up
// validating itself.

/** DJI Mavic Pro horizontal field of view, degrees. */
const MAVIC_PRO_HFOV = 62.4;

export function buildFlightPath(): unknown {
    const anchors = [
        { name: 'index.ts defaults, heading roughly west', start: ORIGIN, direction: TARGET },
        { name: 'due north', start: ORIGIN, direction: { lat: ORIGIN.lat + 0.01, lon: ORIGIN.lon } },
        { name: 'due east', start: ORIGIN, direction: { lat: ORIGIN.lat, lon: ORIGIN.lon + 0.01 } },
    ];

    // A couple of real plans, so the min-spacing nudge and the backwards-heading
    // inversion both get exercised.
    const planCases = CASES.filter(c => c.id === 'simple/default' || c.id === 'stunning/default');

    return {
        description:
            'Baseline for src/core/geo/flight-path.ts — projecting plan steps onto the map, ' +
            'including the 0.6 m minimum waypoint spacing and the inverted heading for ' +
            'backwards steps.',
        hFov: MAVIC_PRO_HFOV,
        cases: planCases.flatMap(testCase => {
            const { steps } = runPipeline(testCase);
            return anchors.map(anchor => ({
                plan: testCase.id,
                anchor: anchor.name,
                start: anchor.start,
                direction: anchor.direction,
                geoSteps: getGeoSteps(anchor.start, anchor.direction, steps),
                viewports: steps.map(step => getPointsForViewport(step, MAVIC_PRO_HFOV)),
            }));
        }),
    };
}

// ─── Litchi mission CSV ───────────────────────────────────────────────────────
//
// makeLitchiMission() is pure and importable. It is fed a STATIC fixture rather
// than real geo steps: getGeoSteps() lives inside index.ts next to jQuery, and
// copying it in here would let the copy drift and end up validating itself.
// getGeoSteps gains coverage in Phase 3, when it moves into core/.

const LITCHI_FIXTURE = [
    {
        geoPoint: { lat: 37.77068, lon: -122.393042 },
        shootingPoint: { x: 0, y: 50 },
        heading: 271,
        viewAngleToTheGround: -30,
    },
    {
        geoPoint: { lat: 37.770501, lon: -122.396027 },
        shootingPoint: { x: 120, y: 78.5 },
        heading: 271,
        viewAngleToTheGround: -12.5,
    },
    {
        geoPoint: { lat: 37.7704, lon: -122.398 },
        shootingPoint: { x: 240, y: 130 },
        heading: 91,
        viewAngleToTheGround: 8,
    },
];

const ACTION_SETS: { name: string; actions: LitchiAction[] }[] = [
    { name: 'no actions', actions: [] },
    {
        name: 'wait/photo/wait — the set index.ts uses',
        actions: [{ type: 'wait', param: 1000 }, { type: 'photo' }, { type: 'wait', param: 1000 }],
    },
    {
        name: 'three photos, as makeLitchi builds them',
        actions: [
            { type: 'wait', param: 1000 },
            { type: 'photo' },
            { type: 'wait', param: 1000 },
            { type: 'photo' },
            { type: 'wait', param: 1000 },
            { type: 'photo' },
            { type: 'wait', param: 1000 },
        ],
    },
];

export function buildLitchi(): unknown {
    return {
        description:
            'Baseline for makeLitchiMission() — the Mission Hub CSV formatter. Fed a ' +
            'static fixture, not real geo steps. NOTE: this pins the CSV as it is ' +
            "generated today; it does NOT verify the columns still match Litchi's " +
            'current format. That check is Phase 7.',
        fixture: LITCHI_FIXTURE,
        missions: ACTION_SETS.map(set => {
            const csv = makeLitchiMission(LITCHI_FIXTURE, set.actions);
            const lines = csv.split('\n');
            return {
                name: set.name,
                actionCount: set.actions.length,
                lineCount: lines.length,
                columnCounts: lines.map(line => line.split(',').length),
                csv,
            };
        }),
    };
}
