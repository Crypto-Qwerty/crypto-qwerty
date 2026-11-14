'use strict';

/**
 * CryptoMatrix 共通生成エンジン (CryptoMatrixEngine)
 *
 * 盤面プロファイルとレシピプロファイルを受け取り、
 * 決定論的に盤面データおよびパスワード評価ステップを生成する。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CryptoMatrixEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const registeredProfiles = new Map();

  class Engine {
    constructor(profile = null) {
      this.currentProfile = null;
      this.currentMatrixData = [];
      this.lastSeed = null;
      if (profile) {
        this.setProfile(profile);
      }
    }

    static registerProfile(profile) {
      if (!profile || !profile.id) {
        throw new Error('CryptoMatrixEngine: profile must have a valid id');
      }
      registeredProfiles.set(profile.id, profile);
    }

    static getProfile(id) {
      return registeredProfiles.get(id) || null;
    }

    static listProfiles() {
      return Array.from(registeredProfiles.values());
    }

    setProfile(profileOrId) {
      let p = profileOrId;
      if (typeof profileOrId === 'string') {
        p = registeredProfiles.get(profileOrId);
        if (!p) throw new Error(`CryptoMatrixEngine: unknown profile id "${profileOrId}"`);
      }
      if (!p || typeof p.board?.generate !== 'function') {
        throw new Error('CryptoMatrixEngine: invalid profile structure');
      }
      this.currentProfile = p;
      this.currentMatrixData = [];
      this.lastSeed = null;
      return this;
    }

    getProfile() {
      return this.currentProfile;
    }

    /**
     * シード値から盤面データを生成・キャッシュする
     * @param {string|number} seed
     * @returns {Array<Object>} matrixData
     */
    generateBoard(seed) {
      if (!this.currentProfile) {
        throw new Error('CryptoMatrixEngine: no profile selected');
      }
      this.lastSeed = seed;
      this.currentMatrixData = this.currentProfile.board.generate(seed);
      return this.currentMatrixData;
    }

    getMatrixData() {
      return this.currentMatrixData;
    }

    /**
     * サイト名、合言葉、設定からパスワードを評価・生成する
     * @param {string} site
     * @param {string} secret
     * @param {Object} [configOverride]
     * @returns {Object} { password, steps, entropy, verbalGuide }
     */
    evaluate(site, secret, configOverride = {}) {
      if (!this.currentProfile) {
        throw new Error('CryptoMatrixEngine: no profile selected');
      }
      if (!this.currentMatrixData || this.currentMatrixData.length === 0) {
        throw new Error('CryptoMatrixEngine: board is not generated yet');
      }

      const cfg = Object.assign(
        {},
        this.currentProfile.recipe.defaultConfig || {},
        configOverride
      );

      const result = this.currentProfile.recipe.evaluate(
        site,
        secret,
        cfg,
        this.currentMatrixData
      );

      return result;
    }
  }

  return Engine;
});
