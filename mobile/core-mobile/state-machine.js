// state-machine.js

window.BlinkState = (function () {
  let state = "NORMAL";

  function compute(score) {
    if (score > 60) state = "FATIGUE";
    else if (score > 30) state = "STRAIN";
    else state = "NORMAL";
    return state;
  }

  return { compute };
})();
