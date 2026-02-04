// dataManagement.js
// ========== DATENVERWALTUNG ==========
// Diese Datei enthält alle CRUD-Operationen (Create, Read, Update, Delete)
// für Klassen, Schüler, Kategorien und Noten.

/**
 * KLASSE HINZUFÜGEN
 *
 * Erstellt eine neue Klasse und fügt sie zum appData-Array hinzu.
 * Die neue Klasse wird automatisch als aktuelle Klasse ausgewählt.
 *
 * Ablauf:
 * 1. Name validieren (max. 50 Zeichen, keine gefährlichen Zeichen)
 * 2. Neues Klassen-Objekt mit eindeutiger ID erstellen
 * 3. Zu appData hinzufügen und als aktuelle Klasse setzen
 * 4. Daten speichern und UI aktualisieren
 *
 * @param {string} name - Der Name der neuen Klasse (z.B. "1A", "2B")
 */
const addClass = (name) => {
    // SICHERHEIT: Eingabe validieren bevor sie verwendet wird
    const validation = validateStringInput(name, 50);
    if (!validation.isValid) {
        showAlertDialog(validation.error);
        return; // Abbruch wenn ungültig
    }

    // Neues Klassen-Objekt erstellen
    // Verwende eine wirklich eindeutige ID (Timestamp + Zufallszahl)
    const newClass = {
        id: Date.now().toString() + '-' + Math.floor(Math.random() * 1000),
        name: validation.value,          // Validierter/bereinigter Name
        students: []                     // Leeres Array für Schüler
        // Kategorien werden global in appData.categories gespeichert
    };

    // Klasse zum globalen Daten-Array hinzufügen
    appData.classes.push(newClass);

    // Diese Klasse als aktive Klasse setzen
    appData.currentClassId = newClass.id;

    // Daten in LocalStorage speichern und Erfolgsmeldung zeigen
    saveData("Class successfully added!");

    // UI aktualisieren: Klassenliste, Home-View und Schülertabelle neu rendern
    renderClassList();
    renderHome();
    renderStudents();
};

/**
 * SCHÜLER HINZUFÜGEN
 *
 * Fügt einen neuen Schüler zur aktuell ausgewählten Klasse hinzu.
 *
 * @param {string} name - Der Name des Schülers
 */
const addStudent = (name) => {
    // SICHERHEIT: Eingabe validieren (max. 100 Zeichen für längere Namen)
    const validation = validateStringInput(name, 100);
    if (!validation.isValid) {
        showAlertDialog(validation.error);
        return;
    }

    // Neues Schüler-Objekt erstellen
    const newStudent = {
        id: Date.now().toString() + '-' + Math.floor(Math.random() * 1000),
        name: validation.value,
        grades: [],              // Leeres Array für Noten
        participation: []        // Für zukünftige Mitarbeits-Funktion
    };

    // Aktuelle Klasse im Array finden
    // find() durchsucht das Array und gibt das erste passende Element zurück
    const currentClass = appData.classes.find(c => c.id === appData.currentClassId);

    if (currentClass) {
        // Schüler zur Klasse hinzufügen
        currentClass.students.push(newStudent);
        saveData("Student successfully added!");
        renderStudents();
    } else {
        console.error("No current class found!");
    }
};

/**
 * KATEGORIE HINZUFÜGEN
 *
 * Kategorien sind Notentypen wie "Schularbeit", "Test", "Mitarbeit".
 * Jede Kategorie hat eine Gewichtung (z.B. Schularbeit 50%, Mitarbeit 20%).
 * Kategorien gelten GLOBAL für alle Klassen.
 *
 * @param {string} name - Kategoriename (z.B. "Schularbeit")
 * @param {number} weight - Gewichtung als Dezimalzahl (0.5 = 50%)
 * @param {boolean} allowPlusMinus - Erlaubt +/- zusätzlich zu Noten
 * @param {boolean} onlyPlusMinus - NUR +/- erlaubt (keine Zahlennoten)
 */
const addCategory = (name, weight, allowPlusMinus = false, onlyPlusMinus = false) => {
    // Name validieren
    const nameValidation = validateStringInput(name, 100);
    if (!nameValidation.isValid) {
        showAlertDialog(nameValidation.error);
        return;
    }

    // Gewichtung validieren (muss zwischen 0.1 und 1.0 liegen)
    const weightValidation = validateWeight(weight);
    if (!weightValidation.isValid) {
        showAlertDialog(weightValidation.error);
        return;
    }

    // Neues Kategorie-Objekt erstellen
    const newCategory = {
        id: Date.now().toString(),
        name: nameValidation.value,
        weight: weightValidation.value,
        // Wenn onlyPlusMinus true ist, muss allowPlusMinus auch true sein
        allowPlusMinus: allowPlusMinus || onlyPlusMinus,
        onlyPlusMinus: onlyPlusMinus
    };

    // Kategorie global hinzufügen (gilt für alle Klassen)
    appData.categories.push(newCategory);
    saveData("Category successfully added!");
    renderCategoryFilter(); // Dropdown im Filter aktualisieren
};

/**
 * NOTE HINZUFÜGEN
 *
 * Fügt eine Note zu einem Schüler in einer bestimmten Kategorie hinzu.
 * Unterstützt sowohl numerische Noten (1-6) als auch +/- Noten.
 *
 * @param {string} studentId - ID des Schülers
 * @param {string} categoryId - ID der Kategorie
 * @param {string|number} value - Notenwert ("+" / "-" oder Zahl 1-6)
 * @param {string} gradeName - Optionaler Name (z.B. "SA1", "Test 2")
 */
const addGrade = (studentId, categoryId, value, gradeName = "") => {
    const currentClass = appData.classes.find(c => c.id === appData.currentClassId);
    if (!currentClass) {
        console.error("No current class found!");
        return;
    }

    // Schüler und Kategorie finden (Kategorien sind global)
    const student = currentClass.students.find(s => s.id === studentId);
    const category = appData.categories.find(c => c.id === categoryId);

    if (student && category) {
        // Optionalen Notennamen validieren (wenn angegeben)
        let validatedGradeName = "";
        if (gradeName && gradeName.trim() !== "") {
            const nameValidation = validateStringInput(gradeName, 50);
            if (!nameValidation.isValid) {
                showAlertDialog(nameValidation.error);
                return;
            }
            validatedGradeName = nameValidation.value;
        }

        // NOTENWERT VALIDIEREN
        // Prüfen ob es eine +/- Note ist
        const isPlusMinus = value === "+" || value === "-";
        const gradeValidation = validateGradeValue(value, isPlusMinus);
        if (!gradeValidation.isValid) {
            showAlertDialog(gradeValidation.error);
            return;
        }

        // Neues Noten-Objekt erstellen
        const newGrade = {
            id: Date.now().toString(),
            categoryId: categoryId,
            categoryName: category.name,    // Name der Kategorie speichern (für Anzeige)
            weight: category.weight,        // Gewichtung von Kategorie übernehmen
            name: validatedGradeName,
            createdAt: Date.now()           // Zeitstempel für zeitlichen Graph
        };

        // Je nach Notentyp den Wert setzen
        if (isPlusMinus) {
            newGrade.value = gradeValidation.value;  // "+" oder "-"
            newGrade.isPlusMinus = true;
        } else {
            newGrade.value = gradeValidation.value;  // Zahl 1-6
            newGrade.isPlusMinus = false;
        }

        // Note zum Schüler hinzufügen
        student.grades.push(newGrade);

        // Return the new grade for further processing (e.g., storing percentage)
        // Note: saveData() and renderStudents() are called by the caller
        return newGrade;
    } else {
        console.error("Student or category not found!");
        return null;
    }
};

/**
 * ELEMENT LÖSCHEN (Generische Funktion)
 *
 * Löscht Schüler, Kategorien oder Noten basierend auf dem Typ.
 * Bei Kategorien werden auch alle zugehörigen Noten gelöscht.
 *
 * @param {string} type - "student", "category" oder "grade"
 * @param {string} id - Die ID des zu löschenden Elements
 */
const deleteItem = (type, id) => {
    const currentClass = appData.classes.find(c => c.id === appData.currentClassId);
    if (!currentClass) {
        console.error("No current class found!");
        return;
    }

    if (type === "student") {
        // Schüler aus dem Array entfernen
        // filter() erstellt ein neues Array ohne das Element mit der ID
        currentClass.students = currentClass.students.filter(s => s.id !== id);

    } else if (type === "category") {
        // Kategorie global löschen
        appData.categories = appData.categories.filter(c => c.id !== id);

        // WICHTIG: Auch alle Noten dieser Kategorie bei allen Schülern in ALLEN Klassen löschen
        // Sonst hätten Schüler "verwaiste" Noten ohne Kategorie
        appData.classes.forEach(cls => {
            cls.students.forEach(s => {
                s.grades = s.grades.filter(g => g.categoryId !== id);
            });
        });

    } else if (type === "grade") {
        // Einzelne Note löschen
        // Muss bei allen Schülern gesucht werden (wir wissen nicht welcher Schüler)
        currentClass.students.forEach(s => {
            s.grades = s.grades.filter(g => g.id !== id);
        });
    }

    saveData("Item successfully deleted!", "success");
    renderStudents();
    renderCategoryFilter();
};

/**
 * KLASSE BEARBEITEN (Umbenennen)
 *
 * Ändert den Namen einer bestehenden Klasse.
 *
 * @param {string} classId - ID der Klasse
 * @param {string} newName - Neuer Name
 */
const editClass = (classId, newName) => {
    // Neuen Namen validieren
    const validation = validateStringInput(newName, 50);
    if (!validation.isValid) {
        showAlertDialog(validation.error);
        return;
    }

    // Klasse finden und Namen ändern
    const cls = appData.classes.find(c => c.id === classId);
    if (cls) {
        cls.name = validation.value;
        saveData("Class successfully edited!", "success");
        renderClassList();
        renderStudents();

        // Wenn es die aktuelle Klasse ist, auch die Überschrift aktualisieren
        if (classId === appData.currentClassId) {
            document.getElementById("current-class-name").textContent = validation.value;
        }
    }
};

/**
 * KLASSE LÖSCHEN
 *
 * Entfernt eine Klasse komplett (inkl. aller Schüler und Noten).
 * Wenn die gelöschte Klasse die aktuelle war, wird zur ersten
 * verbleibenden Klasse gewechselt.
 *
 * @param {string} classId - ID der zu löschenden Klasse
 */
const deleteClass = (classId) => {
    // Klasse aus dem Array entfernen
    appData.classes = appData.classes.filter(c => c.id !== classId);

    // Wenn wir die aktuelle Klasse gelöscht haben:
    // Zur ersten verbleibenden Klasse wechseln (oder null wenn keine mehr da)
    if (appData.currentClassId === classId) {
        appData.currentClassId = appData.classes.length > 0 ? appData.classes[0].id : null;
    }

    saveData("Class successfully deleted!", "success");
    renderClassList();
    renderStudents();
    renderCategoryFilter();

    // UI aktualisieren: Klassenname in Überschrift
    if (appData.currentClassId) {
        const currentClass = appData.classes.find(c => c.id === appData.currentClassId);
        if (currentClass) {
            document.getElementById("current-class-name").textContent = currentClass.name;
        }
    }
};

/**
 * PLUS/MINUS-EINSTELLUNGEN AKTUALISIEREN
 *
 * Für Kategorien die nur +/- Noten verwenden (z.B. Mitarbeit),
 * wird aus den Plus- und Minus-Einträgen eine Note berechnet.
 *
 * Beispiel mit Standardwerten (startGrade=3, plusValue=0.5, minusValue=0.5):
 * - 0 Plus, 0 Minus = Note 3.0
 * - 2 Plus, 0 Minus = Note 2.0 (3 - 2*0.5)
 * - 0 Plus, 2 Minus = Note 4.0 (3 + 2*0.5)
 * - 3 Plus, 1 Minus = Note 2.0 (3 - 3*0.5 + 1*0.5)
 *
 * @param {number} startGrade - Ausgangsnote (Standard: 3)
 * @param {number} plusValue - Wert pro Plus (verbessert Note)
 * @param {number} minusValue - Wert pro Minus (verschlechtert Note)
 */
const updatePlusMinusGradeSettings = (startGrade, plusValue, minusValue) => {
    // Alle Werte zu Zahlen konvertieren
    const start = parseFloat(startGrade);
    const plus = parseFloat(plusValue);
    const minus = parseFloat(minusValue);

    // VALIDIERUNG: Startnote muss zwischen 1 und 5 liegen
    if (isNaN(start) || start < 1 || start > 5) {
        showAlertDialog("Start grade must be between 1 and 5");
        return;
    }

    // VALIDIERUNG: Plus-Wert muss zwischen 0.1 und 2 liegen
    if (isNaN(plus) || plus < 0.1 || plus > 2) {
        showAlertDialog("Plus value must be between 0.1 and 2");
        return;
    }

    // VALIDIERUNG: Minus-Wert muss zwischen 0.1 und 2 liegen
    if (isNaN(minus) || minus < 0.1 || minus > 2) {
        showAlertDialog("Minus value must be between 0.1 and 2");
        return;
    }

    // Einstellungen speichern
    appData.plusMinusGradeSettings = {
        startGrade: start,
        plusValue: plus,
        minusValue: minus
    };

    saveData();
    // Schülertabelle neu rendern (Durchschnitte werden neu berechnet)
    renderStudents();
};

/**
 * PROZENTBEREICHE FÜR NOTEN AKTUALISIEREN
 *
 * Speichert die Prozentbereiche für jede Note (1-5).
 * Diese werden verwendet, um Prozentangaben in Noten umzuwandeln.
 *
 * @param {Array} ranges - Array mit {grade, minPercent, maxPercent} Objekten
 */
const updateGradePercentageRanges = (ranges) => {
    // Validierung: Alle Bereiche prüfen
    for (const range of ranges) {
        const min = parseFloat(range.minPercent);
        const max = parseFloat(range.maxPercent);

        if (isNaN(min) || isNaN(max)) {
            showAlertDialog("All percentage values must be valid numbers");
            return false;
        }

        if (min < 0 || min > 100 || max < 0 || max > 100) {
            showAlertDialog("Percentage values must be between 0 and 100");
            return false;
        }

        if (min > max) {
            showAlertDialog(`Grade ${range.grade}: Minimum cannot be greater than maximum`);
            return false;
        }
    }

    // Einstellungen speichern
    appData.gradePercentageRanges = ranges;
    saveData("Grade percentage ranges saved!", "success");
    return true;
};

/**
 * PROZENT ZU NOTE KONVERTIEREN
 *
 * Wandelt einen Prozentwert in eine Note um, basierend auf den
 * konfigurierten Prozentbereichen.
 *
 * @param {number} percent - Prozentwert (0-100)
 * @returns {number} - Note (1-5) oder null wenn ungültig
 */
const percentToGrade = (percent) => {
    const p = parseFloat(percent);
    if (isNaN(p) || p < 0 || p > 100) {
        return null;
    }

    // Standardbereiche falls keine konfiguriert
    const ranges = appData.gradePercentageRanges || [
        { grade: 1, minPercent: 85, maxPercent: 100 },
        { grade: 2, minPercent: 70, maxPercent: 84 },
        { grade: 3, minPercent: 55, maxPercent: 69 },
        { grade: 4, minPercent: 40, maxPercent: 54 },
        { grade: 5, minPercent: 0, maxPercent: 39 }
    ];

    // Passenden Bereich finden
    for (const range of ranges) {
        if (p >= range.minPercent && p <= range.maxPercent) {
            return range.grade;
        }
    }

    // Falls kein Bereich passt, Note 5 zurückgeben
    return 5;
};
