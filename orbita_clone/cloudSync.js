const { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const AdmZip = require('adm-zip');

class CloudSyncManager {
  constructor(appDataDir, profilesFile, profilesDir) {
    this.appDataDir = appDataDir;
    this.profilesFile = profilesFile;
    this.profilesDir = profilesDir;
    this.configFile = path.join(appDataDir, 'cloud_config.json');
    this.client = null;
    this.config = this.loadConfig();
    this.initClient();
  }

  normalizeEndpoint(ep) {
    if (!ep) return '';
    let clean = ep.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(clean)) {
      clean = 'http://' + clean;
    }
    return clean;
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const parsed = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        if (parsed.endpoint) parsed.endpoint = this.normalizeEndpoint(parsed.endpoint);
        return parsed;
      }
    } catch (e) {}
    return {
      enabled: false,
      provider: 'minio',
      endpoint: '',
      region: 'us-east-1',
      bucket: 'orbita-profiles',
      accessKey: '',
      secretKey: '',
      autoSyncOnLaunch: true,
      autoSyncOnClose: true,
      lastSync: null
    };
  }

  saveConfig(newConfig) {
    if (newConfig.endpoint) {
      newConfig.endpoint = this.normalizeEndpoint(newConfig.endpoint);
    }
    this.config = { ...this.config, ...newConfig };
    fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf8');
    this.initClient();
    return this.config;
  }

  initClient() {
    if (!this.config.endpoint || !this.config.accessKey || !this.config.secretKey) {
      this.client = null;
      return;
    }

    try {
      const endpoint = this.normalizeEndpoint(this.config.endpoint);
      this.client = new S3Client({
        endpoint,
        region: this.config.region || 'us-east-1',
        credentials: {
          accessKeyId: this.config.accessKey,
          secretAccessKey: this.config.secretKey
        },
        forcePathStyle: true // Essential for MinIO, Ceph, and self-hosted S3
      });
    } catch (err) {
      console.error('[CloudSync] Failed to initialize S3 client:', err.message);
      this.client = null;
    }
  }

  async testConnection(overrideConfig = null) {
    const rawCfg = overrideConfig || this.config;
    const cfg = {
      ...rawCfg,
      endpoint: this.normalizeEndpoint(rawCfg.endpoint)
    };

    if (!cfg.endpoint || !cfg.accessKey || !cfg.secretKey || !cfg.bucket) {
      return { success: false, error: 'Endpoint, Bucket, Access Key, and Secret Key are all required' };
    }

    const testClient = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region || 'us-east-1',
      credentials: {
        accessKeyId: cfg.accessKey,
        secretAccessKey: cfg.secretKey
      },
      forcePathStyle: true
    });

    const start = Date.now();
    try {
      // Test bucket access
      await testClient.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
      const latencyMs = Date.now() - start;
      return { success: true, latencyMs, message: `Successfully connected to MinIO/S3 bucket '${cfg.bucket}' (${latencyMs}ms)` };
    } catch (err) {
      const latencyMs = Date.now() - start;

      // If 404, offer to auto-create bucket
      if (err.$metadata?.httpStatusCode === 404 || err.name === 'NotFound') {
        try {
          await testClient.send(new CreateBucketCommand({ Bucket: cfg.bucket }));
          return { success: true, latencyMs, message: `Connected! Created missing bucket '${cfg.bucket}' automatically.` };
        } catch (createErr) {
          return { success: false, latencyMs, error: `Bucket not found and could not create: ${createErr.message}` };
        }
      }

      // Check if domain is pointing to MinIO Web Console (port 9001) instead of S3 API (port 9000)
      if (err.name === 'UnknownError' || err.message === 'UnknownError' || err.$metadata?.httpStatusCode === 400 || !err.$metadata?.httpStatusCode) {
        try {
          const checkRes = await fetch(cfg.endpoint, { method: 'GET' });
          const text = await checkRes.text();
          const serverHdr = checkRes.headers.get('server') || '';
          if (serverHdr.includes('MinIO Console') || text.includes('MinIO Console') || text.includes('<title>Console</title>')) {
            return {
              success: false,
              latencyMs,
              error: 'This URL connects to MinIO Web Console (Port 9001), not the S3 Storage API (Port 9000). In Dokploy, add a domain pointing to Container Port 9000 (e.g. s3-storage-minio...).'
            };
          }
        } catch (probeErr) {}
      }

      return { success: false, latencyMs, error: err.message || 'Connection failed' };
    }
  }

  // Compress a profile session directory into an in-memory buffer (preserving cookies, passwords, sessions, localStorage)
  async zipProfileDirectory(profDir) {
    return new Promise((resolve, reject) => {
      try {
        const zip = new AdmZip();
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

        function addDirRecursive(dirPath, rootPath) {
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            if (shouldIgnore(entry.name)) continue;
            const fullPath = path.join(dirPath, entry.name);
            const relPath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

            if (entry.isDirectory()) {
              addDirRecursive(fullPath, rootPath);
            } else if (entry.isFile()) {
              try {
                const fileData = fs.readFileSync(fullPath);
                zip.addFile(relPath, fileData);
              } catch (e) {}
            }
          }
        }

        addDirRecursive(profDir, profDir);
        const buffer = zip.toBuffer();
        resolve(buffer);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Upload single profile (metadata + session zip)
  async uploadProfile(profileId) {
    if (!this.client || !this.config.bucket) {
      throw new Error('Cloud storage not configured or connected');
    }

    const profDir = path.join(this.profilesDir, profileId);
    let sessionZipBuffer = null;
    if (fs.existsSync(profDir)) {
      sessionZipBuffer = await this.zipProfileDirectory(profDir);
    }

    let profiles = [];
    try {
      profiles = JSON.parse(fs.readFileSync(this.profilesFile, 'utf8'));
    } catch (e) {}

    const profileMeta = profiles.find(p => p.id === profileId);

    // 1. Upload metadata.json
    if (profileMeta) {
      await this.client.send(new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: `profiles/${profileId}/metadata.json`,
        Body: JSON.stringify(profileMeta, null, 2),
        ContentType: 'application/json'
      }));
    }

    // 2. Upload session.zip if data exists
    if (sessionZipBuffer && sessionZipBuffer.length > 0) {
      await this.client.send(new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: `profiles/${profileId}/session.zip`,
        Body: sessionZipBuffer,
        ContentType: 'application/zip'
      }));
    }

    this.config.lastSync = new Date().toISOString();
    this.saveConfig({ lastSync: this.config.lastSync });

    return {
      success: true,
      profileId,
      sessionSizeKb: sessionZipBuffer ? Math.round(sessionZipBuffer.length / 1024) : 0,
      timestamp: this.config.lastSync
    };
  }

  // Download single profile from Cloud
  async downloadProfile(profileId) {
    if (!this.client || !this.config.bucket) {
      throw new Error('Cloud storage not configured or connected');
    }

    // 1. Download metadata
    try {
      const metaRes = await this.client.send(new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: `profiles/${profileId}/metadata.json`
      }));
      const metaStr = await metaRes.Body.transformToString();
      const remoteMeta = JSON.parse(metaStr);

      let profiles = [];
      try {
        profiles = JSON.parse(fs.readFileSync(this.profilesFile, 'utf8'));
      } catch (e) {}

      const idx = profiles.findIndex(p => p.id === profileId);
      if (idx !== -1) {
        profiles[idx] = { ...profiles[idx], ...remoteMeta };
      } else {
        profiles.push(remoteMeta);
      }
      fs.writeFileSync(this.profilesFile, JSON.stringify(profiles, null, 2), 'utf8');
    } catch (e) {
      console.warn(`[CloudSync] Notice: no remote metadata for ${profileId}`);
    }

    // 2. Download session.zip
    try {
      const sessionRes = await this.client.send(new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: `profiles/${profileId}/session.zip`
      }));
      const byteArray = await sessionRes.Body.transformToByteArray();
      const zipBuffer = Buffer.from(byteArray);

      const targetDir = path.join(this.profilesDir, profileId);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

      const zip = new AdmZip(zipBuffer);
      zip.extractAllTo(targetDir, true);
    } catch (e) {
      console.warn(`[CloudSync] Notice: no remote session zip for ${profileId}`);
    }

    return { success: true, profileId };
  }

  // Push all local profiles and index to Cloud
  async syncAllToCloud() {
    if (!this.client || !this.config.bucket) {
      throw new Error('Cloud storage not configured or connected');
    }

    let profiles = [];
    try {
      profiles = JSON.parse(fs.readFileSync(this.profilesFile, 'utf8'));
    } catch (e) {}

    // Upload index manifest
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: 'profiles_index.json',
      Body: JSON.stringify(profiles, null, 2),
      ContentType: 'application/json'
    }));

    const results = [];
    for (const p of profiles) {
      try {
        const res = await this.uploadProfile(p.id);
        results.push({ id: p.id, name: p.name, success: true, sizeKb: res.sessionSizeKb });
      } catch (err) {
        results.push({ id: p.id, name: p.name, success: false, error: err.message });
      }
    }

    this.config.lastSync = new Date().toISOString();
    this.saveConfig({ lastSync: this.config.lastSync });

    return {
      success: true,
      totalSynced: results.filter(r => r.success).length,
      timestamp: this.config.lastSync,
      details: results
    };
  }

  // Pull all profiles and index from Cloud
  async syncAllFromCloud() {
    if (!this.client || !this.config.bucket) {
      throw new Error('Cloud storage not configured or connected');
    }

    // Download index manifest
    try {
      const idxRes = await this.client.send(new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: 'profiles_index.json'
      }));
      const idxStr = await idxRes.Body.transformToString();
      const remoteProfiles = JSON.parse(idxStr);

      let localProfiles = [];
      try {
        localProfiles = JSON.parse(fs.readFileSync(this.profilesFile, 'utf8'));
      } catch (e) {}

      for (const rp of remoteProfiles) {
        const lIdx = localProfiles.findIndex(lp => lp.id === rp.id);
        if (lIdx === -1) {
          localProfiles.push(rp);
        } else {
          localProfiles[lIdx] = { ...localProfiles[lIdx], ...rp };
        }
        await this.downloadProfile(rp.id);
      }

      fs.writeFileSync(this.profilesFile, JSON.stringify(localProfiles, null, 2), 'utf8');

      this.config.lastSync = new Date().toISOString();
      this.saveConfig({ lastSync: this.config.lastSync });

      return {
        success: true,
        restoredCount: remoteProfiles.length,
        timestamp: this.config.lastSync
      };
    } catch (err) {
      throw new Error(`Failed to pull from cloud: ${err.message}`);
    }
  }
}

module.exports = CloudSyncManager;
