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

    // Request Notification Permission
    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }

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
        // Listen for history changes for notifications
        db.ref('history').on('child_added', (snapshot) => {
            const historyEntry = snapshot.val();
            showDesktopNotification(`${historyEntry.action} by ${historyEntry.user}`, {
                body: `Task: R#${historyEntry.taskId}\n${formatDetails(historyEntry.details)}`,
                icon: 'https://via.placeholder.com/64'
            });
        });
    } catch (error) {
        console.error("Error loading tasks:", error);
        showNotification('Error loading tasks. Please try importing a backup.');
    }

    // Initialize SortableJS for each task column
    const columns = ['checkout', 'extensions', 'handover', 'guestrequests'];
    columns.forEach(category => {
        new Sortable(document.getElementById(category), {
            group: 'tasks',
            animation: 150,
            onEnd: async (evt) => {
                const taskId = evt.item.dataset.id;
                const newCategory = evt.to.id;
                const task = await getTask(taskId);
                if (task && task.category !== newCategory) {
                    task.category = newCategory;
                    await updateTask(task);
                    await logHistory(taskId, `Task moved to ${newCategory}`);
                    showNotification('Task moved successfully!');
                }
                // Reorder tasks within the same column
                const tasksInColumn = Array.from(evt.to.children).map(child => child.dataset.id);
                await updateTaskOrder(newCategory, tasksInColumn);
            }
        });
    });

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
            showDesktopNotification('Tasks Exported', { body: 'Backup file downloaded successfully.' });
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
                        const { linkedRoomId, ...rest } = task;
                        return rest;
                    });
                    await db.ref('tasks').set(sanitizedTasks.reduce((acc, task) => {
                        acc[task.id] = task;
                        return acc;
                    }, {}));
                }
                if (data.archive) {
                    const sanitizedArchive = data.archive.map(task => {
                        const { linkedRoomId, ...rest } = task;
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
                showDesktopNotification('Data Imported', { body: 'Tasks and related data imported successfully.' });
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
                showDesktopNotification('All Data Cleared', { body: 'All tasks, archives, history, and companies removed.' });
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
            showDesktopNotification('Tasks Archived', { body: `${selectedTasks.size} tasks archived successfully.` });
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
            showDesktopNotification('Tasks Deleted', { body: `${selectedTasks.size} tasks deleted successfully.` });
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
        if (!roomNumber && (taskCategory.value === 'checkout' || taskCategory.value === 'extensions')) {
            alert('Room Number is required for Checkout and Extensions!');
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
            attachments: editingTaskId ? (await getTask(editingTaskId))?.attachments || [] : [],
            order: 0 // Initialize order for sorting
        };

        try {
            if (editingTaskId) {
                const oldTask = await getTask(editingTaskId);
                const details = {};
                if (oldTask.status !== task.status) {
                    details.oldStatus = oldTask.status;
                    details.newStatus = task.status;
                }
                if (oldTask.priority !== task.priority) {
                    details.oldPriority = oldTask.priority;
                    details.newPriority = task.priority;
                }
                await updateTask(task);
                if (Object.keys(details).length > 0) {
                    await logHistory(task.id, `Task updated`, details);
                }
                showNotification('Task updated successfully!');
                showDesktopNotification('Task Updated', { body: `Task R#${task.roomNumber} updated.` });
            } else {
                await saveTask(task);
                await logHistory(task.id, `Task created`);
                showNotification('Task added successfully!');
                showDesktopNotification('Task Added', { body: `Task R#${task.roomNumber} added.` });
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

            if (!taskData) {
                resetForm();
                document.getElementById('taskDueDate').value = new Date().toISOString().split('T')[0];
            }

            if (presetCategory) {
                document.getElementById('taskCategory').value = presetCategory;
                taskCategory.dispatchEvent(new Event('change'));
            }

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
            notification.classList.remove('hidden');
            setTimeout(() => {
                notification.classList.add('hidden');
            }, 3000);
        } catch (error) {
            console.error("Error showing notification:", error);
        }
    }

    function showDesktopNotification(title, options) {
        if (Notification.permission === 'granted') {
            new Notification(title, options);
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

    async function updateTaskOrder(category, taskIds) {
        try {
            const updates = {};
            taskIds.forEach((taskId, index) => {
                updates[`tasks/${taskId}/order`] = index;
            });
            await db.ref().update(updates);
        } catch (error) {
            console.error("Error updating task order:", error);
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
                const taskElement = document.querySelector(`.task-card[data-id="${taskId}"]`);
                taskElement.classList.add('archived');
                setTimeout(async () => {
                    await db.ref(`archive/${taskId}`).set({ ...task, archivedAt: new Date().toISOString() });
                    await db.ref(`tasks/${taskId}`).remove();
                    await logHistory(taskId, `Task archived`);
                    showNotification('Task archived successfully!');
                    showDesktopNotification('Task Archived', { body: `Task R#${task.roomNumber} archived.` });
                }, 500);
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
                showDesktopNotification('Task Unarchived', { body: `Task R#${task.roomNumber} unarchived.` });
            }
        } catch (error) {
            console.error("Error unarchiving task:", error);
            throw error;
        }
    }

    async function deleteTask(taskId) {
        try {
            const taskElement = document.querySelector(`.task-card[data-id="${taskId}"]`);
            taskElement.classList.add('deleted');
            setTimeout(async () => {
                await db.ref(`tasks/${taskId}`).remove();
                await logHistory(taskId, `Task deleted`);
                showNotification('Task deleted successfully!');
                showDesktopNotification('Task Deleted', { body: `Task ID ${taskId} deleted.` });
            }, 500);
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
                showDesktopNotification('Task Duplicated', { body: `Task R#${task.roomNumber} duplicated.` });
            }
        } catch (error) {
            console.error("Error duplicating task:", error);
            throw error;
        }
    }

    async function logHistory(taskId, action, details = {}, user = 'System') {
        try {
            const historyEntry = {
                taskId,
                action,
                details,
                user,
                timestamp: new Date().toISOString(),
                type: categorizeAction(action)
            };
            await db.ref('history').push(historyEntry);
        } catch (error) {
            console.error("Error logging history:", error);
            throw error;
        }
    }

    function categorizeAction(action) {
        if (action.includes('status')) return 'status';
        if (action.includes('comment')) return 'comment';
        if (action.includes('attachment')) return 'attachment';
        return 'general';
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
                await logHistory(taskId, `Comment added: ${comment}`, { comment });
                showNotification('Comment added successfully!');
                showDesktopNotification('Comment Added', { body: `Comment added to Task ID ${taskId}.` });
                renderTasks();
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
                const oldText = updatedComments[commentIndex].text;
                updatedComments[commentIndex] = {
                    text: newText,
                    timestamp: new Date().toISOString()
                };
                await db.ref(`tasks/${taskId}/comments`).set(updatedComments);
                await logHistory(taskId, `Comment edited: ${oldText} to ${newText}`, { oldText, newText });
                showNotification('Comment updated successfully!');
                showDesktopNotification('Comment Updated', { body: `Comment updated for Task ID ${taskId}.` });
                renderTasks();
            }
        } catch (error) {
            console.error("Error editing comment:", error);
            throw error;
        }
    }

    async function deleteComment(taskId, commentIndex) {
        try {
            const task = await getTask(taskId);
            if (task && task.comments && task.comments[commentIndex]) {
                const commentText = task.comments[commentIndex].text;
                const updatedComments = task.comments.filter((_, index) => index !== commentIndex);
                await db.ref(`tasks/${taskId}/comments`).set(updatedComments);
                await logHistory(taskId, `Comment deleted: ${commentText}`, { comment: commentText });
                showNotification('Comment deleted successfully!');
                showDesktopNotification('Comment Deleted', { body: `Comment deleted from Task ID ${taskId}.` });
                renderTasks();
            }
        } catch (error) {
            console.error("Error deleting comment:", error);
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
                await logHistory(taskId, `Attachment added: ${attachment}`, { attachment });
                showNotification('Attachment added successfully!');
                showDesktopNotification('Attachment Added', { body: `Attachment added to Task ID ${taskId}.` });
                renderTasks();
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
                await logHistory(taskId, `Attachment edited: ${newText}`, { attachment: newText });
                showNotification('Attachment updated successfully!');
                showDesktopNotification('Attachment Updated', { body: `Attachment updated for Task ID ${taskId}.` });
                renderTasks();
            }
        } catch (error) {
            console.error("Error editing attachment:", error);
            throw error;
        }
    }

    function formatDetails(details) {
        if (typeof details === 'object' && details !== null) {
            return Object.entries(details).map(([key, value]) => `${key}: ${value}`).join('\n');
        }
        return details || '';
    }

    async function renderTasks(searchQuery = '') {
        try {
            const snapshot = await db.ref('tasks').once('value');
            let tasks = snapshot.val() ? Object.values(snapshot.val()) : [];

            // Apply filters
            if (searchQuery) {
                tasks = tasks.filter(task =>
                    task.roomNumber.toLowerCase().includes(searchQuery) ||
                    task.details.toLowerCase().includes(searchQuery) ||
                    task.assignedTo.toLowerCase().includes(searchQuery)
                );
            }

            if (filterPriority.value !== 'all') {
                tasks = tasks.filter(task => task.priority === filterPriority.value);
            }

            if (tagFilter.value) {
                const tags = tagFilter.value.split(',').map(tag => tag.trim().toLowerCase());
                tasks = tasks.filter(task =>
                    task.tags && task.tags.some(tag => tags.includes(tag.toLowerCase()))
                );
            }

            // Apply sorting
            if (sortTasks.value === 'priority') {
                const priorityOrder = { high: 1, medium: 2, low: 3 };
                tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
            } else if (sortTasks.value === 'dueDate') {
                tasks.sort((a, b) => {
                    const dateA = new Date(`${a.dueDate} ${a.dueTime || '23:59'}`).getTime();
                    const dateB = new Date(`${b.dueDate} ${b.dueTime || '23:59'}`).getTime();
                    return dateA - dateB;
                });
            } else {
                // Default sorting by order within each category
                tasks.sort((a, b) => a.order - b.order);
            }

            // Clear existing tasks
            const columns = ['checkout', 'extensions', 'handover', 'guestrequests'];
            columns.forEach(category => {
                document.getElementById(category).innerHTML = '';
                document.getElementById(`${category}Counter`).textContent = 'Tasks: 0';
            });

            // Render tasks
            const taskCounts = { checkout: 0, extensions: 0, handover: 0, guestrequests: 0 };
            tasks.forEach(task => {
                const taskElement = createTaskElement(task);
                const column = document.getElementById(task.category);
                if (column) {
                    column.appendChild(taskElement);
                    taskCounts[task.category]++;
                }
            });

            // Update task counters
            columns.forEach(category => {
                document.getElementById(`${category}Counter`).textContent = `Tasks: ${taskCounts[category]}`;
            });
        } catch (error) {
            console.error("Error rendering tasks:", error);
            showNotification('Error rendering tasks.');
        }
    }

    function createTaskElement(task) {
        const taskElement = document.createElement('div');
        taskElement.classList.add('task-card');
        taskElement.dataset.id = task.id;
        taskElement.draggable = true;
        if (task.status === 'Completed') {
            taskElement.classList.add('completed');
        }
        if (isOverdue(task)) {
            taskElement.classList.add('overdue');
        }

        const taskEssential = document.createElement('div');
        taskEssential.classList.add('task-essential');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.classList.add('task-checkbox');
        checkbox.checked = task.status === 'Completed';
        checkbox.addEventListener('change', async () => {
            task.status = checkbox.checked ? 'Completed' : 'Pending';
            await updateTask(task);
            await logHistory(task.id, `Status changed to ${task.status}`);
            renderTasks();
        });

        const content = document.createElement('div');
        content.classList.add('task-content');

        const header = document.createElement('div');
        header.classList.add('task-header');
        const title = document.createElement('span');
        title.classList.add('task-title');
        title.textContent = `R#${task.roomNumber || 'N/A'}`;
        const status = document.createElement('span');
        status.classList.add(`status-${task.status.toLowerCase().replace(' ', '-')}`);
        status.textContent = task.status;
        header.appendChild(title);
        header.appendChild(status);

        const meta = document.createElement('div');
        meta.classList.add('task-meta');
        if (task.dueDate) {
            const due = document.createElement('span');
            due.innerHTML = `<i class="fas fa-calendar-alt"></i> ${task.dueDate}${task.dueTime ? ` ${task.dueTime}` : ''}`;
            meta.appendChild(due);
        }
        if (task.checkOutTime && task.category === 'checkout') {
            const checkOut = document.createElement('span');
            checkOut.innerHTML = `<i class="fas fa-clock"></i> ${task.checkOutTime}`;
            meta.appendChild(checkOut);
        }
        if (task.assignedTo) {
            const assigned = document.createElement('span');
            assigned.innerHTML = `<i class="fas fa-user"></i> ${task.assignedTo}`;
            meta.appendChild(assigned);
        }

        const details = document.createElement('div');
        details.classList.add('task-details');
        details.textContent = task.details || 'No details provided';

        const tagsContainer = document.createElement('div');
        tagsContainer.classList.add('tags-container');
        if (task.tags && task.tags.length > 0) {
            task.tags.forEach(tag => {
                const tagItem = document.createElement('span');
                tagItem.classList.add('tag-item');
                tagItem.textContent = tag;
                tagsContainer.appendChild(tagItem);
            });
        }

        const commentsContainer = document.createElement('div');
        commentsContainer.classList.add('comments-container');
        if (task.comments && task.comments.length > 0) {
            commentsContainer.classList.add('active');
            task.comments.forEach((comment, index) => {
                const commentItem = document.createElement('div');
                commentItem.classList.add('comment-item');
                commentItem.innerHTML = `
                    ${comment.text}
                    <div class="comment-timestamp">${new Date(comment.timestamp).toLocaleString()}</div>
                `;
                const commentActions = document.createElement('div');
                commentActions.classList.add('comment-actions');

                const editBtn = document.createElement('button');
                editBtn.classList.add('edit-comment-btn');
                editBtn.innerHTML = '<i class="fas fa-edit"></i>';
                editBtn.addEventListener('click', () => editComment(task.id, index, prompt('Edit comment:', comment.text)));

                const deleteBtn = document.createElement('button');
                deleteBtn.classList.add('delete-comment-btn');
                deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                deleteBtn.addEventListener('click', () => {
                    if (confirm('Are you sure you want to delete this comment?')) {
                        deleteComment(task.id, index);
                    }
                });

                commentActions.appendChild(editBtn);
                commentActions.appendChild(deleteBtn);
                commentItem.appendChild(commentActions);
                commentsContainer.appendChild(commentItem);
            });
        }

        const actions = document.createElement('div');
        actions.classList.add('task-actions');
        const buttons = [
            { class: 'comment-btn', icon: 'fas fa-comment', tooltip: 'Add Comment', action: () => addComment(task.id, prompt('Add comment:')) },
            { class: 'attach-btn', icon: 'fas fa-paperclip', tooltip: 'Add Attachment', action: () => addAttachment(task.id, prompt('Enter attachment:')) },
            { class: 'history-btn', icon: 'fas fa-history', tooltip: 'View History', action: () => showHistory(task.id) },
            { class: 'edit-btn', icon: 'fas fa-edit', tooltip: 'Edit Task', action: () => openTaskModal('Edit Task', 'Update Task', null, task) },
            { class: 'duplicate-btn', icon: 'fas fa-copy', tooltip: 'Duplicate Task', action: () => duplicateTask(task.id) },
            { class: 'archive-btn', icon: 'fas fa-archive', tooltip: 'Archive Task', action: () => archiveTask(task.id) },
            { class: 'delete-btn', icon: 'fas fa-trash', tooltip: 'Delete Task', action: () => { if (confirm('Are you sure?')) deleteTask(task.id); } }
        ];
        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.classList.add(btn.class);
            button.innerHTML = `<i class="${btn.icon}"></i>`;
            button.dataset.tooltip = btn.tooltip;
            button.addEventListener('click', btn.action);
            actions.appendChild(button);
        });

        content.appendChild(header);
        content.appendChild(meta);
        content.appendChild(details);
        content.appendChild(tagsContainer);
        content.appendChild(commentsContainer);

        taskEssential.appendChild(checkbox);
        taskEssential.appendChild(content);
        taskEssential.appendChild(actions);

        taskElement.appendChild(taskEssential);

        // Swipe to Archive
        const swipeBackground = document.createElement('div');
        swipeBackground.classList.add('swipe-background');
        swipeBackground.innerHTML = '<i class="fas fa-archive"></i>';
        taskElement.appendChild(swipeBackground);

        taskElement.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        });

        taskElement.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            if (touchStartX - touchEndX > 50) {
                taskElement.classList.add('swiped');
                setTimeout(() => archiveTask(task.id), 400);
            }
        });

        // Drag and Drop
        taskElement.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', task.id);
        });

        return taskElement;
    }

    async function renderArchive() {
        try {
            const snapshot = await db.ref('archive').once('value');
            const tasks = snapshot.val() ? Object.values(snapshot.val()) : [];
            const archiveList = document.getElementById('archiveList');
            archiveList.innerHTML = '';

            tasks.forEach(task => {
                const taskElement = document.createElement('div');
                taskElement.classList.add('archive-task-card');
                taskElement.dataset.id = task.id;

                const content = document.createElement('div');
                content.classList.add('archive-task-content');

                const header = document.createElement('div');
                header.classList.add('archive-task-header');
                const title = document.createElement('span');
                title.classList.add('archive-task-title');
                title.textContent = `R#${task.roomNumber}`;
                const meta = document.createElement('div');
                meta.classList.add('archive-task-meta');
                meta.innerHTML = `
                    <span>Category: ${task.category}</span> | 
                    <span>Priority: ${task.priority}</span>
                `;
                header.appendChild(title);
                header.appendChild(meta);

                const details = document.createElement('div');
                details.classList.add('archive-task-details');
                details.innerHTML = `<p>${task.details || 'No details'}</p>`;
                if (task.archivedAt) {
                    const timestamp = document.createElement('div');
                    timestamp.classList.add('archive-timestamp');
                    timestamp.textContent = `Archived: ${new Date(task.archivedAt).toLocaleString()}`;
                    details.appendChild(timestamp);
                }

                content.appendChild(header);
                content.appendChild(details);

                const actions = document.createElement('div');
                actions.classList.add('archive-task-actions');
                const unarchiveBtn = document.createElement('button');
                unarchiveBtn.classList.add('unarchive-btn');
                unarchiveBtn.innerHTML = '<i class="fas fa-undo"></i>';
                unarchiveBtn.dataset.tooltip = 'Unarchive Task';
                unarchiveBtn.addEventListener('click', () => unarchiveTask(task.id));

                const deleteBtn = document.createElement('button');
                deleteBtn.classList.add('delete-btn');
                deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                deleteBtn.dataset.tooltip = 'Delete Task';
                deleteBtn.addEventListener('click', () => {
                    if (confirm('Are you sure you want to delete this archived task?')) {
                        db.ref(`archive/${task.id}`).remove();
                        showNotification('Archived task deleted successfully!');
                        showDesktopNotification('Archived Task Deleted', { body: `Task R#${task.roomNumber} deleted.` });
                    }
                });

                actions.appendChild(unarchiveBtn);
                actions.appendChild(deleteBtn);

                taskElement.appendChild(content);
                taskElement.appendChild(actions);
                archiveList.appendChild(taskElement);
            });
        } catch (error) {
            console.error("Error rendering archive:", error);
            showNotification('Error rendering archive.');
        }
    }

    async function showHistory(taskId) {
        try {
            const snapshot = await db.ref('history').orderByChild('taskId').equalTo(taskId).once('value');
            const history = snapshot.val() ? Object.values(snapshot.val()) : [];
            const historyList = document.getElementById('historyList');
            historyList.innerHTML = '';

            const groupedHistory = history.reduce((acc, entry) => {
                const date = new Date(entry.timestamp).toLocaleDateString();
                if (!acc[date]) acc[date] = [];
                acc[date].push(entry);
                return acc;
            }, {});

            Object.keys(groupedHistory).sort((a, b) => new Date(b) - new Date(a)).forEach(date => {
                const group = document.createElement('div');
                group.classList.add('history-group');
                const dateHeader = document.createElement('h3');
                dateHeader.textContent = date;
                group.appendChild(dateHeader);

                groupedHistory[date].forEach(entry => {
                    const item = document.createElement('div');
                    item.classList.add('history-item', `history-${entry.type}`);
                    item.innerHTML = `
                        <strong>${entry.action}</strong> by ${entry.user}<br>
                        <small>${new Date(entry.timestamp).toLocaleString()}</small><br>
                        ${formatDetails(entry.details)}
                    `;
                    group.appendChild(item);
                });

                historyList.appendChild(group);
            });

            historyModal.classList.remove('hidden');
        } catch (error) {
            console.error("Error showing history:", error);
            showNotification('Error showing history.');
        }
    }

    function isOverdue(task) {
        if (!task.dueDate || task.status === 'Completed') return false;
        const dueDateTime = new Date(`${task.dueDate} ${task.dueTime || '23:59'}`);
        return dueDateTime < new Date();
    }

    function checkReminders(tasks) {
        tasks.forEach(task => {
            if (task.dueDate && task.status !== 'Completed') {
                const dueDateTime = new Date(`${task.dueDate} ${task.dueTime || '23:59'}`);
                const now = new Date();
                const timeDiff = dueDateTime - now;
                if (timeDiff > 0 && timeDiff <= 15 * 60 * 1000) { // 15 minutes
                    showDesktopNotification('Task Reminder', {
                        body: `Task R#${task.roomNumber} is due soon: ${dueDateTime.toLocaleString()}`,
                        icon: 'https://via.placeholder.com/64'
                    });
                }
            }
        });
    }

    // Drag and Drop Handlers
    window.allowDrop = (e) => {
        e.preventDefault();
    };

    window.drop = async (e) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('text/plain');
        const newCategory = e.target.closest('.task-column').id;
        const task = await getTask(taskId);
        if (task && task.category !== newCategory) {
            task.category = newCategory;
            await updateTask(task);
            await logHistory(taskId, `Task moved to ${newCategory}`);
            showNotification('Task moved successfully!');
            showDesktopNotification('Task Moved', { body: `Task ID ${taskId} moved to ${newCategory}.` });
        }
    };
});