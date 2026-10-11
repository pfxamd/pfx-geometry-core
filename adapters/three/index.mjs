import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  PerspectiveCamera,
} from 'three';
import {
  GeometryError,
  mat4,
  perspective4,
  validateMesh,
} from '../../dist/index.js';

/**
 * Convert verified CPU geometry to GPU-friendly float32 buffers.
 * Explicitly reject non-finite or collapsed triangles after conversion.
 * This does NOT prove watertightness, self-intersection freedom, or visual correctness.
 * The returned geometry is owned by the caller and must be disposed by the caller.
 */
export function toThreeBufferGeometry(source) {
  validateMesh(source);
  const positions = Float32Array.from(source.positions);
  const normals = Float32Array.from(source.normals);
  for (let i = 0; i < positions.length; i++) {
    if (!Number.isFinite(positions[i]) || !Number.isFinite(normals[i])) {
      throw new GeometryError('INVALID_MESH', 'Geometry exceeds Float32 GPU range');
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    if (Math.hypot(normals[i], normals[i + 1], normals[i + 2]) === 0) {
      throw new GeometryError('INVALID_MESH', 'Normal collapsed to zero after Float32 conversion');
    }
  }
  for (let i = 0; i < source.indices.length; i += 3) {
    const a = source.indices[i] * 3;
    const b = source.indices[i + 1] * 3;
    const c = source.indices[i + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const doubledArea = Math.hypot(
      aby * acz - abz * acy,
      abz * acx - abx * acz,
      abx * acy - aby * acx,
    );
    if (!Number.isFinite(doubledArea) || doubledArea === 0) {
      throw new GeometryError('DEGENERATE_GEOMETRY', 'Triangle collapses after GPU Float32 conversion');
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  const vertexCount = positions.length / 3;
  geometry.setIndex(new BufferAttribute(
    vertexCount <= 65535 ? Uint16Array.from(source.indices) : Uint32Array.from(source.indices),
    1,
  ));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Convert a Geometry Core camera to a mutable Three.js PerspectiveCamera.
 * Both must use the WebGL [-1,+1] clip-depth convention.
 * The resulting camera can be controlled by OrbitControls.
 */
export function toThreePerspectiveCamera(source) {
  if (!source || typeof source !== 'object') {
    throw new GeometryError('INVALID_CAMERA', 'A Geometry Core camera is required');
  }
  let view;
  let projection;
  let expected;
  try {
    view = mat4(source.view);
    projection = mat4(source.projection);
    expected = perspective4(source);
  } catch {
    throw new GeometryError('INVALID_CAMERA', 'Invalid camera matrices or perspective parameters');
  }
  for (let i = 0; i < 16; i++) {
    if (Math.abs(projection[i] - expected[i]) > 1e-9 * Math.max(1, Math.abs(expected[i]))) {
      throw new GeometryError('INVALID_CAMERA', 'Projection matrix does not match camera parameters');
    }
  }
  const viewMatrix = new Matrix4().fromArray(view);
  if (Math.abs(viewMatrix.determinant()) < 1e-12) {
    throw new GeometryError('INVALID_CAMERA', 'View matrix is singular');
  }
  const worldMatrix = viewMatrix.clone().invert();
  const camera = new PerspectiveCamera(source.fovYRadians * 180 / Math.PI,
    source.aspect, source.near, source.far);
  camera.matrix.copy(worldMatrix);
  camera.matrix.decompose(camera.position, camera.quaternion, camera.scale);
  camera.up.set(worldMatrix.elements[4], worldMatrix.elements[5], worldMatrix.elements[6]).normalize();
  camera.updateMatrixWorld(true);
  camera.projectionMatrix.fromArray(projection);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return camera;
}
