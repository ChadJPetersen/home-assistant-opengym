'use strict';
const assert = require('node:assert/strict');
const { summarize, selectProfile, localDate } = require('../opengym/rootfs/usr/local/lib/opengym-ha/metrics.cjs');
const now = new Date('2026-10-27T19:00:00Z');
assert.equal(localDate(now,'America/Denver'),'2026-10-27');
const src={
  unit: 'lb',
  routines:[{id:1},{id:2}],
  bodyweight:[{d:'2026-10-01',w:160},{d:'2026-10-26',w:162}],
  workouts:[
    {d:'2026-10-27',start:1793140000000,end:1793143600000,entries:[{sets:[{done:true,w:50,r:10},{done:true,warmup:true},{done:false},{phase:'work',sides:{L:{done:true},R:{done:false}}}]}]},
    {d:'2026-10-24',entries:[{sets:[{done:true}]}]},
    {d:'2026-10-20',entries:[{sets:[{done:true}]}]}
  ]
};
const s=summarize(src,{now,timeZone:'America/Denver'});
assert.equal(s.total_workouts,3);
assert.equal(s.workouts_7d,2);
assert.equal(s.work_sets_7d,3);
assert.equal(s.workout_today,true);
assert.equal(s.last_workout,'2026-10-27');
assert.equal(s.days_since_workout,0);
assert.equal(s.last_duration,60);
assert.equal(s.bodyweight,162);
assert.equal(s.bodyweight_unit,'lb');
assert.equal(s.routines,2);
assert.equal(summarize({workouts:[]},{now}).last_workout,null);
assert.equal(selectProfile({users:[{id:'abc'}]},''),'abc');
assert.equal(selectProfile({users:[{id:'a'},{id:'b'}]},'b'),'b');
assert.throws(()=>selectProfile({users:[{id:'a'},{id:'b'}]},''),/Multiple/);
assert.throws(()=>selectProfile({users:[]},''),/Create/);
console.log('Sensor calculation tests passed');
