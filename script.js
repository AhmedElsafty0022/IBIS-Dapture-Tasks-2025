document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed");

    // Firebase Configuration
    const firebaseConfig = {
        apiKey: "AIzaSyBeebZLl4vpeD-NI3b1ZASPllENBs6loOs",
        authDomain: "dapture-company-task-manager.firebaseapp.com",
        databaseURL: "https://dapture-company-task-manager-default-rtdb.firebaseio.com",
        projectId: "dapture-company-task-manager",
        storageBucket: "dapture-company-task-manager.firebasestorage.app",
        messagingSenderId: "962797299889",
        appId: "1:962797299889:web:c13b539751cb473a335a90"
    };

    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();

    // Predefined Companies/TAs
    const predefinedCompanies = [
        'Booking.com',
        'Agoda.com',
        'Walkin',
        'Mr. Shahid',
        'Ms. Nancy',
        'Mr. Francis'
    ];

    // Global variables
    let editingTaskId = null;
    let touchStartX = 0;
    let touchEndX = 0;
    let selectedTasks = new Set();
    let companies = [...predefinedCompanies];

    // DOM elements
    const addTaskBtn = document.getElementById('addTaskBtn');
    const quickAddBtn = document.getElementById('quickAddBtn');
    const taskModal = document.getElementById('taskModal');
    const modalTitle = document.getElementById('modalTitle');
    const submitBtn = document.getElementById('submitBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const clearTasksBtn = document.getElementById('clearTasksBtn');
    const searchInput = document.getElementById('searchInput');
    const sortTasks = document.getElementById('sportTasks');
    const filterPriority = document.getElementById('filterPriority');
    const tagFilter = document.getElementById('tagFilter');
    const viewArchiveBtn = document.getElementById('viewArchiveBtn');
    const archiveModal = document.getElementById('archiveModal');
    const closeArchiveBtn = document.getElementById('closeArchiveBtn');
    const historyModal = document.getElementById('historyModal');
    const closeHistoryBtn = document.getElementById('closeHistoryBtn');
    const notification = document.getElementById('notification');
    const taskCategory = document.getElementById('taskCategory');
    const checkOutTimeField = document.getElementById('checkOutTimeField');
    const newReservationIdField = document.getElementById('newReservationIdField');
    const assignedToField = document.getElementById('assignedToField');
    const quickAddButtons = document.querySelectorAll('.quick-add-btn');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const bulkArchiveBtn = document.getElementById('bulkArchiveBtn');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    const exportTasksBtn = document.getElementById('exportTasksBtn');
    const importTasksBtn = document.getElementById('importTasksBtn');
    const importFileInput = document.getElementById('importFileInput');
    const taskAssignedTo = document.getElementById('taskAssignedTo');

    // Load dark mode preference
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark');
    }

    // Load companies from Firebase
    db.ref('companies').on('value', (snapshot) => {
        const customCompanies = snapshot.val() ? Object.values(snapshot.val()) : [];
        companies = [...new Set([...predefinedCompanies, ...customCompanies])];
        console.log('Loaded companies:', companies);
    });

    // Initial load of tasks
    try {
        db.ref('tasks').on('value', (snapshot) => {
            const tasks = snapshot.val() ? Object.values(snapshot.val()) : [];
            renderTasks();
            checkReminders(tasks);
        });
        db.ref('archive').on('value', () => renderArchive());
    } catch (error) {
        console.error("Error loading tasks:", error);
        showNotification('Error loading tasks. Please try importing a backup.');
    }

    // Dark Mode Toggle
    darkModeToggle?.addEventListener('click', () => {
        document.body.classList.toggle('dark');
        localStorage.setItem('darkMode', document.body.classList.contains('dark') ? 'enabled' : 'disabled');
        darkModeToggle.innerHTML = document.body.classList.contains('dark')
            ? '<i class="fas fa-sun mr-1 sm:mr-2"></i>Toggle Light Mode'
            : '<i class="fas fa-moon mr-1 sm:mr-2"></i>Toggle Dark Mode';
    });

    // Export Tasks
    exportTasksBtn?.addEventListener('click', async () => {
        try {
            const tasksSnapshot = await db.ref('tasks').once('value');
            const archiveSnapshot = await db.ref('archive').once('value');
            const historySnapshot = await db.ref('history').once('value');
            const companiesSnapshot = await db.ref('companies').once('value');
            const data = {
                tasks: tasksSnapshot.val() ? Object.values(tasksSnapshot.val()) : [],
                archive: archiveSnapshot.val() ? Object.values(archiveSnapshot.val()) : [],
                history: historySnapshot.val() ? Object.values(historySnapshot.val()) : [],
                companies: companiesSnapshot.val() ? Object.values(companiesSnapshot.val()) : []
            };
            const dataStr = JSON.stringify(data, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `task_manager_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showNotification('Tasks exported successfully!');
        } catch (error) {
            console.error("Error exporting data:", error);
            showNotification('Error exporting data.');
        }
    });

    // Import Tasks
    importTasksBtn?.addEventListener('click', () => importFileInput.click());
    importFileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.tasks) {
                    const sanitizedTasks = data.tasks.map(task => {
                        const { linkedRoomId, ...rest } = task; // Remove linkedRoomId
                        return rest;
                    });
                    await db.ref('tasks').set(sanitizedTasks.reduce((acc, task) => {
                        acc[task.id] = task;
                        return acc;
                    }, {}));
                }
                if (data.archive) {
                    const sanitizedArchive = data.archive.map(task => {
                        const { linkedRoomId, ...rest } = task; // Remove linkedRoomId
                        return rest;
                    });
                    await db.ref('archive').set(sanitizedArchive.reduce((acc, task) => {
                        acc[task.id] = task;
                        return acc;
                    }, {}));
                }
                if (data.history) {
                    await db.ref('history').set(data.history.reduce((acc, entry) => {
                        acc[Date.now() + Math.random()] = entry;
                        return acc;
                    }, {}));
                }
                if (data.companies) {
                    await db.ref('companies').set(data.companies.reduce((acc, company, index) => {
                        acc[index] = company;
                        return acc;
                    }, {}));
                }
                showNotification('Data imported successfully!');
            } catch (error) {
                console.error("Error importing data:", error);
                showNotification('Error importing data. Please check the file format.');
            }
        };
        reader.readAsText(file);
    });

    // Autocomplete for Company To
    let autocompleteTimeout;
    const autocompleteContainer = document.createElement('div');
    autocompleteContainer.classList.add('autocomplete-container');
    taskAssignedTo.parentNode.insertBefore(autocompleteContainer, taskAssignedTo);
    autocompleteContainer.appendChild(taskAssignedTo);

    const autocompleteList = document.createElement('div');
    autocompleteList.classList.add('autocomplete-list');
    autocompleteContainer.appendChild(autocompleteList);

    taskAssignedTo.addEventListener('input', () => {
        clearTimeout(autocompleteTimeout);
        autocompleteTimeout = setTimeout(() => {
            const query = taskAssignedTo.value.trim().toLowerCase();
            autocompleteList.innerHTML = '';
            if (!query) return;
            const matches = companies.filter(company => company.toLowerCase().includes(query));
            if (matches.length === 0) return;
            matches.forEach(company => {
                const div = document.createElement('div');
                div.textContent = company;
                div.addEventListener('click', () => {
                    taskAssignedTo.value = company;
                    autocompleteList.innerHTML = '';
                });
                autocompleteList.appendChild(div);
            });
        }, 300);
    });

    taskAssignedTo.addEventListener('blur', () => {
        setTimeout(() => {
            autocompleteList.innerHTML = '';
        }, 200);
    });

    // Open Modal for Adding Task
    addTaskBtn?.addEventListener('click', () => {
        console.log("Add Task button clicked");
        openTaskModal('Add New Task', 'Add Task');
    });

    quickAddBtn?.addEventListener('click', () => {
        console.log("Quick Add FAB clicked");
        openTaskModal('Add New Task', 'Add Task');
    });

    // Quick Add Buttons in Each Column
    quickAddButtons.forEach(button => {
        button?.addEventListener('click', () => {
            const category = button.getAttribute('data-category');
            console.log(`Quick Add button clicked for category: ${category}`);
            openTaskModal('Quick Add Task', 'Add Task', category);
        });
    });

    // Cancel Modal
    cancelBtn?.addEventListener('click', () => {
        console.log("Cancel button clicked");
        taskModal.classList.add('hidden');
        resetForm();
    });

    // ESC to Close Modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            taskModal.classList.add('hidden');
            archiveModal.classList.add('hidden');
            historyModal.classList.add('hidden');
            resetForm();
        }
    });

    // CTRL+S to Save Task
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (!taskModal.classList.contains('hidden')) {
                submitBtn.click();
            }
        }
    });

    // Clear All Tasks
    clearTasksBtn?.addEventListener('click', async () => {
        console.log("Clear All button clicked");
        if (confirm('Are you sure you want to clear all tasks, archives, history, and companies?')) {
            try {
                await db.ref('tasks').remove();
                await db.ref('archive').remove();
                await db.ref('history').remove();
                await db.ref('companies').remove();
                showNotification('All data cleared!');
            } catch (error) {
                console.error("Error clearing data:", error);
                showNotification('Error clearing data.');
            }
        }
    });

    // Search Tasks
    searchInput?.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        console.log("Search input changed:", query);
        renderTasks(query);
    });

    // Sort Tasks
    sortTasks?.addEventListener('change', () => {
        console.log("Sort option changed:", sortTasks.value);
        renderTasks(searchInput.value.toLowerCase());
    });

    // Filter by Priority
    filterPriority?.addEventListener('change', () => {
        console.log("Priority filter changed:", filterPriority.value);
        renderTasks(searchInput.value.toLowerCase());
    });

    // Filter by Tag
    tagFilter?.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        console.log("Tag filter changed:", tagFilter.value);
        renderTasks(query);
    });

    // Bulk Archive
    bulkArchiveBtn?.addEventListener('click', async () => {
        if (selectedTasks.size === 0) {
            alert('Please select tasks to archive.');
            return;
        }
        try {
            for (let taskId of selectedTasks) {
                await archiveTask(taskId);
            }
            selectedTasks.clear();
            showNotification('Selected tasks archived successfully!');
        } catch (error) {
            console.error("Error archiving tasks:", error);
            showNotification('Error archiving tasks.');
        }
    });

    // Bulk Delete
    bulkDeleteBtn?.addEventListener('click', async () => {
        if (selectedTasks.size === 0) {
            alert('Please select tasks to delete.');
            return;
        }
        try {
            for (let taskId of selectedTasks) {
                await deleteTask(taskId);
            }
            selectedTasks.clear();
            showNotification('Selected tasks deleted successfully!');
        } catch (error) {
            console.error("Error deleting tasks:", error);
            showNotification('Error deleting tasks.');
        }
    });

    // View Archive
    viewArchiveBtn?.addEventListener('click', () => {
        console.log("View Archive button clicked");
        archiveModal.classList.remove('hidden');
        renderArchive();
    });

    closeArchiveBtn?.addEventListener('click', () => {
        console.log("Close Archive button clicked");
        archiveModal.classList.add('hidden');
    });

    // Close History Modal
    closeHistoryBtn?.addEventListener('click', () => {
        console.log("Close History button clicked");
        historyModal.classList.add('hidden');
    });

    // Dynamically Show/Hide Fields Based on Category
    taskCategory?.addEventListener('change', () => {
        const category = taskCategory.value;
        console.log("Category changed:", category);
        checkOutTimeField.classList.add('hidden');
        newReservationIdField.classList.add('hidden');
        assignedToField.classList.remove('hidden');
        if (category === 'checkout') {
            checkOutTimeField.classList.remove('hidden');
            if (!document.getElementById('taskCheckOutTime').value) {
                document.getElementById('taskCheckOutTime').value = '12:00';
            }
        } else if (category === 'extensions') {
            newReservationIdField.classList.remove('hidden');
        } else if (category === 'handover' || category === 'guestrequests') {
            assignedToField.classList.add('hidden');
            document.getElementById('taskAssignedTo').value = '';
        }
    });

    // Submit Task Form
    submitBtn?.addEventListener('click', async (e) => {
        console.log("Submit button clicked");
        e.preventDefault();
        const roomNumber = document.getElementById('taskRoomNumber').value.trim();
        if (!roomNumber) {
            alert('Room Number is required!');
            return;
        }
        const newReservationId = document.getElementById('taskNewReservationId').value;
        const category = document.getElementById('taskCategory').value;
        const checkOutTime = document.getElementById('taskCheckOutTime').value;
        const details = document.getElementById('taskDetails').value;
        const dueDate = document.getElementById('taskDueDate').value;
        const dueTime = document.getElementById('taskDueTime').value;
        const priority = document.getElementById('taskPriority').value;
        const assignedTo = (category === 'handover' || category === 'guestrequests') ? '' : document.getElementById('taskAssignedTo').value.trim();
        const status = document.getElementById('taskStatus').value;
        const tags = document.getElementById('taskTags').value.split(',').map(tag => tag.trim()).filter(tag => tag);

        // Save new company to Firebase if not already present
        if (assignedTo && !companies.includes(assignedTo)) {
            try {
                await db.ref('companies').push(assignedTo);
                companies.push(assignedTo);
                console.log(`Added new company: ${assignedTo}`);
            } catch (error) {
                console.error("Error saving new company:", error);
                showNotification('Error saving new company.');
            }
        }

        const task = {
            id: editingTaskId || Date.now(),
            roomNumber,
            newReservationId: category === 'extensions' ? newReservationId : '',
            category,
            checkOutTime: category === 'checkout' ? checkOutTime : '',
            details,
            dueDate,
            dueTime,
            priority,
            assignedTo,
            status,
            tags,
            createdAt: new Date().toISOString(),
            comments: editingTaskId ? (await getTask(editingTaskId))?.comments || [] : [],
            history: editingTaskId ? (await getTask(editingTaskId))?.history || [] : [],
            attachments: editingTaskId ? (await getTask(editingTaskId))?.attachments || [] : []
        };

        try {
            if (editingTaskId) {
                await updateTask(task);
                await logHistory(task.id, `Task updated`);
                showNotification('Task updated successfully!');
            } else {
                await saveTask(task);
                await logHistory(task.id, `Task created`);
                showNotification('Task added successfully!');
            }
            taskModal.classList.add('hidden');
            resetForm();
        } catch (error) {
            console.error("Error submitting task:", error);
            showNotification('Error submitting task.');
        }
    });

    function openTaskModal(title, btnText, presetCategory = null, taskData = null) {
        try {
            console.log("Opening task modal with title:", title);
            modalTitle.textContent = title;
            submitBtn.textContent = btnText;
            editingTaskId = taskData ? taskData.id : null;

            // Reset form only if adding a new task (taskData is null)
            if (!taskData) {
                resetForm();
                // Set default due date for new tasks
                document.getElementById('taskDueDate').value = new Date().toISOString().split('T')[0];
            }

            // Set category and trigger visibility changes
            if (presetCategory) {
                document.getElementById('taskCategory').value = presetCategory;
                taskCategory.dispatchEvent(new Event('change'));
            }

            // Populate form if editing (taskData is provided)
            if (taskData) {
                document.getElementById('taskRoomNumber').value = taskData.roomNumber || '';
                document.getElementById('taskNewReservationId').value = taskData.newReservationId || '';
                document.getElementById('taskCategory').value = taskData.category || 'checkout';
                document.getElementById('taskCheckOutTime').value = taskData.checkOutTime || '';
                document.getElementById('taskDetails').value = taskData.details || '';
                document.getElementById('taskDueDate').value = taskData.dueDate || '';
                document.getElementById('taskDueTime').value = taskData.dueTime || '';
                document.getElementById('taskPriority').value = taskData.priority || 'low';
                document.getElementById('taskAssignedTo').value = taskData.assignedTo || '';
                document.getElementById('taskStatus').value = taskData.status || 'Pending';
                document.getElementById('taskTags').value = taskData.tags ? taskData.tags.join(', ') : '';
                // Trigger category change to update field visibility
                taskCategory.dispatchEvent(new Event('change'));
            }

            taskModal.classList.remove('hidden');
        } catch (error) {
            console.error("Error opening task modal:", error);
            showNotification('Error opening modal.');
        }
    }

    function resetForm() {
        try {
            const inputs = document.querySelectorAll('#taskForm input, #taskForm textarea, #taskForm select');
            inputs.forEach(input => {
                if (input.type === 'text' || input.type === 'textarea' || input.type === 'time' || input.type === 'date') {
                    input.value = '';
                } else if (input.type === 'select-one') {
                    input.selectedIndex = 0;
                }
            });
            checkOutTimeField.classList.add('hidden');
            newReservationIdField.classList.add('hidden');
            assignedToField.classList.remove('hidden');
            autocompleteList.innerHTML = '';
        } catch (error) {
            console.error("Error resetting form:", error);
            showNotification('Error resetting form.');
        }
    }

    function showNotification(message) {
        try {
            notification.textContent = message;
            notification.classList.remove('hide');
            notification.classList.add('show');
            setTimeout(() => {
                notification.classList.remove('show');
                notification.classList.add('hide');
            }, 3000);
        } catch (error) {
            console.error("Error showing notification:", error);
        }
    }

    async function saveTask(task) {
        try {
            await db.ref(`tasks/${task.id}`).set(task);
        } catch (error) {
            console.error("Error saving task:", error);
            throw error;
        }
    }

    async function updateTask(updatedTask) {
        try {
            await db.ref(`tasks/${updatedTask.id}`).set(updatedTask);
        } catch (error) {
            console.error("Error updating task:", error);
            throw error;
        }
    }

    async function getTask(taskId) {
        try {
            const snapshot = await db.ref(`tasks/${taskId}`).once('value');
            return snapshot.val();
        } catch (error) {
            console.error("Error getting task:", error);
            return null;
        }
    }

    async function archiveTask(taskId) {
        try {
            const taskSnapshot = await db.ref(`tasks/${taskId}`).once('value');
            const task = taskSnapshot.val();
            if (task) {
                await db.ref(`archive/${taskId}`).set({ ...task, archivedAt: new Date().toISOString() });
                await db.ref(`tasks/${taskId}`).remove();
                await logHistory(taskId, `Task archived`);
                showNotification('Task archived successfully!');
            }
        } catch (error) {
            console.error("Error archiving task:", error);
            throw error;
        }
    }

    async function unarchiveTask(taskId) {
        try {
            const taskSnapshot = await db.ref(`archive/${taskId}`).once('value');
            const task = taskSnapshot.val();
            if (task) {
                await db.ref(`tasks/${taskId}`).set({ ...task, archivedAt: null });
                await db.ref(`archive/${taskId}`).remove();
                await logHistory(taskId, `Task unarchived`);
                showNotification('Task unarchived successfully!');
            }
        } catch (error) {
            console.error("Error unarchiving task:", error);
            throw error;
        }
    }

    async function deleteTask(taskId) {
        try {
            await db.ref(`tasks/${taskId}`).remove();
            await logHistory(taskId, `Task deleted`);
            showNotification('Task deleted successfully!');
        } catch (error) {
            console.error("Error deleting task:", error);
            throw error;
        }
    }

    async function duplicateTask(taskId) {
        try {
            const task = await getTask(taskId);
            if (task) {
                const newTask = { ...task, id: Date.now(), createdAt: new Date().toISOString() };
                await saveTask(newTask);
                await logHistory(newTask.id, `Task duplicated from ${taskId}`);
                showNotification('Task duplicated successfully!');
            }
        } catch (error) {
            console.error("Error duplicating task:", error);
            throw error;
        }
    }

    async function logHistory(taskId, action) {
        try {
            const historyEntry = {
                taskId,
                action,
                timestamp: new Date().toISOString()
            };
            await db.ref('history').push(historyEntry);
        } catch (error) {
            console.error("Error logging history:", error);
            throw error;
        }
    }

    async function addComment(taskId, comment) {
        try {
            const task = await getTask(taskId);
            if (task) {
                const updatedComments = [
                    ...(task.comments || []),
                    { text: comment, timestamp: new Date().toISOString() }
                ];
                await db.ref(`tasks/${taskId}/comments`).set(updatedComments);
                await logHistory(taskId, `Comment added: ${comment}`);
                showNotification('Comment added successfully!');
                renderTasks(); // Re-render to update comment section
            }
        } catch (error) {
            console.error("Error adding comment:", error);
            throw error;
        }
    }

    async function editComment(taskId, commentIndex, newText) {
        try {
            const task = await getTask(taskId);
            if (task && task.comments && task.comments[commentIndex]) {
                const updatedComments = [...task.comments];
                updatedComments[commentIndex] = {
                    text: newText,
                    timestamp: new Date().toISOString()
                };
                await db.ref(`tasks/${taskId}/comments`).set(updatedComments);
                await logHistory(taskId, `Comment edited: ${newText}`);
                showNotification('Comment updated successfully!');
                renderTasks(); // Re-render to update comment section
            }
        } catch (error) {
            console.error("Error editing comment:", error);
            throw error;
        }
    }

    async function addAttachment(taskId, attachment) {
        try {
            const task = await getTask(taskId);
            if (task) {
                const updatedAttachments = [
                    ...(task.attachments || []),
                    { text: attachment, timestamp: new Date().toISOString() }
                ];
                await db.ref(`tasks/${taskId}/attachments`).set(updatedAttachments);
                await logHistory(taskId, `Attachment added: ${attachment}`);
                showNotification('Attachment added successfully!');
                renderTasks(); // Re-render to show attachments
            }
        } catch (error) {
            console.error("Error adding attachment:", error);
            throw error;
        }
    }

    async function editAttachment(taskId, attachmentIndex, newText) {
        try {
            const task = await getTask(taskId);
            if (task && task.attachments && task.attachments[attachmentIndex]) {
                const updatedAttachments = [...task.attachments];
                updatedAttachments[attachmentIndex] = {
                    text: newText,
                    timestamp: new Date().toISOString()
                };
                await db.ref(`tasks/${taskId}/attachments`).set(updatedAttachments);
                await logHistory(taskId, `Attachment edited: ${newText}`);
                showNotification('Attachment updated successfully!');
                renderTasks(); // Re-render to update attachment section
            }
        } catch (error) {
            console.error("Error editing attachment:", error);
            throw error;
        }
    }

    async function toggleTaskStatus(taskId) {
        try {
            const task = await getTask(taskId);
            if (task) {
                const newStatus = task.status === 'Completed' ? 'Pending' : 'Completed';
                await db.ref(`tasks/${taskId}/status`).set(newStatus);
                await logHistory(taskId, `Task status changed to ${newStatus}`);
                showNotification(`Task marked as ${newStatus}!`);
                renderTasks(); // Re-render to update checkbox
            }
        } catch (error) {
            console.error("Error toggling task status:", error);
            throw error;
        }
    }

    function checkReminders(tasks) {
        try {
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            const currentTime = now.toTimeString().slice(0, 5); // e.g., "14:30"
            const dueToday = tasks.filter(task => 
                task.dueDate === today && 
                task.dueTime && 
                task.dueTime <= currentTime && 
                task.status !== 'Completed'
            );
            if (dueToday.length > 0) {
                showNotification(`Reminder: You have ${dueToday.length} task(s) due now!`);
            }
        } catch (error) {
            console.error("Error checking reminders:", error);
        }
    }

    async function renderTasks(query = '') {
        try {
            const sortOption = sortTasks.value;
            const priorityFilter = filterPriority.value;
            const tagQuery = tagFilter.value.toLowerCase();
            const snapshot = await db.ref('tasks').once('value');
            let tasks = snapshot.val() ? Object.values(snapshot.val()) : [];

            // Filter by search query
            if (query) {
                tasks = tasks.filter(task =>
                    task.roomNumber.toLowerCase().includes(query) ||
                    task.newReservationId.toLowerCase().includes(query) ||
                    task.details.toLowerCase().includes(query) ||
                    task.assignedTo.toLowerCase().includes(query)
                );
            }

            // Filter by priority
            if (priorityFilter !== 'all') {
                tasks = tasks.filter(task => task.priority === priorityFilter);
            }

            // Filter by tag
            if (tagQuery) {
                tasks = tasks.filter(task =>
                    task.tags && task.tags.some(tag => tag.toLowerCase().includes(tagQuery))
                );
            }

            // Sort tasks
            if (sortOption === 'priority') {
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                tasks.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
            } else if (sortOption === 'dueDate') {
                tasks.sort((a, b) => {
                    const dateA = a.dueDate ? new Date(`${a.dueDate}T${a.dueTime || '23:59'}`) : new Date('9999-12-31');
                    const dateB = b.dueDate ? new Date(`${b.dueDate}T${b.dueTime || '23:59'}`) : new Date('9999-12-31');
                    return dateA - dateB;
                });
            }

            // Clear columns
            const columns = {
                checkout: document.getElementById('checkout'),
                extensions: document.getElementById('extensions'),
                handover: document.getElementById('handover'),
                guestrequests: document.getElementById('guestrequests')
            };
            Object.values(columns).forEach(column => (column.innerHTML = ''));

            // Reset counters
            const counters = {
                checkout: 0,
                extensions: 0,
                handover: 0,
                guestrequests: 0
            };

            // Render tasks and count them
            tasks.forEach(task => {
                counters[task.category]++;
                renderTask(task);
            });

            // Update counters
            document.getElementById('checkoutCounter').textContent = `Tasks: ${counters.checkout}`;
            document.getElementById('extensionsCounter').textContent = `Tasks: ${counters.extensions}`;
            document.getElementById('handoverCounter').textContent = `Tasks: ${counters.handover}`;
            document.getElementById('guestrequestsCounter').textContent = `Tasks: ${counters.guestrequests}`;
        } catch (error) {
            console.error("Error rendering tasks:", error);
            showNotification('Error rendering tasks.');
        }
    }

    function renderTask(task) {
        try {
            const taskElement = document.createElement('div');
            taskElement.classList.add('task-card', `priority-${task.priority.toLowerCase()}`, 'swipe-container');
            if (task.status === 'Completed') taskElement.classList.add('completed');

            taskElement.setAttribute('draggable', 'true');
            taskElement.setAttribute('data-id', task.id);
            taskElement.setAttribute('data-category', task.category);

            const now = new Date();
            const dueDateTime = task.dueDate && task.dueTime ? new Date(`${task.dueDate}T${task.dueTime}`) : task.dueDate ? new Date(task.dueDate) : null;
            if (dueDateTime && dueDateTime < now && task.status !== 'Completed') {
                taskElement.classList.add('overdue');
            }

            // Format key details
            const formattedRoomNumber = `R#${task.roomNumber}`;
            const detailsText = task.details || 'No details provided';
            const dueText = task.dueDate ? `Due: ${task.dueDate}${task.dueTime ? ` ${task.dueTime}` : ''}` : '';
            const assignedToText = task.assignedTo && task.category !== 'handover' && task.category !== 'guestrequests' ? task.assignedTo : 'Unassigned';
            const categorySpecific = task.newReservationId ? `Resv: ${task.newReservationId}` : (task.checkOutTime ? `Out: ${task.checkOutTime}` : '');

            // Counts for comments, attachments, and tags
            const commentCount = task.comments ? task.comments.length : 0;
            const attachmentCount = task.attachments ? task.attachments.length : 0;
            const tagCount = task.tags ? task.tags.length : 0;

            // Render comments
            let commentsHtml = '';
            if (commentCount > 0) {
                commentsHtml = `<div class="comments-container" data-id="${task.id}">`;
                task.comments.forEach((comment, index) => {
                    commentsHtml += `
                        <div class="comment-item" data-comment-index="${index}">
                            <div class="flex justify-between items-center">
                                <div>${comment.text}</div>
                                <button class="edit-comment-btn text-blue-500 hover:text-blue-700 text-sm" data-id="${task.id}" data-comment-index="${index}">
                                    <i class="fas fa-edit"></i>
                                </button>
                            </div>
                            <div class="comment-timestamp">${new Date(comment.timestamp).toLocaleString()}</div>
                        </div>
                    `;
                });
                commentsHtml += `</div>`;
            }

            // Render attachments
            let attachmentsHtml = '';
            if (attachmentCount > 0) {
                attachmentsHtml = `<div class="attachments-container" data-id="${task.id}">`;
                task.attachments.forEach((attachment, index) => {
                    attachmentsHtml += `
                        <div class="attachment-item" data-attachment-index="${index}">
                            <div class="flex justify-between items-center">
                                <div>${attachment.text}</div>
                                <button class="edit-attachment-btn text-blue-500 hover:text-blue-700 text-sm" data-id="${task.id}" data-attachment-index="${index}">
                                    <i class="fas fa-edit"></i>
                                </button>
                            </div>
                            <div class="attachment-timestamp">${new Date(attachment.timestamp).toLocaleString()}</div>
                        </div>
                    `;
                });
                attachmentsHtml += `</div>`;
            }

            // Render tags
            let tagsHtml = '';
            if (tagCount > 0) {
                tagsHtml = `<div class="tags-container">`;
                task.tags.forEach(tag => {
                    tagsHtml += `<span class="tag-item">${tag}</span>`;
                });
                tagsHtml += `</div>`;
            }

            // Task HTML
            taskElement.innerHTML = `
                <div class="swipe-background">
                    <i class="fas fa-archive"></i>
                </div>
                <div class="task-essential">
                    <input type="checkbox" class="task-checkbox" ${task.status === 'Completed' ? 'checked' : ''}>
                    <div class="task-essential-header">
                        <div class="task-title">${formattedRoomNumber}</div>
                        <div class="task-meta">${categorySpecific}</div>
                    </div>
                    <div class="task-essential-meta">
                        <span><i class="fas fa-user"></i> ${assignedToText}</span>
                        <span><i class="fas fa-calendar"></i> ${dueText || 'No due date'}</span>
                        <span class="status-${task.status.toLowerCase().replace(' ', '-')}" style="display: inline-block;">${task.status}</span>
                    </div>
                </div>
                <div class="task-expandable">
                    <div class="task-details">${detailsText}</div>
                    ${tagsHtml}
                    ${attachmentsHtml}
                    ${commentsHtml}
                    <button class="comment-toggle" data-id="${task.id}">
                        ${commentCount > 0 ? `View ${commentCount} Comment${commentCount > 1 ? 's' : ''}` : 'Add Comment'}
                    </button>
                </div>
                <div class="task-actions-container">
                    <div class="task-actions">
                        <button class="comment-btn" data-id="${task.id}" data-tooltip="Add/View Comment"><i class="fas fa-comment"></i></button>
                        <button class="attach-btn" data-id="${task.id}" data-tooltip="Add Attachment"><i class="fas fa-paperclip"></i></button>
                        <button class="history-btn" data-id="${task.id}" data-tooltip="View History"><i class="fas fa-history"></i></button>
                        <button class="edit-btn" data-id="${task.id}" data-tooltip="Edit Task"><i class="fas fa-edit"></i></button>
                        <button class="duplicate-btn" data-id="${task.id}" data-tooltip="Duplicate Task"><i class="fas fa-copy"></i></button>
                        <button class="archive-btn" data-id="${task.id}" data-tooltip="Archive Task"><i class="fas fa-archive"></i></button>
                        <button class="delete-btn" data-id="${task.id}" data-tooltip="Delete Task"><i class="fas fa-trash"></i></button>
                    </div>
                    <button class="expand-btn"><i class="fas fa-chevron-down"></i></button>
                </div>
            `;

            // Add event listeners
            const checkbox = taskElement.querySelector('.task-checkbox');
            checkbox.addEventListener('change', () => toggleTaskStatus(task.id));

            const expandBtn = taskElement.querySelector('.expand-btn');
            const expandable = taskElement.querySelector('.task-expandable');
            expandBtn.addEventListener('click', () => {
                const isExpanded = expandable.classList.contains('active');
                expandable.classList.toggle('active');
                taskElement.classList.toggle('expanded');
                expandBtn.innerHTML = `<i class="fas fa-chevron-${isExpanded ? 'down' : 'up'}"></i>`;
            });

            const commentToggle = taskElement.querySelector('.comment-toggle');
            if (commentToggle) {
                commentToggle.addEventListener('click', () => {
                    const commentsContainer = taskElement.querySelector('.comments-container');
                    if (commentsContainer) {
                        commentsContainer.classList.toggle('active');
                        commentToggle.textContent = commentsContainer.classList.contains('active')
                            ? `Hide ${commentCount} Comment${commentCount > 1 ? 's' : ''}`
                            : `View ${commentCount} Comment${commentCount > 1 ? 's' : ''}`;
                    } else {
                        const comment = prompt('Enter your comment:');
                        if (comment) addComment(task.id, comment);
                    }
                });
            }

            taskElement.querySelector('.comment-btn').addEventListener('click', () => {
                const comment = prompt('Enter your comment:');
                if (comment) addComment(task.id, comment);
            });

            taskElement.querySelector('.attach-btn').addEventListener('click', () => {
                const attachment = prompt('Enter attachment description:');
                if (attachment) addAttachment(task.id, attachment);
            });

            taskElement.querySelector('.history-btn').addEventListener('click', () => {
                historyModal.classList.remove('hidden');
                renderHistory(task.id);
            });

            taskElement.querySelector('.edit-btn').addEventListener('click', async () => {
                const taskId = taskElement.dataset.id;
                const taskData = await getTask(taskId);
                if (taskData) {
                    openTaskModal('Edit Task', 'Update Task', null, taskData);
                } else {
                    showNotification('Error loading task data.');
                }
            });

            taskElement.querySelector('.duplicate-btn').addEventListener('click', () => duplicateTask(task.id));
            taskElement.querySelector('.archive-btn').addEventListener('click', () => archiveTask(task.id));
            taskElement.querySelector('.delete-btn').addEventListener('click', () => {
                if (confirm('Are you sure you want to delete this task?')) deleteTask(task.id);
            });

            // Edit comment
            taskElement.querySelectorAll('.edit-comment-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const commentIndex = btn.dataset.commentIndex;
                    const taskId = btn.dataset.id;
                    const comment = prompt('Edit your comment:', task.comments[commentIndex].text);
                    if (comment) editComment(taskId, commentIndex, comment);
                });
            });

            // Edit attachment
            taskElement.querySelectorAll('.edit-attachment-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const attachmentIndex = btn.dataset.attachmentIndex;
                    const taskId = btn.dataset.id;
                    const attachment = prompt('Edit attachment description:', task.attachments[attachmentIndex].text);
                    if (attachment) editAttachment(taskId, attachmentIndex, attachment);
                });
            });

            // Drag and Drop for moving
            taskElement.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', task.id);
                taskElement.classList.add('dragging');
            });

            taskElement.addEventListener('dragend', () => {
                taskElement.classList.remove('dragging');
            });

            taskElement.addEventListener('dragover', (e) => {
                e.preventDefault();
                taskElement.classList.add('drag-over');
            });

            taskElement.addEventListener('dragleave', () => {
                taskElement.classList.remove('drag-over');
            });

            taskElement.addEventListener('drop', async (e) => {
                e.preventDefault();
                taskElement.classList.remove('drag-over');
                // Linking functionality removed
            });

            // Swipe to Archive
            taskElement.addEventListener('touchstart', (e) => {
                touchStartX = e.changedTouches[0].screenX;
            });

            taskElement.addEventListener('touchend', async (e) => {
                touchEndX = e.changedTouches[0].screenX;
                if (touchStartX - touchEndX > 100) {
                    taskElement.classList.add('swiping');
                    setTimeout(async () => {
                        taskElement.classList.add('swiped');
                        await archiveTask(task.id);
                    }, 300);
                }
            });

            // Checkbox for bulk actions
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    selectedTasks.add(task.id);
                } else {
                    selectedTasks.delete(task.id);
                }
            });

            // Append to the correct column
            const column = document.getElementById(task.category);
            if (column) column.appendChild(taskElement);
        } catch (error) {
            console.error("Error rendering task:", error);
            showNotification('Error rendering task.');
        }
    }

    async function renderArchive() {
        try {
            const snapshot = await db.ref('archive').once('value');
            const archive = snapshot.val() ? Object.values(snapshot.val()) : [];
            const archiveList = document.getElementById('archiveList');
            archiveList.innerHTML = archive.length === 0 ? '<p>No archived tasks.</p>' : '';

            archive.forEach(task => {
                const taskElement = document.createElement('div');
                taskElement.classList.add('task-card', `priority-${task.priority.toLowerCase()}`);
                taskElement.innerHTML = `
                    <div class="task-essential">
                        <div class="task-essential-header">
                            <div class="task-title">R#${task.roomNumber}</div>
                            <div class="task-meta">${task.details || 'No details'}</div>
                        </div>
                        <div class="task-essential-meta">
                            <span>Archived: ${new Date(task.archivedAt).toLocaleString()}</span>
                        </div>
                    </div>
                    <div class="task-actions">
                        <button class="unarchive-btn" data-id="${task.id}" data-tooltip="Unarchive Task"><i class="fas fa-undo"></i></button>
                        <button class="delete-btn" data-id="${task.id}" data-tooltip="Delete Task"><i class="fas fa-trash"></i></button>
                    </div>
                `;

                taskElement.querySelector('.unarchive-btn').addEventListener('click', () => unarchiveTask(task.id));
                taskElement.querySelector('.delete-btn').addEventListener('click', () => {
                    if (confirm('Are you sure you want to permanently delete this archived task?')) {
                        db.ref(`archive/${task.id}`).remove();
                        showNotification('Archived task deleted successfully!');
                    }
                });

                archiveList.appendChild(taskElement);
            });
        } catch (error) {
            console.error("Error rendering archive:", error);
            showNotification('Error rendering archive.');
        }
    }

    async function renderHistory(taskId) {
        try {
            const snapshot = await db.ref('history').once('value');
            const history = snapshot.val() ? Object.values(snapshot.val()).filter(entry => entry.taskId === taskId) : [];
            const historyList = document.getElementById('historyList');
            historyList.innerHTML = history.length === 0 ? '<p>No history for this task.</p>' : '';

            history.forEach(entry => {
                const historyItem = document.createElement('div');
                historyItem.classList.add('history-item', 'p-2', 'border-b', 'border-gray-200', 'dark:border-gray-600');
                historyItem.innerHTML = `
                    <p>${entry.action}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">${new Date(entry.timestamp).toLocaleString()}</p>
                `;
                historyList.appendChild(historyItem);
            });
        } catch (error) {
            console.error("Error rendering history:", error);
            showNotification('Error rendering history.');
        }
    }

    // Drag and Drop for Moving Tasks
    function allowDrop(e) {
        e.preventDefault();
    }

    async function drop(e) {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('text/plain');
        const targetColumn = e.target.closest('.task-column');
        if (targetColumn) {
            const newCategory = targetColumn.id;
            const task = await getTask(taskId);
            if (task && task.category !== newCategory) {
                task.category = newCategory;
                await updateTask(task);
                await logHistory(taskId, `Task moved to ${newCategory}`);
                showNotification('Task moved successfully!');
                renderTasks();
            }
        }
    }

    // Add drop event listeners to columns
    document.querySelectorAll('.task-column').forEach(column => {
        column.addEventListener('dragover', allowDrop);
        column.addEventListener('drop', drop);
    });
});