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
        showAlertDialog('Error saving data. Please try again.');
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
    const studentNameInput = document.getElementById("student-name-input").value;

    // Validate student name
    const validation = validateStringInput(studentNameInput, 100);
    if (!validation.isValid) {
        showAlertDialog(validation.error);
        return;
    }

    addStudent(validation.value);
    document.getElementById("add-student-dialog").close();
    document.getElementById("student-name-input").value = ""; // Clear input
});

// Event listener for cancel button
document.getElementById("cancel-add-student").addEventListener("click", () => {
    document.getElementById("add-student-dialog").close();
    document.getElementById("student-name-input").value = ""; // Clear input
});

document.getElementById("manage-categories").addEventListener("click", () => {
    renderCategoryManagement();
    // Load current plus/minus grade settings
    const pmSettings = appData.plusMinusGradeSettings || { startGrade: 3, plusValue: 0.5, minusValue: 0.5 };
    document.getElementById("plusminus-start-grade").value = pmSettings.startGrade;
    document.getElementById("plusminus-plus-value").value = pmSettings.plusValue;
    document.getElementById("plusminus-minus-value").value = pmSettings.minusValue;

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

    document.getElementById("manage-categories-dialog").showModal();
});

document.getElementById("close-manage-categories").addEventListener("click", () => {
    document.getElementById("manage-categories-dialog").close();
});

// Event listener for cancel button in edit dialog
document.getElementById("cancel-edit").addEventListener("click", () => {
    document.getElementById("edit-dialog").close();
});

document.getElementById("save-plusminus-settings").addEventListener("click", () => {
    const startGrade = document.getElementById("plusminus-start-grade").value;
    const plusValue = document.getElementById("plusminus-plus-value").value;
    const minusValue = document.getElementById("plusminus-minus-value").value;
    updatePlusMinusGradeSettings(startGrade, plusValue, minusValue);
    showToast("Plus/Minus category settings saved!", "success");
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
        showToast("Grade percentage ranges saved!", "success");
    }
});

// Event-Listener fuer den Kategorie hinzufuegen Button im Dialog
document.getElementById("add-category").addEventListener("click", () => {
    const content = `
        <div class="grid gap-2">
          <label class="block mb-2">Category Name</label>
          <input type="text" name="name" class="input w-full" required>
          <p class="text-sm" style="color: oklch(.708 0 0);">Let's start by giving your new category a name. What would you like to call it?"</p>
        </div>
        <div class="grid gap-2">
          <label class="block mb-2">Weight (e.g., 0.5 for 50%)</label>
          <input type="number" name="weight" step="0.1" min="0.1" max="1" class="input w-full" required>
          <p class="text-sm" style="color: oklch(.708 0 0);">Now, let's set the weight for this category. How much should it contribute to the overall grade? Remember, you can always adjust this later."</p>
        </div>
        <div class="grid gap-2">
          <label class="flex items-center gap-2">
            <input type="checkbox" name="onlyPlusMinus" class="checkbox">
            <span>Plus/Minus only</span>
          </label>
          <p class="text-sm" style="color: oklch(.708 0 0);">Enable this for categories that only use +/- grades (no numeric grades). The final grade is calculated from the number of + and - entries.</p>
        </div>
      `;

    showDialog("edit-dialog", "Add Category", content, (formData) => {
        const onlyPlusMinus = formData.get("onlyPlusMinus") === "on";
        addCategory(formData.get("name"), formData.get("weight"), false, onlyPlusMinus);
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

    // Check if user has completed setup (has classes)
    if (appData.classes && appData.classes.length > 0) {
        document.getElementById("setup-page").classList.add("hidden");
        document.getElementById("dashboard").classList.remove("hidden");
        // Use teacherName or fallback to username
        const displayName = appData.teacherName || window.currentUser.username;
        document.getElementById("teacher-greeting").textContent = displayName;
        renderClassList();
        showHomeView();

        // Data is now stored on the server, show different message
        // showAlertDialog("Your data is synced to the server and stored securely.");

        // Tutorial fuer wiederkehrende User anzeigen (falls nicht abgeschlossen)
        if (appData.tutorial && !appData.tutorial.completed && !appData.tutorial.neverShowAgain) {
            setTimeout(() => {
                initTutorial();
            }, 1500);
        }
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

