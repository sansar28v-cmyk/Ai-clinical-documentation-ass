(function () {
  "use strict";

  /* ---------------------------------------------------------
     Mobile menu (burger + overlay + sheet)
  --------------------------------------------------------- */
  var burger = document.querySelector(".burger-btn");
  var overlay = document.querySelector(".mobile-overlay");
  var menu = document.querySelector(".mobile-menu");
  var body = document.body;

  function openMenu() {
    if (!burger || !overlay || !menu) return;
    burger.classList.add("open");
    burger.setAttribute("aria-expanded", "true");
    overlay.hidden = false;
    menu.hidden = false;
    body.classList.add("menu-open");

    var links = menu.querySelectorAll("li");
    links.forEach(function (li, i) {
      li.style.animationDelay = 0.06 + i * 0.05 + "s";
    });
  }

  function closeMenu() {
    if (!burger || !overlay || !menu) return;
    burger.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
    overlay.hidden = true;
    menu.hidden = true;
    body.classList.remove("menu-open");
  }

  function isMenuOpen() {
    return !!(menu && !menu.hidden);
  }

  if (burger) {
    burger.addEventListener("click", function () {
      if (isMenuOpen()) {
        closeMenu();
      } else {
        openMenu();
      }
    });
  }

  if (overlay) {
    overlay.addEventListener("click", closeMenu);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isMenuOpen()) {
      closeMenu();
    }
  });

  if (menu) {
    menu.querySelectorAll("a, button").forEach(function (el) {
      el.addEventListener("click", closeMenu);
    });
  }

  window.addEventListener("resize", function () {
    if (window.innerWidth > 720 && isMenuOpen()) {
      closeMenu();
    }
  });

  /* ---------------------------------------------------------
     Stats count-up animation
  --------------------------------------------------------- */
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function formatValue(value, decimals, suffix) {
    var formatted =
      decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
    return formatted + suffix;
  }

  function animateStat(el, index) {
    var target = parseFloat(el.getAttribute("data-target"));
    var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
    var suffix = el.getAttribute("data-suffix") || "";
    var duration = 1500 + index * 80;
    var startDelay = 480 + index * 90;

    setTimeout(function () {
      var startTime = null;

      function step(timestamp) {
        if (startTime === null) startTime = timestamp;
        var elapsed = timestamp - startTime;
        var progress = Math.min(elapsed / duration, 1);
        var eased = easeOutCubic(progress);
        var current = target * eased;
        el.textContent = formatValue(current, decimals, suffix);

        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          el.textContent = formatValue(target, decimals, suffix);
        }
      }

      window.requestAnimationFrame(step);
    }, startDelay);
  }

  var statValues = document.querySelectorAll(".stat-value[data-target]");
  if (statValues.length) {
    var hasIO = "IntersectionObserver" in window;
    if (hasIO) {
      var observer = new IntersectionObserver(
        function (entries, obs) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              var el = entry.target;
              var index = Array.prototype.indexOf.call(statValues, el);
              animateStat(el, index);
              obs.unobserve(el);
            }
          });
        },
        { threshold: 0.25 }
      );

      statValues.forEach(function (el) {
        observer.observe(el);
      });
    } else {
      statValues.forEach(function (el, i) {
        animateStat(el, i);
      });
    }
  }
})();
