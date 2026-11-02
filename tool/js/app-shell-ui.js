window.FbTool = window.FbTool || {};

(function (ns) {
  const $ = (id) => document.getElementById(id);

  // options: [[key, buttonId, panelId?]]; panels are shown only for the active key.
  function bindSegmented(options, onSelect) {
    const select = (key) => {
      options.forEach(([k, buttonId, panelId]) => {
        $(buttonId).classList.toggle('active', k === key);
        if (panelId) $(panelId).hidden = k !== key;
      });
      if (onSelect) onSelect(key);
    };
    options.forEach(([key, buttonId]) => { $(buttonId).onclick = () => select(key); });
    return select;
  }

  function setConnection(connected, text) {
    const chip = $('open-settings');
    chip.classList.toggle('is-on', connected);
    chip.classList.toggle('is-off', !connected);
    $('connection-text').textContent = text;
  }

  const openSettings = () => !$('settings-dialog').open && $('settings-dialog').showModal();
  const closeSettings = () => $('settings-dialog').close();

  // Card and library edits come from many widgets (including dialogs), so listen at document level.
  function onAnyEdit(callback, delay = 120) {
    let timer;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(callback, delay);
    };
    ['input', 'change', 'click'].forEach((type) => document.addEventListener(type, schedule));
    return schedule;
  }

  function init() {
    bindSegmented([['compose', 'nav-compose', 'view-compose'], ['library', 'nav-library', 'view-library']]);
    $('open-settings').onclick = openSettings;
    $('close-settings').onclick = closeSettings;
  }

  ns.shell = { init, bindSegmented, setConnection, openSettings, closeSettings, onAnyEdit };
})(window.FbTool);
