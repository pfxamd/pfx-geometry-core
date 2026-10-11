# PFx Geometry Core — engineering instructions

This repository is a deterministic geometry engine, **not** an AI generator and **not** a collection of random hero effects.

## Non-negotiable boundaries

1. The mathematical core must remain independent of Three.js, WebGL, browser globals and any UI framework.
2. Preserve documented coordinate conventions: right-handed (+X right, +Y up, +Z toward viewer), radians, column-major matrices, WebGL [-1,1] clip Z.
3. All geometry operations must have explicit inputs, units or unit conventions, supported domains and structured failures.
4. Never generate arbitrary primitives to pretend an unsupported real object has been reconstructed. If the geometry of the requested object is not specified or supported, report the missing dimensions/reference/algorithm.
5. Do not add AI models, inferred geometry, random generation, network requests, or implicit external services inside core functions.
6. Keep public operations deterministic and side-effect free. Preserve backward compatibility; breaking changes require explicit versioning.
7. Every new algorithm requires unit tests for known numerical results, boundary cases and degenerate inputs. Mesh algorithms must additionally test winding, bounds, and valid index buffers.
8. Renderers are independent adapters. A good material or light must never be presented as proof of correct geometry.
9. Only describe capabilities that exist in code and that have been tested. Do not claim manifold validity from `validateMesh`; it currently checks only buffer integrity and degenerate triangles.
10. Prefer vetted open-source numerical/geometry libraries for advanced operations rather than untested bespoke reimplementations; review licenses.

## Definition of done

- Types and public API compile in strict mode.
- `npm run check` succeeds.
- A deterministic example demonstrates the new operation.
- README explains conventions, intended use and remaining limitations.

## Solid builder restrictions

- Revolution profiles specify positive radius and strictly ascending Y heights; disallow arbitrary looping/self-intersecting profiles until a dedicated checker exists.
- Straight polygon extrusion is not a general sweep. Do not silently accept concave polygons or holes under a convex-only API.
- Distinguish geometrically closed surfaces from topologically welded watertight/manifold meshes. Separate cap and seam vertices currently remain unwelded.
- Test oriented face winding, exact expected bounds, volume where appropriate, and interoperability with the renderer adapter.

## Topology and sweep constraints

- Use `analyzeMeshTopology` / `assertClosedOriented2Manifold` for combinatorial topology, never claim this proves watertight physical solids or detects triangle self-intersections.
- Coordinate welding is analysis-only and tolerance-sensitive. Preserve original render normals and vertex buffers.
- The supported 3D sweep is a circular tube around an OPEN polyline of waypoints with bounded turns, radius and subdivisions. It is not an arbitrary cross-section extrusion or generic curved-path sweep.
- Each topological property needs negative regression fixtures: boundary edges, orientation reversal, oversubscribed edges, pinched vertex fans and tolerance-dependent welding.
- Preserve deterministic geometry generation and explicitly reject unsupported segment degeneracy and sharp bends.

## Geometric intersection diagnostics

- Never equate `noDetectedIntersections` with a proof of a mesh being free from self-intersection.
- The triangle-pair analyzer is bounded by a 20000-triangle hard limit and explicit candidate-pair budget and absolute tolerance. It must reject larger inputs rather than returning incomplete results as success.
- Coplanar overlap means **positive-area overlap** above the scale-dependent threshold; ordinary shared edges and vertices are not faults.
- Report numerical ambiguity conservatively. Noncoplanar pairs sharing an entire edge are skipped. Shared single vertices are tested for strict crossings; skipped point contact or numerical ambiguity is separately counted, never certified.
- Regression fixtures must include: crossing triangles, coplanar overlap, boundary-only contact, isolated contact, edge-on-plane ambiguity, clean revolved caps, separated objects, and interpenetrating box shells.
- Keep broad-phase and exact-predicate improvements separate from Three.js rendering adapters.

## BVH and deterministic diagnostics

- BVH and sweep-and-prune must enumerate the same unordered overlapping AABB pairs; retain both methods for independent parity tests.
- `maxCandidatePairs` is a hard stop: never report an incomplete scan as no intersections.
- Retained findings must be lexicographically stable regardless of BVH traversal order.
- `skippedSharedVertexAmbiguities` explicitly marks pairs the floating-point checker did not establish as collision-free.
- The accelerated broad phase improves candidate selection, not predicate robustness or the certainty of the result.

## Orientation accuracy (0.8.0)

- Prefer adaptive `robust-predicates` orientations over handwritten near-zero 2D/3D determinants for sidedness.
- Adapt predicate signs to +Y-up/right-handed core conventions, never allow the library's Y-down convention to leak into public APIs.
- Exact orientation sign is exact only for IEEE-754 input coordinates, not physical measurements or earlier rounded computations.
- Distinguish robust orientation tests from full exact intersection algorithms; interpolation, clipping and tolerances remain floating point.
- Preserve triangle fixtures with cancellation where naive determinants are zero but adaptive signs are not; do not weaken numerical regression tests.
- Respect the dependency's Unlicense and document it in README.

## Intersection segment and adversarial verification (0.9.0)

- The segment estimator handles strictly transverse, noncoplanar triangle
  pairs only. Tangential, shared-boundary and numerically unstable cases
  must report indeterminate, never invented precise endpoints.
- All estimated endpoints are marked approximate and verified on both
  triangle planes and projected interior with an explicit tolerance.
- Seeded randomized tests are reproducible **test inputs only**, not
  random geometry production features. Keep known analytic intersection
  fixtures and symmetry/translation checks.
- Microbenchmarks measure actual runtime for specified input distributions;
  they do not certify generalized BVH speedups or peak memory usage.

## Coplanar contact and dense benchmarks (0.10.0)

- The coplanar classifier uses robust signs for **exact mathematical coplanarity
  of represented inputs**; tolerance must not silently project or flatten
  near-coplanar triangles.
- Keep area-overlap, segment contact, isolated vertex contact and disjoint
  classifications separate. Cover reversed triangle winding and slanted planes.
- The mesh-wide diagnostic is deliberately unchanged. Do not imply the
  coplanar-pair API proves entire solid validity.
- Dense irregular benchmark fixtures must be deterministic and include parity
  between BVH and sweep. Never describe a small benchmark sample as a general
  performance guarantee.

## Near-coplanar diagnostic rules (0.11.0)

- Never equate projected footprint overlap with physical 3D contact.
- A near-coplanar result is never marked exactly coplanar. Only adaptive
  zero orientation of all vertices in both directions can establish exact
  plane membership for the represented inputs.
- Report distance and angular limits explicitly and reject out-of-domain
  cases; never project triangles in-place or alter their source vertices.
- Preserve established exact-coplanar, mesh-wide intersection and renderer
  behavior. Keep dedicated tests for slanted planes, winding reversal,
  normal reversal, numerical offsets and isolated boundary contacts.

## Mesh-wide near-coplanar scans (0.12.0)

- This module classifies **projected proximity** across bounded AABB
  candidate pairs. It must never report confirmed 3D intersections from
  near-coplanar footprint overlap.
- Reuse the pair-level diagnostic without altering global collision or
  topology APIs. Preserve exact/near coplanar distinctions.
- Default retained results ignore normal edge/point adjacency; boundary
  counts remain independently visible and opt-in reporting is supported.
- Exceeding triangle or candidate-pair budgets must raise an error; never
  interpret incomplete computation as no proximity.
- BVH and sweep report counts and deterministic retained findings must agree
  across regression fixtures, including when result storage truncates.
- Keep original vertex arrays and indices unchanged; presentation offsets
  belong to renderer diagnostics only.
