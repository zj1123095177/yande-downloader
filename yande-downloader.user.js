// ==UserScript==
// @name         Yande.re Direct Downloader
// @namespace    https://github.com/yande-downloader
// @version      3.0
// @description  One-click save yande.re images to custom local folders
// @author       You
// @match        https://yande.re/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      files.yande.re
// ==/UserScript==

(function () {
  'use strict';

  const DB_NAME = 'yande-downloader';
  const DB_VERSION = 2;
  const DB_STORE = 'paths';

  // --- IndexedDB ---
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        for (const name of db.objectStoreNames) {
          if (name !== DB_STORE) db.deleteObjectStore(name);
        }
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  async function dbPut(key, value) {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key);
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error); };
    });
  }

  async function dbGet(key) {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(key);
    return new Promise((resolve, reject) => {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  async function dbDelete(key) {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(key);
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error); };
    });
  }

  async function dbGetAllKeys() {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).getAllKeys();
    return new Promise((resolve, reject) => {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  // --- Path CRUD ---
  async function loadAllPaths() {
    const keys = await dbGetAllKeys();
    const results = [];
    for (const key of keys) {
      const data = await dbGet(key);
      if (data) results.push({ id: key, name: data.name, handle: data.handle });
    }
    return results;
  }

  async function savePath(id, name, handle) {
    await dbPut(id, { name: name, handle: handle || null });
  }

  async function removePath(id) {
    await dbDelete(id);
  }

  async function updatePathHandle(id, handle) {
    const existing = await dbGet(id);
    if (existing) {
      existing.handle = handle;
      await dbPut(id, existing);
    }
  }

  // --- Image helpers ---
  function getImageUrl() {
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const match = s.textContent.match(/"file_url":"([^"]+)"/);
      if (match) return match[1].replace(/\\\//g, '/');
    }
    const link = document.getElementById('highres');
    return link ? link.href : null;
  }

  function getFilename(imageUrl) {
    if (!imageUrl) return 'image_' + Date.now();
    const name = decodeURIComponent(imageUrl.split('/').pop().split('?')[0]);
    return name || 'image_' + Date.now();
  }

  function fetchImageBlob(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        responseType: 'blob',
        headers: { Referer: 'https://yande.re/' },
        onload: function (resp) {
          if (resp.status === 200) resolve(resp.response);
          else reject(new Error('HTTP ' + resp.status));
        },
        onerror: function () { reject(new Error('Network error')); }
      });
    });
  }

  async function writeFileToDir(dirHandle, blob, filename) {
    // Try writing directly first (handle may already have permission from showDirectoryPicker)
    try {
      const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      // If permission denied, request and retry
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
        const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') throw new Error('Folder write permission denied');
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      }
      throw e;
    }
  }

  // --- Download Action ---
  async function doDownload(pathId) {
    const apiSupported = typeof showDirectoryPicker !== 'undefined';

    const pathData = await dbGet(pathId);
    if (!pathData || !pathData.handle) {
      document.getElementById('yd-dl-status').textContent = 'Path not configured. Choose a folder in settings.';
      document.getElementById('yd-dl-status').style.color = '#c00';
      return;
    }

    const imageUrl = getImageUrl();
    if (!imageUrl) {
      document.getElementById('yd-dl-status').textContent = 'Cannot find image URL.';
      document.getElementById('yd-dl-status').style.color = '#c00';
      return;
    }

    const statusEl = document.getElementById('yd-dl-status');
    statusEl.textContent = 'Fetching...';
    statusEl.style.color = '#f0a000';

    try {
      const filename = getFilename(imageUrl);
      const blob = await fetchImageBlob(imageUrl);
      statusEl.textContent = 'Writing...';
      await writeFileToDir(pathData.handle, blob, filename);
      statusEl.textContent = 'Saved: ' + filename;
      statusEl.style.color = '#0a0';
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.style.color = '#c00';
    }
  }

  // --- Settings Panel ---
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  async function renderPathList() {
    const container = document.getElementById('yd-paths-list');
    if (typeof showDirectoryPicker === 'undefined') {
      document.getElementById('yd-browser-warn').style.display = 'block';
    }
    const paths = await loadAllPaths();
    container.innerHTML = '';

    if (paths.length === 0) {
      container.innerHTML = '<div style="color:#666; padding:8px 0;">No paths configured. Click "+ Add Path" below.</div>';
      return;
    }

    paths.forEach(p => {
      const row = document.createElement('div');
      row.className = 'yd-path-row';
      row.dataset.id = p.id;
      const dirName = p.handle ? p.handle.name : '(not chosen)';
      row.innerHTML = `
        <input class="yd-name-input" placeholder="Name" value="${escHtml(p.name)}" />
        <button class="yd-pick-btn">Choose Folder</button>
        <span class="yd-dir-label">${escHtml(dirName)}</span>
        <button class="yd-remove-btn" title="Remove">&times;</button>
      `;

      row.querySelector('.yd-pick-btn').addEventListener('click', async function () {
        try {
          const handle = await showDirectoryPicker();
          await updatePathHandle(p.id, handle);
          row.querySelector('.yd-dir-label').textContent = handle.name;
        } catch (e) {
          if (e.name !== 'AbortError') console.error(e);
        }
      });

      row.querySelector('.yd-remove-btn').addEventListener('click', async function () {
        if (confirm('Remove "' + (p.name || p.id) + '"?')) {
          await removePath(p.id);
          renderPathList();
          if (/\/post\/show\//.test(location.pathname)) refreshDownloadButtons();
        }
      });

      // Auto-save name on blur
      row.querySelector('.yd-name-input').addEventListener('change', async function () {
        const newName = this.value.trim();
        p.name = newName;
        await savePath(p.id, newName, p.handle);
      });

      container.appendChild(row);
    });
  }

  async function addPath() {
    const id = genId();
    await savePath(id, '', null);
    await renderPathList();
  }

  function createSettingsPanel() {
    const panel = document.createElement('div');
    panel.id = 'yd-settings-panel';
    panel.innerHTML = `
      <div class="yd-panel-header">
        <span>Yande Downloader</span>
        <button id="yd-panel-close">&times;</button>
      </div>
      <div class="yd-panel-body">
        <div id="yd-browser-warn" style="display:none; color:#f66; margin-bottom:10px; font-size:12px;">
          Your browser does not support File System Access API.<br/>Please use <b>Chrome 86+</b> or <b>Edge 86+</b>.
        </div>
        <div id="yd-paths-list"></div>
        <button id="yd-add-path">+ Add Path</button>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('yd-panel-close').addEventListener('click', () => {
      panel.style.display = 'none';
    });

    document.getElementById('yd-add-path').addEventListener('click', addPath);
  }

  // --- Toggle Button ---
  function createToggleButton() {
    const btn = document.createElement('button');
    btn.id = 'yd-toggle-btn';
    btn.innerHTML = '&#9881;';
    btn.title = 'Yande Downloader Settings';
    document.body.appendChild(btn);

    btn.addEventListener('click', () => {
      const panel = document.getElementById('yd-settings-panel');
      const opening = panel.style.display === 'none';
      panel.style.display = opening ? 'block' : 'none';
      if (opening) renderPathList();
    });
  }

  // --- Detail Page Download Buttons ---
  async function refreshDownloadButtons() {
    const old = document.getElementById('yd-dl-buttons');
    if (old) old.remove();
    await createDownloadButtons();
  }

  async function createDownloadButtons() {
    const sidebar = document.querySelector('#content .sidebar');
    if (!sidebar) return;

    const paths = await loadAllPaths();
    const configured = paths.filter(p => p.name && p.handle);
    if (configured.length === 0) return;

    const container = document.createElement('div');
    container.id = 'yd-dl-buttons';
    let html = '<h5>Save To</h5>';
    configured.forEach(p => {
      html += `<div class="yd-dl-row">
        <button data-yd-id="${p.id}">${escHtml(p.name)}</button>
        <span class="yd-path-label">${escHtml(p.handle.name)}</span>
      </div>`;
    });
    html += '<div id="yd-dl-status"></div>';
    container.innerHTML = html;
    sidebar.appendChild(container);

    container.querySelectorAll('button[data-yd-id]').forEach(btn => {
      btn.addEventListener('click', function () {
        doDownload(this.dataset.ydId);
      });
    });
  }

  // --- Styles ---
  GM_addStyle(`
    #yd-toggle-btn {
      position: fixed; bottom: 20px; right: 20px; z-index: 9999;
      width: 42px; height: 42px; border-radius: 50%;
      border: 2px solid #ff7090; background: #1a1a1a; color: #ff7090;
      font-size: 20px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s;
    }
    #yd-toggle-btn:hover { background: #ff7090; color: #1a1a1a; }

    #yd-settings-panel {
      display: none; position: fixed; bottom: 70px; right: 20px; z-index: 9998;
      width: 460px; max-height: 70vh; overflow-y: auto;
      background: #1a1a2e; border: 2px solid #ff7090;
      border-radius: 8px; color: #ddd; font-size: 13px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    }
    .yd-panel-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 14px; border-bottom: 1px solid #333;
      font-weight: bold; color: #ff7090; position: sticky; top: 0;
      background: #1a1a2e; z-index: 1;
    }
    .yd-panel-header button {
      background: none; border: none; color: #ff7090; font-size: 18px; cursor: pointer;
    }
    .yd-panel-body { padding: 14px; }
    .yd-path-row {
      display: flex; gap: 6px; margin-bottom: 8px; align-items: center;
    }
    .yd-name-input {
      width: 130px; flex-shrink: 0; padding: 5px 8px;
      border: 1px solid #444; border-radius: 4px;
      background: #0d0d1a; color: #eee; font-size: 12px;
    }
    .yd-name-input:focus { border-color: #ff7090; outline: none; }
    .yd-pick-btn {
      padding: 5px 10px; border: 1px solid #ff7090; border-radius: 4px;
      background: transparent; color: #ff7090; cursor: pointer; font-size: 12px;
      flex-shrink: 0; white-space: nowrap;
    }
    .yd-pick-btn:hover { background: #ff7090; color: #1a1a1a; }
    .yd-dir-label { color: #8af; font-size: 11px; word-break: break-all; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .yd-remove-btn {
      background: none; border: 1px solid #c44; border-radius: 4px;
      color: #c44; cursor: pointer; font-size: 14px; padding: 3px 8px;
      line-height: 1; flex-shrink: 0;
    }
    .yd-remove-btn:hover { background: #c44; color: #fff; }
    #yd-add-path {
      margin-top: 6px; padding: 5px 12px; border: 1px dashed #ff7090; border-radius: 4px;
      background: transparent; color: #ff7090; cursor: pointer; font-size: 12px;
    }
    #yd-add-path:hover { background: rgba(255,112,144,0.1); }

    /* Detail page */
    #yd-dl-buttons { margin-top: 16px; }
    #yd-dl-buttons h5 { margin: 0 0 8px; color: #ff7090; }
    .yd-dl-row { margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
    .yd-dl-row button {
      padding: 5px 12px; border: 1px solid #ff7090; border-radius: 4px;
      background: transparent; color: #ff7090; cursor: pointer; font-size: 12px;
    }
    .yd-dl-row button:hover { background: #ff7090; color: #1a1a1a; }
    .yd-path-label { color: #777; font-size: 11px; }
    #yd-dl-status { margin-top: 8px; font-size: 12px; }
  `);

  // --- Init ---
  createToggleButton();
  createSettingsPanel();

  if (/\/post\/show\//.test(location.pathname)) {
    createDownloadButtons();
  }
})();
