# CryptoQwerty — 盤面生成 第3世代（Board V3）設計書

日付: 2026-11-14
対象: `Crypto-Qwerty/crypto-qwerty`（第3段階）
ブランチ: `stage3/rng-hmac`（第2段階のマージ後にリベースする）

## 1. 目的

盤面生成の乱数源を、暗号学的に安全な決定論的乱数生成方式に統一する。
数字シード専用の弱い経路（FNV-1a + Mulberry32）を本番経路から排除し、
英大小数字シードと数字シードの両方で同じ HMAC-SHA-256 カウンター方式を使う。

## 2. 変更前の方式と問題点

| 経路 | 方式 | 問題点 |
|---|---|---|
| v1（数字のみ） | FNV-1a 32bit + Mulberry32（`shared/random/prng-4q1.js`） | 暗号学的に安全でない。32bitハッシュがボトルネック。 |
| v2（数字以外） | SHA-256ハッシュ連鎖（`shared/random/board-v2-rng.js`、ドメイン `CM-BOARD-V2`） | SHA-256を使っているが HMAC ではなく、カウンター方式でもない（ハッシュ連鎖）。ドメイン分離は1種類のみ。 |

LCG（`shared/random/lcg.js`）は本番の盤面生成では使われていなかった。
テストでのみ使用されており、そのまま残す。

## 3. 仕様（Board V3）

実装: `shared/random/board-rng.js`（グローバル名 `CMBoardRng`）

### 3.1 乱数展開

```
鍵      = UTF-8( NFC( trim(シード文字列) ) )   ※ 空文字は "0" とする
メッセージ = ASCII("CM-BOARD-V3") || 0x00 || カウンター（4バイト・ビッグエンディアン）
ブロック  = HMAC-SHA-256(鍵, メッセージ)       ※ 32バイト
```

- ドメイン: `CM-BOARD-V3`（11文字のASCII）。区切りは `0x00` 1バイト。
  メッセージ全体は 11 + 1 + 4 = 16バイト。
- カウンター: 0 から始まり、ブロックごとに +1 する。ブロック同士は独立
  （ハッシュ連鎖ではない。各ブロックは鍵とカウンターだけで決まる）。
- カウンターが `0xFFFFFFFF` を超えたら例外 `CMBoardRng: counter overflow` で停止する。
- 用途別ドメイン分離: 盤面生成は `CM-BOARD-V3` を使う。ほかの用途で
  同じシードを使う場合は、別のドメイン文字列を使うこと。
  `createRandom(seed, { domain })` でドメインを指定できる（既定値は `CM-BOARD-V3`）。

### 3.2 32bitワードと範囲変換

- ワード: ブロックのバイト列を先頭から4バイトずつ、ビッグエンディアンで読む。
  `word = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3`（符号なし32bit）。
  1ブロックから8ワードが取れる。使い切ったら次のカウンターのブロックを生成する。
- `nextInt(n)`（`[0, n)` の一様乱数）: 棄却サンプリングで剰余バイアスを排除する。
  `limit = 2^32 - (2^32 % n)` とし、ワード `w >= limit` の場合は捨てて引き直す。
  32bitワードを使うため `n` は `2^32` まで。`n > 2^32` では `limit` が 0 になり
  すべてのワードが棄却され続けるため、呼び出しの先頭で即座に例外にする
  （`n <= 0` や非整数も同様に例外）。
- シャッフル: 後方 Fisher-Yates（`j = nextInt(i + 1)`、入力配列のコピーに対して行う）。

### 3.3 シードの扱い

- シードは文字列のまま扱う。数値化や先頭ゼロの削除は一切行わない。
  `"007"` と `"7"` は別のシードになる。
- 盤面生成は `CMSeedKey.canonicalSeedKey`（数値解釈）を使わない。
  `canonicalSeedKey` はバックアップ暗号化ドメイン専用である。
  （バックアップの暗号化鍵は保存時と復元時で同じ正規化を行うため、復元は一貫している。
  盤面そのものは常に生のシード文字列から生成される。）
- `Board.generate()` に数値型で渡された場合のみ `String(Math.trunc())` で
  文字列化する（従来通り）。UIは常に文字列を渡す。数値型に先頭ゼロは
  存在しないため、この分岐で先頭ゼロが失われることはない。

### 3.4 エラー処理

- HMAC-SHA-256ライブラリ（`vendor/js-sha256.js`）が読み込まれていない、
  または処理に失敗した場合は例外で停止する。
- 弱い乱数方式（FNV-1a / Mulberry32 / LCG / `Math.random` 等）への
  フォールバックはしない。盤面を静かに生成することはない。
- HMACは同期実装（`sha256.hmac.array`）を使う。WebCryptoの非同期化は不要。

### 3.5 盤面構成（変更なし）

- 保証スロット構成と消費順序は維持する。
  FULL-1 → FULL-2 → ALNUM → PIN の順にシャッフルして盤面を作る。
- FULL: 記号6種を必ず1つずつ＋英大10＋英小10＋数字10（計36）。
  ALNUM: 英大13＋英小13＋数字10。PIN: 数字0-9を3周＋6個。
- `classify`（v1/v2判定）はバックアップ等で使われているため削除しない。
  盤面生成では使わなくなっただけである。

## 4. シード生成

実装: `shared/validation/seed-key.js`

| 項目 | 標準シード | 数字シード |
|---|---|---|
| 長さ | 12文字 | 12桁 |
| 文字プール | 62種（英大小数字） | 10種（0-9） |
| 自動生成 | `generateSeed()` | `generateNumericSeed()`（新規） |
| 乱数源 | `crypto.getRandomValues()` | `crypto.getRandomValues()` |
| 偏り対策 | 棄却サンプリング（limit = 256 - 256 % 62 = 248） | 棄却サンプリング（limit = 256 - 256 % 10 = 250） |
| 最大エントロピー | 約71.45bit | 約39.86bit |

- 標準シードのプールは74種（記号入り）から62種（英大小数字のみ）に変更した。
  変更前は本番コードからの呼び出しがなかったため、既存の自動生成シードへの影響はない。
- 数字シードの先頭ゼロは文字として保持する（数値化しない）。
- SHA-256/HMACを使っても元のシードのエントロピーは増えない。
  数字シードは最大約39.86bit、標準シードは最大約71.45bitである。
  シードは盤面を再現するためのシリアルナンバーであり、秘密鍵と同じ
  強度を要求するものではない。シードを秘密情報として扱う場合は、
  数字シードの候補数が少ないことを考慮すること。

## 5. ゴールデンベクター

### 5.1 変更前の値（記録のみ。一致を要求しない）

シード `84920173`、サイト `AMAZON`、合言葉 `K7`。

| モード | 文字数 | 変更前の結果 |
|---|---|---|
| Normal | 16 | `B09oVPC%B0@4Un7@` |
| ALNUM | 16 | `vzQPv26EQp18DPx4` |
| PIN | 6 | `920899` |

盤面（変更前、v1経路）: board[0] は key `1`、tl `l`、tr `7`、bl `p`、br `8`。

### 5.2 新しい値（V3。以降の回帰テストの基準）

シード `84920173`、サイト `AMAZON`、合言葉 `K7`。

| モード | 文字数 | 新しい結果 |
|---|---|---|
| Normal | 16 | `%2y5R0#3%29yPa0$` |
| ALNUM | 16 | `6U4r63m84I1l2Ly0` |
| PIN | 6 | `341137` |

盤面（V3）: board[0] は key `1`、tl `D`、tr `Q`、bl `I`、br `8`。
board[1] は key `2`、tl `s`、tr `9`、bl `1`、br `9`。

標準シード `Ab3dEf7hJk2m`、サイト `AMAZON`、合言葉 `K7`:
Normal 16 = `2n1&BFN52n#6Ax3@`、ALNUM 16 = `RmuJRv9jun7NrJa3`、PIN 6 = `192715`。
board[0] は key `1`、tl `n`、tr `e`、bl `n`、br `9`。

先頭ゼロ: シード `007` の board[0] は tl `3`、tr `V`、bl `m`、br `1`。
シード `7` の board[0] は tl `9`、tr `8`、bl `v`、br `8`。両者は異なる。

## 6. 強度表示の監査

- `shared/generator/entropy.js` の `estimatePasswordEntropy` は、
  生成パスワードの文字数と文字種から理論値を計算するもので、各文字が
  独立一様ランダムであることを仮定している。決定論的な盤面生成には
  この仮定は当てはまらない。
- 新規に `estimateSeedEntropy(seedText)` を追加した。シードのエントロピー
  上限（文字種から一様ランダムに選ばれた場合の最大値）を返す。
  標準シードは約71.5bit、数字シードは約39.9bit。
- 画面表示では、パスワードの理論値ビット数に加えて「シード上限 約X bits」を
  表示する。実効的な強さはシードのエントロピーを超えないことを明示するためである。
  既存の注記「理論値で、実際の推測困難性を保証しません」は維持する。
- `contents/qwerty/index.js` に重複していた `estimatePasswordEntropy` の
  定義を1つに集約した（トップレベルの定義を残し、`DOMContentLoaded` 内の
  重複を削除。同一の計算式のため動作は変わらない）。
- 統計検定のPASSは暗号学的安全性の証明ではない。決定論性・仕様適合・
  偏り対策の検証として実施する。

## 7. ファイル一覧（第3段階の変更）

| ファイル | 変更内容 |
|---|---|
| `shared/random/board-rng.js` | 新規。HMAC-SHA-256カウンター方式の乱数エンジン。 |
| `shared/random/board-v2-rng.js` | 削除。SHA-256ハッシュ連鎖の旧エンジン。 |
| `profiles/qwerty/board.js` | v1/v2分岐を撤廃し、統一エンジンを使用。`CMSeedKey` への依存を削除。 |
| `shared/validation/seed-key.js` | UMD化（Node.jsで require 可能に）。`generateSeed` のプールを74種→62種に変更。`generateNumericSeed` を新規追加。 |
| `shared/generator/entropy.js` | `estimateSeedEntropy` を追加し、`window.estimateSeedEntropy` として公開。 |
| `contents/qwerty/index.js` | `estimatePasswordEntropy` の重複定義を集約。表示にシード上限ビット数を追加。 |
| `contents/qwerty/index.html` | `board-v2-rng.js` を `board-rng.js` に置き換え。`prng-4q1.js` の読み込みを削除（アプリ側で未使用）。 |
| `tests/test-runner.html` | `board-v2-rng.js` を `board-rng.js` に置き換え（`prng-4q1.js` はテスト用に残す）。 |
| `tests/shared/board-rng.test.js` | 新規。必須テスト一式（下記 §8）。 |
| `tests/shared/entropy.test.js` | 新規。シードエントロピーのテスト。 |
| `tests/shared/seed-key.test.js` | 62種プールと数字シード生成、先頭ゼロのテストを追加。 |
| `tests/shared/random.test.js` | LCG/prng-4q1 がレガシーモジュールである旨の注記を追加。 |
| `tests/qwerty/board-determinism.test.js` | 新ゴールデンベクターのテストを追加。 |
| `tests/qwerty/recipe-generation.test.js` | 新ゴールデンパスワードのテストを追加。 |
| `tests/run-all-tests.js` | `board-rng.test.js` と `entropy.test.js` を追加。 |
| `docs/board-rng-v3.md` | 本書。 |

変更していないもの: `shared/random/prng-4q1.js`、`shared/random/lcg.js`
（レガシーモジュールとして残す。盤面生成には使わない）。
`shared/generator/engine.js`、`profiles/qwerty/recipes.js`、
`profiles/qwerty/profile.js` には手を加えていない。

## 8. テスト

必須テスト（`tests/shared/board-rng.test.js` に実装）:

- 同じシードから常に同じ乱数列・同じ盤面が生成される。
- 数字シードと英大小数字シードの両方が正常に動作する。
- `007` と `7` が異なる盤面になる。
- 先頭ゼロが trim・生成・盤面生成を通じて維持される。
- HMAC処理失敗時に例外で停止する（ライブラリ不在・HMAC例外・出力長異常）。
- 棄却サンプリングが境界値を正しく捨てる（スタブによる決定論的検証）。
- `nextInt(n)` の上限チェック: `2^32` は許可され、`2^32` を超える値は
  HMACを呼ぶ前に即座に例外になる（`0`・負数・非整数も例外）。
- 文字種の保証と盤面の文字数が維持される（FULL 6/10/10/10、ALNUM 13/13/10、PIN 各数字3〜4回）。
- カウンターの重複やオーバーフローを防止する（counterStart の差異、0xFFFFFFFF でのオーバーフロー例外、無効な counterStart の拒否）。
- メッセージの構成が仕様通りである（ドメイン・区切り 0x00・カウンターのビッグエンディアンをスタブで捕捉して検証）。
- HMAC-SHA-256が既知のテストベクターと一致する（RFC 4231 Test Case 1/2）。
  vendored js-sha256 とモジュールの最初のブロックを、Node.js の HMAC
  （OpenSSL）による独立した計算と照合する。
- 新旧の乱数エンジンが意図せず混在しない（board.js のソースに旧参照がないこと、新盤面が旧盤面と異なること）。
- 新ゴールデンベクターが一致する。
- 統計検定: `nextInt(10)` と `nextInt(36)` のカイ二乗検定（10万回抽出、p=0.001 の臨界値を下回ること）。

### 実行方法と結果（2026-11-14）

```sh
node ~/workspace/investigation/stage3-harness.js tests/shared/random.test.js tests/shared/seed-key.test.js \
  tests/shared/board-rng.test.js tests/shared/entropy.test.js \
  tests/qwerty/board-determinism.test.js tests/qwerty/safe-symbols.test.js \
  tests/qwerty/recipe-generation.test.js
# Results: 47 passed, 0 failed
```

各テストファイルの `require.main` ブロックも個別に実行して PASS を確認した。
Python検証（`python3 tests/run-python-tests.py`）も PASS のままである。
ただし Python の乱数プールは JavaScript と異なるため、JavaScript実装の
正当性を証明するものではない（従来通り）。

注意: 正式な `node tests/run-all-tests.js` は 0/7 のままである。
テストファイルが `describe`/`it` を使うがフレームワークが未導入のためで、
第3段階の回帰ではなく第5段階で直すテストランナーの問題である。
上記の47件は一時的なハーネス（`~/workspace/investigation/stage3-harness.js`、コミット対象外）で
実行したものである。ハーネスは当初 `/tmp` に置いていたが、VMの入れ替えで
消えたため再作成し、以後は `~/workspace/investigation/` に置いている。

ブラウザ読み込み経路の確認: `node:vm` で index.html と同じ順序で
スクリプトを読み込み、盤面とパスワードが Node.js と同一になることを確認した。

## 9. 第4段階への引き継ぎ

- `contents/qwerty/sw.js` のキャッシュ対象に `board-rng.js` を追加すること。
  現在の `board-v2.js` という項目は実在しないファイル名の誤記であり、
  第3段階では `sw.js` に手を加えていない（第4段階で修正する）。
- `shared/random/prng-4q1.js` と `shared/random/lcg.js` はファイルとして残っている。
  第4段階のキャッシュ対象の洗い出し時に、読み込まれなくなったファイルが
  キャッシュ対象に残っていないか確認すること。
