// app.js -- top-level wiring: owns the current scene + dirty flag, binds the
// top bar buttons, and connects graph3d / timeline / ui to the scene model.
(function () {
  'use strict';
  var Scene = window.DAG.Scene;
  var U = window.DAG.Util;
  var PyGen = window.DAG.PyGen;

  var scene = null;
  var dirty = false;
  var savedFileName = null;
  var selection = null; // {type:'node'|'link', id} or null (=> scene attrs shown)

  var canvasWrap = document.getElementById('canvasWrap');
  var timelineContainer = document.getElementById('timelineContainer');

  var graph3d = null;
  var timeline = null;
  var ui = null;

  function setNested(obj, path, value) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts[parts.length - 1]] = value;
  }

  function markDirty(rebuildGraph) {
    dirty = true;
    if (rebuildGraph && graph3d) graph3d.rebuild(scene);
    if (ui) ui.renderAll();
  }

  // Read-only handle for debugging/testing this "test GUI" from the browser
  // console (or an automated driver): window.DAG_DEBUG.getScene(), .graph3d
  // (portScreenPos(), fitView(), ...), .timeline.
  window.DAG_DEBUG = {
    getScene: function () { return scene; },
    isDirty: function () { return dirty; },
    graph3d: null,
    timeline: null
  };

  // ---- UI callbacks -------------------------------------------------------

  ui = window.DAG.UI.create({
    getScene: function () { return scene; },
    isDirty: function () { return dirty; },
    getSelection: function () { return selection; },

    onSceneAttrChange: function (field, value) {
      if (field === 'currentFrame') {
        value = U.clamp(value, scene.startFrame, scene.endFrame);
      }
      setNested(scene, field, value);
      if (field === 'startFrame' || field === 'endFrame') {
        scene.currentFrame = U.clamp(scene.currentFrame, scene.startFrame, scene.endFrame);
      }
      dirty = true;
      if (timeline) timeline.renderAll();
      ui.renderAll();
    },

    onNodeNameChange: function (nodeId, value) {
      var node = Scene.findNode(scene, nodeId);
      if (!node || !value) return;
      node.name = value;
      markDirty(true);
    },

    onNodeActiveChange: function (nodeId, value) {
      var node = Scene.findNode(scene, nodeId);
      if (!node) return;
      node.active = value;
      markDirty(true);
    },

    onNodeAttrChange: function (nodeId, attrName, value) {
      var node = Scene.findNode(scene, nodeId);
      if (!node) return;
      node.attributes[attrName] = value;
      markDirty(false);
    },

    onDeleteNode: function (nodeId) {
      Scene.deleteNode(scene, nodeId);
      selection = null;
      graph3d.clearSelection();
      markDirty(true);
    },

    onDeleteLink: function (linkId) {
      Scene.deleteLink(scene, linkId);
      selection = null;
      graph3d.clearSelection();
      markDirty(true);
    },

    onAddNodeType: function (typeId) {
      var count = scene.nodes.length;
      var x = (count % 5) * 260;
      var y = -Math.floor(count / 5) * 170;
      var node = Scene.createNode(scene, typeId, x, y);
      markDirty(true);
      selection = { type: 'node', id: node.id };
      graph3d.setSelectedNode(node.id);
      ui.renderAll();
      if (count === 0) graph3d.fitView(scene);
    }
  });

  // ---- graph3d callbacks ---------------------------------------------------

  function initGraph3D() {
    if (graph3d) graph3d.dispose();
    graph3d = window.DAG.Graph3D.create(canvasWrap, {
      onNodeSelected: function (nodeId) {
        selection = nodeId ? { type: 'node', id: nodeId } : null;
        ui.renderInspector();
      },
      onLinkSelected: function (linkId) {
        selection = linkId ? { type: 'link', id: linkId } : null;
        ui.renderInspector();
      },
      onNodeMoved: function () {
        markDirty(false);
      },
      onNodeDoubleClicked: function (nodeId) {
        selection = { type: 'node', id: nodeId };
        ui.renderInspector();
      },
      onLinkCreateAttempt: function (fromNode, fromPort, toNode, toPort) {
        try {
          Scene.createLink(scene, fromNode, fromPort, toNode, toPort);
          markDirty(false);
          return { ok: true };
        } catch (e) {
          ui.showMessage('Cannot Connect', e.message);
          return { ok: false };
        }
      },
      onDeleteRequested: function (selectedNodeId, selectedLinkId) {
        if (selectedNodeId) {
          Scene.deleteNode(scene, selectedNodeId);
          selection = null;
          markDirty(true);
        } else if (selectedLinkId) {
          Scene.deleteLink(scene, selectedLinkId);
          selection = null;
          markDirty(true);
        }
      }
    });
    window.DAG_DEBUG.graph3d = graph3d;
  }

  function initTimeline() {
    if (timeline) timeline.dispose();
    timeline = window.DAG.Timeline.create(timelineContainer, {
      getScene: function () { return scene; },
      onFrameChange: function () {
        dirty = true;
        ui.renderTopbar();
        if (!selection) ui.renderInspector();
      },
      onPlayStateChange: function () {}
    });
    window.DAG_DEBUG.timeline = timeline;
  }

  // ---- scene lifecycle: new / load / save --------------------------------

  function applyNewScene(fields) {
    scene = Scene.createNewScene(window.DAG_DEFAULTS.nodeTypes, window.DAG_DEFAULTS.filters);
    scene.name = fields.name;
    scene.startFrame = fields.startFrame;
    scene.endFrame = fields.endFrame;
    scene.fps = fields.fps;
    scene.resolution = fields.resolution;
    scene.proxyResolution = fields.proxyResolution;
    scene.currentFrame = scene.startFrame;
    dirty = false;
    savedFileName = null;
    selection = null;
    initGraph3D();
    graph3d.rebuild(scene);
    initTimeline();
    timeline.renderAll();
    ui.renderAll();
    graph3d.fitView(scene);
  }

  function applyLoadedScene(loaded, fileName) {
    scene = loaded;
    dirty = false;
    savedFileName = fileName;
    selection = null;
    initGraph3D();
    graph3d.rebuild(scene);
    initTimeline();
    timeline.renderAll();
    ui.renderAll();
    graph3d.fitView(scene);
  }

  function doSaveAs(onDone) {
    var suggested = (scene.name ? U.safeFileNameSegment(scene.name) : 'scene') + '.json';
    ui.showSaveAsModal(suggested, function (filename) {
      if (!/\.json$/i.test(filename)) filename += '.json';
      U.downloadTextFile(filename, Scene.serialize(scene));
      savedFileName = filename;
      dirty = false;
      ui.renderAll();
      if (onDone) onDone();
    });
  }

  function doSave(onDone) {
    if (!scene) { if (onDone) onDone(); return; }
    if (savedFileName) {
      U.downloadTextFile(savedFileName, Scene.serialize(scene));
      dirty = false;
      ui.renderAll();
      if (onDone) onDone();
    } else {
      doSaveAs(onDone);
    }
  }

  function guardUnsaved(action) {
    if (!dirty) { action(); return; }
    ui.showUnsavedGuard(
      function saveThenContinue() { doSave(action); },
      function discard() { action(); }
    );
  }

  // ---- top bar bindings ----------------------------------------------------

  document.getElementById('btnNewScene').addEventListener('click', function () {
    guardUnsaved(function () {
      ui.showNewSceneModal(function (fields) { applyNewScene(fields); });
    });
  });

  document.getElementById('btnLoadScene').addEventListener('click', function () {
    guardUnsaved(function () {
      U.pickTextFile('.json,application/json').then(function (res) {
        var loaded;
        try { loaded = Scene.deserialize(res.text); }
        catch (e) { ui.showMessage('Load Failed', 'Could not parse that file as a scene: ' + e.message); return; }
        applyLoadedScene(loaded, res.name);
      }).catch(function () { /* user cancelled */ });
    });
  });

  document.getElementById('btnSaveScene').addEventListener('click', function () { doSave(); });
  document.getElementById('btnSaveSceneAs').addEventListener('click', function () { doSaveAs(); });

  document.getElementById('btnLoadNodeTypes').addEventListener('click', function () {
    U.pickTextFile('.json,application/json').then(function (res) {
      var parsed;
      try { parsed = JSON.parse(res.text); }
      catch (e) { ui.showMessage('Load Node Types Failed', 'Invalid JSON: ' + e.message); return; }
      var list = Array.isArray(parsed) ? parsed : parsed.nodeTypes;
      if (!Array.isArray(list)) { ui.showMessage('Load Node Types Failed', 'Expected a top-level "nodeTypes" array (see data/node_types.default.json).'); return; }
      scene.nodeTypes = list;
      markDirty(true);
    }).catch(function () {});
  });

  document.getElementById('btnLoadFilters').addEventListener('click', function () {
    U.pickTextFile('.json,application/json').then(function (res) {
      var parsed;
      try { parsed = JSON.parse(res.text); }
      catch (e) { ui.showMessage('Load Filters Failed', 'Invalid JSON: ' + e.message); return; }
      var list = Array.isArray(parsed) ? parsed : parsed.filters;
      if (!Array.isArray(list)) { ui.showMessage('Load Filters Failed', 'Expected a top-level "filters" array (see data/filters.default.json).'); return; }
      scene.filters = list;
      markDirty(false);
    }).catch(function () {});
  });

  document.getElementById('btnFitView').addEventListener('click', function () {
    if (graph3d) graph3d.fitView(scene);
  });

  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---- boot ------------------------------------------------------------

  applyNewScene({
    name: null,
    startFrame: 1,
    endFrame: 24,
    fps: 24,
    resolution: { x: 1920, y: 1080 },
    proxyResolution: { x: 1920, y: 1080 }
  });
  dirty = false;
  ui.renderAll();
})();
