// tutorial.js
// ========== INTERAKTIVES TUTORIAL SYSTEM ==========

// Tutorial State
let tutorialActive = false;
let currentStepIndex = 0;
let currentWaitListener = null; // Aktueller Event-Listener für Benutzeraktion
let dialogWasOpen = false; // Für Dialog-Schließen-Checks

/**
 * Tutorial-Schritte Definition
 * waitFor: Beschreibt worauf gewartet wird (selector + event oder custom check)
 * action: Wird ausgeführt bevor der Schritt angezeigt wird
 * onComplete: Wird ausgeführt wenn der Schritt abgeschlossen ist
 */
const TUTORIAL_STEPS = [
    {
        id: 'welcome',
        title: 'Welcome to EduGrade!',
        content: 'This interactive tour will guide you through EduGrade.\n\nYou\'ll learn by doing - creating a category, setting up grade ranges, adding a student, and managing grades!\n\nClick "Next" to begin.',
        targetSelector: null,
        position: 'center',
        manualNext: true // Benutzer muss "Next" klicken
    },
    {
        id: 'click-manage-categories',
        title: 'Step 1: Open Category Manager',
        content: 'First, let\'s create a grade category.\n\nClick the "Manage Categories" button to open the category manager.',
        targetSelector: '#manage-categories',
        position: 'bottom',
        waitFor: {
            selector: '#manage-categories',
            event: 'click'
        },
        action: () => {
            closeTutorialDialogs();
        }
    },
    {
        id: 'click-add-category',
        title: 'Add a Category',
        content: 'Now click "Add Category" to create your first grade category.\n\nCategories define grade types like "Schularbeit", "Test", or "Mitarbeit".',
        targetSelector: '#add-category',
        position: 'bottom',
        waitFor: {
            selector: '#add-category',
            event: 'click'
        },
        action: () => {
            // Dialog sollte schon offen sein, aber sicherstellen
            const dialog = document.getElementById("manage-categories-dialog");
            if (!dialog.open) {
                renderCategoryManagement();
                dialog.showModal();
            }
        }
    },
    {
        id: 'fill-category-form',
        title: 'Create Your Category',
        content: 'Fill in the form:\n\n1. Enter a name (e.g., "Schularbeit")\n2. Set the weight (e.g., 0.5 for 50%)\n3. Click "Save" to create it\n\nThe weight determines how much this category counts toward the final grade.',
        targetSelector: '#edit-dialog',
        position: 'right',
        waitFor: {
            check: () => appData.categories.length > 0,
            event: 'categoryAdded'
        }
    },
    {
        id: 'explain-grade-ranges-tab',
        title: 'Grade Ranges Tab',
        content: 'Notice the tabs at the top of this dialog:\n\n• Categories - Manage your grade categories\n• Grade Ranges - Set percentage thresholds\n• +/- Settings - Configure plus/minus grades\n\nClick the "Grade Ranges" tab to see the settings.',
        targetSelector: '#tab-percentage',
        position: 'bottom',
        waitFor: {
            selector: '#tab-percentage',
            event: 'click'
        },
        action: () => {
            // Schließe edit-dialog falls noch offen
            const editDialog = document.getElementById('edit-dialog');
            if (editDialog && editDialog.open) editDialog.close();
            // Stelle sicher dass manage-categories-dialog offen ist
            const dialog = document.getElementById("manage-categories-dialog");
            if (!dialog.open) {
                renderCategoryManagement();
                dialog.showModal();
            }
        }
    },
    {
        id: 'explain-percentage-settings-and-close',
        title: 'Grade Ranges Explained',
        content: 'Here you configure percentage-to-grade conversion:\n\n• Grade 1: 85-100% (Sehr Gut)\n• Grade 2: 70-84% (Gut)\n• Grade 3: 55-69% (Befriedigend)\n• Grade 4: 40-54% (Genügend)\n• Grade 5: 0-39% (Nicht Genügend)\n\nThese are used when entering grades as percentages.\n\nClose this dialog to continue.',
        targetSelector: '#close-manage-categories',
        position: 'left',
        waitFor: {
            dialogCloseEvent: 'manage-categories-dialog'
        }
    },
    {
        id: 'click-add-student',
        title: 'Step 2: Add a Student',
        content: 'Now let\'s add a student to your class.\n\nClick the "Add Student" button.',
        targetSelector: '#add-student',
        position: 'bottom',
        waitFor: {
            selector: '#add-student',
            event: 'click'
        }
    },
    {
        id: 'fill-student-form',
        title: 'Enter Student Name',
        content: 'Enter the student\'s name and click "Add".\n\nYou can use any name you like!',
        targetSelector: '#add-student-dialog',
        position: 'right',
        waitFor: {
            check: () => {
                const currentClass = appData.classes.find(c => c.id === appData.currentClassId);
                return currentClass && currentClass.students.length > 0;
            },
            event: 'studentAdded'
        }
    },
    {
        id: 'click-add-grade',
        title: 'Step 3: Add a Grade',
        content: 'Your student is ready for grades!\n\nClick the + button in the student\'s row to add a grade.',
        targetSelector: '[data-add-grade]',
        position: 'left',
        waitFor: {
            selector: '[data-add-grade]',
            event: 'click'
        },
        action: () => {
            // Stelle sicher, dass der Student sichtbar ist
            renderStudents();
        }
    },
    {
        id: 'fill-grade-form',
        title: 'Enter the Grade',
        content: 'Fill in the grade form:\n\n1. Select a category\n2. Choose input method:\n   • "Grade" tab: Enter grade directly (1-6)\n   • "Percentage" tab: Enter % and auto-convert\n3. Optionally add a name (e.g., "SA1")\n4. Click "Save"\n\nTry entering a percentage like 87% to see it convert to a grade!',
        targetSelector: '#edit-dialog',
        position: 'right',
        waitFor: {
            check: () => {
                const currentClass = appData.classes.find(c => c.id === appData.currentClassId);
                const student = currentClass?.students[0];
                return student && student.grades && student.grades.length > 0;
            },
            event: 'gradeAdded'
        }
    },
    {
        id: 'view-results',
        title: 'Grade Added!',
        content: 'Look at the table - you can see:\n\n• The grade badge (color-coded by performance)\n   Green = good, Red = needs improvement\n• The calculated average\n• The final grade (1-5)\n\nClick "Next" to continue.',
        targetSelector: '.student-table-container',
        position: 'top',
        manualNext: true,
        action: () => {
            closeTutorialDialogs();
            renderStudents();
        }
    },
    {
        id: 'edit-grade-dialog',
        title: 'Editing Grades',
        content: 'Click on any grade badge to edit it.\n\nIn the edit dialog you can:\n\n• Switch between Grade/Percentage tabs\n• Change the value\n• Update the name\n• Delete the grade\n\nIf you entered via %, the Percentage tab opens automatically!\n\nClick "Next" to continue.',
        targetSelector: null,
        position: 'center',
        manualNext: true
    },
    {
        id: 'complete',
        title: 'Congratulations!',
        content: 'You\'ve mastered the basics of EduGrade!\n\nKey features:\n• Create categories with weights\n• Configure grade ranges (Grade Ranges tab)\n• Enter grades directly or as percentages\n• Color-coded badges show performance\n• Click badges to edit grades\n• Export your data regularly!\n\nHappy grading!',
        targetSelector: null,
        position: 'center',
        manualNext: true
    }
];

/**
 * Schließt alle Dialoge
 */
const closeTutorialDialogs = () => {
    document.querySelectorAll('dialog[open]').forEach(d => {
        d.close();
    });
};

/**
 * Initialize tutorial
 */
const initTutorial = () => {
    if (!appData.tutorial) {
        appData.tutorial = {
            completed: false,
            currentStep: 0,
            neverShowAgain: false
        };
    }

    if (appData.tutorial.completed || appData.tutorial.neverShowAgain) {
        return;
    }

    currentStepIndex = appData.tutorial.currentStep || 0;
    showTutorialPrompt();
};

/**
 * Zeigt den initialen Prompt
 */
const showTutorialPrompt = () => {
    const promptEl = document.createElement('div');
    promptEl.className = 'tutorial-prompt';
    promptEl.innerHTML = `
        <div class="tutorial-overlay"></div>
        <div class="tutorial-dialog" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);">
            <h3 class="text-xl font-semibold mb-3">Would you like a quick tour?</h3>
            <p class="mb-4" style="color: oklch(.708 0 0);">Learn by doing! You'll create a category, add a student, and manage grades yourself.</p>
            <div class="flex justify-between items-center">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" class="checkbox" id="tutorial-never-again">
                    <span class="text-sm" style="color: oklch(.708 0 0);">Don't show again</span>
                </label>
                <div class="flex gap-2">
                    <button type="button" class="btn-outline" id="tutorial-skip">Skip</button>
                    <button type="button" class="btn-primary" id="tutorial-start">Start Tour</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(promptEl);

    document.getElementById('tutorial-start').addEventListener('click', () => {
        promptEl.remove();
        startTutorial();
    });

    document.getElementById('tutorial-skip').addEventListener('click', () => {
        const neverAgain = document.getElementById('tutorial-never-again').checked;
        promptEl.remove();
        skipTutorial(neverAgain);
    });
};

/**
 * Startet das Tutorial
 */
const startTutorial = () => {
    tutorialActive = true;
    currentStepIndex = 0;

    // Markiere body als tutorial-active (für CSS)
    document.body.classList.add('tutorial-active');

    // Stelle sicher, dass wir in der Class-View sind
    if (appData.classes.length > 0) {
        if (!appData.currentClassId) {
            appData.currentClassId = appData.classes[0].id;
        }
        showClassView();
    }

    showStep(currentStepIndex);
};

/**
 * Zeigt einen Tutorial-Schritt
 */
const showStep = (stepIndex) => {
    // Cleanup vorheriger Schritt
    cleanupTutorialUI();
    removeWaitListener();

    const step = TUTORIAL_STEPS[stepIndex];
    if (!step) {
        completeTutorial();
        return;
    }

    // Führe Aktion aus
    if (step.action) {
        step.action();
    }

    // Kurze Verzögerung für DOM-Updates
    setTimeout(() => {
        renderTutorialStep(step, stepIndex);

        // Setup wait listener wenn nicht manualNext
        if (!step.manualNext && step.waitFor) {
            setupWaitListener(step);
        }
    }, 200);
};

/**
 * Rendert den Tutorial-Schritt
 * Verwendet ein fixes div Element statt dialog, um Interaktion mit anderen Dialogen zu ermöglichen
 */
const renderTutorialStep = (step, stepIndex) => {
    // Target highlighten (bevor Dialog geöffnet wird)
    if (step.targetSelector) {
        const targetElement = document.querySelector(step.targetSelector);
        if (targetElement) {
            targetElement.classList.add('tutorial-spotlight');

            if (!targetElement.closest('dialog')) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    // Progress
    const progressDots = TUTORIAL_STEPS.map((_, i) => {
        let dotClass = 'tutorial-progress-dot';
        if (i < stepIndex) dotClass += ' completed';
        else if (i === stepIndex) dotClass += ' active';
        return `<div class="${dotClass}"></div>`;
    }).join('');

    const stepNumber = `${stepIndex + 1}/${TUTORIAL_STEPS.length}`;
    const isLastStep = stepIndex === TUTORIAL_STEPS.length - 1;
    const showNextButton = step.manualNext;

    // Hinweis wenn auf Aktion gewartet wird
    const waitingHint = !step.manualNext && step.waitFor
        ? '<p class="text-xs mt-2" style="color: #3b82f6;">Waiting for your action...</p>'
        : '';

    // Erstelle ein fixes div Element statt dialog (kein blocking von anderen Elementen)
    const tutorialBox = document.createElement('div');
    tutorialBox.className = 'tutorial-floating-box';
    tutorialBox.innerHTML = `
        <div class="tutorial-dialog-content">
            <div class="flex justify-between items-center mb-2">
                <div class="tutorial-progress">${progressDots}</div>
                <span class="text-xs" style="color: oklch(.708 0 0);">${stepNumber}</span>
            </div>
            <h3 class="text-lg font-semibold mb-2">${escapeHtml(step.title)}</h3>
            <p class="mb-4" style="color: oklch(.708 0 0); white-space: pre-line;">${escapeHtml(step.content)}</p>
            ${waitingHint}
            <div class="flex justify-between items-center mt-4">
                <button type="button" class="btn-outline" id="tutorial-skip-btn">
                    Skip Tour
                </button>
                <div class="flex gap-2">
                    ${stepIndex > 0 ? '<button type="button" class="btn-outline" id="tutorial-back-btn">Back</button>' : ''}
                    ${showNextButton ? `<button type="button" class="btn-primary" id="tutorial-next-btn">${isLastStep ? 'Finish' : 'Next'}</button>` : ''}
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(tutorialBox);

    // Event Listeners
    if (showNextButton) {
        document.getElementById('tutorial-next-btn').addEventListener('click', nextStep);
    }

    if (stepIndex > 0) {
        const backBtn = document.getElementById('tutorial-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', prevStep);
        }
    }

    document.getElementById('tutorial-skip-btn').addEventListener('click', () => {
        skipTutorial(false);
    });

    // Keyboard
    const handleKeydown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault(); // Verhindere dass andere Dialoge geschlossen werden
            skipTutorial(false);
        } else if ((e.key === 'ArrowRight' || e.key === 'Enter') && showNextButton) {
            nextStep();
        } else if (e.key === 'ArrowLeft' && stepIndex > 0) {
            prevStep();
        }
    };
    document.addEventListener('keydown', handleKeydown);
    tutorialBox._keydownHandler = handleKeydown;

    // Fortschritt speichern
    appData.tutorial.currentStep = stepIndex;
    saveData('', 'info');
};

/**
 * Setup listener für Benutzeraktion
 */
const setupWaitListener = (step) => {
    const waitFor = step.waitFor;

    if (waitFor.dialogCloseEvent) {
        // Warte auf Dialog close Event
        const dialog = document.getElementById(waitFor.dialogCloseEvent);
        if (dialog) {
            const handler = () => {
                setTimeout(() => {
                    nextStep();
                }, 200);
            };
            dialog.addEventListener('close', handler, { once: true });
            currentWaitListener = { element: dialog, event: 'close', handler };
        }
    } else if (waitFor.selector && waitFor.event) {
        // Warte auf Klick auf Element
        const element = document.querySelector(waitFor.selector);
        if (element) {
            const handler = () => {
                // Kleine Verzögerung damit die Aktion ausgeführt werden kann
                setTimeout(() => {
                    nextStep();
                }, 100);
            };
            element.addEventListener(waitFor.event, handler, { once: true });
            currentWaitListener = { element, event: waitFor.event, handler };
        }
    } else if (waitFor.check) {
        // Polling für Zustandsänderung
        const interval = waitFor.interval || 300;
        const checkInterval = setInterval(() => {
            if (waitFor.check()) {
                clearInterval(checkInterval);
                setTimeout(() => {
                    nextStep();
                }, 300);
            }
        }, interval);
        currentWaitListener = { interval: checkInterval };
    }
};

/**
 * Entfernt den aktuellen Wait-Listener
 */
const removeWaitListener = () => {
    if (currentWaitListener) {
        if (currentWaitListener.interval) {
            clearInterval(currentWaitListener.interval);
        }
        if (currentWaitListener.element && currentWaitListener.handler) {
            currentWaitListener.element.removeEventListener(
                currentWaitListener.event,
                currentWaitListener.handler
            );
        }
        currentWaitListener = null;
    }
};

/**
 * Berechnet Dialog-Position
 */
const calculateDialogPosition = (targetRect, position) => {
    if (!targetRect || position === 'center') {
        return 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);';
    }

    const padding = 20;
    const dialogWidth = 380;
    const dialogHeight = 300;

    let top, left;

    switch (position) {
        case 'top':
            top = targetRect.top - dialogHeight - padding;
            left = targetRect.left + (targetRect.width / 2) - (dialogWidth / 2);
            break;
        case 'bottom':
            top = targetRect.bottom + padding;
            left = targetRect.left + (targetRect.width / 2) - (dialogWidth / 2);
            break;
        case 'left':
            top = targetRect.top + (targetRect.height / 2) - (dialogHeight / 2);
            left = targetRect.left - dialogWidth - padding;
            break;
        case 'right':
            top = targetRect.top + (targetRect.height / 2) - (dialogHeight / 2);
            left = targetRect.right + padding;
            break;
        default:
            top = targetRect.bottom + padding;
            left = targetRect.left;
    }

    // Viewport-Grenzen
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (left < padding) left = padding;
    if (left + dialogWidth > viewportWidth - padding) left = viewportWidth - dialogWidth - padding;
    if (top < padding) top = padding;
    if (top + dialogHeight > viewportHeight - padding) top = viewportHeight - dialogHeight - padding;

    return `position: fixed; top: ${top}px; left: ${left}px;`;
};

/**
 * Nächster Schritt
 */
const nextStep = () => {
    currentStepIndex++;
    if (currentStepIndex >= TUTORIAL_STEPS.length) {
        completeTutorial();
    } else {
        showStep(currentStepIndex);
    }
};

/**
 * Vorheriger Schritt
 */
const prevStep = () => {
    if (currentStepIndex > 0) {
        currentStepIndex--;
        showStep(currentStepIndex);
    }
};

/**
 * Tutorial überspringen
 */
const skipTutorial = (neverShowAgain) => {
    tutorialActive = false;
    document.body.classList.remove('tutorial-active');
    cleanupTutorialUI();
    removeWaitListener();
    closeTutorialDialogs();

    appData.tutorial.completed = true;
    appData.tutorial.neverShowAgain = neverShowAgain;
    saveData('Tutorial skipped', 'info');
};

/**
 * Tutorial abschließen
 */
const completeTutorial = () => {
    tutorialActive = false;
    document.body.classList.remove('tutorial-active');
    cleanupTutorialUI();
    removeWaitListener();
    closeTutorialDialogs();

    appData.tutorial.completed = true;
    appData.tutorial.currentStep = TUTORIAL_STEPS.length;
    saveData('Tutorial completed! You\'re ready to start grading.', 'success');
};

/**
 * Cleanup UI
 */
const cleanupTutorialUI = () => {
    // Tutorial floating box entfernen
    const floatingBox = document.querySelector('.tutorial-floating-box');
    if (floatingBox) {
        if (floatingBox._keydownHandler) {
            document.removeEventListener('keydown', floatingBox._keydownHandler);
        }
        floatingBox.remove();
    }

    // Natives Tutorial-Dialog entfernen (legacy)
    const nativeDialog = document.querySelector('.tutorial-native-dialog');
    if (nativeDialog) {
        if (nativeDialog._keydownHandler) {
            document.removeEventListener('keydown', nativeDialog._keydownHandler);
        }
        if (nativeDialog.close) nativeDialog.close();
        nativeDialog.remove();
    }

    // Altes Container-System (falls noch vorhanden)
    const container = document.querySelector('.tutorial-container');
    if (container) {
        if (container._keydownHandler) {
            document.removeEventListener('keydown', container._keydownHandler);
        }
        container.remove();
    }

    const prompt = document.querySelector('.tutorial-prompt');
    if (prompt) prompt.remove();

    document.querySelectorAll('.tutorial-spotlight').forEach(el => {
        el.classList.remove('tutorial-spotlight');
    });
};

/**
 * Tutorial zurücksetzen (Konsole: resetTutorial())
 */
const resetTutorial = () => {
    appData.tutorial = {
        completed: false,
        currentStep: 0,
        neverShowAgain: false
    };
    saveData('Tutorial reset - refresh the page to see it again', 'info');
};
