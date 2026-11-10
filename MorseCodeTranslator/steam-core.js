/*
 * Minimal compatibility layer for the wallpaper-core.js copied verbatim from
 * the user's first task (D:\SteamLens). The original SteamLens steam-core.js is
 * a 53 KB module tied to account/ledger subsystems; this software only needs
 * Steam library discovery, so we implement just those three methods.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function detectSteamRoots() {
  const out = [];
  const seen = new Set();
  const add = p => {
    try {
      if (!p || seen.has(p.toLowerCase())) return;
      if (!fs.existsSync(path.join(p, 'steamapps'))) return;
      seen.add(p.toLowerCase());
      out.push({ path: p });
    } catch { /* ignore */ }
  };
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    add(path.join(letter + ':\\', 'SteamLibrary'));
    add(path.join(letter + ':\\', 'Steam'));
    add(path.join(letter + ':\\', 'Program Files (x86)', 'Steam'));
    add(path.join(letter + ':\\', 'WeGameApps'));
  }
  if (process.env.STEAM_PATH) add(process.env.STEAM_PATH);
  return out;
}

function getConfig() {
  return { wallpaperPath: process.env.WE_HOME || '' };
}

/* libraryfolders.vdf parsing is not required here: detectSteamRoots already
   scans every drive for SteamLibrary, which covers non-default libraries. */
function vdfFile() {
  return {};
}

module.exports = { detectSteamRoots, getConfig, vdfFile };
