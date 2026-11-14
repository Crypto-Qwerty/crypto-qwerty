# CryptoPassKey (QWERTY Offline Password Matrix)

完全オフラインで動作する決定論的パスワード生成・物理カードバックアップシステム **CryptoPassKey** のリポジトリです。

## ディレクトリ構成

```text
crypto_qwerty/
├── shared/                  ← 共通暗号・乱数・バックアップ基盤
│   ├── generator/           生成エンジンコア (CryptoMatrixEngine, エントロピー計算)
│   ├── random/              乱数処理 (LCG, HMAC-SHA-256カウンター方式 CMBoardRng, PRNG)
│   ├── storage/             保存・設定管理 (SeedVault, PasskeyStore)
│   ├── backup/              バックアップ (BIP39, レシピ版6パック, QRバックアップ, TimeLock, TimeSecret)
│   ├── validation/          入力検証 (CMSeedKey 正規シード解釈)
│   ├── common-ui/           共通UI部品 (テーマ初期化, レイアウト, フィールドヒント, 復元ステップ)
│   └── vendor/              共通外部依存 (js-sha256, argon2, tlock, jsQR, zxing)
│
├── profiles/
│   └── qwerty/                 ← QWERTY 36キー盤面・レシピプロファイル
│
├── contents/
│   └── qwerty/                 ← CryptoPassKey Webアプリ本体 (keeweb/ 連携含む)
│
├── tests/
│   ├── shared/              共通モジュールテスト
│   ├── qwerty/                 QWERTY 盤面決定論性・Safe Symbols・レシピテスト
│   ├── test-runner.html     ブラウザ完結型 テストランナー (GUI)
│   └── run-all-tests.js     Node.js CLI テストランナー
```
