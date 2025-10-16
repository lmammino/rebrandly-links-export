# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CLI tool for exporting Rebrandly short links to CSV files. It's designed to be published on npm and run directly via `npx` or `pnpm dlx` without installation.

## Architecture

The entire application is a single Node.js ESM module (`src/index.js`) that:

1. **CLI Argument Parsing**: Uses Node's built-in `parseArgs` to handle `--api-key`, `--workspace` (multiple), `--out`, and `--max-page-size` flags. Falls back to environment variables (`REBRANDLY_API_KEY`, `REBRANDLY_WORKSPACES`, `EXPORT_BASE`, `MAX_PAGE_SIZE`).

2. **Pagination & Rate Limiting**: Fetches links from Rebrandly API using cursor-based pagination (`last` parameter). Exports workspaces sequentially (not in parallel) to avoid hitting rate limits. Includes retry logic (3 attempts) with exponential backoff for 429 and 5xx errors.

3. **File Writing**: Uses Node.js streams (`createWriteStream`) with backpressure handling via `once(stream, 'drain')` pattern to write CSV files efficiently. Each workspace gets its own file with suffix pattern: `basename-workspaceId.ext`.

4. **Progress Indicators**: Real-time terminal output using `\r` carriage returns to update the same line, showing fetched count and page numbers during export.

## Development Commands

```bash
# Format and lint code
pnpm run format

# Run the CLI locally
node src/index.js --api-key YOUR_KEY --workspace WORKSPACE_ID --out output.csv
```

## Code Style

- **Formatter**: Biome (configured in `biome.json`)
- **Quotes**: Single quotes
- **Semicolons**: Optional (asNeeded)
- **Indentation**: 2 spaces
- **Module System**: ES Modules (`type: "module"` in package.json)

## Key Design Patterns

### CSV Generation
Hand-rolled CSV escaping (fields with `,`, `"`, newlines, or carriage returns are quoted; internal quotes are doubled). Fixed field order: `id`, `createdAt`, `shortUrl`, `destination`.

### Workspace Handling
If no workspace is specified via CLI or env vars, exports the "default" workspace (API call without `workspace` header). Multi-workspace exports create separate files with workspace ID suffixes.

### Error Handling
- Missing API key: exits with error code 1
- Failed fetches: retries up to 3 times for rate limits and server errors
- All other fetch failures: throws with status code and response text

## Testing Changes

Since this is a CLI tool that interacts with an external API, manual testing is required:

```bash
# Test with environment variables
export REBRANDLY_API_KEY=your_test_key
export REBRANDLY_WORKSPACES=ws_test1,ws_test2
node src/index.js

# Test with CLI arguments
node src/index.js --api-key test_key --workspace ws_123 --out test.csv

# Test error handling (invalid key)
node src/index.js --api-key invalid --workspace ws_123
```

## Important Constraints

- This tool is intended to run as a published npm package via `npx`/`pnpm dlx`
- No dependencies in production (only uses Node.js built-ins)
- Single file architecture - avoid adding complexity unless absolutely necessary
- Sequential workspace processing is intentional for rate limit management
