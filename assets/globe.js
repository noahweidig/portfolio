// Decorative dot globe in the contact section ("reach me from anywhere").
// Renders the precomputed land dots from assets/data/globe-dots.json (built
// by scripts/generate-globe-dots.mjs) on a transparent canvas in the site's
// accent blue. Auto-rotates, drag/flick to spin; data fetch and animation are
// deferred until the section nears the viewport, and the loop pauses while
// the globe is off-screen or the tab is hidden.
(function () {
  "use strict";

  var canvas = document.getElementById("nw-globe");
  if (!canvas || !canvas.getContext) return;

  var AUTO_SPEED = 0.0015; // radians/frame auto-rotation
  var FRICTION = 0.92; // per-frame decay of flick velocity
  var DOT_COLOR = "0, 118, 223"; // --nw-primary (#0076DF), same in both themes
  var TILT = 0.35;
  var ORLANDO = { lat: 28.5384, lon: -81.3789 };

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var ctx = canvas.getContext("2d");
  var label = document.getElementById("nw-globe-label");
  var marker = toSphere(ORLANDO.lat, ORLANDO.lon);
  var dots = null; // [{x, y, z} unit-sphere points]
  var size = 0; // CSS pixel size of the square canvas
  var radius = 0;
  // Start with the marker facing the viewer: rotate about Y so Orlando's
  // azimuth lands front-center, then apply the usual tilt.
  var rotY = -Math.atan2(marker.x, marker.z);
  var rotX = TILT;
  var velY = AUTO_SPEED;
  var velX = 0;
  var dragging = false;
  var lastX = 0;
  var lastY = 0;
  var lastDX = 0;
  var lastDY = 0;
  var running = false;
  var visible = false;
  var rafId = 0;

  // Same lat/lon → unit-sphere mapping used for the precomputed land dots
  function toSphere(lat, lon) {
    var phi = ((90 - lat) * Math.PI) / 180;
    var theta = ((180 - lon) * Math.PI) / 180;
    return {
      x: Math.sin(phi) * Math.cos(theta),
      y: Math.cos(phi),
      z: Math.sin(phi) * Math.sin(theta),
    };
  }

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    size = canvas.clientWidth;
    if (!size) return;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    radius = size * 0.46;
  }

  function draw() {
    ctx.clearRect(0, 0, size, size);
    var c = size / 2;
    var cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    var cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    var projected = [];
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      // rotate about Y (spin), then X (tilt)
      var x1 = d.x * cosY + d.z * sinY;
      var z1 = -d.x * sinY + d.z * cosY;
      var y2 = d.y * cosX - z1 * sinX;
      var z2 = d.y * sinX + z1 * cosX;
      // Keep the rotated surface normal (x1, y2, z2) so each dot can be drawn
      // as a foreshortened disc lying flat on the sphere rather than a
      // camera-facing circle.
      projected.push({ z: z2, nx: x1, ny: y2, sx: c + x1 * radius, sy: c - y2 * radius });
    }
    projected.sort(function (a, b) {
      return a.z - b.z;
    });
    var dotR = Math.max(1.4, size * 0.006);
    for (var j = 0; j < projected.length; j++) {
      var p = projected[j];
      var depth = (p.z + 1) / 2; // 0 = far side, 1 = near side
      // A flat disc on the surface projects to an ellipse: its minor axis lies
      // along the projected normal and shrinks by |normal·view| = |z2|, so
      // dots near the limb foreshorten to slivers instead of staying round.
      var minor = dotR * Math.abs(p.z);
      var angle = Math.atan2(-p.ny, p.nx); // screen-space normal direction
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, minor, dotR, angle, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + DOT_COLOR + "," + (0.08 + 0.82 * depth) + ")";
      ctx.fill();
    }
    drawMarker(c, cosX, sinX, cosY, sinY);
  }

  // Pulsing Orlando marker drawn on top of the land dots; the coordinate
  // label (an HTML card) tracks the marker and hides on the far side.
  function drawMarker(c, cosX, sinX, cosY, sinY) {
    var x1 = marker.x * cosY + marker.z * sinY;
    var z1 = -marker.x * sinY + marker.z * cosY;
    var y2 = marker.y * cosX - z1 * sinX;
    var z2 = marker.y * sinX + z1 * cosX;
    var front = z2 > 0.05;
    if (front) {
      var sx = c + x1 * radius;
      var sy = c - y2 * radius;
      var r = Math.max(3.5, size * 0.011);
      if (!reduceMotion) {
        // expanding ring, ~2s cycle
        var t = ((performance.now ? performance.now() : Date.now()) % 2000) / 2000;
        ctx.beginPath();
        ctx.arc(sx, sy, r * (1 + t * 2.4), 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(" + DOT_COLOR + "," + 0.55 * (1 - t) + ")";
        ctx.lineWidth = Math.max(1, r * 0.35);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(" + DOT_COLOR + ")";
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, r * 0.4);
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      if (label) {
        label.hidden = false;
        label.style.left = canvas.offsetLeft + sx + "px";
        label.style.top = canvas.offsetTop + sy - r * 2.2 + "px";
      }
    } else if (label) {
      label.hidden = true;
    }
  }

  function tick() {
    if (!running) return;
    if (!dragging) {
      velY = velY * FRICTION + AUTO_SPEED * (1 - FRICTION);
      velX *= FRICTION;
      rotY += velY;
      rotX = clampTilt(rotX + velX);
    }
    draw();
    rafId = requestAnimationFrame(tick);
  }

  function clampTilt(x) {
    return Math.max(-Math.PI / 2, Math.min(Math.PI / 2, x));
  }

  function setRunning(on) {
    // reduced motion: never self-animate; draw stills on demand instead
    if (reduceMotion) return;
    if (on === running || !dots) return;
    running = on;
    if (on) rafId = requestAnimationFrame(tick);
    else cancelAnimationFrame(rafId);
  }

  // ── drag / flick ───────────────────────────────────────────────────────────

  canvas.addEventListener("pointerdown", function (e) {
    if (!dots) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    lastDX = lastDY = 0;
    velX = velY = 0;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    lastDX = e.clientX - lastX;
    lastDY = e.clientY - lastY;
    rotY += lastDX * 0.005;
    rotX = clampTilt(rotX + lastDY * 0.005);
    lastX = e.clientX;
    lastY = e.clientY;
    if (reduceMotion) draw(); // no loop running; redraw the still frame
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    velY = lastDX * 0.005;
    velX = lastDY * 0.005;
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // ── lazy init ──────────────────────────────────────────────────────────────

  function start() {
    fetch("assets/data/globe-dots.json")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        dots = [];
        for (var i = 0; i < data.dots.length; i += 2) {
          var phi = ((90 - data.dots[i]) * Math.PI) / 180;
          var theta = ((180 - data.dots[i + 1]) * Math.PI) / 180;
          dots.push({
            x: Math.sin(phi) * Math.cos(theta),
            y: Math.cos(phi),
            z: Math.sin(phi) * Math.sin(theta),
          });
        }
        resize();
        if (reduceMotion || !visible) draw();
        if (visible) setRunning(true);
      })
      .catch(function () {
        /* decorative: fail silently, the layout stands on its own */
      });
  }

  window.addEventListener("resize", function () {
    if (!dots) return;
    resize();
    if (!running) draw();
  });

  document.addEventListener("visibilitychange", function () {
    setRunning(!document.hidden && visible);
  });

  if ("IntersectionObserver" in window) {
    var loader = new IntersectionObserver(
      function (entries, obs) {
        if (
          entries.some(function (e) {
            return e.isIntersecting;
          })
        ) {
          obs.disconnect();
          start();
        }
      },
      { rootMargin: "400px" }
    );
    loader.observe(canvas);
    new IntersectionObserver(function (entries) {
      visible = entries.some(function (e) {
        return e.isIntersecting;
      });
      setRunning(visible && !document.hidden);
    }).observe(canvas);
  } else {
    visible = true;
    start();
  }
})();
