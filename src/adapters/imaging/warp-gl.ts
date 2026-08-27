import type { Mat3 } from '../../core/geometry/homography';
import type { StripSampling } from '../../core/imaging/strip-warp';

/**
 * Resample strips through their projective maps, on the GPU.
 *
 * Raw WebGL2 rather than three.js, which the project already depends on. The
 * three.js renderer lives behind a dynamic import worth 523 KB, loaded only
 * when someone presses the synthetic-preview button; the warp is needed on the
 * "your photos" path, which never touches it. Routing this through the shared
 * renderer would pull half a megabyte onto that path for thirty lines of
 * shader, quietly undoing the lazy-loading decision the architecture notes lead
 * with. Two contexts against a browser cap of about sixteen is the cheaper
 * trade.
 *
 * `CanvasRenderingContext2D` cannot do this at all: `setTransform` is affine,
 * and an affine map sends a rectangle to a parallelogram. Ground seen obliquely
 * is a trapezoid.
 *
 * No CSP change: the result leaves as a `data:` URL, which `img-src 'self'
 * data:` already allows.
 */

const VERTEX_SHADER = `#version 300 es
in vec2 aCorner;
uniform vec2 uCanvas;
uniform vec4 uRect;      // x, y, width, height in panorama pixels
out vec2 vPanorama;
void main() {
    vPanorama = uRect.xy + aCorner * uRect.zw;
    vec2 clip = vPanorama / uCanvas * 2.0 - 1.0;
    // Panorama rows run downward; clip space runs up.
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vPanorama;
uniform mat3 uToSource;   // column-major, as GLSL wants
uniform vec2 uSourceSize;
uniform sampler2D uFrame;
out vec4 outColour;
void main() {
    vec3 mapped = uToSource * vec3(vPanorama, 1.0);
    if (mapped.z == 0.0) discard;

    vec2 source = mapped.xy / mapped.z;
    // Outside the photograph there is nothing to show. Discarding rather than
    // clamping matters: clamping smears the frame's edge pixels across the gap
    // and reads as real ground.
    if (source.x < 0.0 || source.y < 0.0 || source.x > uSourceSize.x || source.y > uSourceSize.y) discard;

    outColour = texture(uFrame, source / uSourceSize);
}`;

export interface WarpJob {
    readonly image: HTMLImageElement;
    readonly sampling: StripSampling;
}

interface Context {
    readonly gl: WebGL2RenderingContext;
    readonly canvas: HTMLCanvasElement;
    readonly program: WebGLProgram;
    readonly uniforms: {
        canvas: WebGLUniformLocation;
        rect: WebGLUniformLocation;
        toSource: WebGLUniformLocation;
        sourceSize: WebGLUniformLocation;
    };
}

/**
 * One context for the life of the page.
 *
 * The same discipline scene3d/scene.ts documents, and for the same reason: the
 * 2018 code built a renderer per plan and the preview died after about sixteen
 * regenerations. Resizing a canvas does not create a context, so the single one
 * here serves every panorama.
 */
let shared: Context | undefined;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('The graphics driver would not allocate a shader.');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) ?? 'no log';
        gl.deleteShader(shader);
        throw new Error(`Shader would not compile: ${log}`);
    }
    return shader;
}

function required(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
    const location = gl.getUniformLocation(program, name);
    if (!location) throw new Error(`Shader is missing the uniform ${name}.`);
    return location;
}

function context(): Context {
    if (shared) return shared;

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('This browser has no WebGL2, so strips cannot be reprojected.');

    // No null check: this lib's WebGL2 types declare createProgram non-nullable,
    // and guarding it is a lint error rather than caution.
    const program = gl.createProgram();

    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`Shader program would not link: ${gl.getProgramInfoLog(program) ?? 'no log'}`);
    }

    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, 'aCorner');
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

    shared = {
        gl,
        canvas,
        program,
        uniforms: {
            canvas: required(gl, program, 'uCanvas'),
            rect: required(gl, program, 'uRect'),
            toSource: required(gl, program, 'uToSource'),
            sourceSize: required(gl, program, 'uSourceSize'),
        },
    };
    return shared;
}

/** True when the browser can do this at all. Drives whether the mode is offered. */
export function warpAvailable(): boolean {
    try {
        context();
        return true;
    } catch {
        return false;
    }
}

/** GLSL reads a mat3 column by column; the core maths is written row by row. */
function columnMajor(m: Mat3): Float32Array {
    return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

/**
 * Draw every strip into one panorama and hand back a data URL.
 *
 * One draw call and one texture per strip, because each strip comes from a
 * different photograph. Textures are deleted as they go: a plan can hold a
 * hundred and sixty frames at twelve megapixels, and keeping them all resident
 * is half a gigabyte of video memory for no reason.
 */
export function warpPanorama(jobs: readonly WarpJob[], size: { width: number; height: number }): string {
    return draw(jobs, size).toDataURL();
}

/**
 * The same, as pixels.
 *
 * Seam choice needs to compare two layers pixel by pixel, and going through a
 * PNG to get there would cost an encode and a decode per layer for nothing. The
 * GL canvas is drawn onto a 2D one because a canvas has exactly one context
 * type, and `readPixels` would hand back bottom-up rows that then need flipping.
 */
export function warpLayer(jobs: readonly WarpJob[], size: { width: number; height: number }): ImageData {
    const source = draw(jobs, size);

    const scratch = document.createElement('canvas');
    scratch.width = size.width;
    scratch.height = size.height;

    const context2d = scratch.getContext('2d', { willReadFrequently: true });
    if (!context2d) throw new Error('This browser would not give us a canvas to read the panorama back from.');

    context2d.drawImage(source, 0, 0);
    return context2d.getImageData(0, 0, size.width, size.height);
}

function draw(jobs: readonly WarpJob[], size: { width: number; height: number }): HTMLCanvasElement {
    const { gl, canvas, uniforms } = context();

    canvas.width = size.width;
    canvas.height = size.height;
    gl.viewport(0, 0, size.width, size.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.uniform2f(uniforms.canvas, size.width, size.height);

    for (const { image, sampling } of jobs) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

        const { x, y, width, height } = sampling.destination;
        gl.uniform4f(uniforms.rect, x, y, width, height);
        gl.uniformMatrix3fv(uniforms.toSource, false, columnMajor(sampling.toSource));
        gl.uniform2f(uniforms.sourceSize, image.naturalWidth, image.naturalHeight);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.deleteTexture(texture);
    }

    return canvas;
}
