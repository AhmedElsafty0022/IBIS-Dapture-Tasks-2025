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

    // Predefined Tags
    const predefinedTags = [
        'LCO',
        '1PM',
        '2PM',
        '4PM',
        '6PM',
        'Dayuse'
    ];

    // Global variables
    let editingTaskId = null;
    let touchStartX = 0;
    let touchEndX = 0;
    let companies = [...predefinedCompanies];
    let tags = [...predefinedTags];
    let suggestedTasks = [];

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
    const taskCategory = document.getElementById('taskCategory');
    const checkOutTimeField = document.getElementById('checkOutTimeField');
    const newReservationIdField = document.getElementById('newReservationIdField');
    const assignedToField = document.getElementById('assignedToField');
    const quickAddButtons = document.querySelectorAll('.quick-add-btn');
    const exportTasksBtn = document.getElementById('exportTasksBtn');
    const importTasksBtn = document.getElementById('importTasksBtn');
    const importFileInput = document.getElementById('importFileInput');
    const taskAssignedTo = document.getElementById('taskAssignedTo');
    const taskTags = document.getElementById('taskTags');
    const reminderModal = document.getElementById('reminderModal');
    const skipReminderBtn = document.getElementById('skipReminderBtn');
    const confirmReminderBtn = document.getElementById('confirmReminderBtn');
    const reminderList = document.getElementById('reminderList');
    const helpBtn = document.getElementById('helpBtn');
    const helpModal = document.getElementById('helpModal');
    const closeHelpBtn = document.getElementById('closeHelpBtn');

    // Load dark mode preference
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark');
    }

    // Load companies and tags from Firebase
    db.ref('companies').on('value', (snapshot) => {
        const customCompanies = snapshot.val() ? Object.values(snapshot.val()) : [];
        companies = [...new Set([...predefinedCompanies, ...customCompanies])];
        console.log('Loaded companies:', companies);
    });

    db.ref('tags').on('value', (snapshot) => {
        const customTags = snapshot.val() ? Object.values(snapshot.val()) : [];
        tags = [...new Set([...predefinedTags, ...customTags])];
        console.log('Loaded tags:', tags);
    });

    // Initial load of tasks and check reminders
    try {
        db.ref('tasks').on('value', () => {
            renderTasks();
        });
        db.ref('archive').on('value', () => renderArchive());
        checkReminders();
    } catch (error) {
        console.error("Error loading tasks:", error);
        alert('Error loading tasks. Please try importing a backup.');
    }

    // Initialize SortableJS for each task column
    const columns = ['checkout', 'extensions', 'handover', 'guestrequests'];
    columns.forEach(category => {
        const column = document.getElementById(category);
        if (column) {
            new Sortable(column, {
                group: 'tasks',
                animation: 150,
                onEnd: async (evt) => {
                    const taskId = evt.item.dataset.id;
                    const newCategory = evt.to.id;
                    const originalCategory = evt.from.id;
                    console.log(`Attempting to move task ${taskId} from ${originalCategory} to ${newCategory}`);

                    // Skip if moving within the same column
                    if (originalCategory === newCategory) return;

                    const task = await getTask(taskId);
                    if (!task) {
                        console.error(`Task ${taskId} not found`);
                        alert('Error: Task not found.');
                        renderTasks();
                        return;
                    }

                    // Validate room number conflict for checkout or extensions
                    if (newCategory === 'checkout' || newCategory === 'extensions') {
                        const snapshot = await db.ref('tasks').once('value');
                        const tasks = snapshot.val() ? Object.values(snapshot.val()) : [];
                        const conflictingTask = tasks.find(t => 
                            t.roomNumber === task.roomNumber && 
                            (t.category === 'checkout' || t.category === 'extensions') &&
                            t.id !== taskId
                        );
                        if (conflictingTask) {
                            console.log(`Conflict: Room ${task.roomNumber} already in ${conflictingTask.category}`);
                            alert(`Room ${task.roomNumber} is already in ${conflictingTask.category}. Please resolve the conflict.`);
                            // Revert to original column
                            const originalColumn = document.getElementById(originalCategory);
                            originalColumn.appendChild(evt.item);
                            return;
                        }
                    }

                    // Update task fields based on new category
                    task.category = newCategory;
                    if (newCategory === 'checkout') {
                        task.checkOutTime = task.checkOutTime || '12:00';
                        task.newReservationId = '';
                    } else if (newCategory === 'extensions') {
                        task.newReservationId = task.newReservationId || `Resv#${Math.floor(1000 + Math.random() * 9000)}`;
                        task.checkOutTime = '';
                    } else {
                        task.checkOutTime = '';
                        task.newReservationId = '';
                        task.assignedTo = '';
                    }

                    try {
                        await updateTask(task);
                        await logHistory(taskId, `Task moved to ${newCategory}`);
                        // Update task order in the new column
                        const tasksInColumn = Array.from(evt.to.children).map(child => child.dataset.id);
                        await updateTaskOrder(newCategory, tasksInColumn);
                        console.log(`Task ${taskId} successfully moved to ${newCategory}`);
                    } catch (error) {
                        console.error("Error moving task:", error);
                        alert('Error moving task. Reverting changes.');
                        // Revert to original column on error
                        const originalColumn = document.getElementById(originalCategory);
                        originalColumn.appendChild(evt.item);
                        renderTasks();
                    }
                }
            });
        }
    });

    // Export Tasks
    exportTasksBtn?.addEventListener('click', async () => {
        try {
            const tasksSnapshot = await db.ref('tasks').once('value');
            const archiveSnapshot = await db.ref('archive').once('value');
            const historySnapshot = await db.ref('history').once('value');
            const companiesSnapshot = await db.ref('companies').once('value');
            const tagsSnapshot = await db.ref('tags').once('value');
            const roomUsageSnapshot = await db.ref('roomUsage').once('value');
            const data = {
                tasks: tasksSnapshot.val() ? Object.values(tasksSnapshot.val()) : [],
                archive: archiveSnapshot.val() ? Object.values(archiveSnapshot.val()) : [],
                history: historySnapshot.val() ? Object.values(historySnapshot.val()) : [],
                companies: companiesSnapshot.val() ? Object.values(companiesSnapshot.val()) : [],
                tags: tagsSnapshot.val() ? Object.values(tagsSnapshot.val()) : [],
                roomUsage: roomUsageSnapshot.val() ? Object.values(roomUsageSnapshot.val()) : []
            };
            const dataStr = JSON.stringify(data, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `task_manager_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            alert('Tasks exported successfully!');
        } catch (error) {
            console.error("Error exporting data:", error);
            alert('Error exporting data.');
        }
    });

    // Import Tasks
    importTasksBtn?.addEventListener('click', () => importFileInput?.click());
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
                if (data.tags) {
                    await db.ref('tags').set(data.tags.reduce((acc, tag, index) => {
                        acc[index] = tag;
                        return acc;
                    }, {}));
                }
                if (data.roomUsage) {
                    await db.ref('roomUsage').set(data.roomUsage.reduce((acc, usage, index) => {
                        acc[index] = usage;
                        return acc;
                    }, {}));
                }
                alert('Data imported successfully!');
            } catch (error) {
                console.error("Error importing data:", error);
                alert('Error importing data. Please check the file format.');
            }
        };
        reader.readAsText(file);
    });

    // Autocomplete for Company To
    let autocompleteTimeout;
    const autocompleteContainer = document.createElement('div');
    autocompleteContainer.classList.add('autocomplete-container');
    taskAssignedTo?.parentNode?.insertBefore(autocompleteContainer, taskAssignedTo);
    autocompleteContainer.appendChild(taskAssignedTo);

    const autocompleteList = document.createElement('div');
    autocompleteList.classList.add('autocomplete-list');
    autocompleteContainer.appendChild(autocompleteList);

    taskAssignedTo?.addEventListener('input', () => {
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

    taskAssignedTo?.addEventListener('blur', () => {
        setTimeout(() => {
            autocompleteList.innerHTML = '';
        }, 200);
    });

    taskAssignedTo?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.stopPropagation();
        }
    });

    // Autocomplete for Tags
    let tagAutocompleteTimeout;
    const tagAutocompleteContainer = document.createElement('div');
    tagAutocompleteContainer.classList.add('autocomplete-container');
    taskTags?.parentNode?.insertBefore(tagAutocompleteContainer, taskTags);
    tagAutocompleteContainer.appendChild(taskTags);

    const tagAutocompleteList = document.createElement('div');
    tagAutocompleteList.classList.add('autocomplete-list');
    tagAutocompleteContainer.appendChild(tagAutocompleteList);

    taskTags?.addEventListener('input', () => {
        clearTimeout(tagAutocompleteTimeout);
        tagAutocompleteTimeout = setTimeout(() => {
            const query = taskTags.value.trim().toLowerCase();
            tagAutocompleteList.innerHTML = '';
            if (!query) return;
            const matches = tags.filter(tag => tag.toLowerCase().includes(query));
            if (matches.length === 0) return;
            matches.forEach(tag => {
                const div = document.createElement('div');
                div.textContent = tag;
                div.addEventListener('click', () => {
                    const currentTags = taskTags.value.split(',').map(t => t.trim()).filter(t => t);
                    if (!currentTags.includes(tag)) {
                        currentTags.push(tag);
                        taskTags.value = currentTags.join(', ');
                    }
                    tagAutocompleteList.innerHTML = '';
                });
                tagAutocompleteList.appendChild(div);
            });
        }, 300);
    });

    taskTags?.addEventListener('blur', () => {
        setTimeout(() => {
            tagAutocompleteList.innerHTML = '';
        }, 200);
    });

    taskTags?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.stopPropagation();
        }
    });

    // Handle Enter key for form submission
    document.getElementById('taskForm')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.target.closest('textarea')) {
            e.preventDefault();
            submitBtn?.click();
        }
    });

    // Open Modal for Adding Task
    addTaskBtn?.addEventListener('click', () => {
        openTaskModal('Add New Task', 'Add Task');
    });

    quickAddBtn?.addEventListener('click', () => {
        openTaskModal('Add New Task', 'Add Task');
    });

    // Quick Add Buttons in Each Column
    quickAddButtons.forEach(button => {
        button?.addEventListener('click', () => {
            const category = button.getAttribute('data-category');
            openTaskModal('Quick Add Task', 'Add Task', category);
        });
    });

    // Cancel Modal
    cancelBtn?.addEventListener('click', () => {
        taskModal?.classList.add('hidden');
        resetForm();
    });

    // Help Modal
    helpBtn?.addEventListener('click', () => {
        helpModal?.classList.remove('hidden');
    });

    closeHelpBtn?.addEventListener('click', () => {
        helpModal?.classList.add('hidden');
    });

    // Shortcut Keys
    console.log('Keydown event listener attached');
    document.addEventListener('keydown', (e) => {
        console.log('Keydown event:', e.key, e.ctrlKey);
        if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Ctrl + Z pressed, opening task modal');
            try {
                openTaskModal('Add New Task', 'Add Task');
            } catch (error) {
                console.error('Error opening task modal:', error);
                alert('Error opening task modal.');
            }
        }
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (!taskModal?.classList.contains('hidden')) {
                submitBtn?.click();
            }
        }
        if (e.ctrlKey && e.key === 'x') {
            e.preventDefault();
            viewArchiveBtn?.click();
        }
        if (e.ctrlKey && e.key === 'h') {
            e.preventDefault();
            document.body.classList.toggle('dark');
            localStorage.setItem('darkMode', document.body.classList.contains('dark') ? 'enabled' : 'disabled');
        }
        if (e.ctrlKey && e.key === '/') {
            e.preventDefault();
            helpModal?.classList.toggle('hidden');
        }
        if (e.key === 'Escape') {
            taskModal?.classList.add('hidden');
            archiveModal?.classList.add('hidden');
            historyModal?.classList.add('hidden');
            reminderModal?.classList.add('hidden');
            helpModal?.classList.add('hidden');
            resetForm();
        }
    });

    // Form Submission
    document.getElementById('taskForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        submitBtn?.click();
    });

    // Clear All Tasks
    clearTasksBtn?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all tasks, archives, history, companies, tags, and room usage data?')) {
            try {
                await db.ref('tasks').remove();
                await db.ref('archive').remove();
                await db.ref('history').remove();
                await db.ref('companies').remove();
                await db.ref('tags').remove();
                await db.ref('roomUsage').remove();
                alert('All data cleared!');
            } catch (error) {
                console.error("Error clearing data:", error);
                alert('Error clearing data.');
            }
        }
    });

    // Search Tasks
    searchInput?.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        renderTasks(query);
    });

    // Sort Tasks
    sortTasks?.addEventListener('change', () => {
        renderTasks(searchInput?.value.toLowerCase() || '');
    });

    // Filter by Priority
    filterPriority?.addEventListener('change', () => {
        renderTasks(searchInput?.value.toLowerCase() || '');
    });

    // Filter by Tag
    tagFilter?.addEventListener('input', () => {
        const query = searchInput?.value.toLowerCase() || '';
        renderTasks(query);
    });

    // View Archive
    viewArchiveBtn?.addEventListener('click', () => {
        archiveModal?.classList.remove('hidden');
        renderArchive();
    });

    closeArchiveBtn?.addEventListener('click', () => {
        archiveModal?.classList.add('hidden');
    });

    // Close History Modal
    closeHistoryBtn?.addEventListener('click', () => {
        historyModal?.classList.add('hidden');
    });

    // Reminder Modal Buttons
    skipReminderBtn?.addEventListener('click', () => {
        reminderModal?.classList.add('hidden');
    });

    confirmReminderBtn?.addEventListener('click', async () => {
        try {
            const checkboxes = reminderList.querySelectorAll('input[type="checkbox"]:checked');
            for (let checkbox of checkboxes) {
                const suggestion = suggestedTasks.find(s => s.id === checkbox.dataset.id);
                if (suggestion) {
                    const task = {
                        id: Date.now(),
                        roomNumber: suggestion.roomNumber,
                        newReservationId: suggestion.category === 'extensions' ? `Resv#${Math.floor(1000 + Math.random() * 9000)}` : '',
                        category: suggestion.category,
                        checkOutTime: suggestion.category === 'checkout' ? '12:00' : '',
                        details: suggestion.details || '',
                        dueDate: new Date().toISOString().split('T')[0],
                        dueTime: '',
                        priority: 'Medium',
                        assignedTo: suggestion.assignedTo || '',
                        status: 'Pending',
                        tags: [],
                        createdAt: new Date().toISOString(),
                        comments: [],
                        history: [],
                        attachments: [],
                        order: 0
                    };
                    await saveTask(task);
                    await logHistory(task.id, `Task created from reminder`);
                    await logRoomUsage(task.roomNumber, task.category, task.assignedTo);
                }
            }
            reminderModal?.classList.add('hidden');
            renderTasks();
        } catch (error) {
            console.error("Error adding suggested tasks:", error);
            alert('Error adding suggested tasks.');
        }
    });

    // Dynamically Show/Hide Fields Based on Category
    taskCategory?.addEventListener('change', () => {
        const category = taskCategory.value;
        checkOutTimeField?.classList.add('hidden');
        newReservationIdField?.classList.add('hidden');
        assignedToField?.classList.remove('hidden');
        if (category === 'checkout') {
            checkOutTimeField?.classList.remove('hidden');
            if (!document.getElementById('taskCheckOutTime')?.value) {
                document.getElementById('taskCheckOutTime').value = '12:00';
            }
        } else if (category === 'extensions') {
            newReservationIdField?.classList.remove('hidden');
        } else if (category === 'handover' || category === 'guestrequests') {
            assignedToField?.classList.add('hidden');
            document.getElementById('taskAssignedTo').value = '';
        }
    });

    // Submit Task Form
    submitBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        const roomNumber = document.getElementById('taskRoomNumber')?.value.trim();
        if (!roomNumber && (taskCategory?.value === 'checkout' || taskCategory?.value === 'extensions')) {
            alert('Room Number is required for Checkout and Extensions!');
            return;
        }
        const newReservationId = document.getElementById('taskNewReservationId')?.value;
        const category = document.getElementById('taskCategory')?.value;
        const checkOutTime = document.getElementById('taskCheckOutTime')?.value;
        const details = document.getElementById('taskDetails')?.value;
        const dueDate = document.getElementById('taskDueDate')?.value;
        const dueTime = document.getElementById('taskDueTime')?.value;
        const priority = document.getElementById('taskPriority')?.value;
        const assignedTo = (category === 'handover' || category === 'guestrequests') ? '' : document.getElementById('taskAssignedTo')?.value.trim();
        let taskTagsInput = document.getElementById('taskTags')?.value.split(',').map(tag => tag.trim()).filter(tag => tag);

        // Validate room number for checkout and extensions
        if (category === 'checkout' || category === 'extensions') {
            const snapshot = await db.ref('tasks').once('value');
            const tasks = snapshot.val() ? Object.values(snapshot.val()) : [];
            const conflictingTask = tasks.find(t => 
                t.roomNumber === roomNumber && 
                (t.category === 'checkout' || t.category === 'extensions') &&
                (!editingTaskId || t.id !== editingTaskId)
            );
            if (conflictingTask) {
                alert(`Room ${roomNumber} is already in ${conflictingTask.category}. Please resolve the conflict.`);
                return;
            }
        }

        // Save new tags to Firebase if not already present
        const newTags = taskTagsInput.filter(tag => !tags.includes(tag));
        if (newTags.length > 0) {
            try {
                for (const tag of newTags) {
                    await db.ref('tags').push(tag);
                }
                tags.push(...newTags);
            } catch (error) {
                console.error("Error saving new tags:", error);
                alert('Error saving new tags.');
            }
        }

        let task = {
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
            status: document.getElementById('taskStatus')?.value || 'Pending',
            tags: taskTagsInput,
            createdAt: new Date().toISOString(),
            comments: editingTaskId ? (await getTask(editingTaskId))?.comments || [] : [],
            history: editingTaskId ? (await getTask(editingTaskId))?.history || [] : [],
            attachments: editingTaskId ? (await getTask(editingTaskId))?.attachments || [] : [],
            order: 0
        };

        // Save new company to Firebase if not already present
        if (assignedTo && !companies.includes(assignedTo)) {
            try {
                await db.ref('companies').push(assignedTo);
                companies.push(assignedTo);
            } catch (error) {
                console.error("Error saving new company:", error);
                alert('Error saving new company.');
            }
        }

        try {
            if (editingTaskId) {
                const oldTask = await getTask(editingTaskId);
                task.order = oldTask.order;
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
            } else {
                const snapshot = await db.ref('tasks').once('value');
                const tasks = snapshot.val() ? Object.values(snapshot.val()).filter(t => t.category === category) : [];
                task.order = tasks.length > 0 ? Math.max(...tasks.map(t => t.order)) + 1 : 0;
                await saveTask(task);
                await logHistory(task.id, `Task created`);
                await logRoomUsage(roomNumber, category, assignedTo);
            }
            taskModal?.classList.add('hidden');
            resetForm();
            showToast('Task added successfully!');
        } catch (error) {
            console.error("Error submitting task:", error);
            alert('Error submitting task.');
        }
    });

    // Check Reminders
    async function checkReminders() {
        try {
            const lastReminderDate = localStorage.getItem('lastReminderDate');
            const today = new Date().toISOString().split('T')[0];
            if (lastReminderDate === today) return;

            const snapshot = await db.ref('roomUsage').once('value');
            const roomUsage = snapshot.val() ? Object.values(snapshot.val()) : [];

            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            const recentUsage = roomUsage.filter(usage => new Date(usage.timestamp) >= oneWeekAgo);

            const usageCounts = recentUsage.reduce((acc, usage) => {
                const key = `${usage.roomNumber}:${usage.category}`;
                if (!acc[key]) {
                    acc[key] = { roomNumber: usage.roomNumber, category: usage.category, count: 0, assignedTo: usage.assignedTo, details: usage.details };
                }
                acc[key].count++;
                return acc;
            }, {});

            suggestedTasks = Object.values(usageCounts).filter(usage => usage.count >= 3).map(usage => ({
                id: `${usage.roomNumber}:${usage.category}:${Date.now()}`,
                roomNumber: usage.roomNumber,
                category: usage.category,
                assignedTo: usage.assignedTo,
                details: usage.details
            }));

            if (suggestedTasks.length > 0) {
                renderReminderModal();
                localStorage.setItem('lastReminderDate', today);
            }
        } catch (error) {
            console.error("Error checking reminders:", error);
            alert('Error checking reminders.');
        }
    }

    // Render Reminder Modal
    function renderReminderModal() {
        if (reminderList) {
            reminderList.innerHTML = '';
            suggestedTasks.forEach(suggestion => {
                const suggestionItem = document.createElement('div');
                suggestionItem.classList.add('flex', 'items-center', 'gap-2', 'p-2', 'border', 'border-gray-200', 'dark:border-gray-600', 'rounded-lg');
                suggestionItem.innerHTML = `
                    <input type="checkbox" data-id="${suggestion.id}" class="task-checkbox" checked>
                    <span>R#${suggestion.roomNumber} - ${suggestion.category}${suggestion.assignedTo ? ` (Assigned to ${suggestion.assignedTo})` : ''}</span>
                `;
                reminderList.appendChild(suggestionItem);
            });
            reminderModal?.classList.remove('hidden');
        }
    }

    // Log Room Usage
    async function logRoomUsage(roomNumber, category, assignedTo, details = '') {
        if (!roomNumber || !category) return;
        try {
            const usage = {
                roomNumber,
                category,
                assignedTo: assignedTo || '',
                details,
                timestamp: new Date().toISOString()
            };
            await db.ref('roomUsage').push(usage);
        } catch (error) {
            console.error("Error logging room usage:", error);
            alert('Error logging room usage.');
        }
    }

    async function renderTasks(searchQuery = '') {
        try {
            const snapshot = await db.ref('tasks').once('value');
            let tasks = snapshot.val() ? Object.values(snapshot.val()) : [];
            console.log('Fetched tasks:', tasks);

            // Apply filters
            if (searchQuery) {
                tasks = tasks.filter(task =>
                    task.roomNumber.toLowerCase().includes(searchQuery) ||
                    task.details.toLowerCase().includes(searchQuery) ||
                    task.assignedTo.toLowerCase().includes(searchQuery) ||
                    (task.tags && task.tags.some(tag => tag.toLowerCase().includes(searchQuery)))
                );
            }

            if (filterPriority?.value !== 'all') {
                tasks = tasks.filter(task => task.priority === filterPriority.value);
            }

            if (tagFilter?.value) {
                const tags = tagFilter.value.split(',').map(tag => tag.trim().toLowerCase());
                tasks = tasks.filter(task =>
                    task.tags && task.tags.some(tag => tags.includes(tag.toLowerCase()))
                );
            }

            // Group tasks by category
            const tasksByCategory = {
                checkout: [],
                extensions: [],
                handover: [],
                guestrequests: []
            };

            tasks.forEach(task => {
                if (tasksByCategory[task.category]) {
                    tasksByCategory[task.category].push(task);
                }
            });

            // Sort tasks within each category
            const priorityOrder = { High: 1, Medium: 2, Low: 3 };
            Object.keys(tasksByCategory).forEach(category => {
                if (sortTasks?.value === 'priority') {
                    tasksByCategory[category].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
                } else if (sortTasks?.value === 'dueDate') {
                    tasksByCategory[category].sort((a, b) => {
                        const dateA = new Date(`${a.dueDate} ${a.dueTime || '23:59'}`).getTime();
                        const dateB = new Date(`${b.dueDate} ${b.dueTime || '23:59'}`).getTime();
                        return dateA - dateB;
                    });
                } else {
                    tasksByCategory[category].sort((a, b) => a.order - b.order);
                }
            });

            // Clear existing tasks
            const columns = ['checkout', 'extensions', 'handover', 'guestrequests'];
            columns.forEach(category => {
                const column = document.getElementById(category);
                if (column) column.innerHTML = '';
                const counter = document.getElementById(`${category}Counter`);
                if (counter) counter.textContent = 'Tasks: 0';
            });

            // Render tasks
            const taskCounts = { checkout: 0, extensions: 0, handover: 0, guestrequests: 0 };
            columns.forEach(category => {
                tasksByCategory[category].forEach(task => {
                    const taskElement = createTaskElement(task);
                    const column = document.getElementById(category);
                    if (column) {
                        column.appendChild(taskElement);
                        taskCounts[category]++;
                    }
                });
                const counter = document.getElementById(`${category}Counter`);
                if (counter) counter.textContent = `Tasks: ${taskCounts[category]}`;
            });
        } catch (error) {
            console.error("Error rendering tasks:", error);
            alert('Error rendering tasks.');
        }
    }

    function createTaskElement(task) {
        console.log('Creating task element for task:', task.id);
        const taskElement = document.createElement('div');
        taskElement.classList.add('task-card', `priority-${task.priority.toLowerCase()}`);
        taskElement.setAttribute('data-id', task.id);
        taskElement.setAttribute('draggable', 'true');

        // Check if task is overdue
        const dueDateTime = new Date(`${task.dueDate} ${task.dueTime || '23:59'}`);
        if (dueDateTime < new Date() && task.status !== 'Completed') {
            taskElement.classList.add('overdue');
        }

        // Format check-out time
        let checkOutTimeDisplay = '';
        if (task.checkOutTime) {
            const [hours, minutes] = task.checkOutTime.split(':');
            const period = parseInt(hours) >= 12 ? 'PM' : 'AM';
            const displayHours = parseInt(hours) % 12 || 12;
            checkOutTimeDisplay = `${displayHours}:${minutes.padStart(2, '0')} ${period}`;
        }

        // Initialize comments and attachments if undefined
        task.comments = task.comments || [];
        task.attachments = task.attachments || [];

        // Determine progress bar class based on status
        const statusClass = task.status.toLowerCase().replace(' ', '-');

        taskElement.innerHTML = `
            <div class="swipe-background">
                <i class="fas fa-archive icon text-xl text-gray-500"></i>
            </div>
            <div class="task-content">
                <div class="task-header">
                    <div class="task-title">
                        <i class="fas fa-door-open mr-2 text-teal-500"></i>R#${task.roomNumber || 'N/A'}
                        ${task.newReservationId ? `<span class="task-reservation-id ml-2 text-xs text-gray-500 dark:text-gray-400">${task.newReservationId}</span>` : ''}
                    </div>
                    <div class="task-meta">
                        ${task.checkOutTime ? `<span class="task-checkout-time" data-time="${task.checkOutTime}"><i class="fas fa-clock mr-1 text-white"></i>${checkOutTimeDisplay}</span>` : ''}
                        <span><i class="fas fa-user mr-1 text-teal-500"></i>${task.assignedTo || 'Unassigned'}</span>
                        <span><i class="fas fa-exclamation-circle mr-1 text-teal-500"></i>${task.priority}</span>
                        <span class="status-badge status-${task.status.toLowerCase().replace(' ', '-')}">
                            <i class="fas fa-circle mr-1 text-xs"></i>${task.status}
                        </span>
                    </div>
                </div>
                <div class="progress-container">
                    <div class="progress-bar ${statusClass}"></div>
                </div>
                <div class="task-details">
                    <p>${task.details || 'No details'}</p>
                </div>
                <div class="tags-container">
                    ${task.tags && task.tags.length ? task.tags.map(tag => `
                        <span class="tag-item">
                            <i class="fas fa-tag mr-1 text-teal-500 text-xs"></i>${tag}
                        </span>
                    `).join('') : ''}
                </div>
                <div class="comments-container" id="comments-${task.id}">
                    ${task.comments.length ? task.comments.map(comment => `
                        <div class="comment-item">
                            <p class="comment-text">${comment.text}</p>
                            <div class="comment-timestamp">${new Date(comment.timestamp).toLocaleString()}</div>
                            <div class="comment-actions">
                                <button class="edit-comment-btn text-teal-500 hover:text-teal-600" data-comment-id="${comment.id}">
                                    <i class="fas fa-edit text-sm"></i>
                                </button>
                                <button class="delete-comment-btn text-red-500 hover:text-red-600" data-comment-id="${comment.id}">
                                    <i class="fas fa-trash text-sm"></i>
                                </button>
                            </div>
                        </div>
                    `).join('') : '<p class="text-gray-500 dark:text-gray-400 text-sm">No comments</p>'}
                </div>
                <div class="attachments-container mt-2">
                    ${task.attachments.length ? task.attachments.map(attachment => `
                        <div class="attachment-item flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                            <i class="fas fa-file mr-1 text-teal-500"></i>${attachment.name} (${(attachment.size / 1024).toFixed(1)} KB)
                        </div>
                    `).join('') : ''}
                </div>
                <div class="task-action-bar">
                    <button class="action-btn comment-btn" data-id="${task.id}" data-tooltip="Add Comment">
                        <i class="fas fa-comment text-base"></i>
                    </button>
                    <button class="action-btn attach-btn" data-id="${task.id}" data-tooltip="Attach File">
                        <i class="fas fa-paperclip text-base"></i>
                    </button>
                    <button class="action-btn history-btn" data-id="${task.id}" data-tooltip="View History">
                        <i class="fas fa-history text-base"></i>
                    </button>
                    <button class="action-btn edit-btn" data-id="${task.id}" data-tooltip="Edit Task">
                        <i class="fas fa-edit text-base"></i>
                    </button>
                    <button class="action-btn duplicate-btn" data-id="${task.id}" data-tooltip="Duplicate Task">
                        <i class="fas fa-copy text-base"></i>
                    </button>
                    <button class="action-btn archive-btn" data-id="${task.id}" data-tooltip="Archive Task">
                        <i class="fas fa-archive text-base"></i>
                    </button>
                    <button class="action-btn delete-btn" data-id="${task.id}" data-tooltip="Delete Task">
                        <i class="fas fa-trash text-base"></i>
                    </button>
                </div>
            </div>
        `;
        console.log('Task action bar added to task:', task.id);

        // Drag and Drop Events
        taskElement.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', task.id);
            taskElement.classList.add('dragging');
        });

        taskElement.addEventListener('dragend', () => {
            taskElement.classList.remove('dragging');
        });

        // Swipe to Archive
        let isSwiping = false;
        taskElement.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            isSwiping = false;
        });

        taskElement.addEventListener('touchmove', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            const diffX = touchStartX - touchEndX;
            if (Math.abs(diffX) > 30) {
                isSwiping = true;
                if (diffX > 50) {
                    taskElement.classList.add('swiping');
                } else {
                    taskElement.classList.remove('swiping');
                }
            }
        });

        taskElement.addEventListener('touchend', async (e) => {
            if (!isSwiping) return;
            const diffX = touchStartX - touchEndX;
            if (diffX > 100) {
                taskElement.classList.add('swiped');
                setTimeout(async () => {
                    await archiveTask(task.id);
                    taskElement.remove();
                }, 300);
            } else {
                taskElement.classList.remove('swiping');
            }
        });

        // Action Button Events
        taskElement.querySelector('.comment-btn')?.addEventListener('click', () => {
            const commentsContainer = taskElement.querySelector(`#comments-${task.id}`);
            commentsContainer.classList.toggle('active');
            if (commentsContainer.classList.contains('active')) {
                const commentInput = document.createElement('div');
                commentInput.classList.add('comment-input', 'p-2', 'border', 'border-gray-200', 'dark:border-gray-600', 'rounded-lg', 'mt-2');
                commentInput.innerHTML = `
                    <textarea placeholder="Add a comment..." class="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-gray-200"></textarea>
                    <div class="flex justify-end gap-2 mt-2">
                        <button class="save-comment-btn bg-teal-500 hover:bg-teal-600 text-white px-3 py-1 rounded-lg">Save</button>
                        <button class="cancel-comment-btn bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-1 rounded-lg">Cancel</button>
                    </div>
                `;
                commentsContainer.appendChild(commentInput);

                commentInput.querySelector('.save-comment-btn')?.addEventListener('click', async () => {
                    const text = commentInput.querySelector('textarea').value.trim();
                    if (text) {
                        const comment = {
                            id: Date.now(),
                            text,
                            timestamp: new Date().toISOString()
                        };
                        task.comments.push(comment);
                        await updateTask(task);
                        await logHistory(task.id, `Comment added: "${text}"`);
                        commentInput.remove();
                        renderTasks();
                    }
                });

                commentInput.querySelector('.cancel-comment-btn')?.addEventListener('click', () => {
                    commentInput.remove();
                });
            }
        });

        taskElement.querySelector('.attach-btn')?.addEventListener('click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.pdf,.jpg,.png';
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const attachment = {
                        id: Date.now(),
                        name: file.name,
                        type: file.type,
                        size: file.size
                    };
                    task.attachments.push(attachment);
                    await updateTask(task);
                    await logHistory(task.id, `Attachment added: ${file.name}`);
                    renderTasks();
                }
            };
            fileInput.click();
        });

        taskElement.querySelector('.history-btn')?.addEventListener('click', async () => {
            const historyList = document.getElementById('historyList');
            historyList.innerHTML = '';
            try {
                const snapshot = await db.ref('history').once('value');
                const history = snapshot.val() ? Object.values(snapshot.val()).filter(h => h.taskId === task.id) : [];
                history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                history.forEach(entry => {
                    const li = document.createElement('li');
                    li.classList.add('border-b', 'border-gray-200', 'dark:border-gray-600', 'py-2');
                    let detailsText = '';
                    if (entry.details && Object.keys(entry.details).length > 0) {
                        if (entry.details.oldStatus) {
                            detailsText += `Status changed from ${entry.details.oldStatus} to ${entry.details.newStatus}`;
                        }
                        if (entry.details.oldPriority) {
                            detailsText += `${detailsText ? ', ' : ''}Priority changed from ${entry.details.oldPriority} to ${entry.details.newPriority}`;
                        }
                    }
                    li.innerHTML = `
                        <span class="text-gray-700 dark:text-gray-300">${entry.action}${detailsText ? `: ${detailsText}` : ''}</span>
                        <span class="text-sm text-gray-500 dark:text-gray-400 block">${new Date(entry.timestamp).toLocaleString()}</span>
                    `;
                    historyList.appendChild(li);
                });
                historyModal?.classList.remove('hidden');
            } catch (error) {
                console.error("Error loading history:", error);
                alert('Error loading history.');
            }
        });

        taskElement.querySelector('.edit-btn')?.addEventListener('click', () => {
            openTaskModal('Edit Task', 'Update Task', null, task);
        });

        taskElement.querySelector('.duplicate-btn')?.addEventListener('click', async () => {
            const newTask = { ...task, id: Date.now(), createdAt: new Date().toISOString(), comments: [], history: [], attachments: [] };
            await saveTask(newTask);
            await logHistory(newTask.id, `Task duplicated from task ${task.id}`);
            renderTasks();
        });

        taskElement.querySelector('.archive-btn')?.addEventListener('click', async () => {
            await archiveTask(task.id);
            renderTasks();
        });

        taskElement.querySelector('.delete-btn')?.addEventListener('click', async () => {
            if (confirm('Are you sure you want to delete this task?')) {
                taskElement.classList.add('swiped');
                setTimeout(async () => {
                    await deleteTask(task.id);
                    renderTasks();
                }, 300);
            }
        });

        // Comment Actions
        taskElement.querySelectorAll('.edit-comment-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const commentId = btn.dataset.commentId;
                const comment = task.comments.find(c => c.id == commentId);
                if (!comment) return;

                const commentItem = btn.closest('.comment-item');
                commentItem.innerHTML = `
                    <textarea class="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-gray-200">${comment.text}</textarea>
                    <div class="flex justify-end gap-2 mt-2">
                        <button class="save-edit-comment-btn bg-teal-500 hover:bg-teal-600 text-white px-3 py-1 rounded-lg">Save</button>
                        <button class="cancel-edit-comment-btn bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-1 rounded-lg">Cancel</button>
                    </div>
                `;

                commentItem.querySelector('.save-edit-comment-btn')?.addEventListener('click', async () => {
                    const newText = commentItem.querySelector('textarea').value.trim();
                    if (newText) {
                        comment.text = newText;
                        comment.timestamp = new Date().toISOString();
                        await updateTask(task);
                        await logHistory(task.id, `Comment edited: "${newText}"`);
                        renderTasks();
                    }
                });

                commentItem.querySelector('.cancel-edit-comment-btn')?.addEventListener('click', () => {
                    renderTasks();
                });
            });
        });

        taskElement.querySelectorAll('.delete-comment-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const commentId = btn.dataset.commentId;
                task.comments = task.comments.filter(c => c.id != commentId);
                await updateTask(task);
                await logHistory(task.id, `Comment deleted`);
                renderTasks();
            });
        });

        return taskElement;
    }

    function openTaskModal(title, btnText, presetCategory = null, taskData = null) {
        try {
            if (modalTitle) modalTitle.textContent = title;
            if (submitBtn) submitBtn.textContent = btnText;
            editingTaskId = taskData ? taskData.id : null;

            if (!taskData) {
                resetForm();
                const taskDueDate = document.getElementById('taskDueDate');
                if (taskDueDate) taskDueDate.value = new Date().toISOString().split('T')[0];
            }

            if (presetCategory && taskCategory) {
                taskCategory.value = presetCategory;
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
                document.getElementById('taskPriority').value = taskData.priority || 'Low';
                document.getElementById('taskAssignedTo').value = taskData.assignedTo || '';
                document.getElementById('taskStatus').value = taskData.status || 'Pending';
                document.getElementById('taskTags').value = taskData.tags ? taskData.tags.join(', ') : '';
                taskCategory?.dispatchEvent(new Event('change'));
            }

            taskModal?.classList.remove('hidden');
        } catch (error) {
            console.error("Error opening task modal:", error);
            alert('Error opening modal.');
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
            const taskStatus = document.getElementById('taskStatus');
            if (taskStatus) taskStatus.value = 'Pending';
            checkOutTimeField?.classList.add('hidden');
            newReservationIdField?.classList.add('hidden');
            assignedToField?.classList.remove('hidden');
            autocompleteList.innerHTML = '';
            tagAutocompleteList.innerHTML = '';
            editingTaskId = null;
        } catch (error) {
            console.error("Error resetting form:", error);
            alert('Error resetting form.');
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
            console.error("Error fetching task:", error);
            throw error;
        }
    }

    async function archiveTask(taskId) {
        try {
            const task = await getTask(taskId);
            if (!task) return;
            await db.ref(`archive/${taskId}`).set({ ...task, archivedAt: new Date().toISOString() });
            await db.ref(`tasks/${taskId}`).remove();
            await logHistory(taskId, 'Task archived');
        } catch (error) {
            console.error("Error archiving task:", error);
            throw error;
        }
    }

    async function deleteTask(taskId) {
        try {
            await db.ref(`tasks/${taskId}`).remove();
            await logHistory(taskId, 'Task deleted');
        } catch (error) {
            console.error("Error deleting task:", error);
            throw error;
        }
    }

    async function logHistory(taskId, action, details = {}) {
        try {
            const historyEntry = {
                taskId,
                action,
                details,
                timestamp: new Date().toISOString()
            };
            await db.ref('history').push(historyEntry);
        } catch (error) {
            console.error("Error logging history:", error);
            throw error;
        }
    }

    async function renderArchive() {
        try {
            const snapshot = await db.ref('archive').once('value');
            const archiveList = document.getElementById('archiveList');
            if (archiveList) archiveList.innerHTML = '';
            const tasks = snapshot.val() ? Object.values(snapshot.val()) : [];
            tasks.forEach(task => {
                const taskCard = document.createElement('div');
                taskCard.classList.add('archive-task-card');
                taskCard.innerHTML = `
                    <div class="archive-task-content">
                        <div class="archive-task-title">
                            <i class="fas fa-door-open mr-2 text-teal-500"></i>R#${task.roomNumber || 'N/A'} - ${task.category}
                        </div>
                        <div class="archive-task-meta">
                            <span><i class="fas fa-user mr-1 text-teal-500"></i>${task.assignedTo || 'Unassigned'}</span>
                            <span><i class="fas fa-exclamation-circle mr-1 text-teal-500"></i>${task.priority}</span>
                            <span class="status-badge status-${task.status.toLowerCase().replace(' ', '-')}" >
                                <i class="fas fa-info-circle mr-1 text-teal-500"></i>${task.status}
                            </span>
                        </div>
                        <div class="archive-task-details">
                            <p>${task.details || 'No details'}</p>
                        </div>
                        <div class="archive-timestamp">
                            Archived: ${new Date(task.archivedAt).toLocaleString()}
                        </div>
                    </div>
                    <div class="archive-task-actions">
                        <button class="action-btn unarchive-btn" data-id="${task.id}" data-tooltip="Unarchive Task">
                            <i class="fas fa-undo text-base"></i>
                        </button>
                        <button class="action-btn delete-btn" data-id="${task.id}" data-tooltip="Delete Task">
                            <i class="fas fa-trash text-base"></i>
                        </button>
                    </div>
                `;
                archiveList?.appendChild(taskCard);
            });

            archiveList?.querySelectorAll('.unarchive-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const taskId = btn.dataset.id;
                    try {
                        const task = (await db.ref(`archive/${taskId}`).once('value')).val();
                        // Validate room number for checkout/extensions
                        if (task.category === 'checkout' || task.category === 'extensions') {
                            const snapshot = await db.ref('tasks').once('value');
                            const tasks = snapshot.val() ? Object.values(snapshot.val()) : [];
                            const conflictingTask = tasks.find(t => 
                                t.roomNumber === task.roomNumber && 
                                (t.category === 'checkout' || t.category === 'extensions')
                            );
                            if (conflictingTask) {
                                alert(`Cannot unarchive: Room ${task.roomNumber} is already in ${conflictingTask.category}.`);
                                return;
                            }
                        }
                        delete task.archivedAt;
                        await db.ref(`tasks/${taskId}`).set(task);
                        await db.ref(`archive/${taskId}`).remove();
                        await logHistory(taskId, 'Task unarchived');
                        renderArchive();
                        renderTasks();
                    } catch (error) {
                        console.error("Error unarchiving task:", error);
                        alert('Error unarchiving task.');
                    }
                });
            });

            archiveList?.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const taskId = btn.dataset.id;
                    if (confirm('Are you sure you want to delete this archived task?')) {
                        try {
                            const taskCard = btn.closest('.archive-task-card');
                            taskCard.classList.add('deleting');
                            setTimeout(async () => {
                                await db.ref(`archive/${taskId}`).remove();
                                await logHistory(taskId, 'Archived task deleted');
                                renderArchive();
                            }, 300);
                        } catch (error) {
                            console.error("Error deleting archived task:", error);
                            alert('Error deleting archived task.');
                        }
                    }
                });
            });
        } catch (error) {
            console.error("Error rendering archive:", error);
            alert('Error rendering archive.');
        }
    }

    function showToast(message) {
        const toast = document.getElementById('toast');
        if (toast) {
            toast.textContent = message;
            toast.classList.remove('hidden');
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 3000);
        }
    }
});
