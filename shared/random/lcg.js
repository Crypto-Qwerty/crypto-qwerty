'use strict';

/**
 * 線形合同法＆浮動小数点除算による乱数生成器（Crypto Matrix .html / Classic と完全互換）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.LinearCongruentialGenerator = exports.LinearCongruentialGenerator;
    root.Random = exports.Random;
    root.Number1D = exports.Number1D;
    root.CMLCG = exports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  class LinearCongruentialGenerator {
    constructor(seed) {
      this.m = 4294967296; // 2^32
      this.a = 1664525;
      this.c = 1013904223;
      const parsed = Number(seed);
      this.state = Number.isFinite(parsed) ? parsed : 0;
    }
    next() {
      this.state = (this.a * this.state + this.c) % this.m;
      return this.state / this.m;
    }
    intRange(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    }
  }

  class Random {
    constructor(seed) {
      this.generator = new LinearCongruentialGenerator(seed);
    }
    rand() {
      return this.generator.next();
    }
    intRange(min, max) {
      return this.generator.intRange(min, max);
    }
  }

  class Number1D {
    static shuffle(array, random) {
      const res = array.slice();
      for (let i = res.length - 1; i > 0; i--) {
        const j = Math.floor(random.rand() * (i + 1));
        const tmp = res[i];
        res[i] = res[j];
        res[j] = tmp;
      }
      return res;
    }
    static repeatArray(a, n) {
      const res = [];
      for (let i = 0; i < n; i++) {
        res.push(...a);
      }
      return res;
    }
    static filledOverMaxTile(a, max) {
      const len = a.length;
      const count = Math.ceil(max / len);
      return Number1D.repeatArray(a, count);
    }
  }

  return { LinearCongruentialGenerator, Random, Number1D };
});
