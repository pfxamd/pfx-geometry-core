# Examples

First compile the core:

```sh
npm install
npm run build
```

For a numeric proof of measured geometry and projected coordinates:

```sh
node examples/first-scene.mjs
```

For a local browser wireframe preview:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/examples/perspective-preview.html`.

The preview draws a 2 × 1 × 0.5 box using `projectPoint` and the Canvas 2D API. It is a geometry/perspective diagnostic, **not** a production renderer or a Three.js adapter. The server must serve the project root after `dist/` is built; `file://` module imports will not work reliably.
