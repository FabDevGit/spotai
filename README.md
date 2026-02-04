# Spot The AI - Chrome Extension

Automatically skip AI-generated tracks on Spotify and Deezer web players.

## Features

- Monitors Spotify and Deezer web players
- Automatically skips tracks from blacklisted AI artists
- Local blacklist for personal blocks
- Community blacklist synced from spot-the-ai.com

## Development Setup

1. Clone the repo and navigate to this folder

2. Generate icons:
   ```bash
   ./generate_icons.sh ../macos/logo.png
   ```

3. Load in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked" and select this folder

## Project Structure

```
├── manifest.json          # Extension configuration
├── background.js          # Service worker for API calls
├── content-spotify.js     # Spotify web player integration
├── content-deezer.js      # Deezer web player integration
├── popup.html/js          # Popup UI
└── icons/                 # Extension icons
```

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/list/` | Fetch community blacklist |
| `POST /api/flag/` | Flag an artist as AI-generated |

Base URL: `https://spot-the-ai.com`

## Contributing

PRs welcome! Please test on both Spotify and Deezer web players before submitting.

Thanks to https://souloverai.com/ and https://github.com/CennoxX/spotify-ai-blocker for maintaining lists of AI artists

## License

MIT
