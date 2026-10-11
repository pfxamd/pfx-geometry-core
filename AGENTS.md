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
