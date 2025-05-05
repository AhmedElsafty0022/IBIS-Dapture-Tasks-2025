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
    let companies = [...predefinedCompanies];
    let suggestedTasks = []; // Store suggested tasks for reminder modal

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
    const taskCategory = document.getElementById('taskCategory');
    const checkOutTimeField = document.getElementById('checkOutTimeField');
    const newReservationIdField = document.getElementById('newReservationIdField');
    const assignedToField = document.getElementById('assignedToField');
    const quickAddButtons = document.querySelectorAll('.quick-add-btn');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const exportTasksBtn = document.getElementById('exportTasksBtn');
    const importTasksBtn = document.getElementById('importTasksBtn');
    const importFileInput = document.getElementById('importFileInput');
    const taskAssignedTo = document.getElementById('taskAssignedTo');
    const reminderModal = document.getElementById('reminderModal');
    const skipReminderBtn = document.getElementById('skipReminderBtn');
    const confirmReminderBtn = document.getElementById('confirmReminderBtn');
    const reminderList = document.getElementById('reminderList');

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

    // Initial load of tasks and check reminders
    try {
        db.ref('tasks').on('value', (snapshot) => {
            const tasks = snapshot.val() ? Object.values(snapshot.val()) : [];
            renderTasks();
        });
        db.ref('archive').on('value', () => renderArchive());
        checkReminders(); // Check for recurring tasks on load
    } catch (error) {
        console.error("Error loading tasks:", error);
        alert('Error loading tasks. Please try importing a backup.');
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
                }
                // Reorder tasks within the same column
                const tasksInColumn = Array.from(evt.to.children).map(child => child.dataset.id);
                await updateTaskOrder(newCategory, tasksInColumn);
            }
        });
    });



    // Export Tasks
    exportTasksBtn?.addEventListener('click', async () => {
        try {
            const tasksSnapshot = await db.ref('tasks').once('value');
            const archiveSnapshot = await db.ref('archive').once('value');
            const historySnapshot = await db.ref('history').once('value');
            const companiesSnapshot = await db.ref('companies').once('value');
            const roomUsageSnapshot = await db.ref('roomUsage').once('value');
            const data = {
                tasks: tasksSnapshot.val() ? Object.values(tasksSnapshot.val()) : [],
                archive: archiveSnapshot.val() ? Object.values(archiveSnapshot.val()) : [],
                history: historySnapshot.val() ? Object.values(historySnapshot.val()) : [],
                companies: companiesSnapshot.val() ? Object.values(companiesSnapshot.val()) : [],
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

    taskAssignedTo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.stopPropagation(); // Prevent Enter from submitting the form while in autocomplete
        }
    });

    // Handle Enter key for form submission
    document.getElementById('taskForm')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.target.closest('textarea')) {
            e.preventDefault();
            console.log("Enter key pressed to submit form");
            document.getElementById('submitBtn').click();
        }
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
            reminderModal.classList.add('hidden');
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

    // Form Submission
    document.getElementById('taskForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("Form submitted");
        submitBtn.click();
    });

    // Clear All Tasks
    clearTasksBtn?.addEventListener('click', async () => {
        console.log("Clear All button clicked");
        if (confirm('Are you sure you want to clear all tasks, archives, history, companies, and room usage data?')) {
            try {
                await db.ref('tasks').remove();
                await db.ref('archive').remove();
                await db.ref('history').remove();
                await db.ref('companies').remove();
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

    // Reminder Modal Buttons
    skipReminderBtn?.addEventListener('click', () => {
        console.log("Skip Reminder button clicked");
        reminderModal.classList.add('hidden');
    });

    confirmReminderBtn?.addEventListener('click', async () => {
        console.log("Confirm Reminder button clicked");
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
                        priority: 'medium',
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
            reminderModal.classList.add('hidden');
            renderTasks();
        } catch (error) {
            console.error("Error adding suggested tasks:", error);
            alert('Error adding suggested tasks.');
        }
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
                alert('Error saving new company.');
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
            status,
            tags,
            createdAt: new Date().toISOString(),
            comments: editingTaskId ? (await getTask(editingTaskId))?.comments || [] : [],
            history: editingTaskId ? (await getTask(editingTaskId))?.history || [] : [],
            attachments: editingTaskId ? (await getTask(editingTaskId))?.attachments || [] : [],
            order: 0
        };

        try {
            if (editingTaskId) {
                const oldTask = await getTask(editingTaskId);
                task.order = oldTask.order; // Preserve existing order
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
                // For new tasks, set order based on the last task in the category
                const snapshot = await db.ref('tasks').once('value');
                const tasks = snapshot.val() ? Object.values(snapshot.val()).filter(t => t.category === category) : [];
                task.order = tasks.length > 0 ? Math.max(...tasks.map(t => t.order)) + 1 : 0;
                await saveTask(task);
                await logHistory(task.id, `Task created`);
                await logRoomUsage(roomNumber, category, assignedTo);
            }
            taskModal.classList.add('hidden');
            resetForm();
        } catch (error) {
            console.error("Error submitting task:", error);
            alert('Error submitting task.');
        }
    });

    // Check Reminders
    async function checkReminders() {
        try {
            // Check if reminders were shown today
            const lastReminderDate = localStorage.getItem('lastReminderDate');
            const today = new Date().toISOString().split('T')[0];
            if (lastReminderDate === today) {
                console.log("Reminders already shown today");
                return;
            }

            // Get room usage data
            const snapshot = await db.ref('roomUsage').once('value');
            const roomUsage = snapshot.val() ? Object.values(snapshot.val()) : [];

            // Filter usage from the last 7 days
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            const recentUsage = roomUsage.filter(usage => new Date(usage.timestamp) >= oneWeekAgo);

            // Count usage by room and category
            const usageCounts = recentUsage.reduce((acc, usage) => {
                const key = `${usage.roomNumber}:${usage.category}`;
                if (!acc[key]) {
                    acc[key] = { roomNumber: usage.roomNumber, category: usage.category, count: 0, assignedTo: usage.assignedTo, details: usage.details };
                }
                acc[key].count++;
                return acc;
            }, {});

            // Identify rooms used 3 or more times
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
        reminderModal.classList.remove('hidden');
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
            console.log(`Logged room usage: ${roomNumber} in ${category}`);
        } catch (error) {
            console.error("Error logging room usage:", error);
            alert('Error logging room usage.');
        }
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
            const priorityOrder = { high: 1, medium: 2, low: 3 };
            Object.keys(tasksByCategory).forEach(category => {
                if (sortTasks.value === 'priority') {
                    tasksByCategory[category].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
                } else if (sortTasks.value === 'dueDate') {
                    tasksByCategory[category].sort((a, b) => {
                        const dateA = new Date(`${a.dueDate} ${a.dueTime || '23:59'}`).getTime();
                        const dateB = new Date(`${b.dueDate} ${b.dueTime || '23:59'}`).getTime();
                        return dateA - dateB;
                    });
                } else {
                    // Sort by order (default)
                    tasksByCategory[category].sort((a, b) => a.order - b.order);
                }
            });

            // Clear existing tasks
            const columns = ['checkout', 'extensions', 'handover', 'guestrequests'];
            columns.forEach(category => {
                document.getElementById(category).innerHTML = '';
                document.getElementById(`${category}Counter`).textContent = 'Tasks: 0';
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
                document.getElementById(`${category}Counter`).textContent = `Tasks: ${taskCounts[category]}`;
            });
        } catch (error) {
            console.error("Error rendering tasks:", error);
            alert('Error rendering tasks.');
        }
    }

    function openTaskModal(title, btnText, presetCategory = null, taskData = null) {
        try {
            console.log("Opening task modal with title:", title);
            modalTitle.textContent = title;
            submitBtn.textContent = btnText;
            editingTaskId = taskData ? taskData.id : null;

            if (!taskData) {
                resetForm();
                document.getElementById('taskDueDate').value = new Date().toISOString().split('T')[0];
                document.getElementById('taskStatus').value = 'Pending'; // Default to Pending for new tasks
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
            document.getElementById('taskStatus').value = 'Pending'; // Ensure status resets to Pending
            checkOutTimeField.classList.add('hidden');
            newReservationIdField.classList.add('hidden');
            assignedToField.classList.remove('hidden');
            autocompleteList.innerHTML = '';
            editingTaskId = null;
        } catch (error) {
            console.error("Error resetting form:", error);
            alert('Error resetting form.');
        }
    }

    async function saveTask(task) {
        try {
            await db.ref(`tasks/${task.id}`).set(task);
            console.log(`Task saved with status: ${task.status}`);
        } catch (error) {
            console.error("Error saving task:", error);
            throw error;
        }
    }

    async function updateTask(updatedTask) {
        try {
            await db.ref(`tasks/${updatedTask.id}`).set(updatedTask);
            console.log(`Task updated with status: ${updatedTask.status}`);
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
            archiveList.innerHTML = '';
            const tasks = snapshot.val() ? Object.values(snapshot.val()) : [];
            tasks.forEach(task => {
                const taskCard = document.createElement('div');
                taskCard.classList.add('archive-task-card');
                taskCard.innerHTML = `
                    <div class="archive-task-content">
                        <div class="archive-task-header">
                            <div class="archive-task-title">R#${task.roomNumber || 'N/A'} - ${task.category}</div>
                            <div class="archive-task-meta">
                                <span><i class="fas fa-user mr-1"></i>${task.assignedTo || 'Unassigned'}</span>
                                <span><i class="fas fa-exclamation-circle mr-1"></i>${task.priority}</span>
                                <span><i class="fas fa-info-circle mr-1"></i>${task.status}</span>
                            </div>
                        </div>
                        <div class="archive-task-details">
                            <p>${task.details || 'No details'}</p>
                        </div>
                        <div class="archive-timestamp">Archived: ${new Date(task.archivedAt).toLocaleString()}</div>
                    </div>
                    <div class="archive-task-actions">
                        <button class="unarchive-btn" data-id="${task.id}" data-tooltip="Unarchive"><i class="fas fa-undo"></i></button>
                        <button class="delete-btn" data-id="${task.id}" data-tooltip="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                `;
                archiveList.appendChild(taskCard);
            });

            // Add event listeners for unarchive and delete buttons
            archiveList.querySelectorAll('.unarchive-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const taskId = btn.dataset.id;
                    try {
                        const task = (await db.ref(`archive/${taskId}`).once('value')).val();
                        await db.ref(`tasks/${taskId}`).set({ ...task, archivedAt: null });
                        await db.ref(`archive/${taskId}`).remove();
                        await logHistory(taskId, 'Task unarchived');
                    } catch (error) {
                        console.error("Error unarchiving task:", error);
                        alert('Error unarchiving task.');
                    }
                });
            });

            archiveList.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const taskId = btn.dataset.id;
                    if (confirm('Are you sure you want to delete this archived task?')) {
                        try {
                            await db.ref(`archive/${taskId}`).remove();
                            await logHistory(taskId, 'Archived task deleted');
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

    function createTaskElement(task) {
        console.log(`Rendering task ${task.id} with status: ${task.status}`);
        const taskElement = document.createElement('div');
        taskElement.classList.add('task-card', `priority-${task.priority}`);
        taskElement.dataset.id = task.id;
        taskElement.draggable = true;
        if (task.status === 'Completed') {
            taskElement.classList.add('completed');
        }
        if (task.dueDate && new Date(`${task.dueDate} ${task.dueTime || '23:59'}`) < new Date() && task.status !== 'Completed') {
            taskElement.classList.add('overdue');
        }

        taskElement.innerHTML = `
            <div class="task-content">
                <div class="task-header">
                    <div class="task-title">R#${task.roomNumber || 'N/A'} ${task.newReservationId ? `(${task.newReservationId})` : ''}</div>
                    <div class="task-meta">
                        <span><i class="fas fa-user"></i>${task.assignedTo || 'Unassigned'}</span>
                        <span><i class="fas fa-exclamation-circle"></i>${task.priority}</span>
                        <span><i class="fas fa-info-circle"></i>
                            <input type="checkbox" class="status-checkbox" ${task.status === 'Completed' ? 'checked' : ''} title="Toggle Completed/Pending">
                            <span class="status-${task.status.toLowerCase().replace(' ', '-')}">${task.status}</span>
                        </span>
                        ${task.dueDate ? `<span><i class="fas fa-calendar-alt"></i>${task.dueDate} ${task.dueTime || ''}</span>` : ''}
                        ${task.checkOutTime ? `<span><i class="fas fa-clock"></i>${task.checkOutTime}</span>` : ''}
                    </div>
                </div>
                <div class="task-details">${task.details || 'No details'}</div>
                <div class="tags-container">
                    ${task.tags && task.tags.length > 0 ? task.tags.map(tag => `<span class="tag-item">${tag}</span>`).join('') : ''}
                </div>
                <div class="comments-container">
                    ${task.comments && task.comments.length > 0 ? task.comments.map((comment, index) => `
                        <div class="comment-item">
                            <div class="comment-text">${comment.text}</div>
                            <div class="comment-timestamp">${new Date(comment.timestamp).toLocaleString()}</div>
                            <div class="comment-actions">
                                <button class="edit-comment-btn" data-comment-index="${index}" data-tooltip="Edit Comment"><i class="fas fa-edit"></i></button>
                                <button class="delete-comment-btn" data-comment-index="${index}" data-tooltip="Delete Comment"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                    `).join('') : '<p>No comments</p>'}
                </div>
                <div class="task-action-bar">
                    <button class="comment-btn" data-id="${task.id}" data-tooltip="Add Comment"><i class="fas fa-comment"></i></button>
                    <button class="attach-btn" data-id="${task.id}" data-tooltip="Attach"><i class="fas fa-paperclip"></i></button>
                    <button class="history-btn" data-id="${task.id}" data-tooltip="History"><i class="fas fa-history"></i></button>
                    <button class="edit-btn" data-id="${task.id}" data-tooltip="Edit"><i class="fas fa-edit"></i></button>
                    <button class="duplicate-btn" data-id="${task.id}" data-tooltip="Duplicate"><i class="fas fa-copy"></i></button>
                    <button class="archive-btn" data-id="${task.id}" data-tooltip="Archive"><i class="fas fa-archive"></i></button>
                    <button class="delete-btn" data-id="${task.id}" data-tooltip="Delete"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="swipe-background"><i class="fas fa-archive"></i></div>
        `;

        // Status checkbox for toggling Pending/Completed
        taskElement.querySelector('.status-checkbox').addEventListener('change', async (e) => {
            console.log(`Status checkbox changed for task ${task.id}`);
            try {
                const taskData = await getTask(task.id);
                const newStatus = e.target.checked ? 'Completed' : 'Pending';
                taskData.status = newStatus;
                await updateTask(taskData);
                await logHistory(task.id, `Status changed to ${newStatus}`, {
                    oldStatus: task.status,
                    newStatus
                });
                // UI will update via Firebase on('value') listener
            } catch (error) {
                console.error("Error updating task status:", error);
                alert('Error updating task status.');
                e.target.checked = !e.target.checked; // Revert checkbox on error
            }
        });

        // Drag events
        taskElement.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', task.id);
            taskElement.classList.add('dragging');
        });

        taskElement.addEventListener('dragend', () => {
            taskElement.classList.remove('dragging');
        });

        // Swipe to archive
        taskElement.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].clientX;
        });

        taskElement.addEventListener('touchmove', (e) => {
            touchEndX = e.changedTouches[0].clientX;
            const diff = touchStartX - touchEndX;
            if (diff > 0 && diff < 60) {
                taskElement.style.transform = `translateX(-${diff}px)`;
                taskElement.classList.add('swiping');
            }
        });

        taskElement.addEventListener('touchend', async () => {
            const diff = touchStartX - touchEndX;
            if (diff > 50) {
                taskElement.classList.add('swiped');
                setTimeout(async () => {
                    await archiveTask(task.id);
                    taskElement.classList.add('archived');
                }, 400);
            } else {
                taskElement.style.transform = 'translateX(0)';
                taskElement.classList.remove('swiping');
            }
        });

        // Comment button: toggle visibility and add comment
        taskElement.querySelector('.comment-btn').addEventListener('click', async () => {
            console.log(`Comment button clicked for task ${task.id}`);
            const commentsContainer = taskElement.querySelector('.comments-container');
            const isActive = commentsContainer.classList.contains('active');
            
            if (isActive) {
                // If comments are visible, prompt to add a new comment
                const comment = prompt('Enter your comment (or cancel to just toggle visibility):');
                if (comment) {
                    const taskData = await getTask(task.id);
                    taskData.comments = taskData.comments || [];
                    taskData.comments.push({ text: comment, timestamp: new Date().toISOString() });
                    await updateTask(taskData);
                    await logHistory(task.id, 'Comment added', { comment });
                }
            } else {
                // If comments are hidden, show them
                commentsContainer.classList.add('active');
            }
        });

        // Long press to hide comments (optional, for better UX)
        taskElement.querySelector('.comment-btn').addEventListener('contextmenu', (e) => {
            e.preventDefault();
            console.log(`Right-click on comment button for task ${task.id}`);
            const commentsContainer = taskElement.querySelector('.comments-container');
            commentsContainer.classList.remove('active');
        });

        // Edit comment
        taskElement.querySelectorAll('.edit-comment-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const index = btn.dataset.commentIndex;
                const taskData = await getTask(task.id);
                const newComment = prompt('Edit your comment:', taskData.comments[index].text);
                if (newComment) {
                    taskData.comments[index].text = newComment;
                    taskData.comments[index].timestamp = new Date().toISOString();
                    await updateTask(taskData);
                    await logHistory(task.id, 'Comment edited', { comment: newComment });
                }
            });
        });

        // Delete comment
        taskElement.querySelectorAll('.delete-comment-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to delete this comment?')) {
                    const index = btn.dataset.commentIndex;
                    const taskData = await getTask(task.id);
                    const deletedComment = taskData.comments.splice(index, 1)[0];
                    await updateTask(taskData);
                    await logHistory(task.id, 'Comment deleted', { comment: deletedComment.text });
                }
            });
        });

        // Other task actions
        taskElement.querySelector('.edit-btn').addEventListener('click', async () => {
            const taskData = await getTask(task.id);
            openTaskModal('Edit Task', 'Update Task', null, taskData);
        });

        taskElement.querySelector('.duplicate-btn').addEventListener('click', async () => {
            const taskData = await getTask(task.id);
            const newTask = { ...taskData, id: Date.now(), createdAt: new Date().toISOString(), comments: [], history: [], attachments: [] };
            await saveTask(newTask);
            await logHistory(newTask.id, 'Task duplicated');
            await logRoomUsage(newTask.roomNumber, newTask.category, newTask.assignedTo);
        });

        taskElement.querySelector('.archive-btn').addEventListener('click', async () => {
            await archiveTask(task.id);
            taskElement.classList.add('archived');
        });

        taskElement.querySelector('.delete-btn').addEventListener('click', async () => {
            if (confirm('Are you sure you want to delete this task?')) {
                await deleteTask(task.id);
                taskElement.classList.add('deleted');
            }
        });

        taskElement.querySelector('.attach-btn').addEventListener('click', () => {
            alert('Attachment feature is under development.');
        });

        taskElement.querySelector('.history-btn').addEventListener('click', async () => {
            const historyList = document.getElementById('historyList');
            historyList.innerHTML = '';
            const snapshot = await db.ref('history').once('value');
            const history = snapshot.val() ? Object.values(snapshot.val()).filter(h => h.taskId === task.id) : [];
            const groupedHistory = history.reduce((acc, entry) => {
                const date = new Date(entry.timestamp).toLocaleDateString();
                if (!acc[date]) acc[date] = [];
                acc[date].push(entry);
                return acc;
            }, {});

            Object.keys(groupedHistory).sort((a, b) => new Date(b) - new Date(a)).forEach(date => {
                const group = document.createElement('div');
                group.classList.add('history-group');
                group.innerHTML = `<h3>${date}</h3>`;
                groupedHistory[date].forEach(entry => {
                    const item = document.createElement('div');
                    item.classList.add('history-item', `history-${entry.action.toLowerCase().replace(' ', '-')}`);
                    item.innerHTML = `
                        <p><strong>${entry.action}</strong> at ${new Date(entry.timestamp).toLocaleTimeString()}</p>
                        ${Object.keys(entry.details).length > 0 ? `<p>${JSON.stringify(entry.details, null, 2)}</p>` : ''}
                    `;
                    group.appendChild(item);
                });
                historyList.appendChild(group);
            });

            if (history.length === 0) {
                historyList.innerHTML = '<p>No history available.</p>';
            }

            historyModal.classList.remove('隐患');
        });

        return taskElement;
    }
});