// Spot The AI - Deezer Content Script
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

  // Get current track info from Deezer's web player
  function getCurrentTrack() {
    // Method 1: Player bar selectors
    const trackEl = document.querySelector('.track-link[data-testid="track_playing_title"]');
    const artistEl = document.querySelector('.track-link[data-testid="track_playing_artist"]');

    if (trackEl && artistEl) {
      return {
        track: trackEl.textContent.trim(),
        artist: artistEl.textContent.trim()
      };
    }

    // Method 2: Alternative player selectors
    const playerTrack = document.querySelector('.player-track-title a, .track-title a');
    const playerArtist = document.querySelector('.player-track-artist a, .track-artist a');

    if (playerTrack && playerArtist) {
      return {
        track: playerTrack.textContent.trim(),
        artist: playerArtist.textContent.trim()
      };
    }

    // Method 3: Slider/mini player
    const sliderTrack = document.querySelector('.slider-track-title, [class*="TrackTitle"]');
    const sliderArtist = document.querySelector('.slider-track-artists a, [class*="TrackArtist"] a');

    if (sliderTrack && sliderArtist) {
      return {
        track: sliderTrack.textContent.trim(),
        artist: sliderArtist.textContent.trim()
      };
    }

    // Method 4: Look in the player footer area
    const footer = document.querySelector('#page_player, .page-player');
    if (footer) {
      const track = footer.querySelector('[class*="title"] a, [class*="Title"] a');
      const artist = footer.querySelector('[class*="artist"] a, [class*="Artist"] a');

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
    const skipButton = document.querySelector('[data-testid="player_next_button"]') ||
                       document.querySelector('button[aria-label="Next"]') ||
                       document.querySelector('button[aria-label="Suivant"]') ||
                       document.querySelector('.svg-icon-group-btn[aria-label*="next"]') ||
                       document.querySelector('.svg-icon-group-btn[aria-label*="Next"]') ||
                       document.querySelector('button[class*="next"]');

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
  console.log('[Spot The AI] Starting Deezer monitor (polling every 5s)');
  setInterval(checkCurrentTrack, POLL_INTERVAL);

  // Initial check after a short delay
  setTimeout(checkCurrentTrack, 1000);
})();
