// Spot The AI - Popup Script

let currentArtist = '';
let currentTabId = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  console.log('Popup init');

  // Setup event listeners first
  document.getElementById('blockBtn').addEventListener('click', blockCurrentArtist);
  document.getElementById('localToggle').addEventListener('change', saveSettings);
  document.getElementById('communityToggle').addEventListener('change', saveSettings);
  document.getElementById('syncBtn').addEventListener('click', syncCommunity);

  // Load settings directly from storage (don't rely on background)
  await loadSettings();

  // Get current track
  await updateCurrentTrack();
}

async function loadSettings() {
  console.log('Loading settings...');
  try {
    const settings = await chrome.storage.local.get(['communityEnabled', 'localEnabled', 'localBlacklist', 'communityBlacklist']);
    console.log('Settings:', settings);

    document.getElementById('localToggle').checked = settings.localEnabled !== false;
    document.getElementById('communityToggle').checked = settings.communityEnabled !== false;

    const localCount = settings.localBlacklist ? settings.localBlacklist.length : 0;
    const communityCount = settings.communityBlacklist ? settings.communityBlacklist.length : 0;

    document.getElementById('localCount').textContent = `${localCount} artist${localCount !== 1 ? 's' : ''}`;
    document.getElementById('communityCount').textContent = `${communityCount} artist${communityCount !== 1 ? 's' : ''}`;
  } catch (e) {
    console.log('Error loading settings:', e);
  }
}

async function updateCurrentTrack() {
  console.log('Updating current track...');

  try {
    const isSupportedMusicUrl = (url) => {
      if (!url) return false;
      return (
        url.includes('open.spotify.com') ||
        url.includes('deezer.com') ||
        url.includes('music.youtube.com')
      );
    };

    // Prefer the active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    let musicTab = null;
    if (activeTab && isSupportedMusicUrl(activeTab.url)) {
      musicTab = activeTab;
    } else {
      const currentWindowTabs = await chrome.tabs.query({ currentWindow: true });
      const supportedInWindow = currentWindowTabs.filter(t => isSupportedMusicUrl(t.url));
      musicTab = supportedInWindow.find(t => t.audible) ||
        supportedInWindow.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];

      if (!musicTab) {
        const allTabs = await chrome.tabs.query({});
        const supportedAll = allTabs.filter(t => isSupportedMusicUrl(t.url));
        musicTab = supportedAll.find(t => t.audible) ||
          supportedAll.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
      }
    }

    console.log('Selected music tab:', musicTab?.id, musicTab?.url);

    if (!musicTab) {
      console.log('No music tab found');
      showNoTrack();
      return;
    }

    currentTabId = musicTab.id;

    // Send message directly to the tab
    console.log('Sending message to tab...');
    let response;
    try {
      response = await chrome.tabs.sendMessage(musicTab.id, { action: 'getCurrentArtist' });
      console.log('Response:', response);
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      console.log('Error sending message:', msg);
      if (msg.includes('Receiving end does not exist') || msg.includes('Could not establish connection')) {
        currentArtist = '';
        currentTabId = musicTab.id;
        document.getElementById('currentArtist').textContent = 'Music tab detected, but not connected';
        document.getElementById('currentArtist').classList.add('no-track');
        document.getElementById('currentTrack').textContent = 'Refresh the music page and reopen this popup';
        document.getElementById('blockBtn').disabled = true;
        return;
      }
      throw e;
    }

    if (response && response.artist) {
      currentArtist = response.artist;
      document.getElementById('currentArtist').textContent = response.artist;
      document.getElementById('currentArtist').classList.remove('no-track');
      document.getElementById('currentTrack').textContent = response.track || '';
      document.getElementById('blockBtn').disabled = false;
    } else {
      showNoTrack();
    }
  } catch (e) {
    console.log('Error updating track:', e);
    showNoTrack();
  }
}

function showNoTrack() {
  currentArtist = '';
  currentTabId = null;
  document.getElementById('currentArtist').textContent = 'No track playing';
  document.getElementById('currentArtist').classList.add('no-track');
  document.getElementById('currentTrack').textContent = 'Open Spotify, Deezer or YouTube Music';
  document.getElementById('blockBtn').disabled = true;
}

async function blockCurrentArtist() {
  if (!currentArtist) return;

  const btn = document.getElementById('blockBtn');
  btn.disabled = true;
  btn.textContent = 'Blocking...';

  // Block the artist - add to local storage directly
  try {
    const data = await chrome.storage.local.get(['localBlacklist']);
    const blacklist = data.localBlacklist || [];
    const artistLower = currentArtist.toLowerCase();

    if (!blacklist.includes(artistLower)) {
      blacklist.push(artistLower);
      await chrome.storage.local.set({ localBlacklist: blacklist });
    }

    // Also notify background to flag to API
    chrome.runtime.sendMessage({ action: 'blockArtist', artist: currentArtist });
  } catch (e) {
    console.log('Error blocking:', e);
  }

  // Skip to next track
  if (currentTabId) {
    try {
      await chrome.tabs.sendMessage(currentTabId, { action: 'skipTrack' });
    } catch (e) {
      console.log('Error skipping:', e);
    }
  }

  btn.textContent = 'Blocked!';

  // Reload settings to update count
  await loadSettings();

  // Reset button after delay
  setTimeout(() => {
    btn.textContent = 'Block this artist';
    updateCurrentTrack();
  }, 1500);
}

async function saveSettings() {
  const settings = {
    localEnabled: document.getElementById('localToggle').checked,
    communityEnabled: document.getElementById('communityToggle').checked
  };
  await chrome.storage.local.set(settings);
}

async function syncCommunity() {
  const btn = document.getElementById('syncBtn');
  btn.disabled = true;
  btn.textContent = 'Syncing...';

  try {
    const response = await fetch('https://spot-the-ai.com/api/list/', {
      headers: { 'Accept': 'application/json' }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.artists) {
        await chrome.storage.local.set({
          communityBlacklist: data.artists.map(a => a.toLowerCase()),
          lastSync: Date.now()
        });
        btn.textContent = `Synced (${data.artists.length})`;
        await loadSettings();
      } else {
        btn.textContent = 'Sync failed';
      }
    } else {
      btn.textContent = 'Sync failed';
    }
  } catch (e) {
    console.log('Sync error:', e);
    btn.textContent = 'Sync failed';
  }

  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = 'Sync community blacklist';
  }, 2000);
}
