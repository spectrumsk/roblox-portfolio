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

  const UNIVERSE_IDS = "9807623580,10628526114,10323220670,9375088027,9540316091,9565343275";
  const GROUP_ID = "974814503";
  const TRAINING_GROUP_ID = "632335719";
  const SHADOWSTAR_GROUP_ID = "16161064";

  try {
    const [gameResponse, voteResponse, groupResponse, trainingGroupResponse, shadowstarGroupData] = await Promise.all([
      fetch(`https://games.roblox.com/v1/games?universeIds=${UNIVERSE_IDS}`),
      fetch(`https://games.roblox.com/v1/games/votes?universeIds=${UNIVERSE_IDS}`),
      fetch(`https://groups.roblox.com/v1/groups/${GROUP_ID}`),
      fetch(`https://groups.roblox.com/v1/groups/${TRAINING_GROUP_ID}`),
      fetch(`https://groups.roblox.com/v1/groups/${SHADOWSTAR_GROUP_ID}`, { signal: AbortSignal.timeout(3000) })
        .then(response => response.ok ? response.json() : null)
        .catch(() => null)
    ]);

    const gameData = await gameResponse.json();
    const voteData = await voteResponse.json();
    const groupData = await groupResponse.json();
    const trainingGroupData = await trainingGroupResponse.json();

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

    return res.status(200).json({
      games,
      peakConcurrent,
      groupMembers: groupData.memberCount || 0,
      trainingGroupMembers: trainingGroupData.memberCount || 0,
      shadowstarGroupMembers: Number.isFinite(shadowstarGroupData?.memberCount)
        ? shadowstarGroupData.memberCount : null
    });

  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch live data from Roblox APIs" });
  }
}
