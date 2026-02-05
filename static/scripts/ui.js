// ui.js
// ========== UI-HILFSFUNKTIONEN ==========
// Diese Datei enthält Funktionen für Benutzer-Benachrichtigungen und Dialoge.
// "UI" steht für "User Interface" (Benutzeroberfläche).

// ============ LOADING SPINNER SVG ============
const SPINNER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="status" aria-label="Loading" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>`;

/**
 * BUTTON LOADING STATE
 *
 * Setzt einen Button in den Loading-Zustand mit Spinner.
 * Speichert den ursprünglichen Inhalt für spätere Wiederherstellung.
 *
 * @param {HTMLButtonElement} btn - Der Button
 * @param {boolean} isLoading - true = Loading, false = Normal
 * @param {string} loadingText - Text während des Ladens (optional)
 */
const setButtonLoading = (btn, isLoading, loadingText = 'Loading...') => {
    if (isLoading) {
        // Speichere originalen Inhalt
        btn.dataset.originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `${SPINNER_SVG}<span>${loadingText}</span>`;
    } else {
        // Stelle originalen Inhalt wieder her
        if (btn.dataset.originalHtml) {
            btn.innerHTML = btn.dataset.originalHtml;
            delete btn.dataset.originalHtml;
        }
        btn.disabled = false;
    }
};

/**
 * LOADING OVERLAY ANZEIGEN
 *
 * Zeigt ein modales Loading-Overlay mit Spinner und optionalem Text.
 * Blockiert Benutzerinteraktion während des Ladevorgangs.
 *
 * @param {string} title - Überschrift (optional)
 * @param {string} description - Beschreibung (optional)
 * @returns {HTMLDialogElement} Das Dialog-Element zum späteren Schließen
 */
const showLoadingOverlay = (title = 'Processing your request', description = 'Please wait while we process your request. Do not refresh the page.') => {
    // Prüfe ob schon ein Loading-Overlay existiert
    let overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.querySelector('h3').textContent = title;
        overlay.querySelector('p').textContent = description;
        return overlay;
    }

    overlay = document.createElement('dialog');
    overlay.id = 'loading-overlay';
    overlay.className = 'dialog w-full sm:max-w-[400px]';
    overlay.innerHTML = `
        <div class="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg p-6 text-center text-balance md:p-12 text-neutral-800 dark:text-neutral-300">
            <header class="flex max-w-sm flex-col items-center gap-3 text-center">
                <div class="mb-2 bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-6">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="status" aria-label="Loading" class="animate-spin size-4"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                </div>
                <h3 class="text-lg font-semibold tracking-tight">${title}</h3>
                <p class="text-muted-foreground text-sm/relaxed">${description}</p>
            </header>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.showModal();
    return overlay;
};

/**
 * LOADING OVERLAY AUSBLENDEN
 */
const hideLoadingOverlay = () => {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.close();
        overlay.remove();
    }
};

/**
 * SKELETON LOADING CARD
 *
 * Erstellt eine Skeleton-Loading-Karte für Content-Bereiche.
 *
 * @param {number} rows - Anzahl der Skeleton-Zeilen
 * @returns {string} HTML-String für die Skeleton-Karte
 */
const createSkeletonCard = (rows = 3) => {
    let skeletonRows = '';
    for (let i = 0; i < rows; i++) {
        const width = [100, 80, 60][i % 3]; // Variierende Breiten
        skeletonRows += `<div class="h-4 bg-muted rounded animate-pulse" style="width: ${width}%;"></div>`;
    }
    return `
        <div class="card p-6">
            <div class="space-y-4">
                <div class="h-6 bg-muted rounded animate-pulse w-1/3"></div>
                <div class="space-y-3">
                    ${skeletonRows}
                </div>
            </div>
        </div>
    `;
};

/**
 * SKELETON TABLE
 *
 * Erstellt eine Skeleton-Loading-Tabelle.
 *
 * @param {number} rows - Anzahl der Skeleton-Zeilen
 * @param {number} cols - Anzahl der Spalten
 * @returns {string} HTML-String für die Skeleton-Tabelle
 */
const createSkeletonTable = (rows = 5, cols = 4) => {
    let headerCells = '';
    for (let i = 0; i < cols; i++) {
        headerCells += `<th class="p-3"><div class="h-4 bg-muted rounded animate-pulse"></div></th>`;
    }

    let bodyRows = '';
    for (let i = 0; i < rows; i++) {
        let cells = '';
        for (let j = 0; j < cols; j++) {
            const width = 50 + Math.random() * 40; // Zufällige Breiten für natürlicheren Look
            cells += `<td class="p-3"><div class="h-4 bg-muted rounded animate-pulse" style="width: ${width}%;"></div></td>`;
        }
        bodyRows += `<tr>${cells}</tr>`;
    }

    return `
        <div class="overflow-x-auto">
            <table class="w-full">
                <thead>
                    <tr>${headerCells}</tr>
                </thead>
                <tbody>
                    ${bodyRows}
                </tbody>
            </table>
        </div>
    `;
};

// Toast debounce tracking - prevents duplicate toasts
const recentToasts = new Map();
const TOAST_DEBOUNCE_MS = 2000;

/**
 * TOAST-BENACHRICHTIGUNG ANZEIGEN
 *
 * Toasts sind kleine Benachrichtigungen die kurz eingeblendet werden
 * und dann automatisch verschwinden (wie ein Toaster der Toast auswirft).
 *
 * Verwendet das Basecoat CSS Framework für das Styling.
 * Das Framework lauscht auf das Custom Event 'basecoat:toast'.
 *
 * @param {string} message - Die anzuzeigende Nachricht
 * @param {string} type - Typ: "success" (grün), "error" (rot), "info" (blau)
 */
const showToast = (message, type = "info") => {
    // Debounce: Verhindere doppelte Toasts mit gleicher Nachricht
    const toastKey = `${type}:${message}`;
    if (recentToasts.has(toastKey)) {
        return; // Toast wurde kürzlich angezeigt, ignorieren
    }

    // Toast als kürzlich angezeigt markieren
    recentToasts.set(toastKey, true);
    setTimeout(() => recentToasts.delete(toastKey), TOAST_DEBOUNCE_MS);

    // Personalisierte Nachricht mit Lehrernamen
    const teacherName = appData?.teacherName || "there";
    const personalizedMessage = message.includes(teacherName) ? message : `${teacherName}, ${message}`;

    // Custom Event auslösen das vom Basecoat Framework abgefangen wird
    // CustomEvent erlaubt das Senden von eigenen Events mit Daten
    document.dispatchEvent(new CustomEvent('basecoat:toast', {
        detail: {
            config: {
                category: type,                                    // success/error/info
                title: type.charAt(0).toUpperCase() + type.slice(1), // "Success", "Error", etc.
                description: personalizedMessage,                  // Die eigentliche Nachricht
                cancel: {
                    label: 'Dismiss'                              // Text für Schließen-Button
                }
            }
        }
    }));
};

/**
 * RATE LIMIT DIALOG ANZEIGEN
 *
 * Zeigt einen auffälligen Dialog bei Rate-Limit-Fehlern.
 * Wichtiger als ein Toast, da der Benutzer aktiv bestätigen muss.
 *
 * @param {string} message - Die Fehlermeldung
 */
const showRateLimitDialog = (message = "You've made too many requests. Please wait a moment before trying again.") => {
    // Prüfe ob schon ein Rate-Limit-Dialog existiert
    let dialog = document.getElementById('rate-limit-dialog');

    if (!dialog) {
        // Dialog erstellen falls nicht vorhanden
        dialog = document.createElement('dialog');
        dialog.id = 'rate-limit-dialog';
        dialog.className = 'dialog w-full sm:max-w-[425px]';
        dialog.innerHTML = `
            <div>
                <header>
                    <div class="flex items-center gap-3">
                        <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500/15">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-500">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                        </div>
                        <div>
                            <h2 class="text-lg font-semibold">Too Many Requests</h2>
                        </div>
                    </div>
                </header>
                <section class="py-4">
                    <p id="rate-limit-message" class="text-muted-foreground"></p>
                </section>
                <footer class="flex justify-end">
                    <button type="button" class="btn-primary" id="rate-limit-close">Understood</button>
                </footer>
            </div>
        `;
        document.body.appendChild(dialog);

        // Close button handler
        dialog.querySelector('#rate-limit-close').addEventListener('click', () => {
            dialog.close();
        });
    }

    // Nachricht setzen und Dialog öffnen
    dialog.querySelector('#rate-limit-message').textContent = message;
    dialog.showModal();
};

/**
 * SESSION EXPIRED DIALOG ANZEIGEN
 *
 * Zeigt einen Dialog wenn die Session abgelaufen ist und der Benutzer
 * sich neu einloggen muss, um Daten sicher zu speichern.
 *
 * @param {string} message - Die Fehlermeldung
 */
const showSessionExpiredDialog = (message = "Your session has expired. Please log in again to save your data securely.") => {
    // Prüfe ob schon ein Session-Expired-Dialog existiert
    let dialog = document.getElementById('session-expired-dialog');

    if (!dialog) {
        // Dialog erstellen falls nicht vorhanden
        dialog = document.createElement('dialog');
        dialog.id = 'session-expired-dialog';
        dialog.className = 'dialog w-full sm:max-w-[425px]';
        dialog.innerHTML = `
            <div>
                <header>
                    <div class="flex items-center gap-3">
                        <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-yellow-500/15">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-yellow-500">
                                <path d="M12 9v4"/>
                                <path d="M12 17h.01"/>
                                <path d="M2.39 17.43A9.96 9.96 0 0 1 2 14C2 8.48 6.48 4 12 4c3.34 0 6.3 1.64 8.11 4.16"/>
                                <path d="M22 14c0 2.76-1.12 5.26-2.93 7.07"/>
                                <path d="m15 15 5 5"/>
                                <path d="m20 15-5 5"/>
                            </svg>
                        </div>
                        <div>
                            <h2 class="text-lg font-semibold">Session Expired</h2>
                        </div>
                    </div>
                </header>
                <section class="py-4">
                    <p id="session-expired-message" class="text-muted-foreground"></p>
                    <p class="text-sm mt-3" style="color: oklch(.708 0 0);">Your data has been saved locally and will be synced when you log in again.</p>
                </section>
                <footer class="flex justify-end">
                    <button type="button" class="btn-primary" id="session-expired-login">Log In</button>
                </footer>
            </div>
        `;
        document.body.appendChild(dialog);

        // Prevent closing with Escape key
        dialog.addEventListener('cancel', (e) => {
            e.preventDefault();
        });

        // Prevent closing by clicking backdrop
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                e.stopPropagation();
            }
        });

        // Login button handler - only way to proceed
        dialog.querySelector('#session-expired-login').addEventListener('click', async () => {
            // Clear all local data for security
            localStorage.removeItem('notenverwaltung');
            localStorage.removeItem('pendingServerSync');
            sessionStorage.clear();

            // Logout from server to clear session cookie
            try {
                await fetch('/api/logout', { method: 'POST' });
            } catch (e) {
                // Ignore errors, redirect anyway
            }

            window.location.href = '/login';
        });
    }

    // Nachricht setzen und Dialog öffnen
    dialog.querySelector('#session-expired-message').textContent = message;
    dialog.showModal();
};

/**
 * DIALOG ANZEIGEN (Wiederverwendbar)
 *
 * Öffnet ein modales Dialog-Fenster mit benutzerdefiniertem Inhalt.
 * "Modal" bedeutet: Der Benutzer muss den Dialog schließen bevor
 * er mit dem Rest der Seite interagieren kann.
 *
 * Diese Funktion ist generisch und kann für verschiedene Dialoge
 * verwendet werden (Bearbeiten, Hinzufügen, etc.).
 *
 * @param {string} dialogId - ID des Dialog-Elements im HTML
 * @param {string} title - Überschrift des Dialogs
 * @param {string} content - HTML-Inhalt für das Formular
 * @param {function} onConfirm - Callback-Funktion bei Formular-Submit
 */
const showDialog = (dialogId, title, content, onConfirm = null) => {
    // Dialog-Element aus dem DOM holen
    const dialog = document.getElementById(dialogId);

    // Titel setzen (h2-Element im Dialog)
    dialog.querySelector("h2").textContent = title;

    // Inhalt in das Formular einfügen
    // HINWEIS: content sollte bereits escaped sein wenn Benutzerdaten enthalten
    dialog.querySelector("form").innerHTML = content;

    // Dialog öffnen (native HTML5 Dialog-API)
    // showModal() macht den Dialog modal (blockiert Hintergrund)
    dialog.showModal();

    // Wenn eine Callback-Funktion übergeben wurde
    if (onConfirm) {
        // Event-Handler für Formular-Submit setzen
        dialog.querySelector("form").onsubmit = (e) => {
            // Standard-Verhalten verhindern (Seite würde neu laden)
            e.preventDefault();

            // FormData-Objekt erstellt aus dem Formular
            // Enthält alle Eingabefelder als Key-Value-Paare
            onConfirm(new FormData(e.target));

            // Dialog schließen
            dialog.close();
        };
    }
};

/**
 * BESTÄTIGUNGS-DIALOG ANZEIGEN
 *
 * Zeigt einen Dialog mit "Bist du sicher?"-Frage.
 * Wird verwendet vor destruktiven Aktionen (Löschen, etc.).
 *
 * Der Dialog hat zwei Buttons:
 * - "Cancel": Schließt den Dialog ohne Aktion
 * - "Delete": Führt die übergebene Funktion aus
 *
 * @param {string} message - Die Bestätigungsfrage
 * @param {function} onConfirm - Funktion die bei Bestätigung ausgeführt wird
 */
const showConfirmDialog = (message, onConfirm) => {
    const dialog = document.getElementById("confirm-dialog");

    // Personalisierte Nachricht mit Lehrernamen
    const teacherName = appData.teacherName || "there";
    const personalizedMessage = message.includes(teacherName) ? message : `${teacherName}, ${message}`;

    // Nachricht in den Dialog einfügen
    // textContent ist sicher gegen XSS (interpretiert kein HTML)
    dialog.querySelector("#confirm-message").textContent = personalizedMessage;

    // Dialog öffnen
    dialog.showModal();

    // "Delete"-Button: Führt Aktion aus und schließt Dialog
    document.getElementById("confirm-action").onclick = () => {
        onConfirm();      // Übergebene Funktion ausführen
        dialog.close();   // Dialog schließen
    };

    // "Cancel"-Button: Nur Dialog schließen
    document.getElementById("cancel-action").onclick = () => {
        dialog.close();
    };
};

/**
 * ALERT-DIALOG ANZEIGEN
 *
 * Zeigt einen einfachen Hinweis-Dialog mit nur einem "OK"-Button.
 * Wird verwendet für Warnungen, Fehlermeldungen oder Hinweise.
 *
 * Im Gegensatz zum Bestätigungs-Dialog gibt es hier keine Entscheidung
 * zu treffen - der Benutzer nimmt die Information nur zur Kenntnis.
 *
 * @param {string} message - Die anzuzeigende Nachricht
 */
const showAlertDialog = (message) => {
    const dialog = document.getElementById("alert-dialog");

    // Personalisierte Nachricht
    const teacherName = appData.teacherName || "there";
    const personalizedMessage = message.includes(teacherName) ? message : `${teacherName}, ${message}`;

    // Nachricht setzen (textContent ist XSS-sicher)
    dialog.querySelector("#alert-message").textContent = personalizedMessage;

    // Dialog öffnen
    dialog.showModal();

    // "OK"-Button schließt den Dialog
    document.getElementById("close-alert").onclick = () => {
        dialog.close();
    };
};

/**
 * ANIMATIONEN INITIALISIEREN
 *
 * Fügt Event-Listener hinzu, um Animationen bei Tab-Wechseln
 * und View-Übergängen zu triggern.
 */
const initAnimations = () => {
    // Tab-Wechsel Animation
    // Beobachte alle Tab-Panels und trigger Animation bei Anzeige
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'hidden') {
                const panel = mutation.target;
                // Wenn Panel sichtbar wird (hidden entfernt)
                if (!panel.hidden && panel.getAttribute('role') === 'tabpanel') {
                    // Animation neu triggern
                    panel.style.animation = 'none';
                    panel.offsetHeight; // Force reflow
                    panel.style.animation = '';
                }
            }
        });
    });

    // Beobachte alle Tab-Panels
    document.querySelectorAll('[role="tabpanel"]').forEach(panel => {
        observer.observe(panel, { attributes: true });
    });

    // Auch für dynamisch erstellte Panels (z.B. in Dialogen)
    const bodyObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) { // Element node
                    const panels = node.querySelectorAll ? node.querySelectorAll('[role="tabpanel"]') : [];
                    panels.forEach(panel => {
                        observer.observe(panel, { attributes: true });
                    });
                    // Auch wenn das hinzugefügte Element selbst ein Panel ist
                    if (node.getAttribute && node.getAttribute('role') === 'tabpanel') {
                        observer.observe(node, { attributes: true });
                    }
                }
            });
        });
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });
};

// Initialisiere Animationen wenn DOM geladen
document.addEventListener('DOMContentLoaded', initAnimations);
