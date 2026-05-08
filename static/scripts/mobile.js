/* =============================================================
 * EduGrade Mobile Layer (Phase 1)
 * Bottom nav, sidebar swipe-to-close, mobile state helper.
 * Loaded after render.js / eventListeners.js — relies on globals
 *   showHomeView, showClassView, appData, t (i18n)
 * Desktop UI must remain untouched: all behavior gated on isMobile().
 * ============================================================= */
(function () {
    "use strict";

    const MOBILE_QUERY = "(max-width: 768px)";
    const mql = window.matchMedia(MOBILE_QUERY);

    /** Single source of truth for "is the viewport mobile-sized?" */
    window.isMobile = () => mql.matches;

    /* ---------- i18n helper (fallback to literal) ---------- */
    const tr = (key, fallback) => {
        try {
            if (typeof t === "function") {
                const v = t(key);
                if (v && v !== key) return v;
            }
        } catch (_) { /* ignore */ }
        return fallback;
    };

    /* ---------- Toast helper (uses existing undo-notification bar as fallback) ---------- */
    const toast = (msg) => {
        const bar = document.getElementById("undo-notification");
        const txt = document.getElementById("undo-notification-text");
        const btn = document.getElementById("undo-notification-btn");
        if (!bar || !txt) {
            // Fallback: alert is acceptable here, but keep silent in production.
            console.info("[mobile]", msg);
            return;
        }
        txt.textContent = msg;
        if (btn) btn.style.display = "none";
        bar.classList.remove("hidden");
        bar.classList.add("flex");
        clearTimeout(toast._t);
        toast._t = setTimeout(() => {
            bar.classList.add("hidden");
            bar.classList.remove("flex");
            if (btn) btn.style.display = "";
        }, 2400);
    };

    /* ---------- View-state helpers ---------- */
    const isViewVisible = (id) => {
        const el = document.getElementById(id);
        return !!(el && !el.classList.contains("hidden"));
    };

    const isStudentDetailVisible = () => isViewVisible("student-detail-view");
    const isClassViewVisible = () => isViewVisible("class-view");

    /* ---------- Bottom-nav actions ---------- */
    function actHome() {
        if (typeof showHomeView === "function") showHomeView();
    }

    function actClasses() {
        // Reuse the existing sidebar toggle event the topbar hamburger fires.
        document.dispatchEvent(new CustomEvent("basecoat:sidebar"));
    }

    function actQuickAdd() {
        // Context-aware "Note hinzufügen".
        if (isStudentDetailVisible()) {
            const btn = document.getElementById("student-detail-add-grade");
            if (btn) { btn.click(); return; }
        }
        if (isClassViewVisible()) {
            // From class view: trigger class exam "Noten eintragen" fast-mode.
            const btn = document.getElementById("class-exam-btn");
            if (btn) { btn.click(); return; }
        }
        // No active class context → open sidebar so user can pick one.
        actClasses();
        toast(tr("mobile.pickClass", "Bitte zuerst eine Klasse öffnen."));
    }

    function actClassExam() {
        if (isClassViewVisible()) {
            const btn = document.getElementById("class-exam-btn");
            if (btn) { btn.click(); return; }
        }
        // Need a class first.
        if (window.appData && window.appData.currentClassId && typeof showClassView === "function") {
            showClassView();
            // Defer click until view transition settles (showClassView animates ~150ms).
            setTimeout(() => {
                const btn = document.getElementById("class-exam-btn");
                if (btn) btn.click();
            }, 220);
            return;
        }
        actClasses();
        toast(tr("mobile.pickClass", "Bitte zuerst eine Klasse öffnen."));
    }

    function actMenu() {
        openMenuSheet();
    }

    /* ---------- Bottom-nav rendering ---------- */
    function renderBottomNav() {
        let nav = document.getElementById("mobile-bottom-nav");
        if (!nav) return;

        // Idempotent: if already rendered, just rewire current state.
        if (!nav.dataset.rendered) {
            nav.innerHTML = `
                <button type="button" class="mnav-btn" data-mnav="home" aria-label="${tr("nav.home", "Home")}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                    <span>${tr("nav.home", "Home")}</span>
                </button>
                <button type="button" class="mnav-btn" data-mnav="classes" aria-label="${tr("nav.classes", "Klassen")}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                    </svg>
                    <span>${tr("nav.classes", "Klassen")}</span>
                </button>
                <button type="button" class="mnav-btn mnav-primary" data-mnav="quick-add" aria-label="${tr("mobile.quickAdd", "Note hinzufügen")}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" aria-hidden="true">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    <span>${tr("mobile.quickAdd", "Note")}</span>
                </button>
                <button type="button" class="mnav-btn" data-mnav="class-exam" aria-label="${tr("classExam.title", "Klassenarbeit")}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="9" y1="13" x2="15" y2="13"/>
                        <line x1="9" y1="17" x2="13" y2="17"/>
                    </svg>
                    <span>${tr("mobile.exam", "Test")}</span>
                </button>
                <button type="button" class="mnav-btn" data-mnav="menu" aria-label="${tr("nav.menu", "Menü")}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="5" cy="12" r="1.5"/>
                        <circle cx="12" cy="12" r="1.5"/>
                        <circle cx="19" cy="12" r="1.5"/>
                    </svg>
                    <span>${tr("nav.menu", "Menü")}</span>
                </button>
            `;
            nav.addEventListener("click", onNavClick);
            nav.dataset.rendered = "1";
        }
        updateActiveState();
    }

    function onNavClick(ev) {
        const btn = ev.target.closest("[data-mnav]");
        if (!btn) return;
        const action = btn.dataset.mnav;
        switch (action) {
            case "home": actHome(); break;
            case "classes": actClasses(); break;
            case "quick-add": actQuickAdd(); break;
            case "class-exam": actClassExam(); break;
            case "menu": actMenu(); break;
        }
        // Defer state update so the click has already advanced the view.
        setTimeout(updateActiveState, 50);
    }

    function updateActiveState() {
        const nav = document.getElementById("mobile-bottom-nav");
        if (!nav) return;
        let current = "home";
        if (isViewVisible("class-view") || isViewVisible("student-detail-view") || isViewVisible("attendance-view")) {
            current = "classes";
        } else if (isViewVisible("settings-view")) {
            current = "menu";
        } else if (isViewVisible("home-view")) {
            current = "home";
        }
        nav.querySelectorAll("[data-mnav]").forEach(btn => {
            if (btn.dataset.mnav === current) btn.setAttribute("aria-current", "page");
            else btn.removeAttribute("aria-current");
        });
    }

    /* ---------- Menu sheet ---------- */
    let _sheetEls = null;
    function ensureSheet() {
        if (_sheetEls) return _sheetEls;
        const backdrop = document.createElement("div");
        backdrop.className = "mobile-sheet-backdrop";
        backdrop.setAttribute("aria-hidden", "true");

        const sheet = document.createElement("div");
        sheet.className = "mobile-sheet";
        sheet.setAttribute("role", "dialog");
        sheet.setAttribute("aria-modal", "true");
        sheet.innerHTML = `
            <button type="button" data-sheet-act="settings">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                    <circle cx="12" cy="12" r="3"/>
                </svg>
                <span>${tr("nav.settings", "Einstellungen")}</span>
            </button>
            <button type="button" data-sheet-act="profile">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                </svg>
                <span>${tr("nav.profile", "Profil")}</span>
            </button>
            <button type="button" data-sheet-act="export">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <path d="M7 10l5 5 5-5"/>
                    <path d="M12 15V3"/>
                </svg>
                <span>${tr("nav.export", "Export")}</span>
            </button>
            <button type="button" data-sheet-act="theme">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
                </svg>
                <span>${tr("nav.toggleTheme", "Theme wechseln")}</span>
            </button>
            <a href="/about.html" data-sheet-act="about">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4M12 8h.01"/>
                </svg>
                <span>${tr("nav.about", "Über")}</span>
            </a>
            <hr/>
            <button type="button" data-sheet-act="logout" style="color: var(--destructive, #ef4444);">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                <span>${tr("nav.logout", "Abmelden")}</span>
            </button>
        `;
        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);

        backdrop.addEventListener("click", closeMenuSheet);
        sheet.addEventListener("click", onSheetClick);

        _sheetEls = { backdrop, sheet };
        return _sheetEls;
    }

    function openMenuSheet() {
        const { backdrop, sheet } = ensureSheet();
        backdrop.classList.add("is-open");
        // Force reflow so transition runs from the initial transform.
        sheet.offsetHeight;
        sheet.classList.add("is-open");
    }

    function closeMenuSheet() {
        if (!_sheetEls) return;
        _sheetEls.sheet.classList.remove("is-open");
        _sheetEls.backdrop.classList.remove("is-open");
    }

    function onSheetClick(ev) {
        const target = ev.target.closest("[data-sheet-act]");
        if (!target) return;
        const act = target.dataset.sheetAct;
        // Allow <a> default navigation (about) to proceed; close sheet for buttons.
        if (target.tagName !== "A") ev.preventDefault();
        closeMenuSheet();
        switch (act) {
            case "settings": {
                const b = document.getElementById("nav-settings");
                if (b) b.click();
                break;
            }
            case "profile": {
                const b = document.getElementById("profile-btn");
                if (b) b.click();
                break;
            }
            case "export": {
                const b = document.getElementById("export-data");
                if (b) b.click();
                break;
            }
            case "theme":
                document.dispatchEvent(new CustomEvent("basecoat:theme"));
                break;
            case "logout": {
                const b = document.getElementById("logout-btn");
                if (b) b.click();
                break;
            }
            case "about":
                /* anchor handles navigation */ break;
        }
    }

    /* ---------- Sidebar: backdrop + swipe-to-close ---------- */
    let _backdrop = null;
    function getBackdrop() {
        if (_backdrop) return _backdrop;
        _backdrop = document.createElement("div");
        _backdrop.className = "sidebar-backdrop";
        _backdrop.addEventListener("click", () => {
            // Close sidebar via the existing toggle so all listeners stay in sync.
            document.dispatchEvent(new CustomEvent("basecoat:sidebar"));
        });
        document.body.appendChild(_backdrop);
        return _backdrop;
    }

    function syncBackdrop() {
        if (!window.isMobile()) {
            if (_backdrop) _backdrop.classList.remove("is-open");
            return;
        }
        const sb = document.querySelector("aside.sidebar");
        if (!sb) return;
        const open = sb.getAttribute("aria-hidden") === "false";
        getBackdrop().classList.toggle("is-open", open);
    }

    function attachSwipe() {
        const sb = document.querySelector("aside.sidebar");
        if (!sb || sb.dataset.swipeAttached) return;
        sb.dataset.swipeAttached = "1";

        let startX = 0, startY = 0, dx = 0, dy = 0, tracking = false, decided = false, isHorizontal = false;

        sb.addEventListener("touchstart", (e) => {
            if (!window.isMobile()) return;
            if (sb.getAttribute("aria-hidden") !== "false") return;
            const t = e.touches[0];
            startX = t.clientX; startY = t.clientY; dx = 0; dy = 0;
            tracking = true; decided = false; isHorizontal = false;
        }, { passive: true });

        sb.addEventListener("touchmove", (e) => {
            if (!tracking) return;
            const t = e.touches[0];
            dx = t.clientX - startX;
            dy = t.clientY - startY;
            if (!decided) {
                if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                    isHorizontal = Math.abs(dx) > Math.abs(dy);
                    decided = true;
                    if (isHorizontal) sb.classList.add("is-swiping");
                }
            }
            if (isHorizontal && dx < 0) {
                // Pin to finger only when swiping left (closing direction).
                sb.style.transform = `translateX(${dx}px)`;
            }
        }, { passive: true });

        const end = () => {
            if (!tracking) return;
            tracking = false;
            sb.classList.remove("is-swiping");
            sb.style.transform = "";
            if (isHorizontal && dx < -60) {
                // Past threshold → close via the official toggle.
                document.dispatchEvent(new CustomEvent("basecoat:sidebar"));
            }
        };
        sb.addEventListener("touchend", end, { passive: true });
        sb.addEventListener("touchcancel", end, { passive: true });
    }

    /* ---------- Boot ---------- */
    function init() {
        renderBottomNav();
        attachSwipe();
        syncBackdrop();

        // Re-render labels when language changes (i18n module typically dispatches this).
        document.addEventListener("i18n:changed", () => {
            const nav = document.getElementById("mobile-bottom-nav");
            if (nav) { nav.innerHTML = ""; delete nav.dataset.rendered; renderBottomNav(); }
            if (_sheetEls) {
                _sheetEls.sheet.remove();
                _sheetEls.backdrop.remove();
                _sheetEls = null;
            }
        });

        // Track sidebar open/close to sync backdrop. The basecoat sidebar toggle
        // flips aria-hidden on the aside; observe it directly.
        const sb = document.querySelector("aside.sidebar");
        if (sb) {
            new MutationObserver(syncBackdrop).observe(sb, {
                attributes: true,
                attributeFilter: ["aria-hidden"],
            });
        }

        // Update active state when views switch (any class change on view sections).
        const targets = ["home-view", "class-view", "student-detail-view", "attendance-view", "settings-view"];
        targets.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            new MutationObserver(updateActiveState).observe(el, {
                attributes: true,
                attributeFilter: ["class"],
            });
        });

        // Re-evaluate when viewport crosses the breakpoint (e.g. rotation).
        const onMqChange = () => syncBackdrop();
        if (typeof mql.addEventListener === "function") mql.addEventListener("change", onMqChange);
        else if (typeof mql.addListener === "function") mql.addListener(onMqChange);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
