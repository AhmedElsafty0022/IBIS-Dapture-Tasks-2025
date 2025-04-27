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
                    await db.ref('tasks').set(data.tasks.reduce((acc, task) => {
                        acc[task.id] = task;
                        return acc;
                    }, {}));
                }
                if (data.archive) {
                    await db.ref('archive').set(data.archive.reduce((acc, task) => {
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
            document.getElementById('taskCheckOutTime').value = '12:00';
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

    function openTaskModal(title, btnText, presetCategory = null) {
        try {
            console.log("Opening task modal with title:", title);
            modalTitle.textContent = title;
            submitBtn.textContent = btnText;
            editingTaskId = null;
            resetForm();
            if (presetCategory) {
                taskCategory.value = presetCategory;
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
            document.getElementById('taskDueDate').value = new Date().toISOString().split('T')[0];
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
            const assignedToText = task.assignedTo && task.category !== 'handover' && task.category !== 'guestrequests' ? task.assignedTo : '';
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

           detector = task.status === 'Completed' ? 'checked' : '';

            // Render tags
            let tagsHtml = '';
            if (tagCount > 0) {
                tagsHtml = `<div class="tags-container">`;
                task.tags.forEach(tag => {
                    tagsHtml += `<span class="tag-item">${tag}</span>`;
                });
                tagsHtml += `</div>`;
            }

            // Task card HTML with collapsible structure
            taskElement.innerHTML = `
                <div class="swipe-background">
                    <i class="fas fa-archive text-lg"></i>
                </div>
                <div class="task-card-content">
                    <div class="task-essential">
                        <input type="checkbox" class="task-checkbox" data-id="${task.id}" aria-label="Select Task" ${task.status === 'Completed' ? 'checked' : ''}>
                        <div class="task-essential-header">
                            <span class="task-title ${task.status === 'Completed' ? 'line-through text-gray-500 dark:text-gray-400' : ''}">
                                ${formattedRoomNumber}
                            </span>
                            ${assignedToText ? `<span class="task-meta">${assignedToText}</span>` : ''}
                        </div>
                        <div class="task-essential-meta">
                            <span class="status-${task.status.toLowerCase().replace(' ', '-')}" style="display: inline-block;">
                                ${task.status}
                            </span>
                            ${dueText ? `<span><i class="fas fa-calendar-alt mr-1"></i>${dueText}</span>` : ''}
                            ${categorySpecific ? `<span><i class="fas fa-info-circle mr-1"></i>${categorySpecific}</span>` : ''}
                            ${commentCount > 0 ? `<span class="comment-toggle" data-id="${task.id}"><i class="fas fa-comment mr-1"></i>${commentCount}</span>` : ''}
                        </div>
                    </div>
                    <div class="task-expandable" data-id="${task.id}">
                        <div class="task-main">
                            <div class="task-details">${detailsText}</div>
                            ${tagsHtml}
                            ${attachmentsHtml}
                            ${commentsHtml}
                        </div>
                        <div class="task-actions-container">
                            <div class="task-actions">
                                <button class="comment-btn" data-id="${task.id}" data-tooltip="Add Comment" aria-label="Add Comment"><i class="fas fa-comment"></i></button>
                                <button class="attach-btn" data-id="${task.id}" data-tooltip="Add Attachment" aria-label="Add Attachment"><i class="fas fa-paperclip"></i></button>
                                <button class="history-btn" data-id="${task.id}" data-tooltip="View History" aria-label="View History"><i class="fas fa-history"></i></button>
                                <button class="edit-btn" data-id="${task.id}" data-tooltip="Edit Task" aria-label="Edit Task"><i class="fas fa-edit"></i></button>
                                <button class="duplicate-btn" data-id="${task.id}" data-tooltip="Duplicate Task" aria-label="Duplicate Task"><i class="fas fa-copy"></i></button>
                                <button class="archive-btn" data-id="${task.id}" data-tooltip="Archive Task" aria-label="Archive Task"><i class="fas fa-archive"></i></button>
                                <button class="delete-btn" data-id="${task.id}" data-tooltip="Delete Task" aria-label="Delete Task"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                    </div>
                    <button class="expand-btn" data-id="${task.id}" aria-label="Expand Task">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
            `;

            // Toggle completion on checkbox change
            const checkbox = taskElement.querySelector('.task-checkbox');
            checkbox.addEventListener('change', (e) => {
                console.log(`Checkbox toggled for task ${task.id}`);
                toggleTaskStatus(task.id);
            });

            // Checkbox for bulk actions
            checkbox.addEventListener('change', (e) => {
                const taskId = parseInt(e.target.getAttribute('data-id'));
                if (e.target.checked && !selectedTasks.has(taskId)) {
                    selectedTasks.add(taskId);
                } else if (!e.target.checked) {
                    selectedTasks.delete(taskId);
                }
                console.log("Selected tasks:", Array.from(selectedTasks));
            });

            // Expand/Collapse Task
            const expandBtn = taskElement.querySelector('.expand-btn');
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const expandable = taskElement.querySelector('.task-expandable');
                const isExpanded = expandable.classList.contains('active');
                expandable.classList.toggle('active');
                taskElement.classList.toggle('expanded');
                expandBtn.innerHTML = isExpanded
                    ? '<i class="fas fa-chevron-down"></i>'
                    : '<i class="fas fa-chevron-up"></i>';
                expandBtn.setAttribute('aria-label', isExpanded ? 'Expand Task' : 'Collapse Task');
            });

            // Toggle Comments
            const commentToggle = taskElement.querySelector('.comment-toggle');
            if (commentToggle) {
                commentToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const expandable = taskElement.querySelector('.task-expandable');
                    const commentsContainer = taskElement.querySelector('.comments-container');
                    if (!expandable.classList.contains('active')) {
                        expandable.classList.add('active');
                        taskElement.classList.add('expanded');
                        expandBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
                        expandBtn.setAttribute('aria-label', 'Collapse Task');
                    }
                    commentsContainer.classList.toggle('active');
                });
            }

            // Edit Comment Buttons
            const editCommentButtons = taskElement.querySelectorAll('.edit-comment-btn');
            editCommentButtons.forEach(button => {
                button.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const taskId = parseInt(button.getAttribute('data-id'));
                    const commentIndex = parseInt(button.getAttribute('data-comment-index'));
                    const task = await getTask(taskId);
                    if (task && task.comments && task.comments[commentIndex]) {
                        const newComment = prompt('Edit your comment:', task.comments[commentIndex].text);
                        if (newComment) {
                            await editComment(taskId, commentIndex, newComment);
                        }
                    }
                });
            });

            // Edit Attachment Buttons
            const editAttachmentButtons = taskElement.querySelectorAll('.edit-attachment-btn');
            editAttachmentButtons.forEach(button => {
                button.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const taskId = parseInt(button.getAttribute('data-id'));
                    const attachmentIndex = parseInt(button.getAttribute('data-attachment-index'));
                    const task = await getTask(taskId);
                    if (task && task.attachments && task.attachments[attachmentIndex]) {
                        const newAttachment = prompt('Edit attachment description:', task.attachments[attachmentIndex].text);
                        if (newAttachment) {
                            await editAttachment(taskId, attachmentIndex, newAttachment);
                        }
                    }
                });
            });

            // Action buttons
            const actionButtons = taskElement.querySelectorAll('.task-actions button');
            actionButtons.forEach(button => {
                button.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const taskId = parseInt(button.getAttribute('data-id'));
                    if (button.classList.contains('edit-btn')) {
                        console.log(`Edit button clicked for task ${taskId}`);
                        const task = await getTask(taskId);
                        if (task) {
                            editingTaskId = taskId;
                            modalTitle.textContent = 'Edit Task';
                            submitBtn.textContent = 'Update Task';
                            document.getElementById('taskRoomNumber').value = task.roomNumber;
                            document.getElementById('taskNewReservationId').value = task.newReservationId || '';
                            document.getElementById('taskCategory').value = task.category;
                            document.getElementById('taskCategory').dispatchEvent(new Event('change'));
                            document.getElementById('taskCheckOutTime').value = task.checkOutTime || '';
                            document.getElementById('taskDetails').value = task.details || '';
                            document.getElementById('taskDueDate').value = task.dueDate || '';
                            document.getElementById('taskDueTime').value = task.dueTime || '';
                            document.getElementById('taskPriority').value = task.priority || 'low';
                            document.getElementById('taskAssignedTo').value = task.assignedTo || '';
                            document.getElementById('taskStatus').value = task.status || 'Pending';
                            document.getElementById('taskTags').value = task.tags ? task.tags.join(', ') : '';
                            taskModal.classList.remove('hidden');
                        }
                    } else if (button.classList.contains('archive-btn')) {
                        console.log(`Archive button clicked for task ${taskId}`);
                        await archiveTask(taskId);
                    } else if (button.classList.contains('delete-btn')) {
                        console.log(`Delete button clicked for task ${taskId}`);
                        if (confirm('Are you sure you want to delete this task?')) {
                            await deleteTask(taskId);
                        }
                    } else if (button.classList.contains('duplicate-btn')) {
                        console.log(`Duplicate button clicked for task ${taskId}`);
                        await duplicateTask(taskId);
                    } else if (button.classList.contains('history-btn')) {
                        console.log(`History button clicked for task ${taskId}`);
                        renderHistory(taskId);
                    } else if (button.classList.contains('comment-btn')) {
                        console.log(`Comment button clicked for task ${taskId}`);
                        const comment = prompt('Enter your comment:');
                        if (comment) {
                            await addComment(taskId, comment);
                        }
                    } else if (button.classList.contains('attach-btn')) {
                        console.log(`Attachment button clicked for task ${taskId}`);
                        const attachment = prompt('Enter attachment description:');
                        if (attachment) {
                            await addAttachment(taskId, attachment);
                        }
                    }
                });
            });

            // Drag and Drop
            taskElement.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', task.id);
                taskElement.classList.add('dragging');
            });

            taskElement.addEventListener('dragend', () => {
                taskElement.classList.remove('dragging');
            });

            // Swipe to Archive
            taskElement.addEventListener('touchstart', (e) => {
                touchStartX = e.changedTouches[0].screenX;
            });

            taskElement.addEventListener('touchmove', (e) => {
                touchEndX = e.changedTouches[0].screenX;
                const diffX = touchStartX - touchEndX;
                if (diffX > 0) {
                    taskElement.classList.add('swiping');
                    taskElement.style.transform = `translateX(-${Math.min(diffX, 56)}px)`;
                }
            });

            taskElement.addEventListener('touchend', async () => {
                const diffX = touchStartX - touchEndX;
                if (diffX > 80) {
                    taskElement.classList.add('swiped');
                    await archiveTask(task.id);
                } else {
                    taskElement.classList.remove('swiping');
                    taskElement.style.transform = 'translateX(0)';
                }
            });

            // Append to appropriate column
            const column = document.getElementById(task.category);
            if (column) {
                column.appendChild(taskElement);
            }
        } catch (error) {
            console.error("Error rendering task:", error);
            showNotification('Error rendering task.');
        }
    }

    async function renderArchive() {
        try {
            const archiveList = document.getElementById('archiveList');
            archiveList.innerHTML = '';
            const snapshot = await db.ref('archive').once('value');
            const archivedTasks = snapshot.val() ? Object.values(snapshot.val()) : [];

            if (archivedTasks.length === 0) {
                archiveList.innerHTML = '<p class="text-gray-500 dark:text-gray-400">No archived tasks.</p>';
                return;
            }

            archivedTasks.forEach(task => {
                const taskElement = document.createElement('div');
                taskElement.classList.add('p-4', 'bg-gray-100', 'dark:bg-gray-700', 'rounded-lg', 'mb-2', 'flex', 'justify-between', 'items-center');
                taskElement.innerHTML = `
                    <div>
                        <strong>Room #${task.roomNumber}</strong> - ${task.category}
                        <p class="text-sm text-gray-600 dark:text-gray-300">${task.details || 'No details'}</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Archived on ${new Date(task.archivedAt).toLocaleString()}</p>
                    </div>
                    <div class="flex space-x-2">
                        <button class="unarchive-btn bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg" data-id="${task.id}">
                            <i class="fas fa-undo mr-1"></i>Unarchive
                        </button>
                        <button class="delete-btn bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg" data-id="${task.id}">
                            <i class="fas fa-trash mr-1"></i>Delete
                        </button>
                    </div>
                `;

                const unarchiveBtn = taskElement.querySelector('.unarchive-btn');
                unarchiveBtn.addEventListener('click', async () => {
                    console.log(`Unarchive button clicked for task ${task.id}`);
                    await unarchiveTask(task.id);
                });

                const deleteBtn = taskElement.querySelector('.delete-btn');
                deleteBtn.addEventListener('click', async () => {
                    console.log(`Delete button clicked for archived task ${task.id}`);
                    if (confirm('Are you sure you want to permanently delete this archived task?')) {
                        await db.ref(`archive/${task.id}`).remove();
                        await logHistory(task.id, `Archived task deleted`);
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
            const historyList = document.getElementById('historyList');
            historyList.innerHTML = '';
            const snapshot = await db.ref('history').once('value');
            const history = snapshot.val() ? Object.values(snapshot.val()).filter(entry => entry.taskId === taskId) : [];

            if (history.length === 0) {
                historyList.innerHTML = '<p class="text-gray-500 dark:text-gray-400">No history for this task.</p>';
                return;
            }

            history.forEach(entry => {
                const entryElement = document.createElement('div');
                entryElement.classList.add('p-4', 'bg-gray-100', 'dark:bg-gray-700', 'rounded-lg', 'mb-2');
                entryElement.innerHTML = `
                    <p>${entry.action}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">${new Date(entry.timestamp).toLocaleString()}</p>
                `;
                historyList.appendChild(entryElement);
            });

            historyModal.classList.remove('hidden');
        } catch (error) {
            console.error("Error rendering history:", error);
            showNotification('Error rendering history.');
        }
    }

    // Drag and Drop Handlers
    window.allowDrop = (e) => {
        e.preventDefault();
    };

    window.drop = async (e) => {
        e.preventDefault();
        const taskId = parseInt(e.dataTransfer.getData('text/plain'));
        const newCategory = e.target.closest('.task-column').id;
        const task = await getTask(taskId);
        if (task && task.category !== newCategory) {
            task.category = newCategory;
            if (newCategory === 'handover' || newCategory === 'guestrequests') {
                task.assignedTo = '';
            }
            await updateTask(task);
            await logHistory(taskId, `Task moved to ${newCategory}`);
            showNotification('Task category updated!');
        }
    };
});
