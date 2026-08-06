import { getGeoPointFromStartPointDistanceBearing } from '../../core/geo/great-circle';
import { makeLitchiMission, THREE_SHOT_BRACKET } from '../../core/export/litchi-csv';
import type { GeoStep } from '../../core/types';

/** How far back along the track the approach waypoint sits, metres. */
const RUN_IN_DISTANCE = 10;

/** How far back the per-step approach waypoint sits, metres. */
const STEP_RUN_IN_DISTANCE = 2;

function dataUrlFromText(text: string): string {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    return window.URL.createObjectURL(blob);
}

/** A waypoint `distance` metres behind `step`, facing the same way. */
function approachWaypoint(step: GeoStep, distance: number): GeoStep {
    const invertedHeading = (step.heading + 540) % 360;
    return {
        shootingPoint: step.shootingPoint,
        viewAngleToTheGround: step.viewAngleToTheGround,
        geoPoint: getGeoPointFromStartPointDistanceBearing(step.geoPoint, distance, invertedHeading),
        heading: step.heading,
    };
}

/**
 * Object URLs for a full mission plus one single-waypoint mission per step.
 *
 * Callers must revokeObjectURL these when done — they pin their Blob in memory
 * for the lifetime of the document otherwise.
 */
export function makeLitchi(geoSteps: GeoStep[]): [string, string[]] {
    const fullMission = makeLitchiMission(
        [approachWaypoint(geoSteps[0], RUN_IN_DISTANCE), ...geoSteps],
        THREE_SHOT_BRACKET
    );

    const perStepMissions = geoSteps.map(step =>
        dataUrlFromText(makeLitchiMission([approachWaypoint(step, STEP_RUN_IN_DISTANCE), step], []))
    );

    return [dataUrlFromText(fullMission), perStepMissions];
}
