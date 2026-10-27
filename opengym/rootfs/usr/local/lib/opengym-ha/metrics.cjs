'use strict';
// Pure aggregations over openGym's persisted state-<uid>.json.
// No network, no profile names, no notes, no raw exercise histories.
const DAY = 86400000;
const records = value => Array.isArray(value) ? value.filter(v => v && typeof v === 'object' && !Array.isArray(v)) : [];
const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
function localDate(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  return get('year') + '-' + get('month') + '-' + get('day');
}
function daysBetween(a,b) {
  return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z')) / DAY);
}
function finishedSet(s) {
  if (!s || typeof s !== 'object') return false;
  if (s.phase === 'warmup' || s.phase === 'warm-up' || s.phase === 'warm_up' || s.warmup === true) return false;
  if (s.sides && typeof s.sides === 'object') return s.sides.L?.done === true || s.sides.R?.done === true;
  return s.done === true;
}
function summarize(state, opts = {}) {
  const now = opts.now || new Date();
  const today = localDate(now, opts.timeZone || 'UTC');
  const workouts = records(state.workouts).filter(w => validDate(w.d) && w.d <= today);
  const recent = workouts.filter(w => daysBetween(w.d,today) < 7);
  const ordered = [...workouts].sort((a,b) => b.d.localeCompare(a.d) || (Number(b.start)||0)-(Number(a.start)||0));
  const last = ordered[0] || null;
  const lastWeight = records(state.bodyweight).filter(b => validDate(b.d) && b.d <= today && Number.isFinite(Number(b.w)) && Number(b.w)>0)
    .sort((a,b)=>b.d.localeCompare(a.d))[0];
  const duration = last && Number.isFinite(Number(last.start)) && Number.isFinite(Number(last.end))
    ? (Number(last.end)-Number(last.start))/60000 : NaN;
  const unit = state.unit === 'lb' || state.unit === 'lbs' ? 'lb' : state.unit === 'kg' ? 'kg' : null;
  return {
    total_workouts: workouts.length,
    workouts_7d: recent.length,
    work_sets_7d: recent.reduce((n,w)=>n+records(w.entries).reduce((sum,e)=>sum+records(e.sets).filter(finishedSet).length,0),0),
    workout_today: workouts.some(w => w.d === today),
    last_workout: last?.d ?? null,
    days_since_workout: last ? daysBetween(last.d,today) : null,
    last_duration: Number.isFinite(duration) && duration >= 0 && duration <= 600 ? Math.round(duration) : null,
    routines: records(state.routines).length,
    bodyweight: lastWeight ? Math.round(Number(lastWeight.w)*10)/10 : null,
    bodyweight_unit: unit
  };
}
function activeProfiles(db) {
  return records(db.users).filter(u =>
    typeof u.id === 'string' &&
    /^[a-zA-Z0-9_-]+$/.test(u.id) && u.disabled !== true
  );
}
module.exports = { summarize, activeProfiles, daysBetween, localDate };
