(function () {
  'use strict';

  var SOURCES = ['google', 'facebook', 'website', 'portal'];
  var ALIASES = { fb: 'facebook', ig: 'facebook', instagram: 'facebook', meta: 'facebook', adwords: 'google', gads: 'google' };

  // Lead source comes from the ad link: ?utm_source=facebook (or ?source=portal).
  function detectSource() {
    var params = new URLSearchParams(window.location.search);
    var raw = (params.get('utm_source') || params.get('source') || '').toLowerCase().trim();
    var source = ALIASES[raw] || raw;
    return SOURCES.indexOf(source) !== -1 ? source : 'website';
  }

  var form = document.getElementById('lead-form');
  var errorBox = document.getElementById('form-error');
  var submitBtn = document.getElementById('submit');
  var success = document.getElementById('success');

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = !msg;
  }

  function mark(field, invalid) {
    field.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  }

  function validate(data) {
    var nameEl = form.elements.name;
    var phoneEl = form.elements.phone;
    var emailEl = form.elements.email;
    var msgEl = form.elements.message;
    [nameEl, phoneEl, emailEl, msgEl].forEach(function (el) { mark(el, false); });

    if (!data.name) { mark(nameEl, true); return 'נא למלא שם מלא'; }
    if (!data.phone && !data.email) {
      mark(phoneEl, true); mark(emailEl, true);
      return 'נא להשאיר טלפון או אימייל';
    }
    if (data.phone && data.phone.replace(/\D/g, '').length < 9) { mark(phoneEl, true); return 'מספר הטלפון לא תקין'; }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { mark(emailEl, true); return 'כתובת האימייל לא תקינה'; }
    if (!data.message) { mark(msgEl, true); return 'ספרו לנו בקצרה על הפרויקט'; }
    return '';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = form.elements;
    var data = {
      name: f.name.value.trim(),
      phone: f.phone.value.trim(),
      email: f.email.value.trim(),
      message: f.message.value.trim(),
      source: detectSource(),
      website: f.website.value // honeypot
    };

    var problem = validate(data);
    showError(problem);
    if (problem) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'שולחים…';

    // Public demo (e.g. on Vercel) while n8n runs on the author's machine: a localhost
    // webhook is unreachable from a visitor's browser, so show the flow without sending.
    var webhookIsLocal = /\/\/(localhost|127\.0\.0\.1)[:/]/.test(window.LEAD_WEBHOOK_URL || '');
    var pageIsLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    if (webhookIsLocal && !pageIsLocal) {
      setTimeout(function () {
        form.hidden = true;
        success.hidden = false;
        var note = document.getElementById('demo-note');
        if (note) note.hidden = false;
        success.focus();
      }, 700);
      return;
    }

    fetch(window.LEAD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        form.hidden = true;
        success.hidden = false;
        success.focus();
      })
      .catch(function () {
        showError('הבקשה לא נשלחה. בדקו את החיבור לאינטרנט ונסו שוב.');
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'שלחו בקשה';
      });
  });
})();
