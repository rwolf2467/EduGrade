// security.js
// ========== SICHERHEITS-FUNKTIONEN ==========
// Diese Datei enthält alle Funktionen zum Schutz vor XSS-Angriffen (Cross-Site Scripting)
// und zur Validierung von Benutzereingaben.

/**
 * ESCAPE HTML - Kernfunktion für XSS-Schutz
 *
 * Diese Funktion wandelt gefährliche HTML-Sonderzeichen in ihre harmlosen
 * HTML-Entity-Entsprechungen um. Dadurch wird verhindert, dass eingeschleuster
 * Code als HTML/JavaScript interpretiert wird.
 *
 * Beispiel:
 *   Eingabe:  <script>alert('XSS')</script>
 *   Ausgabe:  &lt;script&gt;alert(&#039;XSS&#039;)&lt;/script&gt;
 *
 * Die Ausgabe wird im Browser als Text angezeigt, nicht als Code ausgeführt.
 *
 * @param {string} text - Der zu escapende Text
 * @returns {string} - Sicherer Text für HTML-Einfügung
 */
const escapeHtml = (text) => {
    // Null/undefined werden zu leerem String
    if (text === null || text === undefined) {
        return '';
    }

    // Alles zu String konvertieren (auch Zahlen, Booleans, etc.)
    const str = String(text);

    // Mapping der gefährlichen Zeichen zu ihren HTML-Entities
    // Diese Zeichen könnten sonst für HTML-Injection missbraucht werden
    const map = {
        '&': '&amp;',   // & muss zuerst ersetzt werden (sonst werden andere Entities kaputt)
        '<': '&lt;',    // Öffnendes HTML-Tag
        '>': '&gt;',    // Schließendes HTML-Tag
        '"': '&quot;',  // Doppelte Anführungszeichen (für Attribute)
        "'": '&#039;',  // Einfache Anführungszeichen (für Attribute)
        '/': '&#x2F;',  // Schrägstrich (verhindert </script> etc.)
        '`': '&#x60;',  // Backtick (Template Literals in JS)
        '=': '&#x3D;'   // Gleichheitszeichen (für Attribute)
    };

    // Regex ersetzt alle gefährlichen Zeichen auf einmal
    // Die Callback-Funktion holt das Ersatz-Zeichen aus dem Map
    return str.replace(/[&<>"'`=/]/g, char => map[char]);
};

/**
 * VALIDIERUNG VON TEXT-EINGABEN
 *
 * Prüft Benutzereingaben auf:
 * 1. Vorhandensein (nicht null/undefined/leer)
 * 2. Maximale Länge (verhindert Buffer Overflow / DoS)
 * 3. Gefährliche Muster (Script-Tags, Event-Handler, etc.)
 *
 * Gibt ein Objekt zurück mit:
 * - isValid: true/false
 * - value: der bereinigte Wert (getrimmt)
 * - error: Fehlermeldung wenn ungültig
 *
 * @param {string} input - Die zu validierende Eingabe
 * @param {number} maxLength - Maximale erlaubte Länge (Standard: 200)
 * @returns {object} - Validierungsergebnis
 */
const validateStringInput = (input, maxLength = 200) => {
    // Prüfung auf null/undefined
    if (input === null || input === undefined) {
        return { isValid: false, value: '', error: t("validation.inputRequired") };
    }

    // Zu String konvertieren und Whitespace an Anfang/Ende entfernen
    const trimmed = String(input).trim();

    // Leere Eingaben sind ungültig
    if (trimmed.length === 0) {
        return { isValid: false, value: '', error: t("validation.inputEmpty") };
    }

    // Längenbegrenzung prüfen (verhindert zu große Daten)
    if (trimmed.length > maxLength) {
        return { isValid: false, value: '', error: t("validation.inputTooLong", { max: maxLength }) };
    }

    // GEFÄHRLICHE MUSTER ERKENNEN
    // Diese Regex-Patterns erkennen typische XSS-Angriffsvektoren
    const dangerousPatterns = [
        /<script\b/i,      // <script> Tags - häufigstes XSS
        /javascript:/i,    // javascript: URLs (z.B. in href)
        /on\w+\s*=/i,      // Event-Handler wie onclick=, onerror=, onload=
        /data:/i,          // data: URLs (können JS enthalten)
        /vbscript:/i       // VBScript (älterer IE)
    ];

    // Jeden Pattern testen
    for (const pattern of dangerousPatterns) {
        if (pattern.test(trimmed)) {
            return { isValid: false, value: '', error: t("validation.dangerousContent") };
        }
    }

    // Alles OK - Eingabe ist sicher
    return { isValid: true, value: trimmed, error: null };
};

/**
 * VALIDIERUNG VON NOTENWERTEN
 *
 * Prüft ob ein Notenwert gültig ist. Unterstützt zwei Typen:
 * 1. Plus/Minus-Noten: Nur "+" oder "-" erlaubt
 * 2. Numerische Noten: Zahlen von 1 bis 6 (österreichisches System)
 *
 * @param {string|number} value - Der zu prüfende Notenwert
 * @param {boolean} isPlusMinus - Ob es eine +/- Note ist
 * @returns {object} - Validierungsergebnis
 */
const validateGradeValue = (value, isPlusMinus = false) => {
    // Plus/Minus-Noten: Nur exakt "+" oder "-" erlaubt
    if (isPlusMinus) {
        if (value === '+' || value === '-') {
            return { isValid: true, value: value, error: null };
        }
        return { isValid: false, value: null, error: t("validation.plusMinusInvalid") };
    }

    // Numerische Noten: Zu Zahl konvertieren
    const num = parseFloat(value);

    // Prüfen ob es überhaupt eine Zahl ist
    if (isNaN(num)) {
        return { isValid: false, value: null, error: t("validation.gradeMustBeNumber") };
    }

    // Wertebereich prüfen (1-6 für österreichisches System, 6 = Nicht Genügend)
    if (num < 1 || num > 6) {
        return { isValid: false, value: null, error: t("validation.gradeRange") };
    }

    return { isValid: true, value: num, error: null };
};

/**
 * VALIDIERUNG VON GEWICHTUNGSWERTEN
 *
 * Kategorien haben eine Gewichtung von 0.1 (10%) bis 1.0 (100%).
 * Diese Funktion stellt sicher, dass nur gültige Werte akzeptiert werden.
 *
 * @param {string|number} value - Der zu prüfende Gewichtungswert
 * @returns {object} - Validierungsergebnis
 */
const validateWeight = (value) => {
    const num = parseFloat(value);

    if (isNaN(num)) {
        return { isValid: false, value: null, error: t("validation.weightMustBeNumber") };
    }

    // Gewichtung muss zwischen 10% und 100% liegen
    if (num < 0.1 || num > 1) {
        return { isValid: false, value: null, error: t("validation.weightRange") };
    }

    return { isValid: true, value: num, error: null };
};

/**
 * SANITISIERUNG VON IMPORT-DATEN
 *
 * Wenn Benutzer eine JSON-Datei importieren, könnten darin
 * bösartige Daten versteckt sein. Diese Funktion:
 *
 * 1. Escaped alle String-Werte mit escapeHtml()
 * 2. Konvertiert IDs sicher zu Strings
 * 3. Validiert numerische Werte (Noten, Gewichtungen)
 * 4. Setzt sichere Standardwerte für fehlende Felder
 *
 * Das verhindert "Stored XSS" - bösartiger Code der in den
 * Daten gespeichert wird und später bei der Anzeige ausgeführt würde.
 *
 * @param {object} data - Das importierte Datenobjekt
 * @returns {object} - Sauber bereinigtes Datenobjekt
 */
const sanitizeImportData = (data) => {
    // Ungültige Daten ablehnen
    if (!data || typeof data !== 'object') {
        return null;
    }

    // Neues sauberes Objekt erstellen
    const sanitized = {
        teacherName: escapeHtml(data.teacherName || ''),
        currentClassId: data.currentClassId || null,
        classes: [],
        categories: [],
        students: [],
        plusMinusGradeSettings: data.plusMinusGradeSettings || { startGrade: 3, plusValue: 0.5, minusValue: 0.5 }
    };

    // KLASSEN SANITISIEREN
    // Jede Klasse enthält Schüler, die wiederum Noten haben (verschachtelte Struktur)
    // Kategorien werden jetzt global gespeichert, nicht mehr pro Klasse
    if (Array.isArray(data.classes)) {
        sanitized.classes = data.classes.map(cls => {
            const sanitizedClass = {
                id: String(cls.id || ''),                    // ID immer als String
                name: escapeHtml(cls.name || ''),            // Name escapen

                // Fächer-System (Subjects) sanitisieren
                subjects: Array.isArray(cls.subjects) ? cls.subjects.map(subject => ({
                    id: String(subject.id || ''),
                    name: escapeHtml(subject.name || '')
                })) : [],
                currentSubjectId: cls.currentSubjectId ? String(cls.currentSubjectId) : null,

                // Schüler der Klasse sanitisieren
                students: Array.isArray(cls.students) ? cls.students.map(student => ({
                    id: String(student.id || ''),
                    name: escapeHtml(student.name || ''),

                    // Noten des Schülers sanitisieren
                    grades: Array.isArray(student.grades) ? student.grades.map(grade => ({
                        id: String(grade.id || ''),
                        categoryId: String(grade.categoryId || ''),
                        categoryName: escapeHtml(grade.categoryName || ''),
                        // subjectId für Fächer-Zuordnung
                        subjectId: grade.subjectId ? String(grade.subjectId) : null,
                        // Notenwert: +/- nur wenn gültig, sonst als Zahl parsen
                        value: grade.isPlusMinus
                            ? (grade.value === '+' || grade.value === '-' ? grade.value : '+')
                            : parseFloat(grade.value) || 1,
                        weight: parseFloat(grade.weight) || 0.5,
                        isPlusMinus: Boolean(grade.isPlusMinus),
                        name: escapeHtml(grade.name || ''),
                        createdAt: parseInt(grade.createdAt, 10) || Date.now()
                    })) : []
                })) : []
            };

            // MIGRATION: Falls alte Daten mit Kategorien pro Klasse importiert werden,
            // diese zu den globalen Kategorien hinzufügen
            if (Array.isArray(cls.categories)) {
                cls.categories.forEach(cat => {
                    const sanitizedCat = {
                        id: String(cat.id || ''),
                        name: escapeHtml(cat.name || ''),
                        weight: parseFloat(cat.weight) || 0.5,
                        allowPlusMinus: Boolean(cat.allowPlusMinus),
                        onlyPlusMinus: Boolean(cat.onlyPlusMinus)
                    };
                    // Nur hinzufügen wenn ID noch nicht existiert
                    if (!sanitized.categories.some(c => c.id === sanitizedCat.id)) {
                        sanitized.categories.push(sanitizedCat);
                    }
                });
            }

            return sanitizedClass;
        });
    }

    // GLOBALE KATEGORIEN SANITISIEREN
    if (Array.isArray(data.categories)) {
        sanitized.categories = data.categories.map(cat => ({
            id: String(cat.id || ''),
            name: escapeHtml(cat.name || ''),
            weight: parseFloat(cat.weight) || 0.5,
            allowPlusMinus: Boolean(cat.allowPlusMinus),
            onlyPlusMinus: Boolean(cat.onlyPlusMinus)
        }));
    }

    // GLOBALE SCHÜLER SANITISIEREN
    if (Array.isArray(data.students)) {
        sanitized.students = data.students.map(student => ({
            id: String(student.id || ''),
            name: escapeHtml(student.name || ''),
            grades: Array.isArray(student.grades) ? student.grades.map(grade => ({
                id: String(grade.id || ''),
                categoryId: String(grade.categoryId || ''),
                categoryName: escapeHtml(grade.categoryName || ''),
                // subjectId für Fächer-Zuordnung
                subjectId: grade.subjectId ? String(grade.subjectId) : null,
                value: grade.isPlusMinus
                    ? (grade.value === '+' || grade.value === '-' ? grade.value : '+')
                    : parseFloat(grade.value) || 1,
                weight: parseFloat(grade.weight) || 0.5,
                isPlusMinus: Boolean(grade.isPlusMinus),
                name: escapeHtml(grade.name || ''),
                createdAt: parseInt(grade.createdAt, 10) || Date.now()
            })) : []
        }));
    }

    // PLUS/MINUS-EINSTELLUNGEN VALIDIEREN
    // Math.max/min begrenzt die Werte auf sichere Bereiche
    if (sanitized.plusMinusGradeSettings) {
        sanitized.plusMinusGradeSettings = {
            // Startnote: zwischen 1 und 5
            startGrade: Math.max(1, Math.min(5, parseFloat(sanitized.plusMinusGradeSettings.startGrade) || 3)),
            // Plus-Wert: zwischen 0.1 und 2
            plusValue: Math.max(0.1, Math.min(2, parseFloat(sanitized.plusMinusGradeSettings.plusValue) || 0.5)),
            // Minus-Wert: zwischen 0.1 und 2
            minusValue: Math.max(0.1, Math.min(2, parseFloat(sanitized.plusMinusGradeSettings.minusValue) || 0.5))
        };
    }

    return sanitized;
};

/**
 * SICHERE ATTRIBUT-WERTE
 *
 * Wrapper-Funktion für escapeHtml(), speziell für HTML-Attribute.
 * Stellt sicher, dass der Wert immer ein String ist.
 *
 * Verwendung: data-id="${safeAttr(someValue)}"
 *
 * @param {string} value - Der Wert für das Attribut
 * @returns {string} - Sicherer Attributwert
 */
const safeAttr = (value) => {
    return escapeHtml(String(value || ''));
};
