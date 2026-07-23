const DRAFT_KEY = 'eb-manage-treatments-draft-v2';
const PREVIEW_KEY = 'eb-treatments-preview-v2';
const API_URL = '/.netlify/functions/treatments';
const FALLBACK_URL = '/content/treatments.json';

const loginPanel = document.querySelector('#loginPanel');
const managerPanel = document.querySelector('#managerPanel');
const loginButton = document.querySelector('#loginButton');
const logoutButton = document.querySelector('#logoutButton');
const treatmentList = document.querySelector('#treatmentList');
const statusMessage = document.querySelector('#statusMessage');
const dialog = document.querySelector('#treatmentDialog');
const form = document.querySelector('#treatmentForm');
let sourceDocument = null;
let treatments = [];
let dirty = false;

const clone = value => JSON.parse(JSON.stringify(value));
const escapeHtml = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const makeId = name => String(name || 'treatment').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || `treatment-${Date.now()}`;

function setStatus(message='', isError=false){
  statusMessage.textContent=message;
  statusMessage.classList.toggle('error',isError);
}
function getUser(){ return window.netlifyIdentity?.currentUser(); }

async function fetchFallback(){
  const response = await fetch(FALLBACK_URL,{cache:'no-store'});
  if(!response.ok) throw new Error('Unable to load the treatment list.');
  return response.json();
}

async function fetchPublishedTreatments(){
  try {
    const response = await fetch(API_URL,{cache:'no-store'});
    if(response.ok){
      const result = await response.json();
      if(result?.data?.items) return result.data;
    }
    if(response.status !== 404) throw new Error('Unable to load published treatments.');
  } catch(error) {
    console.warn('Blob content unavailable; using the Golden Master fallback.', error);
  }
  return fetchFallback();
}

async function loadTreatments(){
  sourceDocument = await fetchPublishedTreatments();
  const stored = localStorage.getItem(DRAFT_KEY);
  treatments = stored ? JSON.parse(stored) : clone(sourceDocument.items || []);
  dirty = Boolean(stored);
  render();
  setStatus(dirty ? 'Your unpublished draft has been restored.' : 'Published treatments loaded.');
}

function persistDraft(){
  localStorage.setItem(DRAFT_KEY,JSON.stringify(treatments));
  dirty=true;
  setStatus('Changes saved privately on this device. Preview them before publishing.');
  render();
}

function render(){
  treatmentList.innerHTML = treatments.map((item,index)=>`
    <article class="manage-treatment${item.active === false ? ' is-hidden' : ''}">
      <div class="manage-treatment-icon" aria-hidden="true">${escapeHtml(item.icon || '○')}</div>
      <div>
        <h2>${escapeHtml(item.name)}</h2>
        <p><strong>${escapeHtml(item.price)}</strong>${item.duration ? ` · ${escapeHtml(item.duration)}` : ''}</p>
        <p class="manage-treatment-meta">${item.active === false ? 'Hidden from website' : 'Visible on website'}</p>
      </div>
      <div class="manage-treatment-controls">
        <button type="button" data-action="up" data-index="${index}" aria-label="Move ${escapeHtml(item.name)} up">↑</button>
        <button type="button" data-action="down" data-index="${index}" aria-label="Move ${escapeHtml(item.name)} down">↓</button>
        <button type="button" data-action="toggle" data-index="${index}">${item.active === false ? 'Show' : 'Hide'}</button>
        <button type="button" data-action="edit" data-index="${index}">Edit</button>
      </div>
    </article>`).join('');
}

function openEditor(index=null){
  const isNew = index === null;
  const item = isNew ? {active:true,icon:'○',name:'',price:'',duration:'',description:'',bookingUrl:''} : treatments[index];
  document.querySelector('#dialogTitle').textContent = isNew ? 'Add treatment' : 'Edit treatment';
  document.querySelector('#treatmentIndex').value = isNew ? '' : index;
  document.querySelector('#treatmentName').value = item.name || '';
  document.querySelector('#treatmentPrice').value = item.price || '';
  document.querySelector('#treatmentDuration').value = item.duration || '';
  document.querySelector('#treatmentDescription').value = item.description || '';
  document.querySelector('#treatmentBookingUrl').value = item.bookingUrl || '';
  document.querySelector('#treatmentIcon').value = item.icon || '○';
  document.querySelector('#treatmentActive').checked = item.active !== false;
  document.querySelector('#deleteTreatmentButton').hidden = isNew;
  dialog.showModal();
}

function showManager(user){
  loginPanel.hidden=true;
  managerPanel.hidden=false;
  logoutButton.hidden=false;
  setStatus(`Logged in as ${user?.email || 'authorised editor'}.`);
  loadTreatments().catch(error=>setStatus(error.message,true));
}
function showLogin(){ loginPanel.hidden=false; managerPanel.hidden=true; logoutButton.hidden=true; }

window.addEventListener('DOMContentLoaded',()=>{
  if(!window.netlifyIdentity){ setStatus('Login service could not load.',true); return; }
  window.netlifyIdentity.on('init',user=> user ? showManager(user) : showLogin());
  window.netlifyIdentity.on('login',user=>{ window.netlifyIdentity.close(); showManager(user); });
  window.netlifyIdentity.on('logout',showLogin);
  window.netlifyIdentity.init();
});

loginButton.addEventListener('click',()=>window.netlifyIdentity.open('login'));
logoutButton.addEventListener('click',()=>window.netlifyIdentity.logout());
document.querySelector('#addTreatmentButton').addEventListener('click',()=>openEditor());
document.querySelector('#closeDialogButton').addEventListener('click',()=>dialog.close());

treatmentList.addEventListener('click',event=>{
  const button=event.target.closest('button[data-action]'); if(!button)return;
  const index=Number(button.dataset.index); const action=button.dataset.action;
  if(action==='edit') return openEditor(index);
  if(action==='toggle') treatments[index].active = treatments[index].active === false;
  if(action==='up' && index>0) [treatments[index-1],treatments[index]]=[treatments[index],treatments[index-1]];
  if(action==='down' && index<treatments.length-1) [treatments[index+1],treatments[index]]=[treatments[index],treatments[index+1]];
  persistDraft();
});

form.addEventListener('submit',event=>{
  event.preventDefault();
  const indexValue=document.querySelector('#treatmentIndex').value;
  const item={
    id: indexValue === '' ? makeId(document.querySelector('#treatmentName').value) : treatments[Number(indexValue)].id,
    active:document.querySelector('#treatmentActive').checked,
    icon:document.querySelector('#treatmentIcon').value.trim() || '○',
    name:document.querySelector('#treatmentName').value.trim(),
    price:document.querySelector('#treatmentPrice').value.trim(),
    duration:document.querySelector('#treatmentDuration').value.trim(),
    description:document.querySelector('#treatmentDescription').value.trim(),
    bookingUrl:document.querySelector('#treatmentBookingUrl').value.trim()
  };
  if(indexValue==='') treatments.push(item); else treatments[Number(indexValue)] = item;
  persistDraft(); dialog.close();
});

document.querySelector('#deleteTreatmentButton').addEventListener('click',()=>{
  const index=Number(document.querySelector('#treatmentIndex').value);
  if(!Number.isInteger(index) || !confirm('Delete this treatment?')) return;
  treatments.splice(index,1); persistDraft(); dialog.close();
});

document.querySelector('#resetButton').addEventListener('click',()=>{
  if(dirty && !confirm('Discard all unpublished treatment changes?')) return;
  localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(PREVIEW_KEY);
  treatments=clone(sourceDocument.items || []); dirty=false; render(); setStatus('Unpublished changes discarded.');
});

document.querySelector('#previewButton').addEventListener('click',()=>{
  const preview={...sourceDocument,items:clone(treatments)};
  localStorage.setItem(PREVIEW_KEY,JSON.stringify(preview));
  window.open('/?preview=treatments#treatments','eb-preview');
  setStatus('Preview opened in a new tab. The live website has not changed.');
});

document.querySelector('#publishButton').addEventListener('click',async()=>{
  const user=getUser();
  if(!user) return setStatus('Please log in again before publishing.',true);
  if(!confirm('Publish these treatment changes to the live website?')) return;
  const button=document.querySelector('#publishButton'); button.disabled=true; setStatus('Publishing website…');
  try{
    const token=await user.jwt();
    const payload={...sourceDocument,items:clone(treatments)};
    const response=await fetch(API_URL,{
      method:'PUT',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
      body:JSON.stringify(payload)
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(result.error || 'Publishing failed.');
    sourceDocument=clone(payload);
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(PREVIEW_KEY);
    dirty=false;
    setStatus('Published successfully. The live Treatments page now uses the new content.');
  }catch(error){ setStatus(error.message,true); }
  finally{ button.disabled=false; }
});
