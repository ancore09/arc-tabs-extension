let isRestoringSession = false;
let initializationTimeout = null;
let settings = {
    startupDelay: 15000
};

// Инициализация группы arc-tabs
async function initializeArcTabsGroup() {
    try {
        // Проверяем, существует ли уже группа arc-tabs
        const groups = await chrome.tabGroups.query({ title: 'arc-tabs' });
        
        if (groups.length === 0) {
            // Создаем новую группу
            await createArcTabsGroup();
        } else {
            console.log('Группа arc-tabs уже существует');
        }
    } catch (error) {
        console.error('Ошибка при инициализации группы:', error);
    }
}

// Создание группы arc-tabs
async function createArcTabsGroup() {
    try {
        // Создаем новую вкладку
        const tab = await chrome.tabs.create({ 
            url: 'chrome://newtab',
            active: false
        });

        // Ждем немного перед созданием группы
        await new Promise(resolve => setTimeout(resolve, 100));

        // Создаем группу и добавляем в нее вкладку
        const groupId = await chrome.tabs.group({ 
            tabIds: tab.id 
        });

        // Устанавливаем свойства группы
        await chrome.tabGroups.update(groupId, {
            title: 'arc-tabs',
            color: 'grey',
            collapsed: true // Группа по умолчанию свернута
        });

        const notPinnedTabs = await chrome.tabs.query({ pinned: false });
        await chrome.tabs.move(tab.id, { index: notPinnedTabs[0].index });        

        console.log('Группа arc-tabs создана');

    } catch (error) {
        console.error('Ошибка при создании группы:', error);
    }
}

chrome.tabGroups.onRemoved.addListener((group) => {
    if (group.title === 'arc-tabs') {
        console.log('Группа arc-tabs удалена, создаем новую...');
        // Не создаем сразу, чтобы избежать циклов
        setTimeout(initializeArcTabsGroup, 1000);
    }
});

// Загружаем настройки при запуске
chrome.storage.sync.get({
    startupDelay: 15000
}, function(loadedSettings) {
    settings = loadedSettings;
    console.log('Настройки загружены. Задержка:', settings.startupDelay + 'ms');
});

// Обработчик сообщений от popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'updateSettings') {
        settings.startupDelay = request.startupDelay;
        console.log('Настройки обновлены. Новая задержка:', settings.startupDelay + 'ms');
        
        // Если таймаут активен, перезапускаем его с новым значением
        if (isRestoringSession && initializationTimeout) {
            clearTimeout(initializationTimeout);
            initializationTimeout = setTimeout(() => {
                isRestoringSession = false;
                console.log('Расширение активировано после задержки');
            }, settings.startupDelay);
        }
        
        sendResponse({success: true});
    }

    if (request.action === 'createArcGroup') {
        initializeArcTabsGroup().then(() => {
            sendResponse({success: true});
        });
        return true;
    }

    return true;
});

// Отслеживаем запуск браузера
chrome.runtime.onStartup.addListener(() => {
    console.log('Запуск браузера. Расширение временно отключено');
    isRestoringSession = true;
    
    // Очищаем предыдущий таймаут
    if (initializationTimeout) {
        clearTimeout(initializationTimeout);
    }
    
    // Устанавливаем таймаут из настроек
    initializationTimeout = setTimeout(async () => {
        isRestoringSession = false;
        console.log('Расширение активировано после задержки ' + settings.startupDelay + 'ms');
    }, settings.startupDelay);
});

// Обработчик создания новой вкладки
chrome.tabs.onCreated.addListener((tab) => {
    if (isRestoringSession) {
        console.log('Пропускаем вкладку во время восстановления сессии');
        return;
    }
    
    setTimeout(() => {
        chrome.tabs.get(tab.id, (currentTab) => {
            if (currentTab && !chrome.runtime.lastError) {
                moveTabAfterGroups(currentTab.id);
            }
        });
    }, 100);
});

function findPositionAfterGroups() {
    return new Promise((resolve) => {
        chrome.tabs.query({}, (tabs) => {
            let maxGroupIndex = -1;
            let hasGroups = false;
            tabs.forEach(tab => {
                if (tab.groupId !== -1) {
                    hasGroups = true;
                    if (tab.index > maxGroupIndex) {
                        maxGroupIndex = tab.index;
                    }
                }
            });
            resolve(hasGroups ? maxGroupIndex + 1 : 0);
        });
    });
}

async function moveTabAfterGroups(tabId) {
    try {
        const targetIndex = await findPositionAfterGroups();
        chrome.tabs.move(tabId, { index: targetIndex });

        // грязнющий хак, я даже помыл руки после такого
        // идея зафокусить вкладу, которая находится перед той, которую мы уже подвинули
        // при этом скролл таббара переместится на эту вкладку
        // далее снова фокусим нужную нам вкладку
        // таким образом контрится автоматический скролл таббара вниз
        const notPinnedTabs = await chrome.tabs.query({ pinned: false });
        await focusTab(notPinnedTabs[0].index)
        await focusTab(targetIndex)
    } catch (error) {
        console.error('Ошибка перемещения вкладки:', error);
    }
}

async function focusTab(currentTabIndex) {
    try {
        const tab = await chrome.tabs.query({ index: currentTabIndex });
        if (tab[0]) {
            await chrome.tabs.update(tab[0].id, { active: true });
        }
    } catch (error) {
        console.log('Не удалось переключиться на предыдущую вкладку:', error);
    }
}

console.log('Расширение arc-tabs запущено');
