(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PpicSandboxCache = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const prefix = 'ppic-snapshot:v5:';
  // Per-tab session storage: survives page navigation, never shares another user's seed.
  function create(storage, identity, day, now = Date.now) {
    const key = month => prefix + JSON.stringify([identity, day, month]);
    function read(month) {
      try {
        if (!identity) return null;
        const entry = JSON.parse(storage.getItem(key(month)) || 'null');
        const seed = entry?.seed;
        return seed?.month === month && seed.fingerprint && Array.isArray(seed.nodes) && Array.isArray(seed.groups) && seed.initial ? entry : null;
      } catch (_) { return null; }
    }
    function remove(month) { try { storage.removeItem(key(month)); } catch (_) {} }
    function write(seed) {
      if (!identity) return false;
      try {
        // Bound storage and discard snapshots from previous login identities/dates.
        const ownPrefix = prefix + JSON.stringify([identity, day]).slice(0, -1) + ',';
        const entries = [];
        for (let i = 0; i < storage.length; i++) {
          const name = storage.key(i);
          if (name?.startsWith(prefix)) entries.push(name);
        }
        const savedAt = name => { try { return JSON.parse(storage.getItem(name) || '{}').savedAt || 0; } catch (_) { return 0; } };
        const keep = entries.filter(name => name.startsWith(ownPrefix) && name !== key(seed.month) && savedAt(name))
          .sort((a, b) => savedAt(b) - savedAt(a)).slice(0, 2);
        entries.filter(name => !keep.includes(name)).forEach(name => storage.removeItem(name));
        storage.setItem(key(seed.month), JSON.stringify({ savedAt: now(), seed }));
        return true;
      } catch (_) { return false; }
    }
    return { read, write, remove };
  }
  function disposition(current, incoming, active) {
    if (!current || current.month !== incoming.month) return 'replace';
    if (current.fingerprint === incoming.fingerprint) return 'unchanged';
    return active ? 'defer' : 'replace';
  }
  return { create, disposition };
});
