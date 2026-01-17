import React, { useState, useEffect, useMemo } from 'react';
import { PlusCircle, TrendingUp, Target, Calendar, BarChart3 } from 'lucide-react';

/**
 * ChessTracker with Insight Engine
 * - Uses localStorage for persistence (works in any regular browser app)
 * - Fixed delete/save/load logic
 * - Insight engine produces human-friendly recommendations
 */

const STORAGE_KEY = 'chess-games';

const ChessTracker = () => {
  const [games, setGames] = useState([]);
  const [currentView, setCurrentView] = useState('dashboard');
  const [currentGame, setCurrentGame] = useState(null);
  const [editingGame, setEditingGame] = useState(null);
  const [gameForm, setGameForm] = useState({
    date: new Date().toISOString().split('T')[0],
    color: 'white',
    opponentRating: '',
    result: 'win',
    opening: '',
    timeControl: 'rapid',
    gameLink: '',
    pgn: ''
  });
  const [mistakeForm, setMistakeForm] = useState({
    mistakeType: 'tactical',
    tacticType: 'fork',
    positionalType: 'weakSquares',
    gamePhase: 'middlegame',
    timePressure: false,
    note: ''
  });

  /* ----------------------------- STORAGE HELPERS (localStorage) ----------------------------- */

  const loadGamesFromStorage = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      // Ensure array shape
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveGamesToStorage = (updatedGames) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedGames));
    } catch (err) {
      console.error('Failed to save games to storage', err);
    }
  };

  useEffect(() => {
    const stored = loadGamesFromStorage();
    setGames(stored);
  }, []);

  /* ----------------------------- CRUD: Games & Mistakes ----------------------------- */

  const saveGames = (updatedGames) => {
    setGames(updatedGames);
    saveGamesToStorage(updatedGames);
  };

  const handleAddGame = () => {
    if (!gameForm.opponentRating || !gameForm.opening) {
      alert('Please fill in all required fields');
      return;
    }

    if (editingGame) {
      const updatedGames = games.map(g =>
        g.id === editingGame.id ? { ...g, ...gameForm } : g
      );
      saveGames(updatedGames);
      setEditingGame(null);
      setCurrentView('dashboard');
      resetGameForm();
      return;
    }

    const newGame = {
      id: Date.now(),
      ...gameForm,
      mistakes: []
    };
    const updatedGames = [...games, newGame];
    saveGames(updatedGames);
    setCurrentGame(newGame);
    setCurrentView('addMistake');
    resetGameForm();
  };

  const handleEditGame = (game) => {
    setEditingGame(game);
    setGameForm({
      date: game.date,
      color: game.color,
      opponentRating: game.opponentRating,
      result: game.result,
      opening: game.opening,
      timeControl: game.timeControl,
      gameLink: game.gameLink || '',
      pgn: game.pgn || ''
    });
    setCurrentView('addGame');
  };

  const handleDeleteGame = (gameId) => {
    if (!window.confirm('Are you sure you want to delete this game?')) return;
    const updatedGames = games.filter(g => g.id !== gameId);
    saveGames(updatedGames);
    if (currentGame?.id === gameId) {
      setCurrentGame(null);
      setCurrentView('dashboard');
    }
  };

  const handleAddMistake = () => {
    if (!currentGame) return; // safety
    const updatedGames = games.map(game =>
      game.id === currentGame.id
        ? {
            ...game,
            mistakes: [...(game.mistakes || []), { ...mistakeForm, id: Date.now() }]
          }
        : game
    );
    saveGames(updatedGames);
    setCurrentGame(updatedGames.find(g => g.id === currentGame.id));
    resetMistakeForm();
  };

  const finishAddingMistakes = () => {
    setCurrentGame(null);
    setCurrentView('dashboard');
  };

  const resetGameForm = () => {
    setGameForm({
      date: new Date().toISOString().split('T')[0],
      color: 'white',
      opponentRating: '',
      result: 'win',
      opening: '',
      timeControl: 'rapid',
      gameLink: '',
      pgn: ''
    });
  };

  const resetMistakeForm = () => {
    setMistakeForm({
      mistakeType: 'tactical',
      tacticType: 'fork',
      positionalType: 'weakSquares',
      gamePhase: 'middlegame',
      timePressure: false,
      note: ''
    });
  };

  /* ----------------------------- STATS / AGGREGATIONS ----------------------------- */

  const totalGames = games.length;
  const totalMistakes = games.reduce(
    (sum, g) => sum + (g.mistakes ? g.mistakes.length : 0),
    0
  );

  const getWinRate = () => {
    if (totalGames === 0) return 0;
    const wins = games.filter(g => g.result === 'win').length;
    return ((wins / totalGames) * 100).toFixed(1);
  };

  const getTacticStats = () => {
    const tacticCounts = {};
    games.forEach(game => {
      (game.mistakes || []).forEach(mistake => {
        const key =
          mistake.mistakeType === 'tactical'
            ? mistake.tacticType
            : mistake.positionalType;
        tacticCounts[key] = (tacticCounts[key] || 0) + 1;
      });
    });
    return Object.entries(tacticCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  };

  const getOpeningStats = () => {
    const openingPerf = {};
    games.forEach(game => {
      const openingKey = game.opening || 'Unknown';
      if (!openingPerf[openingKey])
        openingPerf[openingKey] = { wins: 0, total: 0 };
      openingPerf[openingKey].total++;
      if (game.result === 'win') openingPerf[openingKey].wins++;
    });
    return Object.entries(openingPerf)
      .map(([opening, stats]) => ({
        opening,
        winRate: Number(((stats.wins / stats.total) * 100).toFixed(0)),
        games: stats.total
      }))
      .sort((a, b) => b.games - a.games);
  };

  /* ----------------------------- INSIGHT ENGINE ----------------------------- */

  // Helper: compute mistake counts split by type, phase, time pressure
  const computeMistakeBreakdown = () => {
    const byTactic = {};
    const byPositional = {};
    const byPhase = { opening: 0, middlegame: 0, endgame: 0 };
    let timePressureCount = 0;
    let totalMistakeCount = 0;

    games.forEach(game => {
      (game.mistakes || []).forEach(m => {
        totalMistakeCount++;
        if (m.timePressure) timePressureCount++;
        if (m.mistakeType === 'tactical') {
          byTactic[m.tacticType] = (byTactic[m.tacticType] || 0) + 1;
        } else {
          byPositional[m.positionalType] =
            (byPositional[m.positionalType] || 0) + 1;
        }
        if (m.gamePhase && byPhase[m.gamePhase] !== undefined) {
          byPhase[m.gamePhase]++;
        }
      });
    });
    return { byTactic, byPositional, byPhase, timePressureCount, totalMistakeCount };
  };

  // Trend: compare last N games average mistakes vs previous N games
  const computeMistakeTrend = (windowSize = 10) => {
    if (games.length === 0) return null;

    // sort by date (YYYY-MM-DD) ascending
    const sorted = [...games].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );
    const last = sorted.slice(-windowSize);
    const prev = sorted.slice(-2 * windowSize, -windowSize);

    const avg = arr =>
      arr.length
        ? arr.reduce((s, g) => s + (g.mistakes ? g.mistakes.length : 0), 0) /
          arr.length
        : 0;

    const lastAvg = avg(last);
    const prevAvg = avg(prev);

    if (prev.length === 0) {
      return { type: 'insufficient', lastAvg, prevAvg: null };
    }

    const change =
      prevAvg === 0 ? (lastAvg === 0 ? 0 : 100) : ((lastAvg - prevAvg) / prevAvg) * 100;

    return { type: 'trend', lastAvg, prevAvg, changePercent: change };
  };

  const generateInsights = () => {
    if (!games || games.length === 0) {
      return ['No games yet — add a game to generate insights.'];
    }

    const openingStats = getOpeningStats();
    const tacticStats = getTacticStats();
    const {
      byTactic,
      byPositional,
      byPhase,
      timePressureCount,
      totalMistakeCount
    } = computeMistakeBreakdown();
    const trend = computeMistakeTrend(10);

    const insights = [];

    // Overall summary
    insights.push(
      `You've logged ${totalGames} game${totalGames > 1 ? 's' : ''} with ${totalMistakes} total mistake${totalMistakes !== 1 ? 's' : ''}. Your win rate is ${getWinRate()}%.`
    );

    // Average mistakes
    const avgMistakes = totalGames ? (totalMistakes / totalGames).toFixed(2) : '0.00';
    insights.push(`Average mistakes per game: ~${avgMistakes}.`);

    // Top tactical miss
    if (tacticStats.length > 0) {
      const [topTactic, count] = tacticStats[0];
      insights.push(
        `Top missed tactic: ${formatKey(topTactic)} — ${count} time${count > 1 ? 's' : ''}. Drill ${formatTacticPractice(topTactic)}.`
      );
    }

    // Positional top if exists
    const positionalEntries = Object.entries(byPositional).sort(
      (a, b) => b[1] - a[1]
    );
    if (positionalEntries.length > 0) {
      const [pos, c] = positionalEntries[0];
      insights.push(
        `Top positional weakness: ${formatKey(pos)} — ${c} time${c > 1 ? 's' : ''}. Study typical plans and motifs.`
      );
    }

    // Time pressure
    if (totalMistakeCount > 0) {
      const tpPct = ((timePressureCount / totalMistakeCount) * 100).toFixed(0);
      if (timePressureCount / totalMistakeCount > 0.25) {
        insights.push(
          `${tpPct}% of mistakes happen under time pressure. Practice faster tactics and time management (e.g., 5×5 minute tactic sprints).`
        );
      } else {
        insights.push(`${tpPct}% of mistakes happen under time pressure.`);
      }
    }

    // Phase distribution
    const phaseSorted = Object.entries(byPhase).sort((a, b) => b[1] - a[1]);
    if (phaseSorted[0] && phaseSorted[0][1] > 0) {
      insights.push(
        `Most mistakes occur in the ${phaseSorted[0][0]}. Focus training there (targeted opening drills / endgame technique).`
      );
    }

    // Opening weakness
    if (openingStats.length > 0) {
      const worst = [...openingStats].sort((a, b) => a.winRate - b.winRate)[0];
      if (worst && worst.games >= 2) {
        insights.push(
          `Opening to watch: ${worst.opening} — ${worst.winRate}% win rate over ${worst.games} games. Consider reviewing main lines and common traps.`
        );
      }
    }

    // Trend insight
    if (trend) {
      if (trend.type === 'insufficient') {
        insights.push(
          `Play at least ${10} more games to generate trend insights (we compare recent vs previous games).`
        );
      } else {
        const delta = trend.changePercent;
        const sign =
          delta > 0 ? 'increased' : delta < 0 ? 'decreased' : 'stayed about the same';
        const percentStr = Math.abs(delta).toFixed(0);
        insights.push(
          `Mistakes per game over the last ${10} games ${sign} by ${percentStr}% compared to the previous ${10} games (last avg: ${trend.lastAvg.toFixed(2)} mistakes/game).`
        );
      }
    }

    // Actionable final recommendation
    insights.push(
      'Recommended plan: 10–15 minutes/day of targeted tactics (start with your top missed tactic), 3× weekly 15-minute quick games focusing on time control, and review 2 games/week with annotations.'
    );

    return insights;
  };

  // small helper to make keys readable
  const formatKey = (k) => {
    if (!k) return '';
    return k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
  };

  const formatTacticPractice = (tacticKey) => {
    const t = tacticKey.toLowerCase();
    if (t.includes('fork')) return 'fork puzzles and knight coordination drills';
    if (t.includes('pin')) return 'pin & skewers practice';
    if (t.includes('back')) return 'back-rank mate pattern drills';
    if (t.includes('zwischenzug')) return 'zwischenzug pattern recognition';
    if (t.includes('xray')) return 'x-ray and battery tactics';
    return 'mixed tactical puzzles around this motif';
  };

  /* ----------------------------- Memoized insights for rendering ----------------------------- */

  const insights = useMemo(generateInsights, [games]);

  /* ----------------------------- RENDER HELPERS ----------------------------- */

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-6 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Win Rate</p>
              <p className="text-3xl font-bold text-blue-900">{getWinRate()}%</p>
            </div>
            <TrendingUp className="text-blue-500" size={32} />
          </div>
        </div>
        <div className="bg-red-50 p-6 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 font-medium">Total Mistakes</p>
              <p className="text-3xl font-bold text-red-900">{totalMistakes}</p>
            </div>
            <Target className="text-red-500" size={32} />
          </div>
        </div>
        <div className="bg-green-50 p-6 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Games Logged</p>
              <p className="text-3xl font-bold text-green-900">{totalGames}</p>
            </div>
            <Calendar className="text-green-500" size={32} />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <BarChart3 size={20} /> Most Missed Tactics & Positional Errors
        </h3>
        {getTacticStats().length > 0 ? (
          <div className="space-y-3">
            {getTacticStats().map(([tactic, count]) => (
              <div key={tactic} className="flex items-center justify-between">
                <span className="capitalize font-medium">{formatKey(tactic)}</span>
                <div className="flex items-center gap-3">
                  <div className="bg-gray-200 rounded-full h-2 w-32">
                    <div
                      className="bg-red-500 h-2 rounded-full"
                      style={{ width: `${(count / (totalMistakes || 1)) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">
            No mistakes logged yet. Add a game to get started!
          </p>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-bold mb-4">Quick Insights & Recommendations</h3>
        <div className="space-y-2">
          {insights.map((s, i) => (
            <div key={i} className="text-sm text-gray-700">
              • {s}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-bold mb-4">Opening Performance</h3>
        {getOpeningStats().length > 0 ? (
          <div className="space-y-2">
            {getOpeningStats().map(stat => (
              <div key={stat.opening} className="flex justify-between items-center py-2 border-b">
                <span className="font-medium">{stat.opening}</span>
                <div className="flex gap-4">
                  <span className="text-sm text-gray-600">{stat.games} games</span>
                  <span className="font-bold text-blue-600">{stat.winRate}%</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No games logged yet.</p>
        )}
      </div>
    </div>
  );

  const renderAddGame = () => (
    <div className="bg-white p-6 rounded-lg shadow max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">
        {editingGame ? 'Edit Game' : 'Add New Game'}
      </h2>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input
              type="date"
              value={gameForm.date}
              onChange={(e) => setGameForm({ ...gameForm, date: e.target.value })}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Your Color</label>
            <select
              value={gameForm.color}
              onChange={(e) => setGameForm({ ...gameForm, color: e.target.value })}
              className="w-full p-2 border rounded"
            >
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Opponent Rating</label>
            <input
              type="number"
              value={gameForm.opponentRating}
              onChange={(e) =>
                setGameForm({ ...gameForm, opponentRating: e.target.value })
              }
              className="w-full p-2 border rounded"
              placeholder="1500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Result</label>
            <select
              value={gameForm.result}
              onChange={(e) => setGameForm({ ...gameForm, result: e.target.value })}
              className="w-full p-2 border rounded"
            >
              <option value="win">Win</option>
              <option value="loss">Loss</option>
              <option value="draw">Draw</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Opening</label>
          <input
            type="text"
            value={gameForm.opening}
            onChange={(e) => setGameForm({ ...gameForm, opening: e.target.value })}
            className="w-full p-2 border rounded"
            placeholder="e.g., Sicilian Defense, Italian Game"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Time Control</label>
          <select
            value={gameForm.timeControl}
            onChange={(e) =>
              setGameForm({ ...gameForm, timeControl: e.target.value })
            }
            className="w-full p-2 border rounded"
          >
            <option value="blitz">Blitz</option>
            <option value="rapid">Rapid</option>
            <option value="classical">Classical</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Game Link (optional)</label>
          <input
            type="url"
            value={gameForm.gameLink}
            onChange={(e) => setGameForm({ ...gameForm, gameLink: e.target.value })}
            className="w-full p-2 border rounded"
            placeholder="https://chess.com/..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">PGN (optional)</label>
          <textarea
            value={gameForm.pgn}
            onChange={(e) => setGameForm({ ...gameForm, pgn: e.target.value })}
            className="w-full p-2 border rounded font-mono text-sm"
            rows={4}
            placeholder={`[Event "?"]\n1. e4 e5 2. Nf3 Nc6...`}
          />
        </div>

        <button
          onClick={handleAddGame}
          className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700"
        >
          {editingGame ? 'Save Changes' : 'Add Game & Log Mistakes'}
        </button>
        {editingGame && (
          <button
            onClick={() => {
              setEditingGame(null);
              setCurrentView('dashboard');
              resetGameForm();
            }}
            className="w-full bg-gray-600 text-white py-2 rounded-lg font-medium hover:bg-gray-700"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );

  const renderAddMistake = () => (
    <div className="bg-white p-6 rounded-lg shadow max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Log Mistakes</h2>
      <p className="text-gray-600 mb-6">
        Game vs {currentGame?.opponentRating} rated opponent
      </p>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-1">Mistake Type</label>
          <select
            value={mistakeForm.mistakeType}
            onChange={(e) =>
              setMistakeForm({ ...mistakeForm, mistakeType: e.target.value })
            }
            className="w-full p-2 border rounded"
          >
            <option value="tactical">Tactical</option>
            <option value="positional">Positional</option>
          </select>
        </div>

        {mistakeForm.mistakeType === 'tactical' ? (
          <div>
            <label className="block text-sm font-medium mb-1">Tactic Type Missed</label>
            <select
              value={mistakeForm.tacticType}
              onChange={(e) =>
                setMistakeForm({ ...mistakeForm, tacticType: e.target.value })
              }
              className="w-full p-2 border rounded"
            >
              <option value="fork">Fork</option>
              <option value="pin">Pin</option>
              <option value="skewer">Skewer</option>
              <option value="backRank">Back Rank Mate</option>
              <option value="discoveredAttack">Discovered Attack</option>
              <option value="discoveredCheck">Discovered Check</option>
              <option value="doubleAttack">Double Attack</option>
              <option value="removalOfDefender">Removal of Defender</option>
              <option value="deflection">Deflection</option>
              <option value="decoy">Decoy</option>
              <option value="sacrifice">Sacrifice</option>
              <option value="zwischenzug">Zwischenzug/Intermezzo</option>
              <option value="xRay">X-Ray Attack</option>
              <option value="windmill">Windmill</option>
              <option value="desperado">Desperado</option>
              <option value="trappedPiece">Trapped Piece</option>
              <option value="hangingPiece">Hanging Piece</option>
              <option value="checkmate">Checkmate Pattern</option>
              <option value="other">Other Tactical</option>
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-1">Positional Error</label>
            <select
              value={mistakeForm.positionalType}
              onChange={(e) =>
                setMistakeForm({ ...mistakeForm, positionalType: e.target.value })
              }
              className="w-full p-2 border rounded"
            >
              <option value="weakSquares">Weak Squares</option>
              <option value="badBishop">Bad Bishop</option>
              <option value="pawnStructure">Pawn Structure</option>
              <option value="kingSafety">King Safety</option>
              <option value="pieceActivity">Piece Activity</option>
              <option value="spaceAdvantage">Space Advantage</option>
              <option value="initiative">Loss of Initiative</option>
              <option value="badTrade">Bad Trade/Exchange</option>
              <option value="wrongPlan">Wrong Plan</option>
              <option value="passedPawn">Passed Pawn</option>
              <option value="weakPawn">Weak/Isolated Pawn</option>
              <option value="outpost">Outpost Squares</option>
              <option value="openFile">Open File Control</option>
              <option value="coordination">Piece Coordination</option>
              <option value="prophylaxis">Lack of Prophylaxis</option>
              <option value="other">Other Positional</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Game Phase</label>
          <select
            value={mistakeForm.gamePhase}
            onChange={(e) =>
              setMistakeForm({ ...mistakeForm, gamePhase: e.target.value })
            }
            className="w-full p-2 border rounded"
          >
            <option value="opening">Opening</option>
            <option value="middlegame">Middlegame</option>
            <option value="endgame">Endgame</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={mistakeForm.timePressure}
            onChange={(e) =>
              setMistakeForm({ ...mistakeForm, timePressure: e.target.checked })
            }
            className="w-4 h-4"
          />
          <label className="text-sm font-medium">Time pressure?</label>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Note (optional)</label>
          <textarea
            value={mistakeForm.note}
            onChange={(e) => setMistakeForm({ ...mistakeForm, note: e.target.value })}
            className="w-full p-2 border rounded"
            rows={3}
            placeholder="What happened? What should you have seen?"
          />
        </div>

        <button
          onClick={handleAddMistake}
          className="w-full bg-red-600 text-white py-2 rounded-lg font-medium hover:bg-red-700"
        >
          Add Mistake
        </button>
      </div>

      <div className="border-t pt-4">
        <h3 className="font-bold mb-2">
          Mistakes logged for this game: {currentGame?.mistakes?.length || 0}
        </h3>
        {currentGame?.mistakes?.length > 0 && (
          <div className="space-y-2 mb-4">
            {currentGame.mistakes.map((m) => (
              <div key={m.id} className="bg-gray-50 p-3 rounded">
                <div className="font-medium capitalize">
                  {m.mistakeType === 'tactical'
                    ? formatKey(m.tacticType)
                    : formatKey(m.positionalType)}{' '}
                  - {m.gamePhase}
                  {m.timePressure && (
                    <span className="text-red-600 ml-2">⏱️ Time pressure</span>
                  )}
                </div>
                {m.note && (
                  <p className="text-sm text-gray-600 mt-1">{m.note}</p>
                )}
              </div>
            ))}
          </div>
        )}
        <button
          onClick={finishAddingMistakes}
          className="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700"
        >
          Done - Back to Dashboard
        </button>
      </div>
    </div>
  );

  const renderGameHistory = () => (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">Game History</h2>
      {games.length > 0 ? (
        <div className="space-y-4">
          {[...games].reverse().map(game => (
            <div key={game.id} className="border rounded-lg p-4 hover:bg-gray-50">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="font-bold text-lg">
                    {game.opening}{' '}
                    <span
                      className={`ml-3 px-2 py-1 rounded text-sm ${
                        game.result === 'win'
                          ? 'bg-green-100 text-green-800'
                          : game.result === 'loss'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {game.result.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {game.date} • {game.color} • vs {game.opponentRating} •{' '}
                    {game.timeControl}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleEditGame(game)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium px-3 py-1 border rounded"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteGame(game.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium px-3 py-1 border rounded"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {game.mistakes.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="text-sm font-medium text-red-600 mb-2">
                    {game.mistakes.length} mistake
                    {game.mistakes.length > 1 ? 's' : ''} logged
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {game.mistakes.map((m) => (
                      <span
                        key={m.id}
                        className={`text-xs px-2 py-1 rounded ${
                          m.mistakeType === 'tactical'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-orange-50 text-orange-700'
                        }`}
                      >
                        {m.mistakeType === 'tactical'
                          ? formatKey(m.tacticType)
                          : formatKey(m.positionalType)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {game.gameLink && (
                <a
                  href={game.gameLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline mt-2 inline-block"
                >
                  View game →
                </a>
              )}

              {game.pgn && (
                <details className="mt-3">
                  <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                    View PGN
                  </summary>
                  <pre className="mt-2 text-xs bg-gray-100 p-3 rounded overflow-x-auto font-mono">
                    {game.pgn}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500">No games logged yet.</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white shadow-sm rounded-lg p-4 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">
            Chess Tactics Tracker
          </h1>
          <p className="text-gray-600">
            Track your games, identify tactical weaknesses, and get targeted recommendations.
          </p>
        </div>

        <div className="bg-white shadow-sm rounded-lg p-2 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`px-4 py-2 rounded font-medium ${
                currentView === 'dashboard'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => {
                setEditingGame(null);
                resetGameForm();
                setCurrentView('addGame');
              }}
              className={`px-4 py-2 rounded font-medium flex items-center gap-2 ${
                currentView === 'addGame'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <PlusCircle size={18} /> Add Game
            </button>
            <button
              onClick={() => setCurrentView('history')}
              className={`px-4 py-2 rounded font-medium ${
                currentView === 'history'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              History
            </button>
          </div>
        </div>

        {currentView === 'dashboard' && renderDashboard()}
        {currentView === 'addGame' && renderAddGame()}
        {currentView === 'addMistake' && renderAddMistake()}
        {currentView === 'history' && renderGameHistory()}
      </div>
    </div>
  );
};

export default ChessTracker;
