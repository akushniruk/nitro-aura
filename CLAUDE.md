# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Brand Identity

### Taglines
- "Spark the grid."
- "Light speed, neon bleed."
- "Every move leaves an aura."

### Visual Design
- Logo: Condensed sans-serif for "Nitro," soft-round script or glowing outline for "Aura"
- Palette: Electric cyan + magenta on deep navy/black
- FX: Subtle particle "aura" pulses behind the grid cells when a player marks X or O

## Project Structure

Nitro Aura is a web application with a client-server architecture:

- `/client`: React TypeScript frontend using Vite and TailwindCSS
- `/server`: Backend directory (currently empty/in development)

## Frontend Technology Stack

- React 19.1.0
- TypeScript 5.8.3
- Vite 6.3.5 (build tool)
- TailwindCSS 4.1.6
- ESLint 9.25.0 with React hooks and refresh plugins
- SWC for Fast Refresh

## Common Development Commands

### Client Development

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Start development server with hot module reloading
npm run dev

# Type check and build for production
npm run build

# Run ESLint on the codebase
npm run lint

# Preview the production build locally
npm run preview
```

## Code Organization

The client follows a standard Vite + React + TypeScript template structure:

- `client/src/`: Main source code directory
  - `main.tsx`: Application entry point
  - `App.tsx`: Root React component
  - `assets/`: Static assets

## Type Checking

The project uses TypeScript with separate configuration files for different parts of the application:

- `client/tsconfig.json`: Base TypeScript configuration
- `client/tsconfig.app.json`: Application-specific configuration
- `client/tsconfig.node.json`: Node.js specific configuration