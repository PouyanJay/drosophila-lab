// Single-user local workspace. proxy.ts rejects non-local and cross-origin requests.
// Hosted identity headers are never used.
export type ChatGPTUser={userId:string;displayName:string;email:string;fullName:string|null};
export async function getChatGPTUser():Promise<ChatGPTUser|null>{
 if(process.env.LOCAL_WORKSPACE!=='1')return null;
 return {userId:'local-workspace',displayName:'Local researcher',email:'',fullName:null};
}
export async function requireChatGPTUser(_returnTo:string){const user=await getChatGPTUser();if(!user)throw Error('Start the local workspace.');return user;}
