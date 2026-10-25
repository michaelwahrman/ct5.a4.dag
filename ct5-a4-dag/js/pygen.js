// pygen.js -- generates PREVIEW python command lines for each node.
// Nothing here is executed; it only shows what a server-side executor
// might run, per node, given the current graph + current frame(s).
// Attached to window.DAG.PyGen
(function () {
  'use strict';
  window.DAG = window.DAG || {};
  var Scene = window.DAG.Scene;
  var U = window.DAG.Util;

  var WORK_DIR = 'work'; // relative "working directory" used for generated filenames
  var DEFAULT_EXT = '.exr';

  // Topologically order node ids (Kahn's algorithm). Any nodes left over
  // (because they're part of a cycle that slipped in via manual file edits)
  // are appended at the end, flagged via the returned `cyclic` list.
  function topoOrder(scene) {
    var ids = scene.nodes.map(function (n) { return n.id; });
    var indeg = {};
    ids.forEach(function (id) { indeg[id] = 0; });
    scene.links.forEach(function (l) {
      if (indeg[l.to.node] !== undefined) indeg[l.to.node]++;
    });
    var queue = ids.filter(function (id) { return indeg[id] === 0; });
    var order = [];
    var indegWork = Object.assign({}, indeg);
    while (queue.length) {
      var id = queue.shift();
      order.push(id);
      scene.links.forEach(function (l) {
        if (l.from.node === id) {
          indegWork[l.to.node]--;
          if (indegWork[l.to.node] === 0) queue.push(l.to.node);
        }
      });
    }
    var remaining = ids.filter(function (id) { return order.indexOf(id) === -1; });
    return { order: order, cyclic: remaining };
  }

  function safeName(s) {
    return U.safeFileNameSegment(s);
  }

  function extForPort(node, nodeType, portName) {
    // Nodes that write to disk with their own suffix attribute (write_output,
    // image_sequence_input) drive the extension from that attribute instead.
    if (node.attributes && typeof node.attributes.suffix === 'string' && node.attributes.suffix) {
      return node.attributes.suffix;
    }
    return DEFAULT_EXT;
  }

  function workingFilename(scene, node, nodeType, portName, frame) {
    var multiOut = (nodeType.outputs || []).length > 1;
    var frame4 = U.pad(frame, 4);
    var base = safeName(node.name) + (multiOut ? '.' + safeName(portName) : '') + '.' + frame4 + extForPort(node, nodeType, portName);
    return WORK_DIR + '/' + base;
  }

  function formatAttrValue(attrDef, value) {
    if (attrDef && attrDef.type === 'color4' && Array.isArray(value)) {
      return value.map(function (v) { return Number(v).toFixed(4); }).join(',');
    }
    if (Array.isArray(value)) return value.join(',');
    if (value === null || value === undefined) return '';
    return String(value);
  }

  // Compute, for every (nodeId, outputPortName), either a working filename
  // (image/channel ports) or an inline literal value (color ports).
  function computeOutputBindings(scene, frame) {
    var bindings = {}; // key: nodeId + '::' + portName -> { kind:'file'|'literal', value:string }
    scene.nodes.forEach(function (node) {
      var nt = Scene.findNodeType(scene, node.typeId);
      if (!nt) return;
      (nt.outputs || []).forEach(function (out) {
        var key = node.id + '::' + out.name;
        if (out.portType === 'color') {
          var colorAttr = (nt.attributes || []).find(function (a) { return a.type === 'color4'; });
          var val = colorAttr ? node.attributes[colorAttr.name] : [1, 1, 1, 1];
          bindings[key] = { kind: 'literal', value: formatAttrValue(colorAttr, val) };
        } else {
          bindings[key] = { kind: 'file', value: workingFilename(scene, node, nt, out.name, frame) };
        }
      });
    });
    return bindings;
  }

  function substituteTemplate(template, ctx) {
    return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, function (whole, key) {
      if (Object.prototype.hasOwnProperty.call(ctx, key)) return ctx[key];
      return whole; // leave unresolved placeholders visible rather than silently dropping them
    });
  }

  // Build the command + context for a single node at a single frame.
  function commandForNode(scene, node, frame, bindings) {
    var nt = Scene.findNodeType(scene, node.typeId);
    var warnings = [];
    if (!nt) {
      return { nodeId: node.id, nodeName: node.name, frame: frame, command: null, warnings: ['Unknown node type "' + node.typeId + '"'] };
    }
    if (!node.active) {
      return { nodeId: node.id, nodeName: node.name, frame: frame, command: null, warnings: ['Node is inactive (skipped).'] };
    }
    var ctx = {
      frame: String(frame),
      frame4: U.pad(frame, 4),
      'scene.name': scene.name || 'untitled',
      'scene.fps': String(scene.fps),
      'scene.resX': String(scene.resolution.x),
      'scene.resY': String(scene.resolution.y),
      'scene.proxyResX': String(scene.proxyResolution.x),
      'scene.proxyResY': String(scene.proxyResolution.y)
    };

    (nt.attributes || []).forEach(function (a) {
      ctx['attr.' + a.name] = formatAttrValue(a, node.attributes[a.name]);
    });

    (nt.inputs || []).forEach(function (inp) {
      var link = scene.links.find(function (l) { return l.to.node === node.id && l.to.port === inp.name; });
      if (!link) {
        ctx['in.' + inp.name] = '<UNCONNECTED>';
        warnings.push('Input "' + inp.name + '" is not connected.');
        return;
      }
      var b = bindings[link.from.node + '::' + link.from.port];
      ctx['in.' + inp.name] = b ? b.value : '<UNRESOLVED>';
    });

    (nt.outputs || []).forEach(function (out) {
      var b = bindings[node.id + '::' + out.name];
      ctx['out.' + out.name] = b ? b.value : '<UNRESOLVED>';
    });

    var template = nt.pythonTemplate || ('# no pythonTemplate defined for node type "' + nt.typeId + '"');
    var command = substituteTemplate(template, ctx);
    return { nodeId: node.id, nodeName: node.name, typeId: node.typeId, frame: frame, command: command, warnings: warnings };
  }

  // Generate preview commands for the whole scene at the given frame list
  // (defaults to just the scene's current frame), in dependency order.
  function generateCommands(scene, frames) {
    frames = frames && frames.length ? frames : [scene.currentFrame];
    var topo = topoOrder(scene);
    var results = [];
    if (topo.cyclic.length) {
      results.push({ nodeId: null, nodeName: null, frame: null, command: null,
        warnings: ['Graph contains a cycle involving ' + topo.cyclic.length + ' node(s); those nodes are excluded from the ordered preview below.'] });
    }
    frames.forEach(function (frame) {
      var bindings = computeOutputBindings(scene, frame);
      topo.order.forEach(function (nodeId) {
        var node = Scene.findNode(scene, nodeId);
        if (!node) return;
        results.push(commandForNode(scene, node, frame, bindings));
      });
    });
    return results;
  }

  window.DAG.PyGen = {
    WORK_DIR: WORK_DIR,
    topoOrder: topoOrder,
    generateCommands: generateCommands
  };
})();
