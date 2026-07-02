'use strict';
import { supabase } from '../js/supabase.js';
import { toast }    from '../js/toast.js';
import {
    TABLE_STUDENTS, TABLE_BATCHES, TABLE_BATCH_ASSIGNMENTS, TABLE_BATCH_HISTORY,
    TABLE_PLACEMENTS, TABLE_PLACEMENT_DOCS, TABLE_PAYSLIPS,
    TABLE_REGISTRATION_DOCS, TABLE_CENTERS, TABLE_AUDIT_LOGS,
    VIEW_STUDENT_FULL, VIEW_BATCH_FULL, VIEW_DASHBOARD_STATS,
    PROJECT_NASSCOM, PROJECT_BAJAJ, STORAGE_BUCKET,
    buildRegDocFilename, buildBatchCode,
} from '../js/config.js';

// ══════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════
const CREDS = [
    { username:'admin',  password:'MaFoi@2024' },
    { username:'mafoi',  password:'Admin#123'  },
];
const SESSION_KEY = 'mafoi_admin_v5';

function isAuthed() {
    try {
        const s = JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
        if (!s) return false;
        if (Date.now() > s.expires) { sessionStorage.removeItem(SESSION_KEY); return false; }
        return s.token === btoa('mafoi_ok_v5');
    } catch { return false; }
}
function setAuthed(user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        token: btoa('mafoi_ok_v5'), expires: Date.now() + 8*3600*1000, user,
    }));
}
function getUser() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')?.user||'Admin'; }
    catch { return 'Admin'; }
}

const $ = id => document.getElementById(id);
const loginBtn = $('login-btn'), loginErr = $('login-error');
const usernameI = $('login-username'), passwordI = $('login-password');

function attemptLogin() {
    const u = usernameI.value.trim(), p = passwordI.value;
    loginErr.style.display = 'none';
    if (!u||!p) { loginErr.textContent='Enter username and password.'; loginErr.style.display=''; return; }
    loginBtn.disabled=true; loginBtn.textContent='Signing in\u2026';
    setTimeout(()=>{
        const match = CREDS.find(c=>c.username===u&&c.password===p);
        console.log('[Admin] Login attempt for:', u, '| match:', !!match);
        if(match){
            setAuthed(u);
            loginBtn.textContent='\u2713 Verified';
            setTimeout(()=>{ showAdmin(); }, 400);
        } else {
            loginErr.textContent='Invalid username or password.';
            loginErr.style.display='';
            passwordI.value='';
            loginBtn.disabled=false; loginBtn.textContent='Sign In';
        }
    }, 500);
}
loginBtn.addEventListener('click', attemptLogin);
[usernameI,passwordI].forEach(el=>el.addEventListener('keydown',e=>{ if(e.key==='Enter') attemptLogin(); }));
$('btn-logout').addEventListener('click',()=>{ sessionStorage.removeItem(SESSION_KEY); location.reload(); });

function showAdmin() {
    $('login-overlay').style.display='none';
    $('admin-wrap').classList.add('authenticated');
    $('admin-avatar').textContent = getUser().charAt(0).toUpperCase();
    console.log('[Admin] Calling bootDashboard()');
    bootDashboard().catch(err=>{
        console.error('[Admin] bootDashboard failed:', err);
        toast.error('Dashboard failed to load: '+(err.message||'Unknown error'));
    });
}

// ══════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════
let allStudents=[], allBatches=[], allPlacements=[], allCenters=[], allDocuments=[];
let allProjects=[], allPrograms=[], allLocations=[];
const jdocCounts={}, payCounts={};

// Panel navigation
const PANEL_TITLES = {
    dashboard:'Dashboard', students:'Students', batches:'Batches',
    centers:'Centers', placements:'Placements', documents:'Documents',
};
document.querySelectorAll('.nav-item[data-panel]').forEach(btn=>{
    btn.addEventListener('click',()=>{
        document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
        btn.classList.add('active');
        $('panel-'+btn.dataset.panel).classList.add('active');
        $('topbar-title').innerHTML = btn.querySelector('svg').outerHTML + PANEL_TITLES[btn.dataset.panel];
    });
});
$('sidebar-toggle').addEventListener('click',()=>{
    const sb=$('sidebar');
    sb.style.display = sb.style.display==='flex'?'none':'flex';
});
$('btn-refresh-stats').addEventListener('click',()=>loadDashboardStats().then(renderStats));

// Modal helpers
window.closeModal = id => $(id).classList.remove('show');
function openModal(id) { $(id).classList.add('show'); }

// Confirm dialog
let _confirmCb = null;
function showConfirm(title, msg, cb, label='Delete') {
    $('confirm-title').textContent = title;
    $('confirm-msg').innerHTML = msg;
    $('btn-confirm-action').textContent = label;
    $('btn-confirm-action').style.background = label==='Delete'?'var(--danger)':'var(--accent)';
    $('btn-confirm-action').style.borderColor = label==='Delete'?'var(--danger)':'var(--accent)';
    _confirmCb = cb;
    openModal('modal-confirm');
}
$('btn-confirm-action').addEventListener('click',()=>{ closeModal('modal-confirm'); if(_confirmCb) _confirmCb(); _confirmCb=null; });

function esc(s){const d=document.createElement('div');d.textContent=String(s??'');return d.innerHTML;}
function fmtDate(iso){if(!iso)return'\u2014';return new Date(iso).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});}

// Audit log
async function logAudit(action,entity,id,details){
    try{ await supabase.from(TABLE_AUDIT_LOGS).insert([{admin_username:getUser(),action,entity_type:entity,entity_id:id||null,details}]); }
    catch(e){ console.warn('[Audit]',e); }
}

// ══════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════
async function bootDashboard(){
    await loadLookups();
    await loadStudents();
    await Promise.all([loadBatches(), loadCenters(), loadPlacements()]);
    await loadDocuments();
    await loadDocCounts();
    await loadDashboardStats();
    populateFilters();
    renderStats();
    renderStudents();
    renderBatches();
    renderCenters();
    renderPlacements();
    renderDocuments();
    populatePlacementStudentDropdown();
}

async function loadLookups(){
    const [{data:proj},{data:prog},{data:loc}] = await Promise.all([
        supabase.from('projects').select('*'),
        supabase.from('programs').select('*'),
        supabase.from('locations').select('*'),
    ]);
    allProjects  = proj||[];
    allPrograms  = prog||[];
    allLocations = loc||[];
}

async function loadStudents(){
    const {data,error}=await supabase.from(VIEW_STUDENT_FULL).select('*').order('created_at',{ascending:false});
    if(error){console.error('[Admin] loadStudents:',error);return;}
    allStudents=data||[];
}
async function loadBatches(){
    const {data,error}=await supabase.from(VIEW_BATCH_FULL).select('*').order('created_at',{ascending:false});
    if(error){console.error('[Admin] loadBatches:',error);return;}
    allBatches=data||[];
}
async function loadCenters(){
    const {data,error}=await supabase.from(TABLE_CENTERS).select('*, projects(name,code), locations(name,code)').order('created_at',{ascending:false});
    if(error){console.error('[Admin] loadCenters:',error);return;}
    allCenters=(data||[]).map(c=>({...c,project_code:c.projects?.code,project_name:c.projects?.name,location_code:c.locations?.code,location_name:c.locations?.name}));
}
async function loadPlacements(){
    const {data,error}=await supabase.from(TABLE_PLACEMENTS).select('*').order('created_at',{ascending:false});
    if(error){console.error('[Admin] loadPlacements:',error);return;}
    allPlacements=data||[];
}
async function loadDocCounts(){
    const [{data:jd},{data:ps}]=await Promise.all([
        supabase.from(TABLE_PLACEMENT_DOCS).select('placement_id'),
        supabase.from(TABLE_PAYSLIPS).select('placement_id'),
    ]);
    (jd||[]).forEach(d=>{ jdocCounts[d.placement_id]=(jdocCounts[d.placement_id]||0)+1; });
    (ps||[]).forEach(d=>{ payCounts[d.placement_id]=(payCounts[d.placement_id]||0)+1; });
}
async function loadDocuments(){
    const studentMap=new Map(allStudents.map(s=>[s.id,s]));
    const [{data:regDocs},{data:jdocs},{data:pays}]=await Promise.all([
        supabase.from(TABLE_REGISTRATION_DOCS).select('*').order('uploaded_at',{ascending:false}),
        supabase.from(TABLE_PLACEMENT_DOCS).select('*,placements_v2(student_name,project_code)').order('uploaded_at',{ascending:false}),
        supabase.from(TABLE_PAYSLIPS).select('*,placements_v2(student_name,project_code)').order('uploaded_at',{ascending:false}),
    ]);
    const regRows=(regDocs||[]).map(d=>{const s=studentMap.get(d.student_id);return{kind:'registration',id:d.id,studentName:s?.full_name||'?',maFoiId:s?.ma_foi_id||null,projectCode:s?.project_code||null,label:d.doc_label,fileName:d.file_name,url:d.public_url,uploadedAt:d.uploaded_at,verified:d.verified,sourceTable:TABLE_REGISTRATION_DOCS};});
    const jdRows=(jdocs||[]).map(d=>({kind:'placement',id:d.id,studentName:d.placements_v2?.student_name||'?',maFoiId:null,projectCode:d.placements_v2?.project_code||null,label:d.doc_type.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),fileName:d.file_name,url:d.public_url,uploadedAt:d.uploaded_at,verified:null,sourceTable:TABLE_PLACEMENT_DOCS}));
    const psRows=(pays||[]).map(d=>({kind:'payslip',id:d.id,studentName:d.placements_v2?.student_name||'?',maFoiId:null,projectCode:d.placements_v2?.project_code||null,label:'Payslip M'+d.month_number,fileName:d.file_name,url:d.public_url,uploadedAt:d.uploaded_at,verified:null,sourceTable:TABLE_PAYSLIPS}));
    allDocuments=[...regRows,...jdRows,...psRows].sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt));
}

// ══════════════════════════════════════════════════════════
// DASHBOARD STATS
// ══════════════════════════════════════════════════════════
let dashStats={};
async function loadDashboardStats(){
    const {data,error}=await supabase.from(VIEW_DASHBOARD_STATS).select('*').single();
    if(error){console.error('[Admin] stats:',error);return;}
    dashStats=data||{};
}
function renderStats(){
    const cards=[
        {label:'Total Students', val:dashStats.total_students, bg:'#eff6ff',color:'#1d4ed8',icon:'<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>'},
        {label:'Nasscom',        val:dashStats.nasscom_students, bg:'#eff6ff',color:'#1d4ed8',icon:'<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>'},
        {label:'Bajaj FinServ',  val:dashStats.bajaj_students,  bg:'#fff7ed',color:'#b45309',icon:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>'},
        {label:'BFSI',           val:dashStats.bfsi_students,   bg:'#f0fdf4',color:'#16a34a',icon:'<path d="M12 2L2 7l10 5 10-5-10-5z"/>'},
        {label:'Data Analytics', val:dashStats.da_students,     bg:'#f0fdf4',color:'#16a34a',icon:'<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'},
        {label:'Gold Loan',      val:dashStats.gl_students,     bg:'#fefce8',color:'#a16207',icon:'<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>'},
        {label:'Microfinance',   val:dashStats.mfi_students,    bg:'#fefce8',color:'#a16207',icon:'<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'},
        {label:'Unassigned',     val:dashStats.unassigned_students, bg:'#fef2f2',color:'#b91c1c',icon:'<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>'},
        {label:'In Batches',     val:dashStats.assigned_students,   bg:'#f0fdf4',color:'#16a34a',icon:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>'},
        {label:'Placed',         val:dashStats.placed_students,     bg:'#f0fdf4',color:'#16a34a',icon:'<polyline points="20 6 9 17 4 12"/>'},
        {label:'Pending Placement',val:dashStats.pending_placement, bg:'#fef3c7',color:'#b45309',icon:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'},
        {label:'Reg Docs',       val:dashStats.reg_docs_uploaded,   bg:'#f5f3ff',color:'#7c3aed',icon:'<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>'},
        {label:'Verified Docs',  val:dashStats.reg_docs_verified,   bg:'#f0fdf4',color:'#16a34a',icon:'<polyline points="9 11 12 14 22 4"/>'},
        {label:'Payslips M1',    val:dashStats.m1_uploaded, bg:'#faf5ff',color:'#7c3aed',icon:'<rect x="2" y="3" width="20" height="14" rx="2"/>'},
        {label:'Payslips M2',    val:dashStats.m2_uploaded, bg:'#faf5ff',color:'#7c3aed',icon:'<rect x="2" y="3" width="20" height="14" rx="2"/>'},
        {label:'Payslips M3',    val:dashStats.m3_uploaded, bg:'#faf5ff',color:'#7c3aed',icon:'<rect x="2" y="3" width="20" height="14" rx="2"/>'},
        {label:'Total Batches',  val:dashStats.total_batches, bg:'#f0f9ff',color:'#0284c7',icon:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'},
    ];
    $('stats-grid').innerHTML=cards.map(c=>`
    <div class="stat-card">
      <div class="stat-card__top">
        <span class="stat-card__label">${c.label}</span>
        <div class="stat-card__icon" style="background:${c.bg};color:${c.color}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${c.icon}</svg>
        </div>
      </div>
      <div class="stat-card__val">${c.val??0}</div>
    </div>`).join('');
}

// ══════════════════════════════════════════════════════════
// STUDENTS
// ══════════════════════════════════════════════════════════
let studentFilter={tab:'all',program:'',location:'',search:''};
let studentPage=1; const STUDENT_PAGE=20;

function populateFilters(){ /* dropdowns already hardcoded in HTML */ }

document.querySelectorAll('.tab-btn[data-student-tab]').forEach(b=>{
    b.addEventListener('click',()=>{
        document.querySelectorAll('.tab-btn[data-student-tab]').forEach(x=>x.classList.remove('active'));
        b.classList.add('active'); studentFilter.tab=b.dataset.studentTab; studentPage=1; renderStudents();
    });
});
$('student-filter-program').addEventListener('change',e=>{studentFilter.program=e.target.value;studentPage=1;renderStudents();});
$('student-filter-location').addEventListener('change',e=>{studentFilter.location=e.target.value;studentPage=1;renderStudents();});
$('student-search').addEventListener('input',e=>{studentFilter.search=e.target.value.toLowerCase();studentPage=1;renderStudents();});

// Global search in topbar
$('global-search').addEventListener('input',e=>{
    const q=e.target.value.toLowerCase();
    if(!q.trim()){renderStudents();return;}
    // Switch to students panel
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    document.querySelector('.nav-item[data-panel="students"]').classList.add('active');
    $('panel-students').classList.add('active');
    studentFilter.search=q; studentPage=1; renderStudents();
});

function getFilteredStudents(){
    let rows=allStudents;
    if(studentFilter.tab==='nasscom') rows=rows.filter(s=>s.project_code==='nasscom');
    else if(studentFilter.tab==='bajaj') rows=rows.filter(s=>s.project_code==='bajaj');
    else if(studentFilter.tab==='unassigned') rows=rows.filter(s=>!s.batch_id);
    else if(studentFilter.tab==='placed') rows=rows.filter(s=>s.placement_status==='placed');
    if(studentFilter.program) rows=rows.filter(s=>s.program_name===studentFilter.program);
    if(studentFilter.location) rows=rows.filter(s=>s.location_name===studentFilter.location);
    if(studentFilter.search){
        const q=studentFilter.search;
        rows=rows.filter(s=>
            (s.full_name||'').toLowerCase().includes(q)||
            (s.email||'').toLowerCase().includes(q)||
            (s.phone||'').includes(q)||
            (s.ma_foi_id||'').toLowerCase().includes(q)
        );
    }
    return rows;
}

function renderStudents(){
    const rows=getFilteredStudents();
    const total=rows.length;
    const start=(studentPage-1)*STUDENT_PAGE;
    const page=rows.slice(start,start+STUDENT_PAGE);
    $('students-tbl-title').textContent=total+' Student'+(total!==1?'s':'');
    const tbody=$('students-tbody');
    if(!page.length){
        tbody.innerHTML=`<tr><td colspan="8" class="tbl-empty">No students found.</td></tr>`;
        $('students-pagination').innerHTML='';
        return;
    }
    const plBadge={pending:'badge-amber',placed:'badge-green',not_applicable:'badge-gray'};
    tbody.innerHTML=page.map(s=>`<tr>
      <td><div style="font-weight:600">${esc(s.full_name)}</div><div style="font-size:11.5px;color:var(--text-muted)">${s.ma_foi_id?esc(s.ma_foi_id):''} &bull; ${esc(s.phone)}</div></td>
      <td><span class="badge badge-${s.project_code==='nasscom'?'nasscom':'bajaj'}">${esc(s.project_name)}</span></td>
      <td>${esc(s.program_name)}</td>
      <td>${esc(s.location_name)}</td>
      <td>${s.batch_code?`<span class="badge badge-blue">${esc(s.batch_code)}</span>`:'<span class="badge badge-gray">None</span>'}</td>
      <td><span class="badge ${plBadge[s.placement_status]||'badge-gray'}">${esc(s.placement_status)}</span></td>
      <td style="font-size:13px">${s.docs_uploaded||0}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="tbl-btn" onclick="viewStudent('${s.id}')">View</button>
        <button class="tbl-btn" onclick="editStudent('${s.id}')">Edit</button>
        ${s.batch_id
            ? `<button class="tbl-btn" onclick="unassignStudent('${s.id}','${esc(s.full_name)}')">Unassign</button>`
            : `<button class="tbl-btn tbl-btn--primary" onclick="openAssign('${s.id}','${esc(s.project_code)}')">Assign</button>`}
        <button class="tbl-btn tbl-btn--danger" onclick="deleteStudent('${s.id}','${esc(s.full_name)}')">Delete</button>
      </td>
    </tr>`).join('');
    // Pagination
    const pages=Math.ceil(total/STUDENT_PAGE);
    if(pages<=1){ $('students-pagination').innerHTML=`<span>Showing ${total} student${total!==1?'s':''}</span>`; return; }
    let btns='';
    for(let i=1;i<=pages;i++) btns+=`<button class="page-btn${i===studentPage?' active':''}" onclick="window.__spage(${i})">${i}</button>`;
    $('students-pagination').innerHTML=`<span>Showing ${start+1}&ndash;${Math.min(start+STUDENT_PAGE,total)} of ${total}</span><div class="page-btns">${btns}</div>`;
}
window.__spage=n=>{studentPage=n;renderStudents();};

// View student
window.viewStudent=async(id)=>{
    const s=allStudents.find(x=>x.id===id); if(!s) return;
    openModal('modal-student-view');
    const r=(k,v)=>`<div class="profile-row"><div class="profile-row__label">${k}</div><div class="profile-row__val">${esc(v||'\u2014')}</div></div>`;
    $('student-view-body').innerHTML=
        r('Ma Foi ID', s.ma_foi_id)+r('Full Name',s.full_name)+r('Email',s.email)+r('Phone',s.phone)+
        r('Gender',s.gender)+r('DOB',fmtDate(s.date_of_birth))+r('Aadhaar','XXXX XXXX '+( s.aadhaar_number?.slice(-4)||''))+
        r('Project',s.project_name)+r('Program',s.program_name)+r('Location',s.location_name)+
        r('Batch',s.batch_code)+r('Qualification',s.educational_qualification)+r('Grad Year',s.graduation_year)+
        r('Address',s.address)+r('Father',s.father_name)+r('Mother',s.mother_name)+
        r('Family Income',s.annual_family_income)+r('Reg Status',s.registration_status)+r('Placement',s.placement_status)+
        r('Docs Uploaded',s.docs_uploaded)+r('Registered',fmtDate(s.created_at));
};

// Edit student (status/remarks only from admin panel)
window.editStudent=async(id)=>{
    const s=allStudents.find(x=>x.id===id); if(!s) return;
    $('edit-student-id').value=id;
    $('edit-reg-status').value=s.registration_status||'registered';
    $('edit-pl-status').value=s.placement_status||'pending';
    $('edit-remarks').value=s.remarks||'';
    openModal('modal-student-edit');
};
$('btn-save-student-edit').addEventListener('click',async()=>{
    const id=$('edit-student-id').value;
    const btn=$('btn-save-student-edit'); btn.disabled=true; btn.textContent='Saving\u2026';
    try{
        const {error}=await supabase.from(TABLE_STUDENTS).update({
            registration_status:$('edit-reg-status').value,
            placement_status:$('edit-pl-status').value,
            remarks:$('edit-remarks').value||null,
        }).eq('id',id);
        if(error) throw error;
        await logAudit('student_edit','student',id,{});
        toast.success('Student updated');
        closeModal('modal-student-edit');
        await loadStudents(); renderStudents(); renderStats && loadDashboardStats().then(renderStats);
    }catch(e){ toast.error('Update failed: '+e.message); }
    finally{ btn.disabled=false; btn.textContent='Save Changes'; }
});

// Delete student
window.deleteStudent=(id,name)=>{
    showConfirm('Delete Student',`Delete <strong>${esc(name)}</strong>? This cannot be undone.`,async()=>{
        try{
            const {error}=await supabase.from(TABLE_STUDENTS).delete().eq('id',id);
            if(error) throw error;
            await logAudit('student_delete','student',id,{name});
            toast.success('Student deleted');
            await loadStudents(); renderStudents(); loadDashboardStats().then(renderStats);
        }catch(e){ toast.error('Delete failed: '+e.message); }
    });
};

// Assign to batch
window.openAssign=(studentId,projectCode)=>{
    $('assign-student-id').value=studentId;
    const s=allStudents.find(x=>x.id===studentId);
    $('assign-batch-title').textContent='Assign '+esc(s?.full_name||'Student')+' to Batch';
    // Filter batches by same project
    const batches=allBatches.filter(b=>b.project_code===projectCode&&b.status!=='cancelled');
    $('assign-batch-select').innerHTML='<option value="">Choose a batch\u2026</option>'+
        batches.map(b=>`<option value="${b.id}">${esc(b.batch_code)} &mdash; ${esc(b.location_name)} (${b.total_students||0}/${b.capacity||'?'})</option>`).join('');
    $('assign-batch-info').textContent='';
    openModal('modal-assign-batch');
};
$('assign-batch-select').addEventListener('change',e=>{
    const b=allBatches.find(x=>x.id===e.target.value);
    $('assign-batch-info').textContent=b?`Center: ${b.center_name||'\u2014'} | Start: ${fmtDate(b.start_date)} | Trainer: ${b.trainer_name||'\u2014'}`:'';
});
$('btn-confirm-assign').addEventListener('click',async()=>{
    const studentId=$('assign-student-id').value, batchId=$('assign-batch-select').value;
    if(!batchId){toast.error('Please select a batch.');return;}
    const btn=$('btn-confirm-assign'); btn.disabled=true; btn.textContent='Assigning\u2026';
    try{
        const s=allStudents.find(x=>x.id===studentId);
        const b=allBatches.find(x=>x.id===batchId);
        // Upsert assignment
        const {error:aE}=await supabase.from(TABLE_BATCH_ASSIGNMENTS).upsert(
            {student_id:studentId,batch_id:batchId,assigned_by:getUser()},{onConflict:'student_id'});
        if(aE) throw aE;
        // History
        await supabase.from(TABLE_BATCH_HISTORY).insert([{student_id:studentId,from_batch_id:s?.batch_id||null,to_batch_id:batchId,action:s?.batch_id?'reassigned':'assigned',performed_by:getUser()}]);
        // Update student status
        await supabase.from(TABLE_STUDENTS).update({registration_status:'batch_assigned'}).eq('id',studentId);
        // Rename registration documents to include batch code
        if(s?.ma_foi_id && b?.batch_code){
            await renameRegDocs(studentId, s.ma_foi_id, b.batch_code, s.full_name);
        }
        await logAudit('batch_assign','student',studentId,{batch:b?.batch_code});
        toast.success('Assigned to '+b?.batch_code);
        closeModal('modal-assign-batch');
        await loadStudents(); await loadBatches(); renderStudents(); renderBatches();
    }catch(e){ toast.error('Assign failed: '+e.message); }
    finally{ btn.disabled=false; btn.textContent='Assign'; }
});

// Rename all registration docs when batch is assigned/changed
async function renameRegDocs(studentId, maFoiId, batchCode, fullName){
    const {data:docs}=await supabase.from(TABLE_REGISTRATION_DOCS).select('*').eq('student_id',studentId);
    if(!docs?.length) return;
    for(const doc of docs){
        const ext='.'+doc.file_name.split('.').pop();
        const newName=buildRegDocFilename(maFoiId, batchCode, doc.doc_label, fullName, ext);
        const oldPath=doc.storage_path;
        const newPath='nasscom/'+maFoiId+'/'+newName;
        if(oldPath===newPath) continue;
        try{
            // Copy to new path, then delete old
            const {data:fileData}=await supabase.storage.from(STORAGE_BUCKET).download(oldPath);
            if(fileData){
                await supabase.storage.from(STORAGE_BUCKET).upload(newPath,fileData,{upsert:true});
                await supabase.storage.from(STORAGE_BUCKET).remove([oldPath]);
                const {data:{publicUrl}}=supabase.storage.from(STORAGE_BUCKET).getPublicUrl(newPath);
                await supabase.from(TABLE_REGISTRATION_DOCS).update({file_name:newName,storage_path:newPath,public_url:publicUrl}).eq('id',doc.id);
            }
        }catch(e){console.warn('[Admin] Doc rename failed for',doc.file_name,e);}
    }
}

// Unassign student from batch
window.unassignStudent=async(studentId,name)=>{
    showConfirm('Unassign from Batch',`Remove <strong>${esc(name)}</strong> from their current batch?`,async()=>{
        try{
            const s=allStudents.find(x=>x.id===studentId);
            const {error}=await supabase.from(TABLE_BATCH_ASSIGNMENTS).delete().eq('student_id',studentId);
            if(error) throw error;
            await supabase.from(TABLE_BATCH_HISTORY).insert([{student_id:studentId,from_batch_id:s?.batch_id||null,to_batch_id:null,action:'removed',performed_by:getUser()}]);
            await supabase.from(TABLE_STUDENTS).update({registration_status:'registered'}).eq('id',studentId);
            await logAudit('batch_unassign','student',studentId,{name});
            toast.success(name+' unassigned');
            await loadStudents(); await loadBatches(); renderStudents(); renderBatches();
        }catch(e){ toast.error('Unassign failed: '+e.message); }
    },'Unassign');
};

// ══════════════════════════════════════════════════════════
// BATCHES
// ══════════════════════════════════════════════════════════
let batchFilter='all';
document.querySelectorAll('.tab-btn[data-batch-tab]').forEach(b=>{
    b.addEventListener('click',()=>{
        document.querySelectorAll('.tab-btn[data-batch-tab]').forEach(x=>x.classList.remove('active'));
        b.classList.add('active'); batchFilter=b.dataset.batchTab; renderBatches();
    });
});

function renderBatches(){
    let rows=allBatches;
    if(batchFilter==='nasscom') rows=rows.filter(b=>b.project_code==='nasscom');
    else if(batchFilter==='bajaj') rows=rows.filter(b=>b.project_code==='bajaj');
    else if(batchFilter==='active') rows=rows.filter(b=>b.status==='active');
    const tbody=$('batches-tbody');
    if(!rows.length){tbody.innerHTML=`<tr><td colspan="9" class="tbl-empty">No batches found.</td></tr>`;return;}
    const stBadge={upcoming:'badge-amber',active:'badge-green',completed:'badge-gray',cancelled:'badge-red'};
    tbody.innerHTML=rows.map(b=>`<tr>
      <td style="font-weight:600">${esc(b.batch_code)}</td>
      <td><span class="badge badge-${b.project_code==='nasscom'?'nasscom':'bajaj'}">${esc(b.project_name)}</span></td>
      <td>${esc(b.program_name)}</td>
      <td>${esc(b.location_name)}</td>
      <td>${esc(b.center_name||'\u2014')}</td>
      <td><span class="badge ${stBadge[b.status]||'badge-gray'}">${esc(b.status)}</span></td>
      <td>${b.total_students||0}</td>
      <td>${b.capacity||'\u2014'}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="tbl-btn" onclick="viewBatch('${b.id}')">View</button>
        <button class="tbl-btn" onclick="editBatch('${b.id}')">Edit</button>
        <button class="tbl-btn tbl-btn--danger" onclick="deleteBatch('${b.id}','${esc(b.batch_code)}')">Delete</button>
      </td>
    </tr>`).join('');
}

// Create batch
$('btn-create-batch').addEventListener('click',()=>{
    $('batch-id').value=''; $('batch-modal-title').textContent='Create Batch';
    ['batch-project','batch-program','batch-location','batch-center','batch-trainer','batch-notes'].forEach(id=>$(id).value='');
    ['batch-number','batch-capacity'].forEach(id=>$(id).value='');
    $('batch-status').value='upcoming'; $('batch-start').value=''; $('batch-end').value='';
    $('batch-code-preview').textContent='B??_???_???';
    $('batch-number-err').textContent='';
    openModal('modal-batch');
});

// Cascade dropdowns in batch modal
$('batch-project').addEventListener('change',e=>{
    const pcode=e.target.value;
    const proj=allProjects.find(p=>p.code===pcode);
    // Programs
    const progs=allPrograms.filter(p=>p.project_id===proj?.id);
    $('batch-program').innerHTML='<option value="">Select\u2026</option>'+progs.map(p=>`<option value="${p.code}">${esc(p.name)}</option>`).join('');
    // Locations
    const locs=allLocations.filter(l=>l.project_id===proj?.id);
    $('batch-location').innerHTML='<option value="">Select\u2026</option>'+locs.map(l=>`<option value="${l.id}:${l.code}:${l.name}">${esc(l.name)}</option>`).join('');
    $('batch-center').innerHTML='<option value="">Select location first</option>';
    updateBatchCodePreview();
});
$('batch-location').addEventListener('change',async e=>{
    const parts=(e.target.value||'').split(':');
    const locId=parts[0];
    const proj=allProjects.find(p=>p.code===$('batch-project').value);
    const centers=allCenters.filter(c=>c.location_id===locId&&c.project_id===proj?.id);
    $('batch-center').innerHTML='<option value="">Select\u2026</option>'+centers.map(c=>`<option value="${c.code}:${c.id}:${c.name}">${esc(c.code)} &mdash; ${esc(c.name)}</option>`).join('');
    updateBatchCodePreview();
});
['batch-program','batch-center','batch-number'].forEach(id=>$(id).addEventListener('change',updateBatchCodePreview));
['batch-number'].forEach(id=>$(id).addEventListener('input',updateBatchCodePreview));

function updateBatchCodePreview(){
    const prog=$('batch-program').value;
    const num=parseInt($('batch-number').value)||null;
    const centerParts=($('batch-center').value||'').split(':');
    const centerCode=centerParts[0]||'???';
    if(prog&&num&&centerCode!=='???'){
        $('batch-code-preview').textContent=buildBatchCode(num,prog,centerCode);
    } else {
        $('batch-code-preview').textContent='B??_???_???';
    }
}

$('btn-save-batch').addEventListener('click',async()=>{
    const id=$('batch-id').value;
    const pcode=$('batch-project').value, prog=$('batch-program').value;
    const locVal=$('batch-location').value, cenVal=$('batch-center').value;
    const num=parseInt($('batch-number').value)||null;
    $('batch-number-err').textContent='';
    if(!pcode||!prog||!locVal||!cenVal||!num){toast.error('Fill in all required fields.');return;}
    const locParts=locVal.split(':');
    const cenParts=cenVal.split(':');
    const proj=allProjects.find(p=>p.code===pcode);
    const progObj=allPrograms.find(p=>p.project_id===proj?.id&&p.code===prog);
    const batchCode=buildBatchCode(num,prog,cenParts[0]);
    const btn=$('btn-save-batch'); btn.disabled=true; btn.textContent='Saving\u2026';
    try{
        const payload={
            project_id:proj?.id, program_id:progObj?.id,
            location_id:locParts[0], center_id:cenParts[1]||null,
            batch_number:num, batch_code:batchCode, center_name:cenParts[2]||null,
            capacity:$('batch-capacity').value||null, status:$('batch-status').value,
            trainer_name:$('batch-trainer').value||null, start_date:$('batch-start').value||null,
            end_date:$('batch-end').value||null, notes:$('batch-notes').value||null,
        };
        if(id){
            const {error}=await supabase.from(TABLE_BATCHES).update(payload).eq('id',id);
            if(error) throw error;
            await logAudit('batch_edit','batch',id,{batchCode});
            toast.success('Batch updated');
        } else {
            const {error}=await supabase.from(TABLE_BATCHES).insert([payload]);
            if(error) throw error;
            await logAudit('batch_create','batch',null,{batchCode});
            toast.success('Batch '+batchCode+' created');
        }
        closeModal('modal-batch');
        await loadBatches(); renderBatches();
    }catch(e){ toast.error('Save failed: '+e.message.includes('unique')?' Batch code already exists.':e.message); }
    finally{ btn.disabled=false; btn.textContent='Save Batch'; }
});

window.editBatch=async(id)=>{
    const b=allBatches.find(x=>x.id===id); if(!b) return;
    $('batch-id').value=id; $('batch-modal-title').textContent='Edit Batch';
    $('batch-project').value=b.project_code||'';
    // Trigger cascade
    $('batch-project').dispatchEvent(new Event('change'));
    setTimeout(()=>{
        $('batch-program').value=b.program_code||'';
        // Set location (format: id:code:name)
        // location option value format: "UUID:CODE:Name"
        Array.from($('batch-location').options).forEach(opt=>{
            if(b.location_id && opt.value.startsWith(b.location_id+':')) $('batch-location').value=opt.value;
            else if(!b.location_id && opt.value.includes(':'+b.location_name)) $('batch-location').value=opt.value;
        });
        $('batch-location').dispatchEvent(new Event('change'));
        setTimeout(()=>{
            // center option value format: "CODE:UUID:Name"
            Array.from($('batch-center').options).forEach(opt=>{if(opt.value.startsWith(b.center_code+':'))$('batch-center').value=opt.value;});
            $('batch-number').value=b.batch_number||'';
            $('batch-capacity').value=b.capacity||'';
            $('batch-status').value=b.status||'upcoming';
            $('batch-trainer').value=b.trainer_name||'';
            $('batch-start').value=b.start_date||'';
            $('batch-end').value=b.end_date||'';
            $('batch-notes').value=b.notes||'';
            updateBatchCodePreview();
        },100);
    },100);
    openModal('modal-batch');
};

window.deleteBatch=async(id,code)=>{
    const assigned=allStudents.filter(s=>s.batch_id===id).length;
    if(assigned>0){toast.error(`Cannot delete — ${assigned} student(s) are assigned to this batch. Unassign them first.`);return;}
    showConfirm('Delete Batch',`Delete batch <strong>${esc(code)}</strong>?`,async()=>{
        try{
            const {error}=await supabase.from(TABLE_BATCHES).delete().eq('id',id);
            if(error) throw error;
            await logAudit('batch_delete','batch',id,{code});
            toast.success('Batch deleted');
            await loadBatches(); renderBatches();
        }catch(e){ toast.error('Delete failed: '+e.message); }
    });
};

window.viewBatch=async(id)=>{
    const b=allBatches.find(x=>x.id===id); if(!b) return;
    const students=allStudents.filter(s=>s.batch_id===id);
    $('batch-detail-title').textContent=b.batch_code;
    $('batch-detail-sub').textContent=`${b.program_name} | ${b.location_name} | ${b.total_students||0}/${b.capacity||'?'} students`;
    $('batch-detail-body').innerHTML=
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        ${[['Center',b.center_name],['Trainer',b.trainer_name],['Start',fmtDate(b.start_date)],['End',fmtDate(b.end_date)],['Status',b.status]].map(([k,v])=>`<div class="profile-row"><div class="profile-row__label">${k}</div><div class="profile-row__val">${esc(v||'\u2014')}</div></div>`).join('')}
        </div>
        <div style="font-weight:600;margin-bottom:8px">Students (${students.length})</div>`+
        (students.length?`<table class="data-table"><thead><tr><th>Name</th><th>Ma Foi ID</th><th>Phone</th><th>Docs</th></tr></thead><tbody>
        ${students.map(s=>`<tr><td>${esc(s.full_name)}</td><td>${s.ma_foi_id||'\u2014'}</td><td>${s.phone}</td><td>${s.docs_uploaded||0}</td></tr>`).join('')}
        </tbody></table>`:'<div style="text-align:center;color:var(--text-muted);padding:20px">No students assigned yet.</div>');
    openModal('modal-batch-detail');
};

// ══════════════════════════════════════════════════════════
// CENTERS
// ══════════════════════════════════════════════════════════
function renderCenters(){
    const tbody=$('centers-tbody');
    if(!allCenters.length){tbody.innerHTML=`<tr><td colspan="6" class="tbl-empty">No centers yet. Add your first center above.</td></tr>`;return;}
    tbody.innerHTML=allCenters.map(c=>`<tr>
      <td style="font-weight:700;font-family:monospace;font-size:14px">${esc(c.code)}</td>
      <td>${esc(c.name)}</td>
      <td><span class="badge badge-${c.project_code==='nasscom'?'nasscom':'bajaj'}">${esc(c.project_name)}</span></td>
      <td>${esc(c.location_name)}</td>
      <td><span class="badge badge-${c.is_active?'green':'gray'}">${c.is_active?'Active':'Inactive'}</span></td>
      <td style="display:flex;gap:4px">
        <button class="tbl-btn" onclick="editCenter('${c.id}')">Edit</button>
        <button class="tbl-btn tbl-btn--danger" onclick="deleteCenter('${c.id}','${esc(c.code)}')">Delete</button>
      </td>
    </tr>`).join('');
}

$('btn-create-center').addEventListener('click',()=>{
    $('center-id').value=''; $('center-modal-title').textContent='Add Center';
    ['center-project','center-location','center-code','center-name'].forEach(id=>$(id).value='');
    ['center-project-err','center-location-err','center-code-err','center-name-err'].forEach(id=>$(id).textContent='');
    openModal('modal-center');
});

$('center-project').addEventListener('change',e=>{
    const pcode=e.target.value;
    const proj=allProjects.find(p=>p.code===pcode);
    const locs=allLocations.filter(l=>l.project_id===proj?.id);
    $('center-location').innerHTML='<option value="">Select\u2026</option>'+locs.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');
});

$('center-code').addEventListener('input',e=>{ e.target.value=e.target.value.toUpperCase(); });

$('btn-save-center').addEventListener('click',async()=>{
    const id=$('center-id').value;
    const pcode=$('center-project').value, locId=$('center-location').value;
    const code=$('center-code').value.trim().toUpperCase(), name=$('center-name').value.trim();
    let ok=true;
    ['center-project-err','center-location-err','center-code-err','center-name-err'].forEach(id=>$(id).textContent='');
    if(!pcode){$('center-project-err').textContent='Required.';ok=false;}
    if(!locId){$('center-location-err').textContent='Required.';ok=false;}
    if(!code){$('center-code-err').textContent='Required.';ok=false;}
    else if(!/^[A-Z0-9\s]{1,20}$/.test(code)){$('center-code-err').textContent='Letters, numbers, spaces only (max 20 chars).';ok=false;}
    if(!name){$('center-name-err').textContent='Required.';ok=false;}
    if(!ok) return;
    const proj=allProjects.find(p=>p.code===pcode);
    const btn=$('btn-save-center'); btn.disabled=true; btn.textContent='Saving\u2026';
    try{
        if(id){
            const {error}=await supabase.from(TABLE_CENTERS).update({code,name,is_active:true}).eq('id',id);
            if(error) throw error;
            toast.success('Center updated');
        } else {
            const {error}=await supabase.from(TABLE_CENTERS).insert([{project_id:proj?.id,location_id:locId,code,name,is_active:true}]);
            if(error) throw error;
            toast.success('Center '+code+' added');
        }
        closeModal('modal-center');
        await loadCenters(); renderCenters();
    }catch(e){ toast.error('Save failed: '+(e.message.includes('unique')?'Center code already exists for this location.':e.message)); }
    finally{ btn.disabled=false; btn.textContent='Save Center'; }
});

window.editCenter=async(id)=>{
    const c=allCenters.find(x=>x.id===id); if(!c) return;
    $('center-id').value=id; $('center-modal-title').textContent='Edit Center';
    $('center-project').value=c.project_code||'';
    $('center-project').dispatchEvent(new Event('change'));
    setTimeout(()=>{ $('center-location').value=c.location_id||''; },100);
    $('center-code').value=c.code||''; $('center-name').value=c.name||'';
    openModal('modal-center');
};
window.deleteCenter=async(id,code)=>{
    const usedInBatches=allBatches.filter(b=>b.center_id===id).length;
    if(usedInBatches>0){toast.error(`Cannot delete — ${usedInBatches} batch(es) use this center.`);return;}
    showConfirm('Delete Center',`Delete center <strong>${esc(code)}</strong>?`,async()=>{
        try{
            const {error}=await supabase.from(TABLE_CENTERS).delete().eq('id',id);
            if(error) throw error;
            toast.success('Center deleted');
            await loadCenters(); renderCenters();
        }catch(e){ toast.error('Delete failed: '+e.message); }
    });
};

// ══════════════════════════════════════════════════════════
// PLACEMENTS
// ══════════════════════════════════════════════════════════
let plFilter='all';
document.querySelectorAll('.tab-btn[data-pl-tab]').forEach(b=>{
    b.addEventListener('click',()=>{
        document.querySelectorAll('.tab-btn[data-pl-tab]').forEach(x=>x.classList.remove('active'));
        b.classList.add('active'); plFilter=b.dataset.plTab; renderPlacements();
    });
});

function populatePlacementStudentDropdown(){
    const placed=allStudents.filter(s=>s.placement_status==='placed'||true); // allow admin to add any
    $('pl-student').innerHTML='<option value="">Select student\u2026</option>'+
        allStudents.map(s=>`<option value="${s.id}">${esc(s.full_name)} (${s.ma_foi_id||s.phone}) &mdash; ${esc(s.project_name)}</option>`).join('');
}

function renderPlacements(){
    let rows=allPlacements;
    if(plFilter==='active') rows=rows.filter(p=>p.placement_status==='active');
    else if(plFilter==='resigned') rows=rows.filter(p=>['resigned','terminated','absconded'].includes(p.placement_status));
    const tbody=$('placements-tbody');
    if(!rows.length){tbody.innerHTML=`<tr><td colspan="10" class="tbl-empty">No placements yet.</td></tr>`;return;}
    const stBadge={active:'badge-green',resigned:'badge-amber',terminated:'badge-red',absconded:'badge-red'};
    tbody.innerHTML=rows.map(p=>`<tr>
      <td style="font-weight:500">${esc(p.student_name)}</td>
      <td><span class="badge badge-${p.project_code==='nasscom'?'nasscom':'bajaj'}">${esc(p.project_code)}</span></td>
      <td style="font-weight:500">${esc(p.company)}</td>
      <td>${esc(p.designation||'\u2014')}</td>
      <td>${p.salary?'\u20B9'+Number(p.salary).toLocaleString('en-IN'):'\u2014'}</td>
      <td style="font-size:12px">${fmtDate(p.date_of_joining)}</td>
      <td><span class="badge ${stBadge[p.placement_status]||'badge-gray'}">${esc(p.placement_status)}</span></td>
      <td><span class="badge badge-gray">${jdocCounts[p.id]||0}/3</span></td>
      <td><span class="badge badge-gray">${payCounts[p.id]||0}/3</span></td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="tbl-btn" onclick="editPlacement('${p.id}')">Edit</button>
        <button class="tbl-btn tbl-btn--danger" onclick="deletePlacement('${p.id}','${esc(p.student_name)}')">Delete</button>
      </td>
    </tr>`).join('');
}

$('btn-add-placement').addEventListener('click',()=>{
    $('pl-id').value=''; $('pl-modal-title').textContent='Add Placement';
    ['pl-student','pl-company','pl-designation','pl-salary','pl-feedback'].forEach(id=>$(id).value='');
    $('pl-doj').value=''; $('pl-status').value='active';
    $('pl-student').disabled=false;
    ['pl-student-err','pl-company-err'].forEach(id=>$(id).textContent='');
    openModal('modal-placement');
});

window.editPlacement=async(id)=>{
    const p=allPlacements.find(x=>x.id===id); if(!p) return;
    $('pl-id').value=id; $('pl-modal-title').textContent='Edit Placement';
    $('pl-student').value=p.student_id||''; $('pl-student').disabled=true;
    $('pl-company').value=p.company||''; $('pl-designation').value=p.designation||'';
    $('pl-salary').value=p.salary||''; $('pl-doj').value=p.date_of_joining||'';
    $('pl-status').value=p.placement_status||'active'; $('pl-feedback').value=p.feedback||'';
    openModal('modal-placement');
};

$('btn-save-placement').addEventListener('click',async()=>{
    const id=$('pl-id').value, studentId=$('pl-student').value, company=$('pl-company').value.trim();
    let ok=true;
    $('pl-student-err').textContent=''; $('pl-company-err').textContent='';
    if(!studentId){$('pl-student-err').textContent='Select a student.';ok=false;}
    if(!company){$('pl-company-err').textContent='Company name required.';ok=false;}
    if(!ok) return;
    const btn=$('btn-save-placement'); btn.disabled=true; btn.textContent='Saving\u2026';
    try{
        const s=allStudents.find(x=>x.id===studentId);
        const payload={
            student_id:studentId, batch_id:s?.batch_id||null,
            student_name:s?.full_name||'', phone:s?.phone||'', email:s?.email||'',
            program_name:s?.program_name||'', location_name:s?.location_name||'',
            project_code:s?.project_code||'', ma_foi_id:s?.ma_foi_id||null, batch_code:s?.batch_code||null,
            company, designation:$('pl-designation').value||null, salary:$('pl-salary').value||null,
            date_of_joining:$('pl-doj').value||null, feedback:$('pl-feedback').value||null,
            placement_status:$('pl-status').value,
        };
        if(id){
            const {error}=await supabase.from(TABLE_PLACEMENTS).update(payload).eq('id',id);
            if(error) throw error;
            toast.success('Placement updated');
        } else {
            const {error}=await supabase.from(TABLE_PLACEMENTS).insert([payload]);
            if(error) throw error;
            await supabase.from(TABLE_STUDENTS).update({placement_status:'placed',registration_status:'placed'}).eq('id',studentId);
            await logAudit('placement_create','placement',null,{student:s?.full_name,company});
            toast.success('Placement added for '+s?.full_name);
        }
        closeModal('modal-placement');
        await loadPlacements(); await loadStudents(); renderPlacements(); renderStudents();
        loadDashboardStats().then(renderStats);
    }catch(e){ toast.error('Save failed: '+e.message); }
    finally{ btn.disabled=false; btn.textContent='Save Placement'; }
});

window.deletePlacement=(id,name)=>{
    showConfirm('Delete Placement',`Delete placement for <strong>${esc(name)}</strong>? All related documents and payslips will also be deleted.`,async()=>{
        try{
            const {error}=await supabase.from(TABLE_PLACEMENTS).delete().eq('id',id);
            if(error) throw error;
            toast.success('Placement deleted');
            await loadPlacements(); renderPlacements(); loadDashboardStats().then(renderStats);
        }catch(e){ toast.error('Delete failed: '+e.message); }
    });
};

// ══════════════════════════════════════════════════════════
// DOCUMENTS
// ══════════════════════════════════════════════════════════
let docFilter={kind:'all',project:'',search:''}, docPage=1;
const DOC_PAGE=25;

document.querySelectorAll('.tab-btn[data-doc-tab]').forEach(b=>{
    b.addEventListener('click',()=>{
        document.querySelectorAll('.tab-btn[data-doc-tab]').forEach(x=>x.classList.remove('active'));
        b.classList.add('active'); docFilter.kind=b.dataset.docTab; docPage=1; renderDocuments();
    });
});
$('doc-filter-project').addEventListener('change',e=>{docFilter.project=e.target.value;docPage=1;renderDocuments();});
$('doc-search').addEventListener('input',e=>{docFilter.search=e.target.value.toLowerCase();docPage=1;renderDocuments();});

function getFilteredDocs(){
    let rows=allDocuments;
    if(docFilter.kind==='registration') rows=rows.filter(d=>d.kind==='registration');
    else if(docFilter.kind==='placement') rows=rows.filter(d=>d.kind==='placement');
    else if(docFilter.kind==='payslip')   rows=rows.filter(d=>d.kind==='payslip');
    else if(docFilter.kind==='unverified') rows=rows.filter(d=>d.kind==='registration'&&!d.verified);
    if(docFilter.project) rows=rows.filter(d=>d.projectCode===docFilter.project);
    if(docFilter.search){const q=docFilter.search;rows=rows.filter(d=>(d.studentName||'').toLowerCase().includes(q)||(d.fileName||'').toLowerCase().includes(q));}
    return rows;
}

function renderDocuments(){
    const all=getFilteredDocs(), total=all.length;
    const start=(docPage-1)*DOC_PAGE, page=all.slice(start,start+DOC_PAGE);
    const kindLabels={all:'All Documents',registration:'Registration Docs',placement:'Joining Docs',payslip:'Payslips',unverified:'Unverified'};
    $('docs-tbl-title').textContent=kindLabels[docFilter.kind]||'All Documents';
    const tbody=$('documents-tbody');
    if(!page.length){tbody.innerHTML=`<tr><td colspan="7" class="tbl-empty">No documents found.</td></tr>`;$('documents-pagination').innerHTML='';return;}
    const kindBadge={registration:'badge-blue',placement:'badge-amber',payslip:'badge-purple'};
    tbody.innerHTML=page.map((d,i)=>`<tr>
      <td style="font-weight:500">${esc(d.studentName)}${d.maFoiId?` <span style="color:var(--text-muted);font-size:11px">(${esc(d.maFoiId)})</span>`:''}  </td>
      <td>${esc(d.label)}</td>
      <td><span class="badge ${kindBadge[d.kind]||'badge-gray'}">${d.kind}</span></td>
      <td style="font-size:12px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(d.fileName)}">${esc(d.fileName)}</td>
      <td style="font-size:12px;color:var(--text-secondary)">${fmtDate(d.uploadedAt)}</td>
      <td>${d.kind==='registration'?`<span class="badge badge-${d.verified?'green':'gray'}">${d.verified?'\u2713 Verified':'Unverified'}</span>`:'<span style="color:var(--text-muted);font-size:12px">N/A</span>'}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        <a href="${esc(d.url)}" target="_blank" rel="noopener" class="tbl-btn">View</a>
        ${d.kind==='registration'
            ? (d.verified
                ? `<button class="tbl-btn" onclick="toggleDocVerified('${d.id}',false)">Unverify</button>`
                : `<button class="tbl-btn tbl-btn--primary" onclick="toggleDocVerified('${d.id}',true)">Verify</button>`)
            : ''}
        <button class="tbl-btn tbl-btn--danger" onclick="deleteDoc('${d.id}','${esc(d.sourceTable)}','${esc(d.fileName)}')">Delete</button>
      </td>
    </tr>`).join('');
    const pages=Math.ceil(total/DOC_PAGE);
    if(pages<=1){$('documents-pagination').innerHTML=`<span>${total} document${total!==1?'s':''}</span>`;return;}
    let btns='';
    for(let i=1;i<=pages;i++) btns+=`<button class="page-btn${i===docPage?' active':''}" onclick="window.__dpage(${i})">${i}</button>`;
    $('documents-pagination').innerHTML=`<span>${start+1}&ndash;${Math.min(start+DOC_PAGE,total)} of ${total}</span><div class="page-btns">${btns}</div>`;
}
window.__dpage=n=>{docPage=n;renderDocuments();};

window.toggleDocVerified=async(id,verified)=>{
    try{
        const {error}=await supabase.from(TABLE_REGISTRATION_DOCS).update({verified,verified_at:verified?new Date().toISOString():null,verified_by:verified?getUser():null}).eq('id',id);
        if(error) throw error;
        toast.success(verified?'Marked as verified':'Marked as unverified');
        await loadDocuments(); renderDocuments();
    }catch(e){toast.error('Update failed: '+e.message);}
};
window.deleteDoc=async(id,table,name)=>{
    showConfirm('Delete Document',`Delete <strong>${esc(name)}</strong>? The file record will be removed.`,async()=>{
        try{
            const {error}=await supabase.from(table).delete().eq('id',id);
            if(error) throw error;
            await logAudit('document_delete','document',id,{fileName:name});
            toast.success('Document deleted');
            await loadDocuments(); renderDocuments(); loadDashboardStats().then(renderStats);
        }catch(e){toast.error('Delete failed: '+e.message);}
    });
};

// ══════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════
if(isAuthed()){
    showAdmin();
} else {
    usernameI.focus();
}