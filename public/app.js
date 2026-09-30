(function(){
  var POLL_MS = 4000;
  var MY_EMAIL_KEY = 'livepoint-my-email';

  var daysEl = document.getElementById('days');
  var statusText = document.getElementById('status-text');
  var adminPanel = document.getElementById('admin-panel');
  var rosterBody = document.getElementById('roster-body');
  var rosterEmpty = document.getElementById('roster-empty');
  var exportBtn = document.getElementById('export-btn');
  var pilotageBtn = document.getElementById('pilotage-btn');

  var checkIcon = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.15"/><path d="M6 10.2l2.4 2.4L14 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function myEmail(){ try{ return localStorage.getItem(MY_EMAIL_KEY) || ''; }catch(e){ return ''; } }
  function setMyEmail(v){ try{ localStorage.setItem(MY_EMAIL_KEY, v); }catch(e){} }

  var slotState = {};
  var slots = [];
  var myRegistration = null;
  var isAdmin = false;
  var pilotageCode = null;
  var byDay = [];

  function groupByDay(list){
    var groups = [];
    list.forEach(function(s){
      var col = groups.find(function(c){ return c.day === s.day; });
      if(!col){ col = { day:s.day, date:s.date, slots:[] }; groups.push(col); }
      col.slots.push(s);
    });
    return groups;
  }

  function buildLayout(){
    daysEl.innerHTML = '';
    slotState = {};
    byDay.forEach(function(col){
      var colEl = document.createElement('div');
      colEl.className = 'day-col';
      var headEl = document.createElement('div');
      headEl.className = 'day-header';
      headEl.innerHTML =
        '<p class="day-name">' + escapeHtml(col.day) + '</p>' +
        '<span class="day-date">' + escapeHtml(col.date) + '</span>';
      colEl.appendChild(headEl);

      col.slots.forEach(function(slot){
        var card = document.createElement('div');
        card.className = 'slot-card';
        card.innerHTML =
          '<div class="slot-top">' +
            '<span class="slot-time">' + slot.start + '<span class="arrow">→</span>' + slot.end + '</span>' +
            '<span class="slot-status open" data-role="status">' + slot.cap + ' places</span>' +
          '</div>' +
          '<div class="capacity-track"><div class="capacity-fill" data-role="fill" style="width:0%"></div></div>' +
          '<div class="slot-action" data-role="action"></div>';
        colEl.appendChild(card);

        slotState[slot.id] = {
          slot: slot,
          statusEl: card.querySelector('[data-role="status"]'),
          fillEl: card.querySelector('[data-role="fill"]'),
          actionEl: card.querySelector('[data-role="action"]')
        };
      });

      daysEl.appendChild(colEl);
    });
  }

  function renderAction(slotId){
    var st = slotState[slotId];
    if(!st) return;
    var full = st.slot.count >= st.slot.cap;

    if(myRegistration && myRegistration.slotId === slotId){
      st.actionEl.innerHTML =
        '<div class="confirmed-wrap">' +
          '<span class="confirmed-tag">' + checkIcon + ' Inscrit(e) — ' + escapeHtml(myRegistration.name || myRegistration.email) + '</span>' +
          '<button class="unregister" data-role="unregister" type="button">Annuler mon inscription</button>' +
        '</div>';
      st.actionEl.querySelector('[data-role="unregister"]').addEventListener('click', unregister);
      return;
    }

    if(myRegistration){
      st.actionEl.innerHTML = '<button class="reserve" disabled>Déjà inscrit(e) à un autre créneau</button>';
      return;
    }

    if(full){
      st.actionEl.innerHTML = '<button class="reserve" disabled>Complet</button>';
      return;
    }

    st.actionEl.innerHTML = '<button class="reserve" data-role="open-form">Réserver ma place</button>';
    st.actionEl.querySelector('[data-role="open-form"]').addEventListener('click', function(){ openForm(slotId); });
  }

  function openForm(slotId){
    var st = slotState[slotId];
    var uid = slotId + '-' + Math.random().toString(36).slice(2,7);
    st.actionEl.innerHTML =
      '<form class="signup" data-role="form">' +
        '<div class="field"><label for="name-' + uid + '">Nom et prénom</label>' +
          '<input id="name-' + uid + '" name="name" type="text" autocomplete="name" required></div>' +
        '<div class="field"><label for="email-' + uid + '">E-mail</label>' +
          '<input id="email-' + uid + '" name="email" type="email" autocomplete="email" value="' + escapeHtml(myEmail()) + '" required></div>' +
        '<div class="field"><label for="bt-' + uid + '">Business Team</label>' +
          '<input id="bt-' + uid + '" name="bt" type="text" required></div>' +
        '<p class="error-msg" data-role="error" hidden></p>' +
        '<div class="form-buttons">' +
          '<button type="submit" class="reserve">Confirmer</button>' +
          '<button type="button" class="cancel" data-role="cancel">Annuler</button>' +
        '</div>' +
      '</form>';

    var form = st.actionEl.querySelector('[data-role="form"]');
    var errEl = form.querySelector('[data-role="error"]');
    form.querySelector('[data-role="cancel"]').addEventListener('click', function(){ renderAction(slotId); });
    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      errEl.hidden = true;
      var name = form.querySelector('[name="name"]').value.trim();
      var email = form.querySelector('[name="email"]').value.trim();
      var bt = form.querySelector('[name="bt"]').value.trim();
      if(!name || !email || !bt){ return; }
      submitSignup(slotId, name, email, bt, form, errEl);
    });
  }

  function updateFromCounts(){
    slots.forEach(function(s){
      var st = slotState[s.id];
      if(!st) return;
      st.slot = s;
      var pct = Math.min(100, Math.round((s.count / s.cap) * 100));
      st.fillEl.style.width = pct + '%';
      var full = s.count >= s.cap;
      st.fillEl.classList.toggle('full', full);
      st.statusEl.classList.toggle('open', !full);
      st.statusEl.classList.toggle('full', full);
      st.statusEl.textContent = full ? 'Complet' : (s.cap - s.count) + ' places restantes';
      renderAction(s.id);
    });
  }

  function submitSignup(slotId, name, email, bt, form, errEl){
    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi…';

    fetch('/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, email: email, bt: bt, slotId: slotId })
    }).then(function(r){ return r.json().then(function(body){ return { ok: r.ok, body: body }; }); })
      .then(function(res){
        if(!res.ok){
          errEl.textContent = res.body.error || "Inscription impossible.";
          errEl.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Confirmer';
          return;
        }
        setMyEmail(email);
        myRegistration = res.body.registration;
        refresh();
      }).catch(function(){
        errEl.textContent = "Connexion au serveur impossible.";
        errEl.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirmer';
      });
  }

  function unregister(){
    var email = myEmail();
    if(!email) return;
    fetch('/api/registrations/mine?email=' + encodeURIComponent(email), { method: 'DELETE' })
      .then(function(){ myRegistration = null; refresh(); });
  }

  function fetchMyRegistration(){
    var email = myEmail();
    if(!email){ myRegistration = null; return Promise.resolve(); }
    return fetch('/api/my-registration?email=' + encodeURIComponent(email))
      .then(function(r){ return r.json(); })
      .then(function(body){ myRegistration = body.registration; });
  }

  function refresh(){
    fetch('/api/slots').then(function(r){ return r.json(); }).then(function(list){
      var newByDay = groupByDay(list);
      var needsRebuild = JSON.stringify(newByDay.map(function(c){ return c.slots.map(function(s){ return s.id; }); }))
        !== JSON.stringify(byDay.map(function(c){ return c.slots.map(function(s){ return s.id; }); }));
      byDay = newByDay;
      slots = list;
      if(needsRebuild || Object.keys(slotState).length === 0){ buildLayout(); }
      return fetchMyRegistration();
    }).then(function(){
      updateFromCounts();
      statusText.textContent = 'inscriptions ouvertes';
    }).catch(function(){
      statusText.textContent = 'connexion au serveur perdue';
    });
    if(isAdmin){ refreshRoster(); }
  }

  function refreshRoster(){
    fetch('/api/admin/registrations', { headers: { 'x-pilotage-code': pilotageCode } })
      .then(function(r){ return r.json(); })
      .then(function(body){ renderRoster(body.registrations || []); });
  }

  function renderRoster(list){
    var bySlotId = {};
    slots.forEach(function(s){ bySlotId[s.id] = s; });
    if(!list.length){
      rosterBody.innerHTML = '';
      rosterEmpty.hidden = false;
      return;
    }
    rosterEmpty.hidden = true;
    var sorted = list.slice().sort(function(a,b){
      var sa = bySlotId[a.slotId], sb = bySlotId[b.slotId];
      var ka = sa ? sa.date + sa.start : '', kb = sb ? sb.date + sb.start : '';
      return ka.localeCompare(kb);
    });
    rosterBody.innerHTML = sorted.map(function(r){
      var s = bySlotId[r.slotId];
      var label = s ? (s.day + ' ' + s.start + '–' + s.end) : (r.slotId || '—');
      return '<tr>' +
        '<td class="muted">' + escapeHtml(label) + '</td>' +
        '<td>' + escapeHtml(r.name) + '</td>' +
        '<td class="muted">' + escapeHtml(r.email) + '</td>' +
        '<td class="muted">' + escapeHtml(r.bt) + '</td>' +
        '<td><button class="del" data-role="del" data-id="' + escapeHtml(r.id) + '" type="button">Supprimer</button></td>' +
      '</tr>';
    }).join('');
    rosterBody.querySelectorAll('[data-role="del"]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-id');
        btn.disabled = true;
        btn.textContent = '…';
        fetch('/api/admin/registrations/' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: { 'x-pilotage-code': pilotageCode }
        }).then(function(r){
          if(!r.ok) throw new Error('refused');
          refresh();
        }).catch(function(){
          btn.disabled = false;
          btn.textContent = 'Supprimer';
          alert("Suppression impossible.");
        });
      });
    });
  }

  function unlockPilotage(){
    var code = window.prompt('Code pilotage :');
    if(code == null) return;
    fetch('/api/admin/registrations', { headers: { 'x-pilotage-code': code } }).then(function(r){
      if(!r.ok){ alert('Code incorrect.'); return; }
      pilotageCode = code;
      isAdmin = true;
      adminPanel.hidden = false;
      pilotageBtn.hidden = true;
      exportBtn.addEventListener('click', function(){
        window.location.href = '/api/admin/export.csv?code=' + encodeURIComponent(pilotageCode);
      });
      refreshRoster();
    });
  }
  pilotageBtn.addEventListener('click', unlockPilotage);

  refresh();
  setInterval(refresh, POLL_MS);
})();
