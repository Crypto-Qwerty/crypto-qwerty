// iOS 判定（描画前に html へ cm-ios を付与。iOS 専用スタイルの適用範囲とする。
// 判定式は contents/qwerty/app.js の PWA 案内と同一。Android・PC には付かない）
try {
  var iosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iosDevice) document.documentElement.classList.add('cm-ios');
} catch (e) {}

try {
  var urlTheme = null;
  try {
    var sp = new URLSearchParams(window.location.search);
    urlTheme = sp.get('theme');
    if (!urlTheme && window.location.hash.indexOf('theme=') >= 0) {
      urlTheme = window.location.hash.split('theme=')[1].split('&')[0];
    }
  } catch (err) {}
  if (urlTheme === 'dark' || (!urlTheme && localStorage.getItem('cm-theme') === 'dark')) {
    document.documentElement.classList.remove('light');
  } else {
    document.documentElement.classList.add('light');
  }
} catch (e) {
  document.documentElement.classList.add('light');
}
