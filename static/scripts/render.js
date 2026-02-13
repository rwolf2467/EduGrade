//render.js
// ========== RENDER-FUNKTIONEN ==========
// Diese Datei enthält alle Funktionen die das UI (User Interface) aktualisieren.
// "Rendern" bedeutet: Daten aus appData nehmen und als HTML darstellen.

/**
 * Gibt den vollständigen Anzeigenamen eines Schülers zurück.
 * Format: "Vorname [Zweitname] Nachname"
 */
const getStudentDisplayName = (student) => {
    const parts = [student.firstName];
    if (student.middleName) parts.push(student.middleName);
    parts.push(student.lastName);
    return parts.filter(Boolean).join(' ');
};

/**
 * HELPER FUNCTIONS FOR CLASS AND YEAR SELECTION
 */


/**
 * Gets the currently selected class from appData.
 * @returns {Object|undefined} The current class object or undefined if not found
 */
const getCurrentClass = () => {
    return appData.classes.find(c => c.id === appData.currentClassId);
};

/**
 * Gets the currently selected year from the current class.
 * @returns {Object|null} The current year object or null if not found
 */
const getCurrentYear = () => {
    const currentClass = getCurrentClass();
    if (!currentClass || !currentClass.years) return null;
    return currentClass.years.find(y => y.id === currentClass.currentYearId);
};

/**
 * KLASSENLISTE RENDERN
 *
 * Zeigt alle Klassen als Buttons in der Sidebar an.
 * Jede Klasse hat Buttons zum Auswählen, Bearbeiten und Löschen.
 *
 * Technische Details:
 * - Verwendet Template Literals (Backticks `) für HTML-Strings
 * - map() wandelt jedes Klassen-Objekt in einen HTML-String um
 * - join("") verbindet alle Strings zu einem großen HTML-Block
 * - innerHTML setzt den HTML-Inhalt des Elements
 *
 * SICHERHEIT: Alle Benutzerdaten werden mit escapeHtml() escaped!
 */
const renderClassList = () => {
    const classList = document.getElementById("class-list");
    classList.innerHTML = appData.classes.map(cls =>
        `<div class="w-full">
            <div role="group" class="button-group w-full">
                <button class="btn-block ${cls.id === appData.currentClassId ? 'btn-primary' : 'btn-secondary'} flex-1"
                data-class-id="${safeAttr(cls.id)}">
                    ${escapeHtml(cls.name)}
                </button>
                <button class="btn-icon btn-secondary" data-edit-class="${safeAttr(cls.id)}" title="${t("class.editClass")}" data-tooltip="${t("class.editClass")}" data-side="left">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-pen-icon lucide-folder-pen"><path d="M2 11.5V5a2 2 0 0 1 2-2h3.9c.7 0 1.3.3 1.7.9l.8 1.2c.4.6 1 .9 1.7.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9.5"/><path d="M11.378 13.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>
                </button>
                <button class="btn-icon btn-destructive" data-delete-class="${safeAttr(cls.id)}" title="${t("class.deleteClass")}" data-tooltip="${t("class.deleteClass")}" data-side="left">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-icon lucide-trash"><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </div>`
    ).join("");

    document.querySelectorAll("[data-class-id]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            appData.currentClassId = btn.dataset.classId;
            saveData(t("toast.classSelected"), "success");
            showClassView();
        });
    });

    document.querySelectorAll("[data-edit-class]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const classId = btn.dataset.editClass;
            const cls = appData.classes.find(c => c.id === classId);
            if (cls) {
                const content = `
                    <div class="grid gap-2">
                        <label class="block mb-2">${t("class.newClassName")}</label>
                        <input type="text" name="name" class="input w-full" value="${escapeHtml(cls.name)}" required maxlength="100">
                        <p class="text-sm" style="color: oklch(.708 0 0);">${t("class.renameHint")}<p>
                    </div>
                `;
                showDialog("edit-dialog", t("class.editClass"), content, (formData) => {
                    editClass(classId, formData.get("name"));
                });
            }
        });
    });

    document.querySelectorAll("[data-delete-class]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const classId = btn.dataset.deleteClass;
            const cls = appData.classes.find(c => c.id === classId);
            if (cls) {
                showConfirmDialog(t("confirm.deleteClass", { name: escapeHtml(cls.name) }), () => {
                    deleteClass(classId);
                });
            }
        });
    });
};

/**
 * JAHR-TABS RENDERN
 *
 * Zeigt Tabs für alle Jahrgänge der aktuellen Klasse (ähnlich wie Subject-Tabs).
 */
const renderYearSelector = () => {
    const currentClass = getCurrentClass();
    if (!currentClass) return;

    const container = document.getElementById("year-selector");
    if (!container) return;

    // Ensure years array exists
    if (!currentClass.years) currentClass.years = [];

    // Sort years by name (newest first)
    const sortedYears = [...currentClass.years].sort((a, b) =>
        b.name.localeCompare(a.name)
    );

    let html = '';

    // Ein Tab pro Jahr
    sortedYears.forEach(year => {
        const isActive = currentClass.currentYearId === year.id;
        html += `<div class="flex flex-col items-start gap-8"><div role="group" class="button-group">
            <button class="${isActive ? 'btn-sm-primary' : 'btn-sm-outline'} rounded-r-none" data-year-id="${safeAttr(year.id)}">${escapeHtml(year.name)}</button>
            <button class="btn-sm-icon-outline" data-edit-year="${safeAttr(year.id)}" data-tooltip="${t("year.editYear")}" data-side="top">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-notebook-pen-icon lucide-notebook-pen"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>
            </button>
            <button class="btn-sm-icon-outline" data-delete-year="${safeAttr(year.id)}" data-tooltip="${t("year.manageYears")}" data-side="top" ${sortedYears.length <= 1 ? 'disabled' : ''}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-icon lucide-trash"><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        </div></div>`;
    });

    // "+" Button zum Hinzufügen
    html += `<button class="btn-sm-icon-outline" id="add-year-btn" data-tooltip="${t("year.addYear")}" data-side="top">
        <svg class="lucide lucide-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
    </button>`;

    container.innerHTML = html;

    // Event-Listener: Tab-Klick (Jahr wechseln)
    container.querySelectorAll("[data-year-id]").forEach(btn => {
        btn.addEventListener("click", () => {
            const yearId = btn.dataset.yearId;
            currentClass.currentYearId = yearId;
            saveData();
            renderYearSelector();
            renderSubjectTabs();
            renderStudents();
            renderClassStats();
        });
    });

    // Event-Listener: Jahr hinzufügen
    const addBtn = document.getElementById("add-year-btn");
    if (addBtn) {
        addBtn.addEventListener("click", () => {
            showAddYearDialog(currentClass.id);
        });
    }

    // Event-Listener: Jahr bearbeiten
    container.querySelectorAll("[data-edit-year]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const yearId = btn.dataset.editYear;
            const year = currentClass.years.find(y => y.id === yearId);
            if (year) {
                const content = `
                    <div class="grid gap-2">
                        <label class="block mb-2">${t("year.newYearName")}</label>
                        <input type="text" name="name" class="input w-full" value="${escapeHtml(year.name)}" required maxlength="50">
                    </div>
                `;
                showDialog("edit-dialog", t("year.editYear"), content, (formData) => {
                    editYear(currentClass.id, yearId, formData.get("name"));
                });
            }
        });
    });

    // Event-Listener: Jahr löschen
    container.querySelectorAll("[data-delete-year]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const yearId = btn.dataset.deleteYear;
            const year = currentClass.years.find(y => y.id === yearId);
            if (year && !btn.disabled) {
                showConfirmDialog(t("year.confirmDelete").replace('{name}', escapeHtml(year.name)), () => {
                    deleteYear(currentClass.id, yearId);
                });
            }
        });
    });
};

/**
 * JAHR HINZUFÜGEN DIALOG
 *
 * Zeigt Dialog zum Erstellen eines neuen Jahrgangs mit Option zum Kopieren.
 */
const showAddYearDialog = (classId) => {
    const cls = appData.classes.find(c => c.id === classId);
    if (!cls) return;

    const currentYear = getCurrentSchoolYear();

    // Generate year options (from 5 years ago to 10 years in the future)
    const yearOptions = [];
    for (let year = currentYear - 5; year <= currentYear + 10; year++) {
        yearOptions.push(year);
    }

    // Get previous year for copy option
    const sortedYears = [...cls.years].sort((a, b) =>
        b.name.localeCompare(a.name)
    );
    const previousYear = sortedYears.length > 0 ? sortedYears[0] : null;

    const content = `
        <div class="grid gap-2">
            <label class="block mb-2">${t("year.selectStartYear")}</label>
            <select name="startYear" id="year-start-select" class="select w-full" required>
                ${yearOptions.map(year => `
                    <option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>
                `).join('')}
            </select>
        </div>
        <div class="grid gap-2 mt-3">
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="useSchoolYearFormat" id="use-school-year-format" class="checkbox" checked>
                <span>${t("year.useSchoolYearFormat")}</span>
            </label>
            <p class="text-sm" style="color: oklch(.708 0 0);">${t("year.schoolYearFormatHint")}</p>
        </div>
        ${previousYear ? `
            <div class="grid gap-2 mt-3">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="copyFromPrevious" id="copy-from-previous" class="checkbox" checked>
                    <span>${t("year.copyFromPrevious").replace('{name}', escapeHtml(previousYear.name))}</span>
                </label>
                <p class="text-sm" style="color: oklch(.708 0 0);">${t("year.copyHint")}</p>
            </div>
        ` : ''}
    `;

    showDialog("edit-dialog", t("year.addYear"), content, (formData) => {
        const startYear = parseInt(formData.get("startYear"));
        const useSchoolYearFormat = formData.get("useSchoolYearFormat") === "on";
        const yearName = useSchoolYearFormat ? `${startYear}/${startYear + 1}` : `${startYear}`;

        const copyFromPreviousId = formData.get("copyFromPrevious") === "on" && previousYear
            ? previousYear.id
            : null;
        addYear(classId, yearName, copyFromPreviousId);
    });
};

/**
 * JAHRE VERWALTEN DIALOG
 *
 * Zeigt Liste aller Jahrgänge mit Edit/Delete Buttons.
 */
const showManageYearsDialog = (classId) => {
    const cls = appData.classes.find(c => c.id === classId);
    if (!cls) return;

    const sortedYears = [...cls.years].sort((a, b) =>
        b.name.localeCompare(a.name)
    );

    const content = `
        <div class="space-y-2">
            ${sortedYears.map(year => `
                <div class="flex items-center justify-between p-2 border rounded">
                    <span>${escapeHtml(year.name)} ${year.id === cls.currentYearId ? '(aktiv)' : ''}</span>
                    <div role="group" class="button-group">
                        <button class="btn-sm-icon-outline" data-edit-year="${safeAttr(year.id)}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="btn-sm-icon-destructive" data-delete-year="${safeAttr(year.id)}" ${cls.years.length <= 1 ? 'disabled' : ''}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    showDialog("manage-years-dialog", t("year.manageYears"), content, null, true);

    // Event listeners for edit/delete
    document.querySelectorAll("[data-edit-year]").forEach(btn => {
        btn.addEventListener("click", () => {
            const yearId = btn.dataset.editYear;
            const year = cls.years.find(y => y.id === yearId);
            if (year) {
                const editContent = `
                    <div class="grid gap-2">
                        <label class="block mb-2">${t("year.newYearName")}</label>
                        <input type="text" name="name" class="input w-full" value="${escapeHtml(year.name)}" required maxlength="50">
                    </div>
                `;
                showDialog("edit-dialog", t("year.editYear"), editContent, (formData) => {
                    editYear(classId, yearId, formData.get("name"));
                    document.getElementById("manage-years-dialog").close();
                    showManageYearsDialog(classId);
                });
            }
        });
    });

    document.querySelectorAll("[data-delete-year]").forEach(btn => {
        btn.addEventListener("click", () => {
            const yearId = btn.dataset.deleteYear;
            const year = cls.years.find(y => y.id === yearId);
            if (year) {
                showConfirmDialog(t("year.confirmDelete").replace('{name}', escapeHtml(year.name)), () => {
                    deleteYear(classId, yearId);
                    document.getElementById("manage-years-dialog").close();
                });
            }
        });
    });
};

/**
 * HELPER: Noten für aktives Fach filtern
 *
 * Gibt die gefilterten Noten zurück basierend auf dem aktuellen Fach-Tab.
 *
 * @param {Array} grades - Array mit Noten-Objekten
 * @param {string|null} currentSubjectId - Aktives Fach
 * @returns {Array} - Gefilterte Noten
 */
const filterGradesBySubject = (grades, currentSubjectId) => {
    if (!currentSubjectId) return [];
    return grades.filter(g => g.subjectId === currentSubjectId);
};

/**
 * FÄCHER-TABS RENDERN
 *
 * Zeigt Tab-Leiste mit "Alle Fächer" + ein Tab pro Fach + "+" Button.
 * Jeder Fach-Tab hat Edit/Delete-Buttons.
 */
const renderSubjectTabs = () => {
    const currentYear = getCurrentYear();
    if (!currentYear) return;

    // Sicherstellen, dass subjects-Array existiert (Rückwärtskompatibilität)
    if (!currentYear.subjects) currentYear.subjects = [];
    if (!currentYear.currentSubjectId || currentYear.currentSubjectId === "overview") {
        // Erstes Fach auswählen falls vorhanden
        currentYear.currentSubjectId = currentYear.subjects.length > 0 ? currentYear.subjects[0].id : null;
    }

    const container = document.getElementById("subject-tabs");
    if (!container) return;

    const activeId = currentYear.currentSubjectId;

    let html = '';

    // Ein Tab pro Fach
    currentYear.subjects.forEach(subject => {
        const isActive = activeId === subject.id;
        html += `<div class="flex flex-col items-start gap-8"><div role="group" class="button-group">
            <button class="${isActive ? 'btn-sm-primary' : 'btn-sm-outline'} rounded-r-none" data-subject-id="${safeAttr(subject.id)}">${escapeHtml(subject.name)}</button>
            <button class="btn-sm-icon-outline" data-edit-subject="${safeAttr(subject.id)}" data-tooltip="${t("subject.editSubject")}" data-side="top">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-notebook-pen-icon lucide-notebook-pen"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>
            </button>
            <button class="btn-sm-icon-outline" data-delete-subject="${safeAttr(subject.id)}" data-tooltip="${t("subject.deleteSubject")}" data-side="top">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-icon lucide-trash"><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        </div></div>`;
    });

    // "+" Button zum Hinzufügen
    html += `<button class="btn-sm-icon-outline" id="add-subject-btn" data-tooltip="${t("subject.addSubject")}" data-side="top">
        <svg class="lucide lucide-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
    </button>`;

    container.innerHTML = html;

    // Event-Listener: Tab-Klick (Fach wechseln)
    container.querySelectorAll("[data-subject-id]").forEach(btn => {
        btn.addEventListener("click", () => {
            const subjectId = btn.dataset.subjectId;
            currentYear.currentSubjectId = subjectId;
            saveData();
            renderSubjectTabs();
            renderStudents();
            renderClassStats();
        });
    });

    // Event-Listener: Fach hinzufügen
    const addBtn = document.getElementById("add-subject-btn");
    if (addBtn) {
        addBtn.addEventListener("click", () => {
            const currentClass = getCurrentClass();
            const content = `
                <div class="grid gap-2">
                    <label class="block mb-2">${t("subject.subjectName")}</label>
                    <input type="text" name="name" class="input w-full" required maxlength="50" placeholder="${t("subject.subjectPlaceholder")}">
                    <p class="text-sm" style="color: oklch(.708 0 0);">${t("subject.subjectHint")}</p>
                </div>
            `;
            showDialog("edit-dialog", t("subject.addSubject"), content, (formData) => {
                addSubject(currentClass.id, formData.get("name"));
            });
        });
    }

    // Event-Listener: Fach bearbeiten
    container.querySelectorAll("[data-edit-subject]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const currentClass = getCurrentClass();
            const subjectId = btn.dataset.editSubject;
            const subject = currentYear.subjects.find(s => s.id === subjectId);
            if (subject) {
                const content = `
                    <div class="grid gap-2">
                        <label class="block mb-2">${t("subject.newSubjectName")}</label>
                        <input type="text" name="name" class="input w-full" value="${escapeHtml(subject.name)}" required maxlength="50">
                    </div>
                `;
                showDialog("edit-dialog", t("subject.editSubject"), content, (formData) => {
                    editSubject(currentClass.id, subjectId, formData.get("name"));
                });
            }
        });
    });

    // Event-Listener: Fach löschen
    container.querySelectorAll("[data-delete-subject]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const currentClass = getCurrentClass();
            const subjectId = btn.dataset.deleteSubject;
            const subject = currentYear.subjects.find(s => s.id === subjectId);
            if (subject) {
                showConfirmDialog(t("subject.confirmDelete", { name: escapeHtml(subject.name) }), () => {
                    deleteSubject(currentClass.id, subjectId);
                });
            }
        });
    });
};

/**
 * SCHÜLERTABELLE RENDERN
 *
 * Zeigt alle Schüler der aktuellen Klasse in einer Tabelle an.
 * Für jeden Schüler werden angezeigt:
 * - Name
 * - Alle Noten (als klickbare Badges)
 * - Einfacher Durchschnitt (ungewichtet)
 * - Gewichteter Durchschnitt
 * - Endnote (1-5)
 * - Aktions-Buttons (Note hinzufügen, Bearbeiten, Löschen)
 *
 * Features:
 * - Suchfunktion: Filtert nach Name, Notenwert oder Notenname
 * - Kategoriefilter: Zeigt nur Schüler mit Noten in einer bestimmten Kategorie
 */

/**
 * INITIALIZE TABS IN DIALOG
 *
 * Helper function to initialize tab functionality for dynamically created tabs.
 * Handles switching between tabs when clicked.
 *
 * @param {string} tabsContainerId - ID of the tabs container element
 */
const initializeTabs = (tabsContainerId) => {
    const container = document.getElementById(tabsContainerId);
    if (!container) return;

    const tabs = container.querySelectorAll('[role="tab"]');
    const panels = container.querySelectorAll('[role="tabpanel"]');

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();

            // Deactivate all tabs and panels
            tabs.forEach(t => {
                t.setAttribute('aria-selected', 'false');
                t.setAttribute('tabindex', '-1');
            });
            panels.forEach(p => {
                p.setAttribute('aria-selected', 'false');
                p.hidden = true;
            });

            // Activate clicked tab and its panel
            tab.setAttribute('aria-selected', 'true');
            tab.setAttribute('tabindex', '0');
            const panelId = tab.getAttribute('aria-controls');
            const panel = document.getElementById(panelId);
            if (panel) {
                panel.setAttribute('aria-selected', 'true');
                panel.hidden = false;
            }
        });
    });
};

/**
 * OPEN ADD GRADE DIALOG
 *
 * Opens the dialog for adding a grade to a student. Reusable from class view and student detail view.
 *
 * @param {string} studentId - The ID of the student
 * @param {function} onSuccess - Callback after grade is successfully added
 */
const openAddGradeDialog = (studentId, onSuccess) => {
    const currentYear = getCurrentYear();
    if (!currentYear) return;

    // Get student for display
    const student = currentYear.students.find(s => s.id === studentId);
    if (!student) return;
    const studentName = getStudentDisplayName(student);

    // Create category selection with info about +/- support (global categories)
    const categoryOptions = appData.categories.map(cat => {
        const label = cat.onlyPlusMinus ? ' [+/~/- only]' : (cat.allowPlusMinus ? ' [+/~/-]' : '');
        return `<option value="${safeAttr(cat.id)}" data-allow-plus-minus="${cat.allowPlusMinus}" data-only-plus-minus="${cat.onlyPlusMinus || false}">${escapeHtml(cat.name)} (${(cat.weight * 100).toFixed(0)}%)${label}</option>`;
    }).join("");

    // Collect existing grade names from current year/subject for quick reuse
    const activeSubjectId = currentYear.currentSubjectId;
    const existingGradeNames = [...new Set(
        (currentYear.students || [])
            .flatMap(s => s.grades || [])
            .filter(g => g.name && g.name.trim() && g.subjectId === activeSubjectId)
            .map(g => g.name.trim())
    )].sort();

    const hasGradeNames = existingGradeNames.length > 0;

    // Get today's date in YYYY-MM-DD format for the date input
    const today = new Date().toISOString().split('T')[0];

    const content = `
    <div class="mb-3 p-3 rounded-lg bg-primary/10">
      <p class="text-sm font-medium">${escapeHtml(studentName)}</p>
    </div>
    <div class="grid gap-2">
      <label class="block mb-2">${t("grade.gradeDate")}</label>
      <input type="date" name="gradeDate" class="input w-full" value="${today}" required>
      <p class="text-sm" style="color: oklch(.708 0 0);">${t("grade.gradeDateHint")}</p>
    </div>
    <div class="grid gap-2">
      <label class="block mb-2">${t("grade.gradeName")}</label>
      <div class="relative">
        <div class="flex gap-2">
          <input type="text" name="name" class="input flex-1" placeholder="${t("grade.gradeNamePlaceholder")}">
          ${hasGradeNames ? `<button type="button" id="grade-name-dropdown-btn" class="btn-outline" style="padding: 0.4rem 0.5rem; display: flex; align-items: center;" title="${t("grade.previousNames")}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>` : ''}
        </div>
        ${hasGradeNames ? `<div id="grade-name-dropdown" class="hidden absolute z-50 mt-1 w-full rounded-lg shadow-lg overflow-auto" style="max-height: 200px; background: var(--card, #1e1e2e); border: 1px solid var(--border, #2d2d3d);">
          ${existingGradeNames.map(name => `<button type="button" class="grade-name-option w-full text-left px-3 py-2 cursor-pointer" style="border: none; background: none; color: inherit;" onmouseover="this.style.background='rgba(128,128,128,0.15)'" onmouseout="this.style.background='none'" data-name="${safeAttr(name)}">${escapeHtml(name)}</button>`).join('')}
        </div>` : ''}
      </div>
      <p class="text-sm" style="color: oklch(.708 0 0);">${t("grade.gradeNameHint")}</p>
    </div>
    <div class="grid gap-2">
      <label class="block mb-2">${t("grade.category")}</label>
      <select name="categoryId" id="grade-category-select" class="select w-full" required>
        ${categoryOptions}
      </select>
      <p class="text-sm" style="color: oklch(.708 0 0);">${t("grade.categoryHint")}</p>
    </div>
    <div class="grid gap-2 mb-3">
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" name="isPending" id="grade-is-pending" class="checkbox">
        <span>${t("grade.pendingGrade")}</span>
      </label>
      <p class="text-sm" style="color: oklch(.708 0 0);">${t("grade.pendingGradeHint")}</p>
    </div>
    <div class="grid gap-2" id="grade-value-container">
      <div class="tabs w-full" id="grade-input-tabs">
        <nav role="tablist" aria-orientation="horizontal" class="w-full">
          <button type="button" role="tab" id="tab-grade-direct" aria-controls="panel-grade-direct" aria-selected="true" tabindex="0">${t("grade.gradeTab")}</button>
          <button type="button" role="tab" id="tab-grade-percent" aria-controls="panel-grade-percent" aria-selected="false" tabindex="0">${t("grade.percentageTab")}</button>
        </nav>
        <div role="tabpanel" id="panel-grade-direct" aria-labelledby="tab-grade-direct" tabindex="-1" aria-selected="true">
          <div class="pt-3">
            <input type="number" name="value" step="0.1" min="1" max="6" class="input w-full" id="grade-value-input" placeholder="1-6">
            <p class="text-sm mt-2" style="color: oklch(.708 0 0);">${t("grade.enterGrade")}</p>
          </div>
        </div>
        <div role="tabpanel" id="panel-grade-percent" aria-labelledby="tab-grade-percent" tabindex="-1" aria-selected="false" hidden>
          <div class="pt-3">
            <div class="flex items-center gap-2">
              <input type="number" id="grade-percent-input" step="0.1" min="0" max="100" class="input flex-1" placeholder="0-100">
              <span>%</span>
            </div>
            <p class="text-sm mt-2" style="color: oklch(.708 0 0);">${t("grade.enterPercentage")}</p>
            <p class="text-sm mt-1 font-semibold" id="percent-preview"></p>
          </div>
        </div>
      </div>
    </div>
  `;

    showDialog("edit-dialog", t("grade.addGrade"), content, (formData) => {
        // Check if pending grade checkbox is checked
        const isPending = formData.get("isPending") === "on";

        // Check if percentage tab is active
        const percentPanel = document.getElementById("panel-grade-percent");
        const percentInput = document.getElementById("grade-percent-input");
        const directGradeInput = document.getElementById("grade-value-input");

        let gradeValue = formData.get("value");
        let enteredAsPercent = false;
        let percentValue = null;

        // If grade is pending, skip value validation
        if (!isPending) {
            // If percentage panel is visible and has a value, convert it
            if (percentPanel && !percentPanel.hidden && percentInput && percentInput.value) {
                percentValue = parseFloat(percentInput.value);
                const convertedGrade = percentToGrade(percentValue);
                if (convertedGrade !== null) {
                    gradeValue = convertedGrade.toString();
                    enteredAsPercent = true;
                } else {
                    showAlertDialog(t("error.invalidPercentage"));
                    return;
                }
            } else if (percentPanel && !percentPanel.hidden && (!percentInput || !percentInput.value)) {
                showAlertDialog(t("error.enterPercentage"));
                return;
            } else if ((!percentPanel || percentPanel.hidden) && directGradeInput && !directGradeInput.value && !gradeValue) {
                showAlertDialog(t("error.enterGrade"));
                return;
            }
        } else {
            // For pending grades, set value to null
            gradeValue = null;
        }

        // subjectId vom aktiven Fach-Tab übernehmen (activeSubjectId already defined at line 557)
        // Wenn kein Fach ausgewählt ist (was nicht vorkommen sollte), verhindere das Hinzufügen
        if (!activeSubjectId) {
            showAlertDialog(t("grade.mustSelectSubject"));
            return;
        }

        // Get selected date and convert to timestamp
        const selectedDate = formData.get("gradeDate");
        let gradeTimestamp = null;
        if (selectedDate) {
            // Parse the date string (YYYY-MM-DD) and set time to noon to avoid timezone issues
            const dateParts = selectedDate.split('-');
            const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], 12, 0, 0);
            gradeTimestamp = dateObj.getTime();
        }

        const newGrade = addGrade(studentId, formData.get("categoryId"), gradeValue, formData.get("name"), activeSubjectId, gradeTimestamp, isPending);

        if (newGrade) {
            // Store percentage info if entered as percentage
            if (enteredAsPercent) {
                newGrade.enteredAsPercent = true;
                newGrade.percentValue = percentValue;
            }

            saveData(t("toast.gradeAdded"), "success");
            if (onSuccess) onSuccess();
        }
    });

    // Add dynamic input switching based on category selection
    const categorySelect = document.getElementById("grade-category-select");
    const valueContainer = document.getElementById("grade-value-container");

    const updateGradeInput = () => {
        const selectedOption = categorySelect.options[categorySelect.selectedIndex];
        const allowPlusMinus = selectedOption.dataset.allowPlusMinus === "true";
        const onlyPlusMinus = selectedOption.dataset.onlyPlusMinus === "true";

        if (onlyPlusMinus) {
            // Only +/- grades allowed - no tabs needed
            valueContainer.innerHTML = `
                <label class="block mb-2">${t("grade.gradeTab")}</label>
                <select name="value" class="select w-full" required>
                    <option value="">${t("grade.select")}</option>
                    <option value="+">${t("grade.plus")}</option>
                    <option value="~">${t("grade.neutral")}</option>
                    <option value="-">${t("grade.minus")}</option>
                </select>
                <p class="text-sm" style="color: oklch(.708 0 0);">${t("grade.plusMinusOnlyHint")}</p>
            `;
        } else if (allowPlusMinus) {
            // Allow +/- but also numeric - no percentage for mixed
            valueContainer.innerHTML = `
                <label class="block mb-2">${t("grade.gradeTab")}</label>
                <select name="value" class="select w-full" required>
                    <option value="">${t("grade.selectGradeType")}</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="+">${t("grade.plus")}</option>
                    <option value="~">${t("grade.neutral")}</option>
                    <option value="-">${t("grade.minus")}</option>
                </select>
                <p class="text-sm" style="color: oklch(.708 0 0);">${t("grade.mixedHint")}</p>
            `;
        } else {
            // Normal numeric grades - show tabs with percentage option
            valueContainer.innerHTML = `
                <div class="tabs w-full" id="grade-input-tabs">
                  <nav role="tablist" aria-orientation="horizontal" class="w-full">
                    <button type="button" role="tab" id="tab-grade-direct" aria-controls="panel-grade-direct" aria-selected="true" tabindex="0">${t("grade.gradeTab")}</button>
                    <button type="button" role="tab" id="tab-grade-percent" aria-controls="panel-grade-percent" aria-selected="false" tabindex="0">${t("grade.percentageTab")}</button>
                  </nav>
                  <div role="tabpanel" id="panel-grade-direct" aria-labelledby="tab-grade-direct" tabindex="-1" aria-selected="true">
                    <div class="pt-3">
                      <input type="number" name="value" step="0.1" min="1" max="6" class="input w-full" id="grade-value-input" placeholder="1-6">
                      <p class="text-sm mt-2" style="color: oklch(.708 0 0);">${t("grade.enterGrade")}</p>
                    </div>
                  </div>
                  <div role="tabpanel" id="panel-grade-percent" aria-labelledby="tab-grade-percent" tabindex="-1" aria-selected="false" hidden>
                    <div class="pt-3">
                      <div class="flex items-center gap-2">
                        <input type="number" id="grade-percent-input" step="0.1" min="0" max="100" class="input flex-1" placeholder="0-100">
                        <span>%</span>
                      </div>
                      <p class="text-sm mt-2" style="color: oklch(.708 0 0);">${t("grade.enterPercentage")}</p>
                      <p class="text-sm mt-1 font-semibold" id="percent-preview"></p>
                    </div>
                  </div>
                </div>
            `;

            // Initialize tabs
            setTimeout(() => {
                initializeTabs("grade-input-tabs");
            }, 0);

            // Add percentage preview listener
            setTimeout(() => {
                const percentInput = document.getElementById("grade-percent-input");
                const percentPreview = document.getElementById("percent-preview");
                if (percentInput && percentPreview) {
                    percentInput.addEventListener("input", () => {
                        const percent = parseFloat(percentInput.value);
                        if (!isNaN(percent) && percent >= 0 && percent <= 100) {
                            const grade = percentToGrade(percent);
                            percentPreview.textContent = t("grade.percentPreview", { grade: grade });
                        } else {
                            percentPreview.textContent = "";
                        }
                    });
                }
            }, 0);
        }
    };

    categorySelect.addEventListener("change", updateGradeInput);
    updateGradeInput(); // Initialize on load

    // Initialize tabs functionality
    setTimeout(() => {
        initializeTabs("grade-input-tabs");
    }, 0);

    // Add initial percentage preview listener
    setTimeout(() => {
        const percentInput = document.getElementById("grade-percent-input");
        const percentPreview = document.getElementById("percent-preview");
        if (percentInput && percentPreview) {
            percentInput.addEventListener("input", () => {
                const percent = parseFloat(percentInput.value);
                if (!isNaN(percent) && percent >= 0 && percent <= 100) {
                    const grade = percentToGrade(percent);
                    percentPreview.textContent = t("grade.percentPreview", { grade: grade });
                } else {
                    percentPreview.textContent = "";
                }
            });
        }
    }, 0);

    // Grade name dropdown listeners
    if (hasGradeNames) {
        const dropdownBtn = document.getElementById("grade-name-dropdown-btn");
        const dropdown = document.getElementById("grade-name-dropdown");
        const nameInput = document.querySelector("#edit-dialog [name='name']");

        if (dropdownBtn && dropdown && nameInput) {
            dropdownBtn.addEventListener("click", (e) => {
                e.preventDefault();
                dropdown.classList.toggle("hidden");
            });

            dropdown.querySelectorAll(".grade-name-option").forEach(option => {
                option.addEventListener("click", (e) => {
                    e.preventDefault();
                    nameInput.value = option.dataset.name;
                    dropdown.classList.add("hidden");
                    nameInput.focus();
                });
            });

            document.addEventListener("click", (e) => {
                if (!dropdownBtn.contains(e.target) && !dropdown.contains(e.target)) {
                    dropdown.classList.add("hidden");
                }
            });
        }
    }

    // Add event listener for pending grade checkbox
    const pendingCheckbox = document.getElementById("grade-is-pending");
    const gradeValueContainer = document.getElementById("grade-value-container");

    if (pendingCheckbox && gradeValueContainer) {
        const toggleGradeInputs = () => {
            const isPending = pendingCheckbox.checked;
            gradeValueContainer.style.opacity = isPending ? "0.5" : "1";
            gradeValueContainer.style.pointerEvents = isPending ? "none" : "auto";

            // Disable/enable all inputs in the container
            gradeValueContainer.querySelectorAll("input, select, button").forEach(el => {
                el.disabled = isPending;
            });
        };

        pendingCheckbox.addEventListener("change", toggleGradeInputs);
    }
};

const renderStudents = () => {
    // Aktuellen Jahrgang finden
    const currentYear = getCurrentYear();
    if (!currentYear) {
        console.error("No current year found!");
        return;
    }

    // Update class stats when students table changes
    renderClassStats();

    // Suchbegriff und Kategoriefilter aus den Input-Feldern holen
    const searchTerm = document.getElementById("search-students").value.toLowerCase();
    const filterCategory = document.getElementById("filter-category").value;

    const studentsTable = document.getElementById("students-table");

    // FILTER-PIPELINE: Erst filtern, sortieren, dann rendern
    studentsTable.innerHTML = currentYear.students
        // 1. FILTERN: Nur Schüler behalten die den Kriterien entsprechen
        .filter(student => {
            const fullName = getStudentDisplayName(student).toLowerCase();
            // Calculate final grade for search
            const filteredGrades = filterGradesBySubject(student.grades, currentYear.currentSubjectId);
            const weightedAvg = calculateWeightedAverage(filteredGrades);
            const finalGrade = calculateFinalGrade(weightedAvg).toLowerCase();

            const matchesSearch = fullName.includes(searchTerm) || finalGrade.includes(searchTerm);
            const matchesCategory = filterCategory ? student.grades.some(g => g.categoryId === filterCategory) : true;
            return matchesSearch && matchesCategory;
        })
        // 2. SORTIEREN: Alphabetisch nach Nachname, dann Vorname
        .sort((a, b) => {
            const lastNameCmp = (a.lastName || '').localeCompare(b.lastName || '', 'de');
            if (lastNameCmp !== 0) return lastNameCmp;
            return (a.firstName || '').localeCompare(b.firstName || '', 'de');
        })
        .map(student => {
            // Noten nach aktivem Fach filtern
            const filteredGrades = filterGradesBySubject(student.grades, currentYear.currentSubjectId);
            const simpleAvg = calculateSimpleAverage(filteredGrades);
            const weightedAvg = calculateWeightedAverage(filteredGrades);
            const gradeCount = filteredGrades.length;
            return `
            <tr>
              <td>
                <input type="checkbox" class="checkbox student-checkbox" data-student-id="${safeAttr(student.id)}">
              </td>
              <td><span class="student-name-link" data-student-id="${safeAttr(student.id)}">${escapeHtml(student.lastName || '')}</span></td>
              <td>${escapeHtml(student.firstName || '')}</td>
              <td>${escapeHtml(student.middleName || '')}</td>
              <td>${gradeCount}</td>
              <td>${simpleAvg ? simpleAvg.toFixed(2) : "—"}</td>
              <td>${weightedAvg ? weightedAvg.toFixed(2) : "—"}</td>
              <td>${calculateFinalGrade(weightedAvg)}</td>
              <td>
                <button class="btn-icon btn-secondary mr-1" data-view-student="${safeAttr(student.id)}" data-tooltip="${t("class.viewDetails")}" data-side="top">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-icon lucide-eye"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                <button class="btn-icon btn-primary mr-1" data-add-grade="${safeAttr(student.id)}" data-tooltip="${t("grade.addGrade")}" data-side="top">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus-icon lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                </button>
                <button class="btn-icon btn-secondary mr-1" data-edit-student="${safeAttr(student.id)}" data-tooltip="${t("class.rename")}" data-side="top">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-pen-icon lucide-user-pen"><path d="M11.5 15H7a4 4 0 0 0-4 4v2"/><path d="M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/><circle cx="10" cy="7" r="4"/></svg>
                </button>
                <button class="btn-icon btn-destructive" data-delete-student="${safeAttr(student.id)}" data-tooltip="${t("dialog.delete")}" data-side="top">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-icon lucide-trash"><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </td>
            </tr>
          `;
        }).join("");
    //<button class="btn-icon btn-secondary mr-1" data-print-student="${safeAttr(student.id)}" data-tooltip="${t("student.print")}" data-side="top"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg></button>
                
    // Add event listeners for student name links (to open detail view)
    document.querySelectorAll(".student-name-link").forEach(link => {
        link.addEventListener("click", () => {
            const studentId = link.dataset.studentId;
            showStudentDetailView(studentId);
        });
    });

    // Add event listeners for view details buttons
    document.querySelectorAll("[data-view-student]").forEach(btn => {
        btn.addEventListener("click", () => {
            const studentId = btn.dataset.viewStudent;
            showStudentDetailView(studentId);
        });
    });

    document.querySelectorAll("[data-add-grade]").forEach(btn => {
        btn.addEventListener("click", () => {
            openAddGradeDialog(btn.dataset.addGrade, () => renderStudents());
        });
    });

    document.querySelectorAll("[data-print-student]").forEach(btn => {
        btn.addEventListener("click", () => {
            const studentId = btn.dataset.printStudent;
            exportStudentDetailPDF(studentId);
        });
    });

    document.querySelectorAll("[data-edit-student]").forEach(btn => {
        btn.addEventListener("click", () => {
            const studentId = btn.dataset.editStudent;
            const student = currentYear.students.find(s => s.id === studentId);
            if (student) {
                const content = `
            <div class="grid gap-2">
              <label class="block mb-2">${t("student.firstName")}</label>
              <input type="text" name="firstName" class="input w-full" value="${escapeHtml(student.firstName || '')}" required maxlength="50">
            </div>
            <div class="grid gap-2 mt-3">
              <label class="block mb-2">${t("student.middleName")}</label>
              <input type="text" name="middleName" class="input w-full" value="${escapeHtml(student.middleName || '')}" maxlength="50">
            </div>
            <div class="grid gap-2 mt-3">
              <label class="block mb-2">${t("student.lastName")}</label>
              <input type="text" name="lastName" class="input w-full" value="${escapeHtml(student.lastName || '')}" required maxlength="50">
            </div>
          `;

                showDialog("edit-dialog", t("class.editStudent"), content, (formData) => {
                    student.firstName = formData.get("firstName");
                    student.middleName = formData.get("middleName") || '';
                    student.lastName = formData.get("lastName");
                    saveData(t("toast.studentEdited"), "success");
                    renderStudents();
                });
            }
        });
    });

    document.querySelectorAll("[data-delete-student]").forEach(btn => {
        btn.addEventListener("click", () => {
            const studentId = btn.dataset.deleteStudent;
            showConfirmDialog(t("confirm.deleteStudent"), () => {
                deleteItem("student", studentId);
                saveData(t("toast.studentDeleted"), "success");
                renderStudents();
            });
        });
    });

    // Bulk Actions: Handle checkbox changes
    const updateBulkActionsToolbar = () => {
        const checkboxes = document.querySelectorAll(".student-checkbox");
        const checkedCheckboxes = document.querySelectorAll(".student-checkbox:checked");
        const toolbar = document.getElementById("bulk-actions-toolbar");
        const countElement = document.getElementById("bulk-selection-count");
        const selectAllCheckbox = document.getElementById("select-all-students");

        const checkedCount = checkedCheckboxes.length;

        // Show/hide toolbar based on selection
        if (checkedCount > 0) {
            toolbar.classList.remove("hidden");
            countElement.textContent = t("class.selected").replace("{count}", checkedCount);
        } else {
            toolbar.classList.add("hidden");
        }

        // Update "select all" checkbox state
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = checkedCount === checkboxes.length && checkboxes.length > 0;
            selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
        }
    };

    // Individual checkbox listeners
    document.querySelectorAll(".student-checkbox").forEach(checkbox => {
        checkbox.addEventListener("change", updateBulkActionsToolbar);
    });

    // Select all checkbox
    const selectAllCheckbox = document.getElementById("select-all-students");
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener("change", (e) => {
            const checkboxes = document.querySelectorAll(".student-checkbox");
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
            });
            updateBulkActionsToolbar();
        });
    }

    // Bulk add grade button
    const bulkAddGradeBtn = document.getElementById("bulk-add-grade-btn");
    if (bulkAddGradeBtn) {
        // Remove old listener if exists
        const newBtn = bulkAddGradeBtn.cloneNode(true);
        bulkAddGradeBtn.parentNode.replaceChild(newBtn, bulkAddGradeBtn);

        newBtn.addEventListener("click", () => {
            const selectedStudentIds = Array.from(document.querySelectorAll(".student-checkbox:checked"))
                .map(cb => cb.dataset.studentId);

            if (selectedStudentIds.length === 0) return;

            // Open the grade dialog and add to all selected students
            const currentYear = getCurrentYear();
            if (!currentYear) return;

            // Create category selection with info about +/- support (global categories)
            const categoryOptions = appData.categories.map(cat => {
                const label = cat.onlyPlusMinus ? ' [+/~/- only]' : (cat.allowPlusMinus ? ' [+/~/-]' : '');
                return `<option value="${safeAttr(cat.id)}" data-allow-plus-minus="${cat.allowPlusMinus}" data-only-plus-minus="${cat.onlyPlusMinus || false}">${escapeHtml(cat.name)} (${(cat.weight * 100).toFixed(0)}%)${label}</option>`;
            }).join("");

            // Collect existing grade names from current year/subject for quick reuse
            const activeSubjectId = currentYear.currentSubjectId;
            const existingGradeNames = [...new Set(
                (currentYear.students || [])
                    .flatMap(s => s.grades || [])
                    .filter(g => g.name && g.name.trim() && g.subjectId === activeSubjectId)
                    .map(g => g.name.trim())
            )].sort();

            const hasGradeNames = existingGradeNames.length > 0;

            // Get today's date in YYYY-MM-DD format for the date input
            const today = new Date().toISOString().split('T')[0];

            const content = `
            <div class="mb-3 p-3 rounded-lg bg-primary/10">
                <p class="text-sm font-medium">${t("class.selected").replace("{count}", selectedStudentIds.length)}</p>
            </div>
            <div class="grid gap-2">
              <label class="block mb-2">${t("grade.gradeDate")}</label>
              <input type="date" name="gradeDate" class="input w-full" value="${today}" required>
              <p class="text-sm" style="color: oklch(.708 0 0);">${t("grade.gradeDateHint")}</p>
            </div>
            <div class="grid gap-2">
              <label class="block mb-2">${t("grade.gradeName")}</label>
              <div class="relative">
                <div class="flex gap-2">
                  <input type="text" name="name" class="input flex-1" placeholder="${t("grade.gradeNamePlaceholder")}">
                  ${hasGradeNames ? `<button type="button" id="grade-name-dropdown-btn" class="btn-outline" style="padding: 0.4rem 0.5rem; display: flex; align-items: center;" title="${t("grade.previousNames")}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </button>` : ''}
                </div>
                ${hasGradeNames ? `<div id="grade-name-dropdown" class="hidden absolute z-50 mt-1 w-full rounded-lg shadow-lg overflow-auto" style="max-height: 200px; background: var(--card, #1e1e2e); border: 1px solid var(--border, #2d2d3d);">
                  ${existingGradeNames.map(name => `<button type="button" class="grade-name-option w-full text-left px-3 py-2 cursor-pointer" style="border: none; background: none; color: inherit;" onmouseover="this.style.background='rgba(128,128,128,0.15)'" onmouseout="this.style.background='none'" data-name="${safeAttr(name)}">${escapeHtml(name)}</button>`).join('')}
                </div>` : ''}
              </div>
              <p class="text-sm" style="color: oklch(.708 0 0);">${t("grade.gradeNameHint")}</p>
            </div>
            <div class="grid gap-2">
              <label class="block mb-2">${t("grade.category")}</label>
              <select name="categoryId" id="grade-category-select" class="select w-full" required>
                ${categoryOptions}
              </select>
              <p class="text-sm" style="color: oklch(.708 0 0);">${t("grade.categoryHint")}</p>
            </div>
            <div class="grid gap-2 mb-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="isPending" id="grade-is-pending-bulk" class="checkbox">
                <span>${t("grade.pendingGrade")}</span>
              </label>
              <p class="text-sm" style="color: oklch(.708 0 0);">${t("grade.pendingGradeHint")}</p>
            </div>
            <div class="grid gap-2" id="grade-value-container">
              <div class="tabs w-full" id="grade-input-tabs">
                <nav role="tablist" aria-orientation="horizontal" class="w-full">
                  <button type="button" role="tab" id="tab-grade-direct" aria-controls="panel-grade-direct" aria-selected="true" tabindex="0">${t("grade.gradeTab")}</button>
                  <button type="button" role="tab" id="tab-grade-percent" aria-controls="panel-grade-percent" aria-selected="false" tabindex="0">${t("grade.percentageTab")}</button>
                </nav>
                <div role="tabpanel" id="panel-grade-direct" aria-labelledby="tab-grade-direct" tabindex="-1" aria-selected="true">
                  <div class="pt-3">
                    <input type="number" name="value" step="0.1" min="1" max="6" class="input w-full" id="grade-value-input" placeholder="1-6">
                    <p class="text-sm mt-2" style="color: oklch(.708 0 0);">${t("grade.enterGrade")}</p>
                  </div>
                </div>
                <div role="tabpanel" id="panel-grade-percent" aria-labelledby="tab-grade-percent" tabindex="-1" aria-selected="false" hidden>
                  <div class="pt-3">
                    <div class="flex items-center gap-2">
                      <input type="number" id="grade-percent-input" step="0.1" min="0" max="100" class="input flex-1" placeholder="0-100">
                      <span>%</span>
                    </div>
                    <p class="text-sm mt-2" style="color: oklch(.708 0 0);">${t("grade.enterPercentage")}</p>
                    <p class="text-sm mt-1 font-semibold" id="percent-preview"></p>
                  </div>
                </div>
              </div>
            </div>
          `;

            showDialog("edit-dialog", t("class.bulkAddGrade"), content, (formData) => {
                // Check if pending grade checkbox is checked
                const isPending = formData.get("isPending") === "on";

                // Check if percentage tab is active
                const percentPanel = document.getElementById("panel-grade-percent");
                const percentInput = document.getElementById("grade-percent-input");
                const directGradeInput = document.getElementById("grade-value-input");

                let gradeValue = formData.get("value");
                let enteredAsPercent = false;
                let percentValue = null;

                // If grade is pending, skip value validation
                if (!isPending) {
                    // If percentage panel is visible and has a value, convert it
                    if (percentPanel && !percentPanel.hidden && percentInput && percentInput.value) {
                        percentValue = parseFloat(percentInput.value);
                        const convertedGrade = percentToGrade(percentValue);
                        if (convertedGrade !== null) {
                            gradeValue = convertedGrade.toString();
                            enteredAsPercent = true;
                        } else {
                            showAlertDialog(t("error.invalidPercentage"));
                            return;
                        }
                    } else if (percentPanel && !percentPanel.hidden && (!percentInput || !percentInput.value)) {
                        showAlertDialog(t("error.enterPercentage"));
                        return;
                    } else if ((!percentPanel || percentPanel.hidden) && directGradeInput && !directGradeInput.value && !gradeValue) {
                        showAlertDialog(t("error.enterGrade"));
                        return;
                    }
                } else {
                    // For pending grades, set value to null
                    gradeValue = null;
                }

                // Check if subject is selected
                if (!activeSubjectId) {
                    showAlertDialog(t("grade.mustSelectSubject"));
                    return;
                }

                // Get selected date and convert to timestamp
                const selectedDate = formData.get("gradeDate");
                let gradeTimestamp = null;
                if (selectedDate) {
                    // Parse the date string (YYYY-MM-DD) and set time to noon to avoid timezone issues
                    const dateParts = selectedDate.split('-');
                    const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], 12, 0, 0);
                    gradeTimestamp = dateObj.getTime();
                }

                // Add grade to all selected students
                selectedStudentIds.forEach(studentId => {
                    const newGrade = addGrade(studentId, formData.get("categoryId"), gradeValue, formData.get("name"), activeSubjectId, gradeTimestamp, isPending);

                    if (newGrade && enteredAsPercent) {
                        newGrade.enteredAsPercent = true;
                        newGrade.percentValue = percentValue;
                    }
                });

                saveData(t("toast.gradeAddedToMultiple").replace("{count}", selectedStudentIds.length), "success");
                renderStudents();
            });

            // Set up tab switching after dialog is shown
            setTimeout(() => {
                const tabGradeDirect = document.getElementById("tab-grade-direct");
                const tabGradePercent = document.getElementById("tab-grade-percent");
                const panelGradeDirect = document.getElementById("panel-grade-direct");
                const panelGradePercent = document.getElementById("panel-grade-percent");

                if (tabGradeDirect && tabGradePercent && panelGradeDirect && panelGradePercent) {
                    tabGradeDirect.addEventListener("click", () => {
                        tabGradeDirect.setAttribute("aria-selected", "true");
                        tabGradePercent.setAttribute("aria-selected", "false");
                        panelGradeDirect.removeAttribute("hidden");
                        panelGradePercent.setAttribute("hidden", "");
                    });

                    tabGradePercent.addEventListener("click", () => {
                        tabGradePercent.setAttribute("aria-selected", "true");
                        tabGradeDirect.setAttribute("aria-selected", "false");
                        panelGradePercent.removeAttribute("hidden");
                        panelGradeDirect.setAttribute("hidden", "");
                    });

                    // Percentage preview
                    const percentInput = document.getElementById("grade-percent-input");
                    const percentPreview = document.getElementById("percent-preview");
                    if (percentInput && percentPreview) {
                        percentInput.addEventListener("input", () => {
                            const val = parseFloat(percentInput.value);
                            if (!isNaN(val) && val >= 0 && val <= 100) {
                                const grade = percentToGrade(val);
                                if (grade !== null) {
                                    percentPreview.textContent = t("grade.percentPreview").replace("{grade}", grade.toFixed(1));
                                }
                            } else {
                                percentPreview.textContent = "";
                            }
                        });
                    }
                }

                // Grade name dropdown
                const dropdownBtn = document.getElementById("grade-name-dropdown-btn");
                const dropdown = document.getElementById("grade-name-dropdown");
                const nameInput = document.querySelector('input[name="name"]');

                if (dropdownBtn && dropdown && nameInput) {
                    dropdownBtn.addEventListener("click", () => {
                        dropdown.classList.toggle("hidden");
                    });

                    document.querySelectorAll(".grade-name-option").forEach(option => {
                        option.addEventListener("click", () => {
                            nameInput.value = option.dataset.name;
                            dropdown.classList.add("hidden");
                        });
                    });
                }

                // Add dynamic input switching based on category selection
                const categorySelect = document.getElementById("grade-category-select");
                const valueContainer = document.getElementById("grade-value-container");

                if (categorySelect && valueContainer) {
                    const updateGradeInput = () => {
                        const selectedOption = categorySelect.options[categorySelect.selectedIndex];
                        const allowPlusMinus = selectedOption.dataset.allowPlusMinus === "true";
                        const onlyPlusMinus = selectedOption.dataset.onlyPlusMinus === "true";

                        if (onlyPlusMinus) {
                            valueContainer.innerHTML = `
                                <label class="block mb-2">${t("grade.gradeTab")}</label>
                                <select name="value" class="select w-full" required>
                                    <option value="">${t("grade.select")}</option>
                                    <option value="+">${t("grade.plus")}</option>
                                    <option value="~">${t("grade.neutral")}</option>
                                    <option value="-">${t("grade.minus")}</option>
                                </select>
                                <p class="text-sm" style="color: oklch(.708 0 0);">${t("grade.plusMinusOnlyHint")}</p>
                            `;
                        } else if (allowPlusMinus) {
                            valueContainer.innerHTML = `
                                <label class="block mb-2">${t("grade.gradeTab")}</label>
                                <select name="value" class="select w-full" required>
                                    <option value="">${t("grade.selectGradeType")}</option>
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                    <option value="3">3</option>
                                    <option value="4">4</option>
                                    <option value="5">5</option>
                                    <option value="6">6</option>
                                    <option value="+">${t("grade.plus")}</option>
                                    <option value="~">${t("grade.neutral")}</option>
                                    <option value="-">${t("grade.minus")}</option>
                                </select>
                                <p class="text-sm" style="color: oklch(.708 0 0);">${t("grade.mixedHint")}</p>
                            `;
                        }
                    };

                    categorySelect.addEventListener("change", updateGradeInput);
                }

                // Add event listener for pending grade checkbox (bulk)
                const pendingCheckboxBulk = document.getElementById("grade-is-pending-bulk");
                const gradeValueContainerBulk = document.getElementById("grade-value-container");

                if (pendingCheckboxBulk && gradeValueContainerBulk) {
                    const toggleGradeInputsBulk = () => {
                        const isPending = pendingCheckboxBulk.checked;
                        gradeValueContainerBulk.style.opacity = isPending ? "0.5" : "1";
                        gradeValueContainerBulk.style.pointerEvents = isPending ? "none" : "auto";

                        // Disable/enable all inputs in the container
                        gradeValueContainerBulk.querySelectorAll("input, select, button").forEach(el => {
                            el.disabled = isPending;
                        });
                    };

                    pendingCheckboxBulk.addEventListener("change", toggleGradeInputsBulk);
                }
            }, 100);
        });
    }

    // Bulk delete button
    const bulkDeleteBtn = document.getElementById("bulk-delete-btn");
    if (bulkDeleteBtn) {
        // Remove old listener if exists
        const newBtn = bulkDeleteBtn.cloneNode(true);
        bulkDeleteBtn.parentNode.replaceChild(newBtn, bulkDeleteBtn);

        newBtn.addEventListener("click", () => {
            const selectedStudentIds = Array.from(document.querySelectorAll(".student-checkbox:checked"))
                .map(cb => cb.dataset.studentId);

            if (selectedStudentIds.length === 0) return;

            const confirmMessage = t("confirm.deleteStudents").replace("{count}", selectedStudentIds.length);
            showConfirmDialog(confirmMessage, () => {
                const currentYear = getCurrentYear();
                if (!currentYear) return;

                // Delete all selected students
                currentYear.students = currentYear.students.filter(
                    student => !selectedStudentIds.includes(student.id)
                );

                saveData(t("toast.studentsDeleted").replace("{count}", selectedStudentIds.length), "success");
                renderStudents();
            });
        });
    }

    // Initialize toolbar state
    updateBulkActionsToolbar();

};

/**
 * RENDER CLASS STATS
 *
 * Displays statistics for the current class at the top of the class view.
 * Shows: Class average, student count, total grades, pass rate.
 */
const renderClassStats = () => {
    const currentYear = getCurrentYear();
    if (!currentYear) return;

    const studentCount = currentYear.students.length;

    let totalGrades = 0;
    let passCount = 0;
    let studentWithGradesCount = 0;
    const classAverages = [];

    currentYear.students.forEach(student => {
        // Noten nach aktivem Fach filtern
        const filteredGrades = filterGradesBySubject(student.grades, currentYear.currentSubjectId);
        const numericGrades = filteredGrades.filter(g => !g.isPlusMinus);
        totalGrades += numericGrades.length;

        const avg = calculateWeightedAverage(filteredGrades);
        if (avg > 0) {
            classAverages.push(avg);
            studentWithGradesCount++;
            if (avg <= 4.5) passCount++;
        }
    });

    // Class average
    const classAverage = classAverages.length > 0
        ? (classAverages.reduce((a, b) => a + b, 0) / classAverages.length).toFixed(2)
        : "-";

    // Pass rate (students with grade 4 or better)
    const passRate = studentWithGradesCount > 0
        ? Math.round((passCount / studentWithGradesCount) * 100) + "%"
        : "-";

    document.getElementById("class-stat-average").textContent = classAverage;
    document.getElementById("class-stat-students").textContent = studentCount;
    document.getElementById("class-stat-grades").textContent = totalGrades;
    document.getElementById("class-stat-pass-rate").textContent = passRate;
};

const renderCategoryFilter = () => {
    // Kategorien sind jetzt global (gelten für alle Klassen)
    const filter = document.getElementById("filter-category");
    filter.innerHTML = `
        <option value="">${t("class.allCategories")}</option>
        ${appData.categories.map(cat => `
          <option value="${safeAttr(cat.id)}">${escapeHtml(cat.name)}</option>
        `).join("")}
      `;
};

const renderCategoryManagement = () => {
    // Kategorien sind jetzt global (gelten für alle Klassen)
    const categoryManagementList = document.getElementById("categories-list");
    categoryManagementList.innerHTML = appData.categories.map(cat => {
        const label = cat.onlyPlusMinus ? ` <span class="badge badge-primary">${t("category.plusMinusOnlyBadge")}</span>` : (cat.allowPlusMinus ? ` <span class="badge badge-primary">${t("category.plusMinusBadge")}</span>` : '');
        return `
        <div class="flex items-center justify-between p-2 border rounded">
            <div>
                <span>${escapeHtml(cat.name)} (${(cat.weight * 100).toFixed(0)}%)${label}</span>
            </div>
            <div role="group" class="button-group">
                <button class="btn-icon btn-small btn-secondary" data-edit-category="${safeAttr(cat.id)}" data-tooltip="${t("category.editTooltip")}" data-side="left">
                    <svg class="lucide lucide-edit" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.5 5.5l-4 4L17 11.5 21 7.5z" />
                    </svg>
                </button>
                <button class="btn-icon btn-small btn-destructive" data-delete-category="${safeAttr(cat.id)}" data-tooltip="${t("category.deleteTooltip")}" data-side="left">
                    <svg class="lucide lucide-trash-2" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6h18" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                </button>
            </div>
        </div>
    `;
    }).join("");

    document.querySelectorAll("[data-edit-category]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const categoryId = e.target.closest("[data-edit-category]").dataset.editCategory;
            const category = appData.categories.find(c => c.id === categoryId);
            if (category) {
                const content = `
                    <div class="grid gap-2">
                        <label class="block mb-2">${t("category.categoryName")}</label>
                        <input type="text" name="name" class="input w-full" value="${escapeHtml(category.name)}" required maxlength="100">
                        <p class="text-sm" style="color: oklch(.708 0 0);">${t("category.editCategoryNameHint")}</p>
                    </div>
                    <div class="grid gap-2">
                        <label class="block mb-2">${t("category.weight")}</label>
                        <input type="number" name="weight" step="1" min="1" max="100" class="input w-full" value="${escapeHtml(category.weight * 100)}" required>
                        <p class="text-sm" style="color: oklch(.708 0 0);">${t("category.editWeightHint")} (${t("category.inPercent")})</p>
                    </div>
                    <div class="grid gap-2">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" name="onlyPlusMinus" class="checkbox" ${category.onlyPlusMinus ? 'checked' : ''}>
                            <span>${t("category.plusMinusOnly")}</span>
                        </label>
                        <p class="text-sm" style="color: oklch(.708 0 0);">${t("category.editPlusMinusHint")}</p>
                    </div>
                `;
                showDialog("edit-dialog", t("category.editCategory"), content, (formData) => {
                    const newName = formData.get("name");
                    const newWeight = parseFloat(formData.get("weight")); // This will be the percentage value from the UI
                    const onlyPlusMinus = formData.get("onlyPlusMinus") === "on";

                    // Validate the weight (this will convert percentage to decimal)
                    const weightValidation = validateWeight(newWeight);
                    if (!weightValidation.isValid) {
                        showAlertDialog(weightValidation.error);
                        return;
                    }
                    
                    const decimalWeight = weightValidation.value; // This is the decimal value for internal use

                    // Update all existing grades that belong to this category (in ALL classes)
                    appData.classes.forEach(cls => {
                        cls.students.forEach(student => {
                            student.grades.forEach(grade => {
                                if (grade.categoryId === category.id) {
                                    grade.categoryName = newName;
                                    grade.weight = decimalWeight; // Use the decimal value internally
                                }
                            });
                        });
                    });

                    // Update the category itself
                    category.name = newName;
                    category.weight = decimalWeight; // Use the decimal value internally
                    category.onlyPlusMinus = onlyPlusMinus;
                    category.allowPlusMinus = onlyPlusMinus || category.allowPlusMinus;

                    saveData(t("toast.categoryEdited"), "success");
                    renderCategoryFilter();
                    renderStudents();
                    renderCategoryManagement();
                });
            }
        });
    });

    document.querySelectorAll("[data-delete-category]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const categoryId = e.target.closest("[data-delete-category]").dataset.deleteCategory;
            showConfirmDialog(t("confirm.deleteCategory"), () => {
                deleteItem("category", categoryId);
                saveData(t("toast.categoryDeleted"), "success");
                renderCategoryManagement();
            });
        });
    });
};

/**
 * FARB-KLASSE FÜR NOTE ERMITTELN
 *
 * Gibt eine CSS-Klasse zurück, die der Leistung entspricht.
 * Bessere Noten sind neutraler, schlechtere Noten sind rötlicher.
 *
 * @param {Object} grade - Das Noten-Objekt
 * @returns {string} - CSS-Klassen für die Farbgebung
 */
const getGradeColorClass = (grade) => {
    // Plus/Minus Noten
    if (grade.isPlusMinus) {
        if (grade.value === '+') {
            return 'grade-badge grade-plus';
        } else if (grade.value === '~') {
            return 'grade-badge grade-neutral';
        } else {
            return 'grade-badge grade-minus';
        }
    }

    // Numerische Noten nach Wert färben
    const value = parseFloat(grade.value);
    if (isNaN(value)) return 'badge-secondary';

    if (value <= 1.5) {
        // Note 1 - Sehr Gut
        return 'grade-badge grade-1';
    } else if (value <= 2.5) {
        // Note 2 - Gut
        return 'grade-badge grade-2';
    } else if (value <= 3.5) {
        // Note 3 - Befriedigend
        return 'grade-badge grade-3';
    } else if (value <= 4.5) {
        // Note 4 - Genügend
        return 'grade-badge grade-4';
    } else {
        // Note 5 - Nicht Genügend
        return 'grade-badge grade-5';
    }
};

/**
 * EINFACHER DURCHSCHNITT BERECHNEN (ohne Gewichtung)
 *
 * Berechnet den arithmetischen Mittelwert aller numerischen Noten.
 * Plus/Minus-Noten werden ignoriert.
 *
 * Formel: (Note1 + Note2 + Note3 + ...) / Anzahl der Noten
 *
 * Beispiel:
 *   Noten: 1, 2, 3, 4
 *   Durchschnitt = (1 + 2 + 3 + 4) / 4 = 2.5
 *
 * @param {Array} grades - Array mit Noten-Objekten
 * @returns {number} - Durchschnitt oder 0 wenn keine Noten vorhanden
 */
const calculateSimpleAverage = (grades) => {
    // Nur numerische Noten verwenden (keine +/- Noten) und nur die, die in die Gesamtnote eingerechnet werden sollen
    const numericGrades = grades.filter(g => !g.isPlusMinus && !g.excludeFromAverage);

    // Wenn keine Noten vorhanden, 0 zurückgeben
    if (numericGrades.length === 0) return 0;

    // Summe aller Notenwerte berechnen
    // reduce() akkumuliert alle Werte zu einer Summe
    // acc = Akkumulator (Zwischenergebnis), grade = aktuelles Element
    const sum = numericGrades.reduce((acc, grade) => acc + grade.value, 0);

    // Durchschnitt = Summe / Anzahl
    return sum / numericGrades.length;
};

/**
 * GEWICHTETER DURCHSCHNITT BERECHNEN
 *
 * Dies ist die KERNFUNKTION für die Notenberechnung.
 * Sie berücksichtigt die Gewichtung jeder Kategorie.
 *
 * BERECHNUNG IN 2 SCHRITTEN (österreichisches System):
 * 1. Erst Durchschnitt PRO KATEGORIE berechnen
 * 2. Dann Kategorie-Durchschnitte mit Kategorie-Gewichten kombinieren
 *
 * FORMEL:
 *   Durchschnitt = Σ(Kategorie-Durchschnitt × Kategorie-Gewicht) / Σ(Kategorie-Gewicht)
 *
 * Beispiel:
 *   Schularbeit (Gewicht 0.5): Noten 2, 3, 1 → Durchschnitt 2.0
 *   Test (Gewicht 0.3): Note 4 → Durchschnitt 4.0
 *
 *   Gewichteter Durchschnitt = (2.0×0.5 + 4.0×0.3) / (0.5 + 0.3)
 *                            = (1.0 + 1.2) / 0.8
 *                            = 2.75
 *
 * PLUS/MINUS-NOTEN:
 * Werden pro Kategorie gesammelt und in eine Note umgewandelt.
 * Beispiel: 3 Plus und 1 Minus bei Startnote 3 und Wert 0.5:
 *   Note = 3 - (3 × 0.5) + (1 × 0.5) = 3 - 1.5 + 0.5 = 2.0
 *
 * @param {Array} grades - Array mit Noten-Objekten
 * @returns {number} - Gewichteter Durchschnitt (1-5) oder 0
 */
const calculateWeightedAverage = (grades) => {
    // Prozentwerte für Plus/Minus/Neutral laden
    const plusMinusPercentages = appData.plusMinusPercentages || {
        plus: 100,
        neutral: 50,
        minus: 0
    };

    // SCHRITT 1: Noten nach Kategorie gruppieren
    const gradesByCategory = {};

    grades.forEach(grade => {
        // Noten, die nicht in die Gesamtnote eingerechnet werden sollen, überspringen
        if (grade.excludeFromAverage) return;

        // Ausstehende Noten (isPending) überspringen
        if (grade.isPending) return;

        const catId = grade.categoryId;
        if (!gradesByCategory[catId]) {
            gradesByCategory[catId] = {
                weight: grade.weight,
                numericGrades: [],
                plusCount: 0,
                neutralCount: 0,
                minusCount: 0
            };
        }

        if (grade.isPlusMinus) {
            if (grade.value === "+") {
                gradesByCategory[catId].plusCount++;
            } else if (grade.value === "~") {
                gradesByCategory[catId].neutralCount++;
            } else if (grade.value === "-") {
                gradesByCategory[catId].minusCount++;
            }
        } else {
            gradesByCategory[catId].numericGrades.push(grade.value);
        }
    });

    // SCHRITT 2: Durchschnitt pro Kategorie berechnen
    let weightedSum = 0;
    let totalWeight = 0;

    Object.values(gradesByCategory).forEach(category => {
        let categoryAverage = null;

        // Numerische Noten: einfacher Durchschnitt
        if (category.numericGrades.length > 0) {
            const sum = category.numericGrades.reduce((a, b) => a + b, 0);
            categoryAverage = sum / category.numericGrades.length;
        }

        // Plus/Minus/Neutral Noten
        const totalPlusMinusGrades = category.plusCount + category.neutralCount + category.minusCount;
        if (totalPlusMinusGrades > 0) {
            // Prozentbasierte Berechnung für +/~/- Noten (immer, auch bei gemischten Kategorien)
            const totalPoints = (category.plusCount * plusMinusPercentages.plus) +
                               (category.neutralCount * plusMinusPercentages.neutral) +
                               (category.minusCount * plusMinusPercentages.minus);
            const percentage = totalPoints / totalPlusMinusGrades;

            // Prozent in Note umwandeln (verwendet gradePercentageRanges)
            let pmGrade = percentToGrade(percentage);
            if (pmGrade === null) pmGrade = 3; // Fallback

            if (category.numericGrades.length === 0) {
                // Nur +/~/- Noten: verwende die berechnete Note direkt
                categoryAverage = pmGrade;
            } else {
                // Gemischte Kategorie: +/- zählt als eine zusätzliche "Note"
                const totalGrades = category.numericGrades.length + 1;
                categoryAverage = (categoryAverage * category.numericGrades.length + pmGrade) / totalGrades;
            }
        }

        // Kategorie zum gewichteten Durchschnitt hinzufügen
        if (categoryAverage !== null) {
            weightedSum += categoryAverage * category.weight;
            totalWeight += category.weight;
        }
    });

    // SCHRITT 3: Gewichteten Gesamtdurchschnitt berechnen
    if (totalWeight === 0) return 0;

    let average = weightedSum / totalWeight;
    return Math.max(1, Math.min(5, average));
};

/**
 * ENDNOTE BERECHNEN (Österreichisches Notensystem)
 *
 * Wandelt einen Durchschnittswert in eine Schulnote um.
 *
 * ÖSTERREICHISCHES NOTENSYSTEM:
 *   1 = Sehr Gut      (Durchschnitt 1.0 - 1.5)
 *   2 = Gut           (Durchschnitt 1.51 - 2.5)
 *   3 = Befriedigend  (Durchschnitt 2.51 - 3.5)
 *   4 = Genügend      (Durchschnitt 3.51 - 4.5)
 *   5 = Nicht Genügend (Durchschnitt über 4.5)
 *
 * Die Grenzen sind so gewählt, dass bei x.5 auf die bessere Note
 * gerundet wird (z.B. 2.5 → Note 2).
 *
 * @param {number} average - Der berechnete Durchschnitt
 * @returns {string} - Die Endnote als String ("1" bis "5" oder "-")
 */
const calculateFinalGrade = (average) => {
    // Wenn kein Durchschnitt berechenbar, "-" anzeigen
    if (average === 0) return "-";

    // Notenberechnung nach österreichischem System
    // Die if-Abfragen werden von oben nach unten durchlaufen
    // Das erste zutreffende if liefert die Note
    if (average <= 1.5) return "1";  // Sehr Gut
    if (average <= 2.5) return "2";  // Gut
    if (average <= 3.5) return "3";  // Befriedigend
    if (average <= 4.5) return "4";  // Genügend
    return "5";                       // Nicht Genügend
};

/**
 * HOME-ANSICHT RENDERN (Dashboard mit Statistiken)
 *
 * Zeigt eine Übersicht mit:
 * - Gesamtzahl der Klassen
 * - Gesamtzahl der Schüler
 * - Durchschnitt aller Schüler
 * - Gesamtzahl der Noten
 * - Klassenübersicht mit Durchschnitten
 *
 * Die Statistiken werden live aus den Daten berechnet.
 */
const renderHome = () => {
    // STATISTIKEN BERECHNEN

    // Anzahl der Klassen (direkt aus Array-Länge)
    const totalClasses = appData.classes.length;

    // Diese Werte werden durch Iteration berechnet
    let totalStudents = 0;      // Gesamtzahl aller Schüler
    let totalGrades = 0;        // Gesamtzahl aller Noten
    let allAverages = [];       // Array mit allen Schüler-Durchschnitten

    // Durch alle Klassen iterieren
    appData.classes.forEach(cls => {
        // Durch alle Jahre der Klasse iterieren
        if (cls.years) {
            cls.years.forEach(year => {
                // Schüleranzahl addieren
                if (year.students) {
                    totalStudents += year.students.length;

                    // Durch alle Schüler des Jahres iterieren
                    year.students.forEach(student => {
                        // Nur numerische Noten zählen (keine +/-)
                        const numericGrades = student.grades.filter(g => !g.isPlusMinus);
                        totalGrades += numericGrades.length;

                        // Wenn der Schüler Noten hat, Durchschnitt berechnen
                        // some() prüft ob mindestens ein Element die Bedingung erfüllt
                        if (numericGrades.length > 0 || student.grades.some(g => g.isPlusMinus)) {
                            const avg = calculateWeightedAverage(student.grades);
                            // Nur gültige Durchschnitte (> 0) speichern
                            if (avg > 0) allAverages.push(avg);
                        }
                    });
                }
            });
        }
    });

    // GESAMTDURCHSCHNITT BERECHNEN
    // Durchschnitt aller Schüler-Durchschnitte
    const overallAverage = allAverages.length > 0
        // Summe aller Durchschnitte / Anzahl der Durchschnitte
        // toFixed(2) formatiert auf 2 Nachkommastellen
        ? (allAverages.reduce((a, b) => a + b, 0) / allAverages.length).toFixed(2)
        : "-"; // Wenn keine Durchschnitte vorhanden, "-" anzeigen

    // Update stats
    document.getElementById("stat-total-classes").textContent = totalClasses;
    document.getElementById("stat-total-students").textContent = totalStudents;
    document.getElementById("stat-overall-average").textContent = overallAverage;
    document.getElementById("stat-total-grades").textContent = totalGrades;

    // Render class overview
    const overviewList = document.getElementById("class-overview-list");
    if (appData.classes.length === 0) {
        overviewList.innerHTML = `<p class="text-sm" style="color: oklch(.708 0 0);">${t("home.noClasses")}</p>`;
        return;
    }

    overviewList.innerHTML = appData.classes.map(cls => {
        let studentCount = 0;
        let classAverage = "-";
        const classAverages = [];

        // Durch alle Jahre iterieren
        if (cls.years) {
            cls.years.forEach(year => {
                if (year.students) {
                    studentCount += year.students.length;

                    year.students.forEach(student => {
                        const avg = calculateWeightedAverage(student.grades);
                        if (avg > 0) classAverages.push(avg);
                    });
                }
            });
        }

        if (classAverages.length > 0) {
            classAverage = (classAverages.reduce((a, b) => a + b, 0) / classAverages.length).toFixed(2);
        }

        return `
            <div class="flex items-center justify-between p-3 border rounded cursor-pointer" data-goto-class="${safeAttr(cls.id)}">
                <div>
                    <h3 class="font-semibold">${escapeHtml(cls.name)}</h3>
                    <p class="text-sm" style="color: oklch(.708 0 0);">${t("home.studentCount", { count: studentCount })}</p>
                </div>
                <div class="text-right">
                    <p class="text-lg font-bold">${escapeHtml(classAverage)}</p>
                    <p class="text-sm" style="color: oklch(.708 0 0);">${t("home.average")}</p>
                </div>
            </div>
        `;
    }).join("");

    // Add click handlers to go to class
    document.querySelectorAll("[data-goto-class]").forEach(el => {
        el.addEventListener("click", () => {
            const classId = el.dataset.gotoClass;
            appData.currentClassId = classId;
            saveData();
            showClassView();
        });
    });
};

// Show Home View
const showHomeView = () => {
    const homeView = document.getElementById("home-view");
    const classView = document.getElementById("class-view");
    const studentDetailView = document.getElementById("student-detail-view");

    // Destroy chart instance if exists
    if (window.studentGradeChartInstance) {
        window.studentGradeChartInstance.destroy();
        window.studentGradeChartInstance = null;
    }

    // Find which view is currently visible
    let viewToHide = null;
    if (!classView.classList.contains("hidden")) {
        viewToHide = classView;
    } else if (studentDetailView && !studentDetailView.classList.contains("hidden")) {
        viewToHide = studentDetailView;
    }

    // Animation triggern
    if (viewToHide) {
        // View ausblenden mit Animation
        viewToHide.style.animation = 'viewFadeOut 0.15s ease-in forwards';
        setTimeout(() => {
            viewToHide.classList.add("hidden");
            viewToHide.style.animation = '';

            // Home View einblenden
            homeView.classList.remove("hidden");
            homeView.style.animation = 'none';
            homeView.offsetHeight; // Force reflow
            homeView.style.animation = 'viewFadeIn 0.25s ease-out';

            renderHome();
        }, 150);
    } else {
        homeView.classList.remove("hidden");
        renderHome();
    }

    document.getElementById("nav-home").classList.add("btn-primary");
    document.getElementById("nav-home").classList.remove("btn-secondary");

    // Reset class buttons in sidebar to inactive
    document.querySelectorAll("[data-class-id]").forEach(btn => {
        btn.classList.remove("btn-primary");
        btn.classList.add("btn-secondary");
    });
};

// Show Class View
const showClassView = () => {
    const homeView = document.getElementById("home-view");
    const classView = document.getElementById("class-view");
    const studentDetailView = document.getElementById("student-detail-view");

    // Destroy chart instance if exists
    if (window.studentGradeChartInstance) {
        window.studentGradeChartInstance.destroy();
        window.studentGradeChartInstance = null;
    }

    // Find which view is currently visible
    let viewToHide = null;
    if (!homeView.classList.contains("hidden")) {
        viewToHide = homeView;
    } else if (studentDetailView && !studentDetailView.classList.contains("hidden")) {
        viewToHide = studentDetailView;
    }

    // Animation triggern
    if (viewToHide) {
        // View ausblenden mit Animation
        viewToHide.style.animation = 'viewFadeOut 0.15s ease-in forwards';
        setTimeout(() => {
            viewToHide.classList.add("hidden");
            viewToHide.style.animation = '';

            // Class View einblenden
            classView.classList.remove("hidden");
            classView.style.animation = 'none';
            classView.offsetHeight; // Force reflow
            classView.style.animation = 'viewFadeIn 0.25s ease-out';

            const currentClass = appData.classes.find(c => c.id === appData.currentClassId);
            if (currentClass) {
                document.getElementById("current-class-name").textContent = currentClass.name;
            }

            renderClassList();
            renderYearSelector();
            renderSubjectTabs();
            renderClassStats();
            renderStudents();
            renderCategoryFilter();
        }, 150);
    } else {
        classView.classList.remove("hidden");

        const currentClass = appData.classes.find(c => c.id === appData.currentClassId);
        if (currentClass) {
            document.getElementById("current-class-name").textContent = currentClass.name;
        }

        renderClassList();
        renderYearSelector();
        renderSubjectTabs();
        renderClassStats();
        renderStudents();
        renderCategoryFilter();
    }

    document.getElementById("nav-home").classList.remove("btn-primary");
    document.getElementById("nav-home").classList.add("btn-secondary");
};

// ========== STUDENT DETAIL VIEW FUNCTIONS ==========

// Store the Chart.js instance for cleanup (global so PDF export can access it)
window.window.studentGradeChartInstance = null;

/**
 * SHOW STUDENT DETAIL VIEW
 *
 * Navigates to the student detail view with animation.
 *
 * @param {string} studentId - The ID of the student to display
 */
const showStudentDetailView = (studentId) => {
    const classView = document.getElementById("class-view");
    const homeView = document.getElementById("home-view");
    const studentDetailView = document.getElementById("student-detail-view");

    // Hide other views with animation
    const viewToHide = !classView.classList.contains("hidden") ? classView : homeView;

    viewToHide.style.animation = 'viewFadeOut 0.15s ease-in forwards';
    setTimeout(() => {
        viewToHide.classList.add("hidden");
        viewToHide.style.animation = '';

        // Show student detail view
        studentDetailView.classList.remove("hidden");
        studentDetailView.style.animation = 'none';
        studentDetailView.offsetHeight; // Force reflow
        studentDetailView.style.animation = 'viewFadeIn 0.25s ease-out';

        // Render the student details
        renderStudentDetail(studentId);
    }, 150);
};

/**
 * BACK TO CLASS VIEW
 *
 * Returns from student detail view to class view with animation.
 */
const backToClassView = () => {
    const classView = document.getElementById("class-view");
    const studentDetailView = document.getElementById("student-detail-view");

    // Destroy chart instance if exists
    if (window.studentGradeChartInstance) {
        window.studentGradeChartInstance.destroy();
        window.studentGradeChartInstance = null;
    }

    studentDetailView.style.animation = 'viewFadeOut 0.15s ease-in forwards';
    setTimeout(() => {
        studentDetailView.classList.add("hidden");
        studentDetailView.style.animation = '';

        classView.classList.remove("hidden");
        classView.style.animation = 'none';
        classView.offsetHeight; // Force reflow
        classView.style.animation = 'viewFadeIn 0.25s ease-out';

        renderSubjectTabs();
        renderStudents();
    }, 150);
};

/**
 * CALCULATE TREND
 *
 * Calculates whether the student's grades are improving, declining, or stable.
 * Compares the average of the first half to the second half of grades.
 *
 * @param {Array} grades - Array of grade objects sorted by date
 * @returns {object} - { trend: 'improving' | 'declining' | 'stable', value: number }
 */
const calculateTrend = (grades) => {
    // Filter numeric grades and sort by date
    const numericGrades = grades
        .filter(g => !g.isPlusMinus)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    if (numericGrades.length < 2) {
        return { trend: 'stable', value: 0 };
    }

    const midPoint = Math.floor(numericGrades.length / 2);
    const firstHalf = numericGrades.slice(0, midPoint);
    const secondHalf = numericGrades.slice(midPoint);

    const firstAvg = firstHalf.reduce((sum, g) => sum + g.value, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, g) => sum + g.value, 0) / secondHalf.length;

    const diff = firstAvg - secondAvg; // Positive = improving (lower grades are better)

    if (Math.abs(diff) < 0.3) {
        return { trend: 'stable', value: diff };
    } else if (diff > 0) {
        return { trend: 'improving', value: diff };
    } else {
        return { trend: 'declining', value: diff };
    }
};

/**
 * CALCULATE CLASS AVERAGE
 *
 * Calculates the weighted average of all students in the current class.
 *
 * @returns {number} - Class average or 0 if no grades
 */
const calculateClassAverage = () => {
    const currentYear = getCurrentYear();
    if (!currentYear) return 0;

    const averages = [];
    currentYear.students.forEach(student => {
        const filteredGrades = filterGradesBySubject(student.grades, currentYear.currentSubjectId);
        const avg = calculateWeightedAverage(filteredGrades);
        if (avg > 0) averages.push(avg);
    });

    if (averages.length === 0) return 0;
    return averages.reduce((sum, avg) => sum + avg, 0) / averages.length;
};

/**
 * RENDER STUDENT DETAIL
 *
 * Main render function for the student detail view.
 * Populates all statistics, chart, category breakdown, and grades table.
 *
 * @param {string} studentId - The ID of the student to display
 */
const renderStudentDetail = (studentId) => {
    const currentYear = getCurrentYear();
    if (!currentYear) return;

    const student = currentYear.students.find(s => s.id === studentId);
    if (!student) return;

    // Store student ID for reference
    document.getElementById("student-detail-view").dataset.studentId = studentId;

    // Set student name
    document.getElementById("student-detail-name").textContent = getStudentDisplayName(student);

    // Noten nach aktivem Fach filtern
    const filteredGrades = filterGradesBySubject(student.grades, currentYear.currentSubjectId);

    // Calculate statistics with filtered grades
    const weightedAvg = calculateWeightedAverage(filteredGrades);
    const finalGrade = calculateFinalGrade(weightedAvg);
    const trend = calculateTrend(filteredGrades);
    const classAvg = calculateClassAverage();
    const numericGradeCount = filteredGrades.filter(g => !g.isPlusMinus).length;

    // Populate stat cards
    document.getElementById("student-stat-average").textContent =
        weightedAvg ? weightedAvg.toFixed(2) : "-";

    // Add percentage badge for average
    const averagePercentEl = document.getElementById("student-stat-average-percent");
    if (weightedAvg && weightedAvg > 0) {
        const percentage = Math.round(((6 - weightedAvg) / 5) * 100);

        // Determine badge color based on percentage
        let badgeClass = 'badge-secondary';
        if (percentage >= 80) {
            badgeClass = 'grade-badge grade-1';
        } else if (percentage >= 60) {
            badgeClass = 'grade-badge grade-2';
        } else if (percentage >= 40) {
            badgeClass = 'grade-badge grade-3';
        } else if (percentage >= 20) {
            badgeClass = 'grade-badge grade-4';
        } else {
            badgeClass = 'grade-badge grade-5';
        }

        averagePercentEl.innerHTML = `<span class="badge ${badgeClass} text-xs">${percentage}%</span>`;
    } else {
        averagePercentEl.innerHTML = '';
    }

    document.getElementById("student-stat-final").textContent = finalGrade;
    document.getElementById("student-stat-count").textContent = filteredGrades.length;

    // Trend display with icon
    const trendEl = document.getElementById("student-stat-trend");
    if (trend.trend === 'improving') {
        trendEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-500"><path d="m18 15-6-6-6 6"/></svg><span class="text-green-500">${t("student.improving")}</span>`;
    } else if (trend.trend === 'declining') {
        trendEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-500"><path d="m6 9 6 6 6-6"/></svg><span class="text-red-500">${t("student.declining")}</span>`;
    } else {
        trendEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-yellow-500"><path d="M5 12h14"/></svg><span class="text-yellow-500">${t("student.stable")}</span>`;
    }

    // Class comparison
    const comparisonEl = document.getElementById("student-stat-comparison");
    if (weightedAvg && classAvg) {
        const diff = classAvg - weightedAvg; // Positive = better than class (lower is better)
        if (Math.abs(diff) < 0.1) {
            comparisonEl.innerHTML = `<span class="text-yellow-500">=</span>`;
        } else if (diff > 0) {
            comparisonEl.innerHTML = `<span class="text-green-500">+${diff.toFixed(1)}</span>`;
        } else {
            comparisonEl.innerHTML = `<span class="text-red-500">${diff.toFixed(1)}</span>`;
        }
    } else {
        comparisonEl.textContent = "-";
    }

    // Render chart, category breakdown, and grades table with filtered grades
    const filteredStudent = { ...student, grades: filteredGrades };
    renderStudentGradeChart(filteredStudent);
    renderCategoryBreakdown(filteredStudent);
    renderStudentGradesTable(student, filteredGrades);

    // Setup grade search functionality
    setupGradeSearch(student, filteredGrades);

    // Add Grade button in student detail header
    const addGradeBtn = document.getElementById("student-detail-add-grade");
    addGradeBtn.onclick = () => {
        openAddGradeDialog(studentId, () => renderStudentDetail(studentId));
    };

    // Print button in student detail header
    const printBtn = document.getElementById("student-detail-print");
    if (printBtn) {
        printBtn.onclick = () => exportStudentDetailPDF(studentId);
    }
};

/**
 * RENDER STUDENT GRADE CHART
 *
 * Creates a Chart.js line chart showing grades over time, grouped by category.
 *
 * @param {object} student - The student object
 */
const renderStudentGradeChart = (student) => {
    const ctx = document.getElementById("student-grade-chart").getContext("2d");

    // Destroy existing chart if any
    if (window.studentGradeChartInstance) {
        window.studentGradeChartInstance.destroy();
    }

    // Group grades by category
    const gradesByCategory = {};
    const categoryColors = [
        { bg: 'rgba(59, 130, 246, 0.2)', border: 'rgb(59, 130, 246)' },   // Blue
        { bg: 'rgba(34, 197, 94, 0.2)', border: 'rgb(34, 197, 94)' },     // Green
        { bg: 'rgba(249, 115, 22, 0.2)', border: 'rgb(249, 115, 22)' },   // Orange
        { bg: 'rgba(168, 85, 247, 0.2)', border: 'rgb(168, 85, 247)' },   // Purple
        { bg: 'rgba(236, 72, 153, 0.2)', border: 'rgb(236, 72, 153)' },   // Pink
        { bg: 'rgba(234, 179, 8, 0.2)', border: 'rgb(234, 179, 8)' },     // Yellow
    ];

    // Include all grades (numeric and +/~/-)
    student.grades.forEach(grade => {
        const catName = grade.categoryName || 'Unknown';
        if (!gradesByCategory[catName]) {
            gradesByCategory[catName] = [];
        }

        let yValue;
        let displayLabel;
        if (grade.isPlusMinus) {
            // For chart visualization: fixed Y-values for better readability
            if (grade.value === '+') {
                yValue = 1.5;  // Display near "Very Good"
                displayLabel = '+';
            } else if (grade.value === '~') {
                yValue = 3;    // Display at "Satisfactory"
                displayLabel = '~';
            } else {
                yValue = 4.5;  // Display near "Sufficient"
                displayLabel = '-';
            }
        } else {
            yValue = grade.value;
            displayLabel = null;
        }

        gradesByCategory[catName].push({
            x: grade.createdAt || Date.now(),
            y: yValue,
            name: grade.name || '',
            plusMinusLabel: displayLabel
        });
    });

    // Sort each category's grades by date
    Object.values(gradesByCategory).forEach(grades => {
        grades.sort((a, b) => a.x - b.x);
    });

    // Create datasets
    const datasets = Object.entries(gradesByCategory).map(([categoryName, grades], index) => {
        const colorIndex = index % categoryColors.length;
        return {
            label: categoryName,
            data: grades,
            borderColor: categoryColors[colorIndex].border,
            backgroundColor: categoryColors[colorIndex].bg,
            borderWidth: 2,
            tension: 0.3,
            pointRadius: grades.map(g => g.plusMinusLabel ? 7 : 5),
            pointHoverRadius: grades.map(g => g.plusMinusLabel ? 9 : 7),
            pointStyle: grades.map(g => {
                if (g.plusMinusLabel === '+') return 'triangle';
                if (g.plusMinusLabel === '~') return 'rectRot';
                if (g.plusMinusLabel === '-') return 'crossRot';
                return 'circle';
            }),
            fill: false
        };
    });

    // If no data, show empty state
    if (datasets.length === 0) {
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#6b7280';
        ctx.fillText(t("student.noGrades"), ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    window.studentGradeChartInstance = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day',
                        displayFormats: {
                            day: 'dd.MM.yy'
                        }
                    },
                    title: {
                        display: true,
                        text: t("chart.date")
                    }
                },
                y: {
                    reverse: true, // Grade 1 at top
                    min: 1,
                    max: 5,
                    title: {
                        display: true,
                        text: t("chart.grade")
                    },
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const point = context.raw;
                            const valueDisplay = point.plusMinusLabel || point.y;
                            let label = `${context.dataset.label}: ${valueDisplay}`;
                            if (point.name) {
                                label += ` (${point.name})`;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
};

/**
 * RENDER CATEGORY BREAKDOWN
 *
 * Shows statistics for each category the student has grades in.
 *
 * @param {object} student - The student object
 */
const renderCategoryBreakdown = (student) => {
    const container = document.getElementById("category-breakdown");

    // Group grades by category
    const gradesByCategory = {};
    student.grades.forEach(grade => {
        const catId = grade.categoryId;
        if (!gradesByCategory[catId]) {
            gradesByCategory[catId] = {
                name: grade.categoryName,
                weight: grade.weight,
                grades: []
            };
        }
        gradesByCategory[catId].grades.push(grade);
    });

    if (Object.keys(gradesByCategory).length === 0) {
        container.innerHTML = `<p class="text-sm" style="color: oklch(.708 0 0);">${t("student.noGrades")}</p>`;
        return;
    }

    container.innerHTML = Object.entries(gradesByCategory).map(([catId, category]) => {
        const numericGrades = category.grades.filter(g => !g.isPlusMinus);
        const plusMinusGrades = category.grades.filter(g => g.isPlusMinus);

        let avgText = '-';
        let gradeInfo = '';
        let percentageBadge = '';

        if (numericGrades.length > 0) {
            const avg = numericGrades.reduce((sum, g) => sum + g.value, 0) / numericGrades.length;
            avgText = avg.toFixed(2);
            gradeInfo = `${numericGrades.length} grade${numericGrades.length !== 1 ? 's' : ''}`;

            // Calculate percentage: Grade 1 = 100%, Grade 6 = 0%
            const percentage = Math.round(((6 - avg) / 5) * 100);

            // Determine badge color based on percentage
            let badgeClass = 'badge-secondary';
            if (percentage >= 80) {
                badgeClass = 'grade-badge grade-1'; // Very good (green-ish)
            } else if (percentage >= 60) {
                badgeClass = 'grade-badge grade-2'; // Good
            } else if (percentage >= 40) {
                badgeClass = 'grade-badge grade-3'; // Satisfactory
            } else if (percentage >= 20) {
                badgeClass = 'grade-badge grade-4'; // Sufficient
            } else {
                badgeClass = 'grade-badge grade-5'; // Insufficient
            }

            percentageBadge = `<span class="badge ${badgeClass} text-xs">${percentage}%</span>`;
        }

        if (plusMinusGrades.length > 0) {
            const plusCount = plusMinusGrades.filter(g => g.value === '+').length;
            const neutralCount = plusMinusGrades.filter(g => g.value === '~').length;
            const minusCount = plusMinusGrades.filter(g => g.value === '-').length;
            if (gradeInfo) gradeInfo += ', ';
            gradeInfo += `${plusCount}+ / ${neutralCount}~ / ${minusCount}-`;

            // If this category has ONLY +/~/- grades (no numeric grades), show the tendency
            if (numericGrades.length === 0) {
                // Determine the dominant tendency
                if (plusCount > minusCount) {
                    avgText = '+';
                    percentageBadge = '<span class="badge grade-badge grade-1 text-xs">+</span>';
                } else if (minusCount > plusCount) {
                    avgText = '-';
                    percentageBadge = '<span class="badge grade-badge grade-5 text-xs">-</span>';
                } else {
                    // Equal or neutral dominates
                    avgText = '~';
                    percentageBadge = '<span class="badge grade-badge grade-3 text-xs">~</span>';
                }
            }
        }

        return `
            <div class="category-stat-card p-3 rounded-lg border">
                <div class="flex justify-between items-start mb-2">
                    <span class="font-medium">${escapeHtml(category.name)}</span>
                    <div class="flex gap-2">
                        ${percentageBadge}
                        <span class="badge badge-secondary text-xs">${(category.weight * 100).toFixed(0)}%</span>
                    </div>
                </div>
                <p class="text-2xl font-bold">${avgText}</p>
                <p class="text-xs" style="color: oklch(.708 0 0);">${gradeInfo}</p>
            </div>
        `;
    }).join('');
};

/**
 * RENDER STUDENT GRADES TABLE
 *
 * Shows a chronological list of all grades with details.
 *
 * @param {object} student - The student object
 */
const renderStudentGradesTable = (student, filteredGrades = null) => {
    const tbody = document.getElementById("student-grades-table");

    // Sort grades by date (newest first), use filtered grades if provided
    const gradesToShow = filteredGrades || student.grades;
    const sortedGrades = [...gradesToShow].sort((a, b) =>
        (b.createdAt || 0) - (a.createdAt || 0)
    );

    if (sortedGrades.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color: oklch(.708 0 0);">${t("student.noGrades")}</td></tr>`;
        return;
    }

    tbody.innerHTML = sortedGrades.map(grade => {
        const date = grade.createdAt
            ? new Date(grade.createdAt).toLocaleDateString('de-AT', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            })
            : '-';

        // Handle pending grades
        let displayValue, gradeColorClass, weightDisplay;
        if (grade.isPending) {
            displayValue = t("grade.pendingValue");
            gradeColorClass = "badge-warning";
            weightDisplay = '-';
        } else {
            displayValue = grade.isPlusMinus ? grade.value : grade.value.toString();
            gradeColorClass = getGradeColorClass(grade);
            weightDisplay = grade.isPlusMinus ? '-' : `${(grade.weight * 100).toFixed(0)}%`;
        }

        // Visual indication for grades excluded from average
        const excludedClass = grade.excludeFromAverage ? 'opacity-50' : '';
        const excludedBadge = grade.excludeFromAverage
            ? `<span class="badge badge-secondary text-xs ml-1" data-tooltip="${t("grade.excludedFromAverage")}" data-side="top">⊘</span>`
            : '';

        // Visual indication for pending grades
        const pendingClass = grade.isPending ? 'pending-grade' : '';
        const pendingBadge = grade.isPending
            ? `<span class="badge badge-warning text-xs ml-1" data-tooltip="${t("grade.pendingTooltip")}" data-side="top" style="display: inline-flex; align-items: center; gap: 0.25rem;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock-alert-icon lucide-clock-alert">
                  <path d="M12 6v6l4 2"/>
                  <path d="M20 12v5"/>
                  <path d="M20 21h.01"/>
                  <path d="M21.25 8.2A10 10 0 1 0 16 21.16"/>
                </svg>
              </span>`
            : '';

        return `
            <tr class="${excludedClass} ${pendingClass}">
                <td>${escapeHtml(date)}</td>
                <td>${escapeHtml(grade.categoryName || '-')}</td>
                <td>${escapeHtml(grade.name || '-')}${excludedBadge}${pendingBadge}</td>
                <td><span class="badge ${gradeColorClass}">${escapeHtml(displayValue)}</span></td>
                <td>${weightDisplay}</td>
                <td>
                    <div role="group" class="button-group">
                        <button class="btn-icon btn-secondary" data-edit-grade="${safeAttr(grade.id)}" data-tooltip="${t("grade.editTooltip")}" data-side="top">
                            <svg class="lucide lucide-edit" viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.5 5.5l-4 4L17 11.5 21 7.5z" />
                            </svg>
                        </button>
                        <button class="btn-icon btn-destructive" data-delete-grade="${safeAttr(grade.id)}" data-tooltip="${t("grade.deleteTooltip")}" data-side="top">
                            <svg class="lucide lucide-trash-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6h18" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Add event listeners for edit grade buttons
    document.querySelectorAll("#student-grades-table [data-edit-grade]").forEach(btn => {
        btn.addEventListener("click", () => {
            const gradeId = btn.dataset.editGrade;
            const grade = student.grades.find(g => g.id === gradeId);
            if (grade) {
                const isPlusMinus = grade.isPlusMinus;
                const wasEnteredAsPercent = grade.enteredAsPercent === true;

                let valueInput;
                // For pending grades, show empty input
                if (grade.isPending) {
                    valueInput = `
                        <input type="number" name="value" step="0.1" min="1" max="6" class="input w-full" id="grade-value-input-edit" placeholder="1-6">
                        <p class="text-sm mt-2" style="color: oklch(.708 0 0);">${t("grade.enterGrade")}</p>
                    `;
                } else if (isPlusMinus) {
                    valueInput = `
                        <select name="value" class="select w-full" required>
                            <option value="+" ${grade.value === '+' ? 'selected' : ''}>${t("grade.plus")}</option>
                            <option value="~" ${grade.value === '~' ? 'selected' : ''}>${t("grade.neutral")}</option>
                            <option value="-" ${grade.value === '-' ? 'selected' : ''}>${t("grade.minus")}</option>
                        </select>
                    `;
                } else {
                    // Always show tabs with percentage option for numeric grades
                    // Calculate initial percentage value
                    const initialPercent = wasEnteredAsPercent ? grade.percentValue : gradeToPercent(grade.value);
                    // Determine which tab should be selected initially
                    const gradeSelected = !wasEnteredAsPercent;
                    const percentSelected = wasEnteredAsPercent;

                    valueInput = `
                        <div class="tabs w-full" id="grade-input-tabs-edit">
                          <nav role="tablist" aria-orientation="horizontal" class="w-full">
                            <button type="button" role="tab" id="tab-grade-direct-edit" aria-controls="panel-grade-direct-edit" aria-selected="${gradeSelected}" tabindex="0">${t("grade.gradeTab")}</button>
                            <button type="button" role="tab" id="tab-grade-percent-edit" aria-controls="panel-grade-percent-edit" aria-selected="${percentSelected}" tabindex="0">${t("grade.percentageTab")}</button>
                          </nav>
                          <div role="tabpanel" id="panel-grade-direct-edit" aria-labelledby="tab-grade-direct-edit" tabindex="-1" aria-selected="${gradeSelected}" ${gradeSelected ? '' : 'hidden'}>
                            <div class="pt-3">
                              <input type="number" name="value" step="0.1" min="1" max="6" class="input w-full" id="grade-value-input-edit" value="${escapeHtml(grade.value || '')}" placeholder="1-6">
                              <p class="text-sm mt-2" style="color: oklch(.708 0 0);">${t("grade.enterGrade")}</p>
                            </div>
                          </div>
                          <div role="tabpanel" id="panel-grade-percent-edit" aria-labelledby="tab-grade-percent-edit" tabindex="-1" aria-selected="${percentSelected}" ${percentSelected ? '' : 'hidden'}>
                            <div class="pt-3">
                              <div class="flex items-center gap-2">
                                <input type="number" id="grade-percent-input-edit" step="0.1" min="0" max="100" class="input flex-1" value="${escapeHtml(initialPercent || '')}" placeholder="0-100">
                                <span>%</span>
                              </div>
                              <p class="text-sm mt-2" style="color: oklch(.708 0 0);">${t("grade.enterPercentage")}</p>
                              <p class="text-sm mt-1 font-semibold" id="percent-preview-edit"></p>
                            </div>
                          </div>
                        </div>
                    `;
                }

                // Convert timestamp to date string (YYYY-MM-DD)
                const gradeDate = grade.createdAt ? new Date(grade.createdAt) : new Date();
                const gradeDateStr = gradeDate.toISOString().split('T')[0];

                // Get student name for display
                const studentDisplayName = getStudentDisplayName(student);

                // Create category dropdown with current category selected
                const categoryOptions = appData.categories.map(cat => {
                    const label = cat.onlyPlusMinus ? ' [+/~/- only]' : (cat.allowPlusMinus ? ' [+/~/-]' : '');
                    const selected = cat.id === grade.categoryId ? 'selected' : '';
                    return `<option value="${safeAttr(cat.id)}" ${selected}>${escapeHtml(cat.name)} (${(cat.weight * 100).toFixed(0)}%)${label}</option>`;
                }).join("");

                const content = `
                    <div class="mb-3 p-3 rounded-lg bg-primary/10">
                        <p class="text-sm font-medium">${escapeHtml(studentDisplayName)}</p>
                    </div>
                    <div class="grid gap-2">
                        <label class="block mb-2">${t("grade.gradeDate")}</label>
                        <input type="date" name="gradeDate" class="input w-full" value="${gradeDateStr}" required>
                        <p class="text-sm" style="color: oklch(.708 0 0);">${t("grade.gradeDateHint")}</p>
                    </div>
                    <div class="grid gap-2">
                        <label class="block mb-2">${t("grade.gradeName")}</label>
                        <input type="text" name="name" class="input w-full" value="${escapeHtml(grade.name || '')}" maxlength="100">
                    </div>
                    <div class="grid gap-2">
                        <label class="block mb-2">${t("grade.category")}</label>
                        <select name="categoryId" class="select w-full" required>
                            ${categoryOptions}
                        </select>
                        <p class="text-sm" style="color: oklch(.708 0 0);">${t("grade.categoryHint")}</p>
                    </div>
                    <div class="grid gap-2">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" name="includeInAverage" class="checkbox" ${!grade.excludeFromAverage ? 'checked' : ''}>
                            <span class="text-sm">${t("grade.includeInAverage")}</span>
                        </label>
                    </div>
                    <div class="grid gap-2 mb-3">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" name="isPending" id="grade-is-pending-edit" class="checkbox" ${grade.isPending ? 'checked' : ''}>
                            <span>${t("grade.pendingGrade")}</span>
                        </label>
                        <p class="text-sm" style="color: oklch(.708 0 0);">${t("grade.pendingGradeHint")}</p>
                    </div>
                    <div class="grid gap-2" id="grade-value-container-edit">
                        <label class="block mb-2">${t("grade.gradeValue")}</label>
                        ${valueInput}
                    </div>
                `;

                showDialog("edit-dialog", t("grade.editGrade"), content, (formData) => {
                    const newName = formData.get("name");
                    const includeInAverage = formData.get("includeInAverage");
                    const isPendingChecked = formData.get("isPending") === "on";
                    let newValue = formData.get("value");
                    let enteredAsPercent = false;
                    let percentValue = null;

                    // If grade is pending, skip value validation
                    if (!isPendingChecked) {
                        // Check if percentage tab exists and is active (for numeric grades)
                        if (!isPlusMinus) {
                            const percentPanel = document.getElementById("panel-grade-percent-edit");
                            const percentInput = document.getElementById("grade-percent-input-edit");
                            const directGradeInput = document.getElementById("grade-value-input-edit");

                            // If percentage panel is visible and has a value, convert it
                            if (percentPanel && !percentPanel.hidden && percentInput && percentInput.value) {
                                percentValue = parseFloat(percentInput.value);
                                const convertedGrade = percentToGrade(percentValue);
                                if (convertedGrade !== null) {
                                    newValue = convertedGrade.toString();
                                    enteredAsPercent = true;
                                } else {
                                    showAlertDialog(t("error.invalidPercentage"));
                                    return;
                                }
                            } else if (percentPanel && !percentPanel.hidden && (!percentInput || !percentInput.value)) {
                                showAlertDialog(t("error.enterPercentage"));
                                return;
                            } else if (directGradeInput && directGradeInput.value) {
                                // User switched to grade tab
                                newValue = directGradeInput.value;
                                enteredAsPercent = false;
                            }
                        }

                        if (isPlusMinus) {
                            grade.value = newValue;
                        } else {
                            grade.value = parseFloat(newValue);
                        }
                    } else {
                        // For pending grades, set value to null
                        grade.value = null;
                    }

                    grade.name = newName;
                    grade.isPending = isPendingChecked;

                    // Update "include in average" setting
                    if (includeInAverage === "on") {
                        // Checkbox is checked - remove excludeFromAverage flag
                        delete grade.excludeFromAverage;
                    } else {
                        // Checkbox is not checked - set excludeFromAverage to true
                        grade.excludeFromAverage = true;
                    }

                    // Update percentage metadata
                    if (enteredAsPercent) {
                        grade.enteredAsPercent = true;
                        grade.percentValue = percentValue;
                    } else {
                        // Remove percentage metadata if user switched to direct grade input
                        delete grade.enteredAsPercent;
                        delete grade.percentValue;
                    }

                    // Update date if changed
                    const selectedDate = formData.get("gradeDate");
                    if (selectedDate) {
                        const dateParts = selectedDate.split('-');
                        const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], 12, 0, 0);
                        grade.createdAt = dateObj.getTime();
                    }

                    // Update category if changed
                    const newCategoryId = formData.get("categoryId");
                    if (newCategoryId && newCategoryId !== grade.categoryId) {
                        const newCategory = appData.categories.find(c => c.id === newCategoryId);
                        if (newCategory) {
                            grade.categoryId = newCategory.id;
                            grade.categoryName = newCategory.name;
                            grade.weight = newCategory.weight;
                        }
                    }

                    saveData(t("toast.gradeUpdated"), "success");
                    renderStudentDetail(student.id);
                });

                // Add percentage preview listener and tab functionality for edit dialog (for numeric grades)
                if (!isPlusMinus) {
                    setTimeout(() => {
                        // Initialize tabs
                        initializeTabs("grade-input-tabs-edit");

                        const percentInput = document.getElementById("grade-percent-input-edit");
                        const percentPreview = document.getElementById("percent-preview-edit");
                        const gradeInput = document.getElementById("grade-value-input-edit");

                        if (percentInput && percentPreview) {
                            // Initial preview
                            const initialPercent = parseFloat(percentInput.value);
                            if (!isNaN(initialPercent) && initialPercent >= 0 && initialPercent <= 100) {
                                const gradeValue = percentToGrade(initialPercent);
                                percentPreview.textContent = t("grade.percentPreview", { grade: gradeValue });
                            }

                            // Update on input
                            percentInput.addEventListener("input", () => {
                                const percent = parseFloat(percentInput.value);
                                if (!isNaN(percent) && percent >= 0 && percent <= 100) {
                                    const gradeValue = percentToGrade(percent);
                                    percentPreview.textContent = t("grade.percentPreview", { grade: gradeValue });
                                } else {
                                    percentPreview.textContent = "";
                                }
                            });
                        }

                        // When switching from grade tab to percent tab, auto-fill percentage
                        const percentTab = document.getElementById("tab-grade-percent-edit");
                        if (percentTab && gradeInput && percentInput) {
                            percentTab.addEventListener("click", () => {
                                const currentGrade = parseFloat(gradeInput.value);
                                // Only auto-fill if percent input is empty
                                if (!percentInput.value && !isNaN(currentGrade) && currentGrade >= 1 && currentGrade <= 6) {
                                    const calculatedPercent = gradeToPercent(currentGrade);
                                    if (calculatedPercent !== null) {
                                        percentInput.value = calculatedPercent;
                                        // Trigger preview update
                                        const gradeValue = percentToGrade(calculatedPercent);
                                        if (percentPreview) {
                                            percentPreview.textContent = t("grade.percentPreview", { grade: gradeValue });
                                        }
                                    }
                                }
                            });
                        }

                        // When switching from percent tab to grade tab, optionally update grade
                        const gradeTab = document.getElementById("tab-grade-direct-edit");
                        if (gradeTab && gradeInput && percentInput) {
                            gradeTab.addEventListener("click", () => {
                                const currentPercent = parseFloat(percentInput.value);
                                // Only auto-fill if grade input is empty and we have a valid percent
                                if (!gradeInput.value && !isNaN(currentPercent) && currentPercent >= 0 && currentPercent <= 100) {
                                    const calculatedGrade = percentToGrade(currentPercent);
                                    if (calculatedGrade !== null) {
                                        gradeInput.value = calculatedGrade;
                                    }
                                }
                            });
                        }
                    }, 0);
                }

                // Add event listener for pending grade checkbox in edit dialog
                setTimeout(() => {
                    const pendingCheckboxEdit = document.getElementById("grade-is-pending-edit");
                    const gradeValueContainerEdit = document.getElementById("grade-value-container-edit");

                    if (pendingCheckboxEdit && gradeValueContainerEdit) {
                        const toggleGradeInputsEdit = () => {
                            const isPending = pendingCheckboxEdit.checked;
                            gradeValueContainerEdit.style.opacity = isPending ? "0.5" : "1";
                            gradeValueContainerEdit.style.pointerEvents = isPending ? "none" : "auto";

                            // Disable/enable all inputs in the container
                            gradeValueContainerEdit.querySelectorAll("input, select, button").forEach(el => {
                                el.disabled = isPending;
                            });
                        };

                        pendingCheckboxEdit.addEventListener("change", toggleGradeInputsEdit);
                        // Initialize state if already pending
                        if (pendingCheckboxEdit.checked) {
                            toggleGradeInputsEdit();
                        }
                    }
                }, 0);
            }
        });
    });

    // Add event listeners for delete grade buttons
    document.querySelectorAll("#student-grades-table [data-delete-grade]").forEach(btn => {
        btn.addEventListener("click", () => {
            const gradeId = btn.dataset.deleteGrade;
            showConfirmDialog(t("confirm.deleteGrade"), () => {
                const gradeIndex = student.grades.findIndex(g => g.id === gradeId);
                if (gradeIndex !== -1) {
                    student.grades.splice(gradeIndex, 1);
                    saveData(t("toast.gradeDeleted"), "success");
                    renderStudentDetail(student.id);
                }
            });
        });
    });
};

/**
 * SETUP GRADE SEARCH
 *
 * Sets up the search functionality for filtering grades in the student detail view.
 * The search filters by date, category name, grade name, and grade value.
 *
 * @param {object} student - The student object with all grades
 * @param {Array} filteredGrades - The grades filtered by subject
 */
const setupGradeSearch = (student, filteredGrades) => {
    const searchInput = document.getElementById("student-grades-search");
    if (!searchInput) return;

    // Store the original filtered grades for searching
    searchInput.dataset.allGrades = JSON.stringify(filteredGrades);

    // Remove any existing event listener by cloning the element
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);

    // Add input event listener for search
    newSearchInput.addEventListener("input", (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        const allGrades = JSON.parse(newSearchInput.dataset.allGrades || "[]");

        if (!searchTerm) {
            // If search is empty, show all filtered grades
            renderStudentGradesTable(student, allGrades);
            return;
        }

        // Filter grades based on search term
        const searchedGrades = allGrades.filter(grade => {
            // Format date for searching
            const date = grade.createdAt
                ? new Date(grade.createdAt).toLocaleDateString('de-AT', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                })
                : '';

            // Get grade value as string
            const displayValue = grade.isPlusMinus
                ? grade.value.toString()
                : grade.value.toString();

            // Search in: date, category name, grade name, grade value
            return date.toLowerCase().includes(searchTerm) ||
                   (grade.categoryName || '').toLowerCase().includes(searchTerm) ||
                   (grade.name || '').toLowerCase().includes(searchTerm) ||
                   displayValue.toLowerCase().includes(searchTerm);
        });

        renderStudentGradesTable(student, searchedGrades);
    });

    // Clear search when view changes
    newSearchInput.value = '';
};
