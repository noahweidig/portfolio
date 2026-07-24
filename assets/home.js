// Landing-page interactivity: typewriter, project filters, marquee duplication.
(function () {
  // Typewriter
  var el = document.querySelector("#hero .nw-typed");
  if (el) {
    var strings = JSON.parse(el.dataset.strings || "[]");
    var typeSpeed = 70, deleteSpeed = 40, pauseTime = 2500;
    var idx = 0, pos = 0, deleting = false;
    (function tick() {
      var s = strings[idx] || "";
      el.textContent = s.slice(0, pos);
      if (!deleting && pos < s.length) {
        pos++;
        setTimeout(tick, typeSpeed);
      } else if (!deleting) {
        deleting = true;
        setTimeout(tick, pauseTime);
      } else if (pos > 0) {
        pos--;
        setTimeout(tick, deleteSpeed);
      } else {
        deleting = false;
        idx = (idx + 1) % strings.length;
        setTimeout(tick, 400);
      }
    })();
  }

  // Duplicate marquee content so the loop is seamless
  document.querySelectorAll(".nw-marquee-track").forEach(function (track) {
    track.innerHTML += track.innerHTML;
  });

  // Category filter buttons for card grids (projects, publications)
  document.querySelectorAll("[data-nw-filter-for]").forEach(function (bar) {
    var grid = document.getElementById(bar.dataset.nwFilterFor) ||
      document.getElementById("listing-" + bar.dataset.nwFilterFor);
    if (!grid) return;
    var cards = function () {
      return grid.querySelectorAll("[data-cats]");
    };
    // Build buttons from the categories present in the grid
    var cats = new Set();
    cards().forEach(function (c) {
      (c.dataset.cats || "").split("|").filter(Boolean).forEach(function (t) { cats.add(t); });
    });
    var mk = function (label, cat) {
      var b = document.createElement("button");
      b.textContent = label;
      b.onclick = function () {
        bar.querySelectorAll("button").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        cards().forEach(function (c) {
          var show = !cat || (c.dataset.cats || "").split("|").indexOf(cat) !== -1;
          (c.closest(".nw-proj-wrap") || c).style.display = show ? "" : "none";
        });
      };
      bar.appendChild(b);
      return b;
    };
    mk("All", null).classList.add("active");
    Array.from(cats).sort().forEach(function (c) { mk(c, c); });

    // Deep link: #category=X (used by tags on detail pages)
    var m = location.hash.match(/category=([^&]*)/);
    if (m) {
      var want = decodeURIComponent(m[1].replace(/\+/g, " "));
      bar.querySelectorAll("button").forEach(function (b) {
        if (b.textContent === want) b.click();
      });
    }
  });

  // Contact form: submit to Formspree via fetch, no page reload
  var form = document.querySelector("form.nw-form");
  if (form) {
    var status = form.querySelector(".nw-form-status");
    var show = function (msg, ok) {
      if (!status) return;
      status.textContent = msg;
      status.classList.toggle("ok", ok);
      status.classList.toggle("err", !ok);
      status.hidden = false;
    };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      })
        .then(function (res) {
          if (res.ok) {
            form.reset();
            show("Thanks! Your message has been sent.", true);
            return;
          }
          return res.json().then(function (data) {
            var msg = (data.errors || []).map(function (err) { return err.message; }).join(", ");
            show(msg || "Oops! Something went wrong — please try again.", false);
          });
        })
        .catch(function () {
          show("Network error — please try again, or email me directly.", false);
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    });
  }

  var reducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Scroll reveal: fade sections' items in as they enter the viewport.
  // Elements already on screen at load are never hidden, so first paint (and
  // the LCP element) is identical with or without this — Lighthouse-safe.
  if (!reducedMotion && "IntersectionObserver" in window) {
    var revealables = document.querySelectorAll(
      ".nw-section .nw-title, .nw-section .nw-subtitle, .nw-section .nw-lead, " +
        ".nw-stat, .nw-card, .nw-proj-wrap, .nw-cite, .nw-post, " +
        ".nw-tl-item, .nw-award, .nw-faq details, .nw-contact-card, .nw-globe-wrap, " +
        ".nw-cta-card, .nw-marquee"
    );
    var fold = window.innerHeight;
    var below = [];
    revealables.forEach(function (el) {
      if (el.getBoundingClientRect().top >= fold) below.push(el);
    });
    if (below.length) {
      var io = new IntersectionObserver(
        function (entries) {
          // Stagger items that arrive in the same batch (capped so trailing
          // cards in big grids don't lag behind the scroll)
          var delay = 0;
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.style.transitionDelay = delay + "ms";
            entry.target.classList.add("nw-in");
            io.unobserve(entry.target);
            delay = Math.min(delay + 70, 280);
          });
        },
        { rootMargin: "0px 0px -8% 0px" }
      );
      below.forEach(function (el) {
        el.classList.add("nw-reveal");
        io.observe(el);
      });
    }
  }

  // Tech-stack deck peel: the category cards stack in a sticky viewport and
  // peel off one at a time as the section scrolls, promoting the card beneath
  // into the top slot. Motion-only — reduced-motion users keep the plain grid.
  var deckTrack = document.querySelector(".nw-deck-track");
  if (deckTrack && !reducedMotion) {
    var deckCards = Array.prototype.slice.call(
      deckTrack.querySelectorAll(".nw-stack-cat")
    );
    var deckTotal = deckCards.length;
    if (deckTotal > 1) {
      var PER = 400; // px of scroll per card peel
      var baseTY = function (d) {
        return d * 10;
      }; // resting offset (px) by depth in deck
      var baseSC = function (d) {
        return 1 - d * 0.03;
      }; // resting scale by depth

      deckTrack.classList.add("is-deck");
      deckCards.forEach(function (card, i) {
        card.style.zIndex = String(deckTotal - i); // first card sits on top
      });

      var sizeTrack = function () {
        // (N-1) peels of scroll budget, plus 100vh so the last card rests
        deckTrack.style.height =
          (deckTotal - 1) * PER + window.innerHeight + "px";
      };

      var ticking = false;
      var render = function () {
        ticking = false;
        var scrolled = Math.max(0, -deckTrack.getBoundingClientRect().top);
        var raw = Math.min(scrolled / PER, deckTotal - 1);
        var top = Math.min(Math.floor(raw), deckTotal - 1);
        var p = raw - top; // 0 -> 1 through the current card's peel
        deckCards.forEach(function (card, i) {
          if (i < top) {
            // already peeled away above
            card.style.transform = "translateY(-115%) scale(1)";
            card.style.opacity = "0";
          } else if (i === top) {
            // peeling: slide up and fade
            card.style.transform = "translateY(" + -p * 115 + "%) scale(1)";
            card.style.opacity = String(1 - p);
          } else {
            // still in the deck — ease up one slot as the card above peels
            var d = i - top;
            var ty = baseTY(d) + (baseTY(d - 1) - baseTY(d)) * p;
            var sc = baseSC(d) + (baseSC(d - 1) - baseSC(d)) * p;
            card.style.transform =
              "translateY(" + ty + "px) scale(" + sc + ")";
            card.style.opacity = "1";
          }
        });
      };
      var onScroll = function () {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(render);
        }
      };

      sizeTrack();
      render();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", function () {
        sizeTrack();
        render();
      });
    }
  }
})();
