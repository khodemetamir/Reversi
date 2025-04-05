document.addEventListener('DOMContentLoaded', () => {
    const boardElement = document.getElementById('board');
    const scoreElement = document.getElementById('score');
    const turnElement = document.getElementById('turn');
    const menuElement = document.getElementById('menu');
    const gameAreaElement = document.getElementById('game-area');
    const multiplayerBtn = document.getElementById('multiplayer-btn');
    const botBtn = document.getElementById('bot-btn');
    const gameOverMessageElement = document.getElementById('game-over-message');
    const restartBtn = document.getElementById('restart-btn');

    const BOARD_SIZE = 8;
    const EMPTY = 0;
    const BLACK = 1;
    const WHITE = 2;
    const MINIMAX_DEPTH = 4; // Adjust for desired difficulty/performance trade-off

    let board = [];
    let currentPlayer;
    let gameMode = null; // 'multiplayer' or 'bot'
    let gameOver = false;
    let validMoves = [];
    let scores = { [BLACK]: 0, [WHITE]: 0 };

    const directions = [
        [-1, -1], [-1, 0], [-1, 1], // Above
        [ 0, -1],          [ 0, 1], // Sides
        [ 1, -1], [ 1, 0], [ 1, 1]  // Below
    ];

    // --- Game Setup ---

    function initGame(mode) {
        gameMode = mode;
        menuElement.classList.add('hidden');
        gameAreaElement.classList.remove('hidden');
        gameOverMessageElement.classList.add('hidden');
        restartBtn.classList.add('hidden'); // Hide restart button initially
        gameOver = false;
        board = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(EMPTY));

        // Initial pieces
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

        if (gameMode === 'bot' && currentPlayer === WHITE) { // If bot plays white (usually second)
            // Bot doesn't move first unless explicitly set
        }
    }

    multiplayerBtn.addEventListener('click', () => initGame('multiplayer'));
    botBtn.addEventListener('click', () => initGame('bot'));
    restartBtn.addEventListener('click', () => {
        // Simply re-show the menu to choose mode again
        gameAreaElement.classList.add('hidden');
        menuElement.classList.remove('hidden');
    });

    // --- Rendering ---

    function renderBoard() {
        boardElement.innerHTML = ''; // Clear previous board
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const square = document.createElement('div');
                square.classList.add('square');
                square.dataset.row = r;
                square.dataset.col = c;

                const pieceVal = board[r][c];
                if (pieceVal !== EMPTY) {
                    const piece = document.createElement('div');
                    piece.classList.add('piece');
                    piece.classList.add(pieceVal === BLACK ? 'black-piece' : 'white-piece');
                    square.appendChild(piece);
                } else {
                    // Check if this empty square is a valid move for the current player
                    const isMoveValid = validMoves.some(move => move[0] === r && move[1] === c);
                    if (isMoveValid && !gameOver) {
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

    function updateScores() {
        scores[BLACK] = 0;
        scores[WHITE] = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === BLACK) scores[BLACK]++;
                else if (board[r][c] === WHITE) scores[WHITE]++;
            }
        }
        scoreElement.textContent = `Black: ${scores[BLACK]} - White: ${scores[WHITE]}`;
    }

     function updateTurnDisplay() {
        if (gameOver) return; // Don't update if game is over

        let turnText = `Turn: ${currentPlayer === BLACK ? 'Black' : 'White'}`;
         if (gameMode === 'bot' && currentPlayer === WHITE) {
             turnText += " (Bot thinking...)";
         }
         turnElement.textContent = turnText;
     }


    // --- Game Logic ---

    function handleSquareClick(event) {
        if (gameOver) return;
        if (gameMode === 'bot' && currentPlayer === WHITE) return; // Prevent human clicks during bot's turn

        const square = event.currentTarget; // Use currentTarget to get the square div
        const r = parseInt(square.dataset.row);
        const c = parseInt(square.dataset.col);

        if (isValidMove(r, c, currentPlayer)) {
            makeMove(r, c);
        }
    }

    function makeMove(r, c) {
         if (gameOver) return;

         const piecesToFlip = getFlips(r, c, currentPlayer);
         if (piecesToFlip.length === 0) return; // Should not happen if called after validation, but safety check

         board[r][c] = currentPlayer; // Place the piece
         piecesToFlip.forEach(([fr, fc]) => {
             board[fr][fc] = currentPlayer; // Flip opponent pieces
         });

         updateScores();
         switchPlayer(); // This also recalculates valid moves for the new player
         renderBoard(); // Re-render after state change
         updateTurnDisplay();


         if (!gameOver && gameMode === 'bot' && currentPlayer === WHITE) {
             // Add a slight delay for the bot's move to feel more natural
             setTimeout(makeBotMove, 500);
         }
     }


    function switchPlayer() {
        currentPlayer = (currentPlayer === BLACK) ? WHITE : BLACK;
        findAllValidMoves();

        // If the new player has no valid moves, skip their turn
        if (validMoves.length === 0) {
             currentPlayer = (currentPlayer === BLACK) ? WHITE : BLACK; // Switch back
             findAllValidMoves();

             // If the original player ALSO has no valid moves, game over
             if (validMoves.length === 0) {
                 endGame();
             }
        }
         // Check if board is full
         if (!gameOver && scores[BLACK] + scores[WHITE] === BOARD_SIZE * BOARD_SIZE) {
              endGame();
         }
    }

    function isValid(r, c) {
        return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
    }

    function getOpponent(player) {
        return player === BLACK ? WHITE : BLACK;
    }

    function getFlips(r, c, player) {
        if (!isValid(r, c) || board[r][c] !== EMPTY) {
            return [];
        }

        const opponent = getOpponent(player);
        let allFlips = [];

        for (const [dr, dc] of directions) {
            let currentFlips = [];
            let nr = r + dr;
            let nc = c + dc;

            // Move in the direction as long as we see opponent pieces
            while (isValid(nr, nc) && board[nr][nc] === opponent) {
                currentFlips.push([nr, nc]);
                nr += dr;
                nc += dc;
            }

            // If we found the player's piece after the opponent's sequence
            if (isValid(nr, nc) && board[nr][nc] === player && currentFlips.length > 0) {
                allFlips = allFlips.concat(currentFlips);
            }
        }
        return allFlips;
    }

     function isValidMove(r, c, player) {
        // Optimization: Check if the square is already pre-calculated as valid
        return validMoves.some(move => move[0] === r && move[1] === c);
         // // Original check (kept for reference, but slower if called often)
         // return board[r][c] === EMPTY && getFlips(r, c, player).length > 0;
     }


    function findAllValidMoves() {
        validMoves = [];
        if (gameOver) return;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === EMPTY && getFlips(r, c, currentPlayer).length > 0) {
                    validMoves.push([r, c]);
                }
            }
        }
    }

     function endGame() {
         gameOver = true;
         let winnerMessage;
         if (scores[BLACK] > scores[WHITE]) {
             winnerMessage = `Black Wins! (${scores[BLACK]} - ${scores[WHITE]})`;
         } else if (scores[WHITE] > scores[BLACK]) {
             winnerMessage = `White Wins! (${scores[WHITE]} - ${scores[BLACK]})`;
         } else {
             winnerMessage = `It's a Draw! (${scores[BLACK]} - ${scores[WHITE]})`;
         }
         gameOverMessageElement.textContent = winnerMessage;
         gameOverMessageElement.classList.remove('hidden');
         turnElement.textContent = "Game Over"; // Update turn display
         restartBtn.classList.remove('hidden'); // Show restart button
     }


    // --- Bot AI (Minimax with Alpha-Beta Pruning) ---

    function makeBotMove() {
        if (gameOver || currentPlayer !== WHITE) return; // Only bot (White) makes moves here

        const bestMove = findBestMove();

        if (bestMove) {
            makeMove(bestMove[0], bestMove[1]);
        } else {
             // Should ideally not happen if switchPlayer logic is correct,
             // but handle case where Bot might have no moves (though switchPlayer should prevent this)
             console.error("Bot has no valid moves, but it's its turn?");
             switchPlayer(); // Try switching back if something went wrong
             renderBoard();
             updateTurnDisplay();
        }
    }

     function findBestMove() {
        let bestScore = -Infinity;
        let move = null;
        //findAllValidMoves(); // Ensure validMoves is up-to-date for the bot (WHITE)

        if (validMoves.length === 0) return null; // No moves available

         // Try corner moves first if available - strong heuristic
         const corners = [[0, 0], [0, BOARD_SIZE - 1], [BOARD_SIZE - 1, 0], [BOARD_SIZE - 1, BOARD_SIZE - 1]];
         for (const [r, c] of corners) {
             if (validMoves.some(vm => vm[0] === r && vm[1] === c)) {
                 console.log("Bot taking corner:", r, c);
                 return [r, c]; // Prioritize corners
             }
         }


        for (const [r, c] of validMoves) {
            const boardCopy = board.map(row => [...row]); // Deep copy
            const flips = getFlips(r, c, WHITE); // Get flips for this move

            boardCopy[r][c] = WHITE; // Make move on copy
            flips.forEach(([fr, fc]) => { boardCopy[fr][fc] = WHITE; });

            // Call minimax on the copied board for the opponent (BLACK - minimizing player)
            const score = minimax(boardCopy, MINIMAX_DEPTH - 1, -Infinity, Infinity, false); // Start one level down, minimizing player

            if (score > bestScore) {
                bestScore = score;
                move = [r, c];
            }
        }
        console.log("Bot chose move:", move, "with score:", bestScore);
        return move || validMoves[0]; // Return best move, or first valid if minimax fails
     }


     function minimax(currentBoard, depth, alpha, beta, isMaximizingPlayer) {
         // Terminal states
         if (depth === 0 || isGameOver(currentBoard)) {
             return evaluateBoard(currentBoard, isMaximizingPlayer ? WHITE : BLACK); // Evaluate from perspective of player whose turn it *would* be
         }

         const player = isMaximizingPlayer ? WHITE : BLACK;
         const opponent = getOpponent(player);
         const possibleMoves = getAllValidMovesForPlayer(currentBoard, player);

          // Handle case where current player has no moves (pass turn)
          if (possibleMoves.length === 0) {
              // Check if opponent also has no moves (game over)
              const opponentMoves = getAllValidMovesForPlayer(currentBoard, opponent);
              if (opponentMoves.length === 0) {
                  return evaluateBoard(currentBoard, player); // Game over state
              }
              // Only opponent can move, so recurse for opponent without changing depth
              return minimax(currentBoard, depth, alpha, beta, !isMaximizingPlayer);
          }


         if (isMaximizingPlayer) { // Bot's turn (WHITE) - Maximize score
             let maxEval = -Infinity;
             for (const [r, c] of possibleMoves) {
                 const boardCopy = currentBoard.map(row => [...row]);
                 const flips = getFlipsForBoard(boardCopy, r, c, WHITE);
                 boardCopy[r][c] = WHITE;
                 flips.forEach(([fr, fc]) => { boardCopy[fr][fc] = WHITE; });

                 const evaluation = minimax(boardCopy, depth - 1, alpha, beta, false); // Opponent's turn next
                 maxEval = Math.max(maxEval, evaluation);
                 alpha = Math.max(alpha, evaluation);
                 if (beta <= alpha) {
                     break; // Beta cutoff
                 }
             }
             return maxEval;
         } else { // Opponent's turn (BLACK) - Minimize score (from Bot's perspective)
             let minEval = Infinity;
             for (const [r, c] of possibleMoves) {
                 const boardCopy = currentBoard.map(row => [...row]);
                 const flips = getFlipsForBoard(boardCopy, r, c, BLACK);
                 boardCopy[r][c] = BLACK;
                 flips.forEach(([fr, fc]) => { boardCopy[fr][fc] = BLACK; });

                 const evaluation = minimax(boardCopy, depth - 1, alpha, beta, true); // Bot's turn next
                 minEval = Math.min(minEval, evaluation);
                 beta = Math.min(beta, evaluation);
                 if (beta <= alpha) {
                     break; // Alpha cutoff
                 }
             }
             return minEval;
         }
     }

     // --- Helper functions for Minimax ---

     // Check game over state for a given board configuration
     function isGameOver(boardToCheck) {
        const blackMoves = getAllValidMovesForPlayer(boardToCheck, BLACK);
        const whiteMoves = getAllValidMovesForPlayer(boardToCheck, WHITE);
        if (blackMoves.length === 0 && whiteMoves.length === 0) return true;

        let pieceCount = 0;
        for(let r=0; r<BOARD_SIZE; r++) {
            for(let c=0; c<BOARD_SIZE; c++) {
                if (boardToCheck[r][c] !== EMPTY) pieceCount++;
            }
        }
        return pieceCount === BOARD_SIZE * BOARD_SIZE;
     }

     // Get flips for a specific board state (used in simulation)
    function getFlipsForBoard(boardToCheck, r, c, player) {
         const opponent = getOpponent(player);
         let allFlips = [];
         if (!isValid(r,c) || boardToCheck[r][c] !== EMPTY) return [];

         for (const [dr, dc] of directions) {
             let currentFlips = [];
             let nr = r + dr;
             let nc = c + dc;
             while (isValid(nr, nc) && boardToCheck[nr][nc] === opponent) {
                 currentFlips.push([nr, nc]);
                 nr += dr;
                 nc += dc;
             }
             if (isValid(nr, nc) && boardToCheck[nr][nc] === player && currentFlips.length > 0) {
                 allFlips = allFlips.concat(currentFlips);
             }
         }
         return allFlips;
     }


     // Get all valid moves for a player on a given board state
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

    // Heuristic evaluation function for Minimax
    function evaluateBoard(boardToEvaluate, playerForScore) {
        let blackScore = 0;
        let whiteScore = 0;
        let blackMoves = 0;
        let whiteMoves = 0;
        let blackCorner = 0;
        let whiteCorner = 0;
        let blackEdge = 0;
        let whiteEdge = 0;

        const corners = [[0,0], [0, BOARD_SIZE-1], [BOARD_SIZE-1, 0], [BOARD_SIZE-1, BOARD_SIZE-1]];
        const edges = [];
         // Top/Bottom Edges (excluding corners)
        for(let c=1; c<BOARD_SIZE-1; c++) { edges.push([0,c]); edges.push([BOARD_SIZE-1, c]); }
        // Left/Right Edges (excluding corners)
        for(let r=1; r<BOARD_SIZE-1; r++) { edges.push([r,0]); edges.push([r, BOARD_SIZE-1]); }


        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                 const piece = boardToEvaluate[r][c];
                 if (piece === BLACK) {
                    blackScore++;
                    if (corners.some(corner => corner[0] === r && corner[1] === c)) blackCorner++;
                    else if (edges.some(edge => edge[0] === r && edge[1] === c)) blackEdge++;
                 } else if (piece === WHITE) {
                    whiteScore++;
                     if (corners.some(corner => corner[0] === r && corner[1] === c)) whiteCorner++;
                     else if (edges.some(edge => edge[0] === r && edge[1] === c)) whiteEdge++;
                 }
            }
        }

        // Calculate mobility (number of valid moves)
        blackMoves = getAllValidMovesForPlayer(boardToEvaluate, BLACK).length;
        whiteMoves = getAllValidMovesForPlayer(boardToEvaluate, WHITE).length;

        // Simple score difference (basic heuristic)
        let scoreDiff = whiteScore - blackScore;

        // Mobility bonus/penalty (higher weight)
        let mobilityScore = 0;
        if (blackMoves + whiteMoves !== 0) { // Avoid division by zero
           mobilityScore = 15 * (whiteMoves - blackMoves) / (whiteMoves + blackMoves);
        }


        // Corner bonus/penalty (very high weight)
        let cornerScore = 30 * (whiteCorner - blackCorner);

         // Edge bonus/penalty (medium weight)
         let edgeScore = 5 * (whiteEdge - blackEdge);

         // Determine final score based on game phase (optional, but can improve AI)
         const totalPieces = blackScore + whiteScore;
         let finalScore;

         if (totalPieces < 20) { // Early game: focus on mobility and corners
              finalScore = mobilityScore + cornerScore + edgeScore;
         } else if (totalPieces < 50) { // Mid game: balance mobility, corners, edges, and piece count
             finalScore = scoreDiff + mobilityScore + cornerScore + edgeScore;
         } else { // Late game: focus heavily on piece count and corners
             finalScore = (scoreDiff * 2) + (cornerScore * 2) + mobilityScore + edgeScore;
         }


        // The minimax function maximizes for WHITE, so return score from WHITE's perspective
        return finalScore;
    }

}); 