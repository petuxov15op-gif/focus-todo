'use strict';

(() => {
  const STORAGE_KEY = 'focus-todo:v1';
  const MAX_LENGTH = 200;
  const $ = (selector) => document.querySelector(selector);
  const input = $('#task-input');
  const list = $('#task-list');
  let tasks = [];
  let filter = 'all';
  let deleted = null;
  let storageProblem = '';

  function parseTasks(raw) {
    if (raw === null) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('Invalid task list');
    const ids = new Set();
    for (const task of data) {
      if (!task || typeof task.id !== 'string' || !task.id || ids.has(task.id)
        || typeof task.text !== 'string' || !task.text.trim() || task.text.length > MAX_LENGTH
        || typeof task.completed !== 'boolean') throw new Error('Invalid task');
      ids.add(task.id);
    }
    return data.map(({ id, text, completed }) => ({ id, text, completed }));
  }

  try {
    tasks = parseTasks(localStorage.getItem(STORAGE_KEY));
    // Check writes as well: some browser modes allow reads but reject writes.
    const probeKey = `${STORAGE_KEY}:probe`;
    localStorage.setItem(probeKey, '1');
    localStorage.removeItem(probeKey);
  } catch {
    storageProblem = 'Не удалось прочитать сохранённые задачи или получить доступ к хранилищу. Если добавишь новую задачу, приложение попробует сохранить текущий список заново.';
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      storageProblem = '';
    } catch {
      storageProblem = 'Браузер не разрешил сохранить изменения. Задачи доступны в этой вкладке, но после обновления изменения могут потеряться. Проверь настройки хранилища.';
    }
  }

  function plural(number, forms) {
    const lastTwo = number % 100;
    if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
    const last = number % 10;
    return last === 1 ? forms[0] : last >= 2 && last <= 4 ? forms[1] : forms[2];
  }

  function announce(message) {
    $('#announcer').textContent = message;
  }

  function notify(message, canUndo = false) {
    $('#toast-message').textContent = message;
    $('#undo-button').hidden = !canUndo;
    $('#toast').hidden = false;
  }

  function render() {
    const completed = tasks.filter((task) => task.completed).length;
    const active = tasks.length - completed;
    const percent = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
    $('#count-all').textContent = tasks.length;
    $('#count-active').textContent = active;
    $('#count-completed').textContent = completed;
    $('#done-number').textContent = completed;
    $('#total-number').textContent = ` / ${tasks.length}`;
    if ($('#sticker-done')) $('#sticker-done').textContent = completed;
    if ($('#sticker-total')) $('#sticker-total').textContent = tasks.length;
    $('#progress-percent').textContent = `${percent}%`;
    $('#progress-fill').style.width = `${percent}%`;
    $('.progress-track').setAttribute('aria-valuenow', percent);
    $('#progress-title').textContent = !tasks.length ? 'Чистый лист' : active ? 'Двигаемся по списку' : 'План выполнен';
    $('#progress-description').textContent = !tasks.length ? 'Добавь первое дело в список.' : `Выполнено ${completed} из ${tasks.length} задач.`;
    $('#remaining').textContent = active ? `${plural(active, ['Осталась', 'Остались', 'Осталось'])} ${active} ${plural(active, ['задача', 'задачи', 'задач'])}` : 'Нет незавершённых задач';
    $('#storage-warning').hidden = !storageProblem;
    $('#storage-warning').textContent = storageProblem;
    $('#save-text').textContent = storageProblem ? 'Есть проблема с сохранением' : 'Сохранено в браузере';
    $('#save-state').querySelector('svg').hidden = Boolean(storageProblem);

    const visible = tasks.filter((task) => filter === 'all' || (filter === 'completed' ? task.completed : !task.completed));
    $('#list-heading').textContent = { all: 'Все задачи', active: 'В работе', completed: 'Выполнено' }[filter];
    $('#list-count').textContent = `${visible.length} ${plural(visible.length, ['задача', 'задачи', 'задач'])}`;
    list.replaceChildren();
    for (const task of visible) {
      const row = document.createElement('li');
      row.className = `task-row${task.completed ? ' completed' : ''}`;
      const label = document.createElement('label');
      label.className = 'task-label';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-checkbox';
      checkbox.checked = task.completed;
      checkbox.dataset.id = task.id;
      const text = document.createElement('span');
      text.className = 'task-text';
      // User input stays plain text, never HTML.
      text.textContent = task.text;
      label.append(checkbox, text);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'delete-button';
      remove.dataset.id = task.id;
      remove.setAttribute('aria-label', `Удалить задачу «${task.text}»`);
      remove.title = 'Удалить задачу';
      remove.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg>';
      row.append(label, remove);
      list.append(row);
    }
    $('#empty-state').hidden = visible.length > 0;
    const empty = !tasks.length ? ['Пока чистый лист.', 'Запиши первое дело в поле выше.\nДаже маленькое считается.']
      : filter === 'completed' ? ['Галочки ещё впереди.', 'Отметь выполненное дело.\nОно появится здесь.']
      : ['Можно выдохнуть.', 'Незавершённых дел нет.\nЭтот список ты закрыл.'];
    $('#empty-title').textContent = empty[0];
    $('#empty-description').textContent = empty[1];
  }

  function update() {
    save();
    render();
  }

  function clearError() {
    input.removeAttribute('aria-invalid');
    $('#input-error').hidden = true;
  }

  $('#task-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || text.length > MAX_LENGTH) {
      input.setAttribute('aria-invalid', 'true');
      $('#input-error').textContent = text ? 'Не больше 200 символов на задачу.' : 'Сначала напиши задачу — одни пробелы не подойдут.';
      $('#input-error').hidden = false;
      input.focus();
      return;
    }
    tasks.unshift({ id: crypto.randomUUID(), text, completed: false });
    input.value = '';
    $('#character-count').textContent = `0 / ${MAX_LENGTH}`;
    clearError();
    if (filter === 'completed') setFilter('all');
    update();
    announce(storageProblem ? 'Задача добавлена, но не сохранена.' : 'Задача добавлена.');
    input.focus();
  });

  input.addEventListener('input', () => {
    clearError();
    $('#character-count').textContent = `${input.value.length} / ${MAX_LENGTH}`;
  });

  list.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.task-checkbox');
    if (!checkbox) return;
    const task = tasks.find((item) => item.id === checkbox.dataset.id);
    if (!task) return;
    task.completed = checkbox.checked;
    const index = [...list.querySelectorAll('.task-checkbox')].indexOf(checkbox);
    const id = task.id;
    update();
    const checkboxes = [...list.querySelectorAll('.task-checkbox')];
    const nextFocus = checkboxes.find((item) => item.dataset.id === id) || checkboxes[Math.min(index, checkboxes.length - 1)] || input;
    nextFocus.focus();
    announce(task.completed ? 'Задача выполнена.' : 'Задача снова в работе.');
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('.delete-button');
    if (!button) return;
    const index = tasks.findIndex((item) => item.id === button.dataset.id);
    if (index < 0) return;
    const visibleIndex = [...list.querySelectorAll('.delete-button')].indexOf(button);
    deleted = { task: tasks[index], index };
    tasks.splice(index, 1);
    update();
    notify('Задача удалена', true);
    const buttons = list.querySelectorAll('.delete-button');
    (buttons[Math.min(visibleIndex, buttons.length - 1)] || input).focus();
  });

  function setFilter(value) {
    filter = value;
    document.querySelectorAll('[data-filter]').forEach((button) => {
      const selected = button.dataset.filter === filter;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', selected);
    });
    render();
  }

  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => setFilter(button.dataset.filter));
  });
  $('#undo-button').addEventListener('click', () => {
    if (!deleted) return;
    tasks.splice(Math.min(deleted.index, tasks.length), 0, deleted.task);
    deleted = null;
    update();
    $('#toast').hidden = true;
    input.focus();
    announce('Задача восстановлена.');
  });
  $('#close-toast').addEventListener('click', () => {
    $('#toast').hidden = true;
    input.focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#toast').hidden) {
      $('#toast').hidden = true;
      input.focus();
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try {
      tasks = parseTasks(event.key === null ? null : event.newValue);
      deleted = null;
      $('#toast').hidden = true;
      storageProblem = '';
      render();
      announce('Список обновлён из другой вкладки.');
    } catch {
      storageProblem = 'В другой вкладке появились некорректные данные. Текущий список оставлен без изменений.';
      render();
    }
  });

  const now = new Date();
  $('#today').dateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  $('#today').textContent = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' }).format(now);
  render();
  input.disabled = false;
  $('.add-button').disabled = false;
  $('#task-form').setAttribute('aria-busy', 'false');
})();
