/**
 * CampusMate "AI" engine - runs fully offline, no API key needed.
 *
 * 1. classify()   : decides module (FIXORA / CLEANWISE) + category from the text
 *                   using weighted keyword scoring.
 * 2. assess()     : severity score (0-100) -> priority + a written reason.
 *                   Uses danger words, the place (classroom/hostel affect more
 *                   students) and how many similar reports already exist.
 * 3. similarity() : TF-IDF-free cosine similarity on word vectors, used to
 *                   find duplicate / repeated complaints.
 */

const CATEGORIES = [
  // ---- FIXORA (maintenance) ----
  { module: 'FIXORA', name: 'Electrical', words: ['light', 'bulb', 'tube', 'switch', 'socket', 'wire', 'wiring', 'power', 'electric', 'electricity', 'spark:2', 'shock:2', 'fuse', 'current', 'charging', 'projector'] },
  { module: 'FIXORA', name: 'Plumbing', words: ['water', 'tap', 'leak', 'leakage', 'pipe', 'drain', 'flush', 'shower', 'tank', 'motor', 'plumbing', 'seepage'] },
  { module: 'FIXORA', name: 'Fan / AC', words: ['fan', 'ac', 'cooler', 'cooling', 'ventilation', 'heater', 'geyser', 'aircon'] },
  { module: 'FIXORA', name: 'Furniture', words: ['bench', 'desk', 'chair', 'table', 'cot', 'bed', 'cupboard', 'locker', 'door', 'window', 'lock', 'hinge', 'board', 'blackboard', 'whiteboard', 'furniture'] },
  { module: 'FIXORA', name: 'Network / IT', words: ['wifi', 'wi-fi', 'internet', 'network', 'router', 'lan', 'computer', 'system', 'server', 'monitor'] },
  { module: 'FIXORA', name: 'Civil / Structure', words: ['wall', 'ceiling', 'roof', 'crack', 'floor', 'tile', 'paint', 'plaster', 'stairs', 'staircase', 'railing', 'collapse'] },
  // ---- CLEANWISE (cleanliness) ----
  { module: 'CLEANWISE', name: 'Garbage / Waste', words: ['garbage', 'trash', 'waste', 'dustbin', 'bin', 'litter', 'rubbish', 'dump', 'overflowing', 'smell', 'stink', 'odour', 'odor'] },
  { module: 'CLEANWISE', name: 'Washroom Cleanliness', words: ['washroom', 'toilet', 'restroom', 'urinal', 'bathroom', 'latrine', 'commode'] },
  { module: 'CLEANWISE', name: 'Floor / Room Cleaning', words: ['dirty', 'dust', 'dusty', 'sweep', 'sweeping', 'mop', 'mopping', 'stain', 'cleaning', 'unclean', 'filthy', 'cobweb'] },
  { module: 'CLEANWISE', name: 'Pest / Hygiene', words: ['mosquito', 'cockroach', 'rat', 'rats', 'insect', 'ant', 'ants', 'pest', 'flies', 'bedbug', 'stagnant', 'hygiene'] },
  { module: 'CLEANWISE', name: 'Drinking Water Hygiene', words: ['purifier', 'cooler', 'dispenser', 'contaminated', 'muddy', 'drinking'] }
];

const DANGER = [ // [regex, points, label]
  [/\b(fire|smoke|burning|burnt|short ?circuit|spark(s|ing)?)\b/i, 55, 'fire / short-circuit risk'],
  [/\b(shock|electrocut\w*|live wire|exposed wire|naked wire)\b/i, 55, 'electric shock risk'],
  [/\b(gas leak|gas leakage|lpg)\b/i, 55, 'gas leak'],
  [/\b(collapse|collapsed|falling|fell down|about to fall|major crack)\b/i, 50, 'structural danger'],
  [/\b(flood\w*|water ?logging|overflow\w*|burst)\b/i, 38, 'flooding / overflow'],
  [/\b(injur\w*|bleeding|accident|danger\w*|unsafe|hazard\w*)\b/i, 40, 'safety hazard'],
  [/\b(slippery|slip(ped)?|broken glass|sharp)\b/i, 28, 'slip / injury hazard'],
  [/\b(snake|scorpion|bees?|wasp)\b/i, 40, 'dangerous animals'],
  [/\b(no (drinking )?water|no power|power ?cut|blackout|not working at all|completely)\b/i, 28, 'essential service down'],
  [/\b(urgent|emergency|immediately|asap)\b/i, 18, 'reporter marked urgent'],
  [/\b(leak\w*|seepage|dripping)\b/i, 18, 'leakage'],
  [/\b(broken|damag\w*|not working|stopped working|dead|blocked|clogged|choked)\b/i, 14, 'equipment failure'],
  [/\b(stink\w*|foul|smell\w*|rotten|filthy|mosquito|cockroach|rats?)\b/i, 14, 'hygiene problem'],
  [/\b(dirty|dust\w*|stain\w*|untidy|litter\w*)\b/i, 8, 'untidy area']
];

// places that affect many students get a small boost
const AREA_WEIGHT = { Classroom: 8, Lab: 8, Hostel: 6, Canteen: 8, Washroom: 6, Library: 6, Ground: 2, Other: 0 };

const STOP = new Set(('a an the is are was were be been am to of in on at for and or but not no it this that these those there here i we you they my our ' +
  'with from by as has have had very so please kindly sir madam since from nearside beside again also still too just can could would should will ' +
  'do does did done get got getting one two three some any all many much more').split(' '));

function tokenize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\-\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w)).map(stem);
}
// very small stemmer so "leaking", "leaks", "leakage" match each other
function stem(w) {
  return w.replace(/(ing|ed|es|s|age)$/i, m => (w.length - m.length >= 3 ? '' : m));
}

/** Pick module + category by weighted keyword hits. */
function classify(text, hintModule) {
  const tokens = new Set(tokenize(text));
  let best = null;
  for (const c of CATEGORIES) {
    if (hintModule && c.module !== hintModule) continue;
    // each distinct word stem counts once; "word:2" entries are worth double
    const seen = new Map();
    for (const entry of c.words) {
      const [w, wt] = entry.split(':');
      const st = stem(w);
      if (tokens.has(st) && !seen.has(st)) seen.set(st, { word: w, weight: Number(wt) || 1 });
    }
    if (!seen.size) continue;
    const hits = [...seen.values()].map(v => v.word);
    const score = [...seen.values()].reduce((a, v) => a + v.weight, 0);
    if (!best || score > best.score) best = { ...c, score, hits };
  }
  if (!best) {
    const module = hintModule || 'FIXORA';
    return { module, category: module === 'FIXORA' ? 'General Maintenance' : 'General Cleanliness', keywords: [], confidence: 0.3 };
  }
  return { module: best.module, category: best.name, keywords: best.hits.slice(0, 5), confidence: Math.min(0.95, 0.5 + best.score * 0.15) };
}

/** Severity score -> priority + explanation. */
function assess({ text, area = 'Other', reportCount = 1 }) {
  const reasons = [];
  let score = 10;
  // take the strongest danger signal fully, add 35% of the others
  const hits = DANGER.filter(([re]) => re.test(text)).sort((a, b) => b[1] - a[1]);
  hits.forEach(([, pts, label], i) => {
    score += i === 0 ? pts : Math.round(pts * 0.35);
    reasons.push(label);
  });
  const aw = AREA_WEIGHT[area] || 0;
  if (aw) { score += aw; reasons.push(`${area.toLowerCase()} is used by many students`); }
  if (reportCount > 1) {
    const boost = Math.min(30, (reportCount - 1) * 10);
    score += boost;
    reasons.push(`${reportCount} similar reports received`);
  }
  score = Math.max(0, Math.min(100, score));
  const priority = score >= 70 ? 'Critical' : score >= 45 ? 'High' : score >= 25 ? 'Medium' : 'Low';
  const reason = reasons.length
    ? `Marked ${priority} (score ${score}/100): ${reasons.join(', ')}.`
    : `Marked ${priority} (score ${score}/100): no urgent or dangerous wording found.`;
  return { score, priority, reason };
}

/** Cosine similarity between two texts (0..1). */
function similarity(a, b) {
  const ta = tokenize(a), tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  const fa = {}, fb = {};
  ta.forEach(w => fa[w] = (fa[w] || 0) + 1);
  tb.forEach(w => fb[w] = (fb[w] || 0) + 1);
  let dot = 0, na = 0, nb = 0;
  for (const w in fa) { na += fa[w] ** 2; if (fb[w]) dot += fa[w] * fb[w]; }
  for (const w in fb) nb += fb[w] ** 2;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Same place? Compares the free-text locations.
 * Generic words (block, hostel, room...) are ignored so only the distinguishing
 * parts count: "Hostel Block B" == "hostel block b", but "Block A" != "Block B",
 * and "Main Canteen" != "Test Canteen 12".  Single letters/numbers are kept.
 */
const GENERIC_LOC = new Set(['block', 'hostel', 'room', 'hall', 'floor', 'building', 'main', 'the', 'near', 'at', 'of', 'in', 'no', 'number', 'rm', 'campus']);
const locWords = t => String(t || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
function sameLocation(a, b) {
  const wa = locWords(a), wb = locWords(b);
  let sa = new Set(wa.filter(w => !GENERIC_LOC.has(w))), sb = new Set(wb.filter(w => !GENERIC_LOC.has(w)));
  if (!sa.size || !sb.size) { sa = new Set(wa); sb = new Set(wb); }   // e.g. "Main Hostel"
  if (!sa.size || !sb.size) return false;
  const common = [...sa].filter(w => sb.has(w)).length;
  return common / (sa.size + sb.size - common) >= 0.6;                 // Jaccard similarity
}

const DUPLICATE_THRESHOLD = 0.45;

/** Find the best matching *open* complaint among candidates. */
function findDuplicate(candidate, openComplaints) {
  let best = null;
  for (const c of openComplaints) {
    if (c.module !== candidate.module || c.area !== candidate.area) continue;
    if (!sameLocation(c.location, candidate.location)) continue;
    const s = similarity(`${c.category} ${c.description}`, `${candidate.category} ${candidate.description}`);
    if (s >= DUPLICATE_THRESHOLD && (!best || s > best.similarity)) best = { complaint: c, similarity: s };
  }
  return best;
}

module.exports = { classify, assess, similarity, findDuplicate, tokenize, DUPLICATE_THRESHOLD };
