// ========== EXPORT/IMPORT ==========
const exportData = () => {
    const dataStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notenverwaltung_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showToast("Export successful!", "success");
};

// Function to handle the import of data
document.getElementById("import-setup").addEventListener("click", () => {
    document.getElementById("import-dialog").showModal();
});

document.getElementById("cancel-import").addEventListener("click", () => {
    document.getElementById("import-dialog").close();
});

document.getElementById("confirm-import").addEventListener("click", () => {
    const fileInput = document.getElementById("import-file");
    const file = fileInput.files[0];

    if (!file) {
        showAlertDialog("Please select a file.");
        return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        showAlertDialog("File is too large. Maximum size is 5MB.");
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const rawData = JSON.parse(event.target.result);

            // Validate the data structure
            // Kategorien sind jetzt global - Klassen brauchen kein categories-Array mehr
            if (rawData.teacherName && Array.isArray(rawData.classes)) {
                // Check if the data structure matches our expected format
                // Akzeptiere sowohl alte Struktur (categories pro Klasse) als auch neue (globale categories)
                const isValid = rawData.classes.every(cls =>
                    cls.id && cls.name && Array.isArray(cls.students)
                ) && (!rawData.categories || rawData.categories.every(cat =>
                    cat.id && cat.name && typeof cat.weight === 'number'
                )) && (!rawData.students || rawData.students.every(student =>
                    student.id && student.name && Array.isArray(student.grades)
                ));

                if (isValid) {
                    // Sanitize the imported data to prevent XSS
                    const sanitizedData = sanitizeImportData(rawData);

                    if (!sanitizedData) {
                        showAlertDialog("Error sanitizing imported data. The file may be corrupted.");
                        return;
                    }

                    // Load the sanitized data into the application
                    appData = sanitizedData;
                    saveData("Data imported successfully!", "success");

                    // Close the import dialog
                    document.getElementById("import-dialog").close();

                    // Hide the setup page and show the dashboard
                    document.getElementById("setup-page").classList.add("hidden");
                    document.getElementById("dashboard").classList.remove("hidden");
                    // Use teacherName or fallback to username
                    const displayName = appData.teacherName || window.currentUser.username;
                    document.getElementById("teacher-greeting").textContent = displayName;

                    // Render the UI with the imported data
                    renderClassList();
                    renderStudents();
                    renderCategoryFilter();
                } else {
                    showAlertDialog("Invalid data structure. Please make sure the JSON file is in the correct format.");
                }
            } else {
                showAlertDialog("Invalid data structure. Please make sure the JSON file is in the correct format.");
            }
        } catch (error) {
            showAlertDialog("Error parsing the JSON file. Please make sure it is a valid JSON file.");
        }
    };
    reader.readAsText(file);
});