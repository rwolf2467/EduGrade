// data.js
// ========== DATENSTRUKTUR ==========
// Diese Datei definiert die zentrale Datenstruktur der Anwendung.
// Alle Daten werden in diesem einen Objekt gespeichert.

/**
 * APPDATA - Das zentrale Datenobjekt
 *
 * Struktur:
 * appData
 * ├── teacherName: String - Name des Lehrers
 * ├── currentClassId: String - ID der aktuell ausgewählten Klasse
 * ├── classes: Array - Liste aller Klassen
 * │   └── [Klasse]
 * │       ├── id: String - Eindeutige ID
 * │       ├── name: String - Name der Klasse (z.B. "1A")
 * │       ├── subjects: Array - Unterrichtsfächer dieser Klasse
 * │       │   └── [Fach]
 * │       │       ├── id: String - Eindeutige ID
 * │       │       └── name: String - Name des Fachs (z.B. "Mathematik")
 * │       ├── currentSubjectId: null|String - Aktives Fach-Tab (null = Alle Fächer)
 * │       └── students: Array - Schüler dieser Klasse
 * │           └── [Schüler]
 * │               ├── id: String
 * │               ├── firstName: String - Vorname
 * │               ├── lastName: String - Nachname
 * │               ├── middleName: String - Zweitname (optional)
 * │               ├── grades: Array - Noten des Schülers
 * │               │   └── [Note]
 * │               │       ├── id: String
 * │               │       ├── categoryId: String - Zugehörige Kategorie
 * │               │       ├── categoryName: String
 * │               │       ├── value: Number|String - Notenwert (1-6 oder "+"/"-")
 * │               │       ├── weight: Number - Gewichtung (0.1-1.0)
 * │               │       ├── isPlusMinus: Boolean
 * │               │       ├── name: String - Optionaler Name (z.B. "SA1")
 * │               │       └── subjectId: String|undefined - Zugehöriges Fach (undefined = kein Fach)
 * │               └── participation: Array - Für zukünftige Erweiterung
 * ├── categories: Array - GLOBALE Notenkategorien (gelten für ALLE Klassen)
 * │   └── [Kategorie]
 * │       ├── id: String
 * │       ├── name: String (z.B. "Schularbeit")
 * │       ├── weight: Number (z.B. 0.5 für 50%)
 * │       ├── allowPlusMinus: Boolean
 * │       └── onlyPlusMinus: Boolean
 * ├── students: Array - Globale Schüler (Legacy, nicht verwendet)
 * └── participationSettings: Object - Einstellungen für Mitarbeit
 *     ├── plusValue: Number
 *     └── minusValue: Number
 *
 * WICHTIG: Dieses Objekt wird bei saveData() in LocalStorage gespeichert
 * und bei loadData() wieder geladen.
 */
let appData = {
    teacherName: "",              // Name des Lehrers (für personalisierte Nachrichten)
    currentClassId: null,         // ID der aktuell angezeigten Klasse
    classes: [],                  // Hauptarray mit allen Klassen und deren Daten
    categories: [],               // GLOBALE Kategorien (gelten für alle Klassen)
    students: [],                 // Legacy-Array (wird nicht aktiv verwendet)
    participationSettings: {      // Einstellungen für Mitarbeits-Funktion
        plusValue: 0.1,           // Wert pro Plus bei Mitarbeit
        minusValue: 0.1           // Wert pro Minus bei Mitarbeit
    },
    tutorial: {                   // Tutorial-Status
        completed: false,         // Tutorial abgeschlossen oder übersprungen
        currentStep: 0,           // Aktueller Schritt (für Resume)
        neverShowAgain: false     // "Nicht mehr anzeigen" Option
    },
    gradePercentageRanges: [      // Prozentbereiche für Noten (österreichisches System)
        { grade: 1, minPercent: 85, maxPercent: 100 },  // Sehr Gut
        { grade: 2, minPercent: 70, maxPercent: 84 },   // Gut
        { grade: 3, minPercent: 55, maxPercent: 69 },   // Befriedigend
        { grade: 4, minPercent: 40, maxPercent: 54 },   // Genügend
        { grade: 5, minPercent: 0, maxPercent: 39 }     // Nicht Genügend
    ]
};
