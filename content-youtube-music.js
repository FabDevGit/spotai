// Spot The AI - YouTube Music Content Script
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

  // Get current track info from YouTube Music's web player
  function getCurrentTrack() {
    // Method 1: Player bar at bottom
    const titleEl = document.querySelector('.title.ytmusic-player-bar');
    const artistEl = document.querySelector('.byline.ytmusic-player-bar a');

    if (titleEl && artistEl) {
      return {
        track: titleEl.textContent.trim(),
        artist: artistEl.textContent.trim()
      };
    }

    // Method 2: Alternative - subtitle area
    const title2 = document.querySelector('yt-formatted-string.title');
    const artist2 = document.querySelector('yt-formatted-string.byline a, span.subtitle a');

    if (title2 && artist2) {
      return {
        track: title2.textContent.trim(),
        artist: artist2.textContent.trim()
      };
    }

    // Method 3: Mini player
    const miniTitle = document.querySelector('.content-info-wrapper .title');
    const miniArtist = document.querySelector('.content-info-wrapper .byline a');

    if (miniTitle && miniArtist) {
      return {
        track: miniTitle.textContent.trim(),
        artist: miniArtist.textContent.trim()
      };
    }

    // Method 4: Look for player controls area
    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar) {
      const track = playerBar.querySelector('.title');
      const artist = playerBar.querySelector('.byline a');

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
    // Try different skip button selectors
    const skipButton = document.querySelector('.next-button') ||
                       document.querySelector('tp-yt-paper-icon-button.next-button') ||
                       document.querySelector('[aria-label="Next"]') ||
                       document.querySelector('[aria-label="Suivant"]') ||
                       document.querySelector('[title="Next"]') ||
                       document.querySelector('[title="Suivant"]') ||
                       document.querySelector('.ytmusic-player-bar button[aria-label*="next" i]') ||
                       document.querySelector('button.next-button');

    if (skipButton) {
      skipButton.click();
      console.log('[Spot The AI] Clicked skip button');
      return true;
    }

    // Fallback: try to find by class pattern
    const buttons = document.querySelectorAll('ytmusic-player-bar button, tp-yt-paper-icon-button');
    for (const btn of buttons) {
      const label = btn.getAttribute('aria-label') || btn.getAttribute('title') || '';
      if (label.toLowerCase().includes('next') || label.toLowerCase().includes('suivant')) {
        btn.click();
        console.log('[Spot The AI] Clicked skip button (fallback)');
        return true;
      }
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
      background: #FF0000;
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
  console.log('[Spot The AI] Starting YouTube Music monitor (polling every 5s)');
  setInterval(checkCurrentTrack, POLL_INTERVAL);

  // Initial check after a short delay
  setTimeout(checkCurrentTrack, 1000);
})();
