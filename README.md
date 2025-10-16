# Rebrandly Links Export

Export your short links from Rebrandly to CSV files. This CLI tool allows you to download all your branded links from one or more Rebrandly workspaces.

This allows you to create backups of your links or migrate them to another service.

## Features

- **Automatic workspace discovery** - No workspace configuration needed, automatically exports all workspaces
- Export links from multiple workspaces in a single run
- Automatic pagination with progress indicators
- Retry logic for failed requests (429 and 5xx errors)
- CSV output with customizable filenames
- Environment variable support for configuration

## Requirements

### Getting Your API Key

1. Log in to your [Rebrandly dashboard](https://www.rebrandly.com)
2. Click on your profile picture in the navigation bar
3. Navigate to API
4. Click **Create API Key**
5. Give your key a name (e.g., "Links Export")
6. Copy the generated API key (you'll need this for the `REBRANDLY_API_KEY` environment variable)

### Finding Your Workspace IDs (Optional)

By default, the tool will automatically discover all your workspaces. However, if you want to export specific workspaces only, you can find their IDs:

1. Open the development tools in your browser and switch to the **Network** tab
2. Load your Rebrandly dashboard and look for a GET request to `https://api.rebrandly.com/v1/workspaces`
3. The response will contain a list of your workspaces along with their IDs (plus other details)

## Installation

This package is available on npm. You can use it directly without installation using `npx` or `pnpm dlx`.

## Usage

### Using npx (npm)

```bash
export REBRANDLY_API_KEY=YOUR_API_KEY
npx rebrandly-links-export --workspace WORKSPACE_ID --out links.csv
```

### Using pnpm dlx

```bash
export REBRANDLY_API_KEY=YOUR_API_KEY
pnpm dlx rebrandly-links-export --workspace WORKSPACE_ID --out links.csv
```

### Environment Variables

The API key must be configured using environment variables:

- `REBRANDLY_API_KEY` - Your API key (required)
- `REBRANDLY_WORKSPACES` - Comma-separated list of workspace IDs
- `REBRANDLY_EXPORT_BASE` - Base output filename
- `REBRANDLY_MAX_PAGE_SIZE` - Maximum links per page

### Command Line Options

- `--workspace <id>` - Workspace ID to export (optional, can be specified multiple times; if omitted, all workspaces are auto-discovered)
- `--out <path>` - Base output filename (default: `rebrandly-links.csv`)
- `--max-page-size <num>` - Maximum links per page (default: `25`)

### Examples

**Export all workspaces (automatic discovery):**
```bash
export REBRANDLY_API_KEY=abc123def456

npx rebrandly-links-export
```

This will automatically discover all your workspaces and export each one to a separate file:
- `rebrandly-links-ws_abc123.csv`
- `rebrandly-links-ws_xyz789.csv`
- etc.

**Export from a single workspace:**
```bash
export REBRANDLY_API_KEY=abc123def456

npx rebrandly-links-export \
  --workspace ws_abc123 \
  --out my-links.csv
```

**Export from specific workspaces only:**
```bash
export REBRANDLY_API_KEY=abc123def456

npx rebrandly-links-export \
  --workspace ws_abc123 \
  --workspace ws_xyz789 \
  --out links.csv
```

This will create:
- `links-ws_abc123.csv`
- `links-ws_xyz789.csv`

**Using environment variables to specify workspaces:**
```bash
export REBRANDLY_API_KEY=abc123def456
export REBRANDLY_WORKSPACES=ws_abc123,ws_xyz789
export REBRANDLY_EXPORT_BASE=links.csv

npx rebrandly-links-export
```

## Output Format

The exported CSV files contain the following columns:

- `id` - The unique link ID
- `createdAt` - ISO timestamp when the link was created
- `shortUrl` - The branded short URL without protocol (e.g., "fstack.link/sponsorship")
- `domain` - The domain from the short URL (e.g., "fstack.link")
- `slashtag` - The short URL path/slug without the domain (e.g., "sponsorship")
- `destination` - The destination URL

Example:
```csv
id,createdAt,shortUrl,domain,slashtag,destination
abc123,2024-01-15T10:30:00.000Z,mysite.link/product,mysite.link,product,https://example.com/products/item-123
def456,2024-01-14T15:45:00.000Z,mysite.link/blog,mysite.link,blog,https://example.com/blog/post-1
```

## Repository Structure

```
rebrandly-links-export/
├── src/
│   └── index.js          # Main CLI script with export logic
├── package.json          # Package metadata and dependencies
├── biome.json           # Code formatter configuration
├── pnpm-lock.yaml       # Locked dependencies
└── README.md            # This file
```

## Development

### Local Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/rebrandly-links-export.git
cd rebrandly-links-export

# Install dependencies
pnpm install

# Run locally
export REBRANDLY_API_KEY=YOUR_API_KEY
node src/index.js --workspace WORKSPACE_ID
```

### Code Formatting

This project uses [Biome](https://biomejs.dev/) for code formatting:

```bash
pnpm run format
```

## Rate Limiting

The tool exports workspaces sequentially (one at a time) to be gentle on Rebrandly's API rate limits. Each API request includes automatic retry logic with exponential backoff for rate limit (429) and server error (5xx) responses.

## License

MIT

## Author

Luciano Mammino

## Contributing

Issues and pull requests are welcome! Please feel free to submit bug reports or feature requests.
