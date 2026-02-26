document.addEventListener('DOMContentLoaded', function() {
    const delaySlider = document.getElementById('startupDelay');
    const delayValue = document.getElementById('delayValue');
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');
    const createGroupBtn = document.getElementById('createGroupBtn');
    const groupNameInput = document.getElementById('groupNameInput');
    const addGroupBtn = document.getElementById('addGroupBtn');
    const moveGroupsBtn = document.getElementById('moveGroupsBtn');

    let pinnedGroups = ['arc-tabs'];

    // Загружаем текущие настройки
    chrome.storage.sync.get({
        startupDelay: 15000,
        pinnedGroups: ['arc-tabs']
    }, function(settings) {
        delaySlider.value = settings.startupDelay;
        updateDelayValue(settings.startupDelay);
        updateSliderFill(delaySlider);
        pinnedGroups = settings.pinnedGroups || ['arc-tabs'];
        renderChips();
    });

    // Обновление значения при движении слайдера
    delaySlider.addEventListener('input', function() {
        updateDelayValue(this.value);
        updateSliderFill(this);
    });

    // Обработчик сохранения настроек
    saveBtn.addEventListener('click', function() {
        const startupDelay = parseInt(delaySlider.value);

        if (startupDelay < 10000 || startupDelay > 60000) {
            showStatus('Допустимые значения: 10000-60000 ms', 'error');
            return;
        }

        // Сохраняем настройки
        chrome.storage.sync.set({
            startupDelay: startupDelay,
            pinnedGroups: pinnedGroups
        }, function() {
            showStatus('Настройки сохранены успешно!', 'success');

            // Обновляем значение в фоновом скрипте
            chrome.runtime.sendMessage({
                action: 'updateSettings',
                startupDelay: startupDelay
            });
        });
    });

    // Обработчик создания группы
    if (createGroupBtn) {
        createGroupBtn.addEventListener('click', function() {
            chrome.runtime.sendMessage({
                action: 'createArcGroup'
            }, function(response) {
                if (response && response.success) {
                    showStatus('Группа arc-tabs создана!', 'success');
                }
            });
        });
    }

    // Обработчик перемещения групп в начало
    if (moveGroupsBtn) {
        moveGroupsBtn.addEventListener('click', function() {
            chrome.runtime.sendMessage({ action: 'movePinnedGroupsToStart' }, function(response) {
                if (response && response.success) {
                    showStatus('Группы перемещены в начало!', 'success');
                }
            });
        });
    }

    // Добавление группы по Enter или кнопке
    groupNameInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') addGroup();
    });
    addGroupBtn.addEventListener('click', addGroup);

    // Функция рендера чипов
    function renderChips() {
        const list = document.getElementById('pinnedChips');
        list.innerHTML = '';
        pinnedGroups.forEach(name => {
            const chip = document.createElement('div');
            chip.className = 'chip';
            chip.innerHTML = `<span>${name}</span><button class="chip-remove">×</button>`;
            chip.querySelector('.chip-remove').addEventListener('click', () => removeGroup(name));
            list.appendChild(chip);
        });
    }

    function addGroup() {
        const name = groupNameInput.value.trim();
        if (name && !pinnedGroups.includes(name)) {
            pinnedGroups.push(name);
            renderChips();
        }
        groupNameInput.value = '';
        groupNameInput.focus();
    }

    function removeGroup(name) {
        pinnedGroups = pinnedGroups.filter(g => g !== name);
        renderChips();
    }

    // Функция обновления отображаемого значения
    function updateDelayValue(value) {
        const seconds = Math.round(value / 1000);
        delayValue.textContent = seconds;
    }

    // Функция обновления заливки слайдера
    function updateSliderFill(slider) {
        const min = parseInt(slider.min);
        const max = parseInt(slider.max);
        const pct = ((parseInt(slider.value) - min) / (max - min)) * 100;
        slider.style.setProperty('--fill', pct + '%');
    }

    // Функция показа статуса
    function showStatus(message, type) {
        status.textContent = message;
        status.className = `status ${type} show`;

        setTimeout(() => {
            status.className = 'status';
        }, 3000);
    }
});
