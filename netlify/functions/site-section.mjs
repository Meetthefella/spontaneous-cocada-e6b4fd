import { getStore } from '@netlify/blobs';
import { getUser } from '@netlify/identity';
const STORE_NAME='effortless-beauty-content';
const ALLOWED=new Set(['site','aftercare','booking','contact','privacy','pricelists','gallery','merchandise']);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const valid=(v)=>v&&typeof v==='object'&&!Array.isArray(v)&&JSON.stringify(v).length<=100000;
export default async(request)=>{
 const url=new URL(request.url); const section=url.searchParams.get('section'); const draft=url.searchParams.get('draft')==='1';
 if(!ALLOWED.has(section))return json({error:'Unknown website section.'},400);
 const store=getStore({name:STORE_NAME,consistency:'strong'}); const key=draft?`${section}-draft`:section;
 if(request.method==='GET'){
   if(draft&&!await getUser())return json({error:'Authorised login required.'},401);
   const data=await store.get(key,{type:'json'}); if(data===null)return json({found:false},404); return json({found:true,data});
 }
 if(request.method!=='PUT'&&request.method!=='DELETE')return json({error:'Method not allowed.'},405);
 const user=await getUser(); if(!user)return json({error:'Authorised login required.'},401);
 if(request.method==='DELETE'){await store.delete(key).catch(()=>{});return json({ok:true});}
 let body;try{body=await request.json();}catch{return json({error:'Invalid content.'},400)}
 const content=body?.content??body;if(!valid(content))return json({error:'Content is missing or too large.'},400);
 const timestamp=new Date().toISOString(); const data=draft?{schemaVersion:1,savedAt:timestamp,content}:{...content,schemaVersion:1,updatedAt:timestamp};
 await store.setJSON(key,data,{metadata:{section,savedBy:user.email||user.id,purpose:draft?'unpublished-section-draft':'published-section'}});
 if(!draft)await store.delete(`${section}-draft`).catch(()=>{});
 return json({ok:true,data,savedAt:timestamp,updatedAt:timestamp});
};
