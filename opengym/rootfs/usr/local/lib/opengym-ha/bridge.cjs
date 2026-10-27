'use strict';
/**
 * Home Assistant MQTT discovery bridge for the openGym add-on.
 * Explicit opt-in; reads only one selected profile's saved state; never reads
 * account credentials or publishes raw logs, photos, names or routines.
 * Requires a configured MQTT service (e.g. Home Assistant Mosquitto).
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const mqtt=require('/opt/opengym-mqtt/node_modules/mqtt');
const {summarize,selectProfile}=require('./metrics.cjs');

const DATA=process.env.DATA_DIR || '/data/opengym';
const OPTIONS='/data/options.json';
const MARKER=path.join(DATA,'.ha-mqtt-bridge.json');
const log = (...args) => console.log('[HA sensors]',...args);
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const safeJson = file => JSON.parse(fs.readFileSync(file,'utf8'));
const option = (obj,key,fallback) => Object.hasOwn(obj,key) ? obj[key] : fallback;
const SENSORS=[
  {key:'total_workouts',name:'Total workouts',icon:'mdi:dumbbell',state_class:'measurement'},
  {key:'workouts_7d',name:'Workouts (7 days)',icon:'mdi:calendar-week',state_class:'measurement'},
  {key:'work_sets_7d',name:'Completed work sets (7 days)',icon:'mdi:weight-lifter',state_class:'measurement'},
  {key:'workout_today',name:'Workout completed today',icon:'mdi:check-circle',binary:true},
  {key:'last_workout',name:'Last workout date',icon:'mdi:calendar-check',device_class:'date'},
  {key:'days_since_workout',name:'Days since last workout',icon:'mdi:calendar-clock',unit_of_measurement:'d',state_class:'measurement'},
  {key:'last_duration',name:'Last workout duration',icon:'mdi:timer-outline',unit_of_measurement:'min',state_class:'measurement'},
  {key:'routines',name:'Saved routines',icon:'mdi:format-list-bulleted',state_class:'measurement'},
  {key:'bodyweight',name:'Latest body weight',icon:'mdi:scale-bathroom',device_class:'weight',state_class:'measurement'}
];

function settings() {
  const v=safeJson(OPTIONS);
  const tz=option(v,'ha_timezone','UTC');
  // Enforce a real timezone, otherwise week/day metrics are misleading.
  new Intl.DateTimeFormat('en-US',{timeZone:tz});
  return {
    enabled:option(v,'home_assistant_sensors',false)===true,
    bodyweight:option(v,'ha_include_bodyweight',false)===true,
    profile:String(option(v,'ha_profile_id','')||'').trim(),
    timezone:tz,
    poll:Math.max(30,Number(option(v,'ha_poll_seconds',120))||120)*1000
  };
}
async function broker() {
  const token=process.env.SUPERVISOR_TOKEN;
  if(!token) throw new Error('Missing SUPERVISOR_TOKEN (expected in a Home Assistant app)');
  const response=await fetch('http://supervisor/services/mqtt',{
    headers:{Authorization:'Bearer '+token},
    signal:AbortSignal.timeout(8000)
  });
  if(!response.ok) throw new Error('Supervisor MQTT service unavailable ('+response.status+')');
  const result=await response.json();
  const b=result.data || result;
  if(!b.host||!b.port) throw new Error('Supervisor MQTT service has no host/port');
  return b;
}
function readState(profile) {
  const stateFile=path.join(DATA,'state-'+profile+'.json');
  if(!fs.existsSync(stateFile)) return {}; // new account, no workout history yet
  return safeJson(stateFile);
}
const id = (() => {
  fs.mkdirSync(DATA,{recursive:true});
  try {
    const old=safeJson(MARKER);
    if (/^[a-f0-9]{12}$/.test(old.id)) return old.id;
  } catch {}
  return crypto.randomBytes(6).toString('hex');
})();
const base='opengym/'+id;
const availability=base+'/availability';
let registered=false;
try { registered=!!safeJson(MARKER).registered; } catch {}
const discovery=spec => 'homeassistant/'+(spec.binary?'binary_sensor':'sensor')+'/opengym_'+id+'/'+spec.key+'/config';
const valueTopic=spec => base+'/state/'+spec.key;
function publish(client,topic,payload) {
  return new Promise((resolve,reject)=>client.publish(topic,String(payload),{qos:1,retain:true},e=>e?reject(e):resolve()));
}
function config(spec,weightUnit) {
  const cfg={
    name:spec.name,
    unique_id:'opengym_'+id+'_'+spec.key,
    state_topic:valueTopic(spec),
    availability_topic:availability,
    payload_available:'online',
    payload_not_available:'offline',
    icon:spec.icon,
    device:{
      identifiers:['opengym_'+id],
      name:'openGym',
      manufacturer:'openGym',
      model:'Home Assistant App'
    },
    origin:{name:'openGym Home Assistant App',sw_version:'1.4.3'}
  };
  if(spec.binary){cfg.payload_on='ON';cfg.payload_off='OFF';}
  else {
    if(spec.state_class) cfg.state_class=spec.state_class;
    if(spec.device_class) cfg.device_class=spec.device_class;
    if(spec.unit_of_measurement) cfg.unit_of_measurement=spec.unit_of_measurement;
    if(spec.key==='bodyweight') cfg.unit_of_measurement=weightUnit;
  }
  return JSON.stringify(cfg);
}
function writeMarker(yes) {
  fs.writeFileSync(MARKER,JSON.stringify({id,registered:yes})+'\n',{mode:0o600});
  registered=yes;
}
async function clearAll(client) {
  for(const spec of SENSORS) {
    await publish(client,discovery(spec),'');
    await publish(client,valueTopic(spec),'');
  }
  await publish(client,availability,'offline');
  writeMarker(false);
  log('Removed retained sensor discoveries and states; publication disabled.');
}
function formatValue(spec,metrics) {
  const value=metrics[spec.key];
  if(value===null||value===undefined||!Number.isFinite(value)&&typeof value==='number') return 'None';
  if(spec.binary) return value?'ON':'OFF';
  return String(value);
}
function collect(options) {
  const uid=selectProfile(safeJson(path.join(DATA,'db.json')),options.profile);
  const state=readState(uid);
  return summarize(state,{timeZone:options.timezone});
}
async function sendMetrics(client,opts) {
  let metrics;
  try { metrics=collect(opts); }
  catch(e) {
    log('Cannot read selected profile: '+e.message);
    await publish(client,availability,'offline');
    return;
  }
  const enabled=SENSORS.filter(s=>s.key!=='bodyweight'||opts.bodyweight && metrics.bodyweight_unit);
  for(const spec of SENSORS.filter(s=>!enabled.includes(s))) {
    // A previously enabled optional weight entity must be removed from discovery.
    await publish(client,discovery(spec),'');
    await publish(client,valueTopic(spec),'');
  }
  for(const spec of enabled) {
    await publish(client,discovery(spec),config(spec,metrics.bodyweight_unit));
    await publish(client,valueTopic(spec),formatValue(spec,metrics));
  }
  await publish(client,availability,'online');
  writeMarker(true);
}
async function main() {
  let opts;
  try { opts=settings(); } catch(e) {log('Invalid sensor options: '+e.message);process.exitCode=1;return;}
  if(!opts.enabled && !registered) {log('Disabled (no MQTT connection or data exported).');return;}
  let credentials;
  while(!credentials) {
    try {credentials=await broker();}
    catch(e){log(e.message+'; retrying in 60 seconds');await sleep(60000);}
  }
  const proto=credentials.ssl?'mqtts:':'mqtt:';
  const client=mqtt.connect(proto+'//'+credentials.host+':'+credentials.port,{
    username:credentials.username||undefined,
    password:credentials.password||undefined,
    clientId:'opengym_ha_'+id,
    protocolVersion:4,
    reconnectPeriod:5000,
    connectTimeout:10000,
    will:{topic:availability,payload:'offline',qos:1,retain:true}
  });
  let running=false;
  let stopped=false;
  let timer;
  async function tick() {
    if(running||stopped||!client.connected)return;
    running=true;
    try {
      if(!opts.enabled) {
        await clearAll(client);
        stopped=true;
        clearInterval(timer);
        client.end(false);
        return;
      }
      await sendMetrics(client,opts);
    } catch(e) { log('MQTT publish failed: '+e.message); }
    finally {running=false;}
  }
  client.on('connect',()=>{log('Connected to MQTT broker');void tick();});
  client.on('error',e=>log('MQTT: '+e.message));
  timer=setInterval(()=>{void tick();},opts.poll);
  for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{
    stopped=true;
    clearInterval(timer);
    if(client.connected) client.publish(availability,'offline',{retain:true,qos:1},()=>client.end(false,()=>process.exit(0)));
    else process.exit(0);
    setTimeout(()=>process.exit(0),2000).unref();
  });
}
main().catch(e=>{log('Fatal: '+e.message);process.exitCode=1;});
