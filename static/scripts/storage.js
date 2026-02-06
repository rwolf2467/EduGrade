// storage.js
// This file manages saving and loading data via API.
// Data is stored both locally (localStorage) and on the server.

/**
 * STORAGE STRATEGY
 *
 * - Server is the PRIMARY data source
 * - LocalStorage serves as cache/backup
 * - Data is first sent to the server
 * - On success, data is also saved locally (for offline use)
 * - On server error, data is saved locally and a warning is shown
 *
 * Key for LocalStorage: "notenverwaltung"
 */

// Debounce timer for API calls
let saveDebounceTimer = null;
const SAVE_DEBOUNCE_MS = 500;

// ============ HEARTBEAT SYSTEM ============
// Keeps server-side cache alive while page is open

const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
let heartbeatTimer = null;

const startHeartbeat = () => {
    // Clear any existing timer
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
    }

    // Send heartbeat immediately
    sendHeartbeat();

    // Then send every 30 seconds
    heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
};

const sendHeartbeat = async () => {
    try {
        await fetch('/api/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        // Silently ignore heartbeat errors
        console.debug('Heartbeat failed:', error);
    }
};

const stopHeartbeat = () => {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
};

// Notify server when page is closed to clear cache
const notifyDisconnect = () => {
    // Use sendBeacon for reliable delivery on page close
    navigator.sendBeacon('/api/disconnect', JSON.stringify({}));
};

// Start heartbeat when page loads
document.addEventListener('DOMContentLoaded', startHeartbeat);

// Stop heartbeat and notify disconnect when page closes
window.addEventListener('pagehide', () => {
    stopHeartbeat();
    notifyDisconnect();
});

// Also handle visibility change (tab hidden for long time)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopHeartbeat();
    } else {
        startHeartbeat();
    }
});

// Event listener for window close to ensure data is saved
window.addEventListener('beforeunload', async (e) => {
    // If there are pending save operations, save immediately
    if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);

        // Attempt immediate synchronization
        try {
            const response = await fetch('/api/data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(appData)
            });

            if (!response.ok) {
                // If server is unavailable, save locally
                localStorage.setItem("notenverwaltung", JSON.stringify(appData));
                localStorage.setItem('pendingServerSync', 'true');
            }
        } catch (error) {
            // On network error, save locally
            localStorage.setItem("notenverwaltung", JSON.stringify(appData));
            localStorage.setItem('pendingServerSync', 'true');
        }
    }
});

/**
 * SAVE DATA
 *
 * Saves the complete appData object locally and on the server.
 * Shows a toast notification afterwards.
 *
 * @param {string} message - The message to display (Default: "Data saved!")
 * @param {string} type - Toast type: "success", "error", "info" (Default: "success")
 */
const saveData = (message = "Data saved!", type = "success") => {
    // Debug output in browser console (F12 -> Console)
    console.log("Saving data:", appData);

    // Create personalized message
    const teacherName = appData.teacherName || "there";
    const personalizedMessage = message.replace("successfully", `successfully, ${teacherName}`);

    // Show toast notification
    showToast(personalizedMessage, type);

    // Debounced API call to server (primary storage)
    if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
    }

    saveDebounceTimer = setTimeout(async () => {
        try {
            const response = await fetch('/api/data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(appData)
            });

            if (response.ok) {
                console.log('Data saved to server successfully');
                // After successful server save, also save locally (as cache)
                localStorage.setItem("notenverwaltung", JSON.stringify(appData));
                // Reset error counter
                localStorage.removeItem('pendingServerSync');
            } else if (response.status === 401) {
                // Session expired or no encryption key - need to re-login
                const data = await response.json();
                console.warn('Session expired:', data.message);
                localStorage.setItem("notenverwaltung", JSON.stringify(appData));
                localStorage.setItem('pendingServerSync', 'true');
                // Show alert and redirect to login
                showSessionExpiredDialog(data.message || "Your session has expired. Please log in again to save your data securely.");
            } else if (response.status === 429) {
                // Rate limited - show prominent dialog
                const data = await response.json();
                console.warn('Rate limited:', data.message);
                localStorage.setItem("notenverwaltung", JSON.stringify(appData));
                localStorage.setItem('pendingServerSync', 'true');
                showRateLimitDialog(data.message || "You've made too many requests. Please wait a moment before trying again.");
            } else {
                console.error('Server save failed:', response.statusText);
                // On server error, save locally as backup and mark for later sync
                localStorage.setItem("notenverwaltung", JSON.stringify(appData));
                localStorage.setItem('pendingServerSync', 'true');
                showToast(t("toast.localSyncFailed"), "warning");
            }
        } catch (error) {
            console.error('Error saving to server:', error);
            // On network error, save locally as backup and mark for later sync
            localStorage.setItem("notenverwaltung", JSON.stringify(appData));
            localStorage.setItem('pendingServerSync', 'true');
            showToast(t("toast.localNetworkError"), "warning");
        }
    }, SAVE_DEBOUNCE_MS);
};


/**
 * LOAD DATA
 *
 * Loads saved data from the server.
 * Falls back to localStorage if server is unavailable.
 *
 * Called on application start (DOMContentLoaded).
 */
const loadData = async () => {
    console.log("Loading data from server...");

    // Show loading overlay while decrypting data
    showLoadingOverlay(t('loading.loadingData'), t('loading.decrypting'));

    try {
        // Try to load data from server
        const response = await fetch('/api/data');

        if (response.ok) {
            const serverData = await response.json();
            console.log("Loaded data from server:", serverData);

            // Use server data (primary data source)
            appData = serverData;

            // Also save locally as cache
            localStorage.setItem("notenverwaltung", JSON.stringify(appData));

            // Check for pending synchronizations
            await checkPendingSync();
        } else if (response.status === 401) {
            // Not logged in - redirect to login page
            hideLoadingOverlay();
            window.location.href = '/login';
            return;
        } else {
            // Server error - try local data
            console.warn("Server error, trying localStorage...");
            loadFromLocalStorage();

            // Check for pending synchronizations
            await checkPendingSync();
        }
    } catch (error) {
        // Network error - try local data
        console.warn("Network error, trying localStorage:", error);
        loadFromLocalStorage();

        // Check for pending synchronizations
        await checkPendingSync();
    }

    // Migration and initialization
    migrateData();

    // Sync language from server data to i18n engine
    if (appData.language && appData.language !== I18n.getCurrentLanguage()) {
        I18n.setLanguage(appData.language);
    }

    // Hide loading overlay after data is loaded
    hideLoadingOverlay();
};

/**
 * LOAD DATA FROM LOCALSTORAGE (Fallback)
 */
const loadFromLocalStorage = () => {
    const data = localStorage.getItem("notenverwaltung");

    if (data) {
        try {
            appData = JSON.parse(data);
            console.log("Loaded data from localStorage (fallback):", appData);
            showToast(t("toast.usingLocalData"), "warning");
        } catch (e) {
            console.error("Error parsing localStorage data:", e);
            showToast(t("toast.errorLoadingLocal"), "error");
        }
    } else {
        console.log("No local data available");
        showToast(t("toast.noLocalData"), "info");
    }
};

/**
 * CHECK PENDING SYNCHRONIZATION
 *
 * Checks if there is local data that hasn't been synchronized with the server
 * and attempts to synchronize.
 */
const checkPendingSync = async () => {
    if (localStorage.getItem('pendingServerSync') === 'true') {
        console.log('Found pending server sync, attempting to synchronize...');

        const localData = localStorage.getItem('notenverwaltung');
        if (localData) {
            try {
                const response = await fetch('/api/data', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: localData
                });

                if (response.ok) {
                    console.log('Pending data synchronized successfully');
                    localStorage.removeItem('pendingServerSync');
                    showToast(t('toast.pendingSynced'), 'success');
                } else {
                    console.error('Sync failed, will retry later');
                }
            } catch (error) {
                console.error('Sync error, will retry later:', error);
            }
        }
    }
};

/**
 * DATA MIGRATION
 *
 * Ensures old data structures are compatible.
 */
const migrateData = () => {
    // If classes exist, set the first one as current
    if (appData.classes && appData.classes.length > 0 && !appData.currentClassId) {
        appData.currentClassId = appData.classes[0].id;
    }

    // MIGRATION: Make old data compatible
    if (!appData.participationSettings) {
        appData.participationSettings = { plusValue: 0.1, minusValue: 0.1 };
    }

    // MIGRATION: Initialize participation array for existing students
    if (appData.classes) {
        appData.classes.forEach(cls => {
            if (cls.students) {
                cls.students.forEach(student => {
                    if (!student.participation) {
                        student.participation = [];
                    }
                });
            }
        });
    }

    // MIGRATION: Move categories from class level to global level
    if (!appData.categories) {
        appData.categories = [];
    }

    // Collect all categories from classes and add to global categories
    const existingCategoryIds = new Set(appData.categories.map(c => c.id));
    if (appData.classes) {
        appData.classes.forEach(cls => {
            if (cls.categories && Array.isArray(cls.categories)) {
                cls.categories.forEach(cat => {
                    if (!existingCategoryIds.has(cat.id)) {
                        appData.categories.push(cat);
                        existingCategoryIds.add(cat.id);
                    }
                });
                delete cls.categories;
            }
        });
    }

    // MIGRATION: Initialize percentage ranges for grades (if not present)
    if (!appData.gradePercentageRanges) {
        appData.gradePercentageRanges = [
            { grade: 1, minPercent: 85, maxPercent: 100 },
            { grade: 2, minPercent: 70, maxPercent: 84 },
            { grade: 3, minPercent: 55, maxPercent: 69 },
            { grade: 4, minPercent: 40, maxPercent: 54 },
            { grade: 5, minPercent: 0, maxPercent: 39 }
        ];
    }

    // MIGRATION: Tutorial status
    if (!appData.tutorial) {
        appData.tutorial = {
            completed: false,
            currentStep: 0,
            neverShowAgain: false
        };
    }

    // Add language field
    if (!appData.language) {
        appData.language = I18n.getCurrentLanguage();
    }

    // MIGRATION: plusMinusGradeSettings
    if (!appData.plusMinusGradeSettings) {
        appData.plusMinusGradeSettings = {
            startGrade: 3,
            plusValue: 0.5,
            minusValue: 0.5
        };
    }

    // MIGRATION: Ensure all grades have the correct structure
    if (appData.classes) {
        appData.classes.forEach(cls => {
            if (cls.students) {
                cls.students.forEach(student => {
                    if (student.grades) {
                        student.grades.forEach((grade, index) => {
                            // Ensure categoryName and weight are present
                            if (!grade.categoryName && grade.categoryId) {
                                const category = appData.categories.find(c => c.id === grade.categoryId);
                                if (category) {
                                    grade.categoryName = category.name;
                                    grade.weight = category.weight;
                                }
                            }
                            // MIGRATION: Add createdAt timestamp if missing
                            // Use grade ID as timestamp (IDs are based on Date.now())
                            // or fallback to sequential timestamps
                            if (!grade.createdAt) {
                                const idAsTimestamp = parseInt(grade.id, 10);
                                if (!isNaN(idAsTimestamp) && idAsTimestamp > 1000000000000) {
                                    // ID looks like a timestamp (after year 2001)
                                    grade.createdAt = idAsTimestamp;
                                } else {
                                    // Fallback: use a sequential timestamp based on index
                                    // Start from a base date and add index * 1 day
                                    const baseDate = Date.now() - (student.grades.length - index) * 86400000;
                                    grade.createdAt = baseDate;
                                }
                            }
                        });
                    }
                });
            }
        });
    }

    // Data after migration
    // No automatic saving - data will be saved when user makes next change
    console.log("Data migration completed - changes will be saved on next user action");
};
