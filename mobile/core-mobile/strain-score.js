// strain-core.js

window.BlinkCore = (function () {
  let strain = 0;

  const BUILD_RATE = 0.015;
  const DECAY_RATE = 0.008;

  function update({ distance, idle }) {
    if (distance === "CLOSE" && idle) {
      strain += BUILD_RATE * 16;
    } else {
      strain -= DECAY_RATE * 16;
    }

    strain = Math.max(0, Math.min(100, strain));
    return strain;
  }

  function get() {
    return strain;
  }

  return { update, get };
})();
