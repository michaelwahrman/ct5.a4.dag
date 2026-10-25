// ui.js -- DOM rendering: top bar state, node-type palette, properties /
// scene-JSON / python-preview inspector tabs, and modal dialogs.
// Attached to window.DAG.UI
(function () {
  'use strict';
  window.DAG = window.DAG || {};
  var Scene = window.DAG.Scene;
  var PyGen = window.DAG.PyGen;

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function create(callbacks) {
    var cb = callbacks || {};
    var activeTab = 'props';
    var pyFrameMode = 'current';

    var sceneNameLabel = document.getElementById('sceneNameLabel');
    var paletteList = document.getElementById('paletteList');
    var inspectorBody = document.getElementById('inspectorBody');
    var modalRoot = document.getElementById('modalRoot');
    var tabs = document.querySelectorAll('.inspector-tab');

    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        activeTab = t.getAttribute('data-tab');
        tabs.forEach(function (x) { x.classList.toggle('active', x === t); });
        renderInspector();
      });
    });

    // ---- top bar -----------------------------------------------------

    function renderTopbar() {
      var scene = cb.getScene();
      var dirty = cb.isDirty();
      var name = (scene && scene.name) ? scene.name : '(untitled)';
      sceneNameLabel.innerHTML = '';
      sceneNameLabel.appendChild(document.createTextNode(name));
      if (dirty) {
        var mark = el('span', 'dirty-mark', '● unsaved');
        sceneNameLabel.appendChild(mark);
      }
    }

    // ---- palette -------------------------------------------------------

    function renderPalette() {
      var scene = cb.getScene();
      paletteList.innerHTML = '';
      if (!scene) return;
      var byCat = {};
      var order = [];
      scene.nodeTypes.forEach(function (nt) {
        var cat = nt.category || 'other';
        if (!byCat[cat]) { byCat[cat] = []; order.push(cat); }
        byCat[cat].push(nt);
      });
      var catLabels = { input: 'Input', process: 'Process', output: 'Output', other: 'Other' };
      order.forEach(function (cat) {
        var h = el('h3', null, catLabels[cat] || cat);
        paletteList.appendChild(h);
        byCat[cat].forEach(function (nt) {
          var item = el('div', 'palette-item');
          var swatch = el('div', 'palette-swatch');
          swatch.style.background = nt.color || '#888';
          item.appendChild(swatch);
          item.appendChild(el('span', 'pt-label', nt.label || nt.typeId));
          item.appendChild(el('span', 'pt-sub', shapeAbbrev(nt.shape)));
          item.title = 'Click to add a ' + (nt.label || nt.typeId) + ' node';
          item.addEventListener('click', function () { cb.onAddNodeType(nt.typeId); });
          paletteList.appendChild(item);
        });
      });
    }

    function shapeAbbrev(shape) {
      return shape ? shape.replace('_', ' ') : '';
    }

    // ---- inspector: properties tab -------------------------------------

    function fieldRow(labelText, inputEl) {
      var row = el('div', 'field-row');
      row.appendChild(el('label', null, labelText));
      row.appendChild(inputEl);
      return row;
    }

    function numberInput(value, onChange, opts) {
      opts = opts || {};
      var inp = document.createElement('input');
      inp.type = 'number';
      if (opts.step !== undefined) inp.step = opts.step;
      if (opts.min !== undefined) inp.min = opts.min;
      if (opts.max !== undefined) inp.max = opts.max;
      inp.value = value;
      inp.addEventListener('change', function () {
        var v = parseFloat(inp.value);
        if (!isNaN(v)) onChange(v);
      });
      return inp;
    }

    function textInput(value, onChange) {
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.value = value || '';
      inp.addEventListener('change', function () { onChange(inp.value); });
      return inp;
    }

    function checkboxInput(checked, onChange) {
      var inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.checked = !!checked;
      inp.addEventListener('change', function () { onChange(inp.checked); });
      return inp;
    }

    function selectInput(options, value, onChange) {
      var sel = document.createElement('select');
      options.forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o.value; opt.textContent = o.label;
        if (o.value === value) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function () { onChange(sel.value); });
      return sel;
    }

    function renderSceneAttrs(scene) {
      inspectorBody.innerHTML = '';
      inspectorBody.appendChild(el('h4', null, 'Scene Attributes'));

      inspectorBody.appendChild(fieldRow('Name', textInput(scene.name, function (v) { cb.onSceneAttrChange('name', v || null); })));
      inspectorBody.appendChild(fieldRow('Start Frame', numberInput(scene.startFrame, function (v) { cb.onSceneAttrChange('startFrame', Math.round(v)); }, { step: 1 })));
      inspectorBody.appendChild(fieldRow('End Frame', numberInput(scene.endFrame, function (v) { cb.onSceneAttrChange('endFrame', Math.round(v)); }, { step: 1 })));
      inspectorBody.appendChild(fieldRow('FPS', numberInput(scene.fps, function (v) { cb.onSceneAttrChange('fps', v); }, { step: 1, min: 1 })));
      inspectorBody.appendChild(fieldRow('Current Frame', numberInput(scene.currentFrame, function (v) { cb.onSceneAttrChange('currentFrame', Math.round(v)); }, { step: 1 })));

      var resGroup = el('div', 'field-group');
      resGroup.appendChild(el('div', 'field-group-title', 'Spatial Resolution'));
      resGroup.appendChild(fieldRow('X', numberInput(scene.resolution.x, function (v) { cb.onSceneAttrChange('resolution.x', Math.round(v)); }, { step: 1, min: 1 })));
      resGroup.appendChild(fieldRow('Y', numberInput(scene.resolution.y, function (v) { cb.onSceneAttrChange('resolution.y', Math.round(v)); }, { step: 1, min: 1 })));
      inspectorBody.appendChild(resGroup);

      var proxyGroup = el('div', 'field-group');
      proxyGroup.appendChild(el('div', 'field-group-title', 'Proxy Resolution'));
      proxyGroup.appendChild(fieldRow('X', numberInput(scene.proxyResolution.x, function (v) { cb.onSceneAttrChange('proxyResolution.x', Math.round(v)); }, { step: 1, min: 1 })));
      proxyGroup.appendChild(fieldRow('Y', numberInput(scene.proxyResolution.y, function (v) { cb.onSceneAttrChange('proxyResolution.y', Math.round(v)); }, { step: 1, min: 1 })));
      inspectorBody.appendChild(proxyGroup);

      var counts = el('div', 'field-group');
      counts.appendChild(el('div', 'field-group-title', 'Graph'));
      counts.appendChild(el('div', 'mono', scene.nodes.length + ' node(s), ' + scene.links.length + ' link(s), ' + scene.nodeTypes.length + ' node type(s), ' + scene.filters.length + ' filter(s).'));
      inspectorBody.appendChild(counts);
    }

    function attrField(scene, node, nt, attrDef) {
      var val = node.attributes[attrDef.name];
      switch (attrDef.type) {
        case 'float':
          return fieldRow(attrDef.label || attrDef.name, numberInput(val, function (v) { cb.onNodeAttrChange(node.id, attrDef.name, v); }, { step: 0.01, min: attrDef.min, max: attrDef.max }));
        case 'int':
          return fieldRow(attrDef.label || attrDef.name, numberInput(val, function (v) { cb.onNodeAttrChange(node.id, attrDef.name, Math.round(v)); }, { step: 1, min: attrDef.min, max: attrDef.max }));
        case 'path':
        case 'string':
          return fieldRow(attrDef.label || attrDef.name, textInput(val, function (v) { cb.onNodeAttrChange(node.id, attrDef.name, v); }));
        case 'enum':
          return fieldRow(attrDef.label || attrDef.name, selectInput((attrDef.options || []).map(function (o) { return { value: o, label: o }; }), val, function (v) { cb.onNodeAttrChange(node.id, attrDef.name, v); }));
        case 'filterRef': {
          var opts = (scene.filters || []).map(function (f) { return { value: f.name, label: f.label || f.name }; });
          return fieldRow(attrDef.label || attrDef.name, selectInput(opts, val, function (v) { cb.onNodeAttrChange(node.id, attrDef.name, v); }));
        }
        case 'color4': {
          var row = el('div', 'field-row');
          row.appendChild(el('label', null, attrDef.label || attrDef.name));
          var wrap = el('div', 'color4-row');
          ['R', 'G', 'B', 'A'].forEach(function (ch, i) {
            var inp = numberInput(val[i], function (v) {
              var next = val.slice();
              next[i] = v;
              cb.onNodeAttrChange(node.id, attrDef.name, next);
            }, { step: 0.01, min: 0, max: 1 });
            wrap.appendChild(inp);
          });
          row.appendChild(wrap);
          return row;
        }
        default:
          return fieldRow(attrDef.label || attrDef.name, textInput(String(val), function (v) { cb.onNodeAttrChange(node.id, attrDef.name, v); }));
      }
    }

    function renderNodeInspector(scene, node) {
      var nt = Scene.findNodeType(scene, node.typeId);
      inspectorBody.innerHTML = '';
      inspectorBody.appendChild(el('h4', null, 'Node'));
      inspectorBody.appendChild(fieldRow('Name', textInput(node.name, function (v) { cb.onNodeNameChange(node.id, v); })));
      var typeField = textInput(nt ? (nt.label || nt.typeId) : node.typeId, function () {});
      typeField.disabled = true;
      inspectorBody.appendChild(fieldRow('Type', typeField));
      var activeRow = el('div', 'field-row checkbox');
      activeRow.appendChild(el('label', null, 'Active'));
      activeRow.appendChild(checkboxInput(node.active !== false, function (v) { cb.onNodeActiveChange(node.id, v); }));
      inspectorBody.appendChild(activeRow);

      if (nt && nt.attributes && nt.attributes.length) {
        var group = el('div', 'field-group');
        group.appendChild(el('div', 'field-group-title', 'Attributes'));
        nt.attributes.forEach(function (a) { group.appendChild(attrField(scene, node, nt, a)); });
        inspectorBody.appendChild(group);
      }

      var portsGroup = el('div', 'field-group');
      portsGroup.appendChild(el('div', 'field-group-title', 'Ports'));
      var inNames = (nt && nt.inputs || []).map(function (p) { return p.name + ':' + p.portType; }).join(', ') || '(none)';
      var outNames = (nt && nt.outputs || []).map(function (p) { return p.name + ':' + p.portType; }).join(', ') || '(none)';
      portsGroup.appendChild(el('div', 'mono', 'in — ' + inNames));
      portsGroup.appendChild(el('div', 'mono', 'out — ' + outNames));
      inspectorBody.appendChild(portsGroup);

      var idGroup = el('div', 'field-group');
      idGroup.appendChild(el('div', 'field-group-title', 'Node ID'));
      idGroup.appendChild(el('div', 'mono', node.id));
      inspectorBody.appendChild(idGroup);

      var delBtn = el('button', 'dag-btn danger', 'Delete Node');
      delBtn.style.marginTop = '14px';
      delBtn.addEventListener('click', function () { cb.onDeleteNode(node.id); });
      inspectorBody.appendChild(delBtn);
    }

    function renderLinkInspector(scene, link) {
      inspectorBody.innerHTML = '';
      inspectorBody.appendChild(el('h4', null, 'Link'));
      var fromNode = Scene.findNode(scene, link.from.node);
      var toNode = Scene.findNode(scene, link.to.node);
      inspectorBody.appendChild(el('div', 'mono', 'From: ' + (fromNode ? fromNode.name : '?') + ' [' + link.from.port + ']'));
      inspectorBody.appendChild(el('div', 'mono', 'To:   ' + (toNode ? toNode.name : '?') + ' [' + link.to.port + ']'));
      var delBtn = el('button', 'dag-btn danger', 'Delete Link');
      delBtn.style.marginTop = '14px';
      delBtn.addEventListener('click', function () { cb.onDeleteLink(link.id); });
      inspectorBody.appendChild(delBtn);
    }

    function renderPropsTab() {
      var scene = cb.getScene();
      if (!scene) { inspectorBody.innerHTML = ''; return; }
      var sel = cb.getSelection();
      if (sel && sel.type === 'node') {
        var node = Scene.findNode(scene, sel.id);
        if (node) return renderNodeInspector(scene, node);
      }
      if (sel && sel.type === 'link') {
        var link = scene.links.find(function (l) { return l.id === sel.id; });
        if (link) return renderLinkInspector(scene, link);
      }
      renderSceneAttrs(scene);
    }

    function renderJsonTab() {
      var scene = cb.getScene();
      inspectorBody.innerHTML = '';
      var pre = el('pre', 'json-preview', scene ? Scene.serialize(scene) : '');
      inspectorBody.appendChild(pre);
    }

    function renderPythonTab() {
      var scene = cb.getScene();
      inspectorBody.innerHTML = '';
      var controls = el('div', 'field-row');
      controls.appendChild(el('label', null, 'Frames'));
      controls.appendChild(selectInput(
        [{ value: 'current', label: 'Current frame only' }, { value: 'all', label: 'All frames in range' }],
        pyFrameMode,
        function (v) { pyFrameMode = v; renderPythonTab(); }
      ));
      inspectorBody.appendChild(controls);

      if (!scene) return;
      var frames;
      if (pyFrameMode === 'all') {
        frames = [];
        for (var f = scene.startFrame; f <= scene.endFrame; f++) frames.push(f);
      } else {
        frames = [scene.currentFrame];
      }
      var results = PyGen.generateCommands(scene, frames);
      var wrap = el('div', 'py-preview');
      results.forEach(function (r) {
        var block = el('div', 'py-cmd');
        if (r.nodeName) {
          var head = el('div');
          var nameSpan = el('span', 'py-node-name', r.nodeName);
          head.appendChild(nameSpan);
          head.appendChild(el('span', 'py-frame', '  (frame ' + r.frame + ')'));
          block.appendChild(head);
        }
        if (r.command) block.appendChild(el('div', 'py-cmdline', 'python ' + r.command));
        (r.warnings || []).forEach(function (w) { block.appendChild(el('div', 'py-warn', '⚠ ' + w)); });
        wrap.appendChild(block);
      });
      if (!results.length) wrap.appendChild(el('div', 'mono', '(no nodes in graph)'));
      inspectorBody.appendChild(wrap);
    }

    function renderInspector() {
      if (activeTab === 'props') renderPropsTab();
      else if (activeTab === 'json') renderJsonTab();
      else if (activeTab === 'python') renderPythonTab();
    }

    function renderAll() {
      renderTopbar();
      renderPalette();
      renderInspector();
    }

    // ---- modals ----------------------------------------------------------

    function closeModal() { modalRoot.innerHTML = ''; }

    function showModal(titleText, bodyEls, buttons) {
      modalRoot.innerHTML = '';
      var backdrop = el('div', 'modal-backdrop');
      var box = el('div', 'modal-box');
      box.appendChild(el('h3', null, titleText));
      bodyEls.forEach(function (e) { box.appendChild(e); });
      var actions = el('div', 'modal-actions');
      buttons.forEach(function (b) {
        var btn = el('button', 'dag-btn' + (b.className ? ' ' + b.className : ''), b.label);
        btn.addEventListener('click', function () {
          closeModal();
          if (b.onClick) b.onClick();
        });
        actions.appendChild(btn);
      });
      box.appendChild(actions);
      backdrop.appendChild(box);
      modalRoot.appendChild(backdrop);
      return box;
    }

    function showUnsavedGuard(onSaveThenContinue, onDiscard) {
      showModal('Unsaved Changes', [
        el('div', 'modal-note', 'The current scene has unsaved changes. Save before continuing?')
      ], [
        { label: 'Cancel', onClick: function () {} },
        { label: 'Discard Changes', className: 'danger', onClick: onDiscard },
        { label: 'Save & Continue', className: 'primary', onClick: onSaveThenContinue }
      ]);
    }

    function showNewSceneModal(onCreate) {
      var body = [];
      var nameInp = textInput('', function () {});
      body.push(fieldRow('Name', nameInp));
      var startInp = numberInput(1, function () {}, { step: 1 });
      body.push(fieldRow('Start Frame', startInp));
      var endInp = numberInput(24, function () {}, { step: 1 });
      body.push(fieldRow('End Frame', endInp));
      var fpsInp = numberInput(24, function () {}, { step: 1, min: 1 });
      body.push(fieldRow('FPS', fpsInp));
      var resXInp = numberInput(1920, function () {}, { step: 1, min: 1 });
      body.push(fieldRow('Resolution X', resXInp));
      var resYInp = numberInput(1080, function () {}, { step: 1, min: 1 });
      body.push(fieldRow('Resolution Y', resYInp));
      var proxyXInp = numberInput(1920, function () {}, { step: 1, min: 1 });
      body.push(fieldRow('Proxy Resolution X', proxyXInp));
      var proxyYInp = numberInput(1080, function () {}, { step: 1, min: 1 });
      body.push(fieldRow('Proxy Resolution Y', proxyYInp));

      showModal('New Scene', body, [
        { label: 'Cancel', onClick: function () {} },
        {
          label: 'Create', className: 'primary', onClick: function () {
            onCreate({
              name: nameInp.value || null,
              startFrame: parseInt(startInp.value, 10) || 1,
              endFrame: parseInt(endInp.value, 10) || 24,
              fps: parseFloat(fpsInp.value) || 24,
              resolution: { x: parseInt(resXInp.value, 10) || 1920, y: parseInt(resYInp.value, 10) || 1080 },
              proxyResolution: { x: parseInt(proxyXInp.value, 10) || 1920, y: parseInt(proxyYInp.value, 10) || 1080 }
            });
          }
        }
      ]);
    }

    function showSaveAsModal(defaultName, onConfirm) {
      var nameInp = textInput(defaultName, function () {});
      showModal('Save Scene As', [
        el('div', 'modal-note', 'Choose a file name. The scene will be downloaded as a JSON file (your browser may ask where to save it, or place it in your Downloads folder).'),
        fieldRow('File name', nameInp)
      ], [
        { label: 'Cancel', onClick: function () {} },
        { label: 'Save', className: 'primary', onClick: function () { onConfirm(nameInp.value || 'scene.json'); } }
      ]);
    }

    function showMessage(title, message) {
      showModal(title, [el('div', 'modal-note', message)], [{ label: 'OK', className: 'primary', onClick: function () {} }]);
    }

    return {
      renderAll: renderAll,
      renderTopbar: renderTopbar,
      renderPalette: renderPalette,
      renderInspector: renderInspector,
      showUnsavedGuard: showUnsavedGuard,
      showNewSceneModal: showNewSceneModal,
      showSaveAsModal: showSaveAsModal,
      showMessage: showMessage,
      closeModal: closeModal
    };
  }

  window.DAG.UI = { create: create };
})();
