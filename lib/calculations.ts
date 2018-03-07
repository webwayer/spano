import { calculateTriangleCustom2, getTopAngle } from "./math";

export function getPointTriples(curve, viewPoint, stepLength = 1) {
    const totalCurveLength = curve.getTotalLength();

    const pointTriples = [];
    for (let i = 0; i <= totalCurveLength; i += stepLength) {
        const pointOnTheCurve = curve.getPointOnTheCurve(i);
        const pointOnTheGround = curve.getPointOnTheGround(i);
        const shootingPoint = curve.getShootingPoint(i, viewPoint);

        pointTriples.push({
            pointOnTheCurve,
            pointOnTheGround,
            shootingPoint
        })
    }

    return pointTriples;
}

export function getShootingErrorsForTriples(pointTriples) {
    const shootingErrors = [];
    for (let i = 1; i < pointTriples.length; i++) {
        const triple = pointTriples[i];
        const prevTriple = pointTriples[i - 1];

        const perfectAngleForTriple = getTopAngle(triple.pointOnTheGround, {
            x: 0,
            y: 0
        }, triple.shootingPoint);
        const angleToTheNextPointOnTheGround = getTopAngle(triple.pointOnTheGround, {
            x: 0,
            y: 0
        }, prevTriple.shootingPoint);

        const deltaAngle = Math.abs(perfectAngleForTriple - angleToTheNextPointOnTheGround);

        shootingErrors.push(deltaAngle)
    }
    return shootingErrors;
}

export function divideTriplesIntoSegmentsByErrors(pointTriples, shootingErrors) {
    const segments = [];
    let currentSegment = { triples: [pointTriples[0], pointTriples[1]], errors: [shootingErrors[0]] };
    for (let i = 1; i < shootingErrors.length; i++) {
        const deltaError = Math.abs(shootingErrors[i] - shootingErrors[i - 1]);
        if (deltaError > 0.1) {
            segments.push({
                triples: currentSegment.triples,
                avgError: currentSegment.errors.reduce((acc, err) => acc + err, 0) / currentSegment.errors.length
            });
            currentSegment = { triples: [pointTriples[i], pointTriples[i + 1]], errors: [shootingErrors[i]] };
        } else {
            currentSegment.triples.push(pointTriples[i + 1]);
            currentSegment.errors.push(shootingErrors[i]);
        }
    }
    segments.push({
        triples: currentSegment.triples,
        avgError: currentSegment.errors.reduce((acc, err) => acc + err, 0) / currentSegment.errors.length
    });
    return segments;
}

export function divideSegmentsIntoShots(segments, maxViewAngle, maxDistortionAngle) {
    const shots = [];
    let lastSegment;
    for (const segment of segments) {
        if (segment.avgError < 0.01) {
            const flatShots = splitBy(segment.triples, triplesForShot => {
                const firstElement = triplesForShot[0];
                const lastElement = triplesForShot[triplesForShot.length - 1];

                const currentShotViewAngle = getTopAngle(firstElement.shootingPoint, firstElement.pointOnTheGround, lastElement.pointOnTheGround);
                if (currentShotViewAngle > (maxViewAngle / 2)) {
                    return false
                }

                return true;
            });

            for (const flatShot of flatShots) {
                shots.push({
                    shotOn: 'start',
                    triples: flatShot
                })
            }
        } else {
            const curvedShots = splitBy(segment.triples, triplesForShot => {
                const firstElement = triplesForShot[0];
                const lastElement = triplesForShot[triplesForShot.length - 1];

                const currentShotViewAngle = getTopAngle(firstElement.shootingPoint, firstElement.pointOnTheGround, lastElement.pointOnTheGround);
                if (currentShotViewAngle > (maxViewAngle / 2)) {
                    return false
                }

                if ((segment.avgError * (triplesForShot.length - 1)) > maxDistortionAngle) {
                    return false
                }

                return true;
            });

            shots.push({
                shotOn: 'start',
                triples: curvedShots[0]
            });

            const middleShots = curvedShots.slice(1, curvedShots.length % 2 ? curvedShots.length - 2 : curvedShots.length - 3);
            for (let i = 0; i < middleShots.length; i += 2) {
                shots.push({
                    shotOn: 'center',
                    triples: [].concat(middleShots[i], middleShots[i + 1])
                });
            }

            const restShots = curvedShots.slice(curvedShots.length % 2 ? curvedShots.length - 2 : curvedShots.length - 3);
            shots.push({
                shotOn: 'end',
                triples: restShots[0]
            });

            const lastShotTriples = restShots.slice(1).length === 1 ? restShots[1] : [].concat(restShots[1], restShots[2]);
            shots.push({
                shotOn: 'start',
                triples: lastShotTriples.slice(0, parseInt((lastShotTriples.length / 2).toFixed()))
            });
            shots.push({
                shotOn: 'end',
                triples: lastShotTriples.slice(parseInt((lastShotTriples.length / 2).toFixed()))
            })
        }
        lastSegment = segment;
    }
    return shots;
}

export function convertShotsIntoSteps(shots) {
    return shots.map(shot => {
        const firstElement = shot.triples[0];
        const centerElement = shot.triples[parseInt((shot.triples.length / 2).toFixed())];
        const lastElement = shot.triples[shot.triples.length - 1];

        let shootingPoint;
        let shootedPoint;
        if (shot.shotOn === 'start') {
            shootingPoint = firstElement.shootingPoint;
            shootedPoint = firstElement.pointOnTheGround;
        }
        if (shot.shotOn === 'center') {
            shootingPoint = centerElement.shootingPoint;

            const angleOfView = getTopAngle(shootingPoint, firstElement.pointOnTheGround, lastElement.pointOnTheGround);
            const triangle = calculateTriangleCustom2(shootingPoint, angleOfView / 2, firstElement.pointOnTheGround, getTopAngle(firstElement.pointOnTheGround, shootingPoint, lastElement.pointOnTheGround));
            shootedPoint = triangle.B;
        }
        if (shot.shotOn === 'end') {
            shootingPoint = lastElement.shootingPoint;
            shootedPoint = lastElement.pointOnTheGround;
        }

        const angleOfView = getTopAngle(shootingPoint, firstElement.pointOnTheGround, lastElement.pointOnTheGround);

        const viewAngleToTheGround = getTopAngle(shootingPoint, {
            x: shootingPoint.x,
            y: 0
        }, shootedPoint) - 90;

        return {
            angleOfView,
            shootingPoint,
            shootedPoint,
            firstElement,
            lastElement,
            centerElement,
            viewAngleToTheGround,
            shotOn: shot.shotOn,
            backwards: shootingPoint.x > shootedPoint.x,
        }
    });
}

function splitBy(array, isCurrentSubArrayIsGoodFn) {
    const subArrays = [];

    let currentSubArray = [];
    for (let i = 0; i < array.length; i++) {
        const item = array[i];

        if (!currentSubArray[0]) {
            currentSubArray.push(item);
            continue;
        }

        if (item === array[array.length - 1]) {
            currentSubArray.push(item);
            subArrays.push(currentSubArray);
            break;
        }

        const currentSubArrayTry = [].concat(currentSubArray, [item]);
        if (isCurrentSubArrayIsGoodFn(currentSubArrayTry, i)) {
            currentSubArray.push(item);
        } else {
            subArrays.push(currentSubArray);
            currentSubArray = [];
            currentSubArray.push(item);
        }
    }

    return subArrays;
}