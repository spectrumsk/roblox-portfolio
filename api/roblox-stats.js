export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  const UNIVERSE_IDS = "9807623580,9375088027,9540316091,9565343275";
  const GROUP_ID = "974814503";

  try {
    const [gameResponse, voteResponse, groupResponse] = await Promise.all([
      fetch(`https://games.roblox.com/v1/games?universeIds=${UNIVERSE_IDS}`),
      fetch(`https://games.roblox.com/v1/games/votes?universeIds=${UNIVERSE_IDS}`),
      fetch(`https://groups.roblox.com/v1/groups/${GROUP_ID}`)
    ]);

    const gameData = await gameResponse.json();
    const voteData = await voteResponse.json();
    const groupData = await groupResponse.json();

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

    return res.status(200).json({
      games,
      groupMembers: groupData.memberCount || 0
    });

  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch live data from Roblox APIs" });
  }
}
