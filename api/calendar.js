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

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function todayKey(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

var DAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
var MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                    'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function dayLabel(dateStr, todayStr, tomorrowStr) {
  if (dateStr === todayStr)    return 'hoy';
  if (dateStr === tomorrowStr) return 'mañana';
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
      // Construir timestamp para ordenar
      var ts = 0;
      if (ev.date) {
        var parts = ev.date.split('-');
        var base  = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        if (ev.start && !ev.allDay) {
          var timeParts = ev.start.split(':');
          base.setHours(parseInt(timeParts[0], 10), parseInt(timeParts[1], 10));
        }
        ts = base.getTime();
      }

      return {
        timestamp: ts,
        dayKey:    ev.date || '',
        dayLabel:  dayLabel(ev.date || '', todayStr, tomorrowStr),
        time:      ev.allDay ? '' : (ev.start || ''),
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
