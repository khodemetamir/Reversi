document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    // (Keep all existing DOM element references from the previous version)
    const bodyElement = document.body;
    const boardElement = document.getElementById('board');
    const scoreElement = document.getElementById('score');
    const turnElement = document.getElementById('turn');
    const menuElement = document.getElementById('menu');
    const gameAreaElement = document.getElementById('game-area');
    const multiplayerBtn = document.getElementById('multiplayer-btn');
    const botBtn = document.getElementById('bot-btn');
    const gameOverMessageElement = document.getElementById('game-over-message');
    const restartBtn = document.getElementById('restart-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = settingsModal.querySelector('.close-btn');
    const themeChoiceButtons = settingsModal.querySelectorAll('.theme-choice');
    const backToMenuBtn = document.getElementById('back-to-menu-btn');

    // --- Constants ---
    const BOARD_SIZE = 8;
    const EMPTY = 0;
    const BLACK = 1; // Human in Bot mode
    const WHITE = 2; // Bot in Bot mode
    const MAX_ITERATIVE_DEPTH = 6; // Start search up to this depth (can increase if performance allows)
    const ENDGAME_DEPTH_LIMIT = 14; // When <= this many empty squares, search *fully* if possible
    const EXACT_SCORE_FACTOR = 1000; // Multiplier for win/loss scores in endgame

    // --- Game State ---
    let board = [];
    let currentPlayer;
    let gameMode = null;
    let gameOver = false;
    let validMoves = [];
    let scores = { [BLACK]: 0, [WHITE]: 0 };
    let moveHistory = []; // For tracking moves if needed

    // --- AI Specific State ---
    let transpositionTable = {}; // Store evaluated states { boardString: { score, depth, flag } }
    const TT_FLAG_EXACT = 0;
    const TT_FLAG_LOWERBOUND = 1; // Alpha
    const TT_FLAG_UPPERBOUND = 2; // Beta
    let nodesEvaluated = 0; // Counter for performance analysis

    // --- Opening Book (Simple Example) ---
    // Maps board state string to best move [r, c] for WHITE
    const openingBook = {
        // Example: After Black plays F5 (default opening) -> White plays C4 is common
        '0000000000000000000120000001210000021100000000000000000000000000': [3, 2], // -> C4
        // Add more opening lines as needed...
        // Key format: 64 digits representing the board (0=Empty, 1=Black, 2=White)
    };


    // --- Directions & Positional Weights (Keep from previous) ---
    const directions = [
        [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]
    ];
    // prettier-ignore
    const positionalWeights = [
        [ 500, -150, 30, 10, 10, 30, -150,  500], // Corners high, C/X squares low
        [-150, -250,  0,  0,  0,  0, -250, -150],
        [  30,    0,  1,  2,  2,  1,    0,   30],
        [  10,    0,  2, 16, 16,  2,    0,   10], // Center high-ish
        [  10,    0,  2, 16, 16,  2,    0,   10],
        [  30,    0,  1,  2,  2,  1,    0,   30],
        [-150, -250,  0,  0,  0,  0, -250, -150],
        [ 500, -150, 30, 10, 10, 30, -150,  500]
    ];

    // --- Initialization & Event Listeners ---
    loadTheme();
    setupEventListeners();

    function setupEventListeners() {
        // (Keep all event listeners from the previous version)
        multiplayerBtn.addEventListener('click', () => initGame('multiplayer'));
        botBtn.addEventListener('click', () => initGame('bot'));
        restartBtn.addEventListener('click', handleRestart);
        settingsBtn.addEventListener('click', openSettingsModal);
        closeModalBtn.addEventListener('click', closeSettingsModal);
        settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettingsModal(); });
        themeChoiceButtons.forEach(button => button.addEventListener('click', handleThemeChange));
        backToMenuBtn.addEventListener('click', goBackToMenu);
    }

    function initGame(mode) {
        console.log(`Initializing game: ${mode}, Max Depth: ${MAX_ITERATIVE_DEPTH}, Endgame Depth: ${ENDGAME_DEPTH_LIMIT}`);
        gameMode = mode;
        menuElement.classList.add('hidden');
        settingsModal.classList.add('hidden');
        gameAreaElement.classList.remove('hidden');
        gameOverMessageElement.classList.add('hidden');
        restartBtn.classList.add('hidden');
        gameOver = false;
        board = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(EMPTY));
        moveHistory = [];
        transpositionTable = {}; // Clear TT on new game

        const mid = BOARD_SIZE / 2;
        board[mid - 1][mid - 1] = WHITE;
        board[mid - 1][mid] = BLACK;
        board[mid][mid - 1] = BLACK;
        board[mid][mid] = WHITE;

        currentPlayer = BLACK;
        updateScores();
        findAllValidMoves();
        renderBoard();
        updateTurnDisplay();
    }

    function handleRestart() {
        if (gameMode) initGame(gameMode); else goBackToMenu();
    }

    function goBackToMenu() {
        gameAreaElement.classList.add('hidden');
        gameOverMessageElement.classList.add('hidden');
        restartBtn.classList.add('hidden');
        menuElement.classList.remove('hidden');
        gameMode = null;
    }

    // --- Settings & Theme Logic ---
    // (Keep functions: openSettingsModal, closeSettingsModal, handleThemeChange, applyTheme, saveTheme, loadTheme, updateActiveThemeButton from previous version)
    function openSettingsModal() { settingsModal.classList.remove('hidden'); updateActiveThemeButton(); }
    function closeSettingsModal() { settingsModal.classList.add('hidden'); }
    function handleThemeChange(event) { const theme = event.target.dataset.theme; applyTheme(theme); saveTheme(theme); updateActiveThemeButton(theme); }
    function applyTheme(themeName) { bodyElement.className = ''; bodyElement.classList.add(themeName); console.log("Applied theme:", themeName); }
    function saveTheme(themeName) { localStorage.setItem('othelloTheme', themeName); }
    function loadTheme() { const savedTheme = localStorage.getItem('othelloTheme') || 'theme-default'; applyTheme(savedTheme); }
    function updateActiveThemeButton(activeTheme = null) { if (!activeTheme) activeTheme = localStorage.getItem('othelloTheme') || 'theme-default'; themeChoiceButtons.forEach(b => { b.classList.toggle('active', b.dataset.theme === activeTheme); }); }


    // --- Rendering Logic ---
    // (Keep functions: renderBoard, updateScores, updateTurnDisplay from previous version, ensuring renderBoard adds click listeners correctly)
    function renderBoard() {
        boardElement.innerHTML = ''; // Clear previous board
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const square = document.createElement('div');
                square.classList.add('square');
                square.dataset.row = r; square.dataset.col = c;
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
                        square.addEventListener('click', handleSquareClick);
                    }
                }
                 boardElement.appendChild(square);
            }
        }
    }
    function updateScores() { /* ... same as before ... */ scores[BLACK]=0; scores[WHITE]=0; board.flat().forEach(p => {if(p===BLACK)scores[BLACK]++; else if(p===WHITE)scores[WHITE]++;}); scoreElement.textContent = `Black: ${scores[BLACK]} - White: ${scores[WHITE]}`; }
    function updateTurnDisplay() { /* ... same as before ... */ if(gameOver) return; let txt=`Turn: ${currentPlayer===BLACK?'Black':'White'}`; if(gameMode==='bot'&&currentPlayer===WHITE) txt+=" (Bot thinking...)"; turnElement.textContent=txt;}


    // --- Game Logic ---
    function handleSquareClick(event) {
        if (gameOver || (gameMode === 'bot' && currentPlayer === WHITE)) return;
        const square = event.currentTarget;
        const r = parseInt(square.dataset.row);
        const c = parseInt(square.dataset.col);
        if (isValidMove(r, c, currentPlayer)) {
            makeMove(r, c);
        }
    }

    function makeMove(r, c) {
        if (gameOver) return;
        const playerMakingMove = currentPlayer;
        const piecesToFlip = getFlips(r, c, playerMakingMove);

        if (board[r][c] !== EMPTY || piecesToFlip.length === 0) return; // Invalid move check

        // Apply move
        board[r][c] = playerMakingMove;
        piecesToFlip.forEach(([fr, fc]) => { board[fr][fc] = playerMakingMove; });
        moveHistory.push({ player: playerMakingMove, move: [r, c], board: boardToString(board) }); // Record move

        updateScores();
        switchPlayer(); // Includes finding next moves and checking game end

        renderBoard();
        updateTurnDisplay();

        // Trigger Bot move if applicable
        if (!gameOver && gameMode === 'bot' && currentPlayer === WHITE) {
            updateTurnDisplay(); // Show "Bot thinking..."
            setTimeout(makeBotMove, 50); // Short delay for UI update
        }
    }

    function switchPlayer() {
        // (Keep logic from previous version: switch player, check for passes, check game end)
        const previousPlayer = currentPlayer;
        currentPlayer = getOpponent(previousPlayer);
        findAllValidMoves();

        if (validMoves.length === 0) { // Pass detected
             currentPlayer = getOpponent(currentPlayer); // Switch back
             findAllValidMoves();
             if (validMoves.length === 0) { // Both players have no moves
                 endGame(); return;
             }
        }
        // Check for full board
        if (!gameOver && scores[BLACK] + scores[WHITE] === BOARD_SIZE * BOARD_SIZE) {
             endGame();
        }
    }

    function isValid(r, c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }
    function getOpponent(player) { return player === BLACK ? WHITE : BLACK; }
    function getFlips(r, c, player) { return getFlipsForBoard(board, r, c, player); }
    function isValidMove(r, c, player) { return validMoves.some(move => move[0] === r && move[1] === c); }
    function findAllValidMoves() { validMoves = getAllValidMovesForPlayer(board, currentPlayer); }

    function endGame() {
        // (Keep logic from previous version: set gameOver, display winner, show restart button)
        if(gameOver) return;
        gameOver = true;
        let winnerMessage;
        if (scores[BLACK] > scores[WHITE]) winnerMessage = `Black Wins! (${scores[BLACK]} - ${scores[WHITE]})`;
        else if (scores[WHITE] > scores[BLACK]) winnerMessage = `White Wins! (${scores[WHITE]} - ${scores[BLACK]})`;
        else winnerMessage = `It's a Draw! (${scores[BLACK]} - ${scores[WHITE]})`;
        gameOverMessageElement.textContent = winnerMessage;
        gameOverMessageElement.classList.remove('hidden');
        turnElement.textContent = "Game Over";
        restartBtn.classList.remove('hidden');
        renderBoard(); // Update board to remove indicators
    }

    // --- String Conversion for TT ---
    function boardToString(boardState) {
        return boardState.flat().join('');
    }


    // ========================================================================
    // ========================== ADVANCED AI SECTION =========================
    // ========================================================================

    function makeBotMove() {
        if (gameOver || currentPlayer !== WHITE) return;
        nodesEvaluated = 0; // Reset counter
        console.time("Bot Move Calculation");

        // --- Opening Book Check ---
        const currentBoardStr = boardToString(board);
        if (openingBook[currentBoardStr]) {
            const [r, c] = openingBook[currentBoardStr];
            console.log("Bot playing from Opening Book:", [r, c]);
             if (isValidMove(r, c, WHITE)) { // Ensure book move is valid in current state
                console.timeEnd("Bot Move Calculation");
                makeMove(r,c);
                return;
            } else {
                 console.warn("Opening book move invalid, proceeding with search.");
            }
        }

        // --- Iterative Deepening Search ---
        let bestMove = null;
        let bestScore = -Infinity;
        let currentAlpha = -Infinity;
        let currentBeta = Infinity;

        const possibleMoves = orderMoves(getAllValidMovesForPlayer(board, WHITE), board); // Get ordered moves
        if (possibleMoves.length === 0) {
             console.error("Bot has no moves! Should have been handled by switchPlayer.");
             console.timeEnd("Bot Move Calculation");
             // Attempt recovery or end game
             if(getAllValidMovesForPlayer(board, BLACK).length === 0) endGame(); else switchPlayer();
             renderBoard(); updateTurnDisplay();
             return;
        }

        // Determine dynamic depth based on empty squares
        const emptySquares = countEmpty(board);
        const depthLimit = (emptySquares <= ENDGAME_DEPTH_LIMIT)
                           ? Math.max(MAX_ITERATIVE_DEPTH, emptySquares) // Search fully in endgame
                           : MAX_ITERATIVE_DEPTH;
        console.log(`Starting search. Empty: ${emptySquares}. Effective Depth Limit: ${depthLimit}`);


        for (let depth = 1; depth <= depthLimit; depth++) {
             console.log(`Iterative Deepening: Depth ${depth}`);
             let currentBestMoveForDepth = null;
             let currentBestScoreForDepth = -Infinity;

            for (const [r, c] of possibleMoves) { // Use ordered moves
                const boardCopy = board.map(row => [...row]);
                makeSimulatedMove(boardCopy, r, c, WHITE);

                const score = minimax(boardCopy, depth - 1, currentAlpha, currentBeta, false); // Start search for opponent

                if (score > currentBestScoreForDepth) {
                    currentBestScoreForDepth = score;
                    currentBestMoveForDepth = [r, c];
                     // In iterative deepening, update the overall best move found so far at any depth
                    bestMove = currentBestMoveForDepth;
                    bestScore = currentBestScoreForDepth; // Update overall best score
                }
                // Update alpha for subsequent sibling searches at this depth (within the loop)
                currentAlpha = Math.max(currentAlpha, currentBestScoreForDepth);

                // *** Note: Alpha-beta pruning doesn't prune between depths in simple iterative deepening,
                // but pruning *within* each depth level in the minimax call is still crucial.
                // A more advanced technique (aspiration windows) could use results from shallower depths
                // to narrow alpha-beta bounds for deeper searches, but adds complexity.
            }
             console.log(`Depth ${depth} complete. Best score: ${currentBestScoreForDepth}, Move: ${currentBestMoveForDepth}, Total Nodes: ${nodesEvaluated}`);
              // Reorder moves for the *next* depth based on scores from *this* depth
              possibleMoves.sort((a, b) => {
                  // This requires storing scores per move at each depth, more complex setup.
                  // For now, rely on initial ordering + TT hits.
                  return 0; // Placeholder - keep initial order for now
              });

              // Reset alpha/beta for the next depth iteration? Typically yes for simple ID.
               currentAlpha = -Infinity;
               currentBeta = Infinity;
        }


        console.timeEnd("Bot Move Calculation");
        console.log(`Final Best Move: ${bestMove}, Score: ${bestScore}, Nodes Evaluated: ${nodesEvaluated}`);

        if (bestMove) {
            makeMove(bestMove[0], bestMove[1]);
        } else if (possibleMoves.length > 0) {
            console.warn("Minimax finished without finding a best move, using first valid move.");
            makeMove(possibleMoves[0][0], possibleMoves[0][1]); // Fallback
        } else {
             console.error("Bot has no possible moves after search, logic error likely.");
             // End game or pass turn if possible
             if(getAllValidMovesForPlayer(board, BLACK).length === 0) endGame(); else switchPlayer();
        }
    }

    function minimax(currentBoard, depth, alpha, beta, isMaximizingPlayer) {
        nodesEvaluated++;
        const boardKey = boardToString(currentBoard);
        const player = isMaximizingPlayer ? WHITE : BLACK;
        const emptyCount = countEmpty(currentBoard); // Needed for endgame check/depth adjustment

        // --- Transposition Table Lookup ---
        const ttEntry = transpositionTable[boardKey];
        if (ttEntry && ttEntry.depth >= depth) {
            if (ttEntry.flag === TT_FLAG_EXACT) return ttEntry.score;
            if (ttEntry.flag === TT_FLAG_LOWERBOUND) alpha = Math.max(alpha, ttEntry.score);
            if (ttEntry.flag === TT_FLAG_UPPERBOUND) beta = Math.min(beta, ttEntry.score);
            if (alpha >= beta) return ttEntry.score; // Cutoff based on TT entry
        }

        // --- Base Cases (Depth Limit or Game Over) ---
        if (depth === 0 || isGameOver(currentBoard)) {
             // Use evaluateBoard, which handles exact scores if game is over
            return evaluateBoard(currentBoard, emptyCount);
        }

        // --- Generate and Order Moves ---
        const possibleMoves = orderMoves(getAllValidMovesForPlayer(currentBoard, player), currentBoard);

        // --- Handle Pass Turn ---
        if (possibleMoves.length === 0) {
            // Check if opponent also has no moves (game really over)
            if (getAllValidMovesForPlayer(currentBoard, getOpponent(player)).length === 0) {
                 return evaluateBoard(currentBoard, emptyCount); // Evaluate final board
            }
            // Only opponent can move, recurse for opponent, *don't decrease depth* for a pass
            return minimax(currentBoard, depth, alpha, beta, !isMaximizingPlayer);
        }

        // --- Recursive Search ---
        let bestScore = isMaximizingPlayer ? -Infinity : Infinity;
        let ttFlag = TT_FLAG_LOWERBOUND; // Assume we'll find a score > alpha (initially -inf)

        for (const [r, c] of possibleMoves) {
            const boardCopy = currentBoard.map(row => [...row]);
            makeSimulatedMove(boardCopy, r, c, player); // Simulate the move
            const score = minimax(boardCopy, depth - 1, alpha, beta, !isMaximizingPlayer);

            if (isMaximizingPlayer) {
                bestScore = Math.max(bestScore, score);
                alpha = Math.max(alpha, bestScore);
                if (beta <= alpha) { // Beta cutoff
                    ttFlag = TT_FLAG_LOWERBOUND; // Score is at least beta
                    break;
                }
                ttFlag = TT_FLAG_EXACT; // Found a score between alpha and beta
            } else { // Minimizing Player
                bestScore = Math.min(bestScore, score);
                beta = Math.min(beta, bestScore);
                if (beta <= alpha) { // Alpha cutoff
                    ttFlag = TT_FLAG_UPPERBOUND; // Score is at most alpha
                    break;
                }
                 ttFlag = TT_FLAG_EXACT; // Found a score between alpha and beta
            }
        }

        // --- Store Result in Transposition Table ---
         transpositionTable[boardKey] = { score: bestScore, depth: depth, flag: ttFlag };

        return bestScore;
    }

    // --- AI Helper Functions ---

    function makeSimulatedMove(boardState, r, c, player) {
         // Assumes move is valid; simulates placing and flipping on the given boardState
         const flips = getFlipsForBoard(boardState, r, c, player);
         boardState[r][c] = player;
         flips.forEach(([fr, fc]) => { boardState[fr][fc] = player; });
     }

     function countEmpty(boardState) {
        let count = 0;
        for (let r=0; r<BOARD_SIZE; r++) {
            for (let c=0; c<BOARD_SIZE; c++) {
                if (boardState[r][c] === EMPTY) count++;
            }
        }
        return count;
     }


    function isGameOver(boardToCheck) {
        // Game is over if NEITHER player has any valid moves
        const blackMoves = getAllValidMovesForPlayer(boardToCheck, BLACK).length;
        if (blackMoves > 0) return false; // Black can move, not over
        const whiteMoves = getAllValidMovesForPlayer(boardToCheck, WHITE).length;
        if (whiteMoves > 0) return false; // White can move, not over
        return true; // Neither can move
    }

    // (Keep getFlipsForBoard and getAllValidMovesForPlayer from previous advanced version)
    function getFlipsForBoard(boardToCheck, r, c, player) {
         const opponent = getOpponent(player); let allFlips = [];
         if (!isValid(r,c) || boardToCheck[r][c] !== EMPTY) return [];
         for (const [dr, dc] of directions) {
             let currentFlips = []; let nr = r + dr; let nc = c + dc;
             while (isValid(nr, nc) && boardToCheck[nr][nc] === opponent) { currentFlips.push([nr, nc]); nr += dr; nc += dc; }
             if (isValid(nr, nc) && boardToCheck[nr][nc] === player && currentFlips.length > 0) { allFlips = allFlips.concat(currentFlips); }
         } return allFlips;
    }
    function getAllValidMovesForPlayer(boardToCheck, player) {
        let moves = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (boardToCheck[r][c] === EMPTY && getFlipsForBoard(boardToCheck, r, c, player).length > 0) {
                    moves.push([r, c]);
                }
            }
        }
        return moves;
    }

    // --- Move Ordering Heuristic ---
    function orderMoves(moves, boardState) {
        const scoredMoves = moves.map(([r, c]) => {
            let score = 0;
            // Prioritize corners
            if ((r === 0 || r === 7) && (c === 0 || c === 7)) score += 1000;
            // Penalize C/X squares if adjacent corner is empty
            const corners = [[0,0],[0,7],[7,0],[7,7]];
            const adjacentCorners = [[-1,-1],[-1,1],[1,-1],[1,1]]; // Relative to C/X
            if((r === 1 || r === 6) && (c === 1 || c === 6)) { // If it's an X square (1,1), (1,6), (6,1), (6,6)
                 for(const [i, ac] of adjacentCorners.entries()) {
                     const cornerR = r + ac[0]; const cornerC = c + ac[1];
                     if(boardState[cornerR][cornerC] === EMPTY) { score -= 200; break;} // Heavy penalty if adjacent corner is empty
                 }
            }
             if(((r === 0 || r === 7) && (c === 1 || c === 6)) || ((r === 1 || r === 6) && (c === 0 || c === 7))) { // If it's a C square
                  for(const corner of corners) {
                      if((Math.abs(r-corner[0]) <= 1 && c === corner[1]) || (Math.abs(c-corner[1]) <= 1 && r === corner[0])) { // Adjacent corner check
                         if(boardState[corner[0]][corner[1]] === EMPTY){ score -= 200; break; }
                      }
                  }
             }
            // Add positional weight from the map
            score += positionalWeights[r][c];
            // Add bonus for number of flips (less important than position)
            // score += getFlipsForBoard(boardState, r, c, WHITE).length; // Assume ordering for WHITE
            return { move: [r, c], score: score };
        });

        scoredMoves.sort((a, b) => b.score - a.score); // Sort descending by score
        return scoredMoves.map(item => item.move);
    }

    // ========================================================================
    // ============= ADVANCED HEURISTIC EVALUATION FUNCTION ===================
    // ========================================================================
    function evaluateBoard(boardToEvaluate, emptyCount) {

        // --- Endgame Exact Score ---
        // If the game is definitively over (or search reaches a terminal node in endgame)
         if (isGameOver(boardToEvaluate)) {
             let whitePieceCount = 0; let blackPieceCount = 0;
             boardToEvaluate.flat().forEach(p => {if(p===WHITE) whitePieceCount++; else if (p===BLACK) blackPieceCount++;});
             // Return a large score representing win/loss/draw, scaled by piece difference
             return (whitePieceCount - blackPieceCount) * EXACT_SCORE_FACTOR;
         }


        // --- Heuristic Components ---
        let whitePositional = 0, blackPositional = 0;
        let whiteFrontier = 0, blackFrontier = 0;
        let whiteSafe = 0, blackSafe = 0; // Count of "safe" discs (corners + potentially stable edges)

        // --- Calculate Positional, Frontier, Basic Stability ---
        const corners = [[0,0], [0,7], [7,0], [7,7]];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const piece = boardToEvaluate[r][c];
                if (piece === EMPTY) continue;

                let isCorner = corners.some(corner => corner[0] === r && corner[1] === c);
                 let isSafe = isCorner; // Corners are always safe

                 // TODO: Add more sophisticated edge/internal stability checks here if needed
                 // Example: Check if an edge piece is safe (requires checking whole line to corner)


                if (piece === WHITE) {
                    whitePositional += positionalWeights[r][c];
                    if(isSafe) whiteSafe++;
                    // Frontier Check
                    for (const [dr, dc] of directions) {
                        if (isValid(r+dr, c+dc) && boardToEvaluate[r+dr][c+dc] === EMPTY) {
                            whiteFrontier++; break;
                        }
                    }
                } else { // BLACK
                    blackPositional += positionalWeights[r][c];
                    if(isSafe) blackSafe++;
                     // Frontier Check
                     for (const [dr, dc] of directions) {
                         if (isValid(r+dr, c+dc) && boardToEvaluate[r+dr][c+dc] === EMPTY) {
                             blackFrontier++; break;
                         }
                     }
                }
            }
        }

        // --- Calculate Mobility ---
        const whiteMoves = getAllValidMovesForPlayer(boardToEvaluate, WHITE).length;
        const blackMoves = getAllValidMovesForPlayer(boardToEvaluate, BLACK).length;


        // --- Determine Game Phase ---
        // const totalPieces = BOARD_SIZE * BOARD_SIZE - emptyCount;
        let phase; // 1=Early, 2=Mid, 3=Late
        if (emptyCount > 40) phase = 1;      // Early Game (approx < 24 pieces)
        else if (emptyCount > 12) phase = 2; // Mid Game
        else phase = 3;                      // Late Game / Endgame

        // --- Assign Weights Based on Phase ---
        let positionalWeight, mobilityWeight, frontierWeight, stabilityWeight, parityWeight;

        if (phase === 1) { // Early Game: Focus on position, mobility, limiting opponent options
            positionalWeight = 10;
            mobilityWeight = 200;
            frontierWeight = -50; // Penalize exposed pieces
            stabilityWeight = 300; // Corners highly valuable early
            parityWeight = 0; // Parity less relevant early
        } else if (phase === 2) { // Mid Game: Balance everything
             positionalWeight = 15;
             mobilityWeight = 150;
             frontierWeight = -30;
             stabilityWeight = 350; // Stability still key
             parityWeight = 50; // Start considering who gets last moves
        } else { // Late Game / Endgame: Focus on maximizing final diff, stability, parity
             positionalWeight = 20; // Absolute position matters less than final count
             mobilityWeight = 100; // Still matters for final moves
             frontierWeight = -10;
             stabilityWeight = 500; // Crucial for securing discs
             parityWeight = 300; // Very important - who controls final empty squares
        }

        // --- Calculate Component Scores ---
        let positionalScore = positionalWeight * (whitePositional - blackPositional);
        let stabilityScore = stabilityWeight * (whiteSafe - blackSafe);
        let frontierScore = frontierWeight * (whiteFrontier - blackFrontier);

        // Mobility Score: Normalized difference to prevent huge swings
        let mobilityScore = 0;
        if (whiteMoves + blackMoves !== 0) {
             mobilityScore = mobilityWeight * (whiteMoves - blackMoves) / (whiteMoves + blackMoves + 1); // Normalize
        } // If both 0, game over, handled above

        // Parity Score (Simple): Focus on who gets the *last* move overall (approximated by odd/even empty squares)
        // A more complex version would analyze regions.
        // If emptyCount is odd, the current player (whose turn it *would* be next if game not over) gets last move.
        // Let's assume minimax calls evaluateBoard for the player *whose turn it just was*.
        // If emptyCount is odd, the *next* player gets the last move.
        // We want WHITE (maximizer) to have last move if emptyCount is odd.
        let parityScore = 0;
         if (phase > 1) { // Only relevant mid/late game
             // Who is the *next* theoretical player? If isMaximizingPlayer was true in the calling minimax frame, the next player is black (minimizer). If false, next is white (maximizer).
             // This is tricky. Simpler: Just give bonus to white if empty is odd?
            parityScore = (emptyCount % 2 === 1) ? parityWeight : -parityWeight; // Bonus for WHITE if odd empty squares remain
         }


        // --- Combine Scores ---
        let finalScore = positionalScore + mobilityScore + stabilityScore + frontierScore + parityScore;

        // Ensure final score is relative to WHITE (the maximizing player)
        return finalScore;
    }


    // --- Utility Functions (Keep shuffleArray if used) ---
    // function shuffleArray(array) { ... }

}); // End DOMContentLoaded