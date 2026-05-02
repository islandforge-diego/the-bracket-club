export function buildBracket(items) {
  if (items.length < 2) return { rounds: [], seeds: items };

  const seeds = [...items];
  const rounds = [];

  const r1 = [];
  let pos = 0;
  const pairCount = Math.floor(seeds.length / 2);
  for (let i = 0; i < pairCount; i++) {
    const match = { id: `r1_${i}`, a: seeds[pos++], b: seeds[pos++] };
    if (i === pairCount - 1 && seeds.length % 2 === 1) {
      match.c = seeds[pos++];
    }
    r1.push(match);
  }
  rounds.push(r1);

  let roundNum = 2;
  while (rounds[rounds.length - 1].length > 1) {
    const prev = rounds[rounds.length - 1];
    const prevLen = prev.length;
    const matchCount = Math.floor(prevLen / 2);
    const rnd = [];
    let fi = 0;
    for (let i = 0; i < matchCount; i++) {
      const match = { id: `r${roundNum}_${i}`, feedA: prev[fi++].id, feedB: prev[fi++].id };
      if (i === matchCount - 1 && prevLen % 2 === 1) {
        match.feedC = prev[fi++].id;
      }
      rnd.push(match);
    }
    rounds.push(rnd);
    roundNum++;
  }
  return { rounds, seeds };
}

export function getBracketWinner(matchId, rounds, picks) {
  return picks[matchId] || null;
}

export function isMatchEmpty(matchId, rounds) {
  const round = rounds.find(r => r.some(m => m.id === matchId));
  if (!round) return true;
  const match = round.find(m => m.id === matchId);
  if (!match) return true;
  if (match.a !== undefined) return !match.a && !match.b;
  const feedAEmpty = match.feedA ? isMatchEmpty(match.feedA, rounds) : true;
  const feedBEmpty = match.feedB ? isMatchEmpty(match.feedB, rounds) : true;
  return feedAEmpty && feedBEmpty;
}

export function getR1Winner(match, months, bracket) {
  if (bracket[match.id]) return bracket[match.id];
  const b1 = months[match.m1]?.winner;
  const b2 = months[match.m2]?.winner;
  if (b1 && !b2) return b1;
  if (b2 && !b1) return b2;
  return null;
}

export function getMatchItems(match, months, bracket, R1) {
  if (match.m1 !== undefined) {
    return { b1: months[match.m1]?.winner || null, b2: months[match.m2]?.winner || null };
  }
  const r1a = R1.find(r => r.id === match.p1);
  const r1b = R1.find(r => r.id === match.p2);
  return {
    b1: r1a ? getR1Winner(r1a, months, bracket) : (bracket[match.p1] || null),
    b2: r1b ? getR1Winner(r1b, months, bracket) : (bracket[match.p2] || null),
  };
}
