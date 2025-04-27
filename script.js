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
    const sortTasks = document.getElementById('sortTasks');
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
        if (category === 'checkout') {
            checkOutTimeField.classList.remove('hidden');
            document.getElementById('taskCheckOutTime').value = '12:00';
        } else if (category === 'extensions') {
            newReservationIdField.classList.remove('hidden');
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
        const priority = document.getElementById('taskPriority').value;
        const assignedTo = document.getElementById('taskAssignedTo').value.trim();
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
                if (input.type === 'text' || input.type === 'textarea' || input.type === 'time') {
                    input.value = '';
                } else if (input.type === 'select-one') {
                    input.selectedIndex = 0;
                }
            });
            document.getElementById('taskDueDate').value = new Date().toISOString().split('T')[0];
            checkOutTimeField.classList.add('hidden');
            newReservationIdField.classList.add('hidden');
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
            }
        } catch (error) {
            console.error("Error adding attachment:", error);
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
            }
        } catch (error) {
            console.error("Error toggling task status:", error);
            throw error;
        }
    }

    function checkReminders(tasks) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const dueToday = tasks.filter(task => task.dueDate === today && task.status !== 'Completed');
            if (dueToday.length > 0) {
                showNotification(`Reminder: You have ${dueToday.length} task(s) due today!`);
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
                    const dateA = a.dueDate ? new Date(a.dueDate) : new Date('9999-12-31');
                    const dateB = b.dueDate ? new Date(b.dueDate) : new Date('9999-12-31');
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
            taskElement.setAttribute('data-category', task.category); // Add category for styling

            const today = new Date();
            const dueDate = task.dueDate ? new Date(task.dueDate) : null;
            if (dueDate && dueDate < today && task.status !== 'Completed') {
                taskElement.classList.add('overdue');
            }

            // Format key details
            const formattedRoomNumber = `Room #${task.roomNumber}`;
            const detailsText = task.details || 'No details provided';
            const dueDateText = task.dueDate ? `Due: ${task.dueDate}` : '';
            const assignedToText = task.assignedTo ? `Assigned: ${task.assignedTo}` : '';
            const categorySpecific = task.newReservationId ? `Resv: ${task.newReservationId}` : (task.checkOutTime ? `Out: ${task.checkOutTime}` : '');

            // Counts for comments, attachments, and tags
            const commentCount = task.comments ? task.comments.length : 0;
            const attachmentCount = task.attachments ? task.attachments.length : 0;
            const tagCount = task.tags ? task.tags.length : 0;

            // Render comments
            let commentsHtml = '';
            if (commentCount > 0) {
                commentsHtml = `<div class="comments-container" data-id="${task.id}">`;
                task.comments.forEach(comment => {
                    commentsHtml += `
                        <div class="comment-item">
                            <div>${comment.text}</div>
                            <div class="comment-timestamp">${new Date(comment.timestamp).toLocaleString()}</div>
                        </div>
                    `;
                });
                commentsHtml += `</div>`;
            }

            // Updated HTML structure
            taskElement.innerHTML = `
                <div class="swipe-background">
                    <i class="fas fa-archive text-lg"></i>
                </div>
                <div class="task-card-content">
                    <div class="flex items-center">
                        <input type="checkbox" class="task-checkbox" data-id="${task.id}">
                        <span class="task-title ${task.status === 'Completed' ? 'line-through text-gray-500 dark:text-gray-400' : ''}">
                            ${formattedRoomNumber}
                        </span>
                    </div>
                    <div class="task-main">
                        <div class="task-details">${detailsText}</div>
                        <div class="task-meta">
                            ${categorySpecific ? `<span>${categorySpecific}</span>` : ''}
                            ${dueDateText ? `<span>${dueDateText}</span>` : ''}
                            ${assignedToText ? `<span>${assignedToText}</span>` : ''}
                        </div>
                        <div class="task-info">
                            <span class="status-${task.status.toLowerCase().replace(' ', '-')}" style="display: inline-block;">${task.status}</span>
                            ${commentCount > 0 ? `<span class="info-count comment-toggle" data-id="${task.id}">💬 ${commentCount}</span>` : ''}
                            ${attachmentCount > 0 ? `<span class="info-count">📎 ${attachmentCount}</span>` : ''}
                            ${tagCount > 0 ? `<span class="info-count">🏷️ ${tagCount}</span>` : ''}
                        </div>
                        ${commentsHtml}
                    </div>
                    <div class="task-actions-container">
                        <button class="expand-btn" data-id="${task.id}">
                            <i class="fas fa-ellipsis-h"></i>
                        </button>
                        <div class="task-actions">
                            <button class="comment-btn" data-id="${task.id}" data-tooltip="Add Comment"><i class="fas fa-comment"></i></button>
                            <button class="attach-btn" data-id="${task.id}" data-tooltip="Add Attachment"><i class="fas fa-paperclip"></i></button>
                            <button class="history-btn" data-id="${task.id}" data-tooltip="View History"><i class="fas fa-history"></i></button>
                            <button class="edit-btn" data-id="${task.id}" data-tooltip="Edit Task"><i class="fas fa-edit"></i></button>
                            <button class="duplicate-btn" data-id="${task.id}" data-tooltip="Duplicate Task"><i class="fas fa-copy"></i></button>
                            <button class="archive-btn" data-id="${task.id}" data-tooltip="Archive Task"><i class="fas fa-archive"></i></button>
                            <button class="delete-btn" data-id="${task.id}" data-tooltip="Delete Task"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>
            `;

            // Toggle completion only on checkbox change
            const checkbox = taskElement.querySelector('.task-checkbox');
            checkbox.addEventListener('change', (e) => {
                console.log(`Checkbox toggled for task ${task.id}`);
                toggleTaskStatus(task.id);
            });

            // Checkbox for bulk actions
            checkbox.addEventListener('change', (e) => {
                const taskId = parseInt(e.target.getAttribute('data-id'));
                if (e.target.checked) {
                    selectedTasks.add(taskId);
                } else {
                    selectedTasks.delete(taskId);
                }
                console.log("Selected tasks:", Array.from(selectedTasks));
            });

            // Expand/Collapse Actions
            const expandBtn = taskElement.querySelector('.expand-btn');
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card click from triggering
                const actions = taskElement.querySelector('.task-actions');
                actions.classList.toggle('active');
                expandBtn.innerHTML = actions.classList.contains('active')
                    ? '<i class="fas fa-times"></i>'
                    : '<i class="fas fa-ellipsis-h"></i>';
            });

            // Toggle Comments
            const commentToggle = taskElement.querySelector('.comment-toggle');
            if (commentToggle) {
                commentToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const commentsContainer = taskElement.querySelector('.comments-container');
                    commentsContainer.classList.toggle('active');
                });
            }

            // Add event listeners for action buttons, ensuring they don't trigger card click
            const actionButtons = taskElement.querySelectorAll('.task-actions button');
            actionButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent card click from triggering
                    const taskId = parseInt(button.getAttribute('data-id'));
                    if (button.classList.contains('comment-btn')) {
                        console.log(`Comment button clicked for task ${taskId}`);
                        promptComment(taskId);
                    } else if (button.classList.contains('attach-btn')) {
                        console.log(`Attach button clicked for task ${taskId}`);
                        promptAttachment(taskId);
                    } else if (button.classList.contains('history-btn')) {
                        console.log(`History button clicked for task ${taskId}`);
                        showTaskHistory(taskId);
                    } else if (button.classList.contains('edit-btn')) {
                        console.log(`Edit button clicked for task ${taskId}`);
                        editTask(taskId);
                    } else if (button.classList.contains('duplicate-btn')) {
                        console.log(`Duplicate button clicked for task ${taskId}`);
                        duplicateTask(taskId);
                    } else if (button.classList.contains('archive-btn')) {
                        console.log(`Archive button clicked for task ${taskId}`);
                        archiveTask(taskId);
                    } else if (button.classList.contains('delete-btn')) {
                        console.log(`Delete button clicked for task ${taskId}`);
                        deleteTask(taskId);
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
                }
            });

            taskElement.addEventListener('touchend', () => {
                const diffX = touchStartX - touchEndX;
                if (diffX > 100) {
                    taskElement.classList.add('swiped');
                    setTimeout(() => archiveTask(task.id), 300);
                } else {
                    taskElement.classList.remove('swiping');
                }
            });

            document.getElementById(task.category).appendChild(taskElement);
        } catch (error) {
            console.error("Error rendering task:", error);
            showNotification('Error rendering task.');
        }
    }

    function promptComment(taskId) {
        try {
            const comment = prompt('Add a comment:');
            if (comment) {
                addComment(taskId, comment);
            }
        } catch (error) {
            console.error("Error prompting comment:", error);
            showNotification('Error adding comment.');
        }
    }

    function promptAttachment(taskId) {
        try {
            const attachment = prompt('Add an attachment (e.g., note or link):');
            if (attachment) {
                addAttachment(taskId, attachment);
            }
        } catch (error) {
            console.error("Error prompting attachment:", error);
            showNotification('Error adding attachment.');
        }
    }

    async function showTaskHistory(taskId) {
        try {
            const historyList = document.getElementById('historyList');
            const snapshot = await db.ref('history').once('value');
            let history = snapshot.val() ? Object.values(snapshot.val()) : [];
            history = history.filter(h => h.taskId === taskId);
            historyList.innerHTML = '';
            if (history.length === 0) {
                historyList.innerHTML = '<p class="text-gray-500 dark:text-gray-400">No history available.</p>';
            } else {
                history.forEach(entry => {
                    const entryElement = document.createElement('div');
                    entryElement.classList.add('p-4', 'bg-gray-100', 'dark:bg-gray-700', 'rounded-lg', 'mb-2');
                    entryElement.innerHTML = `
                        <p class="text-sm text-gray-600 dark:text-gray-400">${entry.action}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">At: ${new Date(entry.timestamp).toLocaleString()}</p>
                    `;
                    historyList.appendChild(entryElement);
                });
            }
            historyModal.classList.remove('hidden');
        } catch (error) {
            console.error("Error showing task history:", error);
            showNotification('Error showing task history.');
        }
    }

    async function renderArchive() {
        try {
            const archiveList = document.getElementById('archiveList');
            const snapshot = await db.ref('archive').once('value');
            let archive = snapshot.val() ? Object.values(snapshot.val()) : [];
            archiveList.innerHTML = '';
            if (archive.length === 0) {
                archiveList.innerHTML = '<p class="text-gray-500 dark:text-gray-400">No archived tasks.</p>';
                return;
            }
            archive.forEach(task => {
                const taskElement = document.createElement('div');
                taskElement.classList.add('p-4', 'bg-gray-100', 'dark:bg-gray-700', 'rounded-lg', 'mb-2', 'flex', 'justify-between', 'items-center');
                taskElement.innerHTML = `
                    <div>
                        <h3 class="font-semibold">R# ${task.roomNumber}</h3>
                        <p class="text-sm text-gray-600 dark:text-gray-400">${task.details || 'No details'}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Archived: ${new Date(task.archivedAt).toLocaleString()}</p>
                    </div>
                    <button class="unarchive-btn bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-lg" data-id="${task.id}">
                        <i class="fas fa-undo mr-2"></i>Unarchive
                    </button>
                `;
                taskElement.querySelector('.unarchive-btn').addEventListener('click', () => {
                    console.log(`Unarchive button clicked for task ${task.id}`);
                    unarchiveTask(task.id);
                });
                archiveList.appendChild(taskElement);
            });
        } catch (error) {
            console.error("Error rendering archive:", error);
            showNotification('Error rendering archive.');
        }
    }

    async function editTask(taskId) {
        try {
            const task = await getTask(taskId);
            if (task) {
                document.getElementById('taskRoomNumber').value = task.roomNumber;
                document.getElementById('taskNewReservationId').value = task.newReservationId;
                document.getElementById('taskCategory').value = task.category;
                document.getElementById('taskCheckOutTime').value = task.checkOutTime;
                document.getElementById('taskDetails').value = task.details;
                document.getElementById('taskDueDate').value = task.dueDate || new Date().toISOString().split('T')[0];
                document.getElementById('taskPriority').value = task.priority;
                document.getElementById('taskAssignedTo').value = task.assignedTo;
                document.getElementById('taskStatus').value = task.status;
                document.getElementById('taskTags').value = task.tags ? task.tags.join(', ') : '';
                modalTitle.textContent = 'Edit Task';
                submitBtn.textContent = 'Update Task';
                editingTaskId = taskId;

                checkOutTimeField.classList.add('hidden');
                newReservationIdField.classList.add('hidden');
                if (task.category === 'checkout') {
                    checkOutTimeField.classList.remove('hidden');
                } else if (task.category === 'extensions') {
                    newReservationIdField.classList.remove('hidden');
                }

                taskModal.classList.remove('hidden');
            }
        } catch (error) {
            console.error("Error editing task:", error);
            showNotification('Error editing task.');
        }
    }

    function allowDrop(e) {
        e.preventDefault();
    }

    async function drop(e) {
        try {
            e.preventDefault();
            const taskId = e.dataTransfer.getData('text/plain');
            const taskElement = document.querySelector(`[data-id="${taskId}"]`);
            const targetColumn = e.target.closest('.task-column');
            if (!targetColumn) return;
            const newCategory = targetColumn.id;
            const task = await getTask(taskId);
            if (task) {
                task.category = newCategory;
                await updateTask(task);
                await logHistory(taskId, `Task moved to ${newCategory}`);
                showNotification('Task moved successfully!');
            }
        } catch (error) {
            console.error("Error dropping task:", error);
            showNotification('Error moving task.');
        }
    }
});