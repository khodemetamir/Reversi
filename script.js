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
    const MAX_AI_DEPTH_EXPERT = 6; // Can try 7+, watch performance
    const MAX_AI_DEPTH_HARD = 5;
    const MAX_AI_DEPTH_MEDIUM = 3;
    const MAX_AI_DEPTH_EASY = 1; // Depth 1 uses basic evaluation (or random)
    const ENDGAME_DEPTH_LIMIT = 12; // Max empty squares to attempt full search
    const EXACT_SCORE_FACTOR = 10000; // Large factor for definitive win/loss
    // localStorage Keys (using _v2 suffix to avoid conflicts with older versions if needed)
    const SAVE_GAME_KEY = 'savedOthelloGame_v2';
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
        // Add more standard/computed opening lines here...
    };

    // --- Directions & Positional Weights ---
    const directions = [
        [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]
    ];
    // prettier-ignore
    const positionalWeights = [ // Weights fine-tuned slightly
        [ 1000, -200, 100,  50,  50, 100, -200, 1000], // Corners VERY high
        [ -200, -400,  -5,  -5,  -5,  -5, -400, -200], // X-squares low
        [  100,   -5,  15,   3,   3,  15,   -5,  100], // Edges adjacent to corners
        [   50,   -5,   3,   3,   3,   3,   -5,   50], // Inner edges
        [   50,   -5,   3,   3,   3,   3,   -5,   50],
        [  100,   -5,  15,   3,   3,  15,   -5,  100],
        [ -200, -400,  -5,  -5,  -5,  -5, -400, -200],
        [ 1000, -200, 100,  50,  50, 100, -200, 1000]
    ];

    // --- Initialization ---
    loadSettings(); // Load theme and difficulty preferences
    setupEventListeners(); // Attach all event listeners
    updateLoadButtonState(); // Check if a saved game exists on load

    // --- Event Listener Setup ---
    function setupEventListeners() {
        multiplayerBtn.addEventListener('click', () => startGame('multiplayer'));
        botBtn.addEventListener('click', () => startGame('bot'));
        loadGameBtn.addEventListener('click', loadGame);
        restartBtn.addEventListener('click', handleRestart);
        settingsBtn.addEventListener('click', openSettingsModal);
        closeModalBtn.addEventListener('click', closeSettingsModal);
        settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettingsModal(); }); // Close on backdrop click
        themeChoiceButtons.forEach(button => button.addEventListener('click', handleThemeChange));
        difficultyChoiceButtons.forEach(button => button.addEventListener('click', handleDifficultyChange));
        resetStatsBtn.addEventListener('click', handleResetStats);
        backToMenuBtn.addEventListener('click', goBackToMenu);
        saveGameBtn.addEventListener('click', saveGame);
        undoBtn.addEventListener('click', handleUndo);
        // Board click listeners are added dynamically in renderBoard
    }

    // --- Game Start & Initialization ---
    function startGame(mode, loadedState = null) {
        console.log(`Starting game: Mode=${mode}, Difficulty=${botDifficulty}`);
        hideActionFeedback();
        transpositionTable = {}; // Always clear TT on new game or load

        if (loadedState) {
            // Restore state from loaded data
            try {
                // Deep copy all mutable state
                board = loadedState.board.map(row => [...row]);
                currentPlayer = loadedState.currentPlayer;
                gameMode = loadedState.gameMode;
                botDifficulty = loadedState.botDifficulty || 'hard'; // Load difficulty preference too
                // Deep copy history is crucial for undo state integrity
                moveHistory = loadedState.moveHistory ? loadedState.moveHistory.map(h => ({
                     player: h.player,
                     move: [...h.move],
                     boardBefore: h.boardBefore.map(r => [...r])
                 })) : [];
                gameOver = false; // Loaded game is never over initially
                console.log(`Loaded game state. Current Player: ${currentPlayer}, History Length: ${moveHistory.length}`);
            } catch (e) {
                 console.error("Failed to process loaded state:", e);
                 showActionFeedback("Error loading save data!", true);
                 goBackToMenu(); // Go back to menu if load fails catastrophically
                 return;
            }
        } else {
            // Standard initialization for a new game
            gameMode = mode;
            gameOver = false;
            board = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(EMPTY));
            moveHistory = [];
            const mid = BOARD_SIZE / 2; // Place initial pieces
            board[mid - 1][mid - 1] = WHITE; board[mid - 1][mid] = BLACK;
            board[mid][mid - 1] = BLACK; board[mid][mid] = WHITE;
            currentPlayer = BLACK; // Black always starts a new game
        }

        applyDifficulty(); // Set AI depth AFTER botDifficulty is potentially loaded/set
        menuElement.classList.add('hidden');
        settingsModal.classList.add('hidden');
        gameAreaElement.classList.remove('hidden');
        gameOverMessageElement.classList.add('hidden');
        restartBtn.classList.add('hidden'); // Only show restart button when game actually ends

        // Update UI based on the initial/loaded state
        updateScores(); // Must run after board is set
        findAllValidMoves(); // Must run after currentPlayer and board are set
        updateUndoButtonState(); // Update based on potentially loaded history
        renderBoard();
        updateTurnDisplay();
    }

    // Restart with the same mode and difficulty
    function handleRestart() { if (gameMode) startGame(gameMode); else goBackToMenu(); }

    // Return to main menu, clear game state implicitly
    function goBackToMenu() {
        gameAreaElement.classList.add('hidden');
        gameOverMessageElement.classList.add('hidden');
        restartBtn.classList.add('hidden');
        menuElement.classList.remove('hidden');
        gameMode = null; // Indicate no active game
        updateLoadButtonState(); // Re-check if save exists when returning to menu
        hideActionFeedback();
    }

    // --- Settings, Stats, Save/Load Persistence ---

    // Load theme and difficulty from localStorage on startup
    function loadSettings() {
        const savedTheme = localStorage.getItem(THEME_KEY) || 'theme-default';
        applyTheme(savedTheme);
        botDifficulty = localStorage.getItem(DIFFICULTY_KEY) || 'hard';
        applyDifficulty(); // Apply loaded difficulty setting to AI params
        console.log("Loaded settings - Theme:", savedTheme, "Difficulty:", botDifficulty);
    }

    // Save current theme and difficulty to localStorage
    function saveSettings() {
        let currentTheme = 'theme-default'; // Determine theme from body class
        if (bodyElement.classList.contains('theme-blue')) currentTheme = 'theme-blue';
        else if (bodyElement.classList.contains('theme-forest')) currentTheme = 'theme-forest';
        else if (bodyElement.classList.contains('theme-classic')) currentTheme = 'theme-classic';
        localStorage.setItem(THEME_KEY, currentTheme);
        localStorage.setItem(DIFFICULTY_KEY, botDifficulty);
    }

    // Handle theme button click
    function handleThemeChange(event) {
        const theme = event.target.dataset.theme;
        applyTheme(theme);
        saveSettings();
        updateActiveThemeButton(); // Update UI in modal
    }

    // Handle difficulty button click
    function handleDifficultyChange(event) {
        botDifficulty = event.target.dataset.difficulty;
        applyDifficulty(); // Update AI parameters
        saveSettings();
        updateActiveDifficultyButton(); // Update UI in modal
        console.log("Difficulty set to:", botDifficulty);
    }

    // Set AI depth based on current difficulty setting
    function applyDifficulty() {
        switch (botDifficulty) {
            case 'easy': currentMaxIterativeDepth = MAX_AI_DEPTH_EASY; break;
            case 'medium': currentMaxIterativeDepth = MAX_AI_DEPTH_MEDIUM; break;
            case 'hard': currentMaxIterativeDepth = MAX_AI_DEPTH_HARD; break;
            case 'expert': currentMaxIterativeDepth = MAX_AI_DEPTH_EXPERT; break;
            default: currentMaxIterativeDepth = MAX_AI_DEPTH_HARD; botDifficulty = 'hard'; // Fallback
        }
    }

    // Open settings modal and refresh dynamic content
    function openSettingsModal() {
        displayStats(); // Update stats display when opening
        updateActiveThemeButton();
        updateActiveDifficultyButton();
        settingsModal.classList.remove('hidden');
    }
    function closeSettingsModal() { settingsModal.classList.add('hidden'); }

    // Update button styles in modal to reflect current settings
    function updateActiveThemeButton() { const current = localStorage.getItem(THEME_KEY) || 'theme-default'; themeChoiceButtons.forEach(b => { b.classList.toggle('active', b.dataset.theme === current); }); }
    function updateActiveDifficultyButton() { difficultyChoiceButtons.forEach(b => { b.classList.toggle('active', b.dataset.difficulty === botDifficulty); }); }

    // Get stats from localStorage, providing defaults if none exist or data is corrupt
    function getStats() {
        try {
            const statsJson = localStorage.getItem(STATS_KEY);
            const parsed = statsJson ? JSON.parse(statsJson) : null;
            if (parsed && parsed.vsBot && parsed.multiplayer) {
                 // Ensure all difficulties exist (or add them) - prevents errors later
                 const difficulties = ['easy', 'medium', 'hard', 'expert'];
                 difficulties.forEach(diff => { if (!parsed.vsBot[diff]) parsed.vsBot[diff] = { w: 0, l: 0, d: 0 }; });
                 return parsed;
            }
            return getDefaultStats(); // Return defaults if format is wrong
        } catch (e) {
            console.error("Stats read error", e);
            return getDefaultStats(); // Return defaults on error
        }
    }

    // Structure for default stats
    function getDefaultStats() { return { vsBot: { easy: {w:0,l:0,d:0}, medium: {w:0,l:0,d:0}, hard: {w:0,l:0,d:0}, expert: {w:0,l:0,d:0} }, multiplayer: { blackWins: 0, whiteWins: 0, draws: 0 } }; }

    // Save stats object to localStorage
    function saveStats(stats) { try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { console.error("Stats save error", e); } }

    // Update stats based on game outcome
    function updateStats(winner) { // winner = BLACK, WHITE, or 'draw'
        const stats = getStats();
        if (gameMode === 'bot') {
            const diff = botDifficulty || 'hard'; // Ensure difficulty is valid key
             if (!stats.vsBot[diff]) stats.vsBot[diff] = { w: 0, l: 0, d: 0 }; // Initialize just in case
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

    // Display stats in the styled settings modal section
    function displayStats() {
        const stats = getStats();
        statsDisplayElement.innerHTML = ''; // Clear previous content

        function createStatValueElement(label, value, typeClass) { /* ... (from previous step) ... */ const span=document.createElement('span');span.classList.add('stat-value',typeClass);const l=document.createElement('span');l.classList.add('value-label');l.textContent=`${label}:`;span.appendChild(l);const n=document.createElement('span');n.classList.add('value-number');n.textContent=value;span.appendChild(n);return span; }
        function createStatsRow(label, winValue, lossValue, drawValue) { /* ... (from previous step) ... */ const div=document.createElement('div');div.classList.add('stats-row');const l=document.createElement('span');l.classList.add('stats-label');l.textContent=label;div.appendChild(l);const v=document.createElement('div');v.classList.add('stats-values');v.appendChild(createStatValueElement('W',winValue,'win'));v.appendChild(createStatValueElement('L',lossValue,'loss'));v.appendChild(createStatValueElement('D',drawValue,'draw'));div.appendChild(v);return div; }

        const vsBotHeader = document.createElement('div'); vsBotHeader.classList.add('stats-section-header'); vsBotHeader.textContent = 'Vs Bot (Your W/L/D)'; statsDisplayElement.appendChild(vsBotHeader);
        ['easy', 'medium', 'hard', 'expert'].forEach(diff => { const s = stats.vsBot[diff] || {w:0,l:0,d:0}; statsDisplayElement.appendChild(createStatsRow(diff, s.l, s.w, s.d)); }); // Display Human W/L/D

        const mpHeader = document.createElement('div'); mpHeader.classList.add('stats-section-header'); mpHeader.textContent = 'Multiplayer'; statsDisplayElement.appendChild(mpHeader);
        // Simple display for multiplayer
        const mpRow = document.createElement('div'); mpRow.classList.add('stats-row');
        mpRow.innerHTML = `<span class="stats-label">Record</span><span class="stats-values"><span class="stat-value win"><span class="value-label">B:</span><span class="value-number">${stats.multiplayer.blackWins}</span></span><span class="stat-value win"><span class="value-label">W:</span><span class="value-number">${stats.multiplayer.whiteWins}</span></span><span class="stat-value draw"><span class="value-label">D:</span><span class="value-number">${stats.multiplayer.draws}</span></span></span>`;
        statsDisplayElement.appendChild(mpRow);
    }

    // Handle reset stats button click
    function handleResetStats() { if (confirm("Reset all statistics?")) { saveStats(getDefaultStats()); displayStats(); showActionFeedback("Statistics Reset!"); } }

    // Save the current game state to localStorage
    function saveGame() {
        if (gameOver || gameMode === null) { showActionFeedback("Cannot save game now.", true); return; }
        // Ensure moveHistory contains valid data before saving - crucial for load/undo integrity
         let historyToSave;
         try {
             historyToSave = moveHistory.map(h => {
                 // Validate each history item before saving
                 if (!h || !h.boardBefore || !Array.isArray(h.boardBefore) || !h.move || !Array.isArray(h.move)) {
                     throw new Error("Corrupted move history item detected.");
                 }
                 // Create deep copies for storage
                 return { player: h.player, move: [...h.move], boardBefore: h.boardBefore.map(r => [...r]) };
             });
         } catch (e) {
             console.error("Error preparing history for saving:", e);
             showActionFeedback("Error: Cannot save due to invalid game history.", true);
             return; // Prevent saving corrupted data
         }

        const gameState = {
            board: board.map(row => [...row]), currentPlayer: currentPlayer, gameMode: gameMode,
            botDifficulty: botDifficulty, moveHistory: historyToSave, // Save the validated/copied history
        };
        try { localStorage.setItem(SAVE_GAME_KEY, JSON.stringify(gameState)); showActionFeedback("Game Saved!"); updateLoadButtonState(); }
        catch (e) { console.error("Error saving game:", e); showActionFeedback("Error saving game!", true); }
    }

    // Load game state from localStorage
    function loadGame() {
        hideActionFeedback(); try { const json = localStorage.getItem(SAVE_GAME_KEY);
            if (json) { const state = JSON.parse(json);
                // Add more validation on load
                if (state && state.board && Array.isArray(state.board) && state.currentPlayer !== undefined && state.gameMode) {
                    startGame(state.gameMode, state); // Start game with loaded state
                } else { showActionFeedback("Invalid save data.", true); localStorage.removeItem(SAVE_GAME_KEY); updateLoadButtonState(); } // Clear bad data
            } else { showActionFeedback("No saved game found.", true); }
        } catch (e) { console.error("Load error:", e); showActionFeedback("Error loading game!", true); localStorage.removeItem(SAVE_GAME_KEY); updateLoadButtonState(); }
    }

    // Enable/disable load button based on presence of valid save data
    function updateLoadButtonState() { let exists = false; try { const json = localStorage.getItem(SAVE_GAME_KEY); if(json){ const d = JSON.parse(json); if(d && d.board && Array.isArray(d.board)) exists = true;} } catch {} loadGameBtn.disabled = !exists; loadGameBtn.style.opacity = exists ? 1 : 0.6; loadGameBtn.style.cursor = exists ? 'pointer' : 'not-allowed'; }

    // Show temporary feedback message to the user
    function showActionFeedback(message, isError = false) { actionFeedbackElement.textContent = message; actionFeedbackElement.style.backgroundColor = isError ? '#d32f2f' : 'var(--accent-color)'; actionFeedbackElement.classList.remove('hidden'); setTimeout(() => { actionFeedbackElement.classList.add('hidden'); }, 2500); }
    function hideActionFeedback() { actionFeedbackElement.classList.add('hidden'); }

    // Apply theme class to body
    function applyTheme(themeName) { bodyElement.className = ''; bodyElement.classList.add(themeName); console.log("Applied theme:", themeName); }

    // --- Undo Logic ---
    function handleUndo() {
        if (moveHistory.length === 0 || gameOver) return;
        hideActionFeedback(); let movesToUndo = 1;
        // If vs Bot and the last move was the Bot's (White), need to undo 2 moves
        if (gameMode === 'bot' && moveHistory.length > 0 && moveHistory[moveHistory.length - 1]?.player === WHITE) { movesToUndo = 2; }
        if (moveHistory.length < movesToUndo) { console.log("Not enough history to undo."); return; }
        console.log(`Undoing ${movesToUndo} move(s)...`);

        let lastRelevantState = null;
        for (let i = 0; i < movesToUndo; i++) { lastRelevantState = moveHistory.pop(); } // Pop required moves

        // Restore state from *before* the first undone move
        if (lastRelevantState && lastRelevantState.boardBefore && Array.isArray(lastRelevantState.boardBefore)) {
            board = lastRelevantState.boardBefore.map(row => [...row]); // Restore board state (deep copy)
            currentPlayer = lastRelevantState.player; // Set turn back to the player who made that move
        } else { console.error("Undo failed: Invalid history state found."); showActionFeedback("Undo Failed!", true); return; } // Prevent continuing if history is broken

        // Reset game over state if necessary
        gameOver = false; gameOverMessageElement.classList.add('hidden'); restartBtn.classList.add('hidden');

        // Update game state & UI
        updateScores(); findAllValidMoves(); updateUndoButtonState(); renderBoard(); updateTurnDisplay();
        console.log("Undo complete. Current player:", currentPlayer);
    }

    // Enable/disable undo button based on history and game over state
    function updateUndoButtonState() { undoBtn.disabled = moveHistory.length === 0 || gameOver; }

    // --- Rendering Logic ---
    function renderBoard() {
        boardElement.innerHTML = ''; // Clear previous board and listeners
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const square = document.createElement('div');
                square.classList.add('square'); square.dataset.row = r; square.dataset.col = c;
                const pieceVal = board[r][c];
                if (pieceVal !== EMPTY) { // Place piece if exists
                    const piece = document.createElement('div');
                    piece.classList.add('piece', pieceVal === BLACK ? 'black-piece' : 'white-piece');
                    square.appendChild(piece);
                } else { // Handle empty squares (potential moves)
                    const isMoveValid = validMoves.some(move => move[0] === r && move[1] === c);
                    // Add indicator/listener only if it's a valid move for the *human* player's turn
                    if (isMoveValid && !gameOver && (gameMode === 'multiplayer' || (gameMode === 'bot' && currentPlayer === BLACK))) {
                        const validMoveIndicator = document.createElement('div');
                        validMoveIndicator.classList.add('valid-move-indicator');
                        square.appendChild(validMoveIndicator);
                        square.addEventListener('click', handleSquareClick); // Add listener dynamically
                    }
                }
                boardElement.appendChild(square);
            }
        }
    }
    // Update score display
    function updateScores() { scores[BLACK]=0; scores[WHITE]=0; board.flat().forEach(p => {if(p===BLACK)scores[BLACK]++; else if(p===WHITE)scores[WHITE]++;}); scoreElement.textContent = `Black: ${scores[BLACK]} - White: ${scores[WHITE]}`; }
    // Update turn display text
    function updateTurnDisplay() { if(gameOver) return; let txt=`Turn: ${currentPlayer===BLACK?'Black':'White'}`; if(gameMode==='bot'&&currentPlayer===WHITE) txt+=" (Bot thinking...)"; turnElement.textContent=txt;}
    // Handle clicks on valid move squares
    function handleSquareClick(event) {
        if (gameOver || (gameMode === 'bot' && currentPlayer === WHITE)) return; // Prevent clicks during bot turn/game over
        const square = event.currentTarget; const r = parseInt(square.dataset.row); const c = parseInt(square.dataset.col);
        if (isValidMove(r, c, currentPlayer)) { makeMove(r, c); } // Make move if it's valid (should always be if listener is present)
    }

    // --- Core Game Logic ---
    // Process placing a piece, flipping, updating state
    function makeMove(r, c) {
        if (gameOver) return;
        const playerMakingMove = currentPlayer;
        const boardBeforeMove = board.map(row => [...row]); // *** Store state BEFORE move for Undo ***
        const piecesToFlip = getFlips(r, c, playerMakingMove);

        // Double check move validity before applying
        if (board[r][c] !== EMPTY || piecesToFlip.length === 0) { console.warn("Make move called on invalid square or no flips"); return; }

        // Apply move
        board[r][c] = playerMakingMove;
        piecesToFlip.forEach(([fr, fc]) => { board[fr][fc] = playerMakingMove; });

        // Add to history (only if boardBefore was captured correctly)
        if(boardBeforeMove) { moveHistory.push({ player: playerMakingMove, move: [r, c], boardBefore: boardBeforeMove }); }
        else { console.error("Failed to record history: boardBefore was invalid"); }

        updateScores();
        switchPlayer(); // Handles turn switch, pass checks, game end checks
        updateUndoButtonState(); // Enable undo button after a move is made
        renderBoard();
        updateTurnDisplay();

        // Trigger Bot move if it's now the bot's turn
        if (!gameOver && gameMode === 'bot' && currentPlayer === WHITE) {
            updateTurnDisplay(); // Show "Bot thinking..."
            setTimeout(makeBotMove, 50); // Use timeout for UI responsiveness before AI calculation
        }
    }

    // Switch player, find valid moves, handle passes, check for game end
    function switchPlayer() {
        const previousPlayer = currentPlayer;
        currentPlayer = getOpponent(previousPlayer);
        findAllValidMoves(); // Find moves for the new current player

        if (validMoves.length === 0) { // Current player must pass
            currentPlayer = getOpponent(currentPlayer); // Switch back
            findAllValidMoves(); // Find moves for the player who gets another turn
            if (validMoves.length === 0) { // If that player ALSO has no moves, game ends
                 endGame(); return;
            }
            // If only the first player had no moves, the second player plays again (no further action needed here)
             console.log(`${getOpponent(currentPlayer) === BLACK ? 'Black':'White'} passed. ${currentPlayer === BLACK ? 'Black':'White'}'s turn again.`);
        }
        // Check if board is full AFTER checking for passes
        if (!gameOver && scores[BLACK] + scores[WHITE] === BOARD_SIZE * BOARD_SIZE) { endGame(); }
    }

    // Basic coordinate validation
    function isValid(r, c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }
    // Get opponent's color
    function getOpponent(player) { return player === BLACK ? WHITE : BLACK; }
    // Get flips for the main game board
    function getFlips(r, c, player) { return getFlipsForBoard(board, r, c, player); }
    // Check if a move is valid based on pre-calculated list
    function isValidMove(r, c, player) { return validMoves.some(move => move[0] === r && move[1] === c); }
    // Find all valid moves for the current player on the main board
    function findAllValidMoves() { validMoves = getAllValidMovesForPlayer(board, currentPlayer); }

    // Handle game end: determine winner, update stats, update UI
    function endGame() {
        if(gameOver) return; // Prevent multiple calls
        gameOver = true; let winner; let msg;
        // Determine winner based on final scores
        if (scores[BLACK] > scores[WHITE]) { winner = BLACK; msg = `Black Wins!`; }
        else if (scores[WHITE] > scores[BLACK]) { winner = WHITE; msg = `White Wins!`; }
        else { winner = 'draw'; msg = `It's a Draw!`; }

        updateStats(winner); // Record statistics for the completed game

        // Display result
        msg += ` (${scores[BLACK]} - ${scores[WHITE]})`;
        gameOverMessageElement.textContent = msg; gameOverMessageElement.classList.remove('hidden');
        turnElement.textContent = "Game Over"; restartBtn.classList.remove('hidden');
        updateUndoButtonState(); // Disable undo
        renderBoard(); // Re-render to remove valid move indicators
    }

    // --- AI Logic ---

    // Entry point for the bot's turn
    function makeBotMove() {
        if (gameOver || currentPlayer !== WHITE) return; // Safety check
        nodesEvaluated = 0; // Reset performance counter
        console.time("Bot Move Calculation");
        hideActionFeedback();

        // 1. Opening Book Check
        const currentBoardStr = boardToString(board);
        if (openingBook[currentBoardStr]) {
             const [r, c] = openingBook[currentBoardStr];
             // Ensure book move is actually valid in the current context (safety)
             if (getAllValidMovesForPlayer(board, WHITE).some(m => m[0] === r && m[1] === c)) {
                 console.log("Bot playing from Opening Book:", [r, c]);
                 console.timeEnd("Bot Move Calculation");
                 makeMove(r, c);
                 return;
             } else { console.warn("Opening book move invalid for current board state, ignoring."); }
        }

        // 2. Easy Difficulty: Random Move
        if (botDifficulty === 'easy') {
            const possibleMoves = getAllValidMovesForPlayer(board, WHITE);
            if (possibleMoves.length > 0) { const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)]; console.log("Bot (Easy) random move:", move); console.timeEnd("Bot Move Calculation"); makeMove(move[0], move[1]); }
            else { console.error("Easy Bot has no moves!"); console.timeEnd("Bot Move Calculation"); if (getAllValidMovesForPlayer(board, BLACK).length === 0) endGame(); else switchPlayer(); } // Pass or end
            return;
        }

        // 3. Medium/Hard/Expert: Iterative Deepening Search
        let bestMove = null; let bestScore = -Infinity;
        const possibleMoves = orderMoves(getAllValidMovesForPlayer(board, WHITE), board); // Get ordered valid moves
        if (possibleMoves.length === 0) { console.error("Bot has no moves!"); console.timeEnd("Bot Move Calculation"); if (getAllValidMovesForPlayer(board, BLACK).length === 0) endGame(); else switchPlayer(); return; } // Pass or end

        const emptySquares = countEmpty(board);
        // Determine search depth based on difficulty and endgame state
        let depthLimit = currentMaxIterativeDepth; // Base depth from difficulty setting
        if (emptySquares <= ENDGAME_DEPTH_LIMIT && depthLimit < emptySquares) {
             depthLimit = emptySquares; // Deepen search in endgame, up to remaining squares
             console.log(`Endgame detected (Empty: ${emptySquares}). Overriding depth limit to ${depthLimit}`);
        }
        console.log(`Searching: Difficulty=${botDifficulty}, TargetDepth=${currentMaxIterativeDepth}, EffectiveDepth=${depthLimit}`);

        let bestMoveFromCompletedDepth = possibleMoves[0]; // Fallback: best move from last fully completed depth

        // Iterative Deepening Loop
        for (let depth = 1; depth <= depthLimit; depth++) {
            let alpha = -Infinity; let beta = Infinity; // Reset alpha-beta window for each depth
            let currentBestScoreForDepth = -Infinity;
            let currentBestMoveForDepth = null;
            // Use best move from previous depth first for potentially better pruning
            const orderedMovesForDepth = [...possibleMoves]; // Start with statically ordered moves
            if(bestMove) { // If a best move exists from a shallower depth
                 const idx = orderedMovesForDepth.findIndex(m => m[0] === bestMove[0] && m[1] === bestMove[1]);
                 if(idx > 0) { // Move it to the front if found and not already first
                    const [prioritizedMove] = orderedMovesForDepth.splice(idx, 1); orderedMovesForDepth.unshift(prioritizedMove);
                 }
            }

            // Search moves at the current depth
            for (const [r, c] of orderedMovesForDepth) {
                const boardCopy = board.map(row => [...row]); makeSimulatedMove(boardCopy, r, c, WHITE); // Simulate move
                // Call minimax for the opponent (minimizing player)
                const score = minimax(boardCopy, depth - 1, alpha, beta, false);
                // Update best score/move found *at this depth*
                if (score > currentBestScoreForDepth) { currentBestScoreForDepth = score; currentBestMoveForDepth = [r, c]; }
                alpha = Math.max(alpha, currentBestScoreForDepth); // Update alpha within this depth's search
                // Alpha-beta pruning within minimax calls handles cutoffs
            }

            // After searching all moves at this depth, update the overall best known move
            if (currentBestMoveForDepth) {
                 bestMove = currentBestMoveForDepth; // Update the best move found so far across all depths
                 bestScore = currentBestScoreForDepth; // Update the score associated with that best move
                 bestMoveFromCompletedDepth = bestMove; // Store the best from this completed depth
                 console.log(`Depth ${depth}: Best=${bestScore} Move=[${bestMove}], Nodes=${nodesEvaluated}`);
            } else {
                 console.log(`Depth ${depth}: No move improved score. Stopping deepening.`);
                 // If no move could be evaluated or improved score (highly unlikely unless only 1 move), stop
                 break;
            }
            // Optional: Add time limit check here to break loop if needed
        }

        console.timeEnd("Bot Move Calculation");
        // Use the best move found from the deepest completed search, or fallback
        const finalMove = bestMove || bestMoveFromCompletedDepth;
        console.log(`Final Choice: Move=[${finalMove}], Score=${bestScore}, Nodes=${nodesEvaluated}`);
        // Make the chosen move
        if (finalMove) { makeMove(finalMove[0], finalMove[1]); }
        else { console.error("Bot failed to select a final move!"); if (getAllValidMovesForPlayer(board, BLACK).length === 0) endGame(); else switchPlayer(); } // Pass or end game as fallback
    }

    // Minimax search function with alpha-beta pruning and transposition table
    function minimax(currentBoard, depth, alpha, beta, isMaximizingPlayer) {
        nodesEvaluated++;
        const boardKey = boardToString(currentBoard);
        const player = isMaximizingPlayer ? WHITE : BLACK;
        const emptyCount = countEmpty(currentBoard); // Needed for evaluation phase check

        // --- Transposition Table Lookup ---
        const ttEntry = transpositionTable[boardKey];
        let ttMove = null; // Hint for best move ordering
        if (ttEntry && ttEntry.depth >= depth) { // Use TT entry if it's for same/greater depth
            if (ttEntry.flag === TT_FLAG_EXACT) return ttEntry.score; // Exact score found
            if (ttEntry.flag === TT_FLAG_LOWERBOUND) alpha = Math.max(alpha, ttEntry.score); // Update alpha based on lower bound
            if (ttEntry.flag === TT_FLAG_UPPERBOUND) beta = Math.min(beta, ttEntry.score); // Update beta based on upper bound
            if (alpha >= beta) return ttEntry.score; // Pruning based on TT bounds
            ttMove = ttEntry.bestMove; // Use stored best move for ordering
        }

        // --- Base Cases: Max Depth or Game Over ---
        if (depth === 0 || isGameOver(currentBoard)) {
            return evaluateBoard(currentBoard, emptyCount); // Evaluate leaf node or terminal state
        }

        // --- Generate and Order Moves ---
        let possibleMoves = orderMoves(getAllValidMovesForPlayer(currentBoard, player), currentBoard);
        // Prioritize TT move if available and valid
        if(ttMove) {
             const idx = possibleMoves.findIndex(m => m[0] === ttMove[0] && m[1] === ttMove[1]);
             if(idx > 0) { const [pMove] = possibleMoves.splice(idx, 1); possibleMoves.unshift(pMove); }
             else if (idx === -1) { ttMove = null; } // Ignore invalid TT move hint
        }

        // --- Handle Pass Turn ---
        if (possibleMoves.length === 0) {
            // Check if opponent can also not move (game over)
            if (getAllValidMovesForPlayer(currentBoard, getOpponent(player)).length === 0) {
                 return evaluateBoard(currentBoard, emptyCount); // Evaluate final board state
            }
            // Only opponent can move: recurse for opponent, *don't decrease depth* for a pass turn
            return minimax(currentBoard, depth, alpha, beta, !isMaximizingPlayer);
        }

        // --- Recursive Search ---
        let bestScore = isMaximizingPlayer ? -Infinity : Infinity;
        let bestMoveForNode = possibleMoves[0]; // Track best move found *at this specific node*
        let ttFlag = isMaximizingPlayer ? TT_FLAG_UPPERBOUND : TT_FLAG_LOWERBOUND; // Assume initially score won't improve bounds

        for (const [r, c] of possibleMoves) {
            const boardCopy = currentBoard.map(row => [...row]); makeSimulatedMove(boardCopy, r, c, player); // Simulate move
            const score = minimax(boardCopy, depth - 1, alpha, beta, !isMaximizingPlayer); // Recurse for opponent

            if (isMaximizingPlayer) { // Bot (WHITE) maximizing
                if (score > bestScore) { bestScore = score; bestMoveForNode = [r,c]; ttFlag = TT_FLAG_EXACT; } // Found exact score within bounds
                alpha = Math.max(alpha, bestScore); // Raise lower bound
                if (beta <= alpha) { ttFlag = TT_FLAG_LOWERBOUND; break; } // Beta cutoff (score is at least beta)
            } else { // Opponent (BLACK) minimizing
                if (score < bestScore) { bestScore = score; bestMoveForNode = [r,c]; ttFlag = TT_FLAG_EXACT; } // Found exact score within bounds
                beta = Math.min(beta, bestScore); // Lower upper bound
                if (beta <= alpha) { ttFlag = TT_FLAG_UPPERBOUND; break; } // Alpha cutoff (score is at most alpha)
            }
        }

        // --- Store Result in Transposition Table ---
        // Avoid overwriting a deeper/better entry with a shallower one
        if (!ttEntry || depth >= ttEntry.depth) {
             transpositionTable[boardKey] = { score: bestScore, depth: depth, flag: ttFlag, bestMove: bestMoveForNode };
        }

        return bestScore;
    }

    // --- AI Helper Functions ---
    // Simulates making a move on a temporary board state
    function makeSimulatedMove(boardState, r, c, player) { const flips = getFlipsForBoard(boardState, r, c, player); boardState[r][c] = player; flips.forEach(([fr, fc]) => { boardState[fr][fc] = player; }); }
    // Counts empty squares on a given board state
    function countEmpty(boardState) { let c = 0; for(let r=0;r<8;r++) for(let C=0;C<8;C++) if(boardState[r][C]===EMPTY) c++; return c; }
    // Checks if game is over (neither player can move) on a given board state
    function isGameOver(boardToCheck) { return getAllValidMovesForPlayer(boardToCheck, BLACK).length === 0 && getAllValidMovesForPlayer(boardToCheck, WHITE).length === 0; }
    // Gets flips for a specific board state (used in simulation)
    function getFlipsForBoard(boardToCheck, r, c, player) { const o = getOpponent(player); let fl = []; if (!isValid(r,c) || boardToCheck[r][c] !== EMPTY) return []; for (const [dr, dc] of directions) { let cf = []; let nr = r + dr; let nc = c + dc; while (isValid(nr, nc) && boardToCheck[nr][nc] === o) { cf.push([nr, nc]); nr += dr; nc += dc; } if (isValid(nr, nc) && boardToCheck[nr][nc] === player && cf.length > 0) { fl = fl.concat(cf); } } return fl; }
    // Gets all valid moves for a player on a given board state
    function getAllValidMovesForPlayer(boardToCheck, player) { let m = []; for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(boardToCheck[r][c]===EMPTY && getFlipsForBoard(boardToCheck, r, c, player).length > 0) m.push([r, c]); return m; }
    // Converts board array to a string key for transposition table
    function boardToString(boardState) { return boardState.flat().join(''); }
    // Orders moves heuristically (simple version prioritizing positional score)
    function orderMoves(moves, boardState) {
         // Prioritize corners > stable edges > positional > flips > random
         // Simple version: Just use positional weights for ordering
         const scoredMoves = moves.map(([r, c]) => ({ move: [r, c], score: positionalWeights[r][c] }));
         scoredMoves.sort((a, b) => b.score - a.score); // Sort descending by positional score
         return scoredMoves.map(item => item.move);
     }

    // --- ADVANCED HEURISTIC EVALUATION FUNCTION ---
    function evaluateBoard(boardToEvaluate, emptyCount) {
        // --- Endgame Exact Score ---
        // If the game is definitively over, return exact score based on piece difference
        if (isGameOver(boardToEvaluate)) {
            let whitePieces = 0; let blackPieces = 0;
            boardToEvaluate.flat().forEach(p => { if (p === WHITE) whitePieces++; else if (p === BLACK) blackPieces++; });
            return (whitePieces - blackPieces) * EXACT_SCORE_FACTOR; // Scaled difference
        }

        // --- Heuristic Components ---
        let whitePositional = 0, blackPositional = 0;
        let whiteFrontier = 0, blackFrontier = 0;
        let whiteSafe = 0, blackSafe = 0; // Count of "safe" discs (currently only corners)
        const corners = [[0,0], [0,7], [7,0], [7,7]]; // Corner coordinates

        // Calculate positional score, frontier discs, and basic stability (corners)
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const piece = boardToEvaluate[r][c];
                if (piece === EMPTY) continue; // Skip empty squares

                let isCorner = corners.some(corner => corner[0] === r && corner[1] === c);
                // Basic stability: Only corners are considered safe in this simple check.
                // A more advanced version would check edges connected to corners, etc.
                let isSafe = isCorner;

                if (piece === WHITE) { // Bot's pieces
                    whitePositional += positionalWeights[r][c]; // Add positional value
                    if (isSafe) whiteSafe++; // Increment safe disc count
                    // Check adjacent empty squares (frontier calculation)
                    for (const [dr, dc] of directions) { if (isValid(r+dr, c+dc) && boardToEvaluate[r+dr][c+dc] === EMPTY) { whiteFrontier++; break; } }
                } else { // Opponent's pieces (BLACK)
                    blackPositional += positionalWeights[r][c];
                    if (isSafe) blackSafe++;
                    // Frontier Check
                    for (const [dr, dc] of directions) { if (isValid(r+dr, c+dc) && boardToEvaluate[r+dr][c+dc] === EMPTY) { blackFrontier++; break; } }
                }
            }
        }

        // --- Calculate Mobility (Number of valid moves) ---
        const whiteMoves = getAllValidMovesForPlayer(boardToEvaluate, WHITE).length;
        const blackMoves = getAllValidMovesForPlayer(boardToEvaluate, BLACK).length;

        // --- Determine Game Phase (adjusts heuristic weights) ---
        let phase; // 1=Early, 2=Mid, 3=Late/Endgame
        if (emptyCount > 40) phase = 1; // Approx < 24 pieces on board
        else if (emptyCount > ENDGAME_DEPTH_LIMIT) phase = 2; // Mid game
        else phase = 3; // Late Game / Endgame

        // --- Assign Weights Based on Phase ---
        // These weights need careful tuning for optimal play!
        let posW, mobW, frontW, stabW, parityW;
        if (phase === 1) { // Early Game: Focus on position, mobility, limiting opponent options
            posW = 10; mobW = 200; frontW = -75; stabW = 1000; parityW = 10; // Mobility high, stability (corners) high, frontier penalty
        } else if (phase === 2) { // Mid Game: Balance everything, stability gains importance
             posW = 15; mobW = 150; frontW = -50; stabW = 1200; parityW = 150; // Stability increases, parity starts mattering
        } else { // Late Game / Endgame: Focus on maximizing final diff, stability, parity
             posW = 20; mobW = 100; frontW = -10; stabW = 1500; parityW = 500; // Parity and Stability are crucial, mobility less so
        }

        // --- Calculate Component Scores ---
        let positionalScore = posW * (whitePositional - blackPositional);
        let stabilityScore = stabW * (whiteSafe - blackSafe); // Score based on safe (corner) discs
        let frontierScore = frontW * (whiteFrontier - blackFrontier); // Penalize exposed pieces

        // Mobility Score: Relative difference, potentially normalized
        let mobilityScore = 0;
        if (whiteMoves + blackMoves !== 0) {
             // Score difference based on available moves
             mobilityScore = mobW * (whiteMoves - blackMoves);
             // Optional normalization: / (whiteMoves + blackMoves + 1); // Prevents huge swings? Test impact.
        }
        // Add bonus/penalty if one player has zero moves (potential forced pass)
        if (phase > 1) { // More significant later in the game
             if (whiteMoves > 0 && blackMoves === 0) mobilityScore += mobW * 1.5; // Bonus if opponent is forced to pass
             if (blackMoves > 0 && whiteMoves === 0) mobilityScore -= mobW * 1.5; // Penalty if bot is forced to pass
        }

        // Parity Score (Simple): Focus on who gets the *last* move overall.
        // Evaluated *after* a move. If emptyCount is odd, the *next* player gets last move.
        // White (maximizer) wants the last move if empty is ODD from *opponent's* perspective (i.e., EVEN from current perspective)
        let parityScore = (emptyCount % 2 === 0) ? parityW : -parityW; // Bonus to WHITE if even empty squares remain (meaning WHITE likely gets last move)


        // --- Combine Heuristics ---
        let finalScore = positionalScore + mobilityScore + stabilityScore + frontierScore + parityScore;

        // Evaluation is from the perspective of WHITE (the maximizing player)
        return finalScore;
    }

}); // End DOMContentLoaded