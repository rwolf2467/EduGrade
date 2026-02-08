// i18n.js - Internationalization engine
// Must be loaded AFTER security.js and data.js, BEFORE all other scripts

const I18n = (() => {
    const translations = {};
    let currentLang = 'en';
    const SUPPORTED_LANGS = ['en', 'de'];

    const detectLanguage = () => {
        const stored = localStorage.getItem('edugrade-lang');
        if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
        const browserLang = (navigator.language || '').substring(0, 2);
        if (SUPPORTED_LANGS.includes(browserLang)) return browserLang;
        return 'en';
    };

    const loadTranslations = (lang) => {
        if (translations[lang]) return;
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `/static/i18n/${lang}.json`, false);
        xhr.send();
        if (xhr.status === 200) {
            translations[lang] = JSON.parse(xhr.responseText);
        } else {
            console.error(`Failed to load translations for ${lang}`);
            translations[lang] = {};
        }
    };

    const init = () => {
        currentLang = detectLanguage();
        loadTranslations('en');
        if (currentLang !== 'en') {
            loadTranslations(currentLang);
        }
    };

    const t = (key, params = {}) => {
        let text = translations[currentLang]?.[key]
            ?? translations['en']?.[key]
            ?? key;

        if (params && typeof params === 'object') {
            Object.entries(params).forEach(([k, v]) => {
                text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
            });
        }

        // Simple pluralization: "1 student | {count} students"
        if (text.includes(' | ') && params.count !== undefined) {
            const parts = text.split(' | ');
            text = params.count === 1 ? parts[0] : parts[1];
            text = text.replace(/\{count\}/g, params.count);
        }

        return text;
    };

    const setLanguage = (lang) => {
        if (!SUPPORTED_LANGS.includes(lang)) return;
        loadTranslations(lang);
        currentLang = lang;
        localStorage.setItem('edugrade-lang', lang);
        if (typeof appData !== 'undefined') {
            appData.language = lang;
        }
        applyI18nToDOM();
    };

    const getCurrentLanguage = () => currentLang;

    const applyI18nToDOM = () => {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const params = el.dataset.i18nParams ? JSON.parse(el.dataset.i18nParams) : {};
            el.textContent = t(key, params);
        });
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html');
            el.innerHTML = t(key);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = t(el.getAttribute('data-i18n-title'));
        });
        document.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
            el.setAttribute('data-tooltip', t(el.getAttribute('data-i18n-tooltip')));
        });
        document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
            el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
        });
        
        // Handle select options with data-i18n-option
        document.querySelectorAll('option[data-i18n-option]').forEach(option => {
            const key = option.getAttribute('data-i18n-option');
            option.textContent = t(key);
        });
    };

    init();

    return { t, setLanguage, getCurrentLanguage, applyI18nToDOM, loadTranslations };
})();

const t = I18n.t;
