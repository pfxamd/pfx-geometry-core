import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GeometryError, vec3, add3, subtract3, scale3, dot3, cross3, normalize3, angleBetween3,
  identity4, multiply4, translation4, scaling4, rotationX4, rotationY4, rotationZ4,
  transformPoint4, transformDirection4, lookAt4, perspective4, perspectiveCamera, projectPoint,
  createBox, validateMesh, boundsOfMesh, convertLength,
} from '../dist/index.js';

function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, received ${actual}`);
}
function closeVec(v, x, y, z) { close(v.x, x); close(v.y, y); close(v.z, z); }
function throwsCode(fn, code) {
  assert.throws(fn, (error) => error instanceof GeometryError && error.code === code);
}

test('vectors obey right-handed cross products and dot products', () => {
  const x = vec3(1, 0, 0), y = vec3(0, 1, 0);
  closeVec(cross3(x, y), 0, 0, 1);
  close(dot3(x, y), 0);
  close(angleBetween3(x, y), Math.PI / 2);
  closeVec(add3(x, y), 1, 1, 0);
  closeVec(subtract3(x, y), 1, -1, 0);
  closeVec(scale3(x, 3), 3, 0, 0);
  closeVec(normalize3(vec3(0, 3, 4)), 0, 0.6, 0.8);
});
test('invalid numbers and degenerate vectors are rejected', () => {
  throwsCode(() => vec3(Infinity, 0, 0), 'INVALID_NUMBER');
  throwsCode(() => normalize3(vec3(0, 0, 0)), 'DEGENERATE_GEOMETRY');
});
test('matrix composition: T * S scales then translates', () => {
  const composed = multiply4(translation4(vec3(5, 2, -1)), scaling4(vec3(2, 3, 4)));
  closeVec(transformPoint4(composed, vec3(1, 2, 3)), 7, 8, 11);
  closeVec(transformPoint4(identity4(), vec3(1, 2, 3)), 1, 2, 3);
  closeVec(transformDirection4(composed, vec3(1, 0, 0)), 2, 0, 0);
});
test('axial rotations respect right-hand rule', () => {
  closeVec(transformPoint4(rotationX4(Math.PI / 2), vec3(0, 1, 0)), 0, 0, 1);
  closeVec(transformPoint4(rotationY4(Math.PI / 2), vec3(0, 0, 1)), 1, 0, 0);
  closeVec(transformPoint4(rotationZ4(Math.PI / 2), vec3(1, 0, 0)), 0, 1, 0);
});
test('view matrix maps camera to origin and target toward -Z', () => {
  const eye = vec3(3, 4, 5), target = vec3(0, 0, 0);
  const view = lookAt4(eye, target);
  closeVec(transformPoint4(view, eye), 0, 0, 0);
  const projected = transformPoint4(view, target);
  close(projected.x, 0); close(projected.y, 0);
  assert.ok(projected.z < 0);
  throwsCode(() => lookAt4(vec3(0, 0, 0), vec3(0, 0, 0)), 'DEGENERATE_GEOMETRY');
  throwsCode(() => lookAt4(vec3(0, 0, 1), vec3(0, 0, 0), vec3(0, 0, 1)), 'DEGENERATE_GEOMETRY');
});
test('perspective maps near to -1 and far to +1 in WebGL clip space', () => {
  const p = perspective4({ fovYRadians: Math.PI / 2, aspect: 1, near: 1, far: 11 });
  close(transformPoint4(p, vec3(0, 0, -1)).z, -1);
  close(transformPoint4(p, vec3(0, 0, -11)).z, 1);
  throwsCode(() => perspective4({ fovYRadians: 0, aspect: 1, near: 1, far: 11 }), 'INVALID_CAMERA');
  throwsCode(() => perspective4({ fovYRadians: 1, aspect: 1, near: 5, far: 2 }), 'INVALID_CAMERA');
});
test('projectPoint returns screen pixels and detects offscreen/behind camera', () => {
  const camera = perspectiveCamera({
    eye: vec3(0, 0, 5), target: vec3(0, 0, 0),
    fovYRadians: Math.PI / 2, aspect: 2, near: 1, far: 20,
  });
  const center = projectPoint(vec3(0, 0, 0), camera, { width: 800, height: 400 });
  close(center.x, 400); close(center.y, 200);
  assert.equal(center.visible, true);
  assert.ok(center.depth > 0 && center.depth < 1);
  assert.equal(projectPoint(vec3(100, 0, 0), camera, { width: 800, height: 400 }).visible, false);
  assert.equal(projectPoint(vec3(0, 0, 10), camera, { width: 800, height: 400 }).visible, false);
  throwsCode(() => projectPoint(vec3(0, 0, 5), camera, { width: 800, height: 400 }), 'DEGENERATE_GEOMETRY');
});
test('box has measured bounds, 24 vertices and 12 outward triangles', () => {
  const mesh = createBox(2, 4, 6);
  assert.equal(mesh.positions.length / 3, 24);
  assert.equal(mesh.indices.length / 3, 12);
  assert.deepEqual(boundsOfMesh(mesh).size, vec3(2, 4, 6));
  validateMesh(mesh);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ids = mesh.indices.slice(i, i + 3);
    const p = ids.map((index) => mesh.positions.slice(index * 3, index * 3 + 3));
    const [a, b, c] = p;
    const u = vec3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const v = vec3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = cross3(u, v);
    const declaredNormal = vec3(...mesh.normals.slice(ids[0] * 3, ids[0] * 3 + 3));
    assert.ok(dot3(n, declaredNormal) > 0, `bad triangle winding: ${i / 3}`);
  }
  throwsCode(() => createBox(0, 1, 1), 'INVALID_DIMENSION');
});
test('mesh validation rejects bad indices and degenerate triangles', () => {
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
  throwsCode(() => validateMesh({ positions, normals, indices: [0, 1, 3] }), 'INVALID_MESH');
  throwsCode(() => validateMesh({ positions, normals, indices: [0, 0, 2] }), 'DEGENERATE_GEOMETRY');
});
test('unit conversion is reversible', () => {
  close(convertLength(250, 'cm', 'm'), 2.5);
  close(convertLength(2.5, 'm', 'mm'), 2500);
  close(convertLength(convertLength(13, 'mm', 'cm'), 'cm', 'mm'), 13);
  throwsCode(() => convertLength(5, 'inch', 'm'), 'INVALID_DIMENSION');
});
