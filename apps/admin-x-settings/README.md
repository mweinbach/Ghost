# Admin X Settings

Ghost Admin Settings micro-frontend.

## Pre-requisites

- Run `bun install` in Ghost monorepo root

## Running the app

### Running the development version

Run `bun run dev` (in this package folder) to start the development server to test/develop the settings standalone. This will generate a demo site from the `index.html` file which renders the app and makes it available on http://localhost:5173

### Running inside Admin

Run `bun run dev` from the top-level repo. This starts all frontend apps via Docker backend + host dev servers, and AdminX will automatically rebuild when you make changes.

## Develop

This is a monorepo package.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `bun install` to install top-level dependencies.

## Test

- `bun run lint` - run just eslint
- `bun run test:acceptance` - runs acceptance tests
- `bun run test:unit` - runs unit tests
- `bun run test:acceptance path/to/test` - runs a specific test
- `bun run test:acceptance:slowmo` - runs acceptance tests in slow motion and headed mode, useful for debugging and developing tests
