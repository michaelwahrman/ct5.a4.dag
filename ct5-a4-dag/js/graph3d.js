// graph3d.js -- the WebGL (three.js) node-graph editor viewport.
// Attached to window.DAG.Graph3D
(function () {
  'use strict';
  window.DAG = window.DAG || {};
  var Scene = window.DAG.Scene;

  var PORT_RADIUS = 6;
  var PORT_ROW_H = 22;
  var NODE_W = 180;
  var NODE_MIN_H = 64;
  var HEADER_H = 26;

  var COL = {
    bg: 0x1b1e24,
    grid: 0x2a2e37,
    nodeOutline: 0xd7dbe0,
    nodeOutlineInactive: 0x60646c,
    nodeSelected: 0xffc85c,
    portOutline: 0xe8eaed,
    portOutlineActiveHover: 0x7fd1ff,
    linkLine: 0x8fa6c9,
    linkSelected: 0xffc85c,
    linkTempOk: 0x7fe08a,
    linkTempBad: 0xe0666a,
    label: '#f2f3f5'
  };

  // ---- shape helpers ---------------------------------------------------

  function regularPolygonShape(sides, w, h, rotation) {
    var shape = new THREE.Shape();
    var rx = w / 2, ry = h / 2;
    for (var i = 0; i <= sides; i++) {
      var a = rotation + (i / sides) * Math.PI * 2;
      var x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    return shape;
  }

  function buildShape(shapeName, w, h) {
    var shape;
    switch (shapeName) {
      case 'circle':
        shape = new THREE.Shape();
        shape.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0);
        return shape;
      case 'rounded_rect': {
        var r = Math.min(16, h / 3);
        shape = new THREE.Shape();
        var x0 = -w / 2, y0 = -h / 2;
        shape.moveTo(x0 + r, y0);
        shape.lineTo(x0 + w - r, y0);
        shape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
        shape.lineTo(x0 + w, y0 + h - r);
        shape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
        shape.lineTo(x0 + r, y0 + h);
        shape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
        shape.lineTo(x0, y0 + r);
        shape.quadraticCurveTo(x0, y0, x0 + r, y0);
        return shape;
      }
      case 'diamond':
        shape = new THREE.Shape();
        shape.moveTo(0, h / 2);
        shape.lineTo(w / 2, 0);
        shape.lineTo(0, -h / 2);
        shape.lineTo(-w / 2, 0);
        shape.lineTo(0, h / 2);
        return shape;
      case 'triangle':
        shape = new THREE.Shape();
        shape.moveTo(-w / 2, h / 2);
        shape.lineTo(-w / 2, -h / 2);
        shape.lineTo(w / 2, 0);
        shape.lineTo(-w / 2, h / 2);
        return shape;
      case 'pentagon':
        return regularPolygonShape(5, w, h, Math.PI / 2);
      case 'hexagon':
        return regularPolygonShape(6, w, h, 0);
      case 'octagon':
        return regularPolygonShape(8, w, h, Math.PI / 8);
      case 'rectangle':
      default: {
        shape = new THREE.Shape();
        shape.moveTo(-w / 2, -h / 2);
        shape.lineTo(w / 2, -h / 2);
        shape.lineTo(w / 2, h / 2);
        shape.lineTo(-w / 2, h / 2);
        shape.lineTo(-w / 2, -h / 2);
        return shape;
      }
    }
  }

  function shapeOutlineGeometry(shape) {
    var pts = shape.getPoints(48);
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    return geo;
  }

  // ---- text sprites ------------------------------------------------------

  var TEXT_SUPERSAMPLE = 3; // render text at 3x resolution so it stays crisp when zoomed in

  function makeTextSprite(text, opts) {
    opts = opts || {};
    var fontSize = (opts.fontSize || 28) * TEXT_SUPERSAMPLE;
    var color = opts.color || COL.label;
    var weight = opts.weight || '600';
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    ctx.font = weight + ' ' + fontSize + 'px "Segoe UI", Arial, sans-serif';
    var metrics = ctx.measureText(text);
    var padX = 8 * TEXT_SUPERSAMPLE;
    canvas.width = Math.ceil(metrics.width) + padX * 2;
    canvas.height = Math.ceil(fontSize * 1.4);
    ctx.font = weight + ' ' + fontSize + 'px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, padX, canvas.height / 2);
    var tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    var sprite = new THREE.Sprite(mat);
    var worldH = opts.worldHeight || 14;
    var worldW = worldH * (canvas.width / canvas.height);
    sprite.scale.set(worldW, worldH, 1);
    sprite.userData.pixelW = canvas.width;
    sprite.userData.pixelH = canvas.height;
    sprite.renderOrder = 10;
    return sprite;
  }

  // ---- module -------------------------------------------------------------

  function create(container, opts) {
    opts = opts || {};
    var onNodeSelected = opts.onNodeSelected || function () {};
    var onLinkSelected = opts.onLinkSelected || function () {};
    var onNodeMoved = opts.onNodeMoved || function () {};
    var onNodeDoubleClicked = opts.onNodeDoubleClicked || function () {};
    var onLinkCreateAttempt = opts.onLinkCreateAttempt || function () { return { ok: false, reason: 'not wired up' }; };
    var onDeleteRequested = opts.onDeleteRequested || function () {};
    var onBackgroundClick = opts.onBackgroundClick || function () {};

    var scene3 = new THREE.Scene();
    scene3.background = new THREE.Color(COL.bg);

    var width = container.clientWidth, height = container.clientHeight;
    var frustumSize = 1000;
    // near/far must be a normal positive range (not straddling 0): Raycaster
    // derives its ray origin from (near+far)/(near-far), and with a
    // symmetric near=-N/far=N that origin lands at world z=0 heading toward
    // -Z -- meaning anything drawn at z>0 (ports, labels, outlines, all
    // stacked slightly in front of the node body for correct layering)
    // would render fine but never be hit-testable, since it sits "behind"
    // the ray's start point. Camera pulled back along +Z with a conventional
    // near/far avoids that trap.
    var camera = new THREE.OrthographicCamera(0, 0, 0, 0, 1, 2000);
    camera.position.z = 500;
    var DEFAULT_ZOOM = 2.4;
    var zoom = DEFAULT_ZOOM;
    var camX = 0, camY = 0;

    function updateCameraFrustum() {
      width = container.clientWidth || 1;
      height = container.clientHeight || 1;
      var aspect = width / height;
      var halfH = (frustumSize / 2) / zoom;
      var halfW = halfH * aspect;
      camera.left = camX - halfW;
      camera.right = camX + halfW;
      camera.top = camY + halfH;
      camera.bottom = camY - halfH;
      camera.updateProjectionMatrix();
    }
    updateCameraFrustum();

    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    // faint background grid
    (function buildGrid() {
      var size = 20000, step = 40;
      var pts = [];
      for (var x = -size; x <= size; x += step * 5) { pts.push(x, -size, -5, x, size, -5); }
      for (var y = -size; y <= size; y += step * 5) { pts.push(-size, y, -5, size, y, -5); }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      var mat = new THREE.LineBasicMaterial({ color: COL.grid, transparent: true, opacity: 0.6 });
      var grid = new THREE.LineSegments(geo, mat);
      scene3.add(grid);
    })();

    var nodeObjs = {}; // nodeId -> {group, body, outline, headerLabel, ports:{input:[], output:[]}}
    var linkObjs = {}; // linkId -> {line, arrow}
    var portIndex = []; // flat list of {mesh(circle sprite proxy), nodeId, side, portName, worldPos: Vector3 (updated per frame)}

    var selectedNodeId = null;
    var selectedLinkId = null;

    var raycaster = new THREE.Raycaster();
    var pointer = new THREE.Vector2();

    // ---- geometry building for one node -----------------------------------

    function computeNodeHeight(nt) {
      var maxPorts = Math.max((nt.inputs || []).length, (nt.outputs || []).length, 1);
      return Math.max(NODE_MIN_H, HEADER_H + maxPorts * PORT_ROW_H + 14);
    }

    function portCircleMesh(hover) {
      var geo = new THREE.RingGeometry(PORT_RADIUS - 1.6, PORT_RADIUS, 20);
      var mat = new THREE.MeshBasicMaterial({ color: hover ? COL.portOutlineActiveHover : COL.portOutline, side: THREE.DoubleSide });
      return new THREE.Mesh(geo, mat);
    }

    function buildNodeObject(node, sceneData) {
      var nt = Scene.findNodeType(sceneData, node.typeId) || { shape: 'rectangle', color: '#888888', inputs: [], outputs: [], label: node.typeId };
      var h = computeNodeHeight(nt);
      var w = NODE_W;

      var group = new THREE.Group();
      group.position.set(node.x, node.y, 0);
      group.userData = { type: 'node', nodeId: node.id };

      var shape = buildShape(nt.shape, w, h);
      var bodyGeo = new THREE.ShapeGeometry(shape);
      var fillColor = new THREE.Color(nt.color || '#7a7a7a');
      var bodyMat = new THREE.MeshBasicMaterial({
        color: fillColor,
        transparent: true,
        opacity: node.active === false ? 0.28 : 0.55
      });
      var body = new THREE.Mesh(bodyGeo, bodyMat);
      body.userData = { type: 'nodeBody', nodeId: node.id };
      body.position.z = 0;
      group.add(body);

      var outlineGeo = shapeOutlineGeometry(shape);
      var outlineMat = new THREE.LineBasicMaterial({
        color: node.active === false ? COL.nodeOutlineInactive : COL.nodeOutline
      });
      var outline = new THREE.LineLoop(outlineGeo, outlineMat);
      outline.position.z = 0.1;
      group.add(outline);

      var title = makeTextSprite(node.name, { fontSize: 26, worldHeight: 15 });
      title.position.set(0, h / 2 - 12, 1);
      group.add(title);

      var typeLabel = makeTextSprite(nt.label || nt.typeId, { fontSize: 20, worldHeight: 10, color: '#c9cdd4' });
      typeLabel.position.set(0, h / 2 - 24, 1);
      group.add(typeLabel);

      if (node.active === false) {
        var inactiveLabel = makeTextSprite('INACTIVE', { fontSize: 18, worldHeight: 9, color: '#e0666a' });
        inactiveLabel.position.set(0, -h / 2 + 10, 1);
        group.add(inactiveLabel);
      }

      var ports = { input: [], output: [] };

      function layoutPorts(list, side) {
        var n = list.length;
        if (!n) return;
        var top = h / 2 - HEADER_H;
        var usable = h - HEADER_H - 10;
        var stepY = n > 1 ? usable / (n - 1) : 0;
        var startY = n > 1 ? top : (top - usable / 2);
        list.forEach(function (portDef, i) {
          var py = n > 1 ? (startY - stepY * i) : startY;
          var px = side === 'input' ? -w / 2 : w / 2;
          var portUserData = { type: 'port', nodeId: node.id, side: side, portName: portDef.name, portType: portDef.portType };

          var circle = portCircleMesh(false);
          circle.position.set(px, py, 0.2);
          circle.userData = portUserData;
          group.add(circle);

          // The visible port is a thin *outline* ring (per spec), which is
          // mostly hollow -- clicking dead-center on it would miss the ring
          // geometry entirely. Add an invisible, larger disc as the actual
          // click/drag target so the port is easy to grab.
          var hitSize = (PORT_RADIUS + 5) * 2;
          var hitGeo = new THREE.PlaneGeometry(hitSize, hitSize);
          var hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
          var hitArea = new THREE.Mesh(hitGeo, hitMat);
          hitArea.position.set(px, py, 0.25);
          hitArea.userData = portUserData;
          group.add(hitArea);

          var label = makeTextSprite(portDef.label || portDef.name, { fontSize: 16, worldHeight: 8, color: '#c9cdd4' });
          var labelOffset = 10;
          label.position.set(side === 'input' ? px + labelOffset + (label.userData.pixelW / label.userData.pixelH) * 0 : px - labelOffset, py, 0.2);
          // anchor label near the port: shift so it sits just inside the node
          if (side === 'input') {
            label.position.x = px + labelOffset + (label.scale.x / 2);
          } else {
            label.position.x = px - labelOffset - (label.scale.x / 2);
          }
          group.add(label);

          var portEntry = { mesh: circle, nodeId: node.id, side: side, portName: portDef.name, portType: portDef.portType, localPos: new THREE.Vector2(px, py) };
          ports[side].push(portEntry);
          portIndex.push(portEntry);
        });
      }
      layoutPorts(nt.inputs || [], 'input');
      layoutPorts(nt.outputs || [], 'output');

      scene3.add(group);
      return { group: group, body: body, outline: outline, w: w, h: h, ports: ports };
    }

    function portWorldPos(entry) {
      var nodeObj = nodeObjs[entry.nodeId];
      if (!nodeObj) return new THREE.Vector3();
      return new THREE.Vector3(
        nodeObj.group.position.x + entry.localPos.x,
        nodeObj.group.position.y + entry.localPos.y,
        0.3
      );
    }

    function findPortEntry(nodeId, side, portName) {
      for (var i = 0; i < portIndex.length; i++) {
        var p = portIndex[i];
        if (p.nodeId === nodeId && p.side === side && p.portName === portName) return p;
      }
      return null;
    }

    // ---- links ---------------------------------------------------------

    function curvePoints(fromPos, toPos) {
      var dx = Math.max(60, Math.abs(toPos.x - fromPos.x) * 0.5);
      var c1 = new THREE.Vector3(fromPos.x + dx, fromPos.y, fromPos.z);
      var c2 = new THREE.Vector3(toPos.x - dx, toPos.y, toPos.z);
      var curve = new THREE.CubicBezierCurve3(fromPos, c1, c2, toPos);
      return curve.getPoints(24);
    }

    function buildArrow(points, color) {
      var end = points[points.length - 1];
      var prev = points[points.length - 2] || points[points.length - 1];
      var dir = new THREE.Vector2(end.x - prev.x, end.y - prev.y).normalize();
      var size = 9;
      var perp = new THREE.Vector2(-dir.y, dir.x);
      var tip = new THREE.Vector3(end.x, end.y, end.z);
      var base1 = new THREE.Vector3(end.x - dir.x * size + perp.x * size * 0.55, end.y - dir.y * size + perp.y * size * 0.55, end.z);
      var base2 = new THREE.Vector3(end.x - dir.x * size - perp.x * size * 0.55, end.y - dir.y * size - perp.y * size * 0.55, end.z);
      var geo = new THREE.BufferGeometry().setFromPoints([tip, base1, base2]);
      geo.setIndex([0, 1, 2]);
      var mat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide });
      return new THREE.Mesh(geo, mat);
    }

    function buildLinkObject(link) {
      var fromEntry = findPortEntry(link.from.node, 'output', link.from.port);
      var toEntry = findPortEntry(link.to.node, 'input', link.to.port);
      if (!fromEntry || !toEntry) return null;
      var fromPos = portWorldPos(fromEntry);
      var toPos = portWorldPos(toEntry);
      var pts = curvePoints(fromPos, toPos);
      var geo = new THREE.BufferGeometry().setFromPoints(pts);
      var color = link.id === selectedLinkId ? COL.linkSelected : COL.linkLine;
      var mat = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
      var line = new THREE.Line(geo, mat);
      line.userData = { type: 'link', linkId: link.id };
      scene3.add(line);
      var arrow = buildArrow(pts, color);
      arrow.userData = { type: 'link', linkId: link.id };
      scene3.add(arrow);
      return { line: line, arrow: arrow };
    }

    function refreshLink(linkId, sceneData) {
      var l = sceneData.links.find(function (x) { return x.id === linkId; });
      var existing = linkObjs[linkId];
      if (existing) {
        scene3.remove(existing.line);
        scene3.remove(existing.arrow);
        existing.line.geometry.dispose();
        existing.arrow.geometry.dispose();
        delete linkObjs[linkId];
      }
      if (l) {
        var obj = buildLinkObject(l);
        if (obj) linkObjs[linkId] = obj;
      }
    }

    function refreshLinksForNode(nodeId, sceneData) {
      sceneData.links.forEach(function (l) {
        if (l.from.node === nodeId || l.to.node === nodeId) refreshLink(l.id, sceneData);
      });
    }

    // ---- temp link preview while dragging from a port -------------------

    var tempLine = null;
    function setTempLine(fromPos, toPos, ok) {
      clearTempLine();
      var pts = curvePoints(fromPos, toPos);
      var geo = new THREE.BufferGeometry().setFromPoints(pts);
      var mat = new THREE.LineBasicMaterial({ color: ok ? COL.linkTempOk : COL.linkTempBad });
      tempLine = new THREE.Line(geo, mat);
      scene3.add(tempLine);
    }
    function clearTempLine() {
      if (tempLine) { scene3.remove(tempLine); tempLine.geometry.dispose(); tempLine = null; }
    }

    // ---- full rebuild -----------------------------------------------------

    var currentScene = null;

    function clearAll() {
      Object.keys(nodeObjs).forEach(function (id) {
        var o = nodeObjs[id];
        scene3.remove(o.group);
      });
      nodeObjs = {};
      Object.keys(linkObjs).forEach(function (id) {
        scene3.remove(linkObjs[id].line);
        scene3.remove(linkObjs[id].arrow);
      });
      linkObjs = {};
      portIndex = [];
    }

    function rebuild(sceneData) {
      currentScene = sceneData;
      clearAll();
      sceneData.nodes.forEach(function (node) {
        nodeObjs[node.id] = buildNodeObject(node, sceneData);
      });
      sceneData.links.forEach(function (link) {
        var obj = buildLinkObject(link);
        if (obj) linkObjs[link.id] = obj;
      });
      applySelectionVisuals();
    }

    function applySelectionVisuals() {
      Object.keys(nodeObjs).forEach(function (id) {
        var o = nodeObjs[id];
        var isSel = id === selectedNodeId;
        o.outline.material.color.set(isSel ? COL.nodeSelected : (currentScene && Scene.findNode(currentScene, id).active === false ? COL.nodeOutlineInactive : COL.nodeOutline));
      });
      Object.keys(linkObjs).forEach(function (id) {
        var o = linkObjs[id];
        var isSel = id === selectedLinkId;
        var c = isSel ? COL.linkSelected : COL.linkLine;
        o.line.material.color.set(c);
        o.arrow.material.color.set(c);
      });
    }

    function selectNode(nodeId) {
      selectedNodeId = nodeId;
      selectedLinkId = null;
      applySelectionVisuals();
      onNodeSelected(nodeId);
    }
    function selectLink(linkId) {
      selectedLinkId = linkId;
      selectedNodeId = null;
      applySelectionVisuals();
      onLinkSelected(linkId);
    }
    function clearSelection() {
      selectedNodeId = null;
      selectedLinkId = null;
      applySelectionVisuals();
      onNodeSelected(null);
      onLinkSelected(null);
    }

    // ---- pointer / mouse interaction --------------------------------------

    var mode = 'idle'; // idle | pan | drag-node | connect
    var dragNodeId = null;
    var dragOffset = new THREE.Vector2();
    var panStart = new THREE.Vector2();
    var camStart = new THREE.Vector2();
    var connectFrom = null; // {nodeId, port, side}
    var lastPointer = new THREE.Vector2();

    var groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

    function ndcFromEvent(ev) {
      var rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1
      );
    }

    function worldFromEvent(ev) {
      var ndc = ndcFromEvent(ev);
      raycaster.setFromCamera(ndc, camera);
      var out = new THREE.Vector3();
      raycaster.ray.intersectPlane(groundPlane, out);
      return out;
    }

    function pickAtEvent(ev) {
      var ndc = ndcFromEvent(ev);
      raycaster.setFromCamera(ndc, camera);
      var candidates = [];
      Object.keys(nodeObjs).forEach(function (id) {
        candidates.push(nodeObjs[id].group);
      });
      var hits = raycaster.intersectObjects(candidates, true);
      // prefer ports over body when both under cursor
      var portHit = null, bodyHit = null, otherNodeHit = null;
      for (var i = 0; i < hits.length; i++) {
        var ud = hits[i].object.userData;
        if (!ud) continue;
        if (ud.type === 'port' && !portHit) portHit = hits[i];
        else if (ud.type === 'nodeBody' && !bodyHit) bodyHit = hits[i];
        else if (ud.type === 'node' && !otherNodeHit) otherNodeHit = hits[i];
      }
      if (portHit) return portHit.object.userData;
      if (bodyHit) return bodyHit.object.userData;

      // links (thin lines) -- widen hit test using distance in screen space
      var linkHit = pickLink(ev);
      if (linkHit) return { type: 'link', linkId: linkHit };

      return null;
    }

    function pickLink(ev) {
      if (!currentScene) return null;
      var rect = renderer.domElement.getBoundingClientRect();
      var mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      var best = null, bestDist = 8; // px tolerance
      Object.keys(linkObjs).forEach(function (id) {
        var line = linkObjs[id].line;
        var positions = line.geometry.attributes.position;
        for (var i = 0; i < positions.count - 1; i++) {
          var p1 = new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i)).project(camera);
          var p2 = new THREE.Vector3(positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1)).project(camera);
          var x1 = (p1.x * 0.5 + 0.5) * rect.width, y1 = (-p1.y * 0.5 + 0.5) * rect.height;
          var x2 = (p2.x * 0.5 + 0.5) * rect.width, y2 = (-p2.y * 0.5 + 0.5) * rect.height;
          var d = distToSegment(mx, my, x1, y1, x2, y2);
          if (d < bestDist) { bestDist = d; best = id; }
        }
      });
      return best;
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1;
      var lenSq = dx * dx + dy * dy;
      var t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
      t = Math.max(0, Math.min(1, t));
      var cx = x1 + t * dx, cy = y1 + t * dy;
      return Math.hypot(px - cx, py - cy);
    }

    function onPointerDown(ev) {
      if (ev.button !== 0 && ev.button !== 1) return;
      var hit = pickAtEvent(ev);
      lastPointer.set(ev.clientX, ev.clientY);

      if (ev.button === 1 || (ev.button === 0 && !hit)) {
        // pan
        mode = 'pan';
        panStart.set(ev.clientX, ev.clientY);
        camStart.set(camX, camY);
        if (!hit) clearSelection();
        renderer.domElement.setPointerCapture(ev.pointerId);
        return;
      }

      if (hit.type === 'port' && hit.side === 'output') {
        mode = 'connect';
        connectFrom = { nodeId: hit.nodeId, port: hit.portName, side: 'output' };
        renderer.domElement.setPointerCapture(ev.pointerId);
        return;
      }
      if (hit.type === 'port' && hit.side === 'input') {
        // allow dragging FROM an already-connected input to "pull" a new source,
        // but simplest: also allow starting a connection from input backwards
        mode = 'connect';
        connectFrom = { nodeId: hit.nodeId, port: hit.portName, side: 'input' };
        renderer.domElement.setPointerCapture(ev.pointerId);
        return;
      }
      if (hit.type === 'nodeBody' || hit.type === 'node') {
        selectNode(hit.nodeId);
        mode = 'drag-node';
        dragNodeId = hit.nodeId;
        var w = worldFromEvent(ev);
        var np = nodeObjs[hit.nodeId].group.position;
        dragOffset.set(w.x - np.x, w.y - np.y);
        renderer.domElement.setPointerCapture(ev.pointerId);
        return;
      }
      if (hit.type === 'link') {
        selectLink(hit.linkId);
        return;
      }
    }

    function onPointerMove(ev) {
      if (mode === 'pan') {
        var dxPix = ev.clientX - panStart.x, dyPix = ev.clientY - panStart.y;
        var halfH = (frustumSize / 2) / zoom;
        var worldPerPixel = (halfH * 2) / height;
        camX = camStart.x - dxPix * worldPerPixel;
        camY = camStart.y + dyPix * worldPerPixel;
        updateCameraFrustum();
        return;
      }
      if (mode === 'drag-node' && dragNodeId) {
        var w = worldFromEvent(ev);
        var nx = w.x - dragOffset.x, ny = w.y - dragOffset.y;
        var obj = nodeObjs[dragNodeId];
        obj.group.position.set(nx, ny, 0);
        var node = Scene.findNode(currentScene, dragNodeId);
        node.x = nx; node.y = ny;
        refreshLinksForNode(dragNodeId, currentScene);
        return;
      }
      if (mode === 'connect' && connectFrom) {
        var w2 = worldFromEvent(ev);
        var fromEntry = findPortEntry(connectFrom.nodeId, connectFrom.side, connectFrom.port);
        var fromPos = portWorldPos(fromEntry);
        var toPos = new THREE.Vector3(w2.x, w2.y, 0.3);
        var hoverHit = pickAtEvent(ev);
        var ok = false;
        if (hoverHit && hoverHit.type === 'port') {
          if (connectFrom.side === 'output' && hoverHit.side === 'input') {
            ok = Scene.canConnect(currentScene, connectFrom.nodeId, connectFrom.port, hoverHit.nodeId, hoverHit.portName).ok;
          } else if (connectFrom.side === 'input' && hoverHit.side === 'output') {
            ok = Scene.canConnect(currentScene, hoverHit.nodeId, hoverHit.portName, connectFrom.nodeId, connectFrom.port).ok;
          }
        }
        if (connectFrom.side === 'output') setTempLine(fromPos, toPos, ok);
        else setTempLine(toPos, fromPos, ok);
        return;
      }
    }

    function onPointerUp(ev) {
      if (mode === 'connect' && connectFrom) {
        var hit = pickAtEvent(ev);
        clearTempLine();
        if (hit && hit.type === 'port') {
          var fromNode, fromPort, toNode, toPort;
          if (connectFrom.side === 'output' && hit.side === 'input') {
            fromNode = connectFrom.nodeId; fromPort = connectFrom.port; toNode = hit.nodeId; toPort = hit.portName;
          } else if (connectFrom.side === 'input' && hit.side === 'output') {
            fromNode = hit.nodeId; fromPort = hit.portName; toNode = connectFrom.nodeId; toPort = connectFrom.port;
          }
          if (fromNode) {
            var res = onLinkCreateAttempt(fromNode, fromPort, toNode, toPort);
            if (res && res.ok) rebuild(currentScene);
          }
        }
        connectFrom = null;
      }
      if (mode === 'drag-node' && dragNodeId) {
        onNodeMoved(dragNodeId, nodeObjs[dragNodeId].group.position.x, nodeObjs[dragNodeId].group.position.y);
      }
      mode = 'idle';
      dragNodeId = null;
      try { renderer.domElement.releasePointerCapture(ev.pointerId); } catch (e) {}
    }

    function onDblClick(ev) {
      var hit = pickAtEvent(ev);
      if (hit && (hit.type === 'nodeBody' || hit.type === 'node')) {
        onNodeDoubleClicked(hit.nodeId);
      }
    }

    function onWheel(ev) {
      ev.preventDefault();
      if (ev.shiftKey) {
        var halfH = (frustumSize / 2) / zoom;
        var worldPerPixel = (halfH * 2) / height;
        camX += ev.deltaY * worldPerPixel;
        updateCameraFrustum();
        return;
      }
      var before = worldFromEvent(ev);
      var factor = Math.pow(1.0015, -ev.deltaY);
      zoom = Math.max(0.05, Math.min(8, zoom * factor));
      updateCameraFrustum();
      var after = worldFromEvent(ev);
      camX += (before.x - after.x);
      camY += (before.y - after.y);
      updateCameraFrustum();
    }

    function onKeyDown(ev) {
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && document.activeElement === renderer.domElement) {
        onDeleteRequested(selectedNodeId, selectedLinkId);
      }
    }

    renderer.domElement.tabIndex = 0;
    renderer.domElement.style.outline = 'none';
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('dblclick', onDblClick);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    renderer.domElement.addEventListener('keydown', onKeyDown);
    renderer.domElement.addEventListener('mousedown', function () { renderer.domElement.focus(); });

    function resize() {
      updateCameraFrustum();
      renderer.setSize(container.clientWidth, container.clientHeight);
    }
    window.addEventListener('resize', resize);
    var resizeObserver = null;
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
    }

    function fitView(sceneData) {
      if (!sceneData || !sceneData.nodes.length) { camX = 0; camY = 0; zoom = DEFAULT_ZOOM; updateCameraFrustum(); return; }
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      sceneData.nodes.forEach(function (n) {
        minX = Math.min(minX, n.x - NODE_W); maxX = Math.max(maxX, n.x + NODE_W);
        minY = Math.min(minY, n.y - 100); maxY = Math.max(maxY, n.y + 100);
      });
      camX = (minX + maxX) / 2;
      camY = (minY + maxY) / 2;
      var spanX = Math.max(200, maxX - minX), spanY = Math.max(200, maxY - minY);
      var aspect = width / height;
      var neededHalfH = Math.max(spanY / 2, (spanX / 2) / aspect) * 1.25;
      zoom = (frustumSize / 2) / neededHalfH;
      zoom = Math.max(0.05, Math.min(8, zoom));
      updateCameraFrustum();
    }

    var animHandle = null;
    function animate() {
      animHandle = requestAnimationFrame(animate);
      renderer.render(scene3, camera);
    }
    animate();

    function dispose() {
      if (animHandle) cancelAnimationFrame(animHandle);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerup', onPointerUp);
      if (resizeObserver) resizeObserver.disconnect();
      clearAll();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }

    function setSelectedNode(nodeId) { selectedNodeId = nodeId; selectedLinkId = null; applySelectionVisuals(); }
    function setSelectedLink(linkId) { selectedLinkId = linkId; selectedNodeId = null; applySelectionVisuals(); }

    function addNodeVisual(node, sceneData) {
      currentScene = sceneData;
      nodeObjs[node.id] = buildNodeObject(node, sceneData);
    }

    function nodeScreenPos(nodeId) {
      var obj = nodeObjs[nodeId];
      if (!obj) return null;
      var world = obj.group.position.clone();
      var proj = world.clone().project(camera);
      var rect = renderer.domElement.getBoundingClientRect();
      return {
        x: rect.left + (proj.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-proj.y * 0.5 + 0.5) * rect.height,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        w: obj.w, h: obj.h
      };
    }

    // Screen-space (CSS pixel, relative to the canvas element) position of a
    // port, for tooling/debugging (e.g. driving automated UI tests).
    function portScreenPos(nodeId, side, portName) {
      var entry = findPortEntry(nodeId, side, portName);
      if (!entry) return null;
      var world = portWorldPos(entry);
      var proj = world.clone().project(camera);
      var rect = renderer.domElement.getBoundingClientRect();
      return {
        x: rect.left + (proj.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-proj.y * 0.5 + 0.5) * rect.height
      };
    }

    return {
      rebuild: rebuild,
      fitView: fitView,
      dispose: dispose,
      getSelectedNode: function () { return selectedNodeId; },
      getSelectedLink: function () { return selectedLinkId; },
      setSelectedNode: setSelectedNode,
      setSelectedLink: setSelectedLink,
      clearSelection: clearSelection,
      portScreenPos: portScreenPos,
      nodeScreenPos: nodeScreenPos
    };
  }

  window.DAG.Graph3D = { create: create };
})();
