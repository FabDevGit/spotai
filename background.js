// Spot The AI - Background Service Worker

const API_BASE_URL = "https://spot-the-ai.com";
const API_LIST_ENDPOINT = "/api/list/";
const API_FLAG_ENDPOINT = "/api/flag/";

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['localBlacklist', 'communityBlacklist', 'communityEnabled', 'localEnabled', 'deviceId']);

  if (!data.localBlacklist) {
    await chrome.storage.local.set({ localBlacklist: [] });
  }
  if (!data.communityBlacklist) {
    await chrome.storage.local.set({ communityBlacklist: [] });
  }
  if (data.communityEnabled === undefined) {
    await chrome.storage.local.set({ communityEnabled: true });
  }
  if (data.localEnabled === undefined) {
    await chrome.storage.local.set({ localEnabled: true });
  }
  if (!data.deviceId) {
    await chrome.storage.local.set({ deviceId: generateDeviceId() });
  }

  // Sync community blacklist on install
  syncCommunityBlacklist();
});

function generateDeviceId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Sync community blacklist from API
async function syncCommunityBlacklist() {
  try {
    const response = await fetch(API_BASE_URL + API_LIST_ENDPOINT, {
      headers: { 'Accept': 'application/json' }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.artists) {
        await chrome.storage.local.set({
          communityBlacklist: data.artists.map(a => a.toLowerCase()),
          lastSync: Date.now()
        });
        return { success: true, count: data.artists.length };
      }
    }
    return { success: false };
  } catch (error) {
    console.error('Sync failed:', error);
    return { success: false };
  }
}

// Flag an artist to the API
async function flagArtist(artistName) {
  try {
    const data = await chrome.storage.local.get(['deviceId']);
    const deviceId = data.deviceId || generateDeviceId();

    const response = await fetch(API_BASE_URL + API_FLAG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artist: artistName,
        device_id: deviceId
      })
    });

    return response.ok;
  } catch (error) {
    console.error('Flag failed:', error);
    return false;
  }
}

// Check if artist is blacklisted
async function isBlacklisted(artistName) {
  const data = await chrome.storage.local.get(['localBlacklist', 'communityBlacklist', 'communityEnabled', 'localEnabled']);
  const artistLower = artistName.toLowerCase();

  // Check local blacklist
  if (data.localEnabled !== false && data.localBlacklist && data.localBlacklist.includes(artistLower)) {
    return { blocked: true, source: 'local' };
  }

  // Check community blacklist
  if (data.communityEnabled !== false && data.communityBlacklist && data.communityBlacklist.includes(artistLower)) {
    return { blocked: true, source: 'community' };
  }

  return { blocked: false };
}

// Block current artist (add to local + flag to API)
async function blockArtist(artistName) {
  const data = await chrome.storage.local.get(['localBlacklist']);
  const blacklist = data.localBlacklist || [];
  const artistLower = artistName.toLowerCase();

  if (!blacklist.includes(artistLower)) {
    blacklist.push(artistLower);
    await chrome.storage.local.set({ localBlacklist: blacklist });
  }

  // Flag to community API
  flagArtist(artistName);

  return true;
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'checkArtist':
      isBlacklisted(message.artist).then(sendResponse);
      return true;

    case 'blockArtist':
      blockArtist(message.artist).then(sendResponse);
      return true;

    case 'syncCommunity':
      syncCommunityBlacklist().then(sendResponse);
      return true;

    case 'getSettings':
      chrome.storage.local.get(['communityEnabled', 'localEnabled', 'lastSync', 'localBlacklist', 'communityBlacklist'])
        .then(sendResponse);
      return true;

    case 'setSettings':
      chrome.storage.local.set({
        communityEnabled: message.communityEnabled,
        localEnabled: message.localEnabled
      }).then(() => sendResponse({ success: true }));
      return true;

    case 'getCurrentArtist':
      // Forward to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && (tabs[0].url.includes('spotify.com') || tabs[0].url.includes('deezer.com') || tabs[0].url.includes('music.youtube.com'))) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'getCurrentArtist' }, sendResponse);
        } else {
          sendResponse({ artist: null });
        }
      });
      return true;

    case 'skipTrack':
      // Forward to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'skipTrack' }, sendResponse);
        }
      });
      return true;
  }
});

// Sync community blacklist every 6 hours
chrome.alarms.create('syncCommunity', { periodInMinutes: 360 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncCommunity') {
    syncCommunityBlacklist();
  }
});
