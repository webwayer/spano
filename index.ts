import {
    getPointTriples,
    getShootingErrorsForTriples,
    divideSegmentsIntoShots,
    divideTriplesIntoSegmentsByErrors,
    convertShotsIntoSteps
} from "./lib/model";
import { SimpleCurve } from "./lib/curves/SimpleCurve";
import { makeLitchiMission } from "./lib/litchi";
import { getBearingBetween2GeoPoints, getGeoPointFromStartPointDistanceBearing } from "./lib/math_geo";
import { setup3DScene, imageFrom3DScene } from "./lib/3d/scene";
import { draw3DPoint } from "./lib/3d/draw";
import { addShapes } from "./lib/3d/worlds/shapes";
import { calculateTriangleCustom2, lengthFromCoordinates, toRadians } from "./lib/math";
import { simple } from "./lib/3d/planes/simple";
import { StunningCurve } from "./lib/curves/StunningCurve";
import * as $ from 'jquery';
import { drawShots } from "./lib/2d/drawShots";
import { cutImage, generateCutPreviewImage, waitForImage } from "./lib/2d/images";
import { ShitIn3D } from "./lib/3d/generating";

declare const google: any;

function setupUI() {
    $('#generateButton').on('click', async function () {
        const Curve = $("#curveType").val() === 'simpleCurve' ? SimpleCurve : StunningCurve;
        const curve = new Curve(
            parseInt($('#offset').val()),
            parseInt($('#firstLineLength').val()),
            parseInt($('#curvedLineLength').val()),
            parseInt($('#secondLineLength').val())
        );
        const viewPoint = { x: 0, y: parseInt($('#viewPointHeight').val()) };

        const { shots, steps } = calcModel(curve, viewPoint, 7, 20);

        await drawBasic(shots, steps, viewPoint);
        await setup3DUI(steps, viewPoint);
        await setupRealUI(steps);
    })
}

setupUI();
$('#generateButton').click();

async function drawBasic(shots, steps, viewPoint) {
    const topCanvas: any = document.getElementById("topCanvas");
    const bottomCanvas: any = document.getElementById("bottomCanvas");
    drawShots(shots, viewPoint, topCanvas, bottomCanvas);

    $('#asText').empty();
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        $('#asText').append(`<li><b style="color: #0c15ff">Step #${i + 1}:</b> Shot <b>${step.shootingPoint.x.toFixed()}m</b> from Start point on <b>${step.shootingPoint.y.toFixed()}m</b> height.<br />Angle to the ground <b>${(-1 * step.viewAngleToTheGround).toFixed()}°</b> with active angle of view <b>${step.angleOfView.toFixed()}°</b> from <b>${step.shotOn}</b></li>`)
    }
}

async function setup3DUI(steps, viewPoint) {
    const [preview, images] = await ShitIn3D(steps, viewPoint);

    $('#generateButton3D').attr('disabled', false);
    $('#generateDebug3D').attr('disabled', false);
    const previewImage = await waitForImage(preview);
    previewImage.width = 500;

    $('#preview3D').empty();
    $('#debug3D').empty();
    $('#scene3D').empty();
    $('#preview3D').hide();
    $('#debug3D').hide();
    $('#generateButton3D').off('click');
    $('#generateDebug3D').off('click');
    $('#generateDebug3D').hide();

    $('#scene3D').append(previewImage);
    $('#generateButton3D').on('click', async function () {
        $('#generateButton3D').attr('disabled', true);
        $('#preview3D').show();
        $('#generateDebug3D').show();

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const image = images[i];

            const cutedImage = await cutImage(step, image, 45, i === images.length - 1, i === 0);
            const imageObject = await waitForImage(cutedImage);
            if (imageObject.width > 1000) {
                imageObject.width = 1000
            }
            $('#preview3D').prepend(imageObject)
        }
    });

    $('#generateDebug3D').on('click', async function () {
        $('#generateDebug3D').attr('disabled', true);
        $('#debug3D').show();

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const image = images[i];

            const debugImage = await generateCutPreviewImage(step, image, 45, i === images.length - 1, i === 0);
            const imageObject = await waitForImage(debugImage);
            imageObject.width = 500;
            $('#debug3D').append(imageObject)
        }
    });
}

async function setupRealUI(steps) {
    $('#generateDebugReal').attr('disabled', false);

    $('#previewReal').empty();
    $('#debugReal').empty();
    $('#previewReal').hide();
    $('#debugReal').hide();
    $('#generateButtonReal').off('click');
    $('#generateDebugReal').off('click');
    $('#generateDebugReal').hide();

    $('#generateButtonReal').on('click', async function () {
        $('#previewReal').empty();
        $('#debugReal').empty();
        $('#generateDebugReal').attr('disabled', false);

        $('#previewReal').show();
        $('#generateDebugReal').show();

        const images = await getFiles();

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const image = images[i];

            const cutedImage = await cutImage(step, image, 46.8, i === images.length - 1, i === 0);
            const imageObject = await waitForImage(cutedImage);
            if (imageObject.width > 1000) {
                imageObject.width = 1000
            }
            $('#previewReal').prepend(imageObject)
        }
    });

    $('#generateDebugReal').on('click', async function () {
        $('#generateDebugReal').attr('disabled', true);
        $('#debugReal').show();

        const images = await getFiles();

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const image = images[i];

            const debugImage = await generateCutPreviewImage(step, image, 46.8, i === images.length - 1, i === 0);
            const imageObject = await waitForImage(debugImage);
            imageObject.width = 500;
            $('#debugReal').append(imageObject)
        }
    });
}

function calcModel(curve, viewPoint, maxDistortionAngle, maxViewAngle) {
    const pointTriples = getPointTriples(curve, viewPoint, 1);
    console.log(pointTriples);
    const shootingErrors = getShootingErrorsForTriples(pointTriples);
    console.log(shootingErrors);
    const segments = divideTriplesIntoSegmentsByErrors(pointTriples, shootingErrors);
    console.log(segments);
    const shots = divideSegmentsIntoShots(segments, maxViewAngle, maxDistortionAngle);
    console.log(shots);
    const steps = convertShotsIntoSteps(shots);
    console.log(steps);

    return { pointTriples, shootingErrors, segments, steps, shots };
}

async function doWork(curve, viewPoint, maxDistortionAngle, maxViewAngle) {
    const { shots, steps } = calcModel(curve, viewPoint, 7, 20);

    let startPoint = {
        lat: 37.770680,
        lon: -122.393042
    };
    let directionPoint = {
        lat: 37.770501,
        lon: -122.396027
    };
    let geoSteps = getGeoSteps(startPoint, directionPoint, steps);

    await new Promise((resolve => {
        setTimeout(resolve, 500)
    }));
    const map = new google.maps.Map(document.getElementById('map'), {
        zoom: 17,
        center: new google.maps.LatLng(directionPoint.lat, directionPoint.lon),
        mapTypeId: google.maps.MapTypeId.ROADMAP
    });

    let figures = drawOnMap(map, steps, geoSteps, startPoint);

    const startPointMaker = new google.maps.Marker({
        position: { lat: startPoint.lat, lng: startPoint.lon },
        map,
        draggable: true,
        title: 'Start Point'
    });
    startPointMaker.addListener('dragend', function () {
        figures.forEach(figure => figure.setMap(null));
        startPoint = { lat: startPointMaker.getPosition().lat(), lon: startPointMaker.getPosition().lng() };
        geoSteps = getGeoSteps(startPoint, directionPoint, steps);
        figures = drawOnMap(map, steps, geoSteps, startPoint);
    });

    const directionPointMarker = new google.maps.Marker({
        position: { lat: directionPoint.lat, lng: directionPoint.lon },
        map,
        draggable: true,
        title: 'Directional Point'
    });
    directionPointMarker.addListener('dragend', function () {
        figures.forEach(figure => figure.setMap(null));
        directionPoint = {
            lat: directionPointMarker.getPosition().lat(),
            lon: directionPointMarker.getPosition().lng()
        };
        geoSteps = getGeoSteps(startPoint, directionPoint, steps);
        figures = drawOnMap(map, steps, geoSteps, startPoint);
    });
}

function drawOnMap(map, steps, geoSteps, startPoint) {
    const figures = [];

    figures.push(new google.maps.Polygon({
        paths: [
            { lat: startPoint.lat, lng: startPoint.lon },
            { lat: geoSteps[geoSteps.length - 1].geoPoint.lat, lng: geoSteps[geoSteps.length - 1].geoPoint.lon }
        ],
        strokeColor: '#FF0000',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#FF0000',
        fillOpacity: 0.35,
        map
    }));

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const geoStep = geoSteps[i];

        const { bottomViewportOffset, topViewportOffset } = getPointsForViewport(step, 62.4);

        let paths;
        if (step.backwards) {
            const bottomLeftStepGeoPoint = getGeoPointFromStartPointDistanceBearing(getGeoPointFromStartPointDistanceBearing(startPoint, step.lastElement.pointOnTheGround.x, geoStep.heading + 180), bottomViewportOffset, geoStep.heading - 90);
            const bottomRightStepGeoPoint = getGeoPointFromStartPointDistanceBearing(getGeoPointFromStartPointDistanceBearing(startPoint, step.lastElement.pointOnTheGround.x, geoStep.heading + 180), bottomViewportOffset, geoStep.heading + 90);
            const topLeftStepGeoPoint = getGeoPointFromStartPointDistanceBearing(getGeoPointFromStartPointDistanceBearing(startPoint, step.firstElement.pointOnTheGround.x, geoStep.heading + 180), topViewportOffset, geoStep.heading - 90);
            const topRightStepGeoPoint = getGeoPointFromStartPointDistanceBearing(getGeoPointFromStartPointDistanceBearing(startPoint, step.firstElement.pointOnTheGround.x, geoStep.heading + 180), topViewportOffset, geoStep.heading + 90);

            paths = [
                { lat: bottomLeftStepGeoPoint.lat, lng: bottomLeftStepGeoPoint.lon },
                { lat: bottomRightStepGeoPoint.lat, lng: bottomRightStepGeoPoint.lon },
                { lat: topRightStepGeoPoint.lat, lng: topRightStepGeoPoint.lon },
                { lat: topLeftStepGeoPoint.lat, lng: topLeftStepGeoPoint.lon },
                { lat: bottomLeftStepGeoPoint.lat, lng: bottomLeftStepGeoPoint.lon },
            ];
        } else {
            const bottomLeftStepGeoPoint = getGeoPointFromStartPointDistanceBearing(getGeoPointFromStartPointDistanceBearing(startPoint, step.firstElement.pointOnTheGround.x, geoStep.heading), bottomViewportOffset, geoStep.heading - 90);
            const bottomRightStepGeoPoint = getGeoPointFromStartPointDistanceBearing(getGeoPointFromStartPointDistanceBearing(startPoint, step.firstElement.pointOnTheGround.x, geoStep.heading), bottomViewportOffset, geoStep.heading + 90);
            const topLeftStepGeoPoint = getGeoPointFromStartPointDistanceBearing(getGeoPointFromStartPointDistanceBearing(startPoint, step.lastElement.pointOnTheGround.x, geoStep.heading), topViewportOffset, geoStep.heading - 90);
            const topRightStepGeoPoint = getGeoPointFromStartPointDistanceBearing(getGeoPointFromStartPointDistanceBearing(startPoint, step.lastElement.pointOnTheGround.x, geoStep.heading), topViewportOffset, geoStep.heading + 90);

            paths = [
                { lat: bottomLeftStepGeoPoint.lat, lng: bottomLeftStepGeoPoint.lon },
                { lat: bottomRightStepGeoPoint.lat, lng: bottomRightStepGeoPoint.lon },
                { lat: topRightStepGeoPoint.lat, lng: topRightStepGeoPoint.lon },
                { lat: topLeftStepGeoPoint.lat, lng: topLeftStepGeoPoint.lon },
                { lat: bottomLeftStepGeoPoint.lat, lng: bottomLeftStepGeoPoint.lon },
            ];
        }

        figures.push(new google.maps.Polygon({
            paths,
            strokeColor: '#FF0000',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#FF0000',
            fillOpacity: 0.35,
            map
        }));
    }

    return figures;
}

function getPointsForViewport(step, hFov) {
    if (step.backwards) {
        const bottomViewSideTriangle = calculateTriangleCustom2({
            x: 0,
            y: lengthFromCoordinates(step.shootingPoint, step.lastElement.pointOnTheGround)
        }, hFov / 2, { x: 0, y: 0 }, 90);
        const topViewSideTriangle = calculateTriangleCustom2({
            x: 0,
            y: lengthFromCoordinates(step.shootingPoint, step.firstElement.pointOnTheGround)
        }, hFov / 2, { x: 0, y: 0 }, 90);
        return { bottomViewportOffset: bottomViewSideTriangle.B.x, topViewportOffset: topViewSideTriangle.B.x }
    } else {
        const bottomViewSideTriangle = calculateTriangleCustom2({
            x: 0,
            y: lengthFromCoordinates(step.shootingPoint, step.firstElement.pointOnTheGround)
        }, hFov / 2, { x: 0, y: 0 }, 90);
        const topViewSideTriangle = calculateTriangleCustom2({
            x: 0,
            y: lengthFromCoordinates(step.shootingPoint, step.lastElement.pointOnTheGround)
        }, hFov / 2, { x: 0, y: 0 }, 90);
        return { bottomViewportOffset: bottomViewSideTriangle.B.x, topViewportOffset: topViewSideTriangle.B.x }
    }
}

function getGeoSteps(startPoint, directionPoint, steps) {
    const bearing = Math.round(getBearingBetween2GeoPoints(startPoint, directionPoint));
    const invertedBearing = (bearing + 540) % 360;

    const geoSteps = steps.map(step => {
        const distance = step.shootingPoint.x;

        const geoPoint = getGeoPointFromStartPointDistanceBearing(
            startPoint,
            distance,
            bearing
        );

        return {
            geoPoint,
            heading: step.backwards ? invertedBearing : bearing,
            shootingPoint: step.shootingPoint,
            viewAngleToTheGround: step.viewAngleToTheGround
        };
    });

    // minimum distance between points should be more than 0.5m (took 0.6 to be sure)
    for (let i = 0; i < geoSteps.length; i++) {
        const step = geoSteps[i];
        const prevStep = geoSteps[i - 1];
        if (prevStep) {
            const deltaX = step.shootingPoint.x - prevStep.shootingPoint.x;
            const deltaY = step.shootingPoint.y - prevStep.shootingPoint.y;
            const distance = Math.sqrt(Math.pow(deltaX, 2) + Math.pow(deltaY, 2));

            if (distance < 0.6) {
                step.geoPoint = getGeoPointFromStartPointDistanceBearing(
                    startPoint,
                    prevStep.shootingPoint.x + 0.6,
                    bearing
                );
            }
        }
    }

    return geoSteps;
}

async function getFiles() {
    const photos = (<any>document.getElementById('filesReal')).files;
    const imageDataUrls = [];
    for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const reader = new FileReader();

        const imageDataUrl = await new Promise<string>((resolve, reject) => {
            reader.addEventListener("load", function () {
                resolve(reader.result);
            }, false);
            reader.readAsDataURL(photo)
        });

        imageDataUrls.push(imageDataUrl)
    }
    return imageDataUrls;
}