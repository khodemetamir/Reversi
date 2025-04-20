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
    // Added reference for player color choice buttons
    const playerColorChoiceButtons = settingsModal.querySelectorAll('.player-color-choice');
    const backToMenuBtn = document.getElementById('back-to-menu-btn');
    const saveGameBtn = document.getElementById('save-game-btn');
    const undoBtn = document.getElementById('undo-btn');
    const actionFeedbackElement = document.getElementById('action-feedback');
    // Added references for stats toggle
    const toggleStatsBtn = document.getElementById('toggle-stats-btn');
    const statsContent = document.getElementById('stats-content');

    // --- Constants ---
    const BOARD_SIZE = 8;
    const EMPTY = 0; const BLACK = 1; const WHITE = 2;
    // AI Depths per difficulty
    const MAX_AI_DEPTH_EXPERT = 6;
    const MAX_AI_DEPTH_HARD = 5;
    const MAX_AI_DEPTH_MEDIUM = 3;
    const MAX_AI_DEPTH_EASY = 1;
    const ENDGAME_DEPTH_LIMIT = 12;
    const EXACT_SCORE_FACTOR = 10000;
    // localStorage Keys
    const SAVE_GAME_KEY = 'savedOthelloGame_v2';
    const STATS_KEY = 'othelloStats_v2';
    const DIFFICULTY_KEY = 'othelloDifficulty_v2';
    const THEME_KEY = 'othelloTheme_v2';
    // Added key for player color preference
    const PLAYER_COLOR_KEY = 'othelloPlayerColor_v2';


    // --- Game State ---
    let board = [];
    let currentPlayer;
    let gameMode = null; // 'multiplayer', 'bot'
    let botDifficulty = 'hard'; // Default difficulty
    // Added variable for player's preferred color
    let playerPrefersColor = BLACK; // Default: Player is Black
    let gameOver = false;
    let validMoves = [];
    let scores = { [BLACK]: 0, [WHITE]: 0 };
    let moveHistory = []; // Stores { player, move: [r, c], boardBefore }

    // --- AI Specific State ---
    let transpositionTable = {};
    const TT_FLAG_EXACT = 0; const TT_FLAG_LOWERBOUND = 1; const TT_FLAG_UPPERBOUND = 2;
    let nodesEvaluated = 0;
    let currentMaxIterativeDepth = MAX_AI_DEPTH_HARD;

    // --- Opening Book (Example) ---
    const openingBook = {
        '0000000000000000000120000001210000021100000000000000000000000000': [3, 2],
        '0000000000000000000120000021210000121100000000000000000000000000': [2, 3],
    };

    // --- Directions & Positional Weights ---
    const directions = [
        [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]
    ];
    const positionalWeights = [
        [ 1000, -200, 100,  50,  50, 100, -200, 1000],
        [ -200, -400,  -5,  -5,  -5,  -5, -400, -200],
        [  100,   -5,  15,   3,   3,  15,   -5,  100],
        [   50,   -5,   3,   3,   3,   3,   -5,   50],
        [   50,   -5,   3,   3,   3,   3,   -5,   50],
        [  100,   -5,  15,   3,   3,  15,   -5,  100],
        [ -200, -400,  -5,  -5,  -5,  -5, -400, -200],
        [ 1000, -200, 100,  50,  50, 100, -200, 1000]
    ];

    // --- Initialization ---
    loadSettings(); // Load preferences including player color
    setupEventListeners();
    updateLoadButtonState();

    // --- Event Listener Setup ---
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
        // Added listener for player color choice buttons
        playerColorChoiceButtons.forEach(button => button.addEventListener('click', handlePlayerColorChange));
        resetStatsBtn.addEventListener('click', handleResetStats);
        backToMenuBtn.addEventListener('click', goBackToMenu);
        saveGameBtn.addEventListener('click', saveGame);
        undoBtn.addEventListener('click', handleUndo);
        // Added listener for stats toggle button
        toggleStatsBtn.addEventListener('click', handleToggleStats);
    }

    // --- Game Start & Initialization ---
    function startGame(mode, loadedState = null) {
        console.log(`Starting game: Mode=${mode}, Difficulty=${botDifficulty}, Player Prefers: ${playerPrefersColor === BLACK ? 'Black' : 'White'}`);
        hideActionFeedback();
        transpositionTable = {};

        // Define human and bot colors based on preference
        const humanPlayer = playerPrefersColor;
        const botPlayer = getOpponent(humanPlayer); // Bot is the opposite color

        if (loadedState) {
            // Restore state from loaded data
            try {
                board = loadedState.board.map(row => [...row]);
                currentPlayer = loadedState.currentPlayer;
                gameMode = loadedState.gameMode;
                botDifficulty = loadedState.botDifficulty || 'hard';
                // Optionally load player color preference if saved
                if (loadedState.playerPrefersColor !== undefined) {
                    playerPrefersColor = loadedState.playerPrefersColor;
                    // Re-define players based on loaded pref - might not be strictly necessary if start handles it, but good practice
                    // humanPlayer = playerPrefersColor;
                    // botPlayer = getOpponent(humanPlayer);
                } else {
                    // Fallback if old save without color preference
                     playerPrefersColor = BLACK; // Or try to infer from history/turn? Safer to default.
                }

                moveHistory = loadedState.moveHistory ? loadedState.moveHistory.map(h => ({
                     player: h.player,
                     move: [...h.move],
                     boardBefore: h.boardBefore.map(r => [...r])
                 })) : [];
                gameOver = false;
                console.log(`Loaded game state. Current Player: ${currentPlayer}, Player Prefers: ${playerPrefersColor === BLACK ? 'Black' : 'White'}, History Length: ${moveHistory.length}`);
            } catch (e) {
                 console.error("Failed to process loaded state:", e);
                 showActionFeedback("Error loading save data!", true);
                 goBackToMenu();
                 return;
            }
        } else {
            // Standard initialization for a new game
            gameMode = mode;
            gameOver = false;
            board = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(EMPTY));
            moveHistory = [];
            const mid = BOARD_SIZE / 2;
            // Initial pieces are always placed the same way
            board[mid - 1][mid - 1] = WHITE; board[mid - 1][mid] = BLACK;
            board[mid][mid - 1] = BLACK; board[mid][mid] = WHITE;
            // Black *always* starts the game
            currentPlayer = BLACK;
        }

        applyDifficulty();
        menuElement.classList.add('hidden');
        settingsModal.classList.add('hidden');
        gameAreaElement.classList.remove('hidden');
        gameOverMessageElement.classList.add('hidden');
        restartBtn.classList.add('hidden');

        updateScores();
        findAllValidMoves(); // Must run after currentPlayer and board are set
        updateUndoButtonState();
        renderBoard(); // Render uses player color info
        updateTurnDisplay(); // Turn display uses player color info

        // *** IMPORTANT: If the human chose WHITE, and it's a bot game, the BOT (Black) must move first ***
        if (!gameOver && gameMode === 'bot' && currentPlayer === botPlayer && currentPlayer === BLACK) {
            console.log("Bot (Black) takes the first turn as player chose White.");
            updateTurnDisplay(); // Show "Bot thinking..."
            setTimeout(makeBotMove, 100); // Bot makes the first move
        }
    }

    function handleRestart() { if (gameMode) startGame(gameMode); else goBackToMenu(); }

    function goBackToMenu() {
        gameAreaElement.classList.add('hidden');
        gameOverMessageElement.classList.add('hidden');
        restartBtn.classList.add('hidden');
        menuElement.classList.remove('hidden');
        gameMode = null;
        updateLoadButtonState();
        hideActionFeedback();
    }

    // --- Settings, Stats, Save/Load Persistence ---

    function loadSettings() {
        const savedTheme = localStorage.getItem(THEME_KEY) || 'theme-default';
        applyTheme(savedTheme);
        botDifficulty = localStorage.getItem(DIFFICULTY_KEY) || 'hard';
        applyDifficulty();
        // Load player color preference
        const savedPlayerColor = localStorage.getItem(PLAYER_COLOR_KEY);
        playerPrefersColor = savedPlayerColor === 'white' ? WHITE : BLACK;
        console.log("Loaded settings - Theme:", savedTheme, "Difficulty:", botDifficulty, "Player Color:", playerPrefersColor === BLACK ? 'Black' : 'White');
    }

    function saveSettings() {
        let currentTheme = 'theme-default';
        if (bodyElement.classList.contains('theme-blue')) currentTheme = 'theme-blue';
        else if (bodyElement.classList.contains('theme-forest')) currentTheme = 'theme-forest';
        else if (bodyElement.classList.contains('theme-classic')) currentTheme = 'theme-classic';
        localStorage.setItem(THEME_KEY, currentTheme);
        localStorage.setItem(DIFFICULTY_KEY, botDifficulty);
        // Save player color preference
        localStorage.setItem(PLAYER_COLOR_KEY, playerPrefersColor === BLACK ? 'black' : 'white');
    }

    function handleThemeChange(event) {
        const theme = event.target.dataset.theme;
        applyTheme(theme);
        saveSettings();
        updateActiveThemeButton();
    }

    function handleDifficultyChange(event) {
        botDifficulty = event.target.dataset.difficulty;
        applyDifficulty();
        saveSettings();
        updateActiveDifficultyButton();
        console.log("Difficulty set to:", botDifficulty);
    }

    // Added handler for player color choice
    function handlePlayerColorChange(event) {
        const chosenColor = event.target.dataset.color;
        playerPrefersColor = (chosenColor === 'white') ? WHITE : BLACK;
        saveSettings();
        updateActivePlayerColorButton();
        console.log("Player color preference set to:", chosenColor);
        showActionFeedback("Color choice saved. Takes effect on New Game.", false);
    }


    function applyDifficulty() {
        switch (botDifficulty) {
            case 'easy': currentMaxIterativeDepth = MAX_AI_DEPTH_EASY; break;
            case 'medium': currentMaxIterativeDepth = MAX_AI_DEPTH_MEDIUM; break;
            case 'hard': currentMaxIterativeDepth = MAX_AI_DEPTH_HARD; break;
            case 'expert': currentMaxIterativeDepth = MAX_AI_DEPTH_EXPERT; break;
            default: currentMaxIterativeDepth = MAX_AI_DEPTH_HARD; botDifficulty = 'hard';
        }
    }

    function openSettingsModal() {
        displayStats();
        updateActiveThemeButton();
        updateActiveDifficultyButton();
        // Update player color button state
        updateActivePlayerColorButton();
        // Ensure stats content is hidden initially when modal opens
        if (statsContent && !statsContent.classList.contains('hidden')) {
            statsContent.classList.add('hidden');
        }
        if (toggleStatsBtn) {
            toggleStatsBtn.textContent = 'Show Statistics'; // Reset button text
        }
        settingsModal.classList.remove('hidden');
    }
    function closeSettingsModal() { settingsModal.classList.add('hidden'); }

    function updateActiveThemeButton() { const current = localStorage.getItem(THEME_KEY) || 'theme-default'; themeChoiceButtons.forEach(b => { b.classList.toggle('active', b.dataset.theme === current); }); }
    function updateActiveDifficultyButton() { difficultyChoiceButtons.forEach(b => { b.classList.toggle('active', b.dataset.difficulty === botDifficulty); }); }

    // Added function to update player color button state
    function updateActivePlayerColorButton() {
        const current = playerPrefersColor === BLACK ? 'black' : 'white';
        playerColorChoiceButtons.forEach(b => {
            b.classList.toggle('active', b.dataset.color === current);
        });
    }

    function getStats() { /* ... (keep existing code) ... */ try { const statsJson=localStorage.getItem(STATS_KEY); const parsed=statsJson ? JSON.parse(statsJson) : null; if(parsed && parsed.vsBot && parsed.multiplayer) { const difficulties=['easy','medium','hard','expert']; difficulties.forEach(diff => { if(!parsed.vsBot[diff]) parsed.vsBot[diff]={w:0,l:0,d:0}; }); return parsed; } return getDefaultStats(); } catch(e) { console.error("Stats read error", e); return getDefaultStats(); } }
    function getDefaultStats() { return { vsBot: { easy: {w:0,l:0,d:0}, medium: {w:0,l:0,d:0}, hard: {w:0,l:0,d:0}, expert: {w:0,l:0,d:0} }, multiplayer: { blackWins: 0, whiteWins: 0, draws: 0 } }; }
    function saveStats(stats) { try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { console.error("Stats save error", e); } }

    // Modified updateStats to consider humanPlayer color
    function updateStats(winner) { // winner = BLACK, WHITE, or 'draw'
        const stats = getStats();
        const humanPlayer = playerPrefersColor; // Get the human's chosen color

        if (gameMode === 'bot') {
            const diff = botDifficulty || 'hard'; // Ensure difficulty is valid key
             if (!stats.vsBot[diff]) stats.vsBot[diff] = { w: 0, l: 0, d: 0 }; // Initialize just in case
             if (winner === 'draw') stats.vsBot[diff].d++;
             else if (winner === humanPlayer) stats.vsBot[diff].w++; // Human Wins (Player got their chosen color)
             else stats.vsBot[diff].l++; // Bot Wins (winner === getOpponent(humanPlayer))
        } else if (gameMode === 'multiplayer') {
             // Multiplayer stats track Black/White wins directly, no change needed here
             if (winner === BLACK) stats.multiplayer.blackWins++;
             else if (winner === WHITE) stats.multiplayer.whiteWins++;
             else stats.multiplayer.draws++;
        }
        saveStats(stats);
    }


    function displayStats() { /* ... (keep existing code, maybe adjust labels like 'Your W/L/D vs Bot') ... */ const stats=getStats();statsDisplayElement.innerHTML='';function createStatValueElement(label, value, typeClass) {const span=document.createElement('span');span.classList.add('stat-value',typeClass);const l=document.createElement('span');l.classList.add('value-label');l.textContent=`${label}:`;span.appendChild(l);const n=document.createElement('span');n.classList.add('value-number');n.textContent=value;span.appendChild(n);return span;} function createStatsRow(label, winValue, lossValue, drawValue) { const div=document.createElement('div');div.classList.add('stats-row');const l=document.createElement('span');l.classList.add('stats-label');l.textContent=label;div.appendChild(l);const v=document.createElement('div');v.classList.add('stats-values');v.appendChild(createStatValueElement('W',winValue,'win'));v.appendChild(createStatValueElement('L',lossValue,'loss'));v.appendChild(createStatValueElement('D',drawValue,'draw'));div.appendChild(v);return div; } const vsBotHeader=document.createElement('div');vsBotHeader.classList.add('stats-section-header');vsBotHeader.textContent='Your W/L/D vs Bot';statsDisplayElement.appendChild(vsBotHeader);['easy','medium','hard','expert'].forEach(diff=>{const s=stats.vsBot[diff]||{w:0,l:0,d:0};statsDisplayElement.appendChild(createStatsRow(diff,s.w,s.l,s.d));});const mpHeader=document.createElement('div');mpHeader.classList.add('stats-section-header');mpHeader.textContent='Multiplayer';statsDisplayElement.appendChild(mpHeader);const mpRow=document.createElement('div');mpRow.classList.add('stats-row');mpRow.innerHTML=`<span class="stats-label">Record</span><span class="stats-values"><span class="stat-value win"><span class="value-label">B:</span><span class="value-number">${stats.multiplayer.blackWins}</span></span><span class="stat-value win"><span class="value-label">W:</span><span class="value-number">${stats.multiplayer.whiteWins}</span></span><span class="stat-value draw"><span class="value-label">D:</span><span class="value-number">${stats.multiplayer.draws}</span></span></span>`;statsDisplayElement.appendChild(mpRow); }

    function handleResetStats() { if (confirm("Reset all statistics?")) { saveStats(getDefaultStats()); displayStats(); showActionFeedback("Statistics Reset!"); } }

    // --- Function to toggle Statistics visibility ---
    function handleToggleStats() {
        if (!statsContent || !toggleStatsBtn) return;
        const isHidden = statsContent.classList.toggle('hidden');
        toggleStatsBtn.textContent = isHidden ? 'Show Statistics' : 'Hide Statistics';
    }

    function saveGame() {
        if (gameOver || gameMode === null) { showActionFeedback("Cannot save game now.", true); return; }
        // ... (keep history validation)
         let historyToSave; try { historyToSave = moveHistory.map(h => { if (!h || !h.boardBefore || !Array.isArray(h.boardBefore) || !h.move || !Array.isArray(h.move)) { throw new Error("Corrupted move history item detected."); } return { player: h.player, move: [...h.move], boardBefore: h.boardBefore.map(r => [...r]) }; }); } catch (e) { console.error("Error preparing history for saving:", e); showActionFeedback("Error: Cannot save due to invalid game history.", true); return; }

        const gameState = {
            board: board.map(row => [...row]), currentPlayer: currentPlayer, gameMode: gameMode,
            botDifficulty: botDifficulty,
            playerPrefersColor: playerPrefersColor, // Save color preference
            moveHistory: historyToSave,
        };
        try { localStorage.setItem(SAVE_GAME_KEY, JSON.stringify(gameState)); showActionFeedback("Game Saved!"); updateLoadButtonState(); }
        catch (e) { console.error("Error saving game:", e); showActionFeedback("Error saving game!", true); }
    }

    function loadGame() { /* ... (keep existing load logic, ensure startGame uses the loaded state correctly) ... */ hideActionFeedback(); try { const json=localStorage.getItem(SAVE_GAME_KEY); if(json) { const state=JSON.parse(json); if(state && state.board && Array.isArray(state.board) && state.currentPlayer !== undefined && state.gameMode) { startGame(state.gameMode, state); } else { showActionFeedback("Invalid save data.", true); localStorage.removeItem(SAVE_GAME_KEY); updateLoadButtonState(); } } else { showActionFeedback("No saved game found.", true); } } catch(e) { console.error("Load error:", e); showActionFeedback("Error loading game!", true); localStorage.removeItem(SAVE_GAME_KEY); updateLoadButtonState(); } }

    function updateLoadButtonState() { /* ... (keep existing code) ... */ let exists=false;try{const json=localStorage.getItem(SAVE_GAME_KEY);if(json){const d=JSON.parse(json);if(d&&d.board&&Array.isArray(d.board))exists=true;}}catch{}loadGameBtn.disabled=!exists;loadGameBtn.style.opacity=exists?1:0.6;loadGameBtn.style.cursor=exists?'pointer':'not-allowed';}

    function showActionFeedback(message, isError = false) { actionFeedbackElement.textContent = message; actionFeedbackElement.style.backgroundColor = isError ? '#d32f2f' : 'var(--accent-color)'; actionFeedbackElement.classList.remove('hidden'); setTimeout(() => { actionFeedbackElement.classList.add('hidden'); }, 2500); }
    function hideActionFeedback() { actionFeedbackElement.classList.add('hidden'); }

    function applyTheme(themeName) { bodyElement.className = ''; bodyElement.classList.add(themeName); console.log("Applied theme:", themeName); }

    // Modified handleUndo to check against dynamic botPlayer color
    function handleUndo() {
        if (moveHistory.length === 0 || gameOver) return;
        hideActionFeedback();
        let movesToUndo = 1;
        const botPlayer = getOpponent(playerPrefersColor); // Determine bot color dynamically

        // If vs Bot and the last move was the Bot's, need to undo 2 moves
        if (gameMode === 'bot' && moveHistory.length > 0 && moveHistory[moveHistory.length - 1]?.player === botPlayer) {
            movesToUndo = 2;
        }
        if (moveHistory.length < movesToUndo) { console.log("Not enough history to undo."); return; }
        console.log(`Undoing ${movesToUndo} move(s)...`);

        let lastRelevantState = null;
        for (let i = 0; i < movesToUndo; i++) { lastRelevantState = moveHistory.pop(); }

        if (lastRelevantState && lastRelevantState.boardBefore && Array.isArray(lastRelevantState.boardBefore)) {
            board = lastRelevantState.boardBefore.map(row => [...row]);
            currentPlayer = lastRelevantState.player; // Set turn back
        } else { console.error("Undo failed: Invalid history state found."); showActionFeedback("Undo Failed!", true); return; }

        gameOver = false; gameOverMessageElement.classList.add('hidden'); restartBtn.classList.add('hidden');

        updateScores(); findAllValidMoves(); updateUndoButtonState(); renderBoard(); updateTurnDisplay();
        console.log("Undo complete. Current player:", currentPlayer);
    }


    function updateUndoButtonState() { undoBtn.disabled = moveHistory.length === 0 || gameOver; }

    // --- Rendering Logic ---
    function renderBoard() {
        boardElement.innerHTML = ''; // Clear previous board
        const humanPlayer = playerPrefersColor; // Get human's color

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const square = document.createElement('div');
                square.classList.add('square'); square.dataset.row = r; square.dataset.col = c;
                const pieceVal = board[r][c];
                if (pieceVal !== EMPTY) { // Place piece
                    const piece = document.createElement('div');
                    piece.classList.add('piece', pieceVal === BLACK ? 'black-piece' : 'white-piece');
                    square.appendChild(piece);
                } else { // Empty square
                    const isMoveValid = validMoves.some(move => move[0] === r && move[1] === c);
                    // Add indicator/listener only if it's a valid move for the *human* player's turn (vs Bot)
                    // OR if it's the current player's turn (Multiplayer)
                    const isPlayerTurn = (gameMode === 'bot' && currentPlayer === humanPlayer) || (gameMode === 'multiplayer');

                    if (isMoveValid && !gameOver && isPlayerTurn) {
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

    function updateScores() { scores[BLACK]=0; scores[WHITE]=0; board.flat().forEach(p => {if(p===BLACK)scores[BLACK]++; else if(p===WHITE)scores[WHITE]++;}); scoreElement.textContent = `Black: ${scores[BLACK]} - White: ${scores[WHITE]}`; }

    // Modified updateTurnDisplay to show "(Your Turn)" or "(Bot thinking...)" correctly
    function updateTurnDisplay() {
        if (gameOver) { turnElement.textContent = "Game Over"; return; } // Simplified game over display

        let txt = `Turn: ${currentPlayer === BLACK ? 'Black' : 'White'}`;
        const humanPlayer = playerPrefersColor;
        const botPlayer = getOpponent(humanPlayer);

        if (gameMode === 'bot') {
            if (currentPlayer === botPlayer) {
                txt += " (Bot thinking...)";
            } else if (currentPlayer === humanPlayer) {
                txt += " (Your turn)";
            }
        } else if (gameMode === 'multiplayer') {
             // Optional: Indicate which player's turn more clearly if needed
             // txt += (currentPlayer === BLACK ? " (P1)" : " (P2)");
        }
        turnElement.textContent = txt;
    }


    // Modified handleSquareClick to check against humanPlayer
    function handleSquareClick(event) {
        const humanPlayer = playerPrefersColor;
        const botPlayer = getOpponent(humanPlayer);

        // Prevent clicks during bot turn, game over, or if it's not the human's designated color's turn (vs bot)
        // In multiplayer, any click during the correct player's turn is allowed.
        const blockClick = gameOver || 
                           (gameMode === 'bot' && currentPlayer !== humanPlayer) ||
                           (gameMode !== 'bot' && gameMode !== 'multiplayer'); // Block if mode not set

        if (blockClick) return;

        const square = event.currentTarget;
        const r = parseInt(square.dataset.row);
        const c = parseInt(square.dataset.col);

        // Validate move *for the human player* (vs bot) or current player (multiplayer)
        const playerToCheck = gameMode === 'bot' ? humanPlayer : currentPlayer;
        if (isValidMove(r, c, playerToCheck)) { // Check validity for relevant player
             makeMove(r, c); // makeMove uses the global currentPlayer
        } else {
             console.warn("Invalid square clicked or move check failed."); // Should not happen if listener logic is correct
        }
    }


    // --- Core Game Logic ---
    function makeMove(r, c) {
        if (gameOver) return;
        const playerMakingMove = currentPlayer; // Use the global current player
        const boardBeforeMove = board.map(row => [...row]);
        const piecesToFlip = getFlips(r, c, playerMakingMove);

        if (board[r][c] !== EMPTY || piecesToFlip.length === 0) {
            console.warn(`Make move called on invalid square (${r},${c}) for player ${playerMakingMove} or no flips possible.`);
            // Find valid moves again just in case state is weird
            findAllValidMoves();
            renderBoard(); // Re-render to potentially show correct valid moves
            return;
         }

        board[r][c] = playerMakingMove;
        piecesToFlip.forEach(([fr, fc]) => { board[fr][fc] = playerMakingMove; });

        if(boardBeforeMove) { moveHistory.push({ player: playerMakingMove, move: [r, c], boardBefore: boardBeforeMove }); }
        else { console.error("Failed to record history: boardBefore was invalid"); }

        updateScores();
        switchPlayer(); // Handles turn switch, pass checks, game end checks
        updateUndoButtonState();
        renderBoard(); // Render after switching player & finding new moves
        updateTurnDisplay(); // Update display AFTER switching player

        // Trigger Bot move if it's now the bot's turn (check against dynamic botPlayer)
        const botPlayer = getOpponent(playerPrefersColor);
        if (!gameOver && gameMode === 'bot' && currentPlayer === botPlayer) {
            updateTurnDisplay(); // Show "Bot thinking..." before the timeout
            setTimeout(makeBotMove, 50);
        }
    }


    function switchPlayer() { /* ... (keep existing logic, it correctly switches turns and checks passes/end game based on global currentPlayer) ... */ const previousPlayer=currentPlayer;currentPlayer=getOpponent(previousPlayer);findAllValidMoves();if(validMoves.length===0){currentPlayer=getOpponent(currentPlayer);findAllValidMoves();if(validMoves.length===0){endGame();return;} console.log(`${getOpponent(currentPlayer)===BLACK?'Black':'White'} passed. ${currentPlayer===BLACK?'Black':'White'}'s turn again.`); } if(!gameOver && scores[BLACK] + scores[WHITE] === BOARD_SIZE * BOARD_SIZE) { endGame(); } }

    function isValid(r, c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }
    function getOpponent(player) { return player === BLACK ? WHITE : BLACK; }
    function getFlips(r, c, player) { return getFlipsForBoard(board, r, c, player); }
    function isValidMove(r, c, player) { return validMoves.some(move => move[0] === r && move[1] === c); } // Checks against pre-calculated validMoves for *current* player
    function findAllValidMoves() { validMoves = getAllValidMovesForPlayer(board, currentPlayer); } // Always finds moves for the *global* currentPlayer

    function endGame() { /* ... (keep existing logic, uses global scores) ... */ if(gameOver)return;gameOver=true;let winner;let msg;if(scores[BLACK]>scores[WHITE]){winner=BLACK;msg=`Black Wins!`;} else if(scores[WHITE]>scores[BLACK]){winner=WHITE;msg=`White Wins!`;} else{winner='draw';msg=`It's a Draw!`;} updateStats(winner);msg+=` (${scores[BLACK]} - ${scores[WHITE]})`;gameOverMessageElement.textContent=msg;gameOverMessageElement.classList.remove('hidden');turnElement.textContent="Game Over";restartBtn.classList.remove('hidden');updateUndoButtonState();renderBoard(); }


    // --- AI Logic ---

    // Modified makeBotMove to use dynamic botPlayer color
    function makeBotMove() {
        const botPlayer = getOpponent(playerPrefersColor); // Determine bot color dynamically
        const humanPlayer = playerPrefersColor;

        if (gameOver || currentPlayer !== botPlayer) {
             console.warn("makeBotMove called but it's not the bot's turn. Current:", currentPlayer, "Bot should be:", botPlayer);
             return; // Safety check
        }
        nodesEvaluated = 0; // Reset performance counter
        console.time("Bot Move Calculation");
        hideActionFeedback();

        // 1. Opening Book Check (Still assumes standard opening colors, might need adjustment if bot starts as Black)
        const currentBoardStr = boardToString(board);
        if (openingBook[currentBoardStr]) {
             const [r, c] = openingBook[currentBoardStr];
             // Make sure the book move is valid for the BOT's color
             if (getAllValidMovesForPlayer(board, botPlayer).some(m => m[0] === r && m[1] === c)) {
                 console.log("Bot playing from Opening Book:", [r, c]);
                 console.timeEnd("Bot Move Calculation");
                 makeMove(r, c);
                 return;
             } else { console.warn("Opening book move invalid for bot's turn/color, ignoring."); }
        }

        // 2. Easy Difficulty: Random Move (Use botPlayer)
        if (botDifficulty === 'easy') {
            const possibleMoves = getAllValidMovesForPlayer(board, botPlayer); // Use botPlayer
            if (possibleMoves.length > 0) { const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)]; console.log("Bot (Easy) random move:", move); console.timeEnd("Bot Move Calculation"); makeMove(move[0], move[1]); }
            else { console.error("Easy Bot has no moves!"); console.timeEnd("Bot Move Calculation"); if (getAllValidMovesForPlayer(board, humanPlayer).length === 0) endGame(); else switchPlayer(); } // Pass or end
            return;
        }

        // 3. Medium/Hard/Expert: Iterative Deepening Search (Use botPlayer)
        let bestMove = null; let bestScore = -Infinity;
        const possibleMoves = orderMoves(getAllValidMovesForPlayer(board, botPlayer), board); // Get ordered valid moves for botPlayer
        if (possibleMoves.length === 0) { console.error("Bot has no moves!"); console.timeEnd("Bot Move Calculation"); if (getAllValidMovesForPlayer(board, humanPlayer).length === 0) endGame(); else switchPlayer(); return; } // Pass or end

        const emptySquares = countEmpty(board);
        let depthLimit = currentMaxIterativeDepth;
        if (emptySquares <= ENDGAME_DEPTH_LIMIT && depthLimit < emptySquares) {
             depthLimit = emptySquares;
             console.log(`Endgame detected (Empty: ${emptySquares}). Overriding depth limit to ${depthLimit}`);
        }
        console.log(`Searching: Difficulty=${botDifficulty}, PlayerPrefers=${humanPlayer === BLACK ? 'Black' : 'White'}, BotIs=${botPlayer === BLACK ? 'Black' : 'White'}, TargetDepth=${currentMaxIterativeDepth}, EffectiveDepth=${depthLimit}`);

        let bestMoveFromCompletedDepth = possibleMoves[0];

        // Iterative Deepening Loop
        for (let depth = 1; depth <= depthLimit; depth++) {
            let alpha = -Infinity; let beta = Infinity;
            let currentBestScoreForDepth = -Infinity;
            let currentBestMoveForDepth = null;
            const orderedMovesForDepth = [...possibleMoves];
            if(bestMove) { const idx = orderedMovesForDepth.findIndex(m => m[0] === bestMove[0] && m[1] === bestMove[1]); if(idx > 0) { const [prioritizedMove] = orderedMovesForDepth.splice(idx, 1); orderedMovesForDepth.unshift(prioritizedMove); } }

            // Search moves at the current depth
            for (const [r, c] of orderedMovesForDepth) {
                const boardCopy = board.map(row => [...row]);
                makeSimulatedMove(boardCopy, r, c, botPlayer); // Simulate move with botPlayer
                // Call minimax for the opponent (humanPlayer), who will be MINIMIZING from bot's perspective
                // The 'isMaximizingPlayer' flag in the *next* call is 'false' because it's the human's turn to minimize
                const score = minimax(boardCopy, depth - 1, alpha, beta, false); // false = next turn is minimizing (human)
                // Update best score/move found *at this depth* (maximizing for bot)
                if (score > currentBestScoreForDepth) { currentBestScoreForDepth = score; currentBestMoveForDepth = [r, c]; }
                alpha = Math.max(alpha, currentBestScoreForDepth); // Update alpha within this depth's search
                 if (beta <= alpha) { break; } // Pruning check
            }

            if (currentBestMoveForDepth) {
                 bestMove = currentBestMoveForDepth;
                 bestScore = currentBestScoreForDepth;
                 bestMoveFromCompletedDepth = bestMove;
                 console.log(`Depth ${depth}: Best=${bestScore} Move=[${bestMove}], Nodes=${nodesEvaluated}`);
            } else {
                 console.log(`Depth ${depth}: No move improved score. Stopping deepening.`);
                 break;
            }
        }

        console.timeEnd("Bot Move Calculation");
        const finalMove = bestMove || bestMoveFromCompletedDepth;
        console.log(`Final Choice: Move=[${finalMove}], Score=${bestScore}, Nodes=${nodesEvaluated}`);
        if (finalMove) { makeMove(finalMove[0], finalMove[1]); }
        else { console.error("Bot failed to select a final move!"); if (getAllValidMovesForPlayer(board, humanPlayer).length === 0) endGame(); else switchPlayer(); } // Fallback
    }

    // Modified minimax to work relative to the botPlayer being the maximizer
    function minimax(currentBoard, depth, alpha, beta, isMaximizingPlayer) {
        nodesEvaluated++;
        const boardKey = boardToString(currentBoard);
        // Determine player colors based on preference context
        const botPlayerColor = getOpponent(playerPrefersColor); // The bot always maximizes its score
        const humanPlayerColor = playerPrefersColor;             // The human always minimizes the bot's score

        // Determine whose turn it is in this simulation step based on the isMaximizingPlayer flag
        const player = isMaximizingPlayer ? botPlayerColor : humanPlayerColor;
        const opponent = getOpponent(player); // The opponent for the *next* recursive call

        const emptyCount = countEmpty(currentBoard);

        // --- Transposition Table Lookup ---
        const ttEntry = transpositionTable[boardKey];
        let ttMove = null;
        if (ttEntry && ttEntry.depth >= depth) {
            if (ttEntry.flag === TT_FLAG_EXACT) return ttEntry.score;
            if (ttEntry.flag === TT_FLAG_LOWERBOUND) alpha = Math.max(alpha, ttEntry.score);
            if (ttEntry.flag === TT_FLAG_UPPERBOUND) beta = Math.min(beta, ttEntry.score);
            if (alpha >= beta) return ttEntry.score;
            ttMove = ttEntry.bestMove;
        }

        // --- Base Cases: Max Depth or Game Over ---
        if (depth === 0 || isGameOver(currentBoard)) {
            // Evaluate the board from the perspective of the BOT (maximizing player)
            return evaluateBoard(currentBoard, emptyCount, botPlayerColor);
        }

        // --- Generate and Order Moves ---
        let possibleMoves = orderMoves(getAllValidMovesForPlayer(currentBoard, player), currentBoard); // Moves for the current player (bot or human)
        if(ttMove) { const idx = possibleMoves.findIndex(m => m[0] === ttMove[0] && m[1] === ttMove[1]); if(idx > 0) { const [pMove] = possibleMoves.splice(idx, 1); possibleMoves.unshift(pMove); } else if (idx === -1) { ttMove = null; } }


        // --- Handle Pass Turn ---
        if (possibleMoves.length === 0) {
            // Check if opponent can also not move (game over)
            if (getAllValidMovesForPlayer(currentBoard, opponent).length === 0) {
                 return evaluateBoard(currentBoard, emptyCount, botPlayerColor); // Evaluate final board from bot's perspective
            }
            // Only opponent can move: recurse for opponent, *swap maximizing flag*, keep same depth
            return minimax(currentBoard, depth, alpha, beta, !isMaximizingPlayer);
        }

        // --- Recursive Search ---
        let bestScore = isMaximizingPlayer ? -Infinity : Infinity; // Bot maximizes, Human minimizes (relative to bot's score)
        let bestMoveForNode = possibleMoves[0];
        let originalAlpha = alpha; // For TT flag check
        let originalBeta = beta;   // For TT flag check

        for (const [r, c] of possibleMoves) {
            const boardCopy = currentBoard.map(row => [...row]);
            makeSimulatedMove(boardCopy, r, c, player); // Simulate move for current player
            // Recurse for the *opponent*, swapping the maximizing flag
            const score = minimax(boardCopy, depth - 1, alpha, beta, !isMaximizingPlayer);

            if (isMaximizingPlayer) { // Bot's turn (maximizing bot's score)
                if (score > bestScore) { bestScore = score; bestMoveForNode = [r,c]; }
                alpha = Math.max(alpha, bestScore);
                if (beta <= alpha) break; // Beta cutoff
            } else { // Human's turn (minimizing bot's score)
                if (score < bestScore) { bestScore = score; bestMoveForNode = [r,c]; }
                beta = Math.min(beta, bestScore);
                if (beta <= alpha) break; // Alpha cutoff
            }
        }

        // --- Store Result in Transposition Table ---
        let ttFlag;
        if(bestScore <= originalAlpha) { ttFlag = TT_FLAG_UPPERBOUND; } // Failed low (upper bound for score)
        else if (bestScore >= originalBeta) { ttFlag = TT_FLAG_LOWERBOUND; } // Failed high (lower bound for score)
        else { ttFlag = TT_FLAG_EXACT; } // Score is within the alpha-beta window

        if (!ttEntry || depth >= ttEntry.depth) {
             transpositionTable[boardKey] = { score: bestScore, depth: depth, flag: ttFlag, bestMove: bestMoveForNode };
        }

        return bestScore;
    }


    // --- AI Helper Functions ---
    function makeSimulatedMove(boardState, r, c, player) { const flips = getFlipsForBoard(boardState, r, c, player); boardState[r][c] = player; flips.forEach(([fr, fc]) => { boardState[fr][fc] = player; }); }
    function countEmpty(boardState) { let c = 0; for(let r=0;r<8;r++) for(let C=0;C<8;C++) if(boardState[r][C]===EMPTY) c++; return c; }
    function isGameOver(boardToCheck) { return getAllValidMovesForPlayer(boardToCheck, BLACK).length === 0 && getAllValidMovesForPlayer(boardToCheck, WHITE).length === 0; }
    function getFlipsForBoard(boardToCheck, r, c, player) { const o = getOpponent(player); let fl = []; if (!isValid(r,c) || boardToCheck[r][c] !== EMPTY) return []; for (const [dr, dc] of directions) { let cf = []; let nr = r + dr; let nc = c + dc; while (isValid(nr, nc) && boardToCheck[nr][nc] === o) { cf.push([nr, nc]); nr += dr; nc += dc; } if (isValid(nr, nc) && boardToCheck[nr][nc] === player && cf.length > 0) { fl = fl.concat(cf); } } return fl; }
    function getAllValidMovesForPlayer(boardToCheck, player) { let m = []; for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(boardToCheck[r][c]===EMPTY && getFlipsForBoard(boardToCheck, r, c, player).length > 0) m.push([r, c]); return m; }
    function boardToString(boardState) { return boardState.flat().join(''); }
    function orderMoves(moves, boardState) { const scoredMoves = moves.map(([r, c]) => ({ move: [r, c], score: positionalWeights[r][c] })); scoredMoves.sort((a, b) => b.score - a.score); return scoredMoves.map(item => item.move); }

    // Modified evaluateBoard to accept botPlayerColor and evaluate from its perspective
    function evaluateBoard(boardToEvaluate, emptyCount, botPlayerColor) {
        const humanPlayerColor = getOpponent(botPlayerColor);

        // --- Endgame Exact Score ---
        if (isGameOver(boardToEvaluate)) {
            let botPieces = 0; let humanPieces = 0;
            boardToEvaluate.flat().forEach(p => {
                if (p === botPlayerColor) botPieces++;
                else if (p === humanPlayerColor) humanPieces++;
            });
            // Return score difference from the perspective of the bot
            return (botPieces - humanPieces) * EXACT_SCORE_FACTOR;
        }

        // --- Heuristic Components ---
        let botPositional = 0, humanPositional = 0;
        let botFrontier = 0, humanFrontier = 0;
        let botSafe = 0, humanSafe = 0;
        const corners = [[0,0], [0,7], [7,0], [7,7]];

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const piece = boardToEvaluate[r][c];
                if (piece === EMPTY) continue;

                let isCorner = corners.some(corner => corner[0] === r && corner[1] === c);
                let isSafe = isCorner; // Simplistic: only corners are safe

                if (piece === botPlayerColor) { // Bot's pieces
                    botPositional += positionalWeights[r][c];
                    if (isSafe) botSafe++;
                    for (const [dr, dc] of directions) { if (isValid(r+dr, c+dc) && boardToEvaluate[r+dr][c+dc] === EMPTY) { botFrontier++; break; } }
                } else { // Opponent's pieces (Human)
                    humanPositional += positionalWeights[r][c];
                    if (isSafe) humanSafe++;
                    for (const [dr, dc] of directions) { if (isValid(r+dr, c+dc) && boardToEvaluate[r+dr][c+dc] === EMPTY) { humanFrontier++; break; } }
                }
            }
        }

        // --- Calculate Mobility ---
        const botMoves = getAllValidMovesForPlayer(boardToEvaluate, botPlayerColor).length;
        const humanMoves = getAllValidMovesForPlayer(boardToEvaluate, humanPlayerColor).length;

        // --- Determine Game Phase ---
        let phase;
        if (emptyCount > 40) phase = 1;
        else if (emptyCount > ENDGAME_DEPTH_LIMIT) phase = 2;
        else phase = 3;

        // --- Assign Weights Based on Phase ---
        let posW, mobW, frontW, stabW, parityW;
        if (phase === 1) { posW = 10; mobW = 200; frontW = -75; stabW = 1000; parityW = 10; }
        else if (phase === 2) { posW = 15; mobW = 150; frontW = -50; stabW = 1200; parityW = 150; }
        else { posW = 20; mobW = 100; frontW = -10; stabW = 1500; parityW = 500; }

        // --- Calculate Component Scores (always from bot's perspective) ---
        let positionalScore = posW * (botPositional - humanPositional);
        let stabilityScore = stabW * (botSafe - humanSafe);
        let frontierScore = frontW * (botFrontier - humanFrontier); // Higher frontier is bad

        let mobilityScore = 0;
        if (botMoves + humanMoves !== 0) {
             mobilityScore = mobW * (botMoves - humanMoves); // Bot wants more moves than human
        }
        // Bonus/penalty if one player has zero moves
        if (phase > 1) {
             if (botMoves > 0 && humanMoves === 0) mobilityScore += mobW * 1.5; // Bonus if human must pass
             if (humanMoves > 0 && botMoves === 0) mobilityScore -= mobW * 1.5; // Penalty if bot must pass
        }

        // Parity Score: Bot (maximizer) wants the last move. Last move happens when emptyCount is 1.
        // If emptyCount is odd *now*, the current player will get the last move.
        // If emptyCount is even *now*, the opponent will get the last move.
        // Evaluation happens *after* a move is simulated.
        // We need to know whose turn it *would* be next. This isn't easily known here.
        // Simplified parity: Assume bot wants even remaining squares *after its move*.
        // So, if emptyCount is ODD now, bot gets a bonus.
        let parityScore = (emptyCount % 2 !== 0) ? parityW : -parityW; // Bonus to BOT if odd squares remain (meaning bot likely gets last move)


        // --- Combine Heuristics ---
        let finalScore = positionalScore + mobilityScore + stabilityScore + frontierScore + parityScore;

        // Evaluation is from the perspective of the botPlayerColor
        return finalScore;
    }


}); 