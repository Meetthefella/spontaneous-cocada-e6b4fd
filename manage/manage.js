import {
  acceptInvite,
  getUser,
  handleAuthCallback,
  login,
  logout,
  requestPasswordRecovery,
  updateUser
} from '@netlify/identity';

const panels = Object.fromEntries(['loading','login','invite','recovery','success','error'].map(name => [name, document.querySelector(`#${name}Panel`)]));
const signedInAs = document.querySelector('#signedInAs');
const successMessage = document.querySelector('#successMessage');
const errorMessage = document.querySelector('#errorMessage');
let inviteToken = null;
let activeCategory = 'signature';
let activeHomepageSection = null;
let homepageDirty = false;
let homepageDraftTimer = null;
let homepageDraftSaving = false;
let homepageDraftQueued = false;
let homepageSavedAt = null;
let homepagePublishing = false;
let activeTreatmentId = null;
let editorStep = 0;
let editorDirty = false;
let sessionImageUrl = '';
let draftTimer = null;
let initialPriceLinked = true;
let publishing = false;
let inactivityTimer = null;
let inactivityLocked = false;
let resumeAfterLogin = false;
let lockContext = null;
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
const TREATMENTS_API = '/.netlify/functions/treatments';
const HOMEPAGE_DRAFT_API = '/.netlify/functions/homepage-draft';
const HOMEPAGE_API = '/.netlify/functions/homepage';

let treatments = [
  {id:'microblading',category:'signature',title:'Microblading',shortDescription:'Natural-looking brow enhancement using fine, hair-like strokes.',fullDescription:'Microblading is designed to create fuller, naturally defined brows using carefully placed hair-like strokes.',price:'£100',duration:'2 hours',detailedPricing:'Initial treatment: £100',followUpPricing:'Second session: £100\nThird session: £75\nFourth session: Free',patchTest:true,visible:true},
  {id:'nano-brows',category:'signature',title:'Nano Brows',shortDescription:'Fine machine-created strokes for softly defined brows.',fullDescription:'Nano brows use a precision machine technique to create delicate, realistic-looking strokes.',price:'£100',duration:'To be confirmed',detailedPricing:'',followUpPricing:'',patchTest:true,visible:true},
  {id:'blending',category:'signature',title:'Blending',shortDescription:'A blended brow treatment tailored to the desired finish.',fullDescription:'Blending combines techniques to create a balanced, softly defined result.',price:'£100',duration:'To be confirmed',detailedPricing:'',followUpPricing:'',patchTest:true,visible:true},
  {id:'touch-up',category:'signature',title:'Touch-Up',shortDescription:'A refresh treatment to maintain colour and definition.',fullDescription:'Touch-up appointments refresh previous work and maintain the desired shape and colour.',price:'£50–£100',duration:'To be confirmed',detailedPricing:'',followUpPricing:'',patchTest:false,visible:true},
  {id:'removal-repair',category:'signature',title:'Removal / Repair',shortDescription:'Specialist correction or lightening of previous work.',fullDescription:'A consultation-led service for correcting or lightening existing work.',price:'£200',duration:'3–4 hours',detailedPricing:'',followUpPricing:'',patchTest:true,visible:true},
  {id:'waxing',category:'beauty',title:'Waxing',shortDescription:'A selection of quick waxing treatments.',fullDescription:'Choose from a range of waxing services. Individual areas and prices can be listed in the detailed pricing.',price:'From £5',duration:'Varies',detailedPricing:'',followUpPricing:'',patchTest:false,visible:true},
  {id:'lash-brow',category:'beauty',title:'Lash & Brow',shortDescription:'A combined lash and brow treatment.',fullDescription:'A convenient combined appointment for lashes and brows.',price:'£20',duration:'To be confirmed',detailedPricing:'',followUpPricing:'',patchTest:true,visible:true},
  {id:'tinting',category:'beauty',title:'Tinting',shortDescription:'Enhance the appearance of brows or lashes with tint.',fullDescription:'Tinting adds colour and definition for a polished, low-maintenance finish.',price:'£10',duration:'To be confirmed',detailedPricing:'',followUpPricing:'',patchTest:true,visible:true},
  {id:'nail-art',category:'beauty',title:'Nail Art',shortDescription:'Creative nail designs tailored to your chosen style.',fullDescription:'Choose from simple accents through to detailed custom nail art.',price:'£10–£65',duration:'Varies',detailedPricing:'',followUpPricing:'',patchTest:false,visible:true},
  {id:'ear-piercing',category:'beauty',title:'Ear Piercing',shortDescription:'A straightforward ear-piercing appointment.',fullDescription:'Ear piercing provided in a calm and welcoming setting.',price:'£10',duration:'To be confirmed',detailedPricing:'',followUpPricing:'',patchTest:false,visible:true},
  {id:'shellac-nails',category:'beauty',title:'Shellac Nails',shortDescription:'Long-lasting, glossy colour for natural nails.',fullDescription:'Shellac provides a durable and polished finish for natural nails.',price:'£25',duration:'To be confirmed',detailedPricing:'',followUpPricing:'',patchTest:false,visible:true},
  ...[
    ['skin-peeling','Skin Peeling','A skin-renewal treatment designed to improve texture and radiance.'],
    ['vitamin-injections','Vitamin Injections','Targeted vitamin treatments, subject to consultation and suitability.'],
    ['threading','Threading','Precise hair removal using a traditional threading technique.'],
    ['cream-tanning','Cream Tanning','An even, sun-kissed finish applied using a professional tanning cream.'],
    ['spray-tanning','Spray Tanning','A professionally applied tan for an even, natural-looking glow.']
  ].map(([id,title,shortDescription]) => ({id,category:'coming-soon',title,shortDescription,fullDescription:shortDescription,price:'Coming soon',duration:'Coming soon',detailedPricing:'',followUpPricing:'',patchTest:false,visible:true}))
];

const views = ['sectionEditorView','dashboardView','homepageView','homepageSummaryView','homepageEditorView','homepagePreviewView','treatmentsView','treatmentSummaryView','editorView','previewView'];
let homepageOriginal = {
  heroTitleFirst:'Effortless',
  heroTitleSecond:'Beauty',
  heroLine:'Enhance. Simplify.',
  heroLineEmphasis:'Feel beautiful.',
  intro:'Soft, natural-looking brows and permanent makeup designed to make everyday beauty feel effortless.',
  primaryButton:'Book online',
  secondaryButton:'Aftercare guide',
  sectionKicker:'Why clients choose us',
  sectionHeading:'Polished results, calm appointments, clear aftercare.',
  features:[
    {title:'Natural finish',text:'Designed to complement your face rather than overpower it.'},
    {title:'Low-maintenance beauty',text:'Wake up with shape, definition and softness already in place.'},
    {title:'Client-friendly care',text:'Aftercare is explained clearly, including the normal healing stages.'}
  ]
};
let homepageWorking = JSON.parse(JSON.stringify(homepageOriginal));
function setHomepageDraftStatus(message){
  const element=document.querySelector('#homepageDraftStatus');
  if(element)element.textContent=message;
}
function setHomepagePublishStatus(message='', type=''){
  const element=document.querySelector('#homepagePublishStatus');
  if(!element)return;
  element.textContent=message;
  element.classList.toggle('error',type==='error');
  element.classList.toggle('success',type==='success');
}
async function loadPublishedHomepage(){
  try{
    const response=await fetch(HOMEPAGE_API,{cache:'no-store'});
    if(response.status===404)return;
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'Published homepage could not be loaded.');
    if(result?.data?.features){
      homepageOriginal=clone(result.data);
      delete homepageOriginal.schemaVersion;
      delete homepageOriginal.updatedAt;
      homepageWorking=clone(homepageOriginal);
      updatePublishedDisplay(result.data.updatedAt);
    }
  }catch(error){console.warn(error);}
}
async function loadHomepageDraft(){
  try{
    const response=await fetch(HOMEPAGE_DRAFT_API,{cache:'no-store',credentials:'same-origin'});
    if(response.status===404){homepageWorking=clone(homepageOriginal);homepageDirty=false;homepageSavedAt=null;return;}
    if(response.status===401)return;
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'Homepage draft could not be loaded.');
    if(result?.data?.content){
      homepageWorking=clone(result.data.content);
      homepageSavedAt=result.data.savedAt||null;
      homepageDirty=JSON.stringify(homepageWorking)!==JSON.stringify(homepageOriginal);
    }
  }catch(error){console.warn(error);}
}
async function saveHomepageDraft(){
  clearTimeout(homepageDraftTimer);
  homepageDraftTimer=null;
  if(homepageDraftSaving){homepageDraftQueued=true;return;}
  homepageDraftSaving=true;
  setHomepageDraftStatus('Saving online…');
  try{
    const response=await fetch(HOMEPAGE_DRAFT_API,{
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      credentials:'same-origin',
      body:JSON.stringify({schemaVersion:1,content:homepageWorking})
    });
    const result=await response.json().catch(()=>({}));
    if(response.status===401){setHomepageDraftStatus('Sign in again to save');lockManager();return;}
    if(!response.ok)throw new Error(result.error||'Homepage draft could not be saved.');
    homepageSavedAt=result.savedAt;
    setHomepageDraftStatus(`✓ Saved online · ${relativeTime(result.savedAt)}`);
  }catch(error){
    setHomepageDraftStatus('Could not save online — changes remain on this screen');
    console.warn(error);
  }finally{
    homepageDraftSaving=false;
    if(homepageDraftQueued){homepageDraftQueued=false;scheduleHomepageDraftSave();}
  }
}
function scheduleHomepageDraftSave(){
  clearTimeout(homepageDraftTimer);
  setHomepageDraftStatus('Saving online…');
  homepageDraftTimer=setTimeout(saveHomepageDraft,600);
}

const homepageSections = [
  {id:'hero',title:'Hero',description:'The main heading and opening message at the top of the website.',icon:'⌂',fields:[
    {label:'First heading line',path:'heroTitleFirst',required:true,maxLength:60},
    {label:'Second heading line',path:'heroTitleSecond',required:true,maxLength:60},
    {label:'Supporting line',path:'heroLine',required:true,maxLength:100},
    {label:'Emphasised words',path:'heroLineEmphasis',required:true,maxLength:100},
    {label:'Primary button',path:'primaryButton',required:true,maxLength:40},
    {label:'Secondary button',path:'secondaryButton',required:true,maxLength:40}
  ]},
  {id:'introduction',title:'Introduction',description:'The short welcome message beneath the hero area.',icon:'✦',fields:[
    {label:'Introduction',path:'intro',required:true,multiline:true,maxLength:500,help:'Keep this warm, clear and easy to scan on a phone.'}
  ]},
  {id:'why-choose-us',title:'Why Choose Us',description:'The heading that introduces the reasons clients choose Effortless Beauty.',icon:'♡',fields:[
    {label:'Small heading',path:'sectionKicker',required:true,maxLength:80},
    {label:'Main heading',path:'sectionHeading',required:true,multiline:true,maxLength:180}
  ]},
  {id:'feature-cards',title:'Feature Cards',description:'The three reassurance cards shown on the homepage.',icon:'◇',featureEditor:true}
];
const DRAFT_VERSION = 1;
const draftKey = id => `eb-treatment-draft:${id}`;
const clone = value => JSON.parse(JSON.stringify(value));
const findTreatment = id => treatments.find(item => item.id === id);
const treatmentDocument = () => ({
  schemaVersion: 1,
  eyebrow: 'Treatments',
  heading: 'Treatment menu',
  intro: 'Explore Effortless Beauty treatments, prices and appointment times.',
  items: treatments.map(item => clone(readDraft(item.id)?.record || item))
});
function setPublishStatus(message='', type=''){
  const element=document.querySelector('#publishStatus');
  if(!element)return;
  element.textContent=message;
  element.classList.toggle('error',type==='error');
  element.classList.toggle('success',type==='success');
}
function formatPublishedAt(value){
  if(!value)return 'Not published yet';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return 'Published';
  return date.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function updatePublishedDisplay(value){
  const element=document.querySelector('#lastPublishedValue');
  if(element)element.textContent=formatPublishedAt(value);
}
async function loadPublishedTreatments(){
  try{
    const response=await fetch(TREATMENTS_API,{cache:'no-store'});
    if(response.status===404)return;
    if(!response.ok)throw new Error('Published treatments could not be loaded.');
    const result=await response.json();
    if(Array.isArray(result?.data?.items)){
      treatments=result.data.items.map(item=>({...item}));
      updatePublishedDisplay(result.data.updatedAt);
      renderTreatments();
    }
  }catch(error){
    console.warn(error);
  }
}
async function publishTreatments(){
  if(publishing)return;
  flushDraft();
  const user=await getUser().catch(()=>null);
  if(!user){
    setPublishStatus('Your session has expired. Sign in again to publish.','error');
    lockManager();
    return;
  }
  publishing=true;
  const button=document.querySelector('#editorPublishButton');
  button.disabled=true;
  button.textContent='Publishing…';
  setPublishStatus('Publishing your changes…');
  try{
    const response=await fetch(TREATMENTS_API,{
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      credentials:'same-origin',
      body:JSON.stringify(treatmentDocument())
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'Your changes could not be published.');
    treatments=result.data.items.map(item=>({...item}));
    treatments.forEach(item=>localStorage.removeItem(draftKey(item.id)));
    editorDirty=false;
    updatePublishedDisplay(result.updatedAt);
    setDraftStatus(`✓ Published · ${relativeTime(result.updatedAt)}`);
    setPublishStatus('✓ Published successfully. The live website now uses these changes.','success');
    renderTreatments();
  }catch(error){
    setPublishStatus(error.message||'Your changes could not be published.','error');
  }finally{
    publishing=false;
    button.disabled=false;
    button.textContent='Publish';
  }
}

function showPanel(name){Object.entries(panels).forEach(([key,panel])=>{panel.hidden=key!==name;});}
function showAppView(id){views.forEach(viewId=>{document.querySelector(`#${viewId}`).hidden=viewId!==id;});window.scrollTo({top:0,behavior:'instant'});}
function currentAppView(){return views.find(viewId=>!document.querySelector(`#${viewId}`).hidden)||'dashboardView';}
function captureLockContext(){return {viewId:currentAppView(),activeTreatmentId,activeCategory,activeHomepageSection,activeSiteSection,editorStep};}
function setAppInert(value){views.forEach(viewId=>{document.querySelector(`#${viewId}`).inert=value;});}
function resetInactivityTimer(){
  clearTimeout(inactivityTimer);
  if(inactivityLocked||panels.success.hidden)return;
  inactivityTimer=setTimeout(lockManager,INACTIVITY_TIMEOUT_MS);
}
function lockManager(){
  if(inactivityLocked||panels.success.hidden)return;
  if(editorDirty&&currentAppView()==='editorView')flushDraft();
  if(homepageDraftTimer)saveHomepageDraft();
  lockContext=captureLockContext();
  inactivityLocked=true;
  setAppInert(true);
  document.querySelector('#inactivityLock').hidden=false;
  clearTimeout(inactivityTimer);
}
function restoreLockedContext(){
  if(!lockContext){showAppView('dashboardView');return;}
  activeTreatmentId=lockContext.activeTreatmentId;
  activeCategory=lockContext.activeCategory||'signature';
  activeHomepageSection=lockContext.activeHomepageSection||activeHomepageSection;
  editorStep=Math.max(0,Math.min(4,lockContext.editorStep||0));
  if(lockContext.viewId==='homepageView')renderHomepageSections();
  if(lockContext.viewId==='homepageSummaryView'&&activeHomepageSection){const section=homepageSections.find(item=>item.id===activeHomepageSection);if(section)document.querySelector('#homepageSummary').innerHTML=homepageSummaryMarkup(section);}
  if(lockContext.viewId==='homepageEditorView'&&activeHomepageSection)renderHomepageEditor();
  if(lockContext.viewId==='homepagePreviewView'&&activeHomepageSection)renderHomepagePreview();
  if(lockContext.viewId==='sectionEditorView'&&lockContext.activeSiteSection){activeSiteSection=lockContext.activeSiteSection;renderSiteSectionEditor();}
  if(lockContext.viewId==='treatmentsView')renderTreatments();
  if(lockContext.viewId==='treatmentSummaryView'&&activeTreatmentId){
    const draft=readDraft(activeTreatmentId);const record=draft?.record||findTreatment(activeTreatmentId);
    document.querySelector('#treatmentSummary').innerHTML=summaryMarkup(record,{preview:Boolean(draft)});
  }
  if(lockContext.viewId==='editorView')renderEditorStep();
  showAppView(lockContext.viewId||'dashboardView');
}
function unlockManager(){
  inactivityLocked=false;
  document.querySelector('#inactivityLock').hidden=true;
  setAppInert(false);
  resetInactivityTimer();
}
function clearIdentityCallbackUrl(){history.replaceState(null,document.title,'/manage/');}
function showLogin(){signedInAs.textContent='';successMessage.textContent='You are securely signed in.';clearTimeout(inactivityTimer);showPanel('login');}
function showSuccess(user,message='Manage your Effortless Beauty website from one place.'){
  successMessage.textContent=message;
  signedInAs.textContent=user?.email||'Authenticated user';
  showPanel('success');
  Promise.allSettled([loadPublishedTreatments(),loadPublishedHomepage().then(loadHomepageDraft)]).then(()=>{
    if(resumeAfterLogin){restoreLockedContext();resumeAfterLogin=false;unlockManager();}
    else{showAppView('dashboardView');unlockManager();lockContext=null;}
  });
}
function showError(error){errorMessage.textContent=error?.message||error?.msg||'The login service could not complete that request.';showPanel('error');}
function passwordsMatch(password,confirmation){if(password!==confirmation)throw new Error('The two passwords do not match.');if(password.length<8)throw new Error('Your password must contain at least 8 characters.');}
function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
function nl2br(value=''){return escapeHtml(value).replace(/\n/g,'<br>');}

function readDraft(id){
  try{
    const stored=JSON.parse(localStorage.getItem(draftKey(id))||'null');
    if(!stored)return null;
    if(stored.record)return stored;
    const {savedAt,...record}=stored;
    return {version:DRAFT_VERSION,treatmentId:id,savedAt:savedAt||new Date().toISOString(),record};
  }catch{return null;}
}
function writeDraft(record){
  const savedAt=new Date().toISOString();
  const payload={version:DRAFT_VERSION,treatmentId:record.id,savedAt,editorStep,record:clone(record)};
  localStorage.setItem(draftKey(record.id),JSON.stringify(payload));
  setDraftStatus(`✓ Saved · ${relativeTime(savedAt)}`);
  renderTreatments();
  return payload;
}
function removeDraft(id){localStorage.removeItem(draftKey(id));renderTreatments();}
function relativeTime(value){
  const elapsed=Math.max(0,Date.now()-new Date(value).getTime());
  const seconds=Math.floor(elapsed/1000);
  if(seconds<10)return 'Just now';
  if(seconds<60)return `${seconds} seconds ago`;
  const minutes=Math.floor(seconds/60);
  if(minutes===1)return '1 minute ago';
  if(minutes<60)return `${minutes} minutes ago`;
  const hours=Math.floor(minutes/60);
  if(hours===1)return '1 hour ago';
  if(hours<24)return `${hours} hours ago`;
  return new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
}
function setDraftStatus(text){document.querySelector('#draftStatus').textContent=text;}
function currentRecord(){
  const base=clone(findTreatment(activeTreatmentId));
  const form=new FormData(document.querySelector('#treatmentEditorForm'));
  return {...base,title:form.get('title')?.trim()||'',shortDescription:form.get('shortDescription')?.trim()||'',price:form.get('price')?.trim()||'',duration:form.get('duration')?.trim()||'',fullDescription:form.get('fullDescription')?.trim()||'',detailedPricing:form.get('detailedPricing')?.trim()||'',followUpPricing:form.get('followUpPricing')?.trim()||'',patchTest:document.querySelector('#editPatchTest').checked,visible:document.querySelector('#editVisible').checked,initialPriceLinked};
}
function flushDraft(){
  if(!activeTreatmentId||document.querySelector('#editorView').hidden)return null;
  clearTimeout(draftTimer);
  draftTimer=null;
  return writeDraft(currentRecord());
}

function renderTreatments(){
  document.querySelectorAll('.treatment-tabs [role="tab"]').forEach(btn=>btn.setAttribute('aria-selected',String(btn.dataset.category===activeCategory)));
  const items=treatments.filter(item=>item.category===activeCategory);
  document.querySelector('#treatmentList').innerHTML=items.map(item=>{
    const draft=readDraft(item.id);
    const displayItem=draft?.record||item;
    const draftLabel=draft?`<em data-draft-time="${escapeHtml(draft.savedAt)}">Unpublished · ${escapeHtml(relativeTime(draft.savedAt))}</em>`:'';
    return `<button class="treatment-row" type="button" data-treatment-id="${item.id}"><span><strong>${escapeHtml(displayItem.title)}</strong><small>${escapeHtml(displayItem.price)} · ${escapeHtml(displayItem.duration)}</small></span><span class="row-meta">${draftLabel}<b aria-hidden="true">›</b></span></button>`;
  }).join('');
}
function refreshDraftTimes(){
  document.querySelectorAll('[data-draft-time]').forEach(el=>{el.textContent=`Unpublished · ${relativeTime(el.dataset.draftTime)}`;});
  const draft=activeTreatmentId&&readDraft(activeTreatmentId);
  if(draft&&!document.querySelector('#editorView').hidden)setDraftStatus(`✓ Saved · ${relativeTime(draft.savedAt)}`);
}
function summaryMarkup(record,{preview=false}={}){
  return `<div class="summary-hero"><div class="summary-image-placeholder" aria-hidden="true">${record.imageData?`<img src="${record.imageData}" alt="">`:'✦'}</div><p class="eyebrow">${escapeHtml(record.category.replace('-', ' '))}</p><h1>${escapeHtml(record.title)}</h1><p class="summary-intro">${escapeHtml(record.shortDescription)}</p><div class="summary-facts"><span><small>Price</small><strong>${escapeHtml(record.price||'Not set')}</strong></span><span><small>Treatment time</small><strong>${escapeHtml(record.duration||'Not set')}</strong></span></div></div><div class="summary-details"><h2>About this treatment</h2><p>${nl2br(record.fullDescription||'No full description has been added yet.')}</p>${record.detailedPricing?`<h3>Detailed pricing</h3><p>${nl2br(record.detailedPricing)}</p>`:''}${record.followUpPricing?`<h3>Follow-up pricing</h3><p>${nl2br(record.followUpPricing)}</p>`:''}<dl><div><dt>Patch test</dt><dd>${record.patchTest?'Required':'Not required'}</dd></div><div><dt>Website visibility</dt><dd>${record.visible?'Visible':'Hidden'}</dd></div></dl>${preview?'<p class="preview-note">This is an unpublished preview. The live website has not changed.</p>':''}</div>`;
}
function openSummary(id){activeTreatmentId=id;const draft=readDraft(id);const record=draft?.record||findTreatment(id);document.querySelector('#treatmentSummary').innerHTML=summaryMarkup(record,{preview:Boolean(draft)});showAppView('treatmentSummaryView');history.pushState({view:'summary'},'',`#treatment-${id}`);}
function populateEditor(record,restoredStep=0){
  document.querySelector('#editTitle').value=record.title||'';
  document.querySelector('#editShortDescription').value=record.shortDescription||'';
  document.querySelector('#editPrice').value=record.price||'';
  document.querySelector('#editDuration').value=record.duration||'';
  document.querySelector('#editFullDescription').value=record.fullDescription||'';
  initialPriceLinked=record.initialPriceLinked ?? (!record.detailedPricing || record.detailedPricing===`Initial treatment: ${record.price||''}`);
  document.querySelector('#editDetailedPricing').value=record.detailedPricing||(record.price?`Initial treatment: ${record.price}`:'');
  document.querySelector('#initialPriceHint').textContent=initialPriceLinked?'Uses the main price until you change this field.':'Custom pricing';
  document.querySelector('#editFollowUpPricing').value=record.followUpPricing||'';
  document.querySelector('#editPatchTest').checked=Boolean(record.patchTest);
  document.querySelector('#editVisible').checked=Boolean(record.visible);
  const img=document.querySelector('#editorImagePreview');img.hidden=true;img.removeAttribute('src');
  editorStep=Math.max(0,Math.min(4,restoredStep||0));sessionImageUrl='';renderEditorStep();showAppView('editorView');history.pushState({view:'editor'},'',`#edit-${activeTreatmentId}`);
}
function startEditor(){
  const draft=readDraft(activeTreatmentId);
  const record=draft?clone(draft.record):clone(findTreatment(activeTreatmentId));
  editorDirty=Boolean(draft);
  populateEditor(record,0);
  setDraftStatus(draft?`✓ Changes restored · ${relativeTime(draft.savedAt)}`:'✓ Autosave on');
}
function requestEditor(){startEditor();}
function renderEditorStep(){document.querySelectorAll('.editor-step').forEach((step,index)=>step.hidden=index!==editorStep);document.querySelector('#editorPreviousButton').hidden=editorStep===0;document.querySelector('#editorNextButton').hidden=editorStep===4;document.querySelector('#editorPreviewButton').hidden=editorStep!==4;document.querySelector('#editorPublishButton').hidden=editorStep!==4;document.querySelector('#editorProgressBar').style.width=`${((editorStep+1)/5)*100}%`;if(editorStep!==4)setPublishStatus('');}
function validateStep(){const step=document.querySelector(`.editor-step[data-step="${editorStep}"]`);const invalid=[...step.querySelectorAll('[required]')].find(field=>!field.value.trim());if(invalid){invalid.reportValidity();invalid.focus();return false;}return true;}
function requestLeave(target){flushDraft();leaveEditor(target);}
function leaveEditor(target){editorDirty=false;clearTimeout(draftTimer);if(target==='dashboard')showAppView('dashboardView');else if(target==='treatments'){renderTreatments();showAppView('treatmentsView');}else openSummary(activeTreatmentId);}

function previewHomepageWebsite(){
  try{
    localStorage.setItem('eb-homepage-preview-v1',JSON.stringify(homepageWorking));
    window.open('/?preview=homepage#home','_blank','noopener');
    setHomepagePublishStatus('Preview opened in a new tab. The live website has not changed.');
  }catch(error){setHomepagePublishStatus('The website preview could not be opened.','error');}
}
async function publishHomepage(){
  if(homepagePublishing)return;
  const user=await getUser().catch(()=>null);
  if(!user){setHomepagePublishStatus('Your session has expired. Sign in again to publish.','error');lockManager();return;}
  if(homepageDraftTimer||homepageDraftSaving)await saveHomepageDraft();
  if(!confirm('Publish these Homepage changes to the live website?'))return;
  homepagePublishing=true;
  const button=document.querySelector('#homepagePublishButton');
  button.disabled=true;button.textContent='Publishing…';
  setHomepagePublishStatus('Publishing your homepage…');
  try{
    const response=await fetch(HOMEPAGE_API,{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({content:homepageWorking})});
    const result=await response.json().catch(()=>({}));
    if(response.status===401){setHomepagePublishStatus('Your session has expired. Sign in again to publish.','error');lockManager();return;}
    if(!response.ok)throw new Error(result.error||'Your homepage could not be published.');
    homepageOriginal=clone(result.data);delete homepageOriginal.schemaVersion;delete homepageOriginal.updatedAt;
    homepageWorking=clone(homepageOriginal);homepageDirty=false;homepageSavedAt=null;
    updatePublishedDisplay(result.updatedAt);
    setHomepageDraftStatus(`✓ Published · ${relativeTime(result.updatedAt)}`);
    setHomepagePublishStatus('✓ Published successfully. The live homepage now uses these changes.','success');
    renderHomepageSections();
  }catch(error){setHomepagePublishStatus(error.message||'Your homepage could not be published.','error');}
  finally{homepagePublishing=false;button.disabled=false;button.textContent='Publish homepage';}
}
function renderHomepageSections(){
  document.querySelector('#homepageSectionList').innerHTML=homepageSections.map(section=>`<button class="homepage-section-row" type="button" data-homepage-section="${escapeHtml(section.id)}"><span class="homepage-section-icon" aria-hidden="true">${escapeHtml(section.icon)}</span><span><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(section.description)}</small></span><b aria-hidden="true">›</b></button>`).join('');
}
function homepageSectionValues(section){
  if(section.featureEditor)return homepageWorking.features.map(feature=>[feature.title,feature.text]);
  return section.fields.map(field=>[field.label,homepageWorking[field.path]]);
}
function homepageSummaryMarkup(section,{preview=false}={}){
  const values=homepageSectionValues(section);
  const fields=section.featureEditor?'':values.map(([label,value])=>`<div class="homepage-content-field"><small>${escapeHtml(label)}</small><p>${escapeHtml(value)}</p></div>`).join('');
  const features=section.featureEditor?values.map(([title,text])=>`<div class="homepage-feature-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`).join(''):'';
  const note=preview?'This is a private section preview. The live website has not changed.':(homepageDirty?'Unpublished changes are saved safely online. Preview the whole website before publishing.':'This section matches the live homepage. Choose Edit section to update it.');
  return `<div class="homepage-summary-heading"><span class="homepage-section-icon" aria-hidden="true">${escapeHtml(section.icon)}</span><p class="eyebrow">${preview?'Homepage preview':'Homepage section'}</p><h1>${escapeHtml(section.title)}</h1><p>${escapeHtml(section.description)}</p></div><div class="homepage-summary-content">${fields}${features?`<div class="homepage-feature-grid">${features}</div>`:''}<p class="read-only-note">${escapeHtml(note)}</p></div>`;
}
function openHomepageSummary(id){
  const section=homepageSections.find(item=>item.id===id);
  if(!section)return;
  activeHomepageSection=id;
  document.querySelector('#homepageSummary').innerHTML=homepageSummaryMarkup(section);
  showAppView('homepageSummaryView');
  history.pushState({view:'homepage-summary',section:id},'',`#homepage-${id}`);
}
function homepageFieldMarkup(field,value){
  const attrs=`data-homepage-path="${escapeHtml(field.path)}" maxlength="${field.maxLength||500}" ${field.required?'required':''}`;
  const control=field.multiline?`<textarea ${attrs} rows="5">${escapeHtml(value)}</textarea>`:`<input ${attrs} type="text" value="${escapeHtml(value)}" />`;
  return `<label><span>${escapeHtml(field.label)}</span>${control}${field.help?`<small>${escapeHtml(field.help)}</small>`:''}</label>`;
}
function renderHomepageEditor(){
  const section=homepageSections.find(item=>item.id===activeHomepageSection);
  if(!section)return;
  let fields='';
  if(section.featureEditor){
    fields=homepageWorking.features.map((feature,index)=>`<fieldset class="homepage-feature-editor"><legend>Card ${index+1}</legend><label><span>Title</span><input data-homepage-feature="${index}" data-feature-key="title" maxlength="80" required type="text" value="${escapeHtml(feature.title)}" /></label><label><span>Description</span><textarea data-homepage-feature="${index}" data-feature-key="text" maxlength="300" required rows="4">${escapeHtml(feature.text)}</textarea></label></fieldset>`).join('');
  }else fields=section.fields.map(field=>homepageFieldMarkup(field,homepageWorking[field.path])).join('');
  document.querySelector('#homepageEditorFields').innerHTML=`<p class="eyebrow">Homepage editor</p><h1>${escapeHtml(section.title)}</h1><p>${escapeHtml(section.description)}</p>${fields}`;
  setHomepageDraftStatus(homepageSavedAt?`✓ Saved online · ${relativeTime(homepageSavedAt)}`:'✓ Autosave on');
}
function startHomepageEditor(){renderHomepageEditor();showAppView('homepageEditorView');history.pushState({view:'homepage-editor',section:activeHomepageSection},'',`#homepage-${activeHomepageSection}-edit`);}
function updateHomepageWorking(target){
  if(target.dataset.homepagePath)homepageWorking[target.dataset.homepagePath]=target.value;
  if(target.dataset.homepageFeature!=null){const feature=homepageWorking.features[Number(target.dataset.homepageFeature)];if(feature)feature[target.dataset.featureKey]=target.value;}
  homepageDirty=true;
  scheduleHomepageDraftSave();
}
function validateHomepageEditor(){const invalid=[...document.querySelectorAll('#homepageEditorForm [required]')].find(field=>!field.value.trim());if(invalid){invalid.reportValidity();invalid.focus();return false;}return true;}
function resetHomepageSection(){
  const section=homepageSections.find(item=>item.id===activeHomepageSection);if(!section)return;
  if(section.featureEditor)homepageWorking.features=clone(homepageOriginal.features);
  else section.fields.forEach(field=>{homepageWorking[field.path]=homepageOriginal[field.path];});
  homepageDirty=JSON.stringify(homepageWorking)!==JSON.stringify(homepageOriginal);
  renderHomepageEditor();
  scheduleHomepageDraftSave();
}
function renderHomepagePreview(){const section=homepageSections.find(item=>item.id===activeHomepageSection);if(section)document.querySelector('#homepagePreview').innerHTML=homepageSummaryMarkup(section,{preview:true});}

// Dashboard and Homepage flow
 document.querySelector('#openHomepageButton').addEventListener('click',()=>{renderHomepageSections();showAppView('homepageView');history.pushState({view:'homepage'},'','#homepage');});
document.querySelector('#homepageBackButton').addEventListener('click',()=>showAppView('dashboardView'));
document.querySelector('#homepageWebsitePreviewButton').addEventListener('click',previewHomepageWebsite);
document.querySelector('#homepagePublishButton').addEventListener('click',publishHomepage);
document.querySelector('#homepageSummaryBackButton').addEventListener('click',()=>{renderHomepageSections();showAppView('homepageView');});
document.querySelector('#homepageSectionList').addEventListener('click',event=>{const row=event.target.closest('[data-homepage-section]');if(row)openHomepageSummary(row.dataset.homepageSection);});
document.querySelector('#editHomepageSectionButton').addEventListener('click',startHomepageEditor);
document.querySelector('#homepageEditorForm').addEventListener('input',event=>{if(event.target.matches('input,textarea'))updateHomepageWorking(event.target);});
document.querySelector('#homepageEditorLeaveButton').addEventListener('click',()=>{if(homepageDraftTimer)saveHomepageDraft();openHomepageSummary(activeHomepageSection);});
document.querySelector('#homepageDoneButton').addEventListener('click',()=>{if(!validateHomepageEditor())return;if(homepageDraftTimer)saveHomepageDraft();openHomepageSummary(activeHomepageSection);});
document.querySelector('#homepagePreviewButton').addEventListener('click',()=>{if(!validateHomepageEditor())return;if(homepageDraftTimer)saveHomepageDraft();renderHomepagePreview();showAppView('homepagePreviewView');});
document.querySelector('#homepagePreviewBackButton').addEventListener('click',()=>{renderHomepageEditor();showAppView('homepageEditorView');});
document.querySelector('#discardHomepageChangesButton').addEventListener('click',()=>{const section=homepageSections.find(item=>item.id===activeHomepageSection);if(!section||!confirm(`Discard changes to ${section.title}?`))return;resetHomepageSection();setHomepageDraftStatus('Saving restored content…');});
document.querySelector('#openTreatmentsButton').addEventListener('click',()=>{activeCategory='signature';renderTreatments();showAppView('treatmentsView');history.pushState({view:'treatments'},'','#treatments');});
document.querySelector('#treatmentsBackButton').addEventListener('click',()=>showAppView('dashboardView'));
document.querySelector('#summaryBackButton').addEventListener('click',()=>{renderTreatments();showAppView('treatmentsView');});
document.querySelectorAll('.treatment-tabs [role="tab"]').forEach(btn=>btn.addEventListener('click',()=>{activeCategory=btn.dataset.category;renderTreatments();}));
document.querySelector('#treatmentList').addEventListener('click',event=>{const row=event.target.closest('[data-treatment-id]');if(row)openSummary(row.dataset.treatmentId);});
document.querySelector('#editTreatmentButton').addEventListener('click',requestEditor);

// Editor protection and flow
document.querySelector('#treatmentEditorForm').addEventListener('input',()=>{
  editorDirty=true;
  setDraftStatus('Saving…');
  clearTimeout(draftTimer);
  draftTimer=setTimeout(()=>{writeDraft(currentRecord());editorDirty=true;},350);
});
document.querySelector('#editPrice').addEventListener('input',event=>{if(!initialPriceLinked)return;const value=event.target.value.trim();document.querySelector('#editDetailedPricing').value=value?`Initial treatment: ${value}`:'';document.querySelector('#initialPriceHint').textContent='Uses the main price until you change this field.';});
document.querySelector('#editDetailedPricing').addEventListener('input',event=>{const price=document.querySelector('#editPrice').value.trim();initialPriceLinked=event.target.value.trim()===(price?`Initial treatment: ${price}`:'');document.querySelector('#initialPriceHint').textContent=initialPriceLinked?'Uses the main price until you change this field.':'Custom pricing';});
document.querySelector('#editImage').addEventListener('change',event=>{const file=event.target.files?.[0];if(!file)return;if(sessionImageUrl)URL.revokeObjectURL(sessionImageUrl);sessionImageUrl=URL.createObjectURL(file);const img=document.querySelector('#editorImagePreview');img.src=sessionImageUrl;img.hidden=false;editorDirty=true;setDraftStatus('Photo selected for this preview only');});
document.querySelector('#editorNextButton').addEventListener('click',()=>{if(validateStep()){flushDraft();editorDirty=true;editorStep=Math.min(4,editorStep+1);renderEditorStep();}});
document.querySelector('#editorPreviousButton').addEventListener('click',()=>{flushDraft();editorDirty=true;editorStep=Math.max(0,editorStep-1);renderEditorStep();});
document.querySelector('#discardChangesButton').addEventListener('click',()=>{const treatment=findTreatment(activeTreatmentId);if(!confirm(`Discard unpublished changes to ${treatment.title}?`))return;removeDraft(activeTreatmentId);editorDirty=false;populateEditor(clone(treatment),0);setDraftStatus('✓ Unpublished changes discarded');});
document.querySelector('#editorPreviewButton').addEventListener('click',()=>{const record=currentRecord();writeDraft(record);editorDirty=true;if(sessionImageUrl)record.imageData=sessionImageUrl;document.querySelector('#treatmentPreview').innerHTML=summaryMarkup(record,{preview:true});showAppView('previewView');});
document.querySelector('#editorPublishButton').addEventListener('click',publishTreatments);
document.querySelector('#previewBackButton').addEventListener('click',()=>showAppView('editorView'));
document.querySelector('#editorLeaveButton').addEventListener('click',()=>requestLeave('summary'));
window.addEventListener('pagehide',()=>{if(editorDirty)flushDraft();if(homepageDraftTimer)saveHomepageDraft();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){if(editorDirty)flushDraft();if(homepageDraftTimer)saveHomepageDraft();}});
window.addEventListener('popstate',()=>{if(!document.querySelector('#editorView').hidden){flushDraft();leaveEditor('summary');}});
setInterval(refreshDraftTimes,30000);

// Calm inactivity lock. Work is saved before the manager is hidden.
document.querySelector('#continueSecurelyButton').addEventListener('click',()=>{
  resumeAfterLogin=true;
  const email=signedInAs.textContent.trim();
  if(email&&email.includes('@'))document.querySelector('#loginEmail').value=email;
  document.querySelector('#loginPassword').value='';
  showPanel('login');
  setTimeout(()=>document.querySelector('#loginPassword').focus(),0);
});
['pointerdown','keydown','touchstart','input','change'].forEach(eventName=>{
  document.addEventListener(eventName,()=>{if(!inactivityLocked)resetInactivityTimer();},{passive:true});
});

// Authentication
document.querySelector('#recoveryRequestButton').addEventListener('click',async()=>{const emailInput=document.querySelector('#loginEmail');const message=document.querySelector('#recoveryRequestMessage');const email=emailInput.value.trim();if(!email){emailInput.focus();message.textContent='Enter your email address first, then select Forgotten your password?';message.hidden=false;return;}try{message.textContent='Sending password reset email…';message.hidden=false;await requestPasswordRecovery(email);message.textContent='Password reset email sent. Check your inbox and spam folder.';}catch(error){message.textContent=error?.message||'The password reset email could not be sent. Please try again.';}});
async function initialiseAuthentication(){const heading=document.querySelector('#loadingPanel h1');const message=document.querySelector('#loadingPanel p:last-child');try{heading.textContent='Checking your access…';message.textContent='Starting authentication…';const hasIdentityToken=/^#(?:invite_token|recovery_token|confirmation_token)=/.test(window.location.hash);let callback=null;if(hasIdentityToken){message.textContent='Processing the secure email link…';callback=await handleAuthCallback();}if(callback){switch(callback.type){case'invite':inviteToken=callback.token;showPanel('invite');return;case'recovery':clearIdentityCallbackUrl();showPanel('recovery');return;case'confirmation':case'email_change':case'oauth':clearIdentityCallbackUrl();showSuccess(callback.user);return;default:clearIdentityCallbackUrl();if(callback.user){showSuccess(callback.user);return;}}}const user=await getUser();user?showSuccess(user):showLogin();}catch(error){showError(error);}}
document.querySelector('#loginForm').addEventListener('submit',async event=>{event.preventDefault();showPanel('loading');try{showSuccess(await login(document.querySelector('#loginEmail').value.trim(),document.querySelector('#loginPassword').value));}catch(error){showError(error);}});
document.querySelector('#inviteForm').addEventListener('submit',async event=>{event.preventDefault();try{const password=document.querySelector('#invitePassword').value;passwordsMatch(password,document.querySelector('#invitePasswordConfirm').value);if(!inviteToken)throw new Error('The invitation token is missing or has expired. Request a new invitation and try again.');showPanel('loading');const user=await acceptInvite(inviteToken,password);inviteToken=null;clearIdentityCallbackUrl();showSuccess(user,'Your editor account is active.');}catch(error){showError(error);}});
document.querySelector('#recoveryForm').addEventListener('submit',async event=>{event.preventDefault();try{const password=document.querySelector('#recoveryPassword').value;passwordsMatch(password,document.querySelector('#recoveryPasswordConfirm').value);showPanel('loading');showSuccess(await updateUser({password}),'Your password has been updated.');}catch(error){showError(error);}});
document.querySelector('#logoutButton').addEventListener('click',async()=>{try{if(editorDirty&&currentAppView()==='editorView')flushDraft();if(homepageDraftTimer)await saveHomepageDraft();clearTimeout(inactivityTimer);resumeAfterLogin=false;lockContext=null;inactivityLocked=false;document.querySelector('#inactivityLock').hidden=true;setAppInert(false);await logout();showLogin();}catch(error){showError(error);}});
document.querySelector('#retryButton').addEventListener('click',()=>{clearIdentityCallbackUrl();showLogin();});

// Website Manager v1: shared editor for the remaining public-site sections.
const SECTION_API='/.'+'netlify/functions/site-section';
let activeSiteSection=null;
let siteSectionOriginal=null;
let siteSectionWorking=null;
let siteSectionSaveTimer=null;
let siteSectionSaving=false;
const sectionDefinitions={
  pricelists:{title:'Price Lists',description:'Update treatment prices and times.',publicTab:'prices',fields:[
    {path:'eyebrow',label:'Small heading',required:true},{path:'heading',label:'Main heading',required:true},{path:'intro',label:'Introduction',type:'textarea',required:true},
    {path:'groups',label:'Price list entries',type:'priceGroups',help:'One line per treatment: Group | Treatment | Price | Time'}]},
  aftercare:{title:'Aftercare',description:'Update the healing guide wording while keeping the approved artwork.',publicTab:'aftercare',fields:[
    {path:'eyebrow',label:'Small heading',required:true},{path:'heading',label:'Main heading',required:true},{path:'intro',label:'Introduction',type:'textarea',required:true},
    {path:'stages',label:'Healing stages',type:'stages',help:'One line per stage: Day | Description'}]},
  gallery:{title:'Gallery',description:'Manage approved gallery entries. Image paths can be connected now; direct uploads remain a later enhancement.',publicTab:'gallery',fields:[
    {path:'eyebrow',label:'Small heading',required:true},{path:'heading',label:'Main heading',required:true},{path:'intro',label:'Introduction',type:'textarea',required:true},
    {path:'items',label:'Gallery entries',type:'gallery',help:'One line per image: Title | Caption | Image path | Alt text | Show yes/no'}]},
  merchandise:{title:'Merchandise',description:'Update merchandise categories and their descriptions.',publicTab:'merchandise',fields:[
    {path:'eyebrow',label:'Small heading',required:true},{path:'heading',label:'Main heading',required:true},{path:'intro',label:'Introduction',type:'textarea',required:true},
    {path:'categories',label:'Categories',type:'categories',help:'One line per category: Title | Description | Show yes/no'}]},
  booking:{title:'Booking',description:'Update Square booking details and the client eligibility wording.',publicTab:'booking',fields:[
    {path:'eyebrow',label:'Small heading',required:true},{path:'heading',label:'Main heading',required:true},{path:'intro',label:'Introduction',type:'textarea',required:true},
    {path:'studioNote',label:'Studio note',type:'textarea'},{path:'bookingUrl',label:'Square booking link',required:true},
    {path:'eligibilityHeading',label:'Eligibility heading'},{path:'clientTypeQuestion',label:'Client question',type:'textarea'},
    {path:'newClientMessage',label:'New-client message',type:'textarea'},{path:'returningClientMessage',label:'Returning-client message',type:'textarea'},
    {path:'ageConfirmation',label:'Age confirmation',type:'textarea'},{path:'patchConfirmation',label:'Patch-test confirmation',type:'textarea'},
    {path:'newClientButtonText',label:'New-client button'},{path:'returningClientButtonText',label:'Returning-client button'},
    {path:'complianceNote',label:'Compliance note',type:'textarea'},{path:'securityNote',label:'Security note',type:'textarea'}]},
  contact:{title:'Contact',description:'Update contact details and opening hours.',publicTab:'contact',fields:[
    {path:'eyebrow',label:'Small heading',required:true},{path:'heading',label:'Main heading',required:true},{path:'intro',label:'Introduction',type:'textarea',required:true},
    {path:'contact.heading',label:'Contact card heading'},{path:'contact.email',label:'Email address',required:true},{path:'contact.phone',label:'Phone number'},{path:'contact.instagram',label:'Instagram'},
    {path:'hours.heading',label:'Hours heading'},{path:'hours.lines',label:'Opening hours',type:'lines',help:'One line for each opening-hours message.'}]},
  privacy:{title:'Policies',description:'Update privacy, suitability and cancellation information.',publicTab:'privacy',fields:[
    {path:'eyebrow',label:'Small heading',required:true},{path:'heading',label:'Main heading',required:true},{path:'intro',label:'Introduction',type:'textarea',required:true},
    {path:'sections',label:'Policy sections',type:'policies',help:'One line per section: Heading | Policy wording'}]},
  site:{title:'Settings',description:'Update website-wide title, description and footer details.',publicTab:'home',fields:[
    {path:'businessName',label:'Business name',required:true},{path:'pageTitle',label:'Browser page title',required:true},
    {path:'metaDescription',label:'Search description',type:'textarea',required:true},{path:'footerText',label:'Footer wording',required:true}]}
};
function getPath(obj,path){return path.split('.').reduce((value,key)=>value?.[key],obj);}
function setPath(obj,path,value){const parts=path.split('.');let target=obj;parts.slice(0,-1).forEach(key=>target=target[key]??={});target[parts.at(-1)]=value;}
function serializeSectionField(field,value){
  if(field.type==='lines')return (value||[]).join('\n');
  if(field.type==='stages')return (value||[]).map(item=>`${item.day||''} | ${item.text||''}`).join('\n');
  if(field.type==='priceGroups')return (value||[]).flatMap(group=>(group.items||[]).map(item=>`${group.title||''} | ${item.name||''} | ${item.price||''} | ${item.time||''}`)).join('\n');
  if(field.type==='gallery')return (value||[]).map(item=>`${item.title||''} | ${item.caption||''} | ${item.image||''} | ${item.alt||''} | ${item.visible===false?'no':'yes'}`).join('\n');
  if(field.type==='categories')return (value||[]).map(item=>`${item.title||''} | ${item.description||''} | ${item.visible===false?'no':'yes'}`).join('\n');
  if(field.type==='policies')return (value||[]).map(item=>`${item.heading||''} | ${item.text||''}`).join('\n');
  return value??'';
}
function splitParts(line,count){const parts=line.split('|').map(part=>part.trim());while(parts.length<count)parts.push('');return parts;}
function parseSectionField(field,value,current){
  const lines=value.split('\n').map(line=>line.trim()).filter(Boolean);
  if(field.type==='lines')return lines;
  if(field.type==='stages')return lines.map((line,index)=>{const [day,text]=splitParts(line,2);return {...(current?.[index]||{}),day,text};});
  if(field.type==='priceGroups'){const groups=[];lines.forEach(line=>{const [groupTitle,name,price,time]=splitParts(line,4);let group=groups.find(item=>item.title===groupTitle);if(!group){group={title:groupTitle,items:[]};groups.push(group);}group.items.push({name,price,time});});return groups;}
  if(field.type==='gallery')return lines.map(line=>{const [title,caption,image,alt,visible]=splitParts(line,5);return {title,caption,image,alt,visible:visible.toLowerCase()!=='no'};});
  if(field.type==='categories')return lines.map(line=>{const [title,description,visible]=splitParts(line,3);return {title,description,visible:visible.toLowerCase()!=='no'};});
  if(field.type==='policies')return lines.map(line=>{const [heading,text]=splitParts(line,2);return {heading,text};});
  return value;
}
function sectionFieldMarkup(field){const value=serializeSectionField(field,getPath(siteSectionWorking,field.path));const multiline=field.type==='textarea'||['lines','stages','priceGroups','gallery','categories','policies'].includes(field.type);return `<label><span>${escapeHtml(field.label)}</span>${multiline?`<textarea data-section-path="${escapeHtml(field.path)}" rows="${field.type==='textarea'?5:8}" ${field.required?'required':''}>${escapeHtml(value)}</textarea>`:`<input data-section-path="${escapeHtml(field.path)}" type="text" value="${escapeHtml(value)}" ${field.required?'required':''} />`}${field.help?`<small>${escapeHtml(field.help)}</small>`:''}</label>`;}
function renderSiteSectionEditor(){const def=sectionDefinitions[activeSiteSection];document.querySelector('#sectionEditorTitle').textContent=def.title;document.querySelector('#sectionEditorDescription').textContent=def.description;document.querySelector('#sectionEditorFields').innerHTML=def.fields.map(sectionFieldMarkup).join('');setSectionStatus('✓ Autosave on');}
function setSectionStatus(message,type=''){const el=document.querySelector('#sectionEditorStatus');el.textContent=message;el.classList.toggle('error',type==='error');el.classList.toggle('success',type==='success');}
async function fetchSection(section,draft=false){const response=await fetch(`${SECTION_API}?section=${encodeURIComponent(section)}${draft?'&draft=1':''}`,{cache:'no-store',credentials:'same-origin'});if(response.status===404)return null;const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'This section could not be loaded.');return result.data;}
async function openSiteSection(section){activeSiteSection=section;setSectionStatus('Loading…');try{const published=await fetchSection(section,false).catch(()=>null)||await fetch(`/content/${section}.json`,{cache:'no-store'}).then(r=>r.json());siteSectionOriginal=clone(published);delete siteSectionOriginal.schemaVersion;delete siteSectionOriginal.updatedAt;const draft=await fetchSection(section,true).catch(()=>null);siteSectionWorking=clone(draft?.content||siteSectionOriginal);renderSiteSectionEditor();showAppView('sectionEditorView');history.pushState({view:'section-editor',section},'',`#manage-${section}`);}catch(error){setSectionStatus(error.message,'error');}}
function updateSiteSectionFromForm(){const def=sectionDefinitions[activeSiteSection];def.fields.forEach(field=>{const input=document.querySelector(`[data-section-path="${field.path}"]`);setPath(siteSectionWorking,field.path,parseSectionField(field,input.value,getPath(siteSectionWorking,field.path)));});}
function validateSiteSection(){const invalid=[...document.querySelectorAll('#sectionEditorForm [required]')].find(field=>!field.value.trim());if(invalid){invalid.focus();setSectionStatus('Please complete the highlighted field.','error');return false;}return true;}
async function saveSiteSectionDraft(){clearTimeout(siteSectionSaveTimer);siteSectionSaveTimer=null;if(siteSectionSaving)return;siteSectionSaving=true;updateSiteSectionFromForm();setSectionStatus('Saving online…');try{const response=await fetch(`${SECTION_API}?section=${encodeURIComponent(activeSiteSection)}&draft=1`,{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({content:siteSectionWorking})});const result=await response.json().catch(()=>({}));if(response.status===401){lockManager();return;}if(!response.ok)throw new Error(result.error||'Draft could not be saved.');setSectionStatus(`✓ Saved online · ${relativeTime(result.savedAt)}`,'success');}catch(error){setSectionStatus('Could not save online — your changes remain on this screen.','error');}finally{siteSectionSaving=false;}}
function scheduleSiteSectionSave(){clearTimeout(siteSectionSaveTimer);setSectionStatus('Saving online…');siteSectionSaveTimer=setTimeout(saveSiteSectionDraft,650);}
function previewSiteSection(){if(!validateSiteSection())return;updateSiteSectionFromForm();localStorage.setItem(`eb-section-preview:${activeSiteSection}`,JSON.stringify(siteSectionWorking));const tab=sectionDefinitions[activeSiteSection].publicTab;window.open(`/?preview=${encodeURIComponent(activeSiteSection)}#${tab}`,'_blank','noopener');}
async function publishSiteSection(){if(!validateSiteSection())return;updateSiteSectionFromForm();if(siteSectionSaveTimer)await saveSiteSectionDraft();if(!confirm(`Publish ${sectionDefinitions[activeSiteSection].title} to the live website?`))return;const button=document.querySelector('#sectionPublishButton');button.disabled=true;button.textContent='Publishing…';setSectionStatus('Publishing…');try{const response=await fetch(`${SECTION_API}?section=${encodeURIComponent(activeSiteSection)}`,{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({content:siteSectionWorking})});const result=await response.json().catch(()=>({}));if(response.status===401){lockManager();return;}if(!response.ok)throw new Error(result.error||'This section could not be published.');siteSectionOriginal=clone(siteSectionWorking);setSectionStatus('✓ Published successfully. The live website now uses these changes.','success');}catch(error){setSectionStatus(error.message,'error');}finally{button.disabled=false;button.textContent='Publish';}}
document.querySelectorAll('[data-open-section]').forEach(button=>button.addEventListener('click',()=>openSiteSection(button.dataset.openSection)));
document.querySelector('#sectionEditorForm').addEventListener('input',scheduleSiteSectionSave);
document.querySelector('#sectionBackButton').addEventListener('click',()=>{if(siteSectionSaveTimer)saveSiteSectionDraft();showAppView('dashboardView');});
document.querySelector('#sectionPreviewButton').addEventListener('click',previewSiteSection);
document.querySelector('#sectionPublishButton').addEventListener('click',publishSiteSection);

initialiseAuthentication();
