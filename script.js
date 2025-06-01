$(document).ready(function() {
    // Initialize variables
    let db;
    const DB_NAME = 'pomodoroDB';
    const DB_VERSION = 1; // Use version 1 initially

    let timeLeft;
    let timerId = null;
    let totalTime;
    let isRunning = false;
    let sessionCount = 0;
    let completedCount = 0;
    let totalMinutes = 0;
    let soundEnabled = true; // Default, will be loaded from DB
    let notificationsEnabled = true; // Default, will be loaded from DB
    let currentTask = '';
    let tasks = [];
    let sessionHistory = [];
    let categories = [{ name: 'Default', color: '#4a90e2' }];
    let currentStreak = 0; // Default, will be loaded from DB
    let lastCompletedDate = null; // Default, will be loaded from DB
    let chainCount = 0; // Default, will be loaded from DB
    let dailyGoal = 4; // Default, will be loaded from DB
    let dailyProgress = 0; // Default, will be loaded from DB
    let settings = {
        focusTime: 25,
        shortBreak: 5,
        longBreak: 15,
        autoStartBreaks: false,
        autoStartPomodoros: false,
        enableNotifications: true,
        enableSound: true
    };

    // Initialize charts
    let productivityChart = null;
    let categoryChart = null;

    // Initialize timer
    function initTimer(minutes) {
        timeLeft = minutes * 60;
        totalTime = timeLeft;
        updateDisplay();
        updateProgressBar();
        updateTimerLabel();
    }

    // IndexedDB helper functions (using Promises for cleaner async)
    async function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                db = event.target.result;
                // Create object stores
                if (!db.objectStoreNames.contains('tasks')) {
                    db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('sessionHistory')) {
                    db.createObjectStore('sessionHistory', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('categories')) {
                    db.createObjectStore('categories', { keyPath: 'name' });
                }
                 if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' }); // key-value store for settings
                }
                 if (!db.objectStoreNames.contains('stats')) {
                    db.createObjectStore('stats', { keyPath: 'key' }); // key-value store for stats
                }

                console.log('IndexedDB upgrade complete');
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                console.log('IndexedDB opened successfully');
                resolve(db);
            };

            request.onerror = (event) => {
                console.error('Error opening IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async function addObject(storeName, object) {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.add(object);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function putObject(storeName, object) {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.put(object);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

     async function getObject(storeName, key) {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function getAllObjects(storeName) {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteObject(storeName, key) {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

     async function clearStore(storeName) {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Load data from IndexedDB
    async function loadData() {
        try {
            // Load tasks
            tasks = await getAllObjects('tasks') || []; // Ensure tasks is an array
            updateTaskList();

            // Load session history
            sessionHistory = await getAllObjects('sessionHistory') || []; // Ensure sessionHistory is an array
            sessionHistory.sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time)); // Sort by date/time descending
            updateHistoryList();

            // Load categories
            categories = await getAllObjects('categories') || []; // Ensure categories is an array
             if (categories.length === 0) {
                // Add default category if none exist
                categories = [{ name: 'Default', color: '#4a90e2' }];
                await addObject('categories', categories[0]);
            }
            updateCategorySelect();

            // Load settings
            const savedSettings = await getAllObjects('settings');
            if (savedSettings && savedSettings.length > 0) { // Check if savedSettings is not null/undefined and has items
                 savedSettings.forEach(item => {
                    settings[item.key] = item.value;
                });
            }

            // Load stats
             const savedStats = await getAllObjects('stats');
            if (savedStats && savedStats.length > 0) { // Check if savedStats is not null/undefined and has items
                 savedStats.forEach(item => {
                    switch(item.key) {
                        case 'sessionCount': sessionCount = item.value !== undefined ? item.value : 0; break; // Provide default if undefined
                        case 'completedCount': completedCount = item.value !== undefined ? item.value : 0; break; // Provide default if undefined
                        case 'totalMinutes': totalMinutes = item.value !== undefined ? item.value : 0; break; // Provide default if undefined
                        case 'currentStreak': currentStreak = item.value !== undefined ? item.value : 0; break; // Provide default if undefined
                        case 'lastCompletedDate': lastCompletedDate = item.value !== undefined ? item.value : null; break; // Provide default if undefined
                        case 'chainCount': chainCount = item.value !== undefined ? item.value : 0; break; // Provide default if undefined
                        case 'dailyGoal': dailyGoal = item.value !== undefined ? item.value : 4; break; // Provide default if undefined
                        case 'dailyProgress': dailyProgress = item.value !== undefined ? item.value : 0; break; // Provide default if undefined
                    }
                });
            }

            // Update UI with loaded stats
            $('#sessionCount').text(sessionCount);
            $('#completedCount').text(completedCount);
            $('#totalTime').text(Math.floor(totalMinutes));
            $('#currentStreak').text(currentStreak);
            $('#chainCount').text(chainCount);
            $('#dailyGoal').text(`${dailyProgress}/${dailyGoal}`);

             // Set initial state based on loaded settings
            soundEnabled = settings.enableSound !== undefined ? settings.enableSound : true;
            notificationsEnabled = settings.enableNotifications !== undefined ? settings.enableNotifications : true;

             if (!soundEnabled) {
                $('#soundToggle i').removeClass('fa-volume-up').addClass('fa-volume-mute');
            }
            if (!notificationsEnabled) {
                 $('#notificationsToggle i').removeClass('fa-bell').addClass('fa-bell-slash');
            }

             // Update analytics only after data is loaded and UI is ready
            updateAnalytics();

            console.log('Data loaded from IndexedDB');

        } catch (error) {
            console.error('Error loading data from IndexedDB:', error);
            // Display a user-friendly error message on the page
             $('body').html('<div class="container mt-5 text-center"><h3>Error loading application data. Please try again or clear your browser data.</h3></div>');
        }
    }

    // Save settings to IndexedDB
    async function saveSettings() {
         try {
            // Clear existing settings before saving new ones
            await clearStore('settings');

            // Save each setting as a key-value pair
            for (const key in settings) {
                await addObject('settings', { key: key, value: settings[key] });
            }
             console.log('Settings saved to IndexedDB');
        } catch (error) {
            console.error('Error saving settings to IndexedDB:', error);
        }
    }

     // Save stats to IndexedDB
    async function saveStats() {
         try {
            // Clear existing stats before saving new ones
             await clearStore('stats');

            // Save each stat as a key-value pair
             await addObject('stats', { key: 'sessionCount', value: sessionCount });
            await addObject('stats', { key: 'completedCount', value: completedCount });
            await addObject('stats', { key: 'totalMinutes', value: totalMinutes });
            await addObject('stats', { key: 'currentStreak', value: currentStreak });
            await addObject('stats', { key: 'lastCompletedDate', value: lastCompletedDate });
            await addObject('stats', { key: 'chainCount', value: chainCount });
            await addObject('stats', { key: 'dailyGoal', value: dailyGoal });
             await addObject('stats', { key: 'dailyProgress', value: dailyProgress });

             console.log('Stats saved to IndexedDB');
        } catch (error) {
            console.error('Error saving stats to IndexedDB:', error);
        }
    }

    // Update the display
    function updateDisplay() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        $('#minutes').text(minutes.toString().padStart(2, '0'));
        $('#seconds').text(seconds.toString().padStart(2, '0'));
    }

    // Update progress bar
    function updateProgressBar() {
        const progress = ((totalTime - timeLeft) / totalTime) * 100;
        $('.progress-bar').css('width', progress + '%');
        if (isRunning) {
            $('.progress-bar').addClass('active');
        } else {
            $('.progress-bar').removeClass('active');
        }
    }

    // Update timer label
    function updateTimerLabel() {
        const activeMode = $('.mode-btn.active');
        let label = 'Focus Time';
        if (activeMode.find('.fa-coffee').length) label = 'Short Break';
        if (activeMode.find('.fa-couch').length) label = 'Long Break';
        $('#timerLabel').text(label);
    }

    // Show notification
    function showNotification(title, message) {
        if (!notificationsEnabled) return;

        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                new Notification(title, { body: message });
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        new Notification(title, { body: message });
                    }
                });
            }
        }

        // Also show in-app notification
        const notification = $(`
            <div class="notification">
                <h5>${title}</h5>
                <p>${message}</p>
            </div>
        `).appendTo('body');

        setTimeout(() => {
            notification.addClass('show');
        }, 100);

        setTimeout(() => {
            notification.removeClass('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Update streak
    async function updateStreak() {
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();

        if (lastCompletedDate === yesterday) {
            currentStreak++;
        } else if (lastCompletedDate !== today) {
            currentStreak = 1;
        }

        lastCompletedDate = today;
        await saveStats(); // Save updated streak and last completed date

        $('#currentStreak').text(currentStreak).addClass('updated');
        setTimeout(() => $('#currentStreak').removeClass('updated'), 1000);
    }

    // Update daily progress
    async function updateDailyProgress() {
        dailyProgress++;
        await saveStats(); // Save updated daily progress
        $('#dailyGoal').text(`${dailyProgress}/${dailyGoal}`);

        if (dailyProgress >= dailyGoal) {
            showNotification('Daily Goal Achieved!', 'Congratulations on completing your daily goal!');
        }
    }

    // Update chain count
    async function updateChainCount() {
        chainCount++;
        await saveStats(); // Save updated chain count
        $('#chainCount').text(chainCount).addClass('updated');
        setTimeout(() => $('#chainCount').removeClass('updated'), 1000);
    }

     // Reset daily progress at midnight
    function resetDailyProgress() {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        const timeUntilMidnight = midnight.getTime() - now.getTime();

        setTimeout(async () => {
            dailyProgress = 0;
            await saveStats();
            $('#dailyGoal').text(`${dailyProgress}/${dailyGoal}`);
            resetDailyProgress(); // Schedule next reset
        }, timeUntilMidnight);
    }

    // Start timer
    function startTimer() {
        if (!isRunning) {
            isRunning = true;
            $('.timer-display').addClass('active');
            sessionCount++;
             saveStats(); // Save session count
            $('#sessionCount').text(sessionCount);

            timerId = setInterval(async () => {
                timeLeft--;
                updateDisplay();
                updateProgressBar();

                if (timeLeft <= 0) {
                    clearInterval(timerId);
                    isRunning = false;
                    $('.timer-display').removeClass('active');
                    $('.progress-bar').removeClass('active');
                    completedCount++;
                    totalMinutes += totalTime / 60;
                    await saveStats(); // Save completed count and total minutes
                    $('#completedCount').text(completedCount);
                    $('#totalTime').text(Math.floor(totalMinutes));

                    if (soundEnabled) {
                        playAlarm();
                    }

                    const activeMode = $('.mode-btn.active');
                    if (activeMode.find('.fa-brain').length) {
                        await updateStreak(); // Await streak update
                        await updateDailyProgress(); // Await daily progress update
                        await updateChainCount(); // Await chain count update
                        showNotification('Pomodoro Completed!', 'Time for a break!');

                        // Add session duration to current task
                        if (currentTask) {
                           const tasks = await getAllObjects('tasks') || []; // Get latest tasks, ensure array
                           const taskIndex = tasks.findIndex(task => task.text === currentTask);
                           if (taskIndex !== -1) {
                               tasks[taskIndex].duration += totalTime / 60;
                               await putObject('tasks', tasks[taskIndex]); // Update task in DB
                               updateTaskList(); // Update task list to show new duration
                           }
                        }

                    } else {
                        showNotification('Break Over!', 'Ready to focus again?');
                    }

                    await addToHistory(); // Await adding to history

                    // Auto-start next session if enabled
                    if (activeMode.find('.fa-brain').length && settings.autoStartBreaks) {
                        setTimeout(() => {
                            $('.mode-btn[data-time="5"]').click();
                            startTimer();
                        }, 1000);
                    } else if ((activeMode.find('.fa-coffee').length || activeMode.find('.fa-couch').length) && settings.autoStartPomodoros) {
                        setTimeout(() => {
                            $('.mode-btn[data-time="25"]').click();
                            startTimer();
                        }, 1000);
                    }
                }
            }, 1000);
        }
    }

    // Pause timer
    function pauseTimer() {
        if (isRunning) {
            clearInterval(timerId);
            isRunning = false;
            $('.timer-display').removeClass('active');
            $('.progress-bar').removeClass('active');
        }
    }

    // Reset timer
    function resetTimer() {
        pauseTimer();
        initTimer($('.mode-btn.active').data('time'));
    }

    // Play alarm sound
    function playAlarm() {
        const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-alarm-digital-clock-beep-989.mp3');
        audio.play();
    }

    // Toggle dark mode
    function toggleDarkMode() {
        $('body').toggleClass('dark-mode');
        const isDarkMode = $('body').hasClass('dark-mode');
        $('#darkMode i').toggleClass('fa-moon fa-sun');
        // No longer saving dark mode to localStorage, relies on settings object
        settings.darkMode = isDarkMode; // Update settings object
        saveSettings(); // Save settings to DB
    }

    // Toggle sound
    function toggleSound() {
        soundEnabled = !soundEnabled;
        $('#soundToggle i').toggleClass('fa-volume-up fa-volume-mute');
        settings.enableSound = soundEnabled; // Update settings object
        saveSettings(); // Save settings to DB
    }

    // Toggle notifications
    function toggleNotifications() {
        notificationsEnabled = !notificationsEnabled;
        $('#notificationsToggle i').toggleClass('fa-bell fa-bell-slash');
        settings.enableNotifications = notificationsEnabled; // Update settings object
        saveSettings(); // Save settings to DB
         if (notificationsEnabled) {
            // Request permission if enabling notifications
             if ('Notification' in window && Notification.permission !== 'granted') {
                Notification.requestPermission();
            }
        }
    }

    // Add task
    async function addTask() {
        const taskText = $('#taskInput').val().trim();
        const category = $('#taskCategory').val();
        const priority = $('#taskPriority').val();

        if (taskText) {
            const newTask = {
                text: taskText,
                completed: false,
                createdAt: new Date().toISOString(),
                category: category,
                priority: priority,
                duration: 0 // Add duration property
            };
            const taskId = await addObject('tasks', newTask); // Add task to IndexedDB
            newTask.id = taskId; // Set the ID from IndexedDB
            tasks.push(newTask); // Add to local array for immediate UI update
            updateTaskList();
            $('#taskInput').val('');
        }
    }

    // Update task list
    function updateTaskList() {
        const $taskList = $('#taskList');
        const $completedTaskList = $('#completedTaskList');
        $taskList.empty();
        $completedTaskList.empty();

        tasks.forEach((task) => {
            const category = categories.find(c => c.name === task.category) || categories[0];
            const $taskItem = $(`
                <div class="task-item ${task.completed ? 'completed' : ''}">
                    <span class="task-priority priority-${task.priority}"></span>
                    <span class="task-category" style="background-color: ${category.color}20; color: ${category.color}">
                        ${category.name}
                    </span>
                    <span class="task-text">${task.text}</span>
                   ${task.duration > 0 ? `<span class="task-duration">(${Math.floor(task.duration)} min)</span>` : ''}
                    <div class="task-actions">
                        <button class="btn btn-sm btn-success complete-task" data-id="${task.id}" title="Mark as ${task.completed ? 'incomplete' : 'complete'}">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn btn-sm btn-danger delete-task" data-id="${task.id}" title="Delete task">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `);

            if (task.completed) {
                $completedTaskList.append($taskItem);
            } else {
                $taskList.append($taskItem);
            }
        });
    }

    // Add to session history
    async function addToHistory() {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        const dateString = now.toLocaleDateString();
        const mode = $('.mode-btn.active').text();
        const taskText = currentTask || 'No task';

        const newHistoryEntry = {
            date: dateString,
            time: timeString,
            mode: mode,
            task: taskText,
            duration: totalTime / 60
        };

        await addObject('sessionHistory', newHistoryEntry); // Add history to IndexedDB
        sessionHistory.unshift(newHistoryEntry); // Add to local array

        // Keep only most recent 50 sessions in local array for display (IndexedDB will keep all)
        if (sessionHistory.length > 50) {
            sessionHistory = sessionHistory.slice(0, 50);
        }

        updateHistoryList();
        updateAnalytics();
    }

    // Update history list
    function updateHistoryList() {
        const $historyList = $('#historyList');
        $historyList.empty();

        // Display only the most recent 5 sessions from the local array
        sessionHistory.slice(0, 5).forEach(session => {
            const $historyItem = $(`
                <div class="history-item">
                    <div class="d-flex justify-content-between">
                        <div>${session.date} ${session.time}</div>
                        <div>${Math.floor(session.duration)} min</div>
                    </div>
                    <div>${session.mode} - ${session.task}</div>
                </div>
            `);
            $historyList.append($historyItem);
        });
    }

    // Update analytics charts
    async function updateAnalytics() {
        // Destroy existing charts to prevent issues
        if (productivityChart) {
            productivityChart.destroy();
            productivityChart = null;
        }
        if (categoryChart) {
            categoryChart.destroy();
            categoryChart = null;
        }

        // Get all history from IndexedDB for accurate analytics
        const allHistory = await getAllObjects('sessionHistory') || [];

        const period = $('#analyticsPeriod').val();
        const now = new Date();
        let startDate;

        switch (period) {
            case 'week':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
             default:
                startDate = new Date(0); // All time
        }

         // Ensure dates are parsed correctly for comparison
        const filteredHistory = allHistory.filter(session => {
            try {
                // Attempt to parse date in a robust way, handle potential errors
                const [month, day, year] = session.date.split('/').map(Number);
                const sessionDate = new Date(year, month - 1, day); // Month is 0-indexed
                 if (isNaN(sessionDate.getTime())) { // Check for invalid date
                    console.warn('Invalid date found in session history:', session.date);
                    return false; // Exclude invalid dates
                }
                 return sessionDate >= startDate;
            } catch (e) {
                 console.warn('Error parsing date in session history:', session.date, e);
                 return false; // Exclude sessions with unparseable dates
            }
        });

        // Update productivity chart
        const productivityData = {
            labels: [],
            datasets: [{
                label: 'Minutes Focused',
                data: [],
                backgroundColor: 'rgba(74, 144, 226, 0.2)',
                borderColor: 'rgba(74, 144, 226, 1)',
                borderWidth: 1
            }]
        };

        // Group data by date
        const groupedData = {};
        filteredHistory.forEach(session => {
            if (!groupedData[session.date]) {
                groupedData[session.date] = 0;
            }
            if (session.mode && session.mode.includes('Focus')) { // Check if mode exists before including
                groupedData[session.date] += session.duration;
            }
        });

        // Sort dates for the chart
        const sortedDates = Object.keys(groupedData).sort((a, b) => {
             try {
                const [monthA, dayA, yearA] = a.split('/').map(Number);
                const [monthB, dayB, yearB] = b.split('/').map(Number);
                return new Date(yearA, monthA - 1, dayA).getTime() - new Date(yearB, monthB - 1, dayB).getTime();
            } catch (e) {
                console.warn('Error sorting dates for productivity chart:', a, b, e);
                return 0; // Keep original order if sorting fails
            }
        });

        sortedDates.forEach(date => {
             productivityData.labels.push(date);
            productivityData.datasets[0].data.push(Math.floor(groupedData[date]));
        });

         // Get canvas context - check if canvas exists and context can be acquired
        const productivityCanvas = document.getElementById('productivityChart');
        if (productivityCanvas) {
             const productivityCtx = productivityCanvas.getContext('2d');
             if (productivityCtx) {
                productivityChart = new Chart(
                    productivityCtx,
                    {
                        type: 'bar',
                        data: productivityData,
                        options: {
                            responsive: true,
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    title: {
                                        display: true,
                                        text: 'Minutes'
                                    }
                                }
                            },
                             plugins: {
                                legend: {
                                    display: false // Hide legend for a single dataset
                                }
                            }
                        }
                    }
                );
            } else {
                console.error('Failed to get 2D context for productivity chart canvas.');
            }
        } else {
            console.error('Productivity chart canvas element not found.');
        }


        // Update category chart
        const categoryData = {
            labels: categories.map(c => c.name) || [], // Ensure labels is an array
            datasets: [{
                data: [],
                backgroundColor: categories.map(c => c.color + '80') || [], // Ensure colors are arrays
                borderColor: categories.map(c => c.color) || [], // Ensure colors are arrays
                borderWidth: 1
            }]
        };

         // Calculate completed tasks per category - ensure tasks is an array
        const completedTasks = tasks.filter(task => task && task.completed); // Check if task is not null/undefined
        const categoryCounts = categories.map(category => {
            if (!category || !category.name) return 0; // Skip if category or name is missing
            return completedTasks.filter(task => task.category === category.name).length;
        });
        categoryData.datasets[0].data = categoryCounts;

         // Get canvas context - check if canvas exists and context can be acquired
        const categoryCanvas = document.getElementById('categoryChart');
        if (categoryCanvas) {
            const categoryCtx = categoryCanvas.getContext('2d');
             if (categoryCtx) {
                categoryChart = new Chart(
                    categoryCtx,
                    {
                        type: 'pie',
                        data: categoryData,
                        options: {
                            responsive: true,
                            plugins: {
                                legend: {
                                    position: 'bottom'
                                }
                            }
                        }
                    }
                );
            } else {
                console.error('Failed to get 2D context for category chart canvas.');
            }
        } else {
            console.error('Category chart canvas element not found.');
        }
    }

    // Export data
    async function exportData() {
        try {
            const data = {
                tasks: await getAllObjects('tasks'),
                sessionHistory: await getAllObjects('sessionHistory'),
                categories: await getAllObjects('categories'),
                settings: await getAllObjects('settings'),
                stats: await getAllObjects('stats')
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pomodoro-data-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showNotification('Data Exported', 'Your data has been successfully exported!');
        } catch (error) {
            console.error('Error exporting data:', error);
            showNotification('Export Error', 'Failed to export data.');
        }
    }

    // Import data
    function importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async e => {
            const file = e.target.files[0];
            const reader = new FileReader();

            reader.onload = async event => {
                try {
                    const data = JSON.parse(event.target.result);

                    // Clear existing data before importing
                    await clearStore('tasks');
                    await clearStore('sessionHistory');
                    await clearStore('categories');
                    await clearStore('settings');
                    await clearStore('stats');

                    // Add imported data (assuming data is an array of objects for each store)
                    if (data.tasks) {
                         for (const task of data.tasks) { await addObject('tasks', task); }
                    }
                     if (data.sessionHistory) {
                         for (const historyEntry of data.sessionHistory) { await addObject('sessionHistory', historyEntry); }
                    }
                    if (data.categories) {
                         for (const category of data.categories) { await addObject('categories', category); }
                    }
                    if (data.settings) {
                         for (const setting of data.settings) { await addObject('settings', setting); }
                    }
                     if (data.stats) {
                         for (const stat of data.stats) { await addObject('stats', stat); }
                    }

                    // Reload data and update UI
                    await loadData();
                    // updateTaskList(); // Called within loadData
                    // updateHistoryList(); // Called within loadData
                    // updateCategorySelect(); // Called within loadData
                    // updateAnalytics(); // Called within loadData

                    showNotification('Data Imported', 'Your data has been successfully imported!');
                } catch (error) {
                    console.error('Error importing data:', error);
                    showNotification('Import Error', 'Failed to import data. Please check the file format.');
                }
            };

            reader.readAsText(file);
        };

        input.click();
    }

    // Update category select
    function updateCategorySelect() {
        const $select = $('#taskCategory');
        $select.empty();

        categories.forEach(category => {
            if (category && category.name) { // Check if category and name exist
                $select.append(`
                    <option value="${category.name}" style="color: ${category.color}">
                        ${category.name}
                    </option>
                `);
            }
        });
    }

    // Add category
    async function addCategory() {
        const name = $('#categoryName').val().trim();
        const color = $('#categoryColor').val();

        if (name && !categories.find(cat => cat.name === name)) {
            const newCategory = { name, color };
            await addObject('categories', newCategory); // Add category to IndexedDB
            categories.push(newCategory); // Add to local array
            updateCategorySelect();
            $('#categoryModal').modal('hide');
            $('#categoryName').val('');
        } else if (name) {
            showNotification('Category Exists', 'A category with this name already exists.');
        }
    }

    // Clear history
    async function clearHistory() {
        await clearStore('sessionHistory'); // Clear history from IndexedDB
        sessionHistory = []; // Clear local array
        updateHistoryList();
        updateAnalytics();
    }

    // Save settings
    async function saveSettings() {
        settings = {
            focusTime: parseInt($('#defaultFocusTime').val()) || 25, // Provide default
            shortBreak: parseInt($('#defaultShortBreak').val()) || 5, // Provide default
            longBreak: parseInt($('#defaultLongBreak').val()) || 15, // Provide default
            autoStartBreaks: $('#autoStartBreaks').is(':checked'),
            autoStartPomodoros: $('#autoStartPomodoros').is(':checked'),
            enableNotifications: $('#enableNotifications').is(':checked'),
            enableSound: $('#enableSound').is(':checked'),
             darkMode: $('body').hasClass('dark-mode') // Save dark mode state
        };
        await clearStore('settings'); // Clear existing settings
        for (const key in settings) {
             // Check if key and value are valid before saving
             if (settings.hasOwnProperty(key) && settings[key] !== undefined) {
                 await addObject('settings', { key: key, value: settings[key] }); // Save updated settings
             }
        }

        // Update daily goal and save stats
        dailyGoal = parseInt($('#dailyGoalCount').val()) || 4; // Provide default
         await saveStats();

        // Update notifications and sound settings
        notificationsEnabled = settings.enableNotifications;
        soundEnabled = settings.enableSound;

        // Update mode buttons with new times
        $('.mode-btn[data-time="25"]').data('time', settings.focusTime);
        $('.mode-btn[data-time="5"]').data('time', settings.shortBreak);
        $('.mode-btn[data-time="15"]').data('time', settings.longBreak);

        resetTimer();
    }

    // Load settings into modal
    function loadSettings() {
        $('#defaultFocusTime').val(settings.focusTime !== undefined ? settings.focusTime : 25); // Provide default
        $('#defaultShortBreak').val(settings.shortBreak !== undefined ? settings.shortBreak : 5); // Provide default
        $('#defaultLongBreak').val(settings.longBreak !== undefined ? settings.longBreak : 15); // Provide default
        $('#autoStartBreaks').prop('checked', settings.autoStartBreaks !== undefined ? settings.autoStartBreaks : false); // Provide default
        $('#autoStartPomodoros').prop('checked', settings.autoStartPomodoros !== undefined ? settings.autoStartPomodoros : false); // Provide default
        $('#enableNotifications').prop('checked', settings.enableNotifications !== undefined ? settings.enableNotifications : true); // Provide default
        $('#enableSound').prop('checked', settings.enableSound !== undefined ? settings.enableSound : true); // Provide default
        $('#dailyGoalCount').val(dailyGoal !== undefined ? dailyGoal : 4); // Provide default
    }

    // Handle keyboard shortcuts
    function handleKeyboardShortcut(e) {
        if ($(e.target).is('input, textarea, select')) return; // Ignore shortcuts if focus is on input fields

        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                if (isRunning) pauseTimer();
                else startTimer();
                break;
            case 'r':
                resetTimer();
                break;
            case '1':
                $('.mode-btn[data-time="25"]').click();
                break;
            case '2':
                $('.mode-btn[data-time="5"]').click();
                break;
            case '3':
                $('.mode-btn[data-time="15"]').click();
                break;
            case 'c':
                $('#customTimeBtn').click();
                break;
            case '?':
                $('#shortcutsModal').modal('show');
                break;
        }
    }

    // Event Listeners
    $('#start').click(startTimer);
    $('#pause').click(pauseTimer);
    $('#reset').click(resetTimer);
    $('#darkMode').click(toggleDarkMode);
    $('#soundToggle').click(toggleSound);
    $('#notificationsToggle').click(toggleNotifications);
    $('#addTask').click(addTask);
    $('#taskInput').keypress(function(e) {
        if (e.which === 13) {
            addTask();
        }
    });
    $('#clearHistory').click(clearHistory);
    $('#settingsBtn').click(function() {
        loadSettings();
        $('#settingsModal').modal('show');
    });
    $('#saveSettings').click(function() {
        saveSettings();
        $('#settingsModal').modal('hide');
    });
    $('#addCategoryBtn').click(function() {
        $('#categoryModal').modal('show');
    });
    $('#saveCategory').click(addCategory);
    $('#exportData').click(exportData);
    $('#importData').click(importData);
    $('#analyticsPeriod').change(updateAnalytics);

    // Custom time input
    $('#customTimeBtn').click(function() {
        $('.custom-time-input').slideToggle();
    });

    $('#setCustomTime').click(function() {
        const minutes = parseInt($('#customMinutes').val());
        if (minutes && minutes > 0 && minutes <= 60) {
            $('.mode-btn').removeClass('active');
            initTimer(minutes);
            $('.custom-time-input').slideUp();
        }
    });

    // Task actions
    $(document).on('click', '.complete-task', async function() {
        const taskId = $(this).data('id');
        // Find task in the local tasks array (assuming it's kept in sync)
        const taskIndex = tasks.findIndex(task => task && task.id === taskId); // Add check for task existence

        if (taskIndex !== -1) {
            tasks[taskIndex].completed = !tasks[taskIndex].completed;
             await putObject('tasks', tasks[taskIndex]); // Update task in IndexedDB

            if (tasks[taskIndex].completed) {
                currentTask = tasks[taskIndex].text; // Set current task when marking as complete
            } else {
                currentTask = ''; // Clear current task if marking as incomplete
            }

            updateTaskList(); // Update both lists
            updateAnalytics();
        } else {
             console.warn('Task not found in local array for completion:', taskId);
             // Optionally, attempt to reload tasks from DB and update UI
             // await loadData();
        }
    });

    $(document).on('click', '.delete-task', async function() {
        const taskId = $(this).data('id');
         // Check if task and task.id are valid before deleting from local array and DB
         const taskIndex = tasks.findIndex(task => task && task.id === taskId);
         if (taskIndex !== -1) {
            await deleteObject('tasks', taskId); // Delete task from IndexedDB
            tasks.splice(taskIndex, 1); // Remove from local array
            updateTaskList(); // Update both lists
            updateAnalytics();
         } else {
             console.warn('Task not found in local array for deletion:', taskId);
             // Optionally, attempt to reload tasks from DB and update UI
             // await loadData();
         }
    });

    // Mode selection
    $('.mode-btn').click(function() {
        $('.mode-btn').removeClass('active');
        $(this).addClass('active');
        resetTimer();
    });

    // Keyboard shortcuts
    $(document).keydown(handleKeyboardShortcut);

    // Initialize the application
    async function initializeApp() {
        if (!('indexedDB' in window)) {
            console.error('IndexedDB not supported');
            // Display a message to the user indicating lack of support
            $('body').html('<div class="container mt-5 text-center"><h3>Your browser does not support IndexedDB. Please use a modern browser.</h3></div>');
            return;
        }

        try {
            await openDB();
            await loadData();
            initTimer(settings.focusTime !== undefined ? settings.focusTime : 25); // Use loaded focus time, provide default
             resetDailyProgress(); // Schedule daily progress reset

             // Set initial dark mode state based on settings
             if (settings.darkMode) {
                $('body').addClass('dark-mode');
                 $('#darkMode i').removeClass('fa-moon').addClass('fa-sun');
            }

        } catch (error) {
            console.error('Failed to initialize application:', error);
            // Display an error message to the user
             $('body').html('<div class="container mt-5 text-center"><h3>Error loading application data. Please try again or clear your browser data.</h3></div>');
        }
    }

    // Start the application initialization after the DOM is fully ready
    initializeApp();
}); 