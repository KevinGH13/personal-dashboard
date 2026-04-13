// Vercel serverless function — Node.js 18+
// Parsea feeds ICS y devuelve eventos de los próximos 7 días agrupados por día

var https = require('https');
var http  = require('http');

function fetchText(url) {
  return new Promise(function(resolve, reject) {
    var mod = url.startsWith('https') ? https : http;
    mod.get(url, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() { resolve(Buffer.concat(chunks).toString('utf8')); });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ─── ICS Parser ──────────────────────────────────────────────

function unfold(text) {
  return text.replace(/\r\n([ \t])/g, '').replace(/\n([ \t])/g, '');
}

function parseParams(rawKey) {
  var parts  = rawKey.split(';');
  var params = {};
  for (var i = 1; i < parts.length; i++) {
    var eq = parts[i].indexOf('=');
    if (eq !== -1) {
      params[parts[i].substring(0, eq).toUpperCase()] = parts[i].substring(eq + 1);
    }
  }
  return params;
}

function parseDate(value, params) {
  if (!value) return null;
  params = params || {};
  var isAllDay = params['VALUE'] === 'DATE' || (value.length === 8 && value.indexOf('T') === -1);

  if (isAllDay) {
    var y  = parseInt(value.substring(0, 4), 10);
    var mo = parseInt(value.substring(4, 6), 10) - 1;
    var d  = parseInt(value.substring(6, 8), 10);
    return { date: new Date(y, mo, d), allDay: true };
  }

  var dtStr = value.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/,
    '$1-$2-$3T$4:$5:$6$7'
  );
  var date = new Date(dtStr);
  return isNaN(date.getTime()) ? null : { date: date, allDay: false };
}

function parseICS(text, calendarName) {
  var lines  = unfold(text).split(/\r?\n/);
  var events = [];
  var ev     = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var ci   = line.indexOf(':');
    if (ci === -1) continue;

    var rawKey = line.substring(0, ci);
    var val    = line.substring(ci + 1).trim();
    var key    = rawKey.split(';')[0].toUpperCase();

    if (key === 'BEGIN' && val === 'VEVENT') {
      ev = { calendar: calendarName || '' };
    } else if (key === 'END' && val === 'VEVENT') {
      if (ev) { events.push(ev); ev = null; }
    } else if (ev) {
      var params = parseParams(rawKey);
      if (key === 'SUMMARY') ev.summary = val.replace(/\\n/g, ' ').replace(/\\,/g, ',');
      if (key === 'DTSTART') ev.dtstart = parseDate(val, params);
    }
  }

  return events;
}

// ─── Formateo ─────────────────────────────────────────────────

var DAYS_SHORT   = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
var MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                    'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function dayKey(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function dayLabel(date, today, tomorrow) {
  if (dayKey(date) === dayKey(today))    return 'hoy';
  if (dayKey(date) === dayKey(tomorrow)) return 'mañana';
  return DAYS_SHORT[date.getDay()] + ' ' + date.getDate() + ' ' + MONTHS_SHORT[date.getMonth()];
}

function timeLabel(date) {
  return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

// ─── Handler ─────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  var sources = [
    { url: process.env.CAL_ICS_1 || '', name: process.env.CAL_NAME_1 || '' },
    { url: process.env.CAL_ICS_2 || '', name: process.env.CAL_NAME_2 || '' }
  ];

  var hasSource = sources[0].url || sources[1].url;
  if (!hasSource) {
    return res.status(200).json({ events: [], unconfigured: true });
  }

  var now      = new Date();
  var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  var rangeEnd = new Date(todayStart.getTime() + 8 * 24 * 60 * 60 * 1000);

  var allEvents  = [];
  var multiCal   = !!(sources[0].url && sources[1].url);

  for (var i = 0; i < sources.length; i++) {
    var src = sources[i];
    if (!src.url) continue;
    try {
      var text   = await fetchText(src.url);
      var parsed = parseICS(text, src.name);

      for (var j = 0; j < parsed.length; j++) {
        var ev = parsed[j];
        if (!ev.dtstart || !ev.dtstart.date) continue;

        var evDate  = ev.dtstart.date;
        var allDay  = ev.dtstart.allDay;

        // Para eventos con hora: mostrar sólo los que aún no han pasado
        // Para eventos de todo el día: mostrar si el día >= hoy
        var refDate = allDay ? todayStart : now;
        if (evDate < refDate || evDate >= rangeEnd) continue;

        allEvents.push({
          timestamp: evDate.getTime(),
          dayKey:    dayKey(evDate),
          dayLabel:  dayLabel(evDate, now, tomorrow),
          time:      allDay ? '' : timeLabel(evDate),
          allDay:    allDay,
          title:     ev.summary || '(sin título)',
          calendar:  multiCal ? ev.calendar : ''
        });
      }
    } catch(e) {
      console.error('Error calendar source ' + i + ':', e.message);
    }
  }

  allEvents.sort(function(a, b) { return a.timestamp - b.timestamp; });

  return res.status(200).json({ events: allEvents, count: allEvents.length });
};
