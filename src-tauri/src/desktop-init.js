Object.defineProperty(window, '__DEEPTRANS_DESKTOP__', {
    value: Object.freeze({ platform: 'tauri', version: '0.6.0' }),
    configurable: false,
    enumerable: false,
    writable: false,
});

document.documentElement.dataset.deeptransDesktop = 'true';

try {
    window.localStorage.setItem('deeptrans.desktop', '1');
} catch {
    // The marker in the DOM still enables desktop-specific rendering.
}
