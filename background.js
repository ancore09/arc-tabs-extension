let isRestoringSession = false;
let initializationTimeout = null;
let settings = {
    startupDelay: 15000,
    pinnedGroups: ['arc-tabs']
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
    startupDelay: 15000,
    pinnedGroups: ['arc-tabs']
}, function(loadedSettings) {
    settings = loadedSettings;
    console.log('Настройки загружены. Задержка:', settings.startupDelay + 'ms');
});

// Обновляем настройки при изменении хранилища
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.startupDelay) settings.startupDelay = changes.startupDelay.newValue;
    if (changes.pinnedGroups) settings.pinnedGroups = changes.pinnedGroups.newValue;
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

    if (request.action === 'movePinnedGroupsToStart') {
        movePinnedGroupsToStart().then(() => {
            sendResponse({ success: true });
        });
        return true;
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

    // Если вкладка не новая и имеет "родителя" - 
    // значит вкладка была открыта по переходу по ссылке на текущей вкладке
    // такую вкладку не перемещаем
    if (tab.openerTabId !== undefined && tab.pendingUrl !== 'chrome://newtab/')
        return;

    // Иначе вкладка либо новая, либо открыта без родителя - из панели закладок
    // перемещаем такую вкладку
    setTimeout(() => {
        chrome.tabs.get(tab.id, (currentTab) => {
            if (currentTab && !chrome.runtime.lastError) {
                moveTabAfterGroups(currentTab.id);
            }
        });
    }, 100);
});

async function movePinnedGroupsToStart() {
    try {
        const pinnedTitles = settings.pinnedGroups;
        if (!pinnedTitles || pinnedTitles.length === 0) return;

        const allTabs = await chrome.tabs.query({});
        const startIndex = allTabs.filter(t => t.pinned).length;

        const allGroups = await chrome.tabGroups.query({});

        const groupsToMove = pinnedTitles
            .map(title => allGroups.find(g => g.title === title))
            .filter(Boolean)
            .reverse();

        for (const group of groupsToMove) {
            await chrome.tabGroups.move(group.id, { index: startIndex });
        }
    } catch (error) {
        console.error('Ошибка перемещения групп:', error);
    }
}

async function findPositionAfterGroups() {
    const pinnedTitles = settings.pinnedGroups;

    if (!pinnedTitles || pinnedTitles.length === 0) {
        return 0;
    }

    const allGroups = await chrome.tabGroups.query({});
    const pinnedIds = new Set(
        allGroups.filter(g => pinnedTitles.includes(g.title)).map(g => g.id)
    );

    if (pinnedIds.size === 0) {
        return 0;
    }

    const tabs = await chrome.tabs.query({});
    let maxIndex = -1;
    tabs.forEach(tab => {
        if (pinnedIds.has(tab.groupId) && tab.index > maxIndex) {
            maxIndex = tab.index;
        }
    });

    return maxIndex >= 0 ? maxIndex + 1 : 0;
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
