/**
 * admin.js — Admin Dashboard V2
 * ================================
 * Drives the entire admin dashboard against the V2 normalized schema:
 *   students_v2, registration_documents, batches_v2,
 *   batch_assignments_v2, batch_history,
 *   v_student_full, v_batch_full, v_dashboard_stats
 */

'use strict';

import { supabase } from '../js/supabase.js';
import { toast }    from '../js/toast.js';
import {
  TABLE_STUDENTS, TABLE_BATCHES, TABLE_BATCH_ASSIGNMENTS, TABLE_BATCH_HISTORY,
  TABLE_PLACEMENTS, TABLE_PLACEMENT_DOCS, TABLE_PAYSLIPS, TABLE_REGISTRATION_DOCS,
  VIEW_STUDENT_FULL, VIEW_BATCH_FULL, VIEW_DASHBOARD_STATS,
  PROJECT_NASSCOM, PROJECT_BAJAJ, STORAGE_BUCKET,
} from '../js/config.js';

// ════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════

const ADMIN_CREDENTIALS = [
  { username: 'admin', password: 'MaFoi@2024' },
  { username: 'mafoi', password: 'Admin#123'  },
];
const SESSION_KEY = 'mafoi_admin_auth';

function isAuthenticated() {
  try {
    const s = sessionStorage.getItem(SESSION_KEY);
    if (!s) return false;
    const { token, expires } = JSON.parse(s);
    if (Date.now() > expires) { sessionStorage.removeItem(SESSION_KEY); return false; }
    return token === btoa('mafoi_admin_ok');
  } catch { return false; }
}

function setAuthenticated(username) {
  const expires = Date.now() + (8 * 60 * 60 * 1000);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: btoa('mafoi_admin_ok'), expires, username }));
}

function getAuthUsername() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    return s?.username || 'Admin';
  } catch { return 'Admin'; }
}

function showAdmin() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('admin-wrap').classList.add('authenticated');
  const username = getAuthUsername();
  document.getElementById('admin-username-badge').textContent = username.charAt(0).toUpperCase();
  document.getElementById('topbar-username').textContent = username;
  console.log('[Admin] Login overlay hidden, calling bootDashboard()');
  bootDashboard().catch(err => {
    console.error('[Admin] bootDashboard() failed:', err);
    toast.error('Dashboard failed to load: ' + (err.message || 'Unknown error') + '. Check console for details.');
  });
}

const loginBtn      = document.getElementById('login-btn');
const loginError    = document.getElementById('login-error');
const loginErrText  = document.getElementById('login-error-text');
const usernameInput = document.getElementById('login-username');
const passwordInput = document.getElementById('login-password');
const pwToggle       = document.getElementById('pw-toggle');

pwToggle.addEventListener('click', () => {
  const isText = passwordInput.type === 'text';
  passwordInput.type = isText ? 'password' : 'text';
  document.getElementById('eye-icon').innerHTML = isText
    ? '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
});

function attemptLogin() {
  console.log('[Admin Login] attemptLogin() called');
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  console.log('[Admin Login] username entered:', JSON.stringify(username));
  loginError.classList.remove('show');
  usernameInput.classList.remove('error');
  passwordInput.classList.remove('error');

  if (!username || !password) {
    loginErrText.textContent = 'Please enter both username and password.';
    loginError.classList.add('show');
    if (!username) usernameInput.classList.add('error');
    if (!password) passwordInput.classList.add('error');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="login-spinner"></span> Signing in…';

  setTimeout(() => {
    console.log('[Admin Login] Checking credentials against:', ADMIN_CREDENTIALS.map(c => c.username));
    const match = ADMIN_CREDENTIALS.find(c => c.username === username && c.password === password);
    console.log('[Admin Login] Match found:', !!match);
    if (match) {
      setAuthenticated(username);
      loginBtn.innerHTML = '✓ Verified';
      console.log('[Admin Login] Authenticated, calling showAdmin() in 400ms');
      setTimeout(() => {
        console.log('[Admin Login] Calling showAdmin() now');
        try {
          showAdmin();
        } catch (err) {
          console.error('[Admin Login] showAdmin() threw an error:', err);
          loginErrText.textContent = 'Login succeeded but dashboard failed to load: ' + err.message;
          loginError.classList.add('show');
        }
      }, 400);
    } else {
      loginErrText.textContent = 'Invalid username or password. Please try again.';
      loginError.classList.add('show');
      usernameInput.classList.add('error');
      passwordInput.classList.add('error');
      passwordInput.value = '';
      loginBtn.disabled = false;
      loginBtn.innerHTML = 'Sign In';
      passwordInput.focus();
    }
  }, 500);
}

loginBtn.addEventListener('click', attemptLogin);
[usernameInput, passwordInput].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
  el.addEventListener('input', () => { el.classList.remove('error'); loginError.classList.remove('show'); });
});

document.getElementById('btn-logout').addEventListener('click', () => {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.reload();
});

// ════════════════════════════════════════════════════════════
// GLOBAL STATE
// ════════════════════════════════════════════════════════════

let allStudents   = [];
let allBatches    = [];
let allProjects   = [];
let allPrograms   = [];
let allLocations  = [];
let allPlacements = [];
let allDocuments  = [];

let studentFilter   = { project: 'all', program: '', location: '', batch: '', search: '' };
let studentSort      = { field: 'created_at', dir: 'desc' };
let studentPage       = 1;
const PAGE_SIZE = 20;

let batchSearch = '';

// ════════════════════════════════════════════════════════════
// PANEL / SIDEBAR NAVIGATION
// ════════════════════════════════════════════════════════════

const TOPBAR_TITLES = {
  dashboard:   'Admin Dashboard',
  students:    'Student Management',
  batches:     'Batch Management',
  placements:  'Placements',
  documents:   'Document Management',
};

document.querySelectorAll('.nav-item[data-panel]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.panel}`).classList.add('active');
    const titleEl = document.getElementById('topbar-title');
    const label = TOPBAR_TITLES[btn.dataset.panel] || 'Admin Dashboard';
    const icon = titleEl.querySelector('svg').outerHTML;
    titleEl.innerHTML = icon + label;
  });
});
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  const sb = document.getElementById('sidebar');
  sb.style.display = sb.style.display === 'flex' ? 'none' : 'flex';
});

// ════════════════════════════════════════════════════════════
// BOOT — load everything once authenticated
// ════════════════════════════════════════════════════════════

async function bootDashboard() {
  await loadLookups();
  await loadStudents();
  await Promise.all([loadBatches(), loadPlacements()]);
  await loadDocuments(); // depends on allStudents being populated
  await refreshPlacementDocCounts();
  await loadDashboardStats();
  populateFilterDropdowns();
  renderStudents();
  renderBatches();
  populatePlacementStudentDropdown();
  renderPlacements();
  renderDocuments();
}

async function loadLookups() {
  const [{ data: projects }, { data: programs }, { data: locations }] = await Promise.all([
    supabase.from('projects').select('*'),
    supabase.from('programs').select('*'),
    supabase.from('locations').select('*'),
  ]);
  allProjects  = projects  || [];
  allPrograms  = programs  || [];
  allLocations = locations || [];
}

async function loadStudents() {
  const { data, error } = await supabase
    .from(VIEW_STUDENT_FULL)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('[Admin] loadStudents error:', error); toast.error('Failed to load students: ' + error.message); return; }
  allStudents = data || [];
}

async function loadBatches() {
  const { data, error } = await supabase
    .from(VIEW_BATCH_FULL)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('[Admin] loadBatches error:', error); toast.error('Failed to load batches: ' + error.message); return; }
  allBatches = data || [];
}

async function loadPlacements() {
  const { data, error } = await supabase
    .from(TABLE_PLACEMENTS)
    .select('*, batches_v2(batch_code)')
    .order('created_at', { ascending: false });
  if (error) { console.error('[Admin] loadPlacements error:', error); toast.error('Failed to load placements: ' + error.message); return; }
  allPlacements = (data || []).map(p => ({ ...p, batch_code: p.batches_v2?.batch_code || null }));
}

async function loadDocuments() {
  // Registration documents, joined with student info for display
  const { data: regDocs, error: regErr } = await supabase
    .from(TABLE_REGISTRATION_DOCS)
    .select('*')
    .order('uploaded_at', { ascending: false });
  if (regErr) { console.error('[Admin] loadDocuments (registration) error:', regErr); }

  const studentMap = new Map(allStudents.map(s => [s.id, s]));
  const regRows = (regDocs || []).map(d => {
    const s = studentMap.get(d.student_id);
    return {
      kind: 'registration',
      id: d.id,
      studentName: s?.full_name || 'Unknown Student',
      maFoiId: s?.ma_foi_id || null,
      projectCode: s?.project_code || null,
      docLabel: d.doc_label,
      fileName: d.file_name,
      publicUrl: d.public_url,
      uploadedAt: d.uploaded_at,
      verified: d.verified,
      sourceTable: TABLE_REGISTRATION_DOCS,
    };
  });

  // Placement documents (offer letter, email confirmation, ID card)
  const { data: placeDocs } = await supabase.from(TABLE_PLACEMENT_DOCS).select('*, placements_v2(student_name)');
  const placeRows = (placeDocs || []).map(d => ({
    kind: 'placement',
    id: d.id,
    studentName: d.placements_v2?.student_name || 'Unknown Student',
    maFoiId: null, projectCode: null,
    docLabel: d.doc_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    fileName: d.file_name,
    publicUrl: d.public_url,
    uploadedAt: d.uploaded_at,
    verified: null,
    sourceTable: TABLE_PLACEMENT_DOCS,
  }));

  // Payslips
  const { data: payslips } = await supabase.from(TABLE_PAYSLIPS).select('*, placements_v2(student_name)');
  const paySlipRows = (payslips || []).map(d => ({
    kind: 'payslip',
    id: d.id,
    studentName: d.placements_v2?.student_name || 'Unknown Student',
    maFoiId: null, projectCode: null,
    docLabel: `Payslip Month ${d.month_number}`,
    fileName: d.file_name,
    publicUrl: d.public_url,
    uploadedAt: d.uploaded_at,
    verified: null,
    sourceTable: TABLE_PAYSLIPS,
  }));

  allDocuments = [...regRows, ...placeRows, ...paySlipRows].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

async function loadDashboardStats() {
  const { data, error } = await supabase.from(VIEW_DASHBOARD_STATS).select('*').single();
  const grid = document.getElementById('dash-stats-grid');
  if (error || !data) {
    grid.innerHTML = `<div class="tbl-empty" style="grid-column:1/-1">Could not load dashboard stats. Has schema_v4_normalized.sql been run?</div>`;
    return;
  }

  const cards = [
    { label: 'Total Registered Students',        val: data.total_students,             icon: iconUsers(),  color: '#2563eb', bg: '#eff6ff' },
    { label: 'Nasscom Foundation – HDFC',         val: data.nasscom_students,           icon: iconLayers(), color: '#2563eb', bg: '#eff6ff' },
    { label: 'Bajaj FinServ',                      val: data.bajaj_students,             icon: iconBriefcase(), color: '#b45309', bg: '#fff7ed' },
    { label: 'Data Analytics Students',            val: data.data_analytics_students,    icon: iconChart(),  color: '#7c3aed', bg: '#f5f3ff' },
    { label: 'BFSI Students',                      val: data.bfsi_students,              icon: iconChart(),  color: '#2563eb', bg: '#eff6ff' },
    { label: 'Gold Loan Students',                 val: data.gold_loan_students,         icon: iconCoin(),   color: '#b45309', bg: '#fff7ed' },
    { label: 'Microfinance Students',              val: data.microfinance_students,      icon: iconCoin(),   color: '#b45309', bg: '#fff7ed' },
    { label: 'Waiting for Batch Assignment',       val: data.waiting_batch_assignment,   icon: iconClock(),  color: '#dc2626', bg: '#fef2f2' },
    { label: 'Assigned to Batches',                 val: data.assigned_to_batches,        icon: iconCheck(),  color: '#16a34a', bg: '#f0fdf4' },
    { label: 'Students Placed',                    val: data.students_placed,            icon: iconCheck(),  color: '#16a34a', bg: '#f0fdf4' },
    { label: 'Pending Placement',                  val: data.students_pending_placement, icon: iconClock(),  color: '#dc2626', bg: '#fef2f2' },
    { label: 'Documents Uploaded',                 val: data.documents_uploaded,         icon: iconDoc(),    color: '#475569', bg: '#f1f5f9' },
    { label: 'Total Batches',                      val: data.total_batches,              icon: iconGrid(),   color: '#7c3aed', bg: '#f5f3ff' },
  ];

  grid.innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-card__top">
        <span class="stat-card__label-top">${c.label}</span>
        <div class="stat-card__icon" style="background:${c.bg};color:${c.color}">${c.icon}</div>
      </div>
      <div class="stat-card__val">${c.val ?? 0}</div>
    </div>`).join('');
}

// ── Tiny inline icon helpers ────────────────────────────────────
function iconUsers()     { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`; }
function iconLayers()    { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`; }
function iconBriefcase() { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>`; }
function iconChart()     { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`; }
function iconCoin()      { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a2 2 0 010 4H9.5a2 2 0 000 4H15"/></svg>`; }
function iconClock()     { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`; }
function iconCheck()     { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`; }
function iconDoc()       { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`; }
function iconGrid()      { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`; }

// ════════════════════════════════════════════════════════════
// STUDENT MANAGEMENT
// ════════════════════════════════════════════════════════════

document.querySelectorAll('.tab-btn[data-project-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn[data-project-tab]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    studentFilter.project = btn.dataset.projectTab;
    studentPage = 1;
    populateFilterDropdowns();
    renderStudents();
  });
});

document.getElementById('student-search').addEventListener('input', e => {
  studentFilter.search = e.target.value.toLowerCase();
  studentPage = 1;
  renderStudents();
});
document.getElementById('filter-program').addEventListener('change', e => {
  studentFilter.program = e.target.value; studentPage = 1; renderStudents();
});
document.getElementById('filter-location').addEventListener('change', e => {
  studentFilter.location = e.target.value; studentPage = 1; renderStudents();
});
document.getElementById('filter-batch').addEventListener('change', e => {
  studentFilter.batch = e.target.value; studentPage = 1; renderStudents();
});

// Sortable column headers
document.querySelectorAll('.data-table th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const field = th.dataset.sort;
    if (studentSort.field === field) {
      studentSort.dir = studentSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      studentSort = { field, dir: 'asc' };
    }
    document.querySelectorAll('.data-table th[data-sort]').forEach(h => h.classList.remove('sorted'));
    th.classList.add('sorted');
    renderStudents();
  });
});

function populateFilterDropdowns() {
  const projFilter = studentFilter.project === 'all' ? null : studentFilter.project;

  const programs = projFilter
    ? allPrograms.filter(p => allProjects.find(pr => pr.id === p.project_id)?.code === projFilter)
    : allPrograms;
  const locations = projFilter
    ? allLocations.filter(l => allProjects.find(pr => pr.id === l.project_id)?.code === projFilter)
    : allLocations;

  const progSel = document.getElementById('filter-program');
  const curProg = progSel.value;
  progSel.innerHTML = '<option value="">All Programs</option>' +
    [...new Set(programs.map(p => p.name))].map(n => `<option value="${n}">${n}</option>`).join('');
  if ([...progSel.options].some(o => o.value === curProg)) progSel.value = curProg;

  const locSel = document.getElementById('filter-location');
  const curLoc = locSel.value;
  locSel.innerHTML = '<option value="">All Locations</option>' +
    [...new Set(locations.map(l => l.name))].map(n => `<option value="${n}">${n}</option>`).join('');
  if ([...locSel.options].some(o => o.value === curLoc)) locSel.value = curLoc;

  const batchSel = document.getElementById('filter-batch');
  const curBatch = batchSel.value;
  const relevantBatches = projFilter ? allBatches.filter(b => b.project_code === projFilter) : allBatches;
  batchSel.innerHTML = '<option value="">All Batches</option>' +
    relevantBatches.map(b => `<option value="${b.batch_code}">${b.batch_code}</option>`).join('');
  if ([...batchSel.options].some(o => o.value === curBatch)) batchSel.value = curBatch;
}

function getFilteredStudents() {
  let rows = allStudents;
  if (studentFilter.project !== 'all') rows = rows.filter(s => s.project_code === studentFilter.project);
  if (studentFilter.program)  rows = rows.filter(s => s.program_name === studentFilter.program);
  if (studentFilter.location) rows = rows.filter(s => s.location_name === studentFilter.location);
  if (studentFilter.batch)    rows = rows.filter(s => s.batch_code === studentFilter.batch);
  if (studentFilter.search) {
    const q = studentFilter.search;
    rows = rows.filter(s =>
      (s.full_name||'').toLowerCase().includes(q) ||
      (s.ma_foi_id||'').toLowerCase().includes(q) ||
      (s.phone||'').includes(q) ||
      (s.email||'').toLowerCase().includes(q)
    );
  }

  rows = [...rows].sort((a, b) => {
    let av = a[studentSort.field], bv = b[studentSort.field];
    if (av == null) av = '';
    if (bv == null) bv = '';
    if (studentSort.field === 'created_at') { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
    if (av < bv) return studentSort.dir === 'asc' ? -1 : 1;
    if (av > bv) return studentSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  return rows;
}

function renderStudents() {
  const rows  = getFilteredStudents();
  const total = rows.length;
  const start = (studentPage - 1) * PAGE_SIZE;
  const page  = rows.slice(start, start + PAGE_SIZE);

  document.getElementById('students-tbl-title').textContent =
    studentFilter.project === 'all' ? 'All Students' :
    studentFilter.project === 'nasscom' ? 'Nasscom Foundation – HDFC Students' : 'Bajaj FinServ Students';

  const tbody = document.getElementById('students-tbody');
  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="tbl-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
      No students found matching your filters.</td></tr>`;
  } else {
    tbody.innerHTML = page.map(s => `
      <tr>
        <td>${s.ma_foi_id ? `<code style="font-size:12px;background:var(--bg);padding:2px 6px;border-radius:4px">${esc(s.ma_foi_id)}</code>` : '<span style="color:var(--text-muted);font-size:12px">—</span>'}</td>
        <td style="font-weight:500">${esc(s.full_name)}</td>
        <td>${esc(s.phone)}</td>
        <td><span class="badge ${s.project_code==='nasscom'?'badge-blue':'badge-amber'}">${esc(s.project_name)}</span></td>
        <td>${esc(s.program_name)}</td>
        <td>${esc(s.location_name)}</td>
        <td>${s.batch_code ? `<span class="badge badge-green">${esc(s.batch_code)}</span>` : '<span class="badge badge-gray">Unassigned</span>'}</td>
        <td style="font-size:12px;color:var(--text-secondary)">${fmtDate(s.created_at)}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="tbl-btn" onclick='viewProfile("${s.id}")'>View</button>
          <button class="tbl-btn" onclick='openEditStudent("${s.id}")'>Edit</button>
          ${s.batch_id
            ? `<button class="tbl-btn" onclick='openMoveBatch("${s.id}")'>Move</button>
               <button class="tbl-btn tbl-btn--danger" onclick='removeFromBatchDirect("${s.id}")'>Unassign</button>`
            : `<button class="tbl-btn tbl-btn--primary" onclick='openAssignBatch("${s.id}")'>Assign</button>`
          }
          <button class="tbl-btn tbl-btn--danger" onclick='confirmDeleteStudent("${s.id}")'>Delete</button>
        </td>
      </tr>`).join('');
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pag = document.getElementById('students-pagination');
  if (totalPages <= 1) {
    pag.innerHTML = `<span>Showing ${total} student${total===1?'':'s'}</span>`;
  } else {
    let btns = '';
    const maxShown = 7;
    let lo = Math.max(1, studentPage - 3), hi = Math.min(totalPages, lo + maxShown - 1);
    lo = Math.max(1, hi - maxShown + 1);
    if (lo > 1) btns += `<button class="page-btn" onclick="window.__goStudentPage(1)">1</button><span style="padding:0 4px">…</span>`;
    for (let i = lo; i <= hi; i++) btns += `<button class="page-btn ${i===studentPage?'active':''}" onclick="window.__goStudentPage(${i})">${i}</button>`;
    if (hi < totalPages) btns += `<span style="padding:0 4px">…</span><button class="page-btn" onclick="window.__goStudentPage(${totalPages})">${totalPages}</button>`;
    pag.innerHTML = `<span>Showing ${start+1}–${Math.min(start+PAGE_SIZE,total)} of ${total}</span><div class="page-btns">${btns}</div>`;
  }
}
window.__goStudentPage = (n) => { studentPage = n; renderStudents(); };

// ── View Profile ──────────────────────────────────────────────
window.viewProfile = async (studentId) => {
  openModal('modal-profile');
  document.getElementById('profile-body').innerHTML = '<div class="tbl-loading">Loading…</div>';

  const s = allStudents.find(x => x.id === studentId);
  if (!s) { document.getElementById('profile-body').innerHTML = '<div class="tbl-empty">Student not found.</div>'; return; }

  const { data: docs } = await supabase.from('registration_documents').select('*').eq('student_id', studentId);

  const row = (label, val) => val ? `<div class="profile-row"><div class="profile-row__label">${label}</div><div class="profile-row__val">${esc(val)}</div></div>` : '';

  document.getElementById('profile-body').innerHTML = `
    <div class="profile-section">
      <div class="profile-section__title">Identity</div>
      ${row('Ma Foi ID', s.ma_foi_id || '— (Bajaj has no Ma Foi ID)')}
      ${row('Full Name', s.full_name)}
      ${row('Email', s.email)} ${row('Phone', s.phone)} ${row('Alternate Phone', s.alternate_phone)}
      ${row('Gender', s.gender)} ${row('Date of Birth', s.date_of_birth)}
      ${row('Aadhaar', maskAadhaar(s.aadhaar_number))} ${row('PAN', s.pan_number)}
    </div>
    <div class="profile-section">
      <div class="profile-section__title">Address</div>
      ${row('Address', s.address)} ${row('City', s.city)} ${row('State', s.state)} ${row('PIN', s.pincode)}
    </div>
    <div class="profile-section">
      <div class="profile-section__title">Program</div>
      ${row('Project', s.project_name)} ${row('Program', s.program_name)} ${row('Location', s.location_name)}
      ${row('Qualification', s.educational_qualification)} ${row('Graduation Year', s.graduation_year)}
      ${row('Batch', s.batch_code || 'Not assigned')}
    </div>
    <div class="profile-section">
      <div class="profile-section__title">Family Background</div>
      ${row("Father's Name", s.father_name)} ${row("Mother's Name", s.mother_name)}
      ${row("Father's Occupation", s.father_occupation)} ${row('Parent Contact', s.parent_contact)}
      ${row('Family Members', s.total_family_members)} ${row('Annual Income', s.annual_family_income)}
    </div>
    <div class="profile-section">
      <div class="profile-section__title">Status</div>
      ${row('Registration Status', s.registration_status)} ${row('Placement Status', s.placement_status)}
      ${row('Remarks', s.remarks)} ${row('Registered On', fmtDate(s.created_at))}
    </div>
    <div class="profile-section">
      <div class="profile-section__title">Documents (${docs?.length||0})</div>
      ${(docs||[]).map(d => `<div class="profile-row"><div class="profile-row__label">${esc(d.doc_label)}</div><div class="profile-row__val"><a href="${d.public_url}" target="_blank" rel="noopener" style="color:var(--accent)">View File</a></div></div>`).join('') || '<div style="font-size:13px;color:var(--text-muted)">No documents uploaded.</div>'}
    </div>`;
};

// ── Edit Student ─────────────────────────────────────────────
window.openEditStudent = (studentId) => {
  const s = allStudents.find(x => x.id === studentId);
  if (!s) return;
  document.getElementById('es-id').value = s.id;
  document.getElementById('es-first-name').value = s.first_name || '';
  document.getElementById('es-last-name').value  = s.last_name  || '';
  document.getElementById('es-email').value      = s.email      || '';
  document.getElementById('es-phone').value      = s.phone      || '';
  document.getElementById('es-gender').value     = s.gender     || 'Male';
  document.getElementById('es-address').value    = s.address    || '';
  document.getElementById('es-aadhaar').value    = s.aadhaar_number || '';
  document.getElementById('es-grad-year').value  = s.graduation_year || '';
  document.getElementById('es-reg-status').value = s.registration_status || 'registered';
  document.getElementById('es-remarks').value    = s.remarks || '';
  ['es-first-name-error','es-last-name-error','es-email-error','es-phone-error'].forEach(id => {
    document.getElementById(id).textContent = '';
  });
  openModal('modal-edit-student');
};

document.getElementById('btn-save-student').addEventListener('click', async () => {
  const id = document.getElementById('es-id').value;
  const firstName = document.getElementById('es-first-name').value.trim();
  const lastName  = document.getElementById('es-last-name').value.trim();
  const email     = document.getElementById('es-email').value.trim();
  const phone     = document.getElementById('es-phone').value.trim();

  let ok = true;
  const setE = (id, msg) => { document.getElementById(id).textContent = msg; if (msg) ok = false; };
  setE('es-first-name-error', !firstName ? 'First name is required.' : '');
  setE('es-last-name-error',  !lastName  ? 'Last name is required.'  : '');
  setE('es-email-error', !email ? 'Email is required.' : (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Invalid email format.' : ''));
  setE('es-phone-error', !/^\d{10}$/.test(phone) ? 'Phone must be exactly 10 digits.' : '');
  if (!ok) return;

  const btn = document.getElementById('btn-save-student');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const { error } = await supabase.from(TABLE_STUDENTS).update({
      first_name: firstName, last_name: lastName,
      full_name: `${firstName} ${lastName}`,
      email: email.toLowerCase(), phone,
      gender: document.getElementById('es-gender').value,
      address: document.getElementById('es-address').value.trim() || null,
      aadhaar_number: document.getElementById('es-aadhaar').value.trim() || null,
      graduation_year: document.getElementById('es-grad-year').value ? parseInt(document.getElementById('es-grad-year').value) : null,
      registration_status: document.getElementById('es-reg-status').value,
      remarks: document.getElementById('es-remarks').value.trim() || null,
    }).eq('id', id);
    if (error) throw error;

    await logAudit('student_edit', 'student', id, { fields_changed: ['first_name','last_name','email','phone','gender','address','aadhaar_number','graduation_year','registration_status','remarks'] });
    toast.success('Student updated successfully');
    closeModal('modal-edit-student');
    await loadStudents();
    renderStudents();
  } catch (err) {
    toast.error('Update failed: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
});

// ── Delete Student ───────────────────────────────────────────
window.confirmDeleteStudent = (studentId) => {
  const s = allStudents.find(x => x.id === studentId);
  if (!s) return;
  showConfirm(
    'Delete Student',
    `Are you sure you want to delete <strong>${esc(s.full_name)}</strong> (${s.ma_foi_id || s.phone})? This will permanently remove their registration, documents, and batch history. This action cannot be undone.`,
    async () => {
      try {
        await supabase.from(TABLE_BATCH_ASSIGNMENTS).delete().eq('student_id', studentId);
        await supabase.from('registration_documents').delete().eq('student_id', studentId);
        const { error } = await supabase.from(TABLE_STUDENTS).delete().eq('id', studentId);
        if (error) throw error;
        await logAudit('student_delete', 'student', studentId, { name: s.full_name });
        toast.success(`${s.full_name} deleted`);
        await Promise.all([loadStudents(), loadBatches()]);
        await loadDashboardStats();
        renderStudents(); renderBatches();
      } catch (err) {
        toast.error('Delete failed: ' + err.message);
      }
    }
  );
};

// ════════════════════════════════════════════════════════════
// BATCH ASSIGNMENT / MOVE / REMOVE (from Students table)
// ════════════════════════════════════════════════════════════

let assignTargetId = null;

window.openAssignBatch = (studentId) => {
  const s = allStudents.find(x => x.id === studentId);
  if (!s) return;
  assignTargetId = studentId;
  showConfirmlessBatchPicker(s, null);
};

window.openMoveBatch = (studentId) => {
  const s = allStudents.find(x => x.id === studentId);
  if (!s) return;
  assignTargetId = studentId;
  document.getElementById('mv-student-name').textContent = s.full_name;
  document.getElementById('mv-current-batch').textContent = s.batch_code || '—';
  const sel = document.getElementById('mv-batch-select');
  const relevant = allBatches.filter(b => b.project_code === s.project_code && b.batch_code !== s.batch_code);
  sel.innerHTML = '<option value="">Choose a batch…</option>' +
    relevant.map(b => `<option value="${b.id}">${esc(b.batch_code)} — ${esc(b.program_name)}</option>`).join('');
  document.getElementById('mv-batch-error').textContent = '';
  openModal('modal-move-batch');
};

function showConfirmlessBatchPicker(student, currentBatchId) {
  // Reuse the move-batch modal for first-time assignment too
  document.getElementById('mv-student-name').textContent = student.full_name;
  document.getElementById('mv-current-batch').textContent = 'Not assigned';
  const sel = document.getElementById('mv-batch-select');
  const relevant = allBatches.filter(b => b.project_code === student.project_code);
  sel.innerHTML = '<option value="">Choose a batch…</option>' +
    relevant.map(b => `<option value="${b.id}">${esc(b.batch_code)} — ${esc(b.program_name)}</option>`).join('');
  document.getElementById('mv-batch-error').textContent = '';
  document.querySelector('#modal-move-batch .modal__title').textContent = 'Assign to Batch';
  openModal('modal-move-batch');
}

document.getElementById('btn-do-move').addEventListener('click', async () => {
  const batchId = document.getElementById('mv-batch-select').value;
  if (!batchId) { document.getElementById('mv-batch-error').textContent = 'Please select a batch.'; return; }
  if (!assignTargetId) return;

  const student = allStudents.find(x => x.id === assignTargetId);
  const newBatch = allBatches.find(b => b.id === batchId);
  const oldBatchId = student.batch_id || null;

  const btn = document.getElementById('btn-do-move');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    await supabase.from(TABLE_BATCH_ASSIGNMENTS).delete().eq('student_id', assignTargetId);
    const { error } = await supabase.from(TABLE_BATCH_ASSIGNMENTS).insert([{ student_id: assignTargetId, batch_id: batchId }]);
    if (error) throw error;

    await supabase.from(TABLE_BATCH_HISTORY).insert([{
      student_id: assignTargetId, from_batch_id: oldBatchId, to_batch_id: batchId,
      action: oldBatchId ? 'reassigned' : 'assigned', performed_by: getAuthUsername(),
    }]);

    await supabase.from(TABLE_STUDENTS).update({ registration_status: 'batch_assigned' }).eq('id', assignTargetId);

    await renameDocumentsForBatch(student, newBatch.batch_code);

    toast.success(`${student.full_name} ${oldBatchId ? 'moved to' : 'assigned to'} ${newBatch.batch_code}`);
    closeModal('modal-move-batch');
    document.querySelector('#modal-move-batch .modal__title').textContent = 'Move to Another Batch';
    await Promise.all([loadStudents(), loadBatches()]);
    await loadDashboardStats();
    renderStudents(); renderBatches();
  } catch (err) {
    toast.error('Failed: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Move Student';
  }
});

window.removeFromBatchDirect = (studentId) => {
  const s = allStudents.find(x => x.id === studentId);
  if (!s) return;
  showConfirm(
    'Remove From Batch',
    `Remove <strong>${esc(s.full_name)}</strong> from batch <strong>${esc(s.batch_code)}</strong>? They will appear in "Pending Batch Assignment".`,
    async () => {
      try {
        const { error } = await supabase.from(TABLE_BATCH_ASSIGNMENTS).delete().eq('student_id', studentId);
        if (error) throw error;
        await supabase.from(TABLE_BATCH_HISTORY).insert([{
          student_id: studentId, from_batch_id: s.batch_id, to_batch_id: null,
          action: 'removed', performed_by: getAuthUsername(),
        }]);
        await supabase.from(TABLE_STUDENTS).update({ registration_status: 'registered' }).eq('id', studentId);
        toast.success(`${s.full_name} removed from ${s.batch_code}`);
        await Promise.all([loadStudents(), loadBatches()]);
        await loadDashboardStats();
        renderStudents(); renderBatches();
      } catch (err) {
        toast.error('Remove failed: ' + err.message);
      }
    },
    'Remove'
  );
};

// ── Document auto-rename on batch change ────────────────────
async function renameDocumentsForBatch(student, batchCode) {
  const { data: docs } = await supabase.from('registration_documents').select('*').eq('student_id', student.id);
  if (!docs?.length) return;

  const folder = student.ma_foi_id || `bajaj/${student.id.replace(/-/g,'').slice(0,8).toUpperCase()}`;
  const STORAGE_BUCKET = 'documents';

  for (const doc of docs) {
    const ext = doc.file_name.slice(doc.file_name.lastIndexOf('.'));
    const newName = student.ma_foi_id
      ? `${student.ma_foi_id}_${batchCode}_${doc.doc_label}_${student.full_name}${ext}`
      : `${batchCode}_${doc.doc_label}_${student.full_name}${ext}`;
    const oldPath = doc.storage_path;
    const newPath = `${folder}/${newName}`;
    if (oldPath === newPath) continue;

    try {
      const { data: fileData } = await supabase.storage.from(STORAGE_BUCKET).download(oldPath);
      if (!fileData) continue;
      const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(newPath, fileData, { upsert: true, contentType: fileData.type });
      if (upErr) { console.warn('Rename upload failed:', upErr); continue; }
      const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(newPath);
      await supabase.from('registration_documents').update({ file_name: newName, storage_path: newPath, public_url: publicUrl }).eq('id', doc.id);
      await supabase.storage.from(STORAGE_BUCKET).remove([oldPath]);
    } catch (e) {
      console.warn('[Admin] Document rename failed (non-fatal):', e);
    }
  }
}

// ════════════════════════════════════════════════════════════
// BATCH MANAGEMENT
// ════════════════════════════════════════════════════════════

document.getElementById('batch-search').addEventListener('input', e => {
  batchSearch = e.target.value.toLowerCase();
  renderBatches();
});

function renderBatches() {
  let rows = allBatches;
  if (batchSearch) rows = rows.filter(b => b.batch_code.toLowerCase().includes(batchSearch) || (b.program_name||'').toLowerCase().includes(batchSearch));

  const tbody = document.getElementById('batches-tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="tbl-empty">No batches found. Click "Create Batch" to add one.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(b => {
    const statusBadge = {
      upcoming:  'badge-blue', active: 'badge-green', completed: 'badge-gray', cancelled: 'badge-red'
    }[b.status] || 'badge-gray';
    const capPct = b.capacity ? Math.round((b.total_students / b.capacity) * 100) : null;
    return `
    <tr>
      <td style="font-weight:600">${esc(b.batch_code)}</td>
      <td><span class="badge ${b.project_code==='nasscom'?'badge-blue':'badge-amber'}">${esc(b.project_name)}</span></td>
      <td>${esc(b.program_name)}</td>
      <td>${esc(b.location_name)}</td>
      <td><span class="badge ${statusBadge}">${esc(b.status)}</span></td>
      <td><span class="badge badge-purple">${b.total_students||0} students</span></td>
      <td style="font-size:12px;color:var(--text-secondary)">${b.capacity ? `${b.total_students||0}/${b.capacity}${capPct!=null?` (${capPct}%)`:''}` : '—'}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="tbl-btn" onclick='openBatchDetail("${b.batch_id}")'>View</button>
        <button class="tbl-btn" onclick='openEditBatch("${b.batch_id}")'>Edit</button>
        <button class="tbl-btn tbl-btn--danger" onclick='confirmDeleteBatch("${b.batch_id}")'>Delete</button>
      </td>
    </tr>`;
  }).join('');
}

// ── Create / Edit Batch Modal ────────────────────────────────
function populateProjectDropdown() {
  const sel = document.getElementById('nb-project');
  sel.innerHTML = '<option value="">Select Project</option>' +
    allProjects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
}

document.getElementById('nb-project').addEventListener('change', () => {
  const projectId = document.getElementById('nb-project').value;
  const progSel = document.getElementById('nb-program');
  const locSel  = document.getElementById('nb-location');
  if (!projectId) {
    progSel.disabled = true; progSel.innerHTML = '<option value="">Select project first</option>';
    locSel.disabled = true;  locSel.innerHTML  = '<option value="">Select project first</option>';
    return;
  }
  const programs  = allPrograms.filter(p => p.project_id === projectId);
  const locations = allLocations.filter(l => l.project_id === projectId);
  progSel.disabled = false;
  progSel.innerHTML = '<option value="">Select Program</option>' + programs.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  locSel.disabled = false;
  locSel.innerHTML = '<option value="">Select Location</option>' + locations.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
});

document.getElementById('btn-create-batch').addEventListener('click', () => {
  document.getElementById('batch-modal-title').textContent = 'Create New Batch';
  document.getElementById('btn-save-batch').textContent = 'Create Batch';
  document.getElementById('nb-id').value = '';
  ['nb-code','nb-name','nb-center','nb-capacity','nb-start','nb-end','nb-trainer','nb-notes'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('nb-status').value = 'upcoming';
  populateProjectDropdown();
  document.getElementById('nb-project').value = '';
  document.getElementById('nb-program').disabled = true;
  document.getElementById('nb-program').innerHTML = '<option value="">Select project first</option>';
  document.getElementById('nb-location').disabled = true;
  document.getElementById('nb-location').innerHTML = '<option value="">Select project first</option>';
  ['nb-project-error','nb-program-error','nb-location-error','nb-code-error'].forEach(id => { document.getElementById(id).textContent = ''; });
  openModal('modal-batch');
});

window.openEditBatch = (batchId) => {
  const b = allBatches.find(x => x.id === batchId || x.batch_id === batchId);
  if (!b) return;
  document.getElementById('batch-modal-title').textContent = 'Edit Batch';
  document.getElementById('btn-save-batch').textContent = 'Save Changes';
  document.getElementById('nb-id').value = b.batch_id || b.id;
  document.getElementById('nb-code').value = b.batch_code || '';
  document.getElementById('nb-name').value = b.batch_name || '';
  document.getElementById('nb-center').value = b.center_name || '';
  document.getElementById('nb-capacity').value = b.capacity || '';
  document.getElementById('nb-status').value = b.status || 'upcoming';
  document.getElementById('nb-start').value = b.start_date || '';
  document.getElementById('nb-end').value = b.end_date || '';
  document.getElementById('nb-trainer').value = b.trainer_name || '';
  document.getElementById('nb-notes').value = b.notes || '';

  populateProjectDropdown();
  const project = allProjects.find(p => p.code === b.project_code);
  if (project) {
    document.getElementById('nb-project').value = project.id;
    const programs  = allPrograms.filter(p => p.project_id === project.id);
    const locations = allLocations.filter(l => l.project_id === project.id);
    const progSel = document.getElementById('nb-program');
    progSel.disabled = false;
    progSel.innerHTML = '<option value="">Select Program</option>' + programs.map(p => `<option value="${p.id}" ${p.name===b.program_name?'selected':''}>${esc(p.name)}</option>`).join('');
    const locSel = document.getElementById('nb-location');
    locSel.disabled = false;
    locSel.innerHTML = '<option value="">Select Location</option>' + locations.map(l => `<option value="${l.id}" ${l.name===b.location_name?'selected':''}>${esc(l.name)}</option>`).join('');
  }
  ['nb-project-error','nb-program-error','nb-location-error','nb-code-error'].forEach(id => { document.getElementById(id).textContent = ''; });
  openModal('modal-batch');
};

document.getElementById('btn-save-batch').addEventListener('click', async () => {
  const id        = document.getElementById('nb-id').value;
  const projectId = document.getElementById('nb-project').value;
  const programId = document.getElementById('nb-program').value;
  const locationId = document.getElementById('nb-location').value;
  const code      = document.getElementById('nb-code').value.trim();

  let ok = true;
  const setE = (eid, msg) => { document.getElementById(eid).textContent = msg; if (msg) ok = false; };
  setE('nb-project-error',  !projectId  ? 'Project is required.'  : '');
  setE('nb-program-error',  !programId  ? 'Program is required.'  : '');
  setE('nb-location-error', !locationId ? 'Location is required.' : '');
  setE('nb-code-error',     !code       ? 'Batch code is required.' : '');
  if (!ok) return;

  const payload = {
    project_id: projectId, program_id: programId, location_id: locationId,
    batch_code: code,
    batch_name: document.getElementById('nb-name').value.trim() || null,
    center_name: document.getElementById('nb-center').value.trim() || null,
    capacity: document.getElementById('nb-capacity').value ? parseInt(document.getElementById('nb-capacity').value) : null,
    status: document.getElementById('nb-status').value,
    start_date: document.getElementById('nb-start').value || null,
    end_date: document.getElementById('nb-end').value || null,
    trainer_name: document.getElementById('nb-trainer').value.trim() || null,
    notes: document.getElementById('nb-notes').value.trim() || null,
  };

  const btn = document.getElementById('btn-save-batch');
  btn.disabled = true; btn.textContent = id ? 'Saving…' : 'Creating…';

  try {
    if (id) {
      const { error } = await supabase.from(TABLE_BATCHES).update(payload).eq('id', id);
      if (error) throw error;
      await logAudit('batch_edit', 'batch', id, { batch_code: code });
      toast.success(`Batch "${code}" updated`);
    } else {
      const { error } = await supabase.from(TABLE_BATCHES).insert([payload]);
      if (error) throw error;
      await logAudit('batch_create', 'batch', null, { batch_code: code });
      toast.success(`Batch "${code}" created`);
    }
    closeModal('modal-batch');
    await loadBatches();
    await loadDashboardStats();
    renderBatches();
  } catch (err) {
    toast.error('Save failed: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = id ? 'Save Changes' : 'Create Batch';
  }
});

// ── Delete Batch ──────────────────────────────────────────────
window.confirmDeleteBatch = (batchId) => {
  const b = allBatches.find(x => x.batch_id === batchId || x.id === batchId);
  if (!b) return;
  if (b.total_students > 0) {
    toast.warning(`Cannot delete "${b.batch_code}" — ${b.total_students} student(s) still assigned. Remove or move them first.`);
    return;
  }
  showConfirm(
    'Delete Batch',
    `Are you sure you want to permanently delete batch <strong>${esc(b.batch_code)}</strong>? This cannot be undone.`,
    async () => {
      try {
        const { error } = await supabase.from(TABLE_BATCHES).delete().eq('id', b.batch_id || b.id);
        if (error) throw error;
        await logAudit('batch_delete', 'batch', b.batch_id || b.id, { batch_code: b.batch_code });
        toast.success(`Batch "${b.batch_code}" deleted`);
        await loadBatches();
        await loadDashboardStats();
        renderBatches();
      } catch (err) {
        toast.error('Delete failed: ' + err.message);
      }
    }
  );
};

// ── Batch Detail Modal (view students, add/remove, export) ────
let currentBatchDetail = null;

window.openBatchDetail = async (batchId) => {
  const b = allBatches.find(x => x.batch_id === batchId || x.id === batchId);
  if (!b) return;
  currentBatchDetail = b;
  document.getElementById('bd-title').textContent = b.batch_code;
  document.getElementById('bd-subtitle').textContent = `${b.project_name} · ${b.program_name} · ${b.location_name}`;
  openModal('modal-batch-detail');
  await refreshBatchDetail();
};

async function refreshBatchDetail() {
  if (!currentBatchDetail) return;
  const b = currentBatchDetail;
  const batchId = b.batch_id || b.id;
  const inBatch = allStudents.filter(s => s.batch_id === batchId);
  const placedCount = inBatch.filter(s => s.placement_status === 'placed').length;

  document.getElementById('bd-stats').innerHTML = `
    <div class="badge badge-purple">${inBatch.length} Total</div>
    <div class="badge badge-green">${placedCount} Placed</div>
    <div class="badge ${b.capacity ? 'badge-blue' : 'badge-gray'}">${b.capacity ? `Capacity: ${inBatch.length}/${b.capacity}` : 'No capacity set'}</div>`;

  const listEl = document.getElementById('bd-student-list');
  if (!inBatch.length) {
    listEl.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:8px 0">No students assigned to this batch yet.</div>';
  } else {
    listEl.innerHTML = inBatch.map(s => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;background:var(--bg);border-radius:var(--r-md);border:1px solid var(--border)">
        <div style="min-width:0">
          <div style="font-size:13.5px;font-weight:600;color:var(--text)">${esc(s.full_name)}</div>
          <div style="font-size:12px;color:var(--text-muted)">${s.ma_foi_id||s.phone} · ${esc(s.program_name)}</div>
        </div>
        <button class="tbl-btn tbl-btn--danger" style="flex-shrink:0" onclick='removeFromBatchInDetail("${s.id}")'>Remove</button>
      </div>`).join('');
  }

  const notInBatch = allStudents.filter(s => s.project_code === b.project_code && s.batch_id !== batchId);
  const addSel = document.getElementById('bd-add-select');
  addSel.innerHTML = '<option value="">Select a student to add…</option>' +
    notInBatch.map(s => `<option value="${s.id}">${esc(s.full_name)} (${s.ma_foi_id||s.phone})</option>`).join('');
}

window.removeFromBatchInDetail = async (studentId) => {
  const s = allStudents.find(x => x.id === studentId);
  if (!s || !currentBatchDetail) return;
  try {
    await supabase.from(TABLE_BATCH_ASSIGNMENTS).delete().eq('student_id', studentId);
    await supabase.from(TABLE_BATCH_HISTORY).insert([{
      student_id: studentId, from_batch_id: currentBatchDetail.batch_id || currentBatchDetail.id, to_batch_id: null,
      action: 'removed', performed_by: getAuthUsername(),
    }]);
    await supabase.from(TABLE_STUDENTS).update({ registration_status: 'registered' }).eq('id', studentId);
    toast.success(`${s.full_name} removed from batch`);
    await Promise.all([loadStudents(), loadBatches()]);
    await loadDashboardStats();
    renderStudents(); renderBatches();
    await refreshBatchDetail();
  } catch (err) {
    toast.error('Remove failed: ' + err.message);
  }
};

document.getElementById('btn-bd-add').addEventListener('click', async () => {
  const studentId = document.getElementById('bd-add-select').value;
  if (!studentId || !currentBatchDetail) { toast.error('Please select a student to add.'); return; }
  const student = allStudents.find(s => s.id === studentId);
  const batchId = currentBatchDetail.batch_id || currentBatchDetail.id;

  const btn = document.getElementById('btn-bd-add');
  btn.disabled = true; btn.textContent = 'Adding…';

  try {
    await supabase.from(TABLE_BATCH_ASSIGNMENTS).delete().eq('student_id', studentId);
    const { error } = await supabase.from(TABLE_BATCH_ASSIGNMENTS).insert([{ student_id: studentId, batch_id: batchId }]);
    if (error) throw error;
    await supabase.from(TABLE_BATCH_HISTORY).insert([{
      student_id: studentId, from_batch_id: student.batch_id || null, to_batch_id: batchId,
      action: student.batch_id ? 'reassigned' : 'assigned', performed_by: getAuthUsername(),
    }]);
    await supabase.from(TABLE_STUDENTS).update({ registration_status: 'batch_assigned' }).eq('id', studentId);
    await renameDocumentsForBatch(student, currentBatchDetail.batch_code);

    toast.success(`${student.full_name} added to ${currentBatchDetail.batch_code}`);
    await Promise.all([loadStudents(), loadBatches()]);
    await loadDashboardStats();
    renderStudents(); renderBatches();
    await refreshBatchDetail();
  } catch (err) {
    toast.error('Add failed: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Add';
  }
});

document.getElementById('btn-export-batch').addEventListener('click', () => {
  if (!currentBatchDetail) return;
  const batchId = currentBatchDetail.batch_id || currentBatchDetail.id;
  const inBatch = allStudents.filter(s => s.batch_id === batchId);
  if (!inBatch.length) { toast.warning('No students to export.'); return; }

  const headers = ['Ma Foi ID','Full Name','Email','Phone','Project','Program','Location','Registration Status','Placement Status'];
  const rows = inBatch.map(s => [
    s.ma_foi_id || '', s.full_name, s.email, s.phone, s.project_name, s.program_name, s.location_name,
    s.registration_status, s.placement_status,
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `${currentBatchDetail.batch_code}_students.csv` });
  a.click();
  URL.revokeObjectURL(url);
  toast.success('Batch student list exported');
});

// ════════════════════════════════════════════════════════════
// SHARED MODAL / CONFIRM HELPERS
// ════════════════════════════════════════════════════════════

window.closeModal = (id) => { document.getElementById(id).classList.remove('show'); };
function openModal(id) { document.getElementById(id).classList.add('show'); }
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
});

let confirmCallback = null;
function showConfirm(title, message, onConfirm, actionLabel = 'Delete') {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').innerHTML = message;
  document.getElementById('btn-confirm-action').textContent = actionLabel;
  confirmCallback = onConfirm;
  openModal('modal-confirm');
}
document.getElementById('btn-confirm-action').addEventListener('click', async () => {
  if (confirmCallback) {
    const btn = document.getElementById('btn-confirm-action');
    btn.disabled = true;
    await confirmCallback();
    btn.disabled = false;
  }
  closeModal('modal-confirm');
});

// ════════════════════════════════════════════════════════════
// AUDIT LOG
// ════════════════════════════════════════════════════════════

async function logAudit(action, entityType, entityId, details) {
  try {
    await supabase.from('audit_logs').insert([{
      admin_username: getAuthUsername(), action, entity_type: entityType,
      entity_id: entityId, details,
    }]);
  } catch (e) {
    console.warn('[Admin] Audit log failed (non-fatal):', e);
  }
}

// ════════════════════════════════════════════════════════════
// PLACEMENT MANAGEMENT
// ════════════════════════════════════════════════════════════

let placementFilter = { status: 'all', search: '' };

document.querySelectorAll('.tab-btn[data-placement-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn[data-placement-tab]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    placementFilter.status = btn.dataset.placementTab;
    renderPlacements();
  });
});
document.getElementById('placement-search').addEventListener('input', e => {
  placementFilter.search = e.target.value.toLowerCase();
  renderPlacements();
});

function populatePlacementStudentDropdown() {
  const sel = document.getElementById('pl-student');
  sel.innerHTML = '<option value="">Select Student…</option>' +
    allStudents.map(s => `<option value="${s.id}">${esc(s.full_name)} (${s.ma_foi_id || s.phone}) — ${esc(s.project_name)}</option>`).join('');
}

function getFilteredPlacements() {
  let rows = allPlacements;
  if (placementFilter.status !== 'all') rows = rows.filter(p => p.placement_status === placementFilter.status);
  if (placementFilter.search) {
    const q = placementFilter.search;
    rows = rows.filter(p => (p.student_name||'').toLowerCase().includes(q) || (p.company||'').toLowerCase().includes(q));
  }
  return rows;
}

function renderPlacements() {
  const rows = getFilteredPlacements();
  const tbody = document.getElementById('placements-tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="tbl-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
      No placement records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(p => {
    const statusBadge = { active: 'badge-green', resigned: 'badge-amber', terminated: 'badge-red', absconded: 'badge-red' }[p.placement_status] || 'badge-gray';
    const jdocCount = placementJDocCount(p.id);
    const payCount  = placementPayslipCount(p.id);
    return `
    <tr>
      <td style="font-weight:500">${esc(p.student_name)}</td>
      <td>${p.batch_code ? `<span class="badge badge-green">${esc(p.batch_code)}</span>` : '<span class="badge badge-gray">—</span>'}</td>
      <td style="font-weight:500">${esc(p.company)}</td>
      <td>${esc(p.designation)||'—'}</td>
      <td>${p.salary ? '₹'+Number(p.salary).toLocaleString('en-IN') : '—'}</td>
      <td style="font-size:12px;color:var(--text-secondary)">${p.date_of_joining||'—'}</td>
      <td><span class="badge ${statusBadge}">${esc(p.placement_status)}</span></td>
      <td><button class="tbl-btn" onclick='openJoiningDocs("${p.id}")'>${jdocCount}/3</button></td>
      <td><button class="tbl-btn" onclick='openPayslips("${p.id}")'>${payCount}/3</button></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="tbl-btn" onclick='openEditPlacement("${p.id}")'>Edit</button>
        <button class="tbl-btn tbl-btn--danger" onclick='confirmDeletePlacement("${p.id}")'>Delete</button>
      </td>
    </tr>`;
  }).join('');
}

let jdocCountCache = {};
let payCountCache  = {};
function placementJDocCount(placementId) { return jdocCountCache[placementId] ?? 0; }
function placementPayslipCount(placementId) { return payCountCache[placementId] ?? 0; }

async function refreshPlacementDocCounts() {
  const { data: jdocs } = await supabase.from(TABLE_PLACEMENT_DOCS).select('placement_id');
  jdocCountCache = {};
  (jdocs || []).forEach(d => { jdocCountCache[d.placement_id] = (jdocCountCache[d.placement_id] || 0) + 1; });

  const { data: pays } = await supabase.from(TABLE_PAYSLIPS).select('placement_id');
  payCountCache = {};
  (pays || []).forEach(d => { payCountCache[d.placement_id] = (payCountCache[d.placement_id] || 0) + 1; });
}

// ── Add / Edit Placement ────────────────────────────────────────
document.getElementById('btn-add-placement').addEventListener('click', () => {
  document.getElementById('placement-modal-title').textContent = 'Add Placement Record';
  document.getElementById('btn-save-placement').textContent = 'Save Placement';
  document.getElementById('pl-id').value = '';
  ['pl-company','pl-designation','pl-salary','pl-ctc','pl-doj','pl-offer-date','pl-probation','pl-feedback'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('pl-student').value = '';
  document.getElementById('pl-student').disabled = false;
  document.getElementById('pl-status').value = 'active';
  document.getElementById('pl-student-error').textContent = '';
  document.getElementById('pl-company-error').textContent = '';
  openModal('modal-placement');
});

window.openEditPlacement = (placementId) => {
  const p = allPlacements.find(x => x.id === placementId);
  if (!p) return;
  document.getElementById('placement-modal-title').textContent = 'Edit Placement Record';
  document.getElementById('btn-save-placement').textContent = 'Save Changes';
  document.getElementById('pl-id').value = p.id;
  document.getElementById('pl-student').value = p.student_id;
  document.getElementById('pl-student').disabled = true; // student can't change after creation
  document.getElementById('pl-company').value = p.company || '';
  document.getElementById('pl-designation').value = p.designation || '';
  document.getElementById('pl-salary').value = p.salary || '';
  document.getElementById('pl-ctc').value = p.ctc_annual || '';
  document.getElementById('pl-doj').value = p.date_of_joining || '';
  document.getElementById('pl-offer-date').value = p.offer_letter_date || '';
  document.getElementById('pl-probation').value = p.probation_period || '';
  document.getElementById('pl-status').value = p.placement_status || 'active';
  document.getElementById('pl-feedback').value = p.feedback || '';
  document.getElementById('pl-student-error').textContent = '';
  document.getElementById('pl-company-error').textContent = '';
  openModal('modal-placement');
};

document.getElementById('btn-save-placement').addEventListener('click', async () => {
  const id        = document.getElementById('pl-id').value;
  const studentId = document.getElementById('pl-student').value;
  const company   = document.getElementById('pl-company').value.trim();

  let ok = true;
  const setE = (eid, msg) => { document.getElementById(eid).textContent = msg; if (msg) ok = false; };
  setE('pl-student-error', !studentId ? 'Please select a student.' : '');
  setE('pl-company-error', !company   ? 'Company name is required.' : '');
  if (!ok) return;

  const btn = document.getElementById('btn-save-placement');
  btn.disabled = true; btn.textContent = id ? 'Saving…' : 'Saving…';

  try {
    if (id) {
      const { error } = await supabase.from(TABLE_PLACEMENTS).update({
        company,
        designation: document.getElementById('pl-designation').value.trim() || null,
        salary: document.getElementById('pl-salary').value || null,
        ctc_annual: document.getElementById('pl-ctc').value || null,
        date_of_joining: document.getElementById('pl-doj').value || null,
        offer_letter_date: document.getElementById('pl-offer-date').value || null,
        probation_period: document.getElementById('pl-probation').value.trim() || null,
        placement_status: document.getElementById('pl-status').value,
        feedback: document.getElementById('pl-feedback').value.trim() || null,
      }).eq('id', id);
      if (error) throw error;
      await logAudit('placement_edit', 'placement', id, { company });
      toast.success('Placement updated');
    } else {
      const student = allStudents.find(s => s.id === studentId);
      if (!student) throw new Error('Selected student not found.');

      const { error } = await supabase.from(TABLE_PLACEMENTS).insert([{
        student_id: studentId,
        batch_id: student.batch_id || null,
        student_name: student.full_name,
        phone: student.phone,
        email: student.email,
        program_name: student.program_name,
        location_name: student.location_name,
        company,
        designation: document.getElementById('pl-designation').value.trim() || null,
        salary: document.getElementById('pl-salary').value || null,
        ctc_annual: document.getElementById('pl-ctc').value || null,
        date_of_joining: document.getElementById('pl-doj').value || null,
        offer_letter_date: document.getElementById('pl-offer-date').value || null,
        probation_period: document.getElementById('pl-probation').value.trim() || null,
        placement_status: document.getElementById('pl-status').value,
        feedback: document.getElementById('pl-feedback').value.trim() || null,
      }]);
      if (error) throw error;

      await supabase.from(TABLE_STUDENTS).update({ placement_status: 'placed', registration_status: 'placed' }).eq('id', studentId);
      await logAudit('placement_create', 'placement', null, { student: student.full_name, company });
      toast.success(`Placement recorded for ${student.full_name}`);
    }

    closeModal('modal-placement');
    await Promise.all([loadPlacements(), loadStudents()]);
    await refreshPlacementDocCounts();
    await loadDashboardStats();
    renderPlacements(); renderStudents();
  } catch (err) {
    toast.error('Save failed: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = id ? 'Save Changes' : 'Save Placement';
  }
});

window.confirmDeletePlacement = (placementId) => {
  const p = allPlacements.find(x => x.id === placementId);
  if (!p) return;
  showConfirm(
    'Delete Placement',
    `Delete the placement record for <strong>${esc(p.student_name)}</strong> at <strong>${esc(p.company)}</strong>? All joining documents and payslips for this placement will also be deleted.`,
    async () => {
      try {
        const { error } = await supabase.from(TABLE_PLACEMENTS).delete().eq('id', placementId);
        if (error) throw error;
        await logAudit('placement_delete', 'placement', placementId, { student: p.student_name, company: p.company });
        toast.success('Placement record deleted');
        await loadPlacements();
        await refreshPlacementDocCounts();
        await loadDashboardStats();
        renderPlacements();
      } catch (err) {
        toast.error('Delete failed: ' + err.message);
      }
    }
  );
};

// ── Joining Documents ───────────────────────────────────────────
const JD_TYPES = [
  { type: 'offer_letter',       label: 'Offer Letter' },
  { type: 'email_confirmation', label: 'Email Confirmation' },
  { type: 'id_card',            label: 'Employee ID Card' },
];

let currentJDPlacement = null;

window.openJoiningDocs = async (placementId) => {
  const p = allPlacements.find(x => x.id === placementId);
  if (!p) return;
  currentJDPlacement = p;
  document.getElementById('jdocs-subtitle').textContent = `${p.student_name} · ${p.company}`;
  openModal('modal-jdocs');
  await refreshJoiningDocs();
};

async function refreshJoiningDocs() {
  if (!currentJDPlacement) return;
  const p = currentJDPlacement;
  const { data: docs } = await supabase.from(TABLE_PLACEMENT_DOCS).select('*').eq('placement_id', p.id);
  const docMap = {};
  (docs || []).forEach(d => { docMap[d.doc_type] = d; });

  document.getElementById('jdocs-body').innerHTML = JD_TYPES.map(jt => {
    const existing = docMap[jt.type];
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:13.5px;font-weight:600;color:var(--text)">${jt.label}</div>
        ${existing ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">✓ ${esc(existing.file_name)}</div>` : '<div style="font-size:12px;color:var(--text-muted)">Not uploaded</div>'}
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${existing ? `<a href="${existing.public_url}" target="_blank" rel="noopener" class="tbl-btn">View</a>` : ''}
        <label class="tbl-btn tbl-btn--primary" style="cursor:pointer">
          ${existing ? 'Replace' : 'Upload'}
          <input type="file" style="display:none" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onchange="window.__uploadJoinDoc(this,'${p.id}','${jt.type}','${jt.label}')">
        </label>
      </div>
    </div>`;
  }).join('');
}

window.__uploadJoinDoc = async (input, placementId, docType, docLabel) => {
  const file = input.files?.[0];
  if (!file) return;
  const p = allPlacements.find(x => x.id === placementId);
  if (!p) return;

  // Resolve batch code + ma_foi_id for naming (Nasscom only gets a Ma Foi ID prefix)
  const student = allStudents.find(s => s.id === p.student_id);
  const batchCode = p.batch_code || 'NoBatch';
  const ext = file.name.slice(file.name.lastIndexOf('.'));
  const fileName = student?.ma_foi_id
    ? `${student.ma_foi_id}_${batchCode}_${docLabel}_${p.student_name}_${p.company}${ext}`
    : `${batchCode}_${docLabel}_${p.student_name}_${p.company}${ext}`;
  const path = `placements/${placementId}/${fileName}`;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true, contentType: file.type });
  if (error) { toast.error('Upload failed: ' + error.message); return; }
  const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  await supabase.from(TABLE_PLACEMENT_DOCS).upsert(
    { placement_id: placementId, doc_type: docType, file_name: fileName, storage_path: path, public_url: publicUrl },
    { onConflict: 'placement_id,doc_type' }
  );
  toast.success(`${docLabel} uploaded`);
  await refreshJoiningDocs();
  await refreshPlacementDocCounts();
  renderPlacements();
};

// ── Payslips ─────────────────────────────────────────────────────
let currentPayslipPlacement = null;

window.openPayslips = async (placementId) => {
  const p = allPlacements.find(x => x.id === placementId);
  if (!p) return;
  currentPayslipPlacement = p;
  document.getElementById('payslips-subtitle').textContent = `${p.student_name} · ${p.company}`;
  openModal('modal-payslips');
  await refreshPayslips();
};

async function refreshPayslips() {
  if (!currentPayslipPlacement) return;
  const p = currentPayslipPlacement;
  const { data: slips } = await supabase.from(TABLE_PAYSLIPS).select('*').eq('placement_id', p.id);
  const slipMap = {};
  (slips || []).forEach(s => { slipMap[s.month_number] = s; });

  document.getElementById('payslips-body').innerHTML = [1, 2, 3].map(m => {
    const existing = slipMap[m];
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:13.5px;font-weight:600;color:var(--text)">Month ${m} Payslip</div>
        ${existing ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">✓ ${esc(existing.file_name)}</div>` : '<div style="font-size:12px;color:var(--text-muted)">Not uploaded</div>'}
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${existing ? `<a href="${existing.public_url}" target="_blank" rel="noopener" class="tbl-btn">View</a>` : ''}
        <label class="tbl-btn tbl-btn--primary" style="cursor:pointer">
          ${existing ? 'Replace' : 'Upload'}
          <input type="file" style="display:none" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onchange="window.__uploadPayslip(this,'${p.id}',${m})">
        </label>
      </div>
    </div>`;
  }).join('');
}

window.__uploadPayslip = async (input, placementId, month) => {
  const file = input.files?.[0];
  if (!file) return;
  const p = allPlacements.find(x => x.id === placementId);
  if (!p) return;
  const student = allStudents.find(s => s.id === p.student_id);
  const batchCode = p.batch_code || 'NoBatch';
  const ext = file.name.slice(file.name.lastIndexOf('.'));
  const fileName = student?.ma_foi_id
    ? `${student.ma_foi_id}_${batchCode}_Payslip(M${month})_${p.student_name}_${p.company}${ext}`
    : `${batchCode}_Payslip(M${month})_${p.student_name}_${p.company}${ext}`;
  const path = `payslips/${placementId}/M${month}_${fileName}`;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true, contentType: file.type });
  if (error) { toast.error('Upload failed: ' + error.message); return; }
  const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  await supabase.from(TABLE_PAYSLIPS).upsert(
    { placement_id: placementId, month_number: month, file_name: fileName, storage_path: path, public_url: publicUrl },
    { onConflict: 'placement_id,month_number' }
  );
  toast.success(`Month ${month} payslip uploaded`);
  await refreshPayslips();
  await refreshPlacementDocCounts();
  renderPlacements();
};

// ════════════════════════════════════════════════════════════
// DOCUMENT MANAGEMENT
// ════════════════════════════════════════════════════════════

let docFilter = { kind: 'all', project: '', search: '' };
let docPage = 1;
const DOC_PAGE_SIZE = 25;

document.querySelectorAll('.tab-btn[data-doc-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn[data-doc-tab]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    docFilter.kind = btn.dataset.docTab;
    docPage = 1;
    renderDocuments();
  });
});
document.getElementById('doc-filter-project').addEventListener('change', e => {
  docFilter.project = e.target.value; docPage = 1; renderDocuments();
});
document.getElementById('doc-search').addEventListener('input', e => {
  docFilter.search = e.target.value.toLowerCase(); docPage = 1; renderDocuments();
});

function getFilteredDocuments() {
  let rows = allDocuments;
  if (docFilter.kind === 'registration') rows = rows.filter(d => d.kind === 'registration');
  else if (docFilter.kind === 'placement') rows = rows.filter(d => d.kind === 'placement');
  else if (docFilter.kind === 'payslip')   rows = rows.filter(d => d.kind === 'payslip');
  else if (docFilter.kind === 'unverified') rows = rows.filter(d => d.kind === 'registration' && !d.verified);

  if (docFilter.project) rows = rows.filter(d => d.projectCode === docFilter.project);
  if (docFilter.search) {
    const q = docFilter.search;
    rows = rows.filter(d => (d.studentName||'').toLowerCase().includes(q) || (d.fileName||'').toLowerCase().includes(q));
  }
  return rows;
}

function renderDocuments() {
  const titles = { all: 'All Documents', registration: 'Registration Documents', placement: 'Joining Documents', payslip: 'Payslips', unverified: 'Unverified Documents' };
  document.getElementById('docs-tbl-title').textContent = titles[docFilter.kind] || 'All Documents';

  const rows = getFilteredDocuments();
  const total = rows.length;
  const start = (docPage - 1) * DOC_PAGE_SIZE;
  const page = rows.slice(start, start + DOC_PAGE_SIZE);

  const tbody = document.getElementById('documents-tbody');
  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="tbl-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      No documents found.</td></tr>`;
  } else {
    const kindBadge = { registration: 'badge-blue', placement: 'badge-amber', payslip: 'badge-purple' };
    tbody.innerHTML = page.map(d => `
      <tr>
        <td style="font-weight:500">${esc(d.studentName)}${d.maFoiId ? ` <span style="color:var(--text-muted);font-weight:400;font-size:11px">(${esc(d.maFoiId)})</span>` : ''}</td>
        <td>${esc(d.docLabel)}</td>
        <td><span class="badge ${kindBadge[d.kind]||'badge-gray'}">${d.kind}</span></td>
        <td style="font-size:12px;color:var(--text-secondary);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(d.fileName)}">${esc(d.fileName)}</td>
        <td style="font-size:12px;color:var(--text-secondary)">${fmtDate(d.uploadedAt)}</td>
        <td>${d.kind === 'registration' ? (d.verified ? '<span class="badge badge-green">✓ Verified</span>' : '<span class="badge badge-gray">Unverified</span>') : '<span style="color:var(--text-muted);font-size:12px">N/A</span>'}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="tbl-btn" onclick="window.__openDocPreviewByIndex(${start + page.indexOf(d)})">View</button>
          <a href="${d.publicUrl}" download="${esc(d.fileName)}" class="tbl-btn" target="_blank" rel="noopener">Download</a>
        </td>
      </tr>`).join('');
  }

  const totalPages = Math.ceil(total / DOC_PAGE_SIZE);
  const pag = document.getElementById('documents-pagination');
  if (totalPages <= 1) {
    pag.innerHTML = `<span>Showing ${total} document${total===1?'':'s'}</span>`;
  } else {
    let btns = '';
    for (let i = 1; i <= totalPages; i++) btns += `<button class="page-btn ${i===docPage?'active':''}" onclick="window.__goDocPage(${i})">${i}</button>`;
    pag.innerHTML = `<span>Showing ${start+1}–${Math.min(start+DOC_PAGE_SIZE,total)} of ${total}</span><div class="page-btns">${btns}</div>`;
  }
}
window.__goDocPage = (n) => { docPage = n; renderDocuments(); };

window.__openDocPreviewByIndex = (globalIndex) => {
  const rows = getFilteredDocuments();
  const d = rows[globalIndex];
  if (!d) return;
  openDocPreview({
    id: d.id, kind: d.kind, studentName: d.studentName, docLabel: d.docLabel,
    fileName: d.fileName, publicUrl: d.publicUrl, verified: d.verified, sourceTable: d.sourceTable,
  });
};

// ── Document Preview / Verify / Delete ──────────────────────────
window.openDocPreview = (doc) => {
  const isImage = /\.(jpg|jpeg|png)$/i.test(doc.fileName);
  document.getElementById('doc-preview-body').innerHTML = `
    <div class="profile-row"><div class="profile-row__label">Student</div><div class="profile-row__val">${esc(doc.studentName)}</div></div>
    <div class="profile-row"><div class="profile-row__label">Document</div><div class="profile-row__val">${esc(doc.docLabel)}</div></div>
    <div class="profile-row"><div class="profile-row__label">File Name</div><div class="profile-row__val" style="word-break:break-all">${esc(doc.fileName)}</div></div>
    ${isImage ? `<div style="margin-top:14px;border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden"><img src="${doc.publicUrl}" style="width:100%;display:block" alt="${esc(doc.fileName)}"></div>` : `<div style="margin-top:14px;padding:24px;text-align:center;background:var(--bg);border-radius:var(--r-md);color:var(--text-muted);font-size:13px">PDF preview not shown inline — use View or Download.</div>`}
  `;

  const footEl = document.getElementById('doc-preview-foot');
  let footHtml = `<a href="${doc.publicUrl}" target="_blank" rel="noopener" class="btn btn-ghost">Open in New Tab</a>`;
  if (doc.kind === 'registration') {
    footHtml += doc.verified
      ? `<button class="btn btn-ghost" id="btn-unverify-doc">Mark Unverified</button>`
      : `<button class="btn btn-primary" id="btn-verify-doc">Mark Verified</button>`;
  }
  footHtml += `<button class="btn" id="btn-delete-doc" style="background:var(--danger);color:white;border-color:var(--danger)">Delete</button>`;
  footEl.innerHTML = footHtml;

  document.getElementById('btn-verify-doc')?.addEventListener('click', () => toggleDocVerified(doc.id, true));
  document.getElementById('btn-unverify-doc')?.addEventListener('click', () => toggleDocVerified(doc.id, false));
  document.getElementById('btn-delete-doc')?.addEventListener('click', () => confirmDeleteDocument(doc));

  openModal('modal-doc-preview');
};

async function toggleDocVerified(docId, verified) {
  try {
    const { error } = await supabase.from(TABLE_REGISTRATION_DOCS).update({
      verified, verified_at: verified ? new Date().toISOString() : null,
    }).eq('id', docId);
    if (error) throw error;
    await logAudit(verified ? 'document_verify' : 'document_unverify', 'document', docId, {});
    toast.success(verified ? 'Document marked as verified' : 'Document marked as unverified');
    closeModal('modal-doc-preview');
    await loadDocuments();
    renderDocuments();
  } catch (err) {
    toast.error('Update failed: ' + err.message);
  }
}

function confirmDeleteDocument(doc) {
  showConfirm(
    'Delete Document',
    `Delete <strong>${esc(doc.docLabel)}</strong> for <strong>${esc(doc.studentName)}</strong>? This permanently removes the file from storage.`,
    async () => {
      try {
        const { error } = await supabase.from(doc.sourceTable).delete().eq('id', doc.id);
        if (error) throw error;
        await logAudit('document_delete', 'document', doc.id, { fileName: doc.fileName });
        toast.success('Document deleted');
        closeModal('modal-doc-preview');
        await loadDocuments();
        await loadDashboardStats();
        renderDocuments();
      } catch (err) {
        toast.error('Delete failed: ' + err.message);
      }
    }
  );
}


function esc(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function maskAadhaar(n) { return (n && n.length === 12) ? 'XXXX XXXX ' + n.slice(8) : (n || '—'); }

// ════════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════════

if (isAuthenticated()) {
  showAdmin();
} else {
  usernameInput.focus();
}