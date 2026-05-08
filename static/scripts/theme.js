// Theme + accent switching for EduGrade.
// - Theme (dark/light) persisted in localStorage.
// - Accent (color preset) persisted in user meta + localStorage cache.
// Both applied before paint to avoid FOUC.
(() => {
    const ACCENT_PRESETS = {
        'slate-teal': { h: 200, s: 35, l: 45 },
        'red':        { h: 0,   s: 55, l: 50 },
        'orange':     { h: 25,  s: 65, l: 50 },
        'yellow':     { h: 45,  s: 60, l: 48 },
        'green':      { h: 145, s: 40, l: 42 },
        'blue':       { h: 220, s: 45, l: 50 },
        'purple':     { h: 270, s: 40, l: 50 },
        'mono':       { h: 0,   s: 0,  l: 25 },
    };
    const DEFAULT_ACCENT = 'slate-teal';

    function applyAccent(presetKey) {
        const preset = ACCENT_PRESETS[presetKey] || ACCENT_PRESETS[DEFAULT_ACCENT];
        const root = document.documentElement;
        root.style.setProperty('--accent-h', preset.h);
        root.style.setProperty('--accent-s', preset.s + '%');
        root.style.setProperty('--accent-l', preset.l + '%');
        try { localStorage.setItem('accentColor', presetKey); } catch (_) {}
        // Update meta theme-color for mobile chrome
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', `hsl(${preset.h} ${preset.s}% ${preset.l}%)`);
    }

    // Apply cached accent immediately (pre-paint)
    try {
        const cached = localStorage.getItem('accentColor');
        if (cached && ACCENT_PRESETS[cached]) applyAccent(cached);
    } catch (_) {}

    // Theme (dark/light)
    try {
        const stored = localStorage.getItem('themeMode');
        const shouldBeDark = stored ? stored === 'dark' : true;
        document.documentElement.classList.toggle('dark', shouldBeDark);
    } catch (_) {}

    const applyTheme = dark => {
        document.documentElement.classList.toggle('dark', dark);
        try { localStorage.setItem('themeMode', dark ? 'dark' : 'light'); } catch (_) {}
    };

    document.addEventListener('basecoat:theme', (event) => {
        const mode = event.detail?.mode;
        applyTheme(mode === 'dark' ? true
            : mode === 'light' ? false
                : !document.documentElement.classList.contains('dark'));
    });

    // Public API
    window.EduGradeAccent = {
        presets: ACCENT_PRESETS,
        apply: applyAccent,
        getCurrent() {
            try { return localStorage.getItem('accentColor') || DEFAULT_ACCENT; }
            catch (_) { return DEFAULT_ACCENT; }
        },
        // Persist to backend meta. Caller should pass the existing meta-save fn
        // or use fetch directly — render.js exposes saveMeta().
        save(presetKey) {
            applyAccent(presetKey);
            try {
                if (typeof appData !== 'undefined') {
                    appData.accentColor = presetKey;
                    if (typeof saveData === 'function') saveData('Accent updated', 'success');
                }
            } catch (e) { console.warn('accent save failed', e); }
        },
    };

    // Listen for explicit accent change event (from picker UI)
    document.addEventListener('accent:change', (event) => {
        const key = event.detail?.preset;
        if (key) window.EduGradeAccent.save(key);
    });
})();
