// timeline.js -- transport controls + a ruler/scrubber showing the whole
// start..end frame range at once (scaled to fit, no horizontal scrolling).
// Attached to window.DAG.Timeline
(function () {
  'use strict';
  window.DAG = window.DAG || {};

  function create(container, opts) {
    opts = opts || {};
    var getScene = opts.getScene; // () -> scene
    var onFrameChange = opts.onFrameChange || function () {}; // (frame)
    var onPlayStateChange = opts.onPlayStateChange || function () {}; // (isPlaying)

    container.innerHTML = '';
    container.classList.add('dag-timeline');

    var transport = document.createElement('div');
    transport.className = 'dag-transport';

    function btn(label, title) {
      var b = document.createElement('button');
      b.className = 'dag-btn dag-transport-btn';
      b.textContent = label;
      b.title = title || '';
      transport.appendChild(b);
      return b;
    }

    var btnStepBack = btn('|◀', 'Step back one frame');
    var btnPlayBack = btn('◀◀', 'Play backward');
    var btnStop = btn('■', 'Stop');
    var btnPlayFwd = btn('▶▶', 'Play forward');
    var btnStepFwd = btn('▶|', 'Step forward one frame');

    var frameField = document.createElement('input');
    frameField.type = 'number';
    frameField.className = 'dag-frame-field';
    transport.appendChild(frameField);

    var fpsLabel = document.createElement('span');
    fpsLabel.className = 'dag-fps-label';
    transport.appendChild(fpsLabel);

    container.appendChild(transport);

    var rulerWrap = document.createElement('div');
    rulerWrap.className = 'dag-ruler-wrap';
    container.appendChild(rulerWrap);

    var ruler = document.createElement('div');
    ruler.className = 'dag-ruler';
    rulerWrap.appendChild(ruler);

    var ticksLayer = document.createElement('div');
    ticksLayer.className = 'dag-ruler-ticks';
    ruler.appendChild(ticksLayer);

    var playhead = document.createElement('div');
    playhead.className = 'dag-playhead';
    ruler.appendChild(playhead);

    var playTimer = null;
    var playDir = 0; // -1, 0, 1

    function scene() { return getScene(); }

    function frameToX(frame) {
      var s = scene();
      var span = Math.max(1, s.endFrame - s.startFrame);
      var w = ruler.clientWidth;
      return ((frame - s.startFrame) / span) * w;
    }
    function xToFrame(x) {
      var s = scene();
      var span = Math.max(1, s.endFrame - s.startFrame);
      var w = ruler.clientWidth || 1;
      var t = Math.max(0, Math.min(1, x / w));
      return Math.round(s.startFrame + t * span);
    }

    function renderTicks() {
      var s = scene();
      ticksLayer.innerHTML = '';
      var span = Math.max(1, s.endFrame - s.startFrame);
      var w = ruler.clientWidth || 1;
      // aim for a tick roughly every 45-70px
      var approxTicks = Math.max(2, Math.floor(w / 55));
      var rawStep = span / approxTicks;
      var niceStep = niceNumber(rawStep);
      for (var f = s.startFrame; f <= s.endFrame + 0.0001; f += niceStep) {
        var frame = Math.round(f);
        var x = frameToX(frame);
        var tick = document.createElement('div');
        tick.className = 'dag-tick';
        tick.style.left = x + 'px';
        var label = document.createElement('div');
        label.className = 'dag-tick-label';
        label.textContent = String(frame);
        tick.appendChild(label);
        ticksLayer.appendChild(tick);
      }
      // always show end frame tick if not already close to last
      var endX = frameToX(s.endFrame);
      var endTick = document.createElement('div');
      endTick.className = 'dag-tick dag-tick-end';
      endTick.style.left = endX + 'px';
      var endLabel = document.createElement('div');
      endLabel.className = 'dag-tick-label';
      endLabel.textContent = String(s.endFrame);
      endTick.appendChild(endLabel);
      ticksLayer.appendChild(endTick);
    }

    function niceNumber(x) {
      if (x <= 1) return 1;
      var pow = Math.pow(10, Math.floor(Math.log10(x)));
      var f = x / pow;
      var nf;
      if (f < 1.5) nf = 1; else if (f < 3) nf = 2; else if (f < 7) nf = 5; else nf = 10;
      return Math.max(1, Math.round(nf * pow));
    }

    function renderPlayhead() {
      var s = scene();
      var x = frameToX(s.currentFrame);
      playhead.style.left = x + 'px';
      frameField.value = s.currentFrame;
      frameField.min = s.startFrame;
      frameField.max = s.endFrame;
      fpsLabel.textContent = s.fps + ' fps';
    }

    function renderAll() {
      renderTicks();
      renderPlayhead();
    }

    function setFrame(f, opts2) {
      var s = scene();
      f = Math.max(s.startFrame, Math.min(s.endFrame, Math.round(f)));
      if (f === s.currentFrame && !(opts2 && opts2.force)) { renderPlayhead(); return; }
      s.currentFrame = f;
      renderPlayhead();
      onFrameChange(f);
    }

    function stop() {
      if (playTimer) { clearInterval(playTimer); playTimer = null; }
      playDir = 0;
      onPlayStateChange(false);
    }

    function play(dir) {
      stop();
      playDir = dir;
      var s = scene();
      var interval = Math.max(1000 / Math.max(1, s.fps), 16);
      onPlayStateChange(true);
      playTimer = setInterval(function () {
        var sc = scene();
        var next = sc.currentFrame + playDir;
        if (next > sc.endFrame || next < sc.startFrame) {
          stop();
          return;
        }
        setFrame(next);
      }, interval);
    }

    btnPlayFwd.addEventListener('click', function () { play(1); });
    btnPlayBack.addEventListener('click', function () { play(-1); });
    btnStop.addEventListener('click', stop);
    btnStepFwd.addEventListener('click', function () { stop(); setFrame(scene().currentFrame + 1); });
    btnStepBack.addEventListener('click', function () { stop(); setFrame(scene().currentFrame - 1); });
    frameField.addEventListener('change', function () {
      stop();
      var v = parseInt(frameField.value, 10);
      if (!isNaN(v)) setFrame(v);
    });

    var scrubbing = false;
    function beginScrub(ev) {
      scrubbing = true;
      stop();
      var rect = ruler.getBoundingClientRect();
      setFrame(xToFrame(ev.clientX - rect.left));
    }
    ruler.addEventListener('pointerdown', function (ev) {
      beginScrub(ev);
      ruler.setPointerCapture(ev.pointerId);
    });
    ruler.addEventListener('pointermove', function (ev) {
      if (!scrubbing) return;
      var rect = ruler.getBoundingClientRect();
      setFrame(xToFrame(ev.clientX - rect.left));
    });
    ruler.addEventListener('pointerup', function (ev) {
      scrubbing = false;
      try { ruler.releasePointerCapture(ev.pointerId); } catch (e) {}
    });

    var resizeObserver = null;
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(renderAll);
      resizeObserver.observe(ruler);
    }
    window.addEventListener('resize', renderAll);

    return {
      renderAll: renderAll,
      setFrame: setFrame,
      stop: stop,
      dispose: function () {
        stop();
        if (resizeObserver) resizeObserver.disconnect();
        window.removeEventListener('resize', renderAll);
      }
    };
  }

  window.DAG.Timeline = { create: create };
})();
