document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const bodyElement = document.body;
    const boardElement = document.getElementById('board');
    const scoreElement = document.getElementById('score');
    const turnElement = document.getElementById('turn');
    const menuElement = document.getElementById('menu');
    const gameAreaElement = document.getElementById('game-area');
    const multiplayerBtn = document.getElementById('multiplayer-btn');
    const botBtn = document.getElementById('bot-btn');
    const loadGameBtn = document.getElementById('load-game-btn');
    const gameOverMessageElement = document.getElementById('game-over-message');
    const restartBtn = document.getElementById('restart-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = settingsModal.querySelector('.close-btn');
    const themeChoiceButtons = settingsModal.querySelectorAll('.theme-choice');
    const difficultyChoiceButtons = settingsModal.querySelectorAll('.difficulty-choice');
    const statsDisplayElement = document.getElementById('stats-display');
    const resetStatsBtn = document.getElementById('reset-stats-btn');
    const backToMenuBtn = document.getElementById('back-to-menu-btn');
    const saveGameBtn = document.getElementById('save-game-btn');
    const undoBtn = document.getElementById('undo-btn');
    const actionFeedbackElement = document.getElementById('action-feedback');

    // --- Constants ---
    const BOARD_SIZE = 8;
    const EMPTY = 0; const BLACK = 1; const WHITE = 2; // BLACK=P1/Human, WHITE=P2/Bot
    // AI Depths per difficulty
    const MAX_AI_DEPTH_EXPERT = 6; // Can try 7, watch performance
    const MAX_AI_DEPTH_HARD = 5;
    const MAX_AI_DEPTH_MEDIUM = 3;
    const MAX_AI_DEPTH_EASY = 1; // Depth 1 uses basic evaluation
    const ENDGAME_DEPTH_LIMIT = 12; // Max empty squares to attempt full search
    const EXACT_SCORE_FACTOR = 10000; // Large factor for definitive win/loss
    // localStorage Keys
    const SAVE_GAME_KEY = 'savedOthelloGame_v2'; // Changed key if format changes
    const STATS_KEY = 'othelloStats_v2';
    const DIFFICULTY_KEY = 'othelloDifficulty_v2';
    const THEME_KEY = 'othelloTheme_v2';


    // --- Game State ---
    let board = [];
    let currentPlayer;
    let gameMode = null; // 'multiplayer', 'bot'
    let botDifficulty = 'hard'; // Default difficulty
    let gameOver = false;
    let validMoves = [];
    let scores = { [BLACK]: 0, [WHITE]: 0 };
    let moveHistory = []; // Stores { player, move: [r, c], boardBefore }

    // --- AI Specific State ---
    let transpositionTable = {}; // { boardString: { score, depth, flag, bestMove } }
    const TT_FLAG_EXACT = 0; const TT_FLAG_LOWERBOUND = 1; const TT_FLAG_UPPERBOUND = 2;
    let nodesEvaluated = 0;
    let currentMaxIterativeDepth = MAX_AI_DEPTH_HARD; // Will be set by difficulty

    // --- Opening Book (Example) ---
    const openingBook = {
        '0000000000000000000120000001210000021100000000000000000000000000': [3, 2], // Black F5 -> White C4
        '0000000000000000000120000021210000121100000000000000000000000000': [2, 3], // Black F5, White C4 -> Black D3
        // Add more computed/known lines here...
    };

    // --- Directions & Positional Weights ---
    const directions = [
        [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]
    ];
    // prettier-ignore
    const positionalWeights = [ // Weights fine-tuned slightly
        [ 1000, -200, 100,  50,  50, 100, -200, 1000], // Corners VERY high
        [ -200, -400,  -5,  -5,  -5,  -5, -400, -200], // X-squares low
        [  100,   -5,  15,   3,   3,  15,   -5,  100],
        [   50,   -5,   3,   3,   3,   3,   -5,   50],
        [   50,   -5,   3,   3,   3,   3,   -5,   50],
        [  100,   -5,  15,   3,   3,  15,   -5,  100],
        [ -200, -400,  -5,  -5,  -5,  -5, -400, -200],
        [ 1000, -200, 100,  50,  50, 100, -200, 1000]
    ];

    // --- Initialization ---
    loadSettings();
    setupEventListeners();
    updateLoadButtonState();

    function setupEventListeners() {
        multiplayerBtn.addEventListener('click', () => startGame('multiplayer'));
        botBtn.addEventListener('click', () => startGame('bot'));
        loadGameBtn.addEventListener('click', loadGame);
        restartBtn.addEventListener('click', handleRestart);
        settingsBtn.addEventListener('click', openSettingsModal);
        closeModalBtn.addEventListener('click', closeSettingsModal);
        settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettingsModal(); });
        themeChoiceButtons.forEach(button => button.addEventListener('click', handleThemeChange));
        difficultyChoiceButtons.forEach(button => button.addEventListener('click', handleDifficultyChange));
        resetStatsBtn.addEventListener('click', handleResetStats);
        backToMenuBtn.addEventListener('click', goBackToMenu);
        saveGameBtn.addEventListener('click', saveGame);
        undoBtn.addEventListener('click', handleUndo);
    }

    // --- Game Start & Initialization ---
    function startGame(mode, loadedState = null) {
        console.log(`Starting game: ${mode}, Difficulty: ${botDifficulty}`);
        hideActionFeedback();
        transpositionTable = {}; // Always clear TT on new game/load

        if (loadedState) {
            // Restore state from loaded data
            try {
                board = loadedState.board.map(row => [...row]); // Deep copy required
                currentPlayer = loadedState.currentPlayer;
                gameMode = loadedState.gameMode;
                botDifficulty = loadedState.botDifficulty || 'hard'; // Load difficulty too
                // Deep copy history is crucial
                moveHistory = loadedState.moveHistory ? loadedState.moveHistory.map(h => ({
                     player: h.player,
                     move: [...h.move],
                     boardBefore: h.boardBefore.map(r => [...r])
                 })) : [];
                gameOver = false; // Start as not game over
                console.log(`Loaded game state. Current Player: ${currentPlayer}, History Length: ${moveHistory.length}`);
            } catch (e) {
                 console.error("Failed to process loaded state:", e);
                 showActionFeedback("Error loading save data!", true);
                 goBackToMenu(); // Go back to menu if load fails
                 return;
            }
        } else {
            // Standard initialization
            gameMode = mode;
            gameOver = false;
            board = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(EMPTY));
            moveHistory = [];
            const mid = BOARD_SIZE / 2;
            board[mid - 1][mid - 1] = WHITE; board[mid - 1][mid] = BLACK;
            board[mid][mid - 1] = BLACK; board[mid][mid] = WHITE;
            currentPlayer = BLACK; // Black always starts new game
        }

        applyDifficulty(); // Set AI depth AFTER botDifficulty is potentially loaded
        menuElement.classList.add('hidden');
        settingsModal.classList.add('hidden');
        gameAreaElement.classList.remove('hidden');
        gameOverMessageElement.classList.add('hidden');
        restartBtn.classList.add('hidden');

        updateScores(); // Recalculate scores based on board state
        findAllValidMoves(); // Find moves for the current state
        updateUndoButtonState(); // Update based on potentially loaded history
        renderBoard();
        updateTurnDisplay();
    }

    function handleRestart() { if (gameMode) startGame(gameMode); else goBackToMenu(); }
    function goBackToMenu() { gameAreaElement.classList.add('hidden'); gameOverMessageElement.classList.add('hidden'); restartBtn.classList.add('hidden'); menuElement.classList.remove('hidden'); gameMode = null; updateLoadButtonState(); hideActionFeedback(); }

    // --- Settings, Stats, Save/Load Persistence ---
    function loadSettings() {
        const savedTheme = localStorage.getItem(THEME_KEY) || 'theme-default';
        applyTheme(savedTheme);
        botDifficulty = localStorage.getItem(DIFFICULTY_KEY) || 'hard';
        applyDifficulty();
        console.log("Loaded settings - Theme:", savedTheme, "Difficulty:", botDifficulty);
    }
    function saveSettings() {
        // Determine current theme from body class
        let currentTheme = 'theme-default';
        if (bodyElement.classList.contains('theme-blue')) currentTheme = 'theme-blue';
        else if (bodyElement.classList.contains('theme-forest')) currentTheme = 'theme-forest';
        else if (bodyElement.classList.contains('theme-classic')) currentTheme = 'theme-classic';
        localStorage.setItem(THEME_KEY, currentTheme);
        localStorage.setItem(DIFFICULTY_KEY, botDifficulty);
    }
    function handleThemeChange(event) { const theme = event.target.dataset.theme; applyTheme(theme); saveSettings(); updateActiveThemeButton(); }
    function handleDifficultyChange(event) { botDifficulty = event.target.dataset.difficulty; applyDifficulty(); saveSettings(); updateActiveDifficultyButton(); console.log("Difficulty set to:", botDifficulty); }
    function applyDifficulty() {
        switch (botDifficulty) {
            case 'easy': currentMaxIterativeDepth = MAX_AI_DEPTH_EASY; break;
            case 'medium': currentMaxIterativeDepth = MAX_AI_DEPTH_MEDIUM; break;
            case 'hard': currentMaxIterativeDepth = MAX_AI_DEPTH_HARD; break;
            case 'expert': currentMaxIterativeDepth = MAX_AI_DEPTH_EXPERT; break;
            default: currentMaxIterativeDepth = MAX_AI_DEPTH_HARD; botDifficulty = 'hard'; // Fallback
        }
    }
    function openSettingsModal() { displayStats(); updateActiveThemeButton(); updateActiveDifficultyButton(); settingsModal.classList.remove('hidden'); }
    function closeSettingsModal() { settingsModal.classList.add('hidden'); }
    function updateActiveThemeButton() { const current = localStorage.getItem(THEME_KEY) || 'theme-default'; themeChoiceButtons.forEach(b => { b.classList.toggle('active', b.dataset.theme === current); }); }
    function updateActiveDifficultyButton() { difficultyChoiceButtons.forEach(b => { b.classList.toggle('active', b.dataset.difficulty === botDifficulty); }); }
    function getStats() { try { const s = localStorage.getItem(STATS_KEY); return s ? JSON.parse(s) : getDefaultStats(); } catch (e) { console.error("Stats read error", e); return getDefaultStats(); } }
    function getDefaultStats() { return { vsBot: { easy: {w:0,l:0,d:0}, medium: {w:0,l:0,d:0}, hard: {w:0,l:0,d:0}, expert: {w:0,l:0,d:0} }, multiplayer: { blackWins: 0, whiteWins: 0, draws: 0 } }; }
    function saveStats(stats) { try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { console.error("Stats save error", e); } }
    function updateStats(winner) { // winner = BLACK, WHITE, or 'draw'
        const stats = getStats();
        if (gameMode === 'bot') {
            const diff = botDifficulty || 'hard'; // Ensure difficulty is valid key
             if (!stats.vsBot[diff]) stats.vsBot[diff] = { w: 0, l: 0, d: 0 };
             if (winner === WHITE) stats.vsBot[diff].w++; // Bot Wins
             else if (winner === BLACK) stats.vsBot[diff].l++; // Human Wins
             else stats.vsBot[diff].d++;
        } else if (gameMode === 'multiplayer') {
             if (winner === BLACK) stats.multiplayer.blackWins++;
             else if (winner === WHITE) stats.multiplayer.whiteWins++;
             else stats.multiplayer.draws++;
        }
        saveStats(stats);
    }
    function displayStats() {
        const stats = getStats(); let txt = `--- Vs Bot (You W/L/D) ---\n`;
        ['easy', 'medium', 'hard', 'expert'].forEach(diff => {
             const s = stats.vsBot[diff] || {w:0,l:0,d:0}; txt += `${diff.padEnd(7)}: ${s.l} / ${s.w} / ${s.d}\n`;
        });
        txt += `\n--- Multiplayer ---\n`;
        txt += `Black Wins: ${stats.multiplayer.blackWins}\nWhite Wins: ${stats.multiplayer.whiteWins}\nDraws:      ${stats.multiplayer.draws}`;
        statsDisplayElement.textContent = txt;
    }
    function handleResetStats() { if (confirm("Reset all statistics?")) { saveStats(getDefaultStats()); displayStats(); } }
    function saveGame() {
        if (gameOver || gameMode === null) { showActionFeedback("Cannot save game now.", true); return; }
        // Ensure moveHistory contains valid data before saving
        const historyToSave = moveHistory.map(h => {
             if (!h || !h.boardBefore || !Array.isArray(h.boardBefore)) {
                 console.error("Invalid history item found during save:", h);
                 throw new Error("Corrupted move history cannot be saved."); // Prevent saving bad data
             }
             return { player: h.player, move: [...h.move], boardBefore: h.boardBefore.map(r => [...r]) };
         });

        const gameState = {
            board: board.map(row => [...row]), currentPlayer: currentPlayer, gameMode: gameMode,
            botDifficulty: botDifficulty, moveHistory: historyToSave,
        };
        try { localStorage.setItem(SAVE_GAME_KEY, JSON.stringify(gameState)); showActionFeedback("Game Saved!"); updateLoadButtonState(); }
        catch (e) { console.error("Error saving game:", e); showActionFeedback("Error saving game!", true); }
    }
    function loadGame() {
        hideActionFeedback(); try { const json = localStorage.getItem(SAVE_GAME_KEY);
            if (json) { const state = JSON.parse(json);
                if (state && state.board && state.currentPlayer !== undefined) { startGame(state.gameMode, state); }
                else { showActionFeedback("Invalid save data.", true); }
            } else { showActionFeedback("No saved game found.", true); }
        } catch (e) { console.error("Load error:", e); showActionFeedback("Error loading game!", true); localStorage.removeItem(SAVE_GAME_KEY); updateLoadButtonState(); }
    }
    function updateLoadButtonState() { let exists = false; try { const json = localStorage.getItem(SAVE_GAME_KEY); if(json){ const d = JSON.parse(json); if(d && d.board) exists = true;} } catch {} loadGameBtn.disabled = !exists; loadGameBtn.style.opacity = exists ? 1 : 0.6; loadGameBtn.style.cursor = exists ? 'pointer' : 'not-allowed'; }
    function showActionFeedback(message, isError = false) { actionFeedbackElement.textContent = message; actionFeedbackElement.style.backgroundColor = isError ? '#d32f2f' : 'var(--accent-color)'; actionFeedbackElement.classList.remove('hidden'); setTimeout(() => { actionFeedbackElement.classList.add('hidden'); }, 2500); }
    function hideActionFeedback() { actionFeedbackElement.classList.add('hidden'); }
    function applyTheme(themeName) { bodyElement.className = ''; bodyElement.classList.add(themeName); console.log("Applied theme:", themeName); }

    // --- Undo Logic ---
    function handleUndo() {
        if (moveHistory.length === 0 || gameOver) return;
        hideActionFeedback(); let movesToUndo = 1;
        if (gameMode === 'bot' && moveHistory.length > 0 && moveHistory[moveHistory.length - 1]?.player === WHITE) { movesToUndo = 2; }
        if (moveHistory.length < movesToUndo) { console.log("Not enough history to undo."); return; }
        console.log(`Undoing ${movesToUndo} move(s)...`);

        let lastRelevantState = null;
        for (let i = 0; i < movesToUndo; i++) { lastRelevantState = moveHistory.pop(); }

        if (lastRelevantState && lastRelevantState.boardBefore) {
            board = lastRelevantState.boardBefore.map(row => [...row]); // Restore board state
            currentPlayer = lastRelevantState.player; // Set turn back
        } else { console.error("Undo failed: Invalid history state."); return; }

        gameOver = false; gameOverMessageElement.classList.add('hidden'); restartBtn.classList.add('hidden');
        updateScores(); findAllValidMoves(); updateUndoButtonState(); renderBoard(); updateTurnDisplay();
        console.log("Undo complete. Current player:", currentPlayer);
    }
    function updateUndoButtonState() { undoBtn.disabled = moveHistory.length === 0 || gameOver; }

    // --- Rendering Logic ---
    // (renderBoard, updateScores, updateTurnDisplay - Keep versions that handle dynamic listeners and UI updates correctly)
    function renderBoard() {
        boardElement.innerHTML = '';
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const square = document.createElement('div');
                square.classList.add('square'); square.dataset.row = r; square.dataset.col = c;
                const pieceVal = board[r][c];
                if (pieceVal !== EMPTY) {
                    const piece = document.createElement('div');
                    piece.classList.add('piece', pieceVal === BLACK ? 'black-piece' : 'white-piece');
                    square.appendChild(piece);
                } else {
                    const isMoveValid = validMoves.some(move => move[0] === r && move[1] === c);
                    if (isMoveValid && !gameOver && (gameMode === 'multiplayer' || (gameMode === 'bot' && currentPlayer === BLACK))) {
                        const validMoveIndicator = document.createElement('div');
                        validMoveIndicator.classList.add('valid-move-indicator');
                        square.appendChild(validMoveIndicator);
                        square.addEventListener('click', handleSquareClick); // Add listener ONLY to valid moves for human
                    }
                }
                boardElement.appendChild(square);
            }
        }
    }
    function updateScores() { scores[BLACK]=0; scores[WHITE]=0; board.flat().forEach(p => {if(p===BLACK)scores[BLACK]++; else if(p===WHITE)scores[WHITE]++;}); scoreElement.textContent = `Black: ${scores[BLACK]} - White: ${scores[WHITE]}`; }
    function updateTurnDisplay() { if(gameOver) return; let txt=`Turn: ${currentPlayer===BLACK?'Black':'White'}`; if(gameMode==='bot'&&currentPlayer===WHITE) txt+=" (Bot thinking...)"; turnElement.textContent=txt;}
    function handleSquareClick(event) {
        if (gameOver || (gameMode === 'bot' && currentPlayer === WHITE)) return;
        const square = event.currentTarget; const r = parseInt(square.dataset.row); const c = parseInt(square.dataset.col);
        if (isValidMove(r, c, currentPlayer)) { makeMove(r, c); }
    }


    // --- Core Game Logic ---
    function makeMove(r, c) {
        if (gameOver) return;
        const playerMakingMove = currentPlayer;
        const boardBeforeMove = board.map(row => [...row]); // Store state BEFORE move for Undo
        const piecesToFlip = getFlips(r, c, playerMakingMove);

        if (board[r][c] !== EMPTY || piecesToFlip.length === 0) { console.warn("Make move called on invalid square or no flips"); return; }

        // Apply move
        board[r][c] = playerMakingMove;
        piecesToFlip.forEach(([fr, fc]) => { board[fr][fc] = playerMakingMove; });

        // Add to history (only if boardBefore is valid)
        if(boardBeforeMove) {
             moveHistory.push({ player: playerMakingMove, move: [r, c], boardBefore: boardBeforeMove });
        } else {
             console.error("Failed to record history: boardBefore was invalid");
        }


        updateScores();
        switchPlayer(); // Check passes, game end
        updateUndoButtonState(); // Enable undo
        renderBoard();
        updateTurnDisplay();

        // Trigger Bot move
        if (!gameOver && gameMode === 'bot' && currentPlayer === WHITE) {
            updateTurnDisplay(); setTimeout(makeBotMove, 50);
        }
    }
    function switchPlayer() {
        const previousPlayer = currentPlayer; currentPlayer = getOpponent(previousPlayer); findAllValidMoves();
        if (validMoves.length === 0) { // Pass detected
             currentPlayer = getOpponent(currentPlayer); findAllValidMoves();
             if (validMoves.length === 0) { endGame(); return; } // Both pass -> game over
        }
        if (!gameOver && scores[BLACK] + scores[WHITE] === BOARD_SIZE * BOARD_SIZE) { endGame(); } // Full board
    }
    function isValid(r, c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }
    function getOpponent(player) { return player === BLACK ? WHITE : BLACK; }
    function getFlips(r, c, player) { return getFlipsForBoard(board, r, c, player); }
    function isValidMove(r, c, player) { return validMoves.some(move => move[0] === r && move[1] === c); }
    function findAllValidMoves() { validMoves = getAllValidMovesForPlayer(board, currentPlayer); }
    function endGame() {
        if(gameOver) return; gameOver = true; let winner; let msg;
        if (scores[BLACK] > scores[WHITE]) { winner = BLACK; msg = `Black Wins!`; }
        else if (scores[WHITE] > scores[BLACK]) { winner = WHITE; msg = `White Wins!`; }
        else { winner = 'draw'; msg = `It's a Draw!`; }
        updateStats(winner); // Update stats before displaying message
        msg += ` (${scores[BLACK]} - ${scores[WHITE]})`;
        gameOverMessageElement.textContent = msg; gameOverMessageElement.classList.remove('hidden');
        turnElement.textContent = "Game Over"; restartBtn.classList.remove('hidden');
        updateUndoButtonState(); renderBoard();
    }

    // --- AI Logic ---
    function makeBotMove() {
        if (gameOver || currentPlayer !== WHITE) return;
        nodesEvaluated = 0; console.time("Bot Move Calculation"); hideActionFeedback();

        // Opening Book Check
        const currentBoardStr = boardToString(board);
        if (openingBook[currentBoardStr]) { const [r, c] = openingBook[currentBoardStr]; if (isValidMove(r, c, WHITE)) { console.log("Bot playing from Opening Book:", [r, c]); console.timeEnd("Bot Move Calculation"); makeMove(r, c); return; } }

        // Easy Difficulty: Random Move
        if (botDifficulty === 'easy') {
            const possibleMoves = getAllValidMovesForPlayer(board, WHITE);
            if (possibleMoves.length > 0) { const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)]; console.log("Bot (Easy) random move:", move); console.timeEnd("Bot Move Calculation"); makeMove(move[0], move[1]); }
            else { console.error("Easy Bot has no moves!"); console.timeEnd("Bot Move Calculation"); if (getAllValidMovesForPlayer(board, BLACK).length === 0) endGame(); else switchPlayer(); }
            return;
        }

        // Iterative Deepening Search (Medium/Hard/Expert)
        let bestMove = null; let bestScore = -Infinity;
        const possibleMoves = orderMoves(getAllValidMovesForPlayer(board, WHITE), board); // Order moves initially
        if (possibleMoves.length === 0) { console.error("Bot has no moves!"); console.timeEnd("Bot Move Calculation"); if (getAllValidMovesForPlayer(board, BLACK).length === 0) endGame(); else switchPlayer(); return; }

        const emptySquares = countEmpty(board);
        let depthLimit = currentMaxIterativeDepth;
        if (emptySquares <= ENDGAME_DEPTH_LIMIT && depthLimit < emptySquares) { depthLimit = emptySquares; console.log(`Endgame: Overriding depth to ${depthLimit}`); }
        console.log(`Searching: Difficulty=${botDifficulty}, TargetDepth=${currentMaxIterativeDepth}, EffectiveDepth=${depthLimit}`);

        let bestMoveFromCompletedDepth = possibleMoves[0]; // Fallback if search is interrupted or fails

        for (let depth = 1; depth <= depthLimit; depth++) {
            let alpha = -Infinity; let beta = Infinity; // Reset alpha-beta for each depth
            let currentBestScoreForDepth = -Infinity;
            let currentBestMoveForDepth = null;
            // Try using best move from previous depth first for better pruning
            const orderedMovesForDepth = [...possibleMoves]; // Copy
            if(bestMove) { // If we have a best move from previous iteration
                 const idx = orderedMovesForDepth.findIndex(m => m[0] === bestMove[0] && m[1] === bestMove[1]);
                 if(idx > 0) { // Move it to the front if found and not already there
                    const [prioritizedMove] = orderedMovesForDepth.splice(idx, 1);
                    orderedMovesForDepth.unshift(prioritizedMove);
                 }
            }

            for (const [r, c] of orderedMovesForDepth) {
                const boardCopy = board.map(row => [...row]); makeSimulatedMove(boardCopy, r, c, WHITE);
                const score = minimax(boardCopy, depth - 1, alpha, beta, false); // Opponent minimizes
                if (score > currentBestScoreForDepth) {
                     currentBestScoreForDepth = score; currentBestMoveForDepth = [r, c];
                }
                alpha = Math.max(alpha, currentBestScoreForDepth); // Update alpha for this depth
                // No direct break here, let minimax handle pruning within its calls
            }
            // After searching all moves at this depth, update the overall best move
            if (currentBestMoveForDepth) {
                 bestMove = currentBestMoveForDepth;
                 bestScore = currentBestScoreForDepth; // Store best score found at this depth
                 bestMoveFromCompletedDepth = bestMove; // Store the best move from the last *fully completed* depth search
                 console.log(`Depth ${depth}: Best=${bestScore} Move=[${bestMove}], Nodes=${nodesEvaluated}`);
            } else {
                console.log(`Depth ${depth}: No move improved score.`);
                 // If no move was found (e.g., only one move possible), stick with the fallback
                if(!bestMove && possibleMoves.length > 0) bestMove = possibleMoves[0];
                 break; // Stop deepening if no move improves score (unlikely unless only 1 move)
            }
            // Optional: Check time limit here and break if exceeded
        }

        console.timeEnd("Bot Move Calculation");
        const finalMove = bestMove || bestMoveFromCompletedDepth; // Use overall best, or fallback to last completed depth's best
        console.log(`Final Choice: Move=[${finalMove}], Score=${bestScore}, Nodes=${nodesEvaluated}`);
        if (finalMove) { makeMove(finalMove[0], finalMove[1]); }
        else { console.error("Bot failed to select a move!"); if(getAllValidMovesForPlayer(board, BLACK).length === 0) endGame(); else switchPlayer(); }
    }

    function minimax(currentBoard, depth, alpha, beta, isMaximizingPlayer) {
        nodesEvaluated++;
        const boardKey = boardToString(currentBoard);
        const player = isMaximizingPlayer ? WHITE : BLACK;
        const emptyCount = countEmpty(currentBoard);

        // --- Transposition Table Lookup ---
        const ttEntry = transpositionTable[boardKey];
        let ttMove = null;
        if (ttEntry && ttEntry.depth >= depth) {
            if (ttEntry.flag === TT_FLAG_EXACT) return ttEntry.score;
            if (ttEntry.flag === TT_FLAG_LOWERBOUND) alpha = Math.max(alpha, ttEntry.score);
            if (ttEntry.flag === TT_FLAG_UPPERBOUND) beta = Math.min(beta, ttEntry.score);
            if (alpha >= beta) return ttEntry.score;
            ttMove = ttEntry.bestMove; // Get best move hint from TT
        }

        // --- Base Cases ---
        if (depth === 0 || isGameOver(currentBoard)) {
             // Use evaluateBoard, which handles exact scores if game is over
            return evaluateBoard(currentBoard, emptyCount);
        }

        // --- Generate and Order Moves ---
        let possibleMoves = orderMoves(getAllValidMovesForPlayer(currentBoard, player), currentBoard);
        // Prioritize TT move if available
        if(ttMove) {
             const idx = possibleMoves.findIndex(m => m[0] === ttMove[0] && m[1] === ttMove[1]);
             if(idx > 0) {
                 const [prioritizedMove] = possibleMoves.splice(idx, 1);
                 possibleMoves.unshift(prioritizedMove);
             } else if (idx === -1) {
                 // TT move wasn't found in valid moves - TT data might be from a different line? Ignore it.
                 ttMove = null;
             }
        }


        // --- Handle Pass Turn ---
        if (possibleMoves.length === 0) {
            if (getAllValidMovesForPlayer(currentBoard, getOpponent(player)).length === 0) {
                 return evaluateBoard(currentBoard, emptyCount); // Game ended
            }
            // Pass turn, same depth, flip player
            return minimax(currentBoard, depth, alpha, beta, !isMaximizingPlayer);
        }

        // --- Recursive Search ---
        let bestScore = isMaximizingPlayer ? -Infinity : Infinity;
        let bestMoveForNode = possibleMoves[0]; // Keep track of best move found *at this node*
        let ttFlag = isMaximizingPlayer ? TT_FLAG_UPPERBOUND : TT_FLAG_LOWERBOUND; // Assume initially we won't raise alpha / lower beta

        for (const [r, c] of possibleMoves) {
            const boardCopy = currentBoard.map(row => [...row]); makeSimulatedMove(boardCopy, r, c, player);
            const score = minimax(boardCopy, depth - 1, alpha, beta, !isMaximizingPlayer);

            if (isMaximizingPlayer) {
                if (score > bestScore) { bestScore = score; bestMoveForNode = [r,c]; ttFlag = TT_FLAG_EXACT; }
                alpha = Math.max(alpha, bestScore);
                if (beta <= alpha) { ttFlag = TT_FLAG_LOWERBOUND; break; } // Beta cutoff
            } else { // Minimizing Player
                if (score < bestScore) { bestScore = score; bestMoveForNode = [r,c]; ttFlag = TT_FLAG_EXACT; }
                beta = Math.min(beta, bestScore);
                if (beta <= alpha) { ttFlag = TT_FLAG_UPPERBOUND; break; } // Alpha cutoff
            }
        }

        // --- Store Result in Transposition Table ---
        transpositionTable[boardKey] = { score: bestScore, depth: depth, flag: ttFlag, bestMove: bestMoveForNode };
        return bestScore;
    }

    // --- AI Helper Functions ---
    function makeSimulatedMove(boardState, r, c, player) { const flips = getFlipsForBoard(boardState, r, c, player); boardState[r][c] = player; flips.forEach(([fr, fc]) => { boardState[fr][fc] = player; }); }
    function countEmpty(boardState) { let c = 0; for (let r=0;r<8;r++) for(let C=0;C<8;C++) if(boardState[r][C]===EMPTY) c++; return c; }
    function isGameOver(b) { return getAllValidMovesForPlayer(b, BLACK).length === 0 && getAllValidMovesForPlayer(b, WHITE).length === 0; }
    function getFlipsForBoard(b, r, c, p) { const o = getOpponent(p); let fl = []; if (!isValid(r,c) || b[r][c] !== EMPTY) return []; for (const [dr, dc] of directions) { let cf = []; let nr = r + dr; let nc = c + dc; while (isValid(nr, nc) && b[nr][nc] === o) { cf.push([nr, nc]); nr += dr; nc += dc; } if (isValid(nr, nc) && b[nr][nc] === p && cf.length > 0) { fl = fl.concat(cf); } } return fl; }
    function getAllValidMovesForPlayer(b, p) { let m = []; for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (b[r][c] === EMPTY && getFlipsForBoard(b, r, c, p).length > 0) m.push([r, c]); return m; }
    function boardToString(b) { return b.flat().join(''); }
    function orderMoves(moves, boardState) { // Simplified version, prioritizing corners/positional
        const scoredMoves = moves.map(([r, c]) => ({ move: [r, c], score: positionalWeights[r][c] }));
        scoredMoves.sort((a, b) => b.score - a.score); return scoredMoves.map(item => item.move);
    }

    // --- ADVANCED HEURISTIC EVALUATION FUNCTION ---
    function evaluateBoard(boardToEvaluate, emptyCount) {
        // --- Endgame Exact Score ---
        if (isGameOver(boardToEvaluate)) {
            let whitePieces = 0; let blackPieces = 0;
            boardToEvaluate.flat().forEach(p => { if (p === WHITE) whitePieces++; else if (p === BLACK) blackPieces++; });
            return (whitePieces - blackPieces) * EXACT_SCORE_FACTOR;
        }

        let whitePositional = 0, blackPositional = 0;
        let whiteFrontier = 0, blackFrontier = 0;
        let whiteSafe = 0, blackSafe = 0; // Count of "safe" discs (only corners for simplicity here)
        const corners = [[0,0], [0,7], [7,0], [7,7]];

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const piece = boardToEvaluate[r][c];
                if (piece === EMPTY) continue;
                let isCorner = corners.some(corner => corner[0] === r && corner[1] === c);
                let isSafe = isCorner; // Add more stability logic here if needed

                if (piece === WHITE) {
                    whitePositional += positionalWeights[r][c]; if (isSafe) whiteSafe++;
                    for (const [dr, dc] of directions) { if (isValid(r+dr, c+dc) && boardToEvaluate[r+dr][c+dc] === EMPTY) { whiteFrontier++; break; } }
                } else {
                    blackPositional += positionalWeights[r][c]; if (isSafe) blackSafe++;
                    for (const [dr, dc] of directions) { if (isValid(r+dr, c+dc) && boardToEvaluate[r+dr][c+dc] === EMPTY) { blackFrontier++; break; } }
                }
            }
        }

        const whiteMoves = getAllValidMovesForPlayer(boardToEvaluate, WHITE).length;
        const blackMoves = getAllValidMovesForPlayer(boardToEvaluate, BLACK).length;

        let phase;
        if (emptyCount > 40) phase = 1; else if (emptyCount > ENDGAME_DEPTH_LIMIT) phase = 2; else phase = 3;

        let posW, mobW, frontW, stabW, parityW;
        if (phase === 1) { posW=10; mobW=200; frontW=-50; stabW=1000; parityW=0; }
        else if (phase === 2) { posW=15; mobW=150; frontW=-30; stabW=1200; parityW=100; }
        else { posW=20; mobW=100; frontW=-10; stabW=1500; parityW=500; } // High parity weight in endgame

        let positionalScore = posW * (whitePositional - blackPositional);
        let stabilityScore = stabW * (whiteSafe - blackSafe); // Emphasize corners/safe pieces
        let frontierScore = frontW * (whiteFrontier - blackFrontier);
        let mobilityScore = (whiteMoves + blackMoves !== 0) ? mobW * (whiteMoves - blackMoves) / (whiteMoves + blackMoves + 1) : 0;
        // Simple Parity: Bonus for player whose turn it *would* be if emptyCount is odd
        // Since evaluation happens after a move, player P just moved. Next player is Opp(P).
        // If emptyCount is odd, Opp(P) gets last move. This is bad for P.
        // Let's evaluate from WHITE's perspective (Maximizer). If emptyCount is odd, the next player (Black) gets last move - BAD for WHITE.
        let parityScore = (emptyCount % 2 !== 0) ? -parityW : parityW; // Bonus to WHITE if even empty squares left

        // --- Bonus for having moves when opponent doesn't ---
        if (phase > 1) { // More relevant later
            if(whiteMoves > 0 && blackMoves === 0) mobilityScore += mobW * 2; // Big bonus if opponent has no moves
            if(blackMoves > 0 && whiteMoves === 0) mobilityScore -= mobW * 2; // Big penalty if bot has no moves
        }


        return positionalScore + mobilityScore + stabilityScore + frontierScore + parityScore;
    }

}); // End DOMContentLoaded