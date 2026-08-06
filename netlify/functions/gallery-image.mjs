import { getStore } from '@netlify/blobs';
import { getUser } from '@netlify/identity';

const STORE_NAME='effortless-beauty-gallery-images';
const MAX_FILE_SIZE=5*1024*1024;
const ALLOWED_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const isImageId=value=>/^[a-f0-9-]{36}$/i.test(value||'');

export default async request=>{
  const url=new URL(request.url);
  const store=getStore({name:STORE_NAME,consistency:'strong'});

  if(request.method==='GET'){
    const id=url.searchParams.get('id');
    if(!isImageId(id))return new Response('Image not found.',{status:404});
    const image=await store.getWithMetadata(id,{type:'arrayBuffer'});
    if(!image)return new Response('Image not found.',{status:404});
    return new Response(image.data,{headers:{'Content-Type':image.metadata?.contentType||'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
  }

  if(request.method==='DELETE'){
    if(!await getUser())return json({error:'Authorised login required.'},401);
    const id=url.searchParams.get('id');
    if(!isImageId(id))return json({error:'Image not found.'},404);
    await store.delete(id).catch(()=>{});
    return json({ok:true});
  }

  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  if(!await getUser())return json({error:'Authorised login required.'},401);
  const form=await request.formData().catch(()=>null);
  const file=form?.get('image');
  if(!file||typeof file.arrayBuffer!=='function'||!ALLOWED_TYPES.has(file.type))return json({error:'Choose a JPEG, PNG or WebP photo.'},400);
  if(file.size>MAX_FILE_SIZE)return json({error:'Choose a photo smaller than 5 MB.'},400);
  const id=crypto.randomUUID();
  await store.set(id,await file.arrayBuffer(),{metadata:{contentType:file.type,fileName:file.name,uploadedAt:new Date().toISOString()}});
  return json({ok:true,id,url:`/.netlify/functions/gallery-image?id=${id}`},201);
};
