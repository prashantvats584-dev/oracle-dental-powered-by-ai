const AI = {
  model: 'gemini-2.0-flash',
  get key() { return localStorage.getItem('geminiApiKey') || ''; },
  get endpoint() { return `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.key}`; },
  async ask(prompt, btnEl = null) {
    if (!this.key) { showToast('Please add Gemini API Key in Settings', 'warning'); return null; }
    const orig = btnEl?.innerHTML;
    if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<span class="spinner"></span> AI Thinking...'; }
    try {
      const r = await fetch(this.endpoint, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ contents: [{parts: [{text: prompt}]}], generationConfig: { temperature: 0.4, maxOutputTokens: 1024 } })
      });
      const d = await r.json();
      if (d.candidates?.[0]?.content?.parts?.[0]?.text) { return d.candidates[0].content.parts[0].text.trim(); }
      throw new Error(d.error?.message || 'Empty response');
    } catch(e) { showToast('AI: ' + e.message, 'error'); return null; }
    finally { if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = orig; } }
  },
  async askJSON(prompt, btnEl = null) {
    const raw = await this.ask(prompt + '\n\nRETURN ONLY VALID JSON. No markdown fences, no backticks, no explanation text. Pure JSON only.', btnEl);
    if (!raw) return null;
    try {
      const clean = raw.replace(/```json|```/gi,'').replace(/^\s*[\r\n]/gm,'').trim();
      return JSON.parse(clean);
    } catch {
      const m = raw.match(/[\[{][\s\S]*[\]}]/);
      try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
    }
  }
};

function showToast(msg, type='success', duration=3500) {
  const t = document.createElement('div'); t.className = `toast ${type}`; t.innerHTML = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, duration);
}
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function closeAllModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden')); }
function saveData(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function getData(key, fallback=[]) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }
function formatDate(dateStr) { if(!dateStr)return''; const d=new Date(dateStr); return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); }
function formatTime(timeStr) { if(!timeStr)return''; const [h,m]=timeStr.split(':'); const d=new Date(); d.setHours(h,m); return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}); }
function formatCurrency(num) { return '₹' + Number(num).toLocaleString('en-IN'); }
function validatePhone(phone) { return /^\d{10}$/.test(phone); }
function validateRequired(fields) { return fields.filter(f => !document.getElementById(f).value.trim()); }
function debounce(fn, ms) { let t; return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); }; }
function getSetting(key) { const s = getData('clinic_settings', {}); return s[key] || ''; }
function navigateTo(page, data=null) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav .nav-item, #bottom-nav .nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(page).classList.add('active');
  document.querySelectorAll(`[data-target="${page}"]`).forEach(n => n.classList.add('active'));
  document.getElementById('page-title').innerText = page.charAt(0).toUpperCase() + page.slice(1);
  if(window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
  if(page==='dashboard') renderDashboard();
  if(page==='appointments') renderAppointments();
  if(page==='patients') renderPatients();
  if(page==='prescriptions') { if(data?.action==='new') showRxBuilder(data.patientId); else { hideRxBuilder(); renderRxList(); } }
  if(page==='invoices') { if(data?.action==='new') showInvBuilder(data.patientId); else { hideInvBuilder(); renderInvList(); } }
  if(page==='expenses') renderExpenses();
  if(page==='labs') renderLabs();
  if(page==='settings') loadSettings();
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function switchTab(group, target) {
  document.querySelectorAll(`.${group} .tab-btn`).forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`.${group} .tab-content`).forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById(target).classList.add('active');
}
function togglePassword(id) { const el = document.getElementById(id); el.type = el.type === 'password' ? 'text' : 'password'; }

let currentPatientId = null;
let currentToothNum = null;

document.addEventListener('DOMContentLoaded', () => {
  if(getData('session', false)) { document.getElementById('login-screen').classList.remove('active'); initApp(); }
  else { document.getElementById('login-form').addEventListener('submit', handleLogin); }
});

function handleLogin(e) {
  e.preventDefault();
  const u = document.getElementById('login-user').value;
  const p = document.getElementById('login-pass').value;
  const r = document.getElementById('login-remember').checked;
  const su = getSetting('username') || 'admin';
  const sp = getSetting('password') || 'oracle123';
  if(u===su && p===sp) {
    if(r) saveData('session', true);
    document.getElementById('login-screen').classList.remove('active');
    initApp();
  } else {
    showToast('Invalid credentials', 'error');
    document.querySelector('.login-card').style.animation = 'shake 0.5s';
    setTimeout(() => document.querySelector('.login-card').style.animation='', 500);
  }
}
function logout() { localStorage.removeItem('session'); location.reload(); }

function initApp() {
  document.getElementById('sidebar-doc-name').innerText = 'Dr. ' + (getSetting('doctorName') || 'Admin');
  navigateTo('dashboard');
}

function renderDashboard() {
  const appts = getData('appointments');
  const pts = getData('patients');
  const invs = getData('invoices');
  const today = new Date().toISOString().split('T')[0];
  
  document.getElementById('dash-appts').innerText = appts.filter(a => a.date === today).length;
  document.getElementById('dash-patients').innerText = pts.length;
  document.getElementById('dash-revenue').innerText = formatCurrency(invs.filter(i => i.date.startsWith(today.substring(0,7)) && i.paymentStatus==='Paid').reduce((sum,i)=>sum+i.total,0));
  document.getElementById('dash-pending').innerText = invs.filter(i => i.paymentStatus==='Unpaid').length;
  
  const sched = document.getElementById('dash-schedule');
  sched.innerHTML = appts.filter(a => a.date === today).sort((a,b)=>a.time.localeCompare(b.time)).map(a => `
    <div class="timeline-item" onclick="openPatientProfile('${a.patientId}')" style="cursor:pointer">
      <strong>${formatTime(a.time)}</strong> - ${a.patientName} <span class="badge ${a.status==='Completed'?'success':'info'}">${a.status}</span><br>
      <small>${a.treatmentType}</small>
    </div>
  `).join('') || '<div class="empty-state"><i class="fa-solid fa-calendar-day"></i><p>No appointments today</p></div>';
}

async function generateDailyInsight() {
  const btn = event.currentTarget;
  const prompt = `Dental clinic daily summary. Today appts: ${document.getElementById('dash-appts').innerText}, Total patients: ${document.getElementById('dash-patients').innerText}. Give 2 short sentences of encouragement and insight.`;
  const res = await AI.ask(prompt, btn);
  if(res) document.getElementById('ai-insight-content').innerHTML = `<p>${res}</p>`;
}

function renderAppointments() {
  const appts = getData('appointments');
  const filter = document.getElementById('appt-filter').value;
  const today = new Date().toISOString().split('T')[0];
  let filtered = appts;
  if(filter==='today') filtered = appts.filter(a => a.date === today);
  
  const tbody = document.getElementById('appt-table-body');
  tbody.innerHTML = filtered.sort((a,b)=>a.date.localeCompare(b.date)).map(a => `
    <tr>
      <td>${formatDate(a.date)}</td>
      <td>${formatTime(a.time)}</td>
      <td>${a.patientName}</td>
      <td>${a.treatmentType}</td>
      <td><span class="badge ${a.status==='Completed'?'success':'info'}">${a.status}</span></td>
      <td>
        <button class="btn-icon" onclick="editAppt('${a.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icon" onclick="deleteAppt('${a.id}')"><i class="fa-solid fa-trash text-danger"></i></button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="text-center">No appointments found</td></tr>';
}

function saveAppointment(e) {
  e.preventDefault();
  const id = document.getElementById('appt-id').value || generateId();
  const type = document.querySelector('input[name="appt-pt-type"]:checked').value;
  let ptId, ptName, ptPhone;
  
  if(type==='new') {
    ptName = document.getElementById('appt-name').value;
    ptPhone = document.getElementById('appt-phone').value;
    if(!validatePhone(ptPhone)) return showToast('Invalid phone number', 'error');
    ptId = generateId();
    const pts = getData('patients');
    pts.push({id:ptId, name:ptName, phone:ptPhone, createdAt:new Date().toISOString()});
    saveData('patients', pts);
  } else {
    const sel = document.getElementById('appt-pt-select');
    ptId = sel.value;
    ptName = sel.options[sel.selectedIndex].text.split(' - ')[0];
    ptPhone = sel.options[sel.selectedIndex].text.split(' - ')[1];
  }
  
  const appt = {
    id, patientId: ptId, patientName: ptName, patientPhone: ptPhone,
    date: document.getElementById('appt-date').value,
    time: document.getElementById('appt-time').value,
    treatmentType: document.getElementById('appt-treat').value,
    notes: document.getElementById('appt-notes').value,
    status: document.getElementById('appt-status').value
  };
  
  const appts = getData('appointments');
  const idx = appts.findIndex(a => a.id === id);
  if(idx > -1) appts[idx] = appt; else appts.push(appt);
  saveData('appointments', appts);
  
  closeModal('appointment-modal');
  showToast('Appointment saved');
  renderAppointments();
  renderDashboard();
}

function toggleApptPtType() {
  const type = document.querySelector('input[name="appt-pt-type"]:checked').value;
  if(type==='new') {
    document.getElementById('appt-new-pt').classList.remove('hidden');
    document.getElementById('appt-ex-pt').classList.add('hidden');
  } else {
    document.getElementById('appt-new-pt').classList.add('hidden');
    document.getElementById('appt-ex-pt').classList.remove('hidden');
    const sel = document.getElementById('appt-pt-select');
    sel.innerHTML = getData('patients').map(p => `<option value="${p.id}">${p.name} - ${p.phone}</option>`).join('');
  }
}

function deleteAppt(id) {
  if(confirm('Delete appointment?')) {
    saveData('appointments', getData('appointments').filter(a => a.id !== id));
    renderAppointments();
    showToast('Deleted', 'success');
  }
}

async function aiApptNotes() {
  const t = document.getElementById('appt-treat').value;
  if(!t) return showToast('Enter treatment first', 'warning');
  const res = await AI.ask(`Pre-visit notes for: ${t}. 4 brief bullet points.`, event.currentTarget);
  if(res) document.getElementById('appt-notes').value = res;
}

function renderPatients() {
  const pts = getData('patients');
  const q = document.getElementById('patient-search').value.toLowerCase();
  const filtered = pts.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q));
  
  document.getElementById('patient-grid').innerHTML = filtered.map(p => `
    <div class="patient-card">
      <div class="avatar">${p.name.charAt(0)}</div>
      <h3>${p.name}</h3>
      <p class="text-muted">${p.phone}</p>
      <button class="btn-secondary mt-3 w-100" onclick="openPatientProfile('${p.id}')">View Profile</button>
    </div>
  `).join('') || '<div class="empty-state"><i class="fa-solid fa-users"></i><p>No patients found</p></div>';
}

function openPatientProfile(id) {
  currentPatientId = id;
  const p = getData('patients').find(x => x.id === id);
  if(!p) return;
  
  document.getElementById('prof-name').innerText = p.name;
  document.getElementById('prof-phone').innerText = p.phone;
  document.getElementById('prof-phone').href = 'tel:' + p.phone;
  document.getElementById('prof-avatar').innerText = p.name.charAt(0);
  
  navigateTo('profile');
  renderDentalChart();
}

function savePatient(e) {
  e.preventDefault();
  const id = document.getElementById('pt-id').value || generateId();
  const p = {
    id,
    name: document.getElementById('pt-name').value,
    dob: document.getElementById('pt-dob').value,
    age: document.getElementById('pt-age').value,
    gender: document.getElementById('pt-gender').value,
    phone: document.getElementById('pt-phone').value,
    email: document.getElementById('pt-email').value,
    address: document.getElementById('pt-address').value,
    blood: document.getElementById('pt-blood').value,
    history: document.getElementById('pt-history').value,
    allergies: document.getElementById('pt-allergies').value,
    meds: document.getElementById('pt-meds').value,
    teeth: getData('patients').find(x=>x.id===id)?.teeth || {}
  };
  
  const pts = getData('patients');
  const idx = pts.findIndex(x => x.id === id);
  if(idx > -1) pts[idx] = p; else pts.push(p);
  saveData('patients', pts);
  
  closeModal('patient-modal');
  showToast('Patient saved');
  renderPatients();
}

function calcAge() {
  const dob = new Date(document.getElementById('pt-dob').value);
  const diff = Date.now() - dob.getTime();
  const age = new Date(diff).getUTCFullYear() - 1970;
  document.getElementById('pt-age').value = Math.abs(age);
}

function renderDentalChart() {
  const svg = document.getElementById('dental-svg');
  svg.innerHTML = '';
  const p = getData('patients').find(x => x.id === currentPatientId);
  const age = parseInt(p.age) || 30;
  
  let upper = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
  let lower = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
  
  const drawRow = (teeth, y, isUpper) => {
    const spacing = 50;
    const startX = 450 - (teeth.length * spacing) / 2 + 25;
    teeth.forEach((t, i) => {
      const x = startX + (i * spacing);
      const status = p.teeth[t]?.status || 'healthy';
      const color = getToothColor(status);
      
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "tooth-group");
      g.setAttribute("onclick", `openToothModal(${t})`);
      
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x-15); rect.setAttribute("y", isUpper ? y : y-30);
      rect.setAttribute("width", 30); rect.setAttribute("height", 40);
      rect.setAttribute("fill", color.fill); rect.setAttribute("stroke", color.stroke);
      rect.setAttribute("rx", 5);
      
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", x); text.setAttribute("y", isUpper ? y-10 : y+50);
      text.setAttribute("text-anchor", "middle"); text.setAttribute("fill", "#fff");
      text.textContent = t;
      
      g.appendChild(rect); g.appendChild(text); svg.appendChild(g);
    });
  };
  
  drawRow(upper, 80, true);
  drawRow(lower, 280, false);
  
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", 50); line.setAttribute("y1", 200);
  line.setAttribute("x2", 850); line.setAttribute("y2", 200);
  line.setAttribute("stroke", "var(--gold-primary)"); line.setAttribute("stroke-dasharray", "5,5");
  svg.appendChild(line);
}

function getToothColor(status) {
  const c = {
    healthy: {fill:'#F0EDE0', stroke:'#C8C4A0'},
    needsTreat: {fill:'#FFD700', stroke:'#B8860B'},
    treated: {fill:'#00C853', stroke:'#007B33'},
    urgent: {fill:'#FF3D00', stroke:'#B22800'},
    observation: {fill:'#2979FF', stroke:'#1565C0'},
    missing: {fill:'#1A1A1A', stroke:'#444'},
    unerupted: {fill:'none', stroke:'#444'}
  };
  return c[status] || c.healthy;
}

function openToothModal(num) {
  currentToothNum = num;
  document.getElementById('tooth-title').innerText = `🦷 Tooth #${num}`;
  const p = getData('patients').find(x => x.id === currentPatientId);
  const t = p.teeth[num] || {};
  
  document.getElementById('tooth-num').value = num;
  document.getElementById('tooth-cc').value = t.cc || '';
  document.getElementById('tooth-diag').value = t.diag || '';
  document.getElementById('tooth-plan').value = t.plan || '';
  document.getElementById('tooth-done').value = t.done || '';
  document.getElementById('tooth-status').value = t.status || 'healthy';
  
  openModal('tooth-modal');
}

function saveToothData(e) {
  e.preventDefault();
  const num = document.getElementById('tooth-num').value;
  const pts = getData('patients');
  const pIdx = pts.findIndex(x => x.id === currentPatientId);
  
  if(!pts[pIdx].teeth) pts[pIdx].teeth = {};
  pts[pIdx].teeth[num] = {
    cc: document.getElementById('tooth-cc').value,
    diag: document.getElementById('tooth-diag').value,
    plan: document.getElementById('tooth-plan').value,
    done: document.getElementById('tooth-done').value,
    status: document.getElementById('tooth-status').value
  };
  
  saveData('patients', pts);
  closeModal('tooth-modal');
  showToast('Tooth saved');
  renderDentalChart();
}

async function aiToothComplaint() {
  const res = await AI.ask(`Common chief complaints for tooth #${currentToothNum}. List 4 comma separated.`, event.currentTarget);
  if(res) {
    document.getElementById('tooth-ai-chips').innerHTML = res.split(',').map(c => `<span class="badge gold mr-2 mb-2" style="cursor:pointer" onclick="document.getElementById('tooth-cc').value+=' '+this.innerText">${c.trim()}</span>`).join('');
  }
}

async function aiToothDiagnosis() {
  const cc = document.getElementById('tooth-cc').value;
  const res = await AI.ask(`Top 3 diagnoses for tooth #${currentToothNum} with complaint: ${cc}. Comma separated.`, event.currentTarget);
  if(res) {
    document.getElementById('tooth-ai-diag').innerHTML = res.split(',').map(c => `<span class="badge info mr-2 mb-2" style="cursor:pointer" onclick="document.getElementById('tooth-diag').value='${c.trim()}'">${c.trim()}</span>`).join('');
  }
}

async function aiToothPlan() {
  const diag = document.getElementById('tooth-diag').value;
  const res = await AI.ask(`Treatment plan for ${diag} tooth #${currentToothNum}. 4 numbered steps.`, event.currentTarget);
  if(res) document.getElementById('tooth-plan').value = res;
}

function showRxBuilder(ptId=null) {
  document.getElementById('rx-list-view').classList.add('hidden');
  document.getElementById('rx-builder-view').classList.remove('hidden');
  
  const sel = document.getElementById('rx-patient');
  sel.innerHTML = '<option value="">Select Patient</option>' + getData('patients').map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  if(ptId) sel.value = ptId;
  
  document.getElementById('rx-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('rx-med-body').innerHTML = '';
  addRxMedRow();
}

function hideRxBuilder() {
  document.getElementById('rx-list-view').classList.remove('hidden');
  document.getElementById('rx-builder-view').classList.add('hidden');
}

function addRxMedRow(med={}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" value="${med.medicine||''}"></td>
    <td><input type="text" value="${med.dosage||''}"></td>
    <td><input type="text" value="${med.frequency||''}"></td>
    <td><input type="text" value="${med.duration||''}"></td>
    <td><input type="text" value="${med.instructions||''}"></td>
    <td><button class="btn-icon text-danger" onclick="this.closest('tr').remove()"><i class="fa-solid fa-xmark"></i></button></td>
  `;
  document.getElementById('rx-med-body').appendChild(tr);
}

async function aiSuggestMedicines() {
  const diag = document.getElementById('rx-diag').value;
  if(!diag) return showToast('Enter diagnosis first', 'warning');
  const res = await AI.askJSON(`Dental pharmacology. Diagnosis: ${diag}. Return JSON array: [{"medicine":"","dosage":"","frequency":"","duration":"","instructions":""}]`, event.currentTarget);
  if(res && Array.isArray(res)) {
    document.getElementById('rx-med-body').innerHTML = '';
    res.forEach(m => addRxMedRow(m));
    showToast('Medicines added');
  }
}

function renderRxList() {
  const rxs = getData('prescriptions');
  document.getElementById('rx-table-body').innerHTML = rxs.map(r => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td>${r.patientName}</td>
      <td>${r.diagnosis}</td>
      <td><button class="btn-icon" onclick="downloadRxPDF('${r.id}')"><i class="fa-solid fa-download"></i></button></td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="text-center">No prescriptions</td></tr>';
}

function saveRx() {
  const ptSel = document.getElementById('rx-patient');
  if(!ptSel.value) return showToast('Select patient', 'error');
  
  const rx = {
    id: generateId(),
    patientId: ptSel.value,
    patientName: ptSel.options[ptSel.selectedIndex].text,
    date: document.getElementById('rx-date').value,
    cc: document.getElementById('rx-cc').value,
    diagnosis: document.getElementById('rx-diag').value,
    instructions: document.getElementById('rx-inst').value,
    medicines: Array.from(document.getElementById('rx-med-body').querySelectorAll('tr')).map(tr => {
      const inps = tr.querySelectorAll('input');
      return { medicine:inps[0].value, dosage:inps[1].value, frequency:inps[2].value, duration:inps[3].value, instructions:inps[4].value };
    }).filter(m => m.medicine)
  };
  
  const rxs = getData('prescriptions');
  rxs.push(rx);
  saveData('prescriptions', rxs);
  showToast('Prescription saved');
  hideRxBuilder();
  renderRxList();
}

function downloadRxPDF(id) {
  showToast('PDF Download simulated (requires jsPDF full setup)', 'info');
}

function showInvBuilder(ptId=null) {
  document.getElementById('inv-list-view').classList.add('hidden');
  document.getElementById('inv-builder-view').classList.remove('hidden');
  document.getElementById('inv-number-display').innerText = 'INV-' + Math.floor(Math.random()*10000);
  
  const sel = document.getElementById('inv-patient');
  sel.innerHTML = '<option value="">Select Patient</option>' + getData('patients').map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  if(ptId) sel.value = ptId;
  
  document.getElementById('inv-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('inv-items-body').innerHTML = '';
  addInvItemRow();
}

function hideInvBuilder() {
  document.getElementById('inv-list-view').classList.remove('hidden');
  document.getElementById('inv-builder-view').classList.add('hidden');
}

function addInvItemRow() {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="inv-desc"></td>
    <td><input type="number" class="inv-qty" value="1" min="1" oninput="calcInv()"></td>
    <td><input type="number" class="inv-rate" value="0" min="0" oninput="calcInv()"></td>
    <td class="inv-amt">₹0</td>
    <td><button class="btn-icon text-danger" onclick="this.closest('tr').remove(); calcInv()"><i class="fa-solid fa-xmark"></i></button></td>
  `;
  document.getElementById('inv-items-body').appendChild(tr);
}

function calcInv() {
  let sub = 0;
  document.querySelectorAll('#inv-items-body tr').forEach(tr => {
    const q = parseFloat(tr.querySelector('.inv-qty').value) || 0;
    const r = parseFloat(tr.querySelector('.inv-rate').value) || 0;
    const amt = q * r;
    tr.querySelector('.inv-amt').innerText = formatCurrency(amt);
    sub += amt;
  });
  
  const discPct = parseFloat(document.getElementById('inv-disc').value) || 0;
  const taxPct = parseFloat(document.getElementById('inv-tax').value) || 0;
  
  const discAmt = sub * (discPct/100);
  const afterDisc = sub - discAmt;
  const taxAmt = afterDisc * (taxPct/100);
  const total = afterDisc + taxAmt;
  
  document.getElementById('inv-sub').innerText = formatCurrency(sub);
  document.getElementById('inv-disc-amt').innerText = '-'+formatCurrency(discAmt);
  document.getElementById('inv-tax-amt').innerText = '+'+formatCurrency(taxAmt);
  document.getElementById('inv-total').innerText = formatCurrency(total);
}

function saveInv() {
  const ptSel = document.getElementById('inv-patient');
  if(!ptSel.value) return showToast('Select patient', 'error');
  
  const inv = {
    id: generateId(),
    invoiceNo: document.getElementById('inv-number-display').innerText,
    patientId: ptSel.value,
    patientName: ptSel.options[ptSel.selectedIndex].text,
    date: document.getElementById('inv-date').value,
    total: parseFloat(document.getElementById('inv-total').innerText.replace(/[^0-9.-]+/g,"")),
    paymentStatus: document.getElementById('inv-status').value
  };
  
  const invs = getData('invoices');
  invs.push(inv);
  saveData('invoices', invs);
  showToast('Invoice saved');
  hideInvBuilder();
  renderInvList();
}

function renderInvList() {
  const invs = getData('invoices');
  document.getElementById('inv-table-body').innerHTML = invs.map(i => `
    <tr>
      <td>${i.invoiceNo}</td>
      <td>${formatDate(i.date)}</td>
      <td>${i.patientName}</td>
      <td>${formatCurrency(i.total)}</td>
      <td><span class="badge ${i.paymentStatus==='Paid'?'success':'warning'}">${i.paymentStatus}</span></td>
      <td><button class="btn-icon text-success" onclick="showToast('Marked Paid')"><i class="fa-solid fa-check"></i></button></td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="text-center">No invoices</td></tr>';
}

function saveClinicSettings(e) {
  e.preventDefault();
  const s = getData('clinic_settings', {});
  s.name = document.getElementById('set-cname').value;
  s.doctorName = document.getElementById('set-dname').value;
  s.phone = document.getElementById('set-phone').value;
  s.address = document.getElementById('set-address').value;
  saveData('clinic_settings', s);
  showToast('Settings saved');
  initApp();
}

function saveApiKey() {
  const k = document.getElementById('set-apikey').value;
  localStorage.setItem('geminiApiKey', k);
  showToast('API Key saved');
}

async function testAIConnection() {
  const res = await AI.ask('Respond with exactly: Oracle Dental AI Connected ✓', event.currentTarget);
  const box = document.getElementById('ai-test-res');
  if(res && res.includes('Connected')) {
    box.innerHTML = `<div class="badge success w-100 text-center py-2">${res}</div>`;
  } else {
    box.innerHTML = `<div class="badge danger w-100 text-center py-2">Connection Failed</div>`;
  }
}

function loadSettings() {
  const s = getData('clinic_settings', {});
  document.getElementById('set-cname').value = s.name || '';
  document.getElementById('set-dname').value = s.doctorName || '';
  document.getElementById('set-phone').value = s.phone || '';
  document.getElementById('set-address').value = s.address || '';
  document.getElementById('set-apikey').value = localStorage.getItem('geminiApiKey') || '';
}

function clearAllData() {
  if(prompt('Type DELETE ME to clear all data') === 'DELETE ME') {
    localStorage.clear();
    location.reload();
  }
}

// Dummy functions for unimplemented features
const dummyFn = (name) => () => showToast(`${name} feature coming soon!`, 'info');
const aiFullMouthAssessment = dummyFn('AI Full Mouth Assessment');
const handleImageSelect = dummyFn('Image Upload');
const aiFillRxHistory = dummyFn('AI Fill History');
const aiCheckInteractions = dummyFn('AI Interaction Check');
const aiRxInstructions = dummyFn('AI Instructions');
const aiRxNotes = dummyFn('AI Notes');
const previewRx = dummyFn('Preview Rx');
const printRx = dummyFn('Print Rx');
const createInvoiceFromRx = dummyFn('Create Invoice');
const previewInv = dummyFn('Preview Invoice');
const downloadInvPDF = dummyFn('Download Invoice PDF');
const aiAnalyseExpenses = dummyFn('AI Expense Analysis');
const exportExpenses = dummyFn('Export Expenses');
const renderFollowUps = dummyFn('Render Follow-ups');
const saveFollowUp = dummyFn('Save Follow-up');
const aiFUNotes = dummyFn('AI Follow-up Notes');
const saveImage = dummyFn('Save Image');
const aiImgNotes = dummyFn('AI Image Notes');
const saveExpense = dummyFn('Save Expense');
const saveLab = dummyFn('Save Lab Order');
const aiLabInst = dummyFn('AI Lab Instructions');
const renderLabs = dummyFn('Render Labs');
const generateReport = dummyFn('Generate Report');
const aiInterpretReport = dummyFn('AI Interpret Report');
const exportReport = dummyFn('Export Report');
const saveBase64Setting = dummyFn('Save Image Setting');
const exportBackup = dummyFn('Export Backup');
const importBackup = dummyFn('Import Backup');
const closeLightbox = dummyFn('Close Lightbox');
const aiPersonalizeWA = dummyFn('AI Personalize WhatsApp');
const sendWA = dummyFn('Send WhatsApp');
const toggleCalendarView = dummyFn('Toggle Calendar');
const openApptForPatient = dummyFn('Open Appointment');
const openFollowUpForPatient = dummyFn('Open Follow-up');
const aiAutocompleteTreat = dummyFn('AI Autocomplete Treatment');

// Expose functions to global scope for inline HTML handlers
Object.assign(window, {
  showToast, openModal, closeModal, closeAllModals, saveData, getData, generateId,
  formatDate, formatTime, formatCurrency, validatePhone, validateRequired, debounce,
  getSetting, navigateTo, toggleSidebar, switchTab, togglePassword, handleLogin,
  logout, initApp, renderDashboard, generateDailyInsight, renderAppointments,
  saveAppointment, toggleApptPtType, deleteAppt, aiApptNotes, renderPatients,
  openPatientProfile, savePatient, calcAge, renderDentalChart, getToothColor,
  openToothModal, saveToothData, aiToothComplaint, aiToothDiagnosis, aiToothPlan,
  showRxBuilder, hideRxBuilder, addRxMedRow, aiSuggestMedicines, renderRxList,
  saveRx, downloadRxPDF, showInvBuilder, hideInvBuilder, addInvItemRow, calcInv,
  saveInv, renderInvList, saveClinicSettings, saveApiKey, testAIConnection,
  loadSettings, clearAllData, AI,
  
  aiFullMouthAssessment, handleImageSelect, aiFillRxHistory, aiCheckInteractions,
  aiRxInstructions, aiRxNotes, previewRx, printRx, createInvoiceFromRx, previewInv,
  downloadInvPDF, aiAnalyseExpenses, exportExpenses, renderFollowUps, saveFollowUp,
  aiFUNotes, saveImage, aiImgNotes, saveExpense, saveLab, aiLabInst, renderLabs,
  generateReport, aiInterpretReport, exportReport, saveBase64Setting, exportBackup,
  importBackup, closeLightbox, aiPersonalizeWA, sendWA, toggleCalendarView,
  openApptForPatient, openFollowUpForPatient, aiAutocompleteTreat
});

