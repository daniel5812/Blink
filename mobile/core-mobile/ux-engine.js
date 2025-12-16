// ux-engine.js

(function () {
  let current = "NORMAL";

  function apply(state) {
    if (state === current) return;
    current = state;

    const root = document.documentElement;

    root.style.transition =
      "font-size 1.5s ease, line-height 1.5s ease, background-color 1.5s ease";

    if (state === "NORMAL") {
      root.style.fontSize = "100%";
      root.style.lineHeight = "1.5";
      root.style.backgroundColor = "";
    }

    if (state === "STRAIN") {
      root.style.fontSize = "104%";
      root.style.lineHeight = "1.6";
      root.style.backgroundColor = "#fafafa";
    }

    if (state === "FATIGUE") {
      root.style.fontSize = "108%";
      root.style.lineHeight = "1.7";
      root.style.backgroundColor = "#f5f5f5";
    }
  }

  // לולאה ראשית
  setInterval(() => {
    const sensor = window.BlinkSensor;
    if (!sensor) return;

    const strain = BlinkCore.update(sensor);
    const state = BlinkState.compute(strain);
    apply(state);
  }, 400);
})();
