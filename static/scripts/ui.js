// ui.js
// ========== UI-HILFSFUNKTIONEN ==========
// Diese Datei enthält Funktionen für Benutzer-Benachrichtigungen und Dialoge.
// "UI" steht für "User Interface" (Benutzeroberfläche).

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
    // Toast nach 3 Sekunden automatisch entfernen
    // setTimeout() führt Code nach einer Verzögerung aus
    setTimeout(() => toast.remove(), 3000);

    // Personalisierte Nachricht mit Lehrernamen
    const teacherName = appData.teacherName || "there";
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
    }))
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
