This file documents the new Start buttons:

- POST /api/start/website -> spawns `npm start` in the workspace `website` folder (detached).
- POST /api/start/ui -> spawns `npm start` in the `sentinel-ui` folder (detached) to launch a separate UI process.

Use these endpoints via the UI buttons added to `public/app.js`.