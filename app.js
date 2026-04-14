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

var WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
var MONTHS   = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function updateClock() {
  var now  = new Date();
  var hrs  = now.getHours();
  var m    = pad2(now.getMinutes());
  var ampm = hrs >= 12 ? 'PM' : 'AM';
  var h    = hrs % 12 || 12;

  var timeEl    = document.getElementById('time');
  var weekdayEl = document.getElementById('weekday');
  var dateEl    = document.getElementById('date');

  if (timeEl)    timeEl.innerHTML = '<span class="time-digits">' + h + ':' + m + '</span><span class="time-ampm">' + ampm + '</span>';
  if (weekdayEl) weekdayEl.textContent = WEEKDAYS[now.getDay()];
  if (dateEl)    dateEl.textContent    = now.getDate() + ' de ' + MONTHS[now.getMonth()];
}

setInterval(updateClock, 1000);
updateClock();

/* ─── Agenda ────────────────────────────────────────────────── */

var DAY_LABELS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
var MONTHS_SHORT     = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                        'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function dayGroupLabel(date) {
  var today    = new Date();
  var tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  if (isSameDay(date, today))    return 'Hoy';
  if (isSameDay(date, tomorrow)) return 'Mañana';

  return DAY_LABELS_SHORT[date.getDay()] + ' ' +
         date.getDate() + ' ' +
         MONTHS_SHORT[date.getMonth()];
}

function renderAgenda(data) {
  var container = document.getElementById('agenda');
  if (!container) return;

  if (!data || !data.events) {
    container.innerHTML = '<div class="agenda-error">Error al cargar</div>';
    return;
  }


  if (data.events.length === 0) {
    container.innerHTML = '<div class="agenda-empty">Sin eventos próximos</div>';
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
      if (container) container.innerHTML = '<div class="agenda-error">Error al cargar</div>';
    });
}

loadAgenda();

// Refresca cada 2 horas, solo entre las 7am y 5pm
function scheduleAgendaRefresh() {
  var now = new Date();
  var h   = now.getHours();
  var delay;

  if (h >= 7 && h < 17) {
    delay = 2 * 60 * 60 * 1000; // 2 horas
  } else {
    // Espera hasta las 7am del día siguiente (o de hoy si aún no son las 7)
    var next7am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0, 0, 0);
    if (now >= next7am) next7am.setDate(next7am.getDate() + 1);
    delay = next7am.getTime() - now.getTime();
  }

  setTimeout(function() {
    loadAgenda();
    scheduleAgendaRefresh();
  }, delay);
}

scheduleAgendaRefresh();

/* ─── Utilidades ────────────────────────────────────────────── */

function escapeHtml(str) {
  if (!str) return '';
  return ('' + str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
