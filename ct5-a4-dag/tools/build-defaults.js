#!/usr/bin/env node
// build-defaults.js
//
// Regenerates js/defaults-data.js from data/node_types.default.json and
// data/filters.default.json. Run this (with Node.js) after editing either
// JSON file, IF you want those edits to become the app's built-in "New
// Scene" defaults. This step exists only because browsers block fetch()
// of local files opened via file://, so the defaults are embedded as a
// plain JS file instead of being fetched at runtime -- js/defaults-data.js
// is a generated file, not something to hand-edit.
//
// You do NOT need this to try out an edited node-types or filters file --
// use the "Load Node Types..." / "Load Filters..." buttons in the app for
// that, which load into just the current scene via a normal file picker.
//
// Usage:  node tools/build-defaults.js

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const nodeTypesPath = path.join(root, 'data', 'node_types.default.json');
const filtersPath = path.join(root, 'data', 'filters.default.json');
const outPath = path.join(root, 'js', 'defaults-data.js');

const nodeTypes = JSON.parse(fs.readFileSync(nodeTypesPath, 'utf8'));
const filters = JSON.parse(fs.readFileSync(filtersPath, 'utf8'));

const header = [
  '// defaults-data.js -- built-in defaults, embedded as JS (not fetched) so the app',
  '// works when opened directly as a local file:// page with no server and no',
  '// network fetch (browsers block fetch() of local files over file://).',
  '// This file is GENERATED from data/node_types.default.json and',
  '// data/filters.default.json by tools/build-defaults.js -- do not hand-edit it,',
  '// edit those two JSON files and re-run: node tools/build-defaults.js',
  '(function () {',
  "  'use strict';",
  '  window.DAG_DEFAULTS = {'
].join('\n');

const body =
  '    nodeTypes: ' + JSON.stringify(nodeTypes.nodeTypes, null, 2).split('\n').join('\n    ') + ',\n' +
  '    filters: ' + JSON.stringify(filters.filters, null, 2).split('\n').join('\n    ');

const footer = [
  '  };',
  '})();',
  ''
].join('\n');

fs.writeFileSync(outPath, header + '\n' + body + '\n' + footer);
console.log('Wrote ' + outPath);
