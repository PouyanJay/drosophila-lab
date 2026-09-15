import {z} from 'zod';
export const discoverySchema=z.object({
 schema:z.literal('malecns-discovery/1'),task:z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
 taskParameters:z.string().max(4096).refine(s=>{try{const v=JSON.parse(s);return v&&typeof v==='object'&&!Array.isArray(v);}catch{return false;}},'Task parameters must encode a JSON object'),
 delays:z.array(z.number().int().min(0).max(32)).min(1).max(4),
 noise:z.array(z.number().min(0).max(3)).min(1).max(3),
 lengths:z.array(z.number().int().min(2).max(8)).min(1).max(4),
 population:z.enum(['cb_intrinsic','descending_neuron','visual_projection']),
 maxCopies:z.number().int().min(1).max(64),candidates:z.number().int().min(2).max(64),
 pilotUpdates:z.number().int().min(1).max(100),fullUpdates:z.number().int().min(2).max(200),
 confirmationUpdates:z.number().int().min(2).max(300),examples:z.number().int().min(8).max(256),
 seeds:z.array(z.number().int().min(0).max(9999)).min(3).max(5),
 maxSeconds:z.number().int().min(60).max(86400),patience:z.number().int().min(2).max(32),
 minimumGain:z.number().min(.001).max(.5),maxSlowdown:z.number().min(1).max(10),
 seed:z.number().int().min(0).max(999999)
}).strict().superRefine((c,ctx)=>{
 for(const key of ['delays','noise','lengths','seeds'] as const)if(new Set(c[key]).size!==c[key].length)ctx.addIssue({code:'custom',message:'Use unique '+key});
 if(c.pilotUpdates>c.fullUpdates||c.fullUpdates>c.confirmationUpdates)ctx.addIssue({code:'custom',message:'Training budgets must increase'});
 if(c.delays.length*c.noise.length*(c.task==='sequence-recall'?c.lengths.length:1)>12)ctx.addIssue({code:'custom',message:'Use at most twelve scenarios'});
});
export type DiscoveryConfig=z.infer<typeof discoverySchema>;
export const defaultDiscovery:DiscoveryConfig={schema:'malecns-discovery/1',task:'cue-memory',taskParameters:'{}',delays:[2,6,12],noise:[.1,.5],lengths:[2,4],population:'cb_intrinsic',maxCopies:16,candidates:8,pilotUpdates:4,fullUpdates:16,confirmationUpdates:24,examples:32,seeds:[41,42,43],maxSeconds:3600,patience:4,minimumGain:.05,maxSlowdown:3,seed:91703};
const field=(type:string,extra:any={})=>({type,...extra});
const ints=['maxCopies','candidates','pilotUpdates','fullUpdates','confirmationUpdates','examples','maxSeconds','patience','seed'];
export const discoveryJSON:any={type:'object',additionalProperties:false,required:Object.keys(defaultDiscovery),
 properties:{schema:{const:'malecns-discovery/1',type:'string'},task:field('string'),taskParameters:field('string'),population:field('string',{enum:['cb_intrinsic','descending_neuron','visual_projection']}),
 ...Object.fromEntries(ints.map(k=>[k,field('integer')])),
 ...Object.fromEntries(['delays','lengths','seeds'].map(k=>[k,field('array',{items:field('integer')})])),
 noise:field('array',{items:field('number')}),minimumGain:field('number'),maxSlowdown:field('number')}};
