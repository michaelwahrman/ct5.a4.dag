// util.js -- small shared helpers, attached to window.DAG.Util
(function () {
  'use strict';
  window.DAG = window.DAG || {};

  function uuid() {
    // RFC4122-ish v4 UUID, using crypto when available.
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    var bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = [];
    for (var j = 0; j < 256; j++) hex.push((j + 0x100).toString(16).substr(1));
    var b = bytes;
    return (
      hex[b[0]] + hex[b[1]] + hex[b[2]] + hex[b[3]] + '-' +
      hex[b[4]] + hex[b[5]] + '-' +
      hex[b[6]] + hex[b[7]] + '-' +
      hex[b[8]] + hex[b[9]] + '-' +
      hex[b[10]] + hex[b[11]] + hex[b[12]] + hex[b[13]] + hex[b[14]] + hex[b[15]]
    );
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function pad(n, width) {
    var s = String(Math.trunc(Math.abs(n)));
    while (s.length < width) s = '0' + s;
    return (n < 0 ? '-' : '') + s;
  }

  // Trigger a browser "Save As" download of arbitrary text content.
  function downloadTextFile(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // Open a native file picker restricted to the given accept string, and
  // resolve with { name, text }. Rejects if the user cancels (no event fires;
  // caller supplies onCancelHint timeout is not used -- we just never resolve,
  // which is fine for a modal-driven UI).
  function pickTextFile(accept) {
    return new Promise(function (resolve, reject) {
      var input = document.createElement('input');
      input.type = 'file';
      if (accept) input.accept = accept;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        document.body.removeChild(input);
        if (!file) { reject(new Error('No file selected')); return; }
        var reader = new FileReader();
        reader.onload = function () { resolve({ name: file.name, text: String(reader.result) }); };
        reader.onerror = function () { reject(reader.error || new Error('Read failed')); };
        reader.readAsText(file);
      });
      document.body.appendChild(input);
      input.click();
    });
  }

  function safeFileNameSegment(s) {
    return String(s || '').replace(/[^a-zA-Z0-9_\-.]+/g, '_');
  }

  window.DAG.Util = {
    uuid: uuid,
    clamp: clamp,
    deepClone: deepClone,
    pad: pad,
    downloadTextFile: downloadTextFile,
    pickTextFile: pickTextFile,
    safeFileNameSegment: safeFileNameSegment
  };
})();
