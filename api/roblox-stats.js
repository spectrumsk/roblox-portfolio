// Bound upstream latency and retry transient Roblox failures once.
export async function fetchRoblox(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return response;
      throw new Error(`Roblox ${response.status}: ${url}`);
    } catch (error) {
      if (attempt === 1) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

export async function savePingPongPeak(playing) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return 4500;
  const candidate = Number.isSafeInteger(playing) && playing >= 0 ? playing : 0;
  try {
    // Redis executes this comparison and write atomically, so concurrent requests
    // cannot overwrite a higher peak. No expiration: retain it across deployments.
    const script = `
      local saved = tonumber(redis.call('GET', KEYS[1])) or 4500
      local peak = math.max(4500, saved, tonumber(ARGV[1]))
      if not redis.call('GET', KEYS[1]) or peak > saved then
        redis.call('SET', KEYS[1], tostring(peak))
      end
      return peak
    `;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EVAL', script, '1', 'pingpong:peak-concurrent', String(candidate)]),
      signal: AbortSignal.timeout(1500)
    });
    if (!response.ok) throw new Error('Peak storage unavailable');
    const { result, error } = await response.json();
    if (error || !Number.isSafeInteger(result) || result < 4500) throw new Error('Invalid saved peak');
    return result;
  } catch {
    console.warn('Peak storage unavailable; using 4500 display fallback');
    return 4500;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  const UNIVERSE_IDS = "9807623580,10628526114,10323220670,9375088027,9540316091,9565343275,10774449334,10776235123";
  const GROUP_ID = "974814503";
  const TRAINING_GROUP_ID = "632335719";
  const SHADOWSTAR_GROUP_ID = "16161064";

  try {
    const [gameResponse, voteResponse, groupResponse, trainingGroupResponse, shadowstarGroupData, sillybilliesGroupData] = await Promise.all([
      fetchRoblox(`https://games.roblox.com/v1/games?universeIds=${UNIVERSE_IDS}`),
      fetchRoblox(`https://games.roblox.com/v1/games/votes?universeIds=${UNIVERSE_IDS}`),
      fetchRoblox(`https://groups.roblox.com/v1/groups/${GROUP_ID}`),
      fetchRoblox(`https://groups.roblox.com/v1/groups/${TRAINING_GROUP_ID}`),
      fetchRoblox(`https://groups.roblox.com/v1/groups/${SHADOWSTAR_GROUP_ID}`)
        .then(response => response.ok ? response.json() : null)
        .catch(() => null),
      fetchRoblox('https://groups.roblox.com/v1/groups/168725073')
        .then(response => response.ok ? response.json() : null)
        .catch(() => null)
    ]);

    if (![gameResponse, voteResponse, groupResponse, trainingGroupResponse].every(response => response.ok)) {
      throw new Error('Roblox API request failed');
    }

    const gameData = await gameResponse.json();
    const voteData = await voteResponse.json();
    const groupData = await groupResponse.json();
    const trainingGroupData = await trainingGroupResponse.json();

    if (!Array.isArray(gameData.data) || !Array.isArray(voteData.data)) {
      throw new Error('Invalid Roblox game data');
    }

    const games = (gameData.data || []).map(game => {
      const vote = (voteData.data || []).find(v => v.id === game.id);
      const totalVotes = vote ? vote.upVotes + vote.downVotes : 0;

      return {
        ...game,
        rating: totalVotes > 0
          ? Math.round((vote.upVotes / totalVotes) * 100)
          : null
      };
    });

    const peakConcurrent = await savePingPongPeak(
      games.find(game => game.id === 10628526114)?.playing
    );

    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      games,
      peakConcurrent,
      groupMembers: groupData.memberCount || 0,
      trainingGroupMembers: trainingGroupData.memberCount || 0,
      shadowstarGroupMembers: Number.isFinite(shadowstarGroupData?.memberCount)
        ? shadowstarGroupData.memberCount : null,
      sillybilliesGroupMembers: Number.isFinite(sillybilliesGroupData?.memberCount)
        ? sillybilliesGroupData.memberCount : null
    });

  } catch (error) {
    console.error('Roblox stats failed:', error.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: "Failed to fetch live data from Roblox APIs" });
  }
}
