// core/BlinkBrain.js
import { VisualState } from "./VisualState.js";

/**
 * BlinkBrain v1
 * ----------------
 * Platform-agnostic user state engine.
 * Input: abstract visual signals
 * Output: visual user state (NORMAL / STRAIN / FATIGUE)
 */
export class BlinkBrain {
  constructor(config = {}) {
    // ===============================
    // Configuration (tunable)
    // ===============================
    this.config = {
      strainThreshold: config.strainThreshold ?? 100,
      fatigueThreshold: config.fatigueThreshold ?? 220,

      recoveryRate: config.recoveryRate ?? 0.6,
      decayWhenNeutral: config.decayWhenNeutral ?? 0.3,

      closeWeight: config.closeWeight ?? 1.4,
      midWeight: config.midWeight ?? 0.0,
      farWeight: config.farWeight ?? -1.2
    };

    // ===============================
    // Internal state
    // ===============================
    this.visualLoad = 0; // accumulated strain
    this.state = VisualState.NORMAL;
    this.lastUpdateTs = null;
  }

  /**
   * Update brain with new signals
   * @param {{ proximity: "CLOSE"|"MID"|"FAR", timestamp: number }} signals
   * @returns {VisualState}
   */
  updateSignals(signals) {
    const { proximity, timestamp } = signals;

    if (!this.lastUpdateTs) {
      this.lastUpdateTs = timestamp;
      return this.state;
    }

    const dt = (timestamp - this.lastUpdateTs) / 1000; // seconds
    this.lastUpdateTs = timestamp;

    // ===============================
    // Accumulate visual load
    // ===============================
    let delta = 0;

    if (proximity === "CLOSE") {
      delta = this.config.closeWeight * dt;
    } else if (proximity === "MID") {
      delta = this.config.midWeight * dt;
    } else if (proximity === "FAR") {
      delta = this.config.farWeight * dt;
    }

    this.visualLoad += delta;

    // Clamp visual load
    if (this.visualLoad < 0) this.visualLoad = 0;

    // ===============================
    // State transitions
    // ===============================
    if (this.state === VisualState.NORMAL) {
      if (this.visualLoad >= this.config.strainThreshold) {
        this.state = VisualState.STRAIN;
      }
    }

    else if (this.state === VisualState.STRAIN) {
      if (this.visualLoad >= this.config.fatigueThreshold) {
        this.state = VisualState.FATIGUE;
      } else if (this.visualLoad < this.config.strainThreshold * 0.6) {
        // hysteresis for recovery
        this.state = VisualState.NORMAL;
      }
    }

    else if (this.state === VisualState.FATIGUE) {
      if (this.visualLoad < this.config.fatigueThreshold * 0.7) {
        this.state = VisualState.STRAIN;
      }
    }

    // ===============================
    // Passive recovery
    // ===============================
    if (proximity !== "CLOSE") {
      this.visualLoad -= this.config.recoveryRate * dt;
      if (this.visualLoad < 0) this.visualLoad = 0;
    }

    return this.state;
  }

  /**
   * Read-only state getter
   */
  getState() {
    return this.state;
  }

  /**
   * Debug / dev helper
   */
  getDebugInfo() {
    return {
      state: this.state,
      visualLoad: Math.round(this.visualLoad)
    };
  }
}
