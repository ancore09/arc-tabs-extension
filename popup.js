document.addEventListener('DOMContentLoaded', function() {
    const delaySlider = document.getElementById('startupDelay');
    const delayValue = document.getElementById('delayValue');
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');
    const createGroupBtn = document.getElementById('createGroupBtn');

    // Загружаем текущие настройки
    chrome.storage.sync.get({
        startupDelay: 15000
    }, function(settings) {
        delaySlider.value = settings.startupDelay;
        updateDelayValue(settings.startupDelay);
    });

    // Обновление значения при движении слайдера
    delaySlider.addEventListener('input', function() {
        updateDelayValue(this.value);
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
            startupDelay: startupDelay
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

    // Функция обновления отображаемого значения
    function updateDelayValue(value) {
        const seconds = Math.round(value / 1000);
        delayValue.textContent = seconds;
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