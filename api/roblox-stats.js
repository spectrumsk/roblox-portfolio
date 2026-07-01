export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

// Verified Universe IDs:
// Archer Training: 9807623580
// Tower Builders: 9375088027
// Brainrot Tower Go Up: 6203110996
// Climb Scary Alien Worm Tower: 5241473212
const UNIVERSE_IDS = "9807623580,9375088027,9540316091,9565343275";
const GROUP_ID = "974814503";

  try {
    const [gameResponse, groupResponse] = await Promise.all([
      fetch(`https://games.roblox.com/v1/games?universeIds=${UNIVERSE_IDS}`),
      fetch(`https://groups.roblox.com/v1/groups/${GROUP_ID}`)
    ]);

    const gameData = await gameResponse.json();
    const groupData = await groupResponse.json();

    return res.status(200).json({
      games: gameData.data || [],
      groupMembers: groupData.memberCount || 0
    });

  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch live data from Roblox APIs" });
  }
}
