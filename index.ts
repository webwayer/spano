import {
    getPointTriples,
    getShootingErrorsForTriples,
    divideSegmentsIntoShots,
    divideTriplesIntoSegmentsByErrors,
    convertShotsIntoSteps
} from "./lib/calculations";
import { SimpleCurve } from "./lib/curves/SimpleCurve";
import { makeLitchiMission } from "./lib/litchi";
import { getBearingBetween2GeoPoints, getGeoPointFromStartPointDistanceBearing } from "./lib/math_geo";
import { setup3DScene, imageFrom3DScene } from "./lib/3d/scene";
import { draw3DPoint } from "./lib/3d/draw";
import { addShapes } from "./lib/3d/worlds/shapes";
import { drawPoint, drawLine } from "./lib/2d/draw";
import { Point, calculateTriangleCustom2, lengthFromCoordinates, toRadians } from "./lib/math";
import { simple } from "./lib/3d/planes/simple";
import { StunningCurve } from "./lib/curves/StunningCurve";

declare const google: any;

async function drawControlPointsOn3DScene(steps, viewPoint, scene) {
    await draw3DPoint({ x: viewPoint.x, y: 0 }, 0x00ffff, scene);
    for (const step of steps) {
        await draw3DPoint(step.firstElement.pointOnTheGround, 0xff0000, scene);
        await draw3DPoint(step.lastElement.pointOnTheGround, 0xff0000, scene);
        await draw3DPoint(step.shootedPoint, 0xffff00, scene);
    }
}

async function ShitIn3D(steps, viewPoint) {
    const { scene, camera, renderer } = await setup3DScene();
    await simple(scene);
    await addShapes(scene);
    await drawControlPointsOn3DScene(steps, viewPoint, scene);

    const overviewImage = await imageFrom3DScene({
        x: -100, y: 200, z: 200
    }, {
        x: 200, y: 0, z: 0
    }, false, scene, camera, renderer);

    const shots = [];
    for (const step of steps) {
        shots.push(await imageFrom3DScene(step.shootingPoint, step.shootedPoint, step.backwards, scene, camera, renderer));
    }

    return [overviewImage, shots]
}

doWork(new StunningCurve(50, 100, 100, 20), new Point(0, 20), 7, 20);

async function doWork(curve, viewPoint, maxDistortionAngle, maxViewAngle) {
    const pointTriples = getPointTriples(curve, viewPoint, 1);
    const shootingErrors = getShootingErrorsForTriples(pointTriples);
    const segments = divideTriplesIntoSegmentsByErrors(pointTriples, shootingErrors);
    const shots = divideSegmentsIntoShots(segments, maxViewAngle, maxDistortionAngle);
    drawShots(shots, viewPoint);

    const steps = convertShotsIntoSteps(shots);

    const [preview, images] = await ShitIn3D(steps, viewPoint);

    const previewImage = new Image(400, 300);
    previewImage.src = preview;
    (<any>document.body).prepend(previewImage);

    await processImages(steps, images, 45, <any>document.getElementById('preview-output'));

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

    makeLitchi(geoSteps);

    (<any>document.getElementById('preview')).onclick = async function () {
        const imageDataUrls = await getFiles();
        await processImages(steps, imageDataUrls, 46.8, <any>document.getElementById('real-output'));
    }
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

async function processImages(steps, images, vFov, output) {
    for (let i = 0; i < images.length; i++) {
        const step = steps[i];
        const stepDataUrl = step.backwards ? (await updownImage(images[i])) : images[i];

        const stepImage = await waitForImage(stepDataUrl);

        const { srcY, activeImageArea } = calcViewport(step.angleOfView, step.shotOn, stepImage.height, vFov, i === images.length - 1, i === 0);

        const previewStepDataUrl = await drawViewport(stepDataUrl, srcY, activeImageArea);

        const previewStepImage = new Image(400, 300);
        previewStepImage.src = previewStepDataUrl;
        (<any>document.body).appendChild(previewStepImage);

        const viewportStepDataUrl = await cutViewport(stepDataUrl, srcY, activeImageArea);

        const viewportStepImage = await waitForImage(viewportStepDataUrl);
        if (viewportStepImage.width > 1000) {
            viewportStepImage.width = 1000;
        }
        output.prepend(viewportStepImage);
    }
}

async function updownImage(imageDataUrl) {
    const image = await waitForImage(imageDataUrl);

    const canvas = document.createElement('canvas');
    const canvasContext = canvas.getContext('2d');
    canvas.height = image.height;
    canvas.width = image.width;

    canvasContext.translate(canvas.width / 2, canvas.height / 2);
    canvasContext.rotate(toRadians(180));
    canvasContext.drawImage(image, -canvas.width / 2, -canvas.height / 2);

    return canvas.toDataURL();
}

async function getFiles() {
    const photos = (<any>document.getElementById('photos')).files;
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

async function waitForImage(src: string): Promise<HTMLImageElement> {
    return await new Promise<HTMLImageElement>(resolve => {
        const image = new Image();
        image.src = src;
        image.onload = () => {
            resolve(image);
        }
    })
}

function calcViewport(angleOfView, shotOn, height, vFOV, fullUp = false, fullDown = false) {
    let activeImageArea = ((angleOfView / vFOV) * height);

    let srcY;
    if (shotOn === 'start') {
        srcY = (height / 2) - activeImageArea
    }
    if (shotOn === 'center') {
        srcY = (height - activeImageArea) / 2
    }
    if (shotOn === 'end') {
        srcY = (height / 2)
    }

    if (fullUp) {
        activeImageArea = srcY + activeImageArea;
        srcY = 0;
    }
    if (fullDown) {
        activeImageArea = height - srcY;
    }

    return { srcY, activeImageArea }
}

async function drawViewport(imageDataUrl, srcY, activeImageArea) {
    const image = await waitForImage(imageDataUrl);

    const canvas = document.createElement('canvas');
    const canvasContext = canvas.getContext('2d');
    canvas.height = image.height;
    canvas.width = image.width;

    canvasContext.drawImage(image, 0, 0);
    canvasContext.strokeStyle = "#FF0000";
    canvasContext.strokeRect(0, srcY, image.width, activeImageArea);
    canvasContext.strokeStyle = "#1eff36";
    canvasContext.strokeRect(0, image.height / 2, image.width, 1);

    return canvas.toDataURL();
}

async function cutViewport(imageDataUrl, srcY, activeImageArea) {
    const image = await waitForImage(imageDataUrl);

    const canvas = document.createElement('canvas');
    const canvasContext = canvas.getContext('2d');
    canvas.height = activeImageArea;
    canvas.width = image.width;

    canvasContext.drawImage(image, 0, srcY, image.width, activeImageArea, 0, 0, image.width, activeImageArea);

    return canvas.toDataURL();
}

function makeLitchi(geoSteps) {
    const invertedHeading = (geoSteps[0].heading + 540) % 360;
    const initialStep = {
        shootingPoint: geoSteps[0].shootingPoint,
        viewAngleToTheGround: geoSteps[0].viewAngleToTheGround,
        geoPoint: getGeoPointFromStartPointDistanceBearing(
            geoSteps[0].geoPoint,
            10,
            invertedHeading
        ),
        heading: geoSteps[0].heading
    };

    const mission = makeLitchiMission([].concat([initialStep], geoSteps), [
        {
            type: 'wait',
            param: 1000
        },
        {
            type: 'photo'
        },
        {
            type: 'wait',
            param: 1000
        },
        {
            type: 'photo'
        },
        {
            type: 'wait',
            param: 1000
        },
        {
            type: 'photo'
        },
        {
            type: 'wait',
            param: 1000
        }
    ]);
    createLitchiMissionDownloadLink('Download litchiMission', 'litchiMission', mission);

    let n = 1;
    for (const step of geoSteps) {
        const invertedHeading = (step.heading + 540) % 360;
        const initialStep = {
            shootingPoint: step.shootingPoint,
            viewAngleToTheGround: step.viewAngleToTheGround,
            geoPoint: getGeoPointFromStartPointDistanceBearing(
                step.geoPoint,
                2,
                invertedHeading
            ),
            heading: step.heading
        };
        const mission = makeLitchiMission([initialStep, step], []);
        createLitchiMissionDownloadLink('Download step #' + n, 'litchiMissionStep' + n, mission);
        n++
    }
}

function createLitchiMissionDownloadLink(title, missionName, mission) {
    const link = document.createElement('a');

    const blob = new Blob([mission], { type: "text/plain;charset=utf-8" });
    const textToSaveAsURL = window.URL.createObjectURL(blob);

    (<any> link.innerText) = title;
    (<any> link.download) = missionName + '.csv';
    (<any> link.href) = textToSaveAsURL;

    document.body.appendChild(link);
    document.body.appendChild(document.createElement('br'));
}

function drawShots(shots, viewPoint) {
    const top_leftCanvas: any = document.getElementById("top_leftCanvas");
    const top_leftCanvasContext = top_leftCanvas.getContext("2d");

    const top_rightCanvas: any = document.getElementById("top_rightCanvas");
    const top_rightCanvasContext = top_rightCanvas.getContext("2d");

    const bottom_leftCanvas: any = document.getElementById("bottom_leftCanvas");
    const bottom_leftCanvasContext = bottom_leftCanvas.getContext("2d");

    const bottom_rightCanvas: any = document.getElementById("bottom_rightCanvas");
    const bottom_rightCanvasContext = bottom_rightCanvas.getContext("2d");

    // top_leftCanvasContext.clearRect(0, 0, top_leftCanvas.width, top_leftCanvas.height);
    // top_rightCanvasContext.clearRect(0, 0, top_rightCanvas.width, top_rightCanvas.height);
    // bottom_leftCanvasContext.clearRect(0, 0, bottom_leftCanvas.width, bottom_leftCanvas.height);
    // bottom_rightCanvasContext.clearRect(0, 0, bottom_rightCanvas.width, bottom_rightCanvas.height);

    for (const shot of shots) {
        const firstElement = shot.triples[0];
        const centerElement = shot.triples[parseInt((shot.triples.length / 2).toFixed())];
        const lastElement = shot.triples[shot.triples.length - 1];

        let shootingTriple;
        if (shot.shotOn === 'start') {
            shootingTriple = firstElement
        }
        if (shot.shotOn === 'center') {
            shootingTriple = centerElement
        }
        if (shot.shotOn === 'end') {
            shootingTriple = lastElement
        }

        for (const { pointOnTheCurve, pointOnTheGround, shootingPoint } of shot.triples) {
            drawLine(top_leftCanvasContext, pointOnTheGround, shootingPoint, '#b6b9ff');
            drawLine(bottom_leftCanvasContext, viewPoint, pointOnTheCurve, '#ffc2fc');
            drawPoint(bottom_leftCanvasContext, pointOnTheCurve, '#ff00f1');
        }

        drawLine(top_rightCanvasContext, firstElement.pointOnTheGround, shootingTriple.shootingPoint, '#0e13ff');
        drawLine(top_rightCanvasContext, lastElement.pointOnTheGround, shootingTriple.shootingPoint, '#0e13ff');

        drawLine(bottom_rightCanvasContext, viewPoint, shootingTriple.pointOnTheCurve, '#ff6071');
        drawLine(bottom_rightCanvasContext, firstElement.pointOnTheCurve, lastElement.pointOnTheCurve, '#ff6071');
    }
}