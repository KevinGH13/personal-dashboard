// Vercel serverless function — Node.js 18+
// Consume el endpoint de Google Apps Script y devuelve eventos agrupados por día

var https = require('https');
var http  = require('http');

function fetchJSON(url, redirects) {
  redirects = redirects || 0;
  if (redirects > 5) return Promise.reject(new Error('Demasiadas redirecciones'));

  return new Promise(function(resolve, reject) {
    var mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'Accept': 'application/json' } }, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchJSON(res.headers.location, redirects + 1).then(resolve).catch(reject);
        return;
      }
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var raw = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(JSON.parse(raw));
        } catch(e) {
          reject(new Error('Respuesta no es JSON válido (status ' + res.statusCode + '). Primeros 200 chars: ' + raw.substring(0, 200)));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ─── Helpers de fecha ─────────────────────────────────────────

var TZ = 'America/Bogota';

function toLocalTime(dateStr, timeStr) {
  var d = new Date(dateStr + 'T' + timeStr + ':00Z');
  var parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true
  }).formatToParts(d);
  var p = {};
  parts.forEach(function(x) { p[x.type] = x.value; });
  // p.hour ya viene sin cero inicial en formato 12h; p.dayPeriod = 'AM'/'PM'
  return {
    date: p.year + '-' + p.month + '-' + p.day,
    time: p.hour + ':' + p.minute + ' ' + (p.dayPeriod || '').toUpperCase()
  };
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function todayKey(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

var DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
var MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function dayLabel(dateStr, todayStr, tomorrowStr) {
  if (dateStr === todayStr)    return 'Hoy';
  if (dateStr === tomorrowStr) return 'Mañana';
  // dateStr = "YYYY-MM-DD" — parseamos en local para evitar desfase UTC
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return DAYS_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear();
}

// ─── Handler ─────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  var scriptUrl = process.env.CAL_APPS_SCRIPT_URL || '';
  if (!scriptUrl) {
    return res.status(200).json({ events: [], unconfigured: true });
  }

  var now      = new Date();
  var todayStr    = todayKey(now);
  var tomorrow    = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  var tomorrowStr = todayKey(tomorrow);

  try {
    var data = await fetchJSON(scriptUrl);

    if (!data || !Array.isArray(data.events)) {
      return res.status(200).json({ events: [], count: 0 });
    }

    var mapped = data.events.map(function(ev) {
      var localDate = ev.date || '';
      var localTime = ev.start || '';

      if (!ev.allDay && ev.date && ev.start) {
        var converted = toLocalTime(ev.date, ev.start);
        localDate = converted.date;
        localTime = converted.time;
      }

      var ts = 0;
      if (localDate) {
        var parts = localDate.split('-');
        var base  = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        if (localTime && !ev.allDay) {
          var timeParts = localTime.split(':');
          var rawHour   = parseInt(timeParts[0], 10);
          var rawMin    = parseInt(timeParts[1], 10); // parseInt stops before " PM"
          var isPM      = /p\.?m/i.test(localTime);
          var isAM      = /a\.?m/i.test(localTime);
          var hour24    = rawHour;
          if (isPM && rawHour !== 12) hour24 = rawHour + 12;
          if (isAM && rawHour === 12) hour24 = 0;
          base.setHours(hour24, rawMin);
        }
        ts = base.getTime();
      }

      return {
        timestamp: ts,
        dayKey:    localDate,
        dayLabel:  dayLabel(localDate, todayStr, tomorrowStr),
        time:      ev.allDay ? '' : localTime,
        allDay:    !!ev.allDay,
        title:     ev.title || '(sin título)',
        calendar:  ev.calendar || ''
      };
    });

    mapped.sort(function(a, b) { return a.timestamp - b.timestamp; });

    return res.status(200).json({ events: mapped, count: mapped.length });

  } catch(e) {
    console.error('Error fetching Apps Script calendar:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
