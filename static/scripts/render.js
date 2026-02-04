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
              <td><span class="student-name-link" data-student-id="${safeAttr(student.id)}">${escapeHtml(student.name)}</span></td>
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

    // Add event listeners for student name links (to open detail view)
    document.querySelectorAll(".student-name-link").forEach(link => {
        link.addEventListener("click", () => {
            const studentId = link.dataset.studentId;
            showStudentDetailView(studentId);
        });
    });

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
    // Einstellungen für Plus/Minus-Berechnung laden
    const plusMinusSettings = appData.plusMinusGradeSettings || {
        startGrade: 3,
        plusValue: 0.5,
        minusValue: 0.5
    };

    // SCHRITT 1: Noten nach Kategorie gruppieren
    const gradesByCategory = {};

    grades.forEach(grade => {
        const catId = grade.categoryId;
        if (!gradesByCategory[catId]) {
            gradesByCategory[catId] = {
                weight: grade.weight,
                numericGrades: [],
                plusCount: 0,
                minusCount: 0
            };
        }

        if (grade.isPlusMinus) {
            if (grade.value === "+") {
                gradesByCategory[catId].plusCount++;
            } else {
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

        // Plus/Minus Noten: aus Startnote berechnen
        if (category.plusCount > 0 || category.minusCount > 0) {
            let pmGrade = plusMinusSettings.startGrade;
            pmGrade -= category.plusCount * plusMinusSettings.plusValue;
            pmGrade += category.minusCount * plusMinusSettings.minusValue;
            pmGrade = Math.max(1, Math.min(5, pmGrade));

            if (categoryAverage !== null) {
                // Wenn es auch numerische Noten gibt, kombinieren
                // +/- zählt als eine zusätzliche "Note"
                const totalGrades = category.numericGrades.length + 1;
                categoryAverage = (categoryAverage * category.numericGrades.length + pmGrade) / totalGrades;
            } else {
                categoryAverage = pmGrade;
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
    const studentDetailView = document.getElementById("student-detail-view");

    // Destroy chart instance if exists
    if (studentGradeChartInstance) {
        studentGradeChartInstance.destroy();
        studentGradeChartInstance = null;
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
};

// Show Class View
const showClassView = () => {
    const homeView = document.getElementById("home-view");
    const classView = document.getElementById("class-view");
    const studentDetailView = document.getElementById("student-detail-view");

    // Destroy chart instance if exists
    if (studentGradeChartInstance) {
        studentGradeChartInstance.destroy();
        studentGradeChartInstance = null;
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

// ========== STUDENT DETAIL VIEW FUNCTIONS ==========

// Store the Chart.js instance for cleanup
let studentGradeChartInstance = null;

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
    if (studentGradeChartInstance) {
        studentGradeChartInstance.destroy();
        studentGradeChartInstance = null;
    }

    studentDetailView.style.animation = 'viewFadeOut 0.15s ease-in forwards';
    setTimeout(() => {
        studentDetailView.classList.add("hidden");
        studentDetailView.style.animation = '';

        classView.classList.remove("hidden");
        classView.style.animation = 'none';
        classView.offsetHeight; // Force reflow
        classView.style.animation = 'viewFadeIn 0.25s ease-out';

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
    const currentClass = appData.classes.find(c => c.id === appData.currentClassId);
    if (!currentClass) return 0;

    const averages = [];
    currentClass.students.forEach(student => {
        const avg = calculateWeightedAverage(student.grades);
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
    const currentClass = appData.classes.find(c => c.id === appData.currentClassId);
    if (!currentClass) return;

    const student = currentClass.students.find(s => s.id === studentId);
    if (!student) return;

    // Store student ID for reference
    document.getElementById("student-detail-view").dataset.studentId = studentId;

    // Set student name
    document.getElementById("student-detail-name").textContent = student.name;

    // Calculate statistics
    const weightedAvg = calculateWeightedAverage(student.grades);
    const finalGrade = calculateFinalGrade(weightedAvg);
    const trend = calculateTrend(student.grades);
    const classAvg = calculateClassAverage();
    const numericGradeCount = student.grades.filter(g => !g.isPlusMinus).length;

    // Populate stat cards
    document.getElementById("student-stat-average").textContent =
        weightedAvg ? weightedAvg.toFixed(2) : "-";
    document.getElementById("student-stat-final").textContent = finalGrade;
    document.getElementById("student-stat-count").textContent = student.grades.length;

    // Trend display with icon
    const trendEl = document.getElementById("student-stat-trend");
    if (trend.trend === 'improving') {
        trendEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-500"><path d="m18 15-6-6-6 6"/></svg><span class="text-green-500">Improving</span>`;
    } else if (trend.trend === 'declining') {
        trendEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-500"><path d="m6 9 6 6 6-6"/></svg><span class="text-red-500">Declining</span>`;
    } else {
        trendEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-yellow-500"><path d="M5 12h14"/></svg><span class="text-yellow-500">Stable</span>`;
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

    // Render chart, category breakdown, and grades table
    renderStudentGradeChart(student);
    renderCategoryBreakdown(student);
    renderStudentGradesTable(student);
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
    if (studentGradeChartInstance) {
        studentGradeChartInstance.destroy();
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

    // Only include numeric grades
    const numericGrades = student.grades.filter(g => !g.isPlusMinus);

    numericGrades.forEach(grade => {
        const catName = grade.categoryName || 'Unknown';
        if (!gradesByCategory[catName]) {
            gradesByCategory[catName] = [];
        }
        gradesByCategory[catName].push({
            x: grade.createdAt || Date.now(),
            y: grade.value,
            name: grade.name || ''
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
            pointRadius: 5,
            pointHoverRadius: 7,
            fill: false
        };
    });

    // If no data, show empty state
    if (datasets.length === 0) {
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#6b7280';
        ctx.fillText('No numeric grades yet', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    studentGradeChartInstance = new Chart(ctx, {
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
                        text: 'Date'
                    }
                },
                y: {
                    reverse: true, // Grade 1 at top
                    min: 1,
                    max: 5,
                    title: {
                        display: true,
                        text: 'Grade'
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
                            let label = `${context.dataset.label}: ${point.y}`;
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
        container.innerHTML = '<p class="text-sm" style="color: oklch(.708 0 0);">No grades yet.</p>';
        return;
    }

    container.innerHTML = Object.entries(gradesByCategory).map(([catId, category]) => {
        const numericGrades = category.grades.filter(g => !g.isPlusMinus);
        const plusMinusGrades = category.grades.filter(g => g.isPlusMinus);

        let avgText = '-';
        let gradeInfo = '';

        if (numericGrades.length > 0) {
            const avg = numericGrades.reduce((sum, g) => sum + g.value, 0) / numericGrades.length;
            avgText = avg.toFixed(2);
            gradeInfo = `${numericGrades.length} grade${numericGrades.length !== 1 ? 's' : ''}`;
        }

        if (plusMinusGrades.length > 0) {
            const plusCount = plusMinusGrades.filter(g => g.value === '+').length;
            const minusCount = plusMinusGrades.filter(g => g.value === '-').length;
            if (gradeInfo) gradeInfo += ', ';
            gradeInfo += `${plusCount}+ / ${minusCount}-`;
        }

        return `
            <div class="category-stat-card p-3 rounded-lg border">
                <div class="flex justify-between items-start mb-2">
                    <span class="font-medium">${escapeHtml(category.name)}</span>
                    <span class="badge badge-secondary text-xs">${(category.weight * 100).toFixed(0)}%</span>
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
const renderStudentGradesTable = (student) => {
    const tbody = document.getElementById("student-grades-table");

    // Sort grades by date (newest first)
    const sortedGrades = [...student.grades].sort((a, b) =>
        (b.createdAt || 0) - (a.createdAt || 0)
    );

    if (sortedGrades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="color: oklch(.708 0 0);">No grades yet.</td></tr>';
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

        const displayValue = grade.isPlusMinus ? grade.value : grade.value.toString();
        const gradeColorClass = getGradeColorClass(grade);
        const weightDisplay = grade.isPlusMinus ? '-' : `${(grade.weight * 100).toFixed(0)}%`;

        return `
            <tr>
                <td>${escapeHtml(date)}</td>
                <td>${escapeHtml(grade.categoryName || '-')}</td>
                <td>${escapeHtml(grade.name || '-')}</td>
                <td><span class="badge ${gradeColorClass}">${escapeHtml(displayValue)}</span></td>
                <td>${weightDisplay}</td>
            </tr>
        `;
    }).join('');
};