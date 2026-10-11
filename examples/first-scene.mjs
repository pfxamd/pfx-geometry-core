// Run after `npm run build`: node examples/first-scene.mjs
// The output is geometry data, not a screenshot or rendering engine.
import { vec3, createBox, boundsOfMesh, perspectiveCamera, projectPoint } from '../dist/index.js';

const cube = createBox(2, 1, 0.5);
const camera = perspectiveCamera({
  eye: vec3(3, 2, 5), target: vec3(0, 0, 0),
  fovYRadians: Math.PI / 3, aspect: 16 / 9, near: 0.1, far: 100,
});
console.log(JSON.stringify({
  dimensions: boundsOfMesh(cube).size,
  triangles: cube.indices.length / 3,
  projectedCenter: projectPoint(vec3(0, 0, 0), camera, { width: 1280, height: 720 }),
}, null, 2));
