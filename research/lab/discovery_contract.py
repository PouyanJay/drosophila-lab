import math,json
from .discovery_tasks import get_task

DEFAULT=dict(schema='malecns-discovery/1',task='cue-memory',delays=[2,6,12],
 noise=[.1,.5],lengths=[2,4],population='cb_intrinsic',maxCopies=16,
 candidates=8,pilotUpdates=4,fullUpdates=16,confirmationUpdates=24,
 examples=32,seeds=[41,42,43],maxSeconds=3600,patience=4,
 minimumGain=.05,maxSlowdown=3.,seed=91703,taskParameters='{}')
OPERATORS=('duplicate-diverge','recurrent-loop','rewire')

def validate(c):
    if not isinstance(c,dict) or set(c)!=set(DEFAULT):raise ValueError('Discovery fields do not match malecns-discovery/1')
    if c['schema']!=DEFAULT['schema']:raise ValueError('Unsupported discovery schema')
    task=get_task(c['task'])
    if type(task.classes)is not int or not 1<=task.classes<=128 or type(task.input_channels)is not int or not 1<=task.input_channels<=128:raise ValueError('Task I/O dimensions must be 1..128')
    if not isinstance(c['taskParameters'],str) or len(c['taskParameters'])>4096:raise ValueError('Task parameters must be a bounded JSON object')
    try:parameters=json.loads(c['taskParameters'])
    except (ValueError,TypeError):raise ValueError('Invalid task parameter JSON')
    if not isinstance(parameters,dict):raise ValueError('Task parameters must be a JSON object')
    task.validate_parameters(parameters)
    for key,lo,hi in [('maxCopies',1,64),('candidates',2,64),('pilotUpdates',1,100),
        ('fullUpdates',2,200),('confirmationUpdates',2,300),('examples',8,256),
        ('maxSeconds',60,86400),('patience',2,32),('seed',0,999999)]:
        if type(c[key]) is not int or not lo<=c[key]<=hi:raise ValueError('Invalid '+key)
    if c['examples']%task.classes or c['examples']<task.classes*2 or not c['pilotUpdates']<=c['fullUpdates']<=c['confirmationUpdates']:raise ValueError('Examples must balance task classes; training budgets must increase')
    for key,lo,hi in [('delays',0,32),('lengths',2,8)]:
        a=c[key]
        if not isinstance(a,list) or not 1<=len(a)<=4 or len(set(a))!=len(a) or any(type(v)is not int or not lo<=v<=hi for v in a):raise ValueError('Invalid '+key)
    if not isinstance(c['noise'],list) or not 1<=len(c['noise'])<=3 or len(set(c['noise']))!=len(c['noise']) or any(type(v)not in (int,float) or not math.isfinite(v) or not 0<=v<=3 for v in c['noise']):raise ValueError('Invalid noise')
    if not 1<=len(task.scenarios(c))<=12:raise ValueError('Use one to twelve scenarios')
    if c['population'] not in ('cb_intrinsic','descending_neuron','visual_projection'):raise ValueError('Unsupported source population')
    if not isinstance(c['seeds'],list) or not 3<=len(c['seeds'])<=5 or len(set(c['seeds']))!=len(c['seeds']) or any(type(v)is not int or not 0<=v<=9999 for v in c['seeds']):raise ValueError('Use three to five unique paired seeds')
    for key,lo,hi in [('minimumGain',.001,.5),('maxSlowdown',1,10)]:
        if type(c[key])not in (int,float) or not math.isfinite(c[key]) or not lo<=c[key]<=hi:raise ValueError('Invalid '+key)
    return c
