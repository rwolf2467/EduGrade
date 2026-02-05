// Theme switching script for Basecoat
// https://basecoatui.com/components/theme-switcher/
(() => {
    try {
        const stored = localStorage.getItem('themeMode');
        // Default to dark mode if no preference is stored
        const shouldBeDark = stored ? stored === 'dark' : true;

        if (shouldBeDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    } catch (_) { }

    const apply = dark => {
        document.documentElement.classList.toggle('dark', dark);
        try { localStorage.setItem('themeMode', dark ? 'dark' : 'light'); } catch (_) { }
    };

    document.addEventListener('basecoat:theme', (event) => {
        const mode = event.detail?.mode;
        apply(mode === 'dark' ? true
            : mode === 'light' ? false
                : !document.documentElement.classList.contains('dark'));
    });
})();