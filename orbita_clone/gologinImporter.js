const fs = require('fs');
const path = require('path');

function getGoLoginCandidateDirs() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [];

  if (process.platform === 'linux') {
    candidates.push(path.join(home, '.config', 'GoLogin', 'profiles'));
    candidates.push(path.join(home, '.config', 'gologin', 'profiles'));
    candidates.push(path.join(home, '.config', 'Gologin', 'profiles'));
    candidates.push(path.join(home, '.gologin', 'gologin-cached-profiles'));
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    candidates.push(path.join(appData, 'GoLogin', 'profiles'));
    candidates.push(path.join(appData, 'gologin', 'profiles'));
    candidates.push(path.join(home, '.gologin', 'gologin-cached-profiles'));
  } else if (process.platform === 'darwin') {
    candidates.push(path.join(home, 'Library', 'Application Support', 'GoLogin', 'profiles'));
    candidates.push(path.join(home, 'Library', 'Application Support', 'gologin', 'profiles'));
    candidates.push(path.join(home, '.gologin', 'gologin-cached-profiles'));
  }

  return candidates.filter(dir => fs.existsSync(dir));
}

// Scans system for official GoLogin profiles and returns structured metadata
function detectGoLoginProfiles(currentProfiles = [], customDir = null) {
  const dirs = getGoLoginCandidateDirs();
  if (customDir && typeof customDir === 'string' && fs.existsSync(customDir.trim())) {
    const cleanDir = customDir.trim();
    if (!dirs.includes(cleanDir)) {
      dirs.unshift(cleanDir);
    }
  }

  const detected = [];
  const existingIds = new Set(currentProfiles.map(p => p.originalGoLoginId || p.id));
  const existingNames = new Set(currentProfiles.map(p => p.name));
  const processedDirs = new Set();

  for (const baseDir of dirs) {
    // Case A: baseDir itself is a profile directory (contains Default/Preferences)
    const directPref = path.join(baseDir, 'Default', 'Preferences');
    if (fs.existsSync(directPref)) {
      if (!processedDirs.has(baseDir)) {
        processedDirs.add(baseDir);
        processProfileFolder(baseDir, path.basename(baseDir), detected, existingIds, existingNames);
      }
      continue;
    }

    // Case B: baseDir contains subdirectories for profiles
    let entries = [];
    try {
      entries = fs.readdirSync(baseDir, { withFileTypes: true });
    } catch (e) {
      continue;
    }

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const profileFolder = path.join(baseDir, ent.name);
      if (processedDirs.has(profileFolder)) continue;
      processedDirs.add(profileFolder);
      processProfileFolder(profileFolder, ent.name, detected, existingIds, existingNames);
    }
  }

  return detected;
}

function processProfileFolder(profileFolder, profileId, detected, existingIds, existingNames) {
  const prefFile = path.join(profileFolder, 'Default', 'Preferences');
  if (!fs.existsSync(prefFile)) return;

  try {
    const prefContent = JSON.parse(fs.readFileSync(prefFile, 'utf8'));
    const gl = prefContent.gologin || {};

    let profileName = gl.name;
    if (!profileName || profileName === 'None') {
      profileName = `GoLogin Profile (${profileId.slice(0, 6)})`;
    }

    // Check for cookies
    const netCookiesPath = path.join(profileFolder, 'Default', 'Network', 'Cookies');
    const legacyCookiesPath = path.join(profileFolder, 'Default', 'Cookies');
    let cookieSizeKb = 0;
    if (fs.existsSync(netCookiesPath)) {
      cookieSizeKb = Math.round(fs.statSync(netCookiesPath).size / 1024);
    } else if (fs.existsSync(legacyCookiesPath)) {
      cookieSizeKb = Math.round(fs.statSync(legacyCookiesPath).size / 1024);
    }

    // Check for saved passwords
    const loginDataPath = path.join(profileFolder, 'Default', 'Login Data');
    const hasSavedPasswords = fs.existsSync(loginDataPath) && fs.statSync(loginDataPath).size > 10000;

    detected.push({
      sourceDir: profileFolder,
      goLoginId: profileId,
      name: profileName,
      proxy: gl.proxy || { mode: 'none' },
      userAgent: gl.userAgent || '',
      resolution: `${gl.screenWidth || 1920}x${gl.screenHeight || 1080}`,
      cpuCores: gl.hardwareConcurrency || 8,
      ramGb: gl.deviceMemory ? Math.round(gl.deviceMemory / 1024) : 8,
      cookieSizeKb,
      hasSavedPasswords,
      alreadyImported: existingIds.has(profileId) || existingNames.has(profileName),
      preferences: gl
    });
  } catch (err) {}
}

// Copy session data excluding massive caches
function copyProfileDataExcludingCache(srcDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const IGNORE_PATTERNS = [
    'Cache', 'Code Cache', 'Crashpad', 'GPUCache', 'GrShaderCache', 'ShaderCache', 
    'DawnWebGPUCache', 'DawnGraphiteCache', 'cache2', 'crashes', 'BrowserMetrics',
    'CacheStorage', 'ScriptCache', 'component_crx_cache', 'extensions_crx_cache', 
    'startupCache', 'Shared Dictionary'
  ];

  function shouldIgnore(name) {
    if (IGNORE_PATTERNS.includes(name)) return true;
    if (name.endsWith('.lock') || name === 'lock' || name === '.parentlock' || name.startsWith('Singleton')) return true;
    if (name.endsWith('.pma') || name.endsWith('.log') || name.endsWith('.tmp')) return true;
    return false;
  }

  function copyRecursive(src, dst) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const ent of entries) {
      if (shouldIgnore(ent.name)) continue;
      const srcPath = path.join(src, ent.name);
      const dstPath = path.join(dst, ent.name);

      if (ent.isDirectory()) {
        if (!fs.existsSync(dstPath)) fs.mkdirSync(dstPath, { recursive: true });
        copyRecursive(srcPath, dstPath);
      } else if (ent.isFile()) {
        try {
          fs.copyFileSync(srcPath, dstPath);
        } catch (e) {}
      }
    }
  }

  copyRecursive(srcDir, destDir);
}

// Imports selected GoLogin profiles into Orbita
function importGoLoginProfiles({ selectedIds = [], customDir = null, PROFILES_FILE, PROFILES_DIR, readProfilesFn, saveProfilesFn }) {
  const currentProfiles = readProfilesFn();
  const detected = detectGoLoginProfiles(currentProfiles, customDir);
  
  const toImport = detected.filter(p => {
    if (selectedIds.length > 0) return selectedIds.includes(p.goLoginId);
    return true;
  });

  const importedProfiles = [];

  for (const item of toImport) {
    const gl = item.preferences || {};
    const newProfileId = `prof_gl_${item.goLoginId.slice(0, 12)}`;
    const destProfileDataDir = path.join(PROFILES_DIR, newProfileId);

    // 1. Copy session files (cookies, passwords, logins, autofill, localstorage)
    try {
      copyProfileDataExcludingCache(item.sourceDir, destProfileDataDir);
    } catch (err) {
      console.error(`Failed to copy profile data for ${item.name}:`, err.message);
    }

    // 2. Build Orbita profile object
    const newProfile = {
      id: newProfileId,
      name: item.name,
      tags: ['GoLogin', 'Imported'],
      notes: `Imported directly from official GoLogin desktop installation on ${new Date().toLocaleDateString()}. Includes all active cookies and saved passwords.`,
      engine: 'orbita',
      proxy: {
        mode: item.proxy?.mode === 'socks5' ? 'socks5' : (item.proxy?.mode === 'socks4' ? 'socks4' : (item.proxy?.mode === 'http' ? 'http' : 'none')),
        host: item.proxy?.host || '',
        port: item.proxy?.port || '',
        username: item.proxy?.username || '',
        password: item.proxy?.password || ''
      },
      fingerprint: {
        os: gl.navigator?.platform === 'Win32' ? 'Windows' : (gl.navigator?.platform === 'Linux' ? 'Linux Ubuntu' : 'Mac OS'),
        userAgent: gl.userAgent || 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36',
        screenResolution: item.resolution,
        cpuCores: item.cpuCores,
        ramGb: item.ramGb,
        webglVendor: gl.webGl?.vendor || 'Google Inc. (Mesa)',
        webglRenderer: gl.webGl?.renderer || 'ANGLE (Mesa, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)',
        canvasNoise: Boolean(gl.canvasNoise),
        webglNoise: Boolean(gl.webglNoiseValue),
        audioNoise: Boolean(gl.audioContext?.enable),
        webrtcMode: gl.webRTC?.mode || 'altered',
        timezoneMode: 'auto',
        language: gl.languages || 'en-US,en;q=0.9',
        doNotTrack: Boolean(gl.doNotTrack)
      },
      createdAt: new Date().toISOString(),
      lastLaunched: null,
      originalGoLoginId: item.goLoginId
    };

    // Remove existing if duplicate
    const existingIndex = currentProfiles.findIndex(p => p.originalGoLoginId === item.goLoginId || p.id === newProfileId);
    if (existingIndex !== -1) {
      currentProfiles[existingIndex] = newProfile;
    } else {
      currentProfiles.push(newProfile);
    }

    importedProfiles.push(newProfile);
  }

  saveProfilesFn(currentProfiles);

  return {
    success: true,
    count: importedProfiles.length,
    imported: importedProfiles
  };
}

module.exports = {
  detectGoLoginProfiles,
  importGoLoginProfiles,
  getGoLoginCandidateDirs
};
