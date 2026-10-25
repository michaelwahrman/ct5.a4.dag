// scene.js -- scene data model: attributes, nodes, links, (de)serialization.
// Attached to window.DAG.Scene
(function () {
  'use strict';
  window.DAG = window.DAG || {};
  var U = window.DAG.Util;

  var FORMAT_VERSION = '1.0';

  function defaultScene() {
    return {
      formatVersion: FORMAT_VERSION,
      name: null,
      startFrame: 1,
      endFrame: 24,
      fps: 24,
      currentFrame: 1,
      resolution: { x: 1920, y: 1080 },
      proxyResolution: { x: 1920, y: 1080 },
      nodeTypes: [],
      filters: [],
      nodes: [],
      links: []
    };
  }

  // Build a brand new scene, seeded with the given (default) node types and
  // filters -- these are copied INTO the scene so the saved file is fully
  // self-contained and independently reviewable/editable.
  function createNewScene(nodeTypeDefs, filterDefs) {
    var s = defaultScene();
    s.nodeTypes = U.deepClone(nodeTypeDefs || []);
    s.filters = U.deepClone(filterDefs || []);
    s.currentFrame = s.startFrame;
    return s;
  }

  function findNodeType(scene, typeId) {
    for (var i = 0; i < scene.nodeTypes.length; i++) {
      if (scene.nodeTypes[i].typeId === typeId) return scene.nodeTypes[i];
    }
    return null;
  }

  function findNode(scene, nodeId) {
    for (var i = 0; i < scene.nodes.length; i++) {
      if (scene.nodes[i].id === nodeId) return scene.nodes[i];
    }
    return null;
  }

  function defaultAttributeValue(attrDef) {
    if (attrDef.default !== undefined) return U.deepClone(attrDef.default);
    switch (attrDef.type) {
      case 'float': return 0;
      case 'int': return 0;
      case 'string': return '';
      case 'path': return '';
      case 'color4': return [1, 1, 1, 1];
      case 'enum': return (attrDef.options && attrDef.options[0]) || '';
      case 'filterRef': return 'identity';
      default: return null;
    }
  }

  function nextSequenceName(scene, nodeType) {
    var prefix = nodeType.namePrefix || nodeType.label || nodeType.typeId;
    var re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_(\\d+)$');
    var max = 0;
    scene.nodes.forEach(function (n) {
      var m = re.exec(n.name);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    var seq = max + 1;
    var seqStr = seq < 1000 ? U.pad(seq, 3) : String(seq);
    return prefix + '_' + seqStr;
  }

  // Create a new node instance of the given type at graph position (x, y).
  function createNode(scene, typeId, x, y) {
    var nt = findNodeType(scene, typeId);
    if (!nt) throw new Error('Unknown node type: ' + typeId);
    var attrs = {};
    (nt.attributes || []).forEach(function (a) { attrs[a.name] = defaultAttributeValue(a); });
    var node = {
      id: U.uuid(),
      typeId: typeId,
      name: nextSequenceName(scene, nt),
      x: x || 0,
      y: y || 0,
      active: nt.defaultActive !== false,
      attributes: attrs
    };
    scene.nodes.push(node);
    return node;
  }

  function deleteNode(scene, nodeId) {
    scene.nodes = scene.nodes.filter(function (n) { return n.id !== nodeId; });
    scene.links = scene.links.filter(function (l) {
      return l.from.node !== nodeId && l.to.node !== nodeId;
    });
  }

  function findPortDef(scene, nodeId, side, portName) {
    var node = findNode(scene, nodeId);
    if (!node) return null;
    var nt = findNodeType(scene, node.typeId);
    if (!nt) return null;
    var list = side === 'output' ? nt.outputs : nt.inputs;
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === portName) return list[i];
    }
    return null;
  }

  // Loose port-type compatibility: an "image_or_color" input accepts image
  // or color outputs; "channel" only accepts "channel"; otherwise exact match.
  function portTypesCompatible(outType, inType) {
    if (inType === 'image_or_color') return outType === 'image' || outType === 'color';
    if (outType === inType) return true;
    return false;
  }

  function wouldCreateCycle(scene, fromNodeId, toNodeId) {
    // Would adding an edge fromNodeId -> toNodeId create a cycle?
    // i.e. is toNodeId already an ancestor of fromNodeId (can we reach
    // fromNodeId by walking forward from toNodeId)?
    if (fromNodeId === toNodeId) return true;
    var visited = {};
    var stack = [toNodeId];
    while (stack.length) {
      var cur = stack.pop();
      if (cur === fromNodeId) return true;
      if (visited[cur]) continue;
      visited[cur] = true;
      scene.links.forEach(function (l) {
        if (l.from.node === cur) stack.push(l.to.node);
      });
    }
    return false;
  }

  // Returns { ok: bool, reason: string } describing whether a link can be made.
  function canConnect(scene, fromNodeId, fromPort, toNodeId, toPort) {
    if (fromNodeId === toNodeId) return { ok: false, reason: 'A node cannot connect to itself.' };
    var outDef = findPortDef(scene, fromNodeId, 'output', fromPort);
    var inDef = findPortDef(scene, toNodeId, 'input', toPort);
    if (!outDef) return { ok: false, reason: 'Source output port not found.' };
    if (!inDef) return { ok: false, reason: 'Destination input port not found.' };
    if (!portTypesCompatible(outDef.portType, inDef.portType)) {
      return { ok: false, reason: 'Port types are not compatible (' + outDef.portType + ' -> ' + inDef.portType + ').' };
    }
    var already = scene.links.some(function (l) {
      return l.to.node === toNodeId && l.to.port === toPort;
    });
    if (already) return { ok: false, reason: 'That input already has a connection. Remove it first.' };
    if (wouldCreateCycle(scene, fromNodeId, toNodeId)) {
      return { ok: false, reason: 'That connection would create a cycle.' };
    }
    return { ok: true };
  }

  function createLink(scene, fromNodeId, fromPort, toNodeId, toPort) {
    var check = canConnect(scene, fromNodeId, fromPort, toNodeId, toPort);
    if (!check.ok) throw new Error(check.reason);
    var link = {
      id: U.uuid(),
      from: { node: fromNodeId, port: fromPort },
      to: { node: toNodeId, port: toPort }
    };
    scene.links.push(link);
    return link;
  }

  function deleteLink(scene, linkId) {
    scene.links = scene.links.filter(function (l) { return l.id !== linkId; });
  }

  function serialize(scene) {
    return JSON.stringify(scene, null, 2);
  }

  function deserialize(text) {
    var s = JSON.parse(text);
    var d = defaultScene();
    // Merge over defaults so older/partial files still load sensibly.
    Object.keys(d).forEach(function (k) {
      if (s[k] === undefined) s[k] = d[k];
    });
    if (!s.resolution) s.resolution = d.resolution;
    if (!s.proxyResolution) s.proxyResolution = d.proxyResolution;
    if (s.currentFrame === undefined || s.currentFrame === null) s.currentFrame = s.startFrame;
    if (!Array.isArray(s.nodes)) s.nodes = [];
    if (!Array.isArray(s.links)) s.links = [];
    if (!Array.isArray(s.nodeTypes)) s.nodeTypes = [];
    if (!Array.isArray(s.filters)) s.filters = [];
    return s;
  }

  window.DAG.Scene = {
    FORMAT_VERSION: FORMAT_VERSION,
    defaultScene: defaultScene,
    createNewScene: createNewScene,
    findNodeType: findNodeType,
    findNode: findNode,
    findPortDef: findPortDef,
    createNode: createNode,
    deleteNode: deleteNode,
    canConnect: canConnect,
    createLink: createLink,
    deleteLink: deleteLink,
    wouldCreateCycle: wouldCreateCycle,
    serialize: serialize,
    deserialize: deserialize
  };
})();
