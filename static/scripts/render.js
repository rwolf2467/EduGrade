//render.js
// ========== RENDER-FUNKTIONEN ==========
// Diese Datei enthält alle Funktionen die das UI (User Interface) aktualisieren.
// "Rendern" bedeutet: Daten aus appData nehmen und als HTML darstellen.

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
        `<div class="flex items-center gap-2 w-full">
            <button class="btn-block btn-secondary flex-1 ${cls.id === appData.currentClassId ? 'bg-blue-500 text-white' : ''}"
            data-class-id="${safeAttr(cls.id)}">
                ${escapeHtml(cls.name)}
            </button>
            <button class="btn-icon btn-secondary" data-edit-class="${safeAttr(cls.id)}" title="Edit class" data-tooltip="Edit class" data-side="left">
                <svg class="lucide lucide-edit" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.5 5.5l-4 4L17 11.5 21 7.5z" />
                </svg>
            </button>
            <button class="btn-icon btn-destructive" data-delete-class="${safeAttr(cls.id)}" title="Delete class" data-tooltip="Delete class" data-side="left">
                <svg class="lucide lucide-trash-2" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6h18" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
            </button>
        </div>`
    ).join("");

    document.querySelectorAll("[data-class-id]").forEach(btn => {
        btn.addEventListener("click", () => {
            appData.currentClassId = btn.dataset.classId;
            saveData("Class successfully selected!", "success");
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
                        <label class="block mb-2">New class name</label>
                        <input type="text" name="name" class="input w-full" value="${escapeHtml(cls.name)}" required maxlength="100">
                        <p class="text-sm" style="color: oklch(.708 0 0);">Hey there, what would you like to rename this class to?<p>
                    </div>
                `;
                showDialog("edit-dialog", "Edit Class", content, (formData) => {
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
                showConfirmDialog(`are you sure you want to permanently delete the class "${escapeHtml(cls.name)}"? This action cannot be undone and all associated data will be lost.`, () => {
                    deleteClass(classId);
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
const renderStudents = () => {
    // Aktuelle Klasse finden
    const currentClass = appData.classes.find(c => c.id === appData.currentClassId);
    if (!currentClass) {
        console.error("No current class found!");
        return;
    }

    // Suchbegriff und Kategoriefilter aus den Input-Feldern holen
    const searchTerm = document.getElementById("search-students").value.toLowerCase();
    const filterCategory = document.getElementById("filter-category").value;

    const studentsTable = document.getElementById("students-table");

    // FILTER-PIPELINE: Erst filtern, dann rendern
    studentsTable.innerHTML = currentClass.students
        // 1. FILTERN: Nur Schüler behalten die den Kriterien entsprechen
        .filter(student => {
            const matchesSearch = student.name.toLowerCase().includes(searchTerm) ||
                student.grades.some(g => {
                    const gradeValue = g.isPlusMinus ? g.value : g.value.toString();
                    const gradeName = g.name || "";
                    return gradeValue.includes(searchTerm) || gradeName.toLowerCase().includes(searchTerm);
                });
            const matchesCategory = filterCategory ? student.grades.some(g => g.categoryId === filterCategory) : true;
            return matchesSearch && matchesCategory;
        })
        .map(student => {
            const simpleAvg = calculateSimpleAverage(student.grades);
            const weightedAvg = calculateWeightedAverage(student.grades);
            return `
            <tr>
              <td>${escapeHtml(student.name)}</td>
              <td>
                ${student.grades.map(grade => {
                    const displayValue = grade.isPlusMinus ? escapeHtml(grade.value) : escapeHtml(grade.value);
                    const displayName = grade.name ? `<strong>${escapeHtml(grade.name)}</strong>: ` : '';
                    const weightDisplay = grade.isPlusMinus ? '' : ` (${(grade.weight * 100).toFixed(0)}%)`;
                    const gradeColorClass = getGradeColorClass(grade);
                    return `
                    <div class="flex items-center mb-1">
                      <button class="badge mr-1 flex items-center ${gradeColorClass}" data-manage-grade="${safeAttr(grade.id)}" data-tooltip="Manage grade" data-side="top">
                        ${displayName}${escapeHtml(grade.categoryName)}: ${displayValue}${weightDisplay}
                      </button>
                    </div>
                  `;
                }).join("")}
              </td>
              <td>${simpleAvg ? simpleAvg.toFixed(2) : "—"}</td>
              <td>${weightedAvg ? weightedAvg.toFixed(2) : "—"}</td>
              <td>${calculateFinalGrade(weightedAvg)}</td>
              <td>
                <button class="btn-icon btn-primary mr-1" data-add-grade="${safeAttr(student.id)}" data-tooltip="Add grade" data-side="top">
                  <svg class="lucide lucide-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button class="btn-icon btn-secondary mr-1" data-edit-student="${safeAttr(student.id)}" data-tooltip="Edit student" data-side="top">
                  <svg class="lucide lucide-edit" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.5 5.5l-4 4L17 11.5 21 7.5z" />
                  </svg>
                </button>
                <button class="btn-icon btn-destructive" data-delete-student="${safeAttr(student.id)}" data-tooltip="Delete student" data-side="top">
                  <svg class="lucide lucide-trash-2" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6h18" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </td>
            </tr>
          `;
        }).join("");

    // Add event listeners for manage grade buttons
    document.querySelectorAll("[data-manage-grade]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const gradeId = e.target.closest("[data-manage-grade]").dataset.manageGrade;
            const grade = currentClass.students.flatMap(s => s.grades).find(g => g.id === gradeId);
            if (grade) {
                const category = appData.categories.find(c => c.id === grade.categoryId);

                let gradeInputHTML = '';
                if (grade.isPlusMinus) {
                    // Plus/Minus grades - no tabs needed
                    gradeInputHTML = `
                        <div class="grid gap-2">
                            <label class="block mb-2">Edit grade</label>
                            <select name="value" class="select w-full" required>
                                <option value="+" ${grade.value === '+' ? 'selected' : ''}>+</option>
                                <option value="-" ${grade.value === '-' ? 'selected' : ''}>-</option>
                            </select>
                        </div>
                    `;
                } else {
                    // Numeric grades - use tabs for grade/percentage
                    const showPercentTab = grade.enteredAsPercent === true;
                    const currentPercent = grade.percentValue || '';

                    gradeInputHTML = `
                        <div class="tabs w-full" id="edit-grade-tabs">
                            <nav role="tablist" aria-orientation="horizontal" class="w-full">
                                <button type="button" role="tab" id="tab-edit-grade-direct" aria-controls="panel-edit-grade-direct" aria-selected="${!showPercentTab}" tabindex="0">Grade</button>
                                <button type="button" role="tab" id="tab-edit-grade-percent" aria-controls="panel-edit-grade-percent" aria-selected="${showPercentTab}" tabindex="0">Percentage</button>
                            </nav>
                            <div role="tabpanel" id="panel-edit-grade-direct" aria-labelledby="tab-edit-grade-direct" tabindex="-1" aria-selected="${!showPercentTab}" ${showPercentTab ? 'hidden' : ''}>
                                <div class="pt-3">
                                    <input type="number" name="value" step="0.1" min="1" max="6" class="input w-full" id="edit-grade-value-input" value="${escapeHtml(grade.value)}" placeholder="1-6">
                                    <p class="text-sm mt-2" style="color: oklch(.708 0 0);">Enter grade value 1-6.</p>
                                </div>
                            </div>
                            <div role="tabpanel" id="panel-edit-grade-percent" aria-labelledby="tab-edit-grade-percent" tabindex="-1" aria-selected="${showPercentTab}" ${!showPercentTab ? 'hidden' : ''}>
                                <div class="pt-3">
                                    <div class="flex items-center gap-2">
                                        <input type="number" id="edit-grade-percent-input" step="0.1" min="0" max="100" class="input flex-1" placeholder="0-100" value="${currentPercent}">
                                        <span>%</span>
                                    </div>
                                    <p class="text-sm mt-2" style="color: oklch(.708 0 0);">Enter percentage (0-100). Will be converted to a grade.</p>
                                    <p class="text-sm mt-1 font-semibold" id="edit-percent-preview"></p>
                                </div>
                            </div>
                        </div>
                    `;
                }

                const content = `
                    <div class="grid gap-4">
                        <div class="grid gap-2">
                            <label class="block mb-2">Grade name (optional)</label>
                            <input type="text" name="name" class="input w-full" value="${escapeHtml(grade.name || '')}" placeholder="e.g., SA1, Test 1" maxlength="50">
                            <p class="text-sm" style="color: oklch(.708 0 0);">Give this grade a name to identify it easily.</p>
                        </div>
                        ${gradeInputHTML}
                        <div class="flex justify-end gap-2">
                            <button type="button" class="btn-destructive" id="delete-grade-btn">Delete</button>
                        </div>
                    </div>
                `;

                const dialog = document.getElementById("edit-dialog");
                dialog.querySelector("h2").textContent = "Manage grade";
                dialog.querySelector("form").innerHTML = content;
                dialog.showModal();

                // Add percentage preview listener for edit dialog
                if (!grade.isPlusMinus) {
                    setTimeout(() => {
                        const percentInput = document.getElementById("edit-grade-percent-input");
                        const percentPreview = document.getElementById("edit-percent-preview");
                        if (percentInput && percentPreview) {
                            // Show initial preview if there's a value
                            if (percentInput.value) {
                                const percent = parseFloat(percentInput.value);
                                if (!isNaN(percent) && percent >= 0 && percent <= 100) {
                                    const gradeVal = percentToGrade(percent);
                                    percentPreview.textContent = `= Grade ${gradeVal}`;
                                }
                            }
                            // Add input listener
                            percentInput.addEventListener("input", () => {
                                const percent = parseFloat(percentInput.value);
                                if (!isNaN(percent) && percent >= 0 && percent <= 100) {
                                    const gradeVal = percentToGrade(percent);
                                    percentPreview.textContent = `= Grade ${gradeVal}`;
                                } else {
                                    percentPreview.textContent = "";
                                }
                            });
                        }
                    }, 0);
                }

                // Handle form submission for editing
                dialog.querySelector("form").onsubmit = (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    const newName = formData.get("name");

                    if (grade.isPlusMinus) {
                        grade.value = formData.get("value");
                    } else {
                        // Check which tab is active
                        const percentPanel = document.getElementById("panel-edit-grade-percent");
                        const percentInput = document.getElementById("edit-grade-percent-input");
                        const directGradeInput = document.getElementById("edit-grade-value-input");

                        if (percentPanel && !percentPanel.hidden && percentInput && percentInput.value) {
                            // Percentage tab is active
                            const percentValue = parseFloat(percentInput.value);
                            const convertedGrade = percentToGrade(percentValue);
                            if (convertedGrade !== null) {
                                grade.value = convertedGrade;
                                grade.enteredAsPercent = true;
                                grade.percentValue = percentValue;
                            } else {
                                showAlertDialog("Invalid percentage value");
                                return;
                            }
                        } else if (percentPanel && !percentPanel.hidden && (!percentInput || !percentInput.value)) {
                            showAlertDialog("Please enter a percentage value");
                            return;
                        } else if (directGradeInput && directGradeInput.value) {
                            // Direct grade tab is active
                            const parsedValue = parseFloat(directGradeInput.value);
                            if (!isNaN(parsedValue)) {
                                grade.value = parsedValue;
                                grade.enteredAsPercent = false;
                                delete grade.percentValue;
                            }
                        } else {
                            showAlertDialog("Please enter a grade value");
                            return;
                        }
                    }

                    grade.name = newName;
                    saveData("Grade updated!", "success");
                    renderStudents();
                    dialog.close();
                };

                // Handle delete button
                document.getElementById("delete-grade-btn").onclick = () => {
                    showConfirmDialog("are you sure you want to permanently delete this grade? This action cannot be undone.", () => {
                        deleteItem("grade", gradeId);
                        dialog.close();
                    });
                };
            }
        });
    });

    document.querySelectorAll("[data-add-grade]").forEach(btn => {
        btn.addEventListener("click", () => {
            const studentId = btn.dataset.addGrade;

            // Create category selection with info about +/- support (global categories)
            const categoryOptions = appData.categories.map(cat => {
                const label = cat.onlyPlusMinus ? ' [+/- only]' : (cat.allowPlusMinus ? ' [+/-]' : '');
                return `<option value="${safeAttr(cat.id)}" data-allow-plus-minus="${cat.allowPlusMinus}" data-only-plus-minus="${cat.onlyPlusMinus || false}">${escapeHtml(cat.name)} (${(cat.weight * 100).toFixed(0)}%)${label}</option>`;
            }).join("");

            const content = `
            <div class="grid gap-2">
              <label class="block mb-2">Grade name (optional)</label>
              <input type="text" name="name" class="input w-full" placeholder="e.g., SA1, Test 1">
              <p class="text-sm" style="color: oklch(.708 0 0);">Give this grade a name to identify it easily (optional).</p>
            </div>
            <div class="grid gap-2">
              <label class="block mb-2">Category</label>
              <select name="categoryId" id="grade-category-select" class="select w-full" required>
                ${categoryOptions}
              </select>
              <p class="text-sm" style="color: oklch(.708 0 0);">Which category would you like to add this grade to? Categories marked with [+/-] allow plus/minus grades.</p>
            </div>
            <div class="grid gap-2" id="grade-value-container">
              <div class="tabs w-full" id="grade-input-tabs">
                <nav role="tablist" aria-orientation="horizontal" class="w-full">
                  <button type="button" role="tab" id="tab-grade-direct" aria-controls="panel-grade-direct" aria-selected="true" tabindex="0">Grade</button>
                  <button type="button" role="tab" id="tab-grade-percent" aria-controls="panel-grade-percent" aria-selected="false" tabindex="0">Percentage</button>
                </nav>
                <div role="tabpanel" id="panel-grade-direct" aria-labelledby="tab-grade-direct" tabindex="-1" aria-selected="true">
                  <div class="pt-3">
                    <input type="number" name="value" step="0.1" min="1" max="6" class="input w-full" id="grade-value-input" placeholder="1-6">
                    <p class="text-sm mt-2" style="color: oklch(.708 0 0);">Enter grade value 1-6.</p>
                  </div>
                </div>
                <div role="tabpanel" id="panel-grade-percent" aria-labelledby="tab-grade-percent" tabindex="-1" aria-selected="false" hidden>
                  <div class="pt-3">
                    <div class="flex items-center gap-2">
                      <input type="number" id="grade-percent-input" step="0.1" min="0" max="100" class="input flex-1" placeholder="0-100">
                      <span>%</span>
                    </div>
                    <p class="text-sm mt-2" style="color: oklch(.708 0 0);">Enter percentage (0-100). Will be converted to a grade.</p>
                    <p class="text-sm mt-1 font-semibold" id="percent-preview"></p>
                  </div>
                </div>
              </div>
            </div>
          `;

            showDialog("edit-dialog", "Add Grade", content, (formData) => {
                // Check if percentage tab is active
                const percentPanel = document.getElementById("panel-grade-percent");
                const percentInput = document.getElementById("grade-percent-input");
                const directGradeInput = document.getElementById("grade-value-input");

                let gradeValue = formData.get("value");
                let enteredAsPercent = false;
                let percentValue = null;

                // If percentage panel is visible and has a value, convert it
                if (percentPanel && !percentPanel.hidden && percentInput && percentInput.value) {
                    percentValue = parseFloat(percentInput.value);
                    const convertedGrade = percentToGrade(percentValue);
                    if (convertedGrade !== null) {
                        gradeValue = convertedGrade.toString();
                        enteredAsPercent = true;
                    } else {
                        showAlertDialog("Invalid percentage value");
                        return;
                    }
                } else if (percentPanel && !percentPanel.hidden && (!percentInput || !percentInput.value)) {
                    showAlertDialog("Please enter a percentage value");
                    return;
                } else if ((!percentPanel || percentPanel.hidden) && directGradeInput && !directGradeInput.value && !gradeValue) {
                    showAlertDialog("Please enter a grade value");
                    return;
                }

                const newGrade = addGrade(studentId, formData.get("categoryId"), gradeValue, formData.get("name"));

                if (newGrade) {
                    // Store percentage info if entered as percentage
                    if (enteredAsPercent) {
                        newGrade.enteredAsPercent = true;
                        newGrade.percentValue = percentValue;
                    }

                    saveData("Grade successfully added!", "success");
                    renderStudents();
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
                        <label class="block mb-2">Grade</label>
                        <select name="value" class="select w-full" required>
                            <option value="">Select</option>
                            <option value="+">+ (Plus)</option>
                            <option value="-">- (Minus)</option>
                        </select>
                        <p class="text-sm" style="color: oklch(.708 0 0);">This category only allows +/- grades. The final grade is calculated from the total number of + and - entries.</p>
                    `;
                } else if (allowPlusMinus) {
                    // Allow +/- but also numeric - no percentage for mixed
                    valueContainer.innerHTML = `
                        <label class="block mb-2">Grade</label>
                        <select name="value" class="select w-full" required>
                            <option value="">Select grade type</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                            <option value="6">6</option>
                            <option value="+">+ (Plus)</option>
                            <option value="-">- (Minus)</option>
                        </select>
                        <p class="text-sm" style="color: oklch(.708 0 0);">You can enter a numeric grade (1-6) or a +/- grade.</p>
                    `;
                } else {
                    // Normal numeric grades - show tabs with percentage option
                    valueContainer.innerHTML = `
                        <div class="tabs w-full" id="grade-input-tabs">
                          <nav role="tablist" aria-orientation="horizontal" class="w-full">
                            <button type="button" role="tab" id="tab-grade-direct" aria-controls="panel-grade-direct" aria-selected="true" tabindex="0">Grade</button>
                            <button type="button" role="tab" id="tab-grade-percent" aria-controls="panel-grade-percent" aria-selected="false" tabindex="0">Percentage</button>
                          </nav>
                          <div role="tabpanel" id="panel-grade-direct" aria-labelledby="tab-grade-direct" tabindex="-1" aria-selected="true">
                            <div class="pt-3">
                              <input type="number" name="value" step="0.1" min="1" max="6" class="input w-full" id="grade-value-input" placeholder="1-6">
                              <p class="text-sm mt-2" style="color: oklch(.708 0 0);">Enter grade value 1-6.</p>
                            </div>
                          </div>
                          <div role="tabpanel" id="panel-grade-percent" aria-labelledby="tab-grade-percent" tabindex="-1" aria-selected="false" hidden>
                            <div class="pt-3">
                              <div class="flex items-center gap-2">
                                <input type="number" id="grade-percent-input" step="0.1" min="0" max="100" class="input flex-1" placeholder="0-100">
                                <span>%</span>
                              </div>
                              <p class="text-sm mt-2" style="color: oklch(.708 0 0);">Enter percentage (0-100). Will be converted to a grade.</p>
                              <p class="text-sm mt-1 font-semibold" id="percent-preview"></p>
                            </div>
                          </div>
                        </div>
                    `;

                    // Add percentage preview listener
                    setTimeout(() => {
                        const percentInput = document.getElementById("grade-percent-input");
                        const percentPreview = document.getElementById("percent-preview");
                        if (percentInput && percentPreview) {
                            percentInput.addEventListener("input", () => {
                                const percent = parseFloat(percentInput.value);
                                if (!isNaN(percent) && percent >= 0 && percent <= 100) {
                                    const grade = percentToGrade(percent);
                                    percentPreview.textContent = `= Grade ${grade}`;
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

            // Add initial percentage preview listener
            setTimeout(() => {
                const percentInput = document.getElementById("grade-percent-input");
                const percentPreview = document.getElementById("percent-preview");
                if (percentInput && percentPreview) {
                    percentInput.addEventListener("input", () => {
                        const percent = parseFloat(percentInput.value);
                        if (!isNaN(percent) && percent >= 0 && percent <= 100) {
                            const grade = percentToGrade(percent);
                            percentPreview.textContent = `= Grade ${grade}`;
                        } else {
                            percentPreview.textContent = "";
                        }
                    });
                }
            }, 0);
        });
    });

    document.querySelectorAll("[data-edit-student]").forEach(btn => {
        btn.addEventListener("click", () => {
            const studentId = btn.dataset.editStudent;
            const student = currentClass.students.find(s => s.id === studentId);
            if (student) {
                const content = `
            <div class="grid gap-2">
              <label class="block mb-2">Name</label>
              <input type="text" name="name" class="input w-full" value="${escapeHtml(student.name)}" required maxlength="100">
              <p class="text-sm" style="color: oklch(.708 0 0);">What would you like to rename this student to?</p>
            </div>
          `;

                showDialog("edit-dialog", "Edit Student", content, (formData) => {
                    student.name = formData.get("name");
                    saveData("Student successfully edited!", "success");
                    renderStudents();
                });
            }
        });
    });

    document.querySelectorAll("[data-delete-student]").forEach(btn => {
        btn.addEventListener("click", () => {
            const studentId = btn.dataset.deleteStudent;
            showConfirmDialog("are you sure you want to permanently delete this student? This action cannot be undone.", () => {
                deleteItem("student", studentId);
                saveData("Student successfully deleted!", "success");
                renderStudents();
            });
        });
    });

};

const renderCategoryFilter = () => {
    // Kategorien sind jetzt global (gelten für alle Klassen)
    const filter = document.getElementById("filter-category");
    filter.innerHTML = `
        <option value="">All Categories</option>
        ${appData.categories.map(cat => `
          <option value="${safeAttr(cat.id)}">${escapeHtml(cat.name)}</option>
        `).join("")}
      `;
};

const renderCategoryManagement = () => {
    // Kategorien sind jetzt global (gelten für alle Klassen)
    const categoryManagementList = document.getElementById("categories-list");
    categoryManagementList.innerHTML = appData.categories.map(cat => {
        const label = cat.onlyPlusMinus ? ' <span class="badge badge-primary">+/- only</span>' : (cat.allowPlusMinus ? ' <span class="badge badge-primary">+/-</span>' : '');
        return `
        <div class="flex items-center justify-between p-2 border rounded">
            <div>
                <span>${escapeHtml(cat.name)} (${(cat.weight * 100).toFixed(0)}%)${label}</span>
            </div>
            <div class="flex gap-2">
                <button class="btn-icon btn-small btn-secondary" data-edit-category="${safeAttr(cat.id)}" data-tooltip="Edit category" data-side="left">
                    <svg class="lucide lucide-edit" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.5 5.5l-4 4L17 11.5 21 7.5z" />
                    </svg>
                </button>
                <button class="btn-icon btn-small btn-destructive" data-delete-category="${safeAttr(cat.id)}" data-tooltip="Delete category" data-side="left">
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
                        <label class="block mb-2">Category Name</label>
                        <input type="text" name="name" class="input w-full" value="${escapeHtml(category.name)}" required maxlength="100">
                        <p class="text-sm" style="color: oklch(.708 0 0);">Let's update the name of this category. What would you like to call it?</p>
                    </div>
                    <div class="grid gap-2">
                        <label class="block mb-2">Weight (e.g., 0.5 for 50%)</label>
                        <input type="number" name="weight" step="0.1" min="0.1" max="1" class="input w-full" value="${escapeHtml(category.weight)}" required>
                        <p class="text-sm" style="color: oklch(.708 0 0);">Now, let's set the weight for this category. How much should it contribute to the overall grade?</p>
                    </div>
                    <div class="grid gap-2">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" name="onlyPlusMinus" class="checkbox" ${category.onlyPlusMinus ? 'checked' : ''}>
                            <span>Plus/Minus only</span>
                        </label>
                        <p class="text-sm" style="color: oklch(.708 0 0);">Enable this for categories that only use +/- grades instead of numeric grades.</p>
                    </div>
                `;
                showDialog("edit-dialog", "Edit Category", content, (formData) => {
                    const newName = formData.get("name");
                    const newWeight = parseFloat(formData.get("weight"));
                    const onlyPlusMinus = formData.get("onlyPlusMinus") === "on";

                    // Update all existing grades that belong to this category (in ALL classes)
                    appData.classes.forEach(cls => {
                        cls.students.forEach(student => {
                            student.grades.forEach(grade => {
                                if (grade.categoryId === category.id) {
                                    grade.categoryName = newName;
                                    grade.weight = newWeight;
                                }
                            });
                        });
                    });

                    // Update the category itself
                    category.name = newName;
                    category.weight = newWeight;
                    category.onlyPlusMinus = onlyPlusMinus;
                    category.allowPlusMinus = onlyPlusMinus || category.allowPlusMinus;

                    saveData("Category successfully edited!", "success");
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
            showConfirmDialog("are you sure you want to permanently delete this category? This action cannot be undone.", () => {
                deleteItem("category", categoryId);
                saveData("Category successfully deleted!", "success");
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
    // Nur numerische Noten verwenden (keine +/- Noten)
    const numericGrades = grades.filter(g => !g.isPlusMinus);

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
 * FORMEL FÜR GEWICHTETEN DURCHSCHNITT:
 *   Durchschnitt = Σ(Note × Gewicht) / Σ(Gewicht)
 *
 * Beispiel:
 *   Schularbeit (Gewicht 0.5): Note 2
 *   Test (Gewicht 0.3): Note 3
 *   Mitarbeit (Gewicht 0.2): Note 1
 *
 *   Gewichteter Durchschnitt = (2×0.5 + 3×0.3 + 1×0.2) / (0.5 + 0.3 + 0.2)
 *                            = (1.0 + 0.9 + 0.2) / 1.0
 *                            = 2.1
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
    // SCHRITT 1: Noten nach Typ trennen
    const numericGrades = grades.filter(g => !g.isPlusMinus);    // Zahlennoten (1-6)
    const plusMinusGrades = grades.filter(g => g.isPlusMinus);   // +/- Noten

    // Einstellungen für Plus/Minus-Berechnung laden
    // Falls nicht gesetzt, Standardwerte verwenden
    const plusMinusSettings = appData.plusMinusGradeSettings || {
        startGrade: 3,      // Ausgangsnote
        plusValue: 0.5,     // Wie viel ein Plus die Note verbessert
        minusValue: 0.5     // Wie viel ein Minus die Note verschlechtert
    };

    // Variablen für die Berechnung
    let weightedSum = 0;    // Summe aller (Note × Gewicht)
    let totalWeight = 0;    // Summe aller Gewichte

    // SCHRITT 2: NUMERISCHE NOTEN VERARBEITEN
    if (numericGrades.length > 0) {
        // Gewichtete Summe: Jede Note wird mit ihrer Gewichtung multipliziert
        weightedSum = numericGrades.reduce((sum, grade) =>
            sum + (grade.value * grade.weight), 0
        );

        // Gesamtgewicht: Alle Gewichtungen addieren
        totalWeight = numericGrades.reduce((sum, grade) =>
            sum + grade.weight, 0
        );
    }

    // SCHRITT 3: PLUS/MINUS-NOTEN VERARBEITEN
    // Zuerst nach Kategorie gruppieren (alle + und - einer Kategorie zusammenzählen)
    const plusMinusByCategory = {};

    plusMinusGrades.forEach(grade => {
        // Neue Kategorie anlegen falls noch nicht vorhanden
        if (!plusMinusByCategory[grade.categoryId]) {
            plusMinusByCategory[grade.categoryId] = {
                plus: 0,                    // Anzahl der Plus
                minus: 0,                   // Anzahl der Minus
                weight: grade.weight        // Gewichtung der Kategorie
            };
        }

        // Plus oder Minus zählen
        if (grade.value === "+") {
            plusMinusByCategory[grade.categoryId].plus++;
        } else {
            plusMinusByCategory[grade.categoryId].minus++;
        }
    });

    // SCHRITT 4: PLUS/MINUS IN ZAHLENNOTEN UMRECHNEN
    // Für jede Kategorie eine Note berechnen
    Object.values(plusMinusByCategory).forEach(cat => {
        // Mit Startnote beginnen
        let categoryGrade = plusMinusSettings.startGrade;

        // Plus verbessert die Note (macht sie kleiner)
        // Beispiel: Startnote 3, 2 Plus mit Wert 0.5 → 3 - 1.0 = 2.0
        categoryGrade -= cat.plus * plusMinusSettings.plusValue;

        // Minus verschlechtert die Note (macht sie größer)
        // Beispiel: Note 2, 1 Minus mit Wert 0.5 → 2 + 0.5 = 2.5
        categoryGrade += cat.minus * plusMinusSettings.minusValue;

        // CLAMPING: Note auf gültigen Bereich 1-5 begrenzen
        // Math.max(1, ...) stellt sicher dass Note nicht unter 1 fällt
        // Math.min(5, ...) stellt sicher dass Note nicht über 5 steigt
        categoryGrade = Math.max(1, Math.min(5, categoryGrade));

        // Zur gewichteten Summe hinzufügen
        weightedSum += categoryGrade * cat.weight;
        totalWeight += cat.weight;
    });

    // SCHRITT 5: DURCHSCHNITT BERECHNEN
    // Wenn keine Gewichtung vorhanden, 0 zurückgeben
    if (totalWeight === 0) return 0;

    // Gewichteter Durchschnitt = Summe der gewichteten Noten / Gesamtgewicht
    let average = weightedSum / totalWeight;

    // Endergebnis auf gültigen Bereich 1-5 begrenzen
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
        // Schüleranzahl addieren
        totalStudents += cls.students.length;

        // Durch alle Schüler der Klasse iterieren
        cls.students.forEach(student => {
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
        overviewList.innerHTML = '<p class="text-sm" style="color: oklch(.708 0 0);">No classes yet. Add a class to get started.</p>';
        return;
    }

    overviewList.innerHTML = appData.classes.map(cls => {
        const studentCount = cls.students.length;
        let classAverage = "-";
        const classAverages = [];

        cls.students.forEach(student => {
            const avg = calculateWeightedAverage(student.grades);
            if (avg > 0) classAverages.push(avg);
        });

        if (classAverages.length > 0) {
            classAverage = (classAverages.reduce((a, b) => a + b, 0) / classAverages.length).toFixed(2);
        }

        return `
            <div class="flex items-center justify-between p-3 border rounded cursor-pointer" data-goto-class="${safeAttr(cls.id)}">
                <div>
                    <h3 class="font-semibold">${escapeHtml(cls.name)}</h3>
                    <p class="text-sm" style="color: oklch(.708 0 0);">${studentCount} student${studentCount !== 1 ? 's' : ''}</p>
                </div>
                <div class="text-right">
                    <p class="text-lg font-bold">${escapeHtml(classAverage)}</p>
                    <p class="text-sm" style="color: oklch(.708 0 0);">Average</p>
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

    // Animation triggern
    if (!classView.classList.contains("hidden")) {
        // Class View ausblenden mit Animation
        classView.style.animation = 'viewFadeOut 0.15s ease-in forwards';
        setTimeout(() => {
            classView.classList.add("hidden");
            classView.style.animation = '';

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
};

// Show Class View
const showClassView = () => {
    const homeView = document.getElementById("home-view");
    const classView = document.getElementById("class-view");

    // Animation triggern
    if (!homeView.classList.contains("hidden")) {
        // Home View ausblenden mit Animation
        homeView.style.animation = 'viewFadeOut 0.15s ease-in forwards';
        setTimeout(() => {
            homeView.classList.add("hidden");
            homeView.style.animation = '';

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
        renderStudents();
        renderCategoryFilter();
    }

    document.getElementById("nav-home").classList.remove("btn-primary");
    document.getElementById("nav-home").classList.add("btn-secondary");
};