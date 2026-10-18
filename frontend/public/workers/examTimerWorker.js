/**
 * examTimerWorker.js — Independent Web Worker for drift-free test timer.
 * Runs on an isolated OS thread immune to browser inactive-tab throttling.
 */

let timerInterval = null;
let targetEpochMs = 0;

self.onmessage = function (e) {
  const { type, payload } = e.data;

  if (type === "START") {
    targetEpochMs = payload.targetEpochMs;
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
      const remainingMs = Math.max(0, targetEpochMs - Date.now());
      self.postMessage({
        type: "TICK",
        payload: {
          remainingSeconds: Math.ceil(remainingMs / 1000),
          isExpired: remainingMs <= 0,
        },
      });

      if (remainingMs <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }, 500);
  } else if (type === "SYNC") {
    targetEpochMs = payload.targetEpochMs;
  } else if (type === "STOP") {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
};
