// ========== EVENT LISTENER ==========
document.getElementById("setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const classNameInput = document.getElementById("class-name").value;

    // Validate class name
    const classValidation = validateStringInput(classNameInput, 50);
    if (!classValidation.isValid) {
        showAlertDialog(classValidation.error);
        return;
    }

    // Use username as default teacher name
    appData.teacherName = window.currentUser.username;
    addClass(classValidation.value);

    // Save data and reload page
    try {
        await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appData)
        });
        location.reload();
    } catch (error) {
        console.error('Error saving setup data:', error);
        showAlertDialog(t('error.savingData'));
    }
});

document.getElementById("add-class").addEventListener("click", () => {
    const dialog = document.getElementById("add-class-dialog");
    dialog.showModal();
});

// Event listener for add class form submission
document.getElementById("add-class-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const classNameInput = document.getElementById("class-name-input").value;

    // Validate class name
    const validation = validateStringInput(classNameInput, 50);
    if (!validation.isValid) {
        showAlertDialog(validation.error);
        return;
    }

    addClass(validation.value);
    document.getElementById("add-class-dialog").close();
    document.getElementById("class-name-input").value = ""; // Clear input
});

// Event listener for cancel button
document.getElementById("cancel-add-class").addEventListener("click", () => {
    document.getElementById("add-class-dialog").close();
    document.getElementById("class-name-input").value = ""; // Clear input
});

document.getElementById("add-student").addEventListener("click", () => {
    const dialog = document.getElementById("add-student-dialog");
    dialog.showModal();
});

// Event listener for add student form submission
document.getElementById("add-student-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const firstName = document.getElementById("student-firstname-input").value;
    const middleName = document.getElementById("student-middlename-input").value;
    const lastName = document.getElementById("student-lastname-input").value;

    addStudent(firstName, lastName, middleName);
    document.getElementById("add-student-dialog").close();
    document.getElementById("student-firstname-input").value = "";
    document.getElementById("student-middlename-input").value = "";
    document.getElementById("student-lastname-input").value = "";
});

// Event listener for cancel button
document.getElementById("cancel-add-student").addEventListener("click", () => {
    document.getElementById("add-student-dialog").close();
    document.getElementById("student-firstname-input").value = "";
    document.getElementById("student-middlename-input").value = "";
    document.getElementById("student-lastname-input").value = "";
});

// ============ IMPORT STUDENTS ============

let parsedStudentsToImport = [];

const resetImportStudentsDialog = () => {
    document.getElementById("import-students-file").value = "";
    document.getElementById("import-students-preview").classList.add("hidden");
    document.getElementById("import-students-table").innerHTML = "";
    document.getElementById("confirm-import-students").disabled = true;
    parsedStudentsToImport = [];
};

const detectColumnType = (header) => {
    const h = header.toLowerCase().trim();
    if (['nachname', 'lastname', 'last_name', 'last name', 'familienname', 'surname'].includes(h)) return 'lastName';
    if (['vorname', 'firstname', 'first_name', 'first name'].includes(h)) return 'firstName';
    if (['zweitname', 'middlename', 'middle_name', 'middle name', 'zweitvorname', 'zweiter vorname', 'mittelname'].includes(h)) return 'middleName';
    if (h === 'name') return 'lastName';
    return null;
};

const parseCSVStudents = (text) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return [];

    // Detect delimiter (semicolon or comma)
    const delimiter = lines[0].includes(';') ? ';' : ',';

    // Check if first line is a header by trying to map columns
    const firstLineParts = lines[0].split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
    const columnMap = firstLineParts.map(detectColumnType);
    const isHeader = columnMap.some(type => type !== null);

    let dataLines;
    let getStudent;

    if (isHeader) {
        // Dynamic mapping based on header names
        dataLines = lines.slice(1);
        getStudent = (parts) => {
            const student = { firstName: '', lastName: '', middleName: '' };
            for (let i = 0; i < columnMap.length && i < parts.length; i++) {
                if (columnMap[i]) student[columnMap[i]] = parts[i] || '';
            }
            return student;
        };
    } else {
        // No header: default to Vorname[,Zweitname],Nachname
        dataLines = lines;
        getStudent = (parts) => {
            if (parts.length === 1) return { lastName: parts[0], firstName: '', middleName: '' };
            if (parts.length === 2) return { firstName: parts[0], lastName: parts[1], middleName: '' };
            return { firstName: parts[0], middleName: parts[1] || '', lastName: parts[2] || '' };
        };
    }

    const students = [];
    for (const line of dataLines) {
        const parts = line.split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
        if (parts.length === 0 || parts.every(p => !p)) continue;
        const student = getStudent(parts);
        if (student.firstName || student.lastName) students.push(student);
    }
    return students;
};

const parseJSONStudents = (text) => {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    return data
        .filter(item => item && typeof item === 'object')
        .map(item => ({
            lastName: String(item.lastName || item.nachname || item.last_name || ''),
            firstName: String(item.firstName || item.vorname || item.first_name || ''),
            middleName: String(item.middleName || item.zweitname || item.middle_name || '')
        }))
        .filter(s => s.lastName || s.firstName);
};

const showImportPreview = (students) => {
    const preview = document.getElementById("import-students-preview");
    const table = document.getElementById("import-students-table");
    const count = document.getElementById("import-students-count");
    const confirmBtn = document.getElementById("confirm-import-students");

    if (students.length === 0) {
        preview.classList.remove("hidden");
        count.textContent = t("import.noStudentsFound");
        table.innerHTML = "";
        confirmBtn.disabled = true;
        return;
    }

    count.textContent = t("import.studentsFound").replace("{count}", students.length);
    table.innerHTML = students.map(s => `
        <tr>
            <td>${escapeHtml(s.lastName)}</td>
            <td>${escapeHtml(s.firstName)}</td>
            <td>${escapeHtml(s.middleName)}</td>
        </tr>
    `).join("");
    preview.classList.remove("hidden");
    confirmBtn.disabled = false;
};

document.getElementById("import-students-btn").addEventListener("click", () => {
    resetImportStudentsDialog();
    document.getElementById("import-students-dialog").showModal();
});

document.getElementById("import-students-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target.result);
            reader.onerror = (err) => reject(err);
            reader.readAsText(file);
        });

        if (file.name.toLowerCase().endsWith('.json')) {
            parsedStudentsToImport = parseJSONStudents(text);
        } else {
            parsedStudentsToImport = parseCSVStudents(text);
        }

        showImportPreview(parsedStudentsToImport);
    } catch (err) {
        console.error("Error reading import file:", err);
        showAlertDialog(t("import.parseError"));
    }
});

document.getElementById("confirm-import-students").addEventListener("click", () => {
    if (parsedStudentsToImport.length === 0) return;

    const currentClass = appData.classes.find(c => c.id === appData.currentClassId);
    if (!currentClass) return;

    const skippedNames = [];
    let addedCount = 0;

    for (const student of parsedStudentsToImport) {
        const firstNameVal = validateStringInput(student.firstName || '', 50);
        const lastNameVal = validateStringInput(student.lastName || '', 50);
        const middleNameVal = student.middleName ? validateStringInput(student.middleName, 50) : { isValid: true, value: '' };

        const firstName = firstNameVal.isValid ? firstNameVal.value : '';
        const lastName = lastNameVal.isValid ? lastNameVal.value : '';
        const middleName = middleNameVal.isValid ? middleNameVal.value : '';

        // Duplikat-Prüfung: Vorname + Nachname (case-insensitive)
        const isDuplicate = currentClass.students.some(s =>
            s.firstName.toLowerCase() === firstName.toLowerCase() &&
            s.lastName.toLowerCase() === lastName.toLowerCase()
        );

        if (isDuplicate) {
            skippedNames.push([firstName, middleName, lastName].filter(Boolean).join(' '));
            continue;
        }

        currentClass.students.push({
            id: Date.now().toString() + '-' + Math.floor(Math.random() * 10000),
            firstName,
            lastName,
            middleName,
            grades: [],
            participation: []
        });
        addedCount++;
    }

    saveData();
    renderStudents();
    document.getElementById("import-students-dialog").close();
    resetImportStudentsDialog();

    if (addedCount > 0) {
        showToast(t("toast.studentsImported").replace("{count}", addedCount), "success");
    }
    if (skippedNames.length > 0) {
        showAlertDialog(t("error.studentsDuplicateSkipped").replace("{names}", skippedNames.join("\n")));
    }
});

document.getElementById("cancel-import-students").addEventListener("click", () => {
    document.getElementById("import-students-dialog").close();
    resetImportStudentsDialog();
});

// Track dirty state for settings dialog (grade ranges + plusminus settings)
let settingsDirty = false;
const markSettingsDirty = () => { settingsDirty = true; };

const tryCloseSettingsDialog = async () => {
    if (settingsDirty) {
        const discard = await showUnsavedChangesWarning();
        if (!discard) return;
    }
    settingsDirty = false;
    document.getElementById("manage-categories-dialog").close();
};

document.getElementById("manage-categories").addEventListener("click", () => {
    renderCategoryManagement();
    settingsDirty = false;

    // Load current plus/minus percentage settings
    const pmPercentages = appData.plusMinusPercentages || { plus: 100, neutral: 50, minus: 0 };
    const plusInput = document.getElementById("plusminus-plus-percent");
    const neutralInput = document.getElementById("plusminus-neutral-percent");
    const minusInput = document.getElementById("plusminus-minus-percent");

    if (plusInput) plusInput.value = pmPercentages.plus;
    if (neutralInput) neutralInput.value = pmPercentages.neutral;
    if (minusInput) minusInput.value = pmPercentages.minus;

    // Load current percentage ranges
    const defaultRanges = [
        { grade: 1, minPercent: 85, maxPercent: 100 },
        { grade: 2, minPercent: 70, maxPercent: 84 },
        { grade: 3, minPercent: 55, maxPercent: 69 },
        { grade: 4, minPercent: 40, maxPercent: 54 },
        { grade: 5, minPercent: 0, maxPercent: 39 }
    ];
    const ranges = appData.gradePercentageRanges || defaultRanges;
    ranges.forEach(range => {
        const minInput = document.getElementById(`grade-${range.grade}-min`);
        const maxInput = document.getElementById(`grade-${range.grade}-max`);
        if (minInput) minInput.value = range.minPercent;
        if (maxInput) maxInput.value = range.maxPercent;
    });

    // Dirty-Tracking für Settings-Inputs
    const settingsInputs = [
        'plusminus-plus-percent', 'plusminus-neutral-percent', 'plusminus-minus-percent',
        'grade-1-min', 'grade-1-max', 'grade-2-min', 'grade-2-max',
        'grade-3-min', 'grade-3-max', 'grade-4-min', 'grade-4-max',
        'grade-5-min', 'grade-5-max'
    ];
    settingsInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", markSettingsDirty);
        }
    });

    document.getElementById("manage-categories-dialog").showModal();
});

document.getElementById("close-manage-categories").addEventListener("click", () => {
    tryCloseSettingsDialog();
});

// X-Button in settings dialog
document.getElementById("close-manage-categories-x").addEventListener("click", () => {
    tryCloseSettingsDialog();
});

// Escape-key protection for settings dialog
document.getElementById("manage-categories-dialog").addEventListener("cancel", (e) => {
    e.preventDefault();
    tryCloseSettingsDialog();
});

// Event listener for cancel button in edit dialog
// cancel-edit is now handled inside showDialog() with unsaved-changes protection

document.getElementById("save-plusminus-settings").addEventListener("click", () => {
    const plusPercent = document.getElementById("plusminus-plus-percent").value;
    const neutralPercent = document.getElementById("plusminus-neutral-percent").value;
    const minusPercent = document.getElementById("plusminus-minus-percent").value;
    updatePlusMinusPercentages(plusPercent, neutralPercent, minusPercent);
    settingsDirty = false;
    showToast(t("toast.plusMinusSettingsSaved"), "success");
});

// Event listener for saving percentage ranges
document.getElementById("save-percentage-ranges").addEventListener("click", () => {
    const ranges = [];
    for (let grade = 1; grade <= 5; grade++) {
        const minInput = document.getElementById(`grade-${grade}-min`);
        const maxInput = document.getElementById(`grade-${grade}-max`);
        if (minInput && maxInput) {
            ranges.push({
                grade: grade,
                minPercent: parseFloat(minInput.value),
                maxPercent: parseFloat(maxInput.value)
            });
        }
    }
    if (updateGradePercentageRanges(ranges)) {
        settingsDirty = false;
        showToast(t("toast.gradeRangesSaved"), "success");
    }
});

// Event-Listener fuer den Kategorie hinzufuegen Button im Dialog
document.getElementById("add-category").addEventListener("click", () => {
    const content = `
        <div class="grid gap-2">
          <label class="block mb-2">${t("category.categoryName")}</label>
          <input type="text" name="name" class="input w-full" required>
          <p class="text-sm" style="color: oklch(.708 0 0);">${t("category.categoryNameHint")}</p>
        </div>
        <div class="grid gap-2">
          <label class="block mb-2">${t("category.weight")}</label>
          <input type="number" name="weight" step="1" min="1" max="100" class="input w-full" required>
          <p class="text-sm" style="color: oklch(.708 0 0);">${t("category.weightHint")} (${t("category.inPercent")})</p>
        </div>
        <div class="grid gap-2">
          <label class="flex items-center gap-2">
            <input type="checkbox" name="onlyPlusMinus" class="checkbox">
            <span>${t("category.plusMinusOnly")}</span>
          </label>
          <p class="text-sm" style="color: oklch(.708 0 0);">${t("category.plusMinusHint")}</p>
        </div>
      `;

    showDialog("edit-dialog", t("category.addCategory"), content, (formData) => {
        const name = formData.get("name");
        const weight = parseFloat(formData.get("weight")); // This will be the percentage value from the UI
        const onlyPlusMinus = formData.get("onlyPlusMinus") === "on";

        // Validate the weight (this will convert percentage to decimal)
        const weightValidation = validateWeight(weight);
        if (!weightValidation.isValid) {
            showAlertDialog(weightValidation.error);
            return;
        }
        
        const decimalWeight = weightValidation.value; // This is the decimal value for internal use
        
        addCategory(name, decimalWeight, false, onlyPlusMinus);
        renderCategoryManagement();
    });
});

document.getElementById("export-data").addEventListener("click", exportData);

document.getElementById("search-students").addEventListener("input", renderStudents);
document.getElementById("filter-category").addEventListener("change", renderStudents);

// Ensure data is loaded when the page loads
document.addEventListener("DOMContentLoaded", async () => {
    // Load data from server (async)
    await loadData();

    // Check for app version updates
    initVersionCheck();

    // Check if user has completed setup (has classes)
    if (appData.classes && appData.classes.length > 0) {
        document.getElementById("setup-page").classList.add("hidden");
        document.getElementById("dashboard").classList.remove("hidden");
        // Use teacherName or fallback to username
        const displayName = appData.teacherName || window.currentUser.username;
        document.getElementById("teacher-greeting").textContent = displayName;
        renderClassList();
        showHomeView();
        I18n.applyI18nToDOM();

        // Data is now stored on the server, show different message
        // showAlertDialog("Your data is synced to the server and stored securely.");

        // Tutorial fuer wiederkehrende User anzeigen (falls nicht abgeschlossen)
        if (appData.tutorial && !appData.tutorial.completed && !appData.tutorial.neverShowAgain) {
            setTimeout(() => {
                initTutorial();
            }, 1500);
        }
        
        // Attach student access button event listener after DOM is loaded and data is ready
        document.getElementById("student-access-btn").addEventListener("click", window.openStudentAccessDialog);
    } else {
        // Show setup page if no classes are found
        document.getElementById("setup-page").classList.remove("hidden");
        document.getElementById("dashboard").classList.add("hidden");
    }
});

// Home navigation
document.getElementById("nav-home").addEventListener("click", showHomeView);

// Back to class view from student detail
document.getElementById("back-to-class").addEventListener("click", backToClassView);

// Student Access (Share) Dialog
document.getElementById("close-student-access").addEventListener("click", () => {
    document.getElementById("student-access-dialog").close();
});

