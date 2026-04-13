/* ─── Modo oscuro / claro ───────────────────────────────────── */

function toggleMode() {
  var isDark = document.body.classList.contains('dark');
  if (isDark) {
    document.body.classList.remove('dark');
    document.body.classList.add('light');
    document.getElementById('icon-sun').classList.add('hidden');
    document.getElementById('icon-moon').classList.remove('hidden');
    try { localStorage.setItem('mode', 'light'); } catch(e) {}
  } else {
    document.body.classList.remove('light');
    document.body.classList.add('dark');
    document.getElementById('icon-sun').classList.remove('hidden');
    document.getElementById('icon-moon').classList.add('hidden');
    try { localStorage.setItem('mode', 'dark'); } catch(e) {}
  }
}

(function initMode() {
  var saved = '';
  try { saved = localStorage.getItem('mode') || ''; } catch(e) {}
  var mode = saved || 'dark';
  document.body.classList.remove('dark', 'light');
  document.body.classList.add(mode);
  if (mode === 'light') {
    document.getElementById('icon-sun').classList.add('hidden');
    document.getElementById('icon-moon').classList.remove('hidden');
  }
})();

/* ─── Reloj ─────────────────────────────────────────────────── */

var WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
var MONTHS   = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function updateClock() {
  var now = new Date();
  var h   = pad2(now.getHours());
  var m   = pad2(now.getMinutes());

  var timeEl    = document.getElementById('time');
  var weekdayEl = document.getElementById('weekday');
  var dateEl    = document.getElementById('date');

  if (timeEl)    timeEl.textContent    = h + ':' + m;
  if (weekdayEl) weekdayEl.textContent = WEEKDAYS[now.getDay()];
  if (dateEl)    dateEl.textContent    = now.getDate() + ' de ' + MONTHS[now.getMonth()];
}

setInterval(updateClock, 1000);
updateClock();

/* ─── Agenda ────────────────────────────────────────────────── */

var DAY_LABELS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
var MONTHS_SHORT     = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                        'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function dayGroupLabel(date) {
  var today    = new Date();
  var tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  if (isSameDay(date, today))    return 'hoy';
  if (isSameDay(date, tomorrow)) return 'mañana';

  return DAY_LABELS_SHORT[date.getDay()] + ' ' +
         date.getDate() + ' ' +
         MONTHS_SHORT[date.getMonth()];
}

function renderAgenda(data) {
  var container = document.getElementById('agenda');
  if (!container) return;

  if (!data || !data.events) {
    container.innerHTML = '<div class="agenda-error">error al cargar</div>';
    return;
  }

  if (data.unconfigured) {
    container.innerHTML = '<div class="agenda-unconfigured">configura CAL_ICS_1 en Vercel para ver eventos</div>';
    return;
  }

  if (data.events.length === 0) {
    container.innerHTML = '<div class="agenda-empty">sin eventos próximos</div>';
    return;
  }

  // Agrupar por día
  var groups = {};
  var groupOrder = [];

  for (var i = 0; i < data.events.length; i++) {
    var ev  = data.events[i];
    var key = ev.dayKey;
    if (!groups[key]) {
      groups[key] = { label: ev.dayLabel, events: [] };
      groupOrder.push(key);
    }
    groups[key].events.push(ev);
  }

  var html = '';
  for (var gi = 0; gi < groupOrder.length; gi++) {
    var key   = groupOrder[gi];
    var group = groups[key];

    html += '<div class="day-group">';
    html += '<div class="day-label">' + escapeHtml(group.label) + '</div>';

    for (var ei = 0; ei < group.events.length; ei++) {
      var e = group.events[ei];
      html += '<div class="event-row">';
      if (e.allDay) {
        html += '<span class="event-allday">todo el día</span>';
      } else {
        html += '<span class="event-time">' + escapeHtml(e.time) + '</span>';
      }
      html += '<span class="event-title">' + escapeHtml(e.title) + '</span>';
      if (e.calendar) {
        html += '<span class="event-cal">' + escapeHtml(e.calendar) + '</span>';
      }
      html += '</div>';
    }

    html += '</div>';
  }

  container.innerHTML = html;
}

function loadAgenda() {
  fetch('/api/calendar')
    .then(function(res) { return res.json(); })
    .then(function(data) { renderAgenda(data); })
    .catch(function() {
      var container = document.getElementById('agenda');
      if (container) container.innerHTML = '<div class="agenda-error">error al cargar</div>';
    });
}

loadAgenda();
setInterval(loadAgenda, 15 * 60 * 1000);

/* ─── Utilidades ────────────────────────────────────────────── */

function escapeHtml(str) {
  if (!str) return '';
  return ('' + str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
