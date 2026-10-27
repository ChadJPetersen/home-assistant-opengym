'use strict';
/**
 * Read-only, opt-in Home Assistant MQTT sensor bridge.
 * Every active openGym account has its OWN MQTT device; no mixed totals.
 * Stable anonymous MQTT topic suffixes are derived from this installation's ID
 * and the upstream account ID. This bridge never publishes raw workout records,
 * credentials, notes, email addresses or photos.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mqtt = require('/opt/opengym-mqtt/node_modules/mqtt');
const { summarize, activeProfiles } = require('./metrics.cjs');
const DATA = process.env.DATA_DIR || '/data/opengym';
const OPTIONS = '/data/options.json';
const MARKER = path.join(DATA, '.ha-mqtt-bridge.json');
const log = (...args) => console.log('[HA sensors]', ...args);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const safeJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const option = (obj, key, fallback) => Object.hasOwn(obj, key) ? obj[key] : fallback;
const SENSORS = [
  { key:'total_workouts', name:'Total workouts', icon:'mdi:dumbbell', state_class:'measurement' },
  { key:'workouts_7d', name:'Workouts (7 days)', icon:'mdi:calendar-week', state_class:'measurement' },
  { key:'work_sets_7d', name:'Completed work sets (7 days)', icon:'mdi:weight-lifter', state_class:'measurement' },
  { key:'workout_today', name:'Workout completed today', icon:'mdi:check-circle', binary:true },
  { key:'last_workout', name:'Last workout date', icon:'mdi:calendar-check', device_class:'date' },
  { key:'days_since_workout', name:'Days since last workout', icon:'mdi:calendar-clock', unit_of_measurement:'d', state_class:'measurement' },
  { key:'last_duration', name:'Last workout duration', icon:'mdi:timer-outline', unit_of_measurement:'min', state_class:'measurement' },
  { key:'routines', name:'Saved routines', icon:'mdi:format-list-bulleted', state_class:'measurement' },
  { key:'bodyweight', name:'Latest body weight', icon:'mdi:scale-bathroom', device_class:'weight', state_class:'measurement' }
];
function settings() {
  const v = safeJson(OPTIONS);
  const zone = option(v, 'ha_timezone', 'UTC');
  new Intl.DateTimeFormat('en-US', { timeZone:zone });
  return {
    enabled:option(v, 'home_assistant_sensors', false) === true,
    bodyweight:option(v, 'ha_include_bodyweight', false) === true,
    timezone:zone,
    poll:Math.max(30,Number(option(v, 'ha_poll_seconds',120))||120)*1000
  };
}
function marker() {
  try {
    const saved=safeJson(MARKER);
    if (/^[a-f0-9]{12}$/.test(saved.id))
      return { id:saved.id, registered:!!saved.registered, profiles:Array.isArray(saved.profiles)?saved.profiles:[], legacy:!!saved.registered && !Array.isArray(saved.profiles) };
  } catch {}
  return { id:crypto.randomBytes(6).toString('hex'), registered:false, profiles:[], legacy:false };
}
const current = marker();
const base = 'opengym/'+current.id;
function profileKey(uid) {
  return crypto.createHash('sha256').update(current.id + ':' + uid).digest('hex').slice(0,12);
}
function profileRoot(key) { return base+'/'+key; }
function discovery(key,spec) {
  return 'homeassistant/'+(spec.binary?'binary_sensor':'sensor')+'/opengym_'+current.id+'_'+key+'/'+spec.key+'/config';
}
function stateTopic(key,spec) { return profileRoot(key)+'/state/'+spec.key; }
function availability(key) { return profileRoot(key)+'/availability'; }
function publish(client,topic,value) {
  return new Promise((resolve,reject)=>client.publish(topic,String(value),{retain:true,qos:1},e=>e?reject(e):resolve()));
}
function saveMarker() {
  fs.writeFileSync(MARKER,JSON.stringify(current)+'\n',{mode:0o600});
}
function validProfileName(profile,index) {
  const label = typeof profile.name==='string'?profile.name.trim():'';
  return (label || 'Profile '+(index+1)).slice(0,80);
}
function config(spec,key,label,weightUnit) {
  const dev='opengym_'+current.id+'_'+key;
  const cfg={
    name:spec.name,
    unique_id:dev+'_'+spec.key,
    state_topic:stateTopic(key,spec),
    availability_topic:availability(key),
    payload_available:'online',
    payload_not_available:'offline',
    icon:spec.icon,
    device:{ identifiers:[dev], name:'openGym · '+label, manufacturer:'openGym', model:'Home Assistant App' }
  };
  if(spec.binary) { cfg.payload_on='ON';cfg.payload_off='OFF'; }
  else {
    if(spec.state_class) cfg.state_class=spec.state_class;
    if(spec.device_class) cfg.device_class=spec.device_class;
    if(spec.unit_of_measurement) cfg.unit_of_measurement=spec.unit_of_measurement;
    if(spec.key==='bodyweight') cfg.unit_of_measurement=weightUnit;
  }
  return JSON.stringify(cfg);
}
function formatValue(spec,values) {
  const value=values[spec.key];
  if(value==null || typeof value==='number' && !Number.isFinite(value)) return 'unknown';
  if(spec.binary) return value?'ON':'OFF';
  return String(value);
}
async function removeProfile(client,key) {
  for (const spec of SENSORS) {
    await publish(client, discovery(key,spec), '');
    await publish(client, stateTopic(key,spec), '');
  }
  await publish(client,availability(key),'');
}
async function cleanLegacy(client) {
  if (!current.legacy) return;
  const old='homeassistant/';
  for (const spec of SENSORS) {
    await publish(client,old+(spec.binary?'binary_sensor':'sensor')+'/opengym_'+current.id+'/'+spec.key+'/config','');
    await publish(client,base+'/state/'+spec.key,'');
  }
  await publish(client,base+'/availability','');
  current.legacy=false;
  saveMarker();
  log('Removed legacy single-profile entities.');
}
async function clearAll(client) {
  await cleanLegacy(client);
  for(const key of current.profiles) await removeProfile(client,key);
  current.profiles=[];
  current.registered=false;
  saveMarker(); // preserve installation ID so entity IDs remain stable after re-enable
  log('Cleared all retained per-profile discoveries (Recorder history remains).');
}
function readState(id) {
  const file=path.join(DATA,'state-'+id+'.json');
  if(!fs.existsSync(file)) return {};
  return safeJson(file); // parse error must not erase a valid MQTT entity
}
async function sendMetrics(client,opts) {
  // db.json contains profile metadata; never publish the db itself.
  let profiles;
  try { profiles=activeProfiles(safeJson(path.join(DATA,'db.json'))); }
  catch(e) { log('User database unavailable: '+e.message); return; }
  await cleanLegacy(client);
  const currentKeys=[];
  for(let i=0;i<profiles.length;i++) {
    const profile=profiles[i],key=profileKey(profile.id),label=validProfileName(profile,i);
    currentKeys.push(key);
    let values;
    try { values=summarize(readState(profile.id),{timeZone:opts.timezone}); }
    catch(e) {
      log('Skipping unreadable state for profile '+(i+1)+': '+e.message);
      await publish(client,availability(key),'offline');
      continue;
    }
    const specs=SENSORS.filter(s=>s.key!=='bodyweight'||opts.bodyweight && values.bodyweight_unit);
    for (const spec of SENSORS.filter(s=>!specs.includes(s))) {
      await publish(client,discovery(key,spec),'');
      await publish(client,stateTopic(key,spec),'');
    }
    for (const spec of specs) {
      await publish(client,discovery(key,spec),config(spec,key,label,values.bodyweight_unit));
      await publish(client,stateTopic(key,spec),formatValue(spec,values));
    }
    await publish(client,availability(key),'online');
    if(!current.profiles.includes(key)) {
      current.profiles.push(key);
      current.registered=true;
      saveMarker();
    }
  }
  // Remove entities for deleted/disabled accounts without affecting other profiles.
  for(const stale of current.profiles.filter(key=>!currentKeys.includes(key))) {
    await removeProfile(client,stale);
  }
  current.profiles=currentKeys;
  current.registered=currentKeys.length>0;
  saveMarker();
}
async function broker() {
  const token=process.env.SUPERVISOR_TOKEN;
  if(!token) throw new Error('SUPERVISOR_TOKEN not provided');
  const resp=await fetch('http://supervisor/services/mqtt',{
    headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000)
  });
  if(!resp.ok) throw new Error('Supervisor MQTT unavailable: '+resp.status);
  const data=await resp.json(),cfg=data.data||data;
  if(!cfg.host||!cfg.port) throw new Error('Supervisor has no MQTT host/port');
  return cfg;
}
async function main() {
  fs.mkdirSync(DATA,{recursive:true});
  let opts;
  try { opts=settings(); } catch(e){log('Invalid options: '+e.message);process.exitCode=1;return;}
  if(!opts.enabled&&!current.registered&&!current.profiles.length&&!current.legacy) {
    log('Disabled. No workout data exported.');return;
  }
  let auth;
  while(!auth) {try{auth=await broker();}catch(e){log(e.message+'; retry in 60 seconds');await sleep(60000);}}
  const client=mqtt.connect((auth.ssl?'mqtts':'mqtt')+'://'+auth.host+':'+auth.port,{
    username:auth.username||undefined,password:auth.password||undefined,
    clientId:'opengym_ha_'+current.id,protocolVersion:4,
    reconnectPeriod:5000,connectTimeout:10000
  });
  let running=false,done=false,timer=null;
  async function tick() {
    if(running||done||!client.connected)return;
    running=true;
    try {
      if (!opts.enabled) {
        await clearAll(client);
        done=true;
        if(timer) clearInterval(timer);
        client.end(false);
        return;
      }
      await sendMetrics(client,opts);
    } catch(e) {log('Publish failed: '+e.message);}
    finally {running=false;}
  }
  client.on('connect',()=>{log('MQTT connected');void tick();});
  client.on('error',e=>log('MQTT: '+e.message));
  timer=setInterval(()=>{void tick();},opts.poll);
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
    done=true;clearInterval(timer);
    if(client.connected) {
      for(const key of current.profiles) client.publish(availability(key),'offline',{retain:true,qos:1});
      client.end(false,()=>process.exit(0));
    } else process.exit(0);
    setTimeout(()=>process.exit(0),2000).unref();
  });
}
main().catch(e=>{log('Fatal: '+e.message);process.exitCode=1;});
