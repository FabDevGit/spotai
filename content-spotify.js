// Spot The AI - Spotify Content Script
// Polls every 5 seconds to check current artist

(function() {
  'use strict';

  const POLL_INTERVAL = 5000; // 5 seconds
  let lastCheckedArtist = '';
  let currentArtist = '';
  let currentTrack = '';
  let isSkipping = false;

  function getTrackFromMediaSession() {
    const metadata = navigator.mediaSession && navigator.mediaSession.metadata;
    if (!metadata) return null;

    const artist = (metadata.artist || '').trim();
    const track = (metadata.title || '').trim();
    if (!artist || !track) return null;

    return { artist, track };
  }

  // Get current track info from Spotify's web player
  function getCurrentTrack() {
    // Method 1: Now playing bar (most reliable)
    const nowPlayingBar = document.querySelector('[data-testid="now-playing-widget"]');
    if (nowPlayingBar) {
      const trackLink = nowPlayingBar.querySelector('a[data-testid="context-item-link"]');
      const artistLinks = nowPlayingBar.querySelectorAll('a[href^="/artist"]');

      if (trackLink && artistLinks.length > 0) {
        return {
          track: trackLink.textContent.trim(),
          artist: artistLinks[0].textContent.trim()
        };
      }
    }

    // Method 2: Footer player
    const trackName = document.querySelector('[data-testid="context-item-link"]');
    const artistName = document.querySelector('[data-testid="context-item-info-subtitles"] a');

    if (trackName && artistName) {
      return {
        track: trackName.textContent.trim(),
        artist: artistName.textContent.trim()
      };
    }

    // Method 3: Different layout - look for any artist link near the player
    const playerFooter = document.querySelector('[data-testid="now-playing-bar"]') ||
                         document.querySelector('.now-playing-bar');
    if (playerFooter) {
      const track = playerFooter.querySelector('a[href^="/track"], a[href^="/album"]');
      const artist = playerFooter.querySelector('a[href^="/artist"]');

      if (track && artist) {
        return {
          track: track.textContent.trim(),
          artist: artist.textContent.trim()
        };
      }
    }

    // Fallback: Media Session metadata
    const mediaSessionTrack = getTrackFromMediaSession();
    if (mediaSessionTrack) return mediaSessionTrack;

    return null;
  }

  // Skip to next track
  function skipTrack() {
    const skipButton = document.querySelector('[data-testid="control-button-skip-forward"]') ||
                       document.querySelector('button[aria-label="Next"]') ||
                       document.querySelector('button[aria-label="Suivant"]');

    if (skipButton) {
      skipButton.click();
      console.log('[Spot The AI] Clicked skip button');
      return true;
    }
    console.log('[Spot The AI] Skip button not found');
    return false;
  }

  // Check current artist against blacklist
  async function checkCurrentTrack() {
    if (isSkipping) return;

    const track = getCurrentTrack();
    if (!track || !track.artist) {
      currentArtist = '';
      currentTrack = '';
      return;
    }

    currentArtist = track.artist;
    currentTrack = track.track;

    // Don't re-check same artist
    const artistKey = track.artist.toLowerCase();
    if (artistKey === lastCheckedArtist) return;

    console.log(`[Spot The AI] Checking artist: ${track.artist}`);

    // Ask background if blacklisted
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'checkArtist',
        artist: track.artist
      });

      if (result && result.blocked) {
        console.log(`[Spot The AI] BLOCKED (${result.source}): ${track.artist}`);
        isSkipping = true;
        lastCheckedArtist = ''; // Reset so we check next song

        if (skipTrack()) {
          showNotification(track.artist, track.track, result.source);
        }

        // Wait before checking next track
        setTimeout(() => {
          isSkipping = false;
        }, 1500);
      } else {
        lastCheckedArtist = artistKey;
      }
    } catch (e) {
      console.log('[Spot The AI] Error checking artist:', e);
    }
  }

  // Show notification overlay
  function showNotification(artist, track, source) {
    const existing = document.getElementById('spotai-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'spotai-notification';
    notification.style.cssText = `
      position: fixed;
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%);
      background: #1DB954;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      z-index: 99999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    `;
    notification.innerHTML = `<strong>Skipped AI artist (${source}):</strong> ${artist}`;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 3000);
  }

  // Handle messages from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getCurrentArtist') {
      // Get fresh data
      const track = getCurrentTrack();
      if (track && track.artist) {
        sendResponse({ artist: track.artist, track: track.track });
      } else {
        sendResponse({ artist: null, track: null });
      }
    } else if (message.action === 'skipTrack') {
      const success = skipTrack();
      lastCheckedArtist = ''; // Reset to check next track
      sendResponse({ success });
    }
    return true;
  });

  // Start polling
  console.log('[Spot The AI] Starting Spotify monitor (polling every 5s)');
  setInterval(checkCurrentTrack, POLL_INTERVAL);

  // Initial check after a short delay
  setTimeout(checkCurrentTrack, 1000);
})();
