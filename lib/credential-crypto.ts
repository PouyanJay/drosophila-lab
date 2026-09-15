const encoder=new TextEncoder();
function bytes(s:string){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
function base64(b:Uint8Array){return btoa(Array.from(b,v=>String.fromCharCode(v)).join(''));}
async function key(secret:string){if(!secret)throw Error('Secure credential storage is not configured.');return crypto.subtle.importKey('raw',bytes(secret),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function sealCredential(value:string,secret:string,context:string){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(context)},await key(secret),encoder.encode(value));return JSON.stringify({v:1,iv:base64(iv),cipher:base64(new Uint8Array(encrypted))});}
export async function unsealCredential(sealed:string,secret:string,context:string){const d=JSON.parse(sealed);if(d.v!==1)throw Error('Unsupported credential format');const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(d.iv),additionalData:encoder.encode(context)},await key(secret),bytes(d.cipher));return new TextDecoder().decode(decrypted);}
