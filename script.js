/**
 * 101 Okey Premium - JavaScript Motoru v4.0 (Temiz Mimari)
 * Tüm hakları Krala aittir.
 */

// --- OYUN SABİTLERİ VE DURUMU ---
const COLORS = ['red', 'blue', 'black', 'yellow'];
const NUMBERS = Array.from({ length: 13 }, (_, i) => i + 1);

let gameState = {
    deck: [],
    indicatorTile: null,
    okeyTile: null,
    turnOrder: ['user', 'bot3', 'bot2', 'bot1'],
    currentTurnIndex: 0,
    hasDrawn: false,
    players: {
        user: { name: 'Fatih', hand: [], score: 0, hasOpened: false },
        bot1: { name: 'Samet', hand: [], score: 0, hasOpened: false },
        bot2: { name: 'Deniz', hand: [], score: 0, hasOpened: false },
        bot3: { name: 'Sinem', hand: [], score: 0, hasOpened: false }
    },
    userRackSlots: new Array(40).fill(null),
    selectedTileIds: new Set(),
    table: { user: [], bots: [] },
    discards: {},
    pairsOpened: false,
    lastDiscard: null,
    currentRound: 1,
    maxRounds: 5,
    roundScores: { user: [], bot1: [], bot2: [], bot3: [] }, // Her elin puanı
    touch: {
        phantom: null,
        sourceType: null,
        draggedTileId: null
    }
};

// --- TILE (TAŞ) SINIFI ---
class Tile {
    constructor(number, color, isJoker = false) {
        this.id = 'tile-' + Math.random().toString(36).substr(2, 9);
        this.number = number;
        this.color = color;
        this.isJoker = isJoker;
        this.isFlipped = false; // Yeni: Taşın arkasının dönük olma durumu
    }

    createHTMLElement(isFaceUp = true) {
        const div = document.createElement('div');
        div.className = `tile ${this.color}`;
        div.id = this.id;
        div.draggable = isFaceUp;

        const isRealOkey = (this.number === gameState.okeyTile?.number && this.color === gameState.okeyTile?.color && !this.isJoker);
        let numDisplay = this.isJoker ? '★' : (this.number || '?');
        const colorCode = this.isJoker ? '#ff9800' : this.getColorCode();

        div.innerHTML = `
            <div class="tile-content">
                <div class="tile-face front">
                    <span class="tile-number" style="color: ${colorCode}">${numDisplay}</span>
                </div>
                <div class="tile-face back"></div>
            </div>
        `;

        if (isFaceUp && !this.isFlipped) div.classList.add('face-up');
        if (this.isJoker) div.classList.add('is-joker');
        if (isRealOkey) div.classList.add('is-okey');

        // Seçim takibi
        if (gameState.selectedTileIds.has(this.id)) div.classList.add('selected');

        // Interaktif Olaylar
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTileSelection(this.id);
        });

        // Mobile için hızlı seçim (Double-tap/Ghost click önleme ile)
        div.addEventListener('touchstart', (e) => {
            // Sürükleme başlatılmadıysa ve kısa bir dokunuşsa seçimi tetikle
            this.touchStartTime = Date.now();
        }, { passive: true });

        div.addEventListener('touchend', (e) => {
            const duration = Date.now() - (this.touchStartTime || 0);
            if (duration < 250) { // 250ms altı dokunuşlar "tap" sayılır
                // e.preventDefault(); // Click event'ini biz yönettik
                // toggleTileSelection(this.id);
            }
        }, { passive: true });

        // Drag olayları (Sadece yüzü yukarıyken sürükleme daha mantıklı ama kararı sana bırakıyorum)
        div.addEventListener('dragstart', (e) => {
            if (!div.classList.contains('face-up')) { e.preventDefault(); return; }
            e.dataTransfer.setData('tileId', this.id);
            div.classList.add('dragging');
        });

        div.addEventListener('dragend', () => div.classList.remove('dragging'));

        return div;
    }

    getColorCode() {
        const maps = { 'red': '#d32f2f', 'blue': '#1976d2', 'black': '#212121', 'yellow': '#fbc02d' };
        return maps[this.color] || '#333';
    }
}

// --- OYUN BAŞLATMA ---
function initGame() {
    try {
        logDebug("Sistem Başlatılıyor...");
        createFullDeck();
        shuffleDeck();
        determineOkey();
        dealTiles();

        renderAll();
        logDebug("Oyun Hazır!");
    } catch (err) {
        alert("Başlatma Hatası: " + err.message);
    }
}

function createFullDeck() {
    gameState.deck = [];
    COLORS.forEach(color => {
        NUMBERS.forEach(num => {
            gameState.deck.push(new Tile(num, color), new Tile(num, color));
        });
    });
    // Sahte Okeyler (Jokers)
    // 2 Adet Sahte Okey ekle (Okey 101'de Sahte Okey Gösterge Sayısını Alır)
    // Placeholder values for jokers, actual number will be set after indicator tile is known
    // 101 Okey'de 2 adet Sahte Okey (Joker) bulunur
    gameState.deck.push(new Tile(0, 'joker', true));
    gameState.deck.push(new Tile(0, 'joker', true));
}

function shuffleDeck() {
    for (let i = gameState.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gameState.deck[i], gameState.deck[j]] = [gameState.deck[j], gameState.deck[i]];
    }
}

function determineOkey() {
    // Gösterge taşının Sahte Okey (Joker) olmamasını garanti et
    let indicatorIdx = -1;
    for (let i = gameState.deck.length - 1; i >= 0; i--) {
        if (!gameState.deck[i].isJoker) {
            indicatorIdx = i;
            break;
        }
    }

    // Eğer son taş Joker ise, rastgele bir gerçek taşla yer değiştir ve çek
    if (indicatorIdx !== -1 && indicatorIdx !== gameState.deck.length - 1) {
        const temp = gameState.deck[gameState.deck.length - 1];
        gameState.deck[gameState.deck.length - 1] = gameState.deck[indicatorIdx];
        gameState.deck[indicatorIdx] = temp;
    }

    gameState.indicatorTile = gameState.deck.pop();
    let okeyNum = gameState.indicatorTile.number + 1;
    if (okeyNum > 13) okeyNum = 1;
    gameState.okeyTile = { number: okeyNum, color: gameState.indicatorTile.color };

    // Sahte okeylerin (Joker) numarasını ve rengini o anki GERÇEK OKEY kimliğiyle eşitle
    gameState.deck.forEach(t => {
        if (t.isJoker) {
            t.number = gameState.okeyTile.number;
            t.color = gameState.okeyTile.color;
        }
    });
}

function dealTiles() {
    // TEST: User 21 taşla başlasın (Çekme testi için)
    gameState.players.user.hand = gameState.deck.splice(0, 21);
    gameState.players.bot3.hand = gameState.deck.splice(0, 21);
    gameState.players.bot2.hand = gameState.deck.splice(0, 21);
    gameState.players.bot1.hand = gameState.deck.splice(0, 21);

    // Istakaya diz
    gameState.userRackSlots.fill(null);
    gameState.players.user.hand.forEach((tile, i) => {
        if (i < 40) gameState.userRackSlots[i] = tile;
    });

    gameState.currentTurnIndex = 0;
    gameState.hasDrawn = false;
}

// --- RENDERING (ARAYÜZ ÇİZİMİ) ---
function renderAll() {
    renderUserRack();
    renderIndicator();
    renderTable(); // Masaya açılanları göster
    updateDeckCount();
    updateTurnUI();
    updateDebugConsole();
    updateHandPoints();
    renderAllDiscardZones(); // Tüm atılan taşları render et
}

function renderTable() {
    const seriesField = document.getElementById('series-field');
    const pairsField = document.getElementById('pairs-field');

    if (seriesField) seriesField.innerHTML = '';
    if (pairsField) pairsField.innerHTML = '';

    if (!gameState.table || !gameState.table.user) return;

    // Kullanıcının açtığı her grubu masadaki ilgili alana koy
    gameState.table.user.forEach((group, groupIdx) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'table-group';
        groupEl.dataset.index = groupIdx;
        groupEl.dataset.owner = 'user';

        // İşleme hedefi olarak dinle
        groupEl.ondragover = (e) => { e.preventDefault(); groupEl.classList.add('drag-over'); };
        groupEl.ondragleave = () => groupEl.classList.remove('drag-over');
        groupEl.ondrop = (e) => {
            e.preventDefault();
            groupEl.classList.remove('drag-over');
            const tileId = e.dataTransfer.getData('tileId');
            if (tileId) handleProcessTile(tileId, groupIdx, 'user');
        };

        group.forEach(tile => {
            const tEl = tile.createHTMLElement(true);
            tEl.classList.add('table-tile');
            groupEl.appendChild(tEl);
        });

        // 101 KURALI: 2 taşlı olanlar çifttir, 3+ taşlılar seridir
        if (group.length === 2 && pairsField) {
            pairsField.appendChild(groupEl);
        } else if (seriesField) {
            seriesField.appendChild(groupEl);
        }
    });
}

function updateHandPoints() {
    const scoreEl = document.getElementById('hand-points');
    const pairEl = document.getElementById('hand-pairs') || document.getElementById('pair-count');
    if (!scoreEl) return;

    let totalPoints = 0;
    let totalPairs = 0;

    // 1. ISTAKADAKİ KÜMELERİ BUL (Adjacency-based clustering)
    let currentCluster = [];
    for (let i = 0; i < gameState.userRackSlots.length; i++) {
        const tile = gameState.userRackSlots[i];
        if (tile) {
            currentCluster.push(tile);
        } else {
            if (currentCluster.length > 0) {
                const res = evaluateCluster(currentCluster);
                totalPoints += res.points;
                totalPairs += res.pairs;
            }
            currentCluster = [];
        }
    }
    if (currentCluster.length > 0) {
        const res = evaluateCluster(currentCluster);
        totalPoints += res.points;
        totalPairs += res.pairs;
    }

    // 2. UI GÜNCELLE
    scoreEl.innerText = totalPoints;
    const isOpened = gameState.players.user.hasOpened;
    scoreEl.style.color = (totalPoints >= 101 || isOpened) ? '#4aff4a' : '';

    if (pairEl) {
        pairEl.innerText = totalPairs;
        pairEl.style.color = (totalPairs >= 5 || isOpened) ? '#4aff4a' : '';
    }
}

function openSeries() {
    const isAlreadyOpen = gameState.players.user.hasOpened;
    const scoreVal = parseInt(document.getElementById('hand-points').innerText) || 0;

    // Eğer daha önce açmamışsak baraj kontrolü yap
    if (!isAlreadyOpen && scoreVal < 101) {
        showGameMessage("Puan yetersiz (Baraj: 101).");
        return;
    }

    // 1. ISTAKADAKİ GEÇERLİ PERLERİ VE TEMİZLENECEK YERLERİ TOPLA
    let currentCluster = [];
    let openedGroups = [];
    let slotsToClear = [];

    for (let i = 0; i < gameState.userRackSlots.length; i++) {
        const tile = gameState.userRackSlots[i];
        if (tile) {
            currentCluster.push(tile);
            slotsToClear.push(i);
        } else {
            if (currentCluster.length >= 3 && (getSetPoints(currentCluster) > 0 || getRunPoints(currentCluster) > 0)) {
                openedGroups.push([...currentCluster]);
            } else {
                slotsToClear = slotsToClear.slice(0, slotsToClear.length - currentCluster.length);
            }
            currentCluster = [];
        }
    }
    // Son küme kontrolü
    if (currentCluster.length >= 3 && (getSetPoints(currentCluster) > 0 || getRunPoints(currentCluster) > 0)) {
        openedGroups.push([...currentCluster]);
    } else {
        slotsToClear = slotsToClear.slice(0, slotsToClear.length - currentCluster.length);
    }

    if (openedGroups.length === 0) {
        showGameMessage("Masaya inecek geçerli per bulunamadı.");
        return;
    }

    // 2. MASAYA SER VE ISTAKADAN SİL
    if (!gameState.table) gameState.table = { user: [], bots: [] };
    gameState.table.user.push(...openedGroups);

    // Her bir taşı gemState.players.user.hand içinden de sil
    openedGroups.forEach(group => {
        group.forEach(tile => {
            gameState.players.user.hand = gameState.players.user.hand.filter(t => t.id !== tile.id);
        });
    });

    slotsToClear.forEach(idx => gameState.userRackSlots[idx] = null);

    gameState.players.user.hasOpened = true;
    renderAll();
    showGameMessage(isAlreadyOpen ? "Yeni perler masaya indi." : "Tebrikler, masaya 101 açıldı!");
}

function openPairs() {
    const isAlreadyOpen = gameState.players.user.hasOpened;
    const pairsOpenedOnTable = gameState.pairsOpened;

    // KURAL: Masada hiç çift açılmamışsa → 5 çift şartı aranır
    // Masada çift açılmışsa VE sen seri açmışsan → serbestçe çift inebilirsin
    if (!pairsOpenedOnTable && !isAlreadyOpen) {
        showGameMessage("Çift açmak için önce seri açmalısın.");
        return;
    }

    let totalPairs = 0;
    let openedPairs = [];
    let slotsToClear = [];
    let currentCluster = [];

    for (let i = 0; i < gameState.userRackSlots.length; i++) {
        const tile = gameState.userRackSlots[i];
        if (tile) {
            currentCluster.push(tile);
            slotsToClear.push(i);
        } else {
            if (currentCluster.length === 2) {
                const [t1, t2] = currentCluster;
                if (t1.number === t2.number && t1.color === t2.color && !isWildCard(t1) && !isWildCard(t2)) {
                    openedPairs.push([...currentCluster]);
                    totalPairs++;
                } else {
                    slotsToClear = slotsToClear.slice(0, slotsToClear.length - 2);
                }
            } else if (currentCluster.length > 0) {
                slotsToClear = slotsToClear.slice(0, slotsToClear.length - currentCluster.length);
            }
            currentCluster = [];
        }
    }
    // Son küme
    if (currentCluster.length === 2) {
        const [t1, t2] = currentCluster;
        if (t1.number === t2.number && t1.color === t2.color && !isWildCard(t1) && !isWildCard(t2)) {
            openedPairs.push([...currentCluster]); totalPairs++;
        } else {
            slotsToClear = slotsToClear.slice(0, slotsToClear.length - 2);
        }
    }

    // KURAL KONTROLÜ:
    // Masada çift yoksa → 5 çift zorunlu
    if (!pairsOpenedOnTable && totalPairs < 5) {
        showGameMessage(`Çift açmak için 5 çift gerekli (şu an: ${totalPairs}).`);
        return;
    }
    // Masada çift var ama sen seri açmamışsan → yapamazsın
    if (pairsOpenedOnTable && !isAlreadyOpen) {
        showGameMessage("Çift inmek için önce seri açmalısın.");
        return;
    }
    if (openedPairs.length === 0) {
        showGameMessage("İnecek geçerli çift bulunamadı.");
        return;
    }

    if (!gameState.table) gameState.table = { user: [], bots: [] };
    gameState.table.user.push(...openedPairs);

    // Hand'den de temizle (Hortlamasınlar)
    openedPairs.forEach(pair => {
        pair.forEach(tile => {
            gameState.players.user.hand = gameState.players.user.hand.filter(t => t.id !== tile.id);
        });
    });

    slotsToClear.forEach(idx => gameState.userRackSlots[idx] = null);
    gameState.players.user.hasOpened = true;

    // Masada ilk çift açılışını kaydet
    if (!pairsOpenedOnTable && totalPairs >= 5) {
        gameState.pairsOpened = true;
    }

    renderAll();
    showGameMessage(pairsOpenedOnTable ? "Çiftler masaya indi." : "Tebrikler, masaya 5 çift açıldı!");
}

function handleProcessTile(tileId, groupIdx, owner) {
    if (!gameState.players.user.hasOpened) {
        showGameMessage("Önce masaya açmalısın kral!");
        return;
    }

    const rackIdx = gameState.userRackSlots.findIndex(t => t?.id === tileId);
    if (rackIdx === -1) return;

    const tile = gameState.userRackSlots[rackIdx];
    const group = gameState.table[owner][groupIdx];

    if (isValidAddition(tile, group)) {
        group.push(tile);
        // Serileri puan/sıra bazlı tekrar sırala (Örn: 9-10-11'e 12 eklenince sona gelsin)
        if (getRunPoints(group) > 0) group.sort((a, b) => a.number - b.number);

        gameState.userRackSlots[rackIdx] = null;
        renderAll();
        showGameMessage("Taş başarıyla işlendi! 🔥");
    } else {
        showGameMessage("Bu taş bu perle uyumlu değil.");
    }
}

function isValidAddition(tile, group) {
    // 1. SET KONTROLÜ (Aynı sayılar, farklı renkler)
    const setPoints = getSetPoints(group);
    if (setPoints > 0) {
        if (tile.number !== group[0].number && !isWildCard(tile)) return false;
        if (group.length >= 4) return false;
        // Renk zaten var mı?
        const hasColor = group.some(t => t.color === tile.color && !isWildCard(t));
        if (hasColor && !isWildCard(tile)) return false;
        return true;
    }

    // 2. SERİ KONTROLÜ (Aynı renk, sıralı sayılar)
    const runPoints = getRunPoints(group);
    if (runPoints > 0) {
        if (tile.color !== group.find(t => !isWildCard(t)).color && !isWildCard(tile)) return false;
        const nums = group.map(t => t.number).sort((a, b) => a - b);
        const min = nums[0];
        const max = nums[nums.length - 1];
        if (tile.number === min - 1 || tile.number === max + 1 || isWildCard(tile)) return true;
    }

    return false;
}

function isWildCard(tile) {
    if (!tile || !gameState.okeyTile) return false;
    // Okey 101 kuralı: Sadece gerçek okey jokerdir, sahte okey sayıdır.
    return (tile.number === gameState.okeyTile.number && tile.color === gameState.okeyTile.color && !tile.isJoker);
}

function evaluateCluster(tiles) {
    let points = 0;
    let pairs = 0;

    if (tiles.length >= 3) {
        const setVal = getSetPoints(tiles);
        if (setVal > 0) {
            points = setVal;
        } else {
            const runVal = getRunPoints(tiles);
            if (runVal > 0) points = runVal;
        }
    } else if (tiles.length === 2) {
        const [t1, t2] = tiles;
        if (t1.number === t2.number && t1.color === t2.color && !isWildCard(t1) && !isWildCard(t2)) {
            pairs = 1;
        }
    }
    return { points, pairs };
}

function getSetPoints(tiles) {
    const baseTile = tiles.find(t => !isWildCard(t));
    if (!baseTile) return 0;

    const num = baseTile.number;
    const colors = new Set();
    for (let t of tiles) {
        if (!isWildCard(t)) {
            if (t.number !== num) return 0;
            if (colors.has(t.color)) return 0;
            colors.add(t.color);
        }
    }
    if (tiles.length > 4) return 0;
    // Puan: Hepsi base number kadar sayılır
    return num * tiles.length;
}

function getRunPoints(tiles) {
    const baseColor = tiles.find(t => !isWildCard(t))?.color;
    if (!baseColor) return 0;

    // Renk kontrolü ve ardışıklık
    // Okey'in (WildCard) değerini bulmak için tüm diziyi simüle et
    let simulatedNumbers = [];
    let firstNonWildIdx = tiles.findIndex(t => !isWildCard(t));
    let startNum = tiles[firstNonWildIdx].number - firstNonWildIdx;

    for (let i = 0; i < tiles.length; i++) {
        const expectedNum = startNum + i;
        if (expectedNum < 1 || expectedNum > 13) return 0; // Geçersiz run

        const t = tiles[i];
        if (!isWildCard(t)) {
            if (t.color !== baseColor || t.number !== expectedNum) return 0;
        }
        simulatedNumbers.push(expectedNum);
    }

    return simulatedNumbers.reduce((a, b) => a + b, 0);
}

function finishRound() {
    logDebug("EL BİTTİ. PUANLAR HESAPLANIYOR...");

    for (let pId in gameState.players) {
        const player = gameState.players[pId];
        let penalty = 0;
        if (!player.hasOpened) {
            penalty = 202;
        } else {
            const rackTiles = (pId === 'user')
                ? gameState.userRackSlots.filter(t => t)
                : player.hand;
            penalty = rackTiles.reduce((sum, t) => sum + (t.number || 0), 0);
        }
        player.score += penalty;
        gameState.roundScores[pId].push(penalty);
    }

    showYazboz();
}

function showYazboz(isFinal = false) {
    const modal = document.getElementById('scoreboard-modal');
    const headerRow = document.getElementById('score-header-row');
    const body = document.getElementById('score-body');
    const nextBtn = document.getElementById('next-round-btn');
    if (!modal || !headerRow || !body) return;

    const numRounds = gameState.roundScores.user.length;

    // Başlık satırını oluştur
    headerRow.innerHTML = '<th>OYUNCU</th>';
    for (let r = 1; r <= numRounds; r++) {
        const th = document.createElement('th');
        th.textContent = `El ${r}`;
        headerRow.appendChild(th);
    }
    const totalTh = document.createElement('th');
    totalTh.textContent = 'TOPLAM';
    headerRow.appendChild(totalTh);

    // Oyuncu satırlarını oluştur
    body.innerHTML = '';
    const playerIds = ['user', 'bot1', 'bot2', 'bot3'];
    const totals = playerIds.map(id => gameState.players[id].score);
    const minScore = Math.min(...totals);

    playerIds.forEach(pId => {
        const player = gameState.players[pId];
        const tr = document.createElement('tr');
        const isChampion = player.score === minScore;
        if (isChampion) tr.classList.add('champion-row');

        const nameTd = document.createElement('td');
        nameTd.textContent = (isChampion ? '📍 ' : '') + player.name;
        tr.appendChild(nameTd);

        // Her elin puanı
        (gameState.roundScores[pId] || []).forEach(pts => {
            const td = document.createElement('td');
            td.textContent = pts === 202 ? '202 ❌' : pts;
            if (pts === 202) td.style.color = '#ff4444';
            tr.appendChild(td);
        });

        const totalTd = document.createElement('td');
        totalTd.textContent = player.score;
        totalTd.style.fontWeight = 'bold';
        if (isChampion) totalTd.style.color = '#ffd700';
        tr.appendChild(totalTd);

        body.appendChild(tr);
    });

    // El kontrolü
    const isTournamentOver = numRounds >= gameState.maxRounds;
    if (nextBtn) {
        nextBtn.textContent = isTournamentOver ? '🏆 OYUN BİTTİ' : `SONRAKİ EL ▶ (${numRounds}/${gameState.maxRounds})`;
        nextBtn.disabled = isTournamentOver;
        nextBtn.style.opacity = isTournamentOver ? '0.5' : '1';
    }

    modal.style.display = 'flex';
}

function updateScoreUI() {
    for (let pId in gameState.players) {
        const pEl = document.querySelector(`#${pId === 'user' ? 'player-user' : pId.replace('bot', 'bot-')} .total-score`);
        if (pEl) pEl.innerText = gameState.players[pId].score;
    }
}

function startNewHand() {
    // Skoru ve isimleri koru, sadece el verilerini sıfırla
    const savedNames = {};
    for (let p in gameState.players) savedNames[p] = gameState.players[p].name;
    const savedScores = {};
    for (let p in gameState.players) savedScores[p] = gameState.players[p].score;
    const savedRoundScores = JSON.parse(JSON.stringify(gameState.roundScores));
    const savedMaxRounds = gameState.maxRounds;
    const savedCurrentRound = gameState.currentRound + 1;

    // State'i sıfırla
    gameState.deck = [];
    gameState.okeyTile = null;
    gameState.indicatorTile = null;
    gameState.table = { user: [], bots: [] };
    gameState.discards = {};
    gameState.pairsOpened = false;
    gameState.lastDiscard = null;
    gameState.userRackSlots = new Array(40).fill(null);
    gameState.selectedTileIds = new Set();
    gameState.hasDrawn = false;
    gameState.currentTurnIndex = 0;
    gameState.currentRound = savedCurrentRound;
    gameState.maxRounds = savedMaxRounds;
    gameState.roundScores = savedRoundScores;

    for (let p in gameState.players) {
        gameState.players[p].name = savedNames[p];
        gameState.players[p].score = savedScores[p];
        gameState.players[p].hand = [];
        gameState.players[p].hasOpened = false;
    }

    document.getElementById('scoreboard-modal').style.display = 'none';
    initGame();
}

function renderUserRack() {
    const row1 = document.getElementById('row-1');
    const row2 = document.getElementById('row-2');
    if (!row1 || !row2) return;

    row1.innerHTML = '';
    row2.innerHTML = '';

    gameState.userRackSlots.forEach((tile, i) => {
        const slot = document.createElement('div');
        slot.className = 'tile-slot';
        slot.dataset.index = i;
        slot.ondragover = (e) => { e.preventDefault(); slot.classList.add('drag-hover'); };
        slot.ondragleave = () => slot.classList.remove('drag-hover');
        slot.ondrop = handleDropOnSlot;

        // Touch olayları (Mobile)
        slot.addEventListener('touchstart', handleTouchStartSlot, { passive: true });
        slot.addEventListener('touchend', handleTouchEnd);

        if (tile) {
            // Sadece GERÇEK OKEY ters dönebilir, Sahte Okey veya Normal taşları zorla aç
            const isRealOkey = (tile.number === gameState.okeyTile?.number && tile.color === gameState.okeyTile?.color && !tile.isJoker);
            if (!isRealOkey) tile.isFlipped = false;

            slot.appendChild(tile.createHTMLElement());
        }

        if (i < 20) row1.appendChild(slot);
        else row2.appendChild(slot);
    });

    updateHandPoints(); // Istaka her çizildiğinde puanları güncelle
}

function renderIndicator() {
    const container = document.getElementById('indicator-tile');
    if (container && gameState.indicatorTile) {
        container.innerHTML = '';
        container.appendChild(gameState.indicatorTile.createHTMLElement(true));
    }
}

function updateDeckCount() {
    const el = document.querySelector('.deck-count');
    if (el) el.innerText = gameState.deck.length;
}

function updateTurnUI() {
    // Aktif oyuncu vurgusu
    document.querySelectorAll('.player-slot, #player-user').forEach(el => el.classList.remove('active-turn'));
    const currentPlayerId = gameState.turnOrder[gameState.currentTurnIndex];
    const activeEl = currentPlayerId === 'user' ? document.getElementById('player-user') : document.getElementById(currentPlayerId.replace('bot', 'bot-'));
    if (activeEl) activeEl.classList.add('active-turn');

    // Deste parlaması
    const deckPile = document.getElementById('deck-pile');
    if (deckPile) {
        if (currentPlayerId === 'user' && !gameState.hasDrawn) deckPile.classList.add('your-turn-pulse');
        else deckPile.classList.remove('your-turn-pulse');
    }
}

// --- OYUN MANTIĞI FONKSİYONLARI ---
function handleDraw(targetIdx = -1) {
    if (gameState.turnOrder[gameState.currentTurnIndex] !== 'user') {
        showGameMessage("Sıra sizde değil!");
        return;
    }
    if (gameState.hasDrawn) {
        showGameMessage("Zaten taş çektiniz!");
        return;
    }
    if (gameState.deck.length === 0) return;

    const newTile = gameState.deck.pop();
    gameState.players.user.hand.push(newTile);

    let finalIdx = targetIdx;
    if (finalIdx === -1 || gameState.userRackSlots[finalIdx] !== null) {
        finalIdx = gameState.userRackSlots.indexOf(null);
    }
    if (finalIdx !== -1) gameState.userRackSlots[finalIdx] = newTile;

    gameState.hasDrawn = true;
    renderAll();
    logDebug("Taş Çekildi");
}

function processUserDiscard(tileId) {
    if (gameState.turnOrder[gameState.currentTurnIndex] !== 'user' || !gameState.hasDrawn) {
        showGameMessage("Önce taş çekmelisiniz!");
        return;
    }

    const tile = gameState.players.user.hand.find(t => t.id === tileId);
    if (!tile) return;

    // Isktanadan ve elden sil
    gameState.players.user.hand = gameState.players.user.hand.filter(t => t.id !== tileId);
    const rackIdx = gameState.userRackSlots.findIndex(t => t?.id === tileId);
    if (rackIdx !== -1) gameState.userRackSlots[rackIdx] = null;

    renderDiscard('user', tile);
    gameState.selectedTileIds.delete(tileId);
    nextTurn();
}

function nextTurn() {
    // Deste bittiyse ve son oyuncu hamlesini yaptıysa oyunu bitir
    if (gameState.deck.length === 0) {
        finishRound();
        return;
    }

    gameState.currentTurnIndex = (gameState.currentTurnIndex + 1) % 4;
    gameState.hasDrawn = false;
    updateTurnUI();
    updateDebugConsole();
    renderAllDiscardZones(); // Çalınabilir taş durumunu güncelle

    const currentPlayerId = gameState.turnOrder[gameState.currentTurnIndex];
    if (currentPlayerId !== 'user') {
        setTimeout(botPlay, 1000);
    }
}

async function botPlay() {
    const botId = gameState.turnOrder[gameState.currentTurnIndex];

    // Çek
    if (gameState.players[botId].hand.length < 22 && gameState.deck.length > 0) {
        gameState.players[botId].hand.push(gameState.deck.pop());
        updateDeckCount();
    }

    await new Promise(r => setTimeout(r, 600));

    // At
    if (gameState.players[botId].hand.length > 0) {
        const idx = Math.floor(Math.random() * gameState.players[botId].hand.length);
        const tile = gameState.players[botId].hand.splice(idx, 1)[0];
        renderDiscard(botId, tile);
    }

    nextTurn();
}

function renderDiscard(playerId, tile) {
    if (!gameState.discards[playerId]) gameState.discards[playerId] = [];
    gameState.discards[playerId].push(tile);

    // Sol oyuncunun attığı taş çalınabilir olarak işaretle
    if (playerId !== 'user') {
        gameState.lastDiscard = { tile, playerId };
    } else {
        gameState.lastDiscard = null; // Kullanıcı attıysa, çalınabilir taş yok
    }

    renderDiscardZone(playerId);
}

function renderAllDiscardZones() {
    for (const playerId in gameState.discards) {
        renderDiscardZone(playerId);
    }
}

function renderDiscardZone(playerId) {
    const htmlId = playerId === 'user' ? 'user' : playerId.replace('bot', 'bot-');
    const zone = document.getElementById(`discard-${htmlId}`);
    if (!zone) return;
    zone.innerHTML = '';
    const all = gameState.discards[playerId] || [];
    if (all.length === 0) return;

    all.forEach((tile, index) => {
        const tileEl = tile.createHTMLElement(true);
        tileEl.style.position = 'absolute';
        tileEl.style.setProperty('--idx', index);
        tileEl.style.zIndex = index + 5;
        // Yığını sınırla ve daha stabil yap (max 10 taş görseli yeterli)
        const visualIndex = Math.min(index, 10);
        if (!zone.classList.contains('expanded')) {
            tileEl.style.top = `${visualIndex * 0.8}px`; // Daha sıkı ve stabil yığın
            tileEl.style.left = `${visualIndex * 0.4}px`;
            tileEl.style.transform = 'scale(0.95)';
        } else {
            tileEl.style.top = '0px';
            tileEl.style.left = `${index * 30}px`;
            tileEl.style.transform = 'scale(1)';
            tileEl.style.zIndex = index + 100;
        }

        // Çalınabilir taş: en üst taş, botun attığı, sıra bizde, henüz çekmedik
        const isTopTile = index === all.length - 1;
        const isStealable = isTopTile
            && gameState.lastDiscard?.tile?.id === tile.id
            && gameState.turnOrder[gameState.currentTurnIndex] === 'user'
            && !gameState.hasDrawn;

        if (isStealable) {
            tileEl.classList.add('stealable-tile');
            tileEl.title = 'Bu taşı çalmak için tıkla!';

            // Tıklama ile çalma
            tileEl.onclick = (e) => { e.stopPropagation(); attemptStealDiscard(); };

            // Sürükleme ile çalma başlatma (Mobile)
            tileEl.ontouchstart = (e) => {
                gameState.touch.sourceType = 'steal';
                gameState.touch.draggedTileId = tile.id;
                createPhantom(tileEl);
            };
        }
        zone.appendChild(tileEl);
    });
}

function attemptStealDiscard() {
    if (!gameState.lastDiscard) return;
    if (gameState.hasDrawn) { showGameMessage("Zaten taş çektin!"); return; }
    if (gameState.turnOrder[gameState.currentTurnIndex] !== 'user') return;

    const { tile, playerId } = gameState.lastDiscard;

    // Sınav: Bu taşla birlikte elimde 101 puan eder mi?
    const hypotheticalHand = [...gameState.players.user.hand, tile];
    const hypotheticalGroups = findGroups(hypotheticalHand);

    // Tüm grupların puanını hesapla
    let totalPts = 0;
    [...hypotheticalGroups.complete].forEach(g => {
        totalPts += evaluateCluster(g).points;
    });

    if (totalPts < 101) {
        showGameMessage(`Bu taş (${tile.number}) ile ${totalPts} puan olur, 101 yapamıyorsun.`);
        return;
    }

    // Çal! - Discard yığından çıkar, elime ekle
    const discardArr = gameState.discards[playerId];
    const idx = discardArr.findIndex(t => t.id === tile.id);
    if (idx !== -1) discardArr.splice(idx, 1);

    gameState.players.user.hand.push(tile);
    const emptySlot = gameState.userRackSlots.indexOf(null);
    if (emptySlot !== -1) gameState.userRackSlots[emptySlot] = tile;

    gameState.lastDiscard = null;
    gameState.hasDrawn = true; // Çekme hakkını kullandı ("steal" de bir çekimdir)
    renderAll();
    showGameMessage(`${tile.number} numaralı taş çalındı! 🔥`);
}

function toggleTileSelection(tileId) {
    // Istakadaki tüm taşlar arasından bulalım
    const tile = gameState.userRackSlots.find(t => t?.id === tileId);
    if (tile) {
        // Sadece GERÇEK OKEY ise ters/düz döndür (Flip)
        const isRealOkey = (tile.number === gameState.okeyTile?.number && tile.color === gameState.okeyTile?.color && !tile.isJoker);
        if (isRealOkey) {
            tile.isFlipped = !tile.isFlipped;
        } else {
            tile.isFlipped = false; // Sahte okey ve normal taşlar asla ters dönemez
        }
    }

    if (gameState.selectedTileIds.has(tileId)) gameState.selectedTileIds.delete(tileId);
    else gameState.selectedTileIds.add(tileId);
    renderUserRack();
}

function moveTileToSlot(tileId, newIdx) {
    const oldIdx = gameState.userRackSlots.findIndex(t => t?.id === tileId);
    if (oldIdx === -1) return;

    const tile = gameState.userRackSlots[oldIdx];
    const targetTile = gameState.userRackSlots[newIdx];

    gameState.userRackSlots[newIdx] = tile;
    gameState.userRackSlots[oldIdx] = targetTile;

    renderUserRack();
}

// --- EVENT HANDLERS (DROP / TOUCH) ---
function handleDropOnSlot(e) {
    e.preventDefault();
    this.classList.remove('drag-hover');
    const targetIdx = parseInt(this.dataset.index);

    const isFromDeck = e.dataTransfer.getData('source') === 'deck';
    if (isFromDeck) {
        handleDraw(targetIdx);
    } else {
        const tileId = e.dataTransfer.getData('tileId');
        if (tileId) moveTileToSlot(tileId, targetIdx);
    }
}

function handleTouchStartSlot(e) {
    const idx = parseInt(this.dataset.index);
    const tile = gameState.userRackSlots[idx];
    if (tile) {
        document.body.classList.add('dragging-mode');
        gameState.touch.draggedTileId = tile.id;
        createPhantom(this);
    }
}

function handleTouchEnd(e) {
    document.body.classList.remove('dragging-mode');
    if (gameState.touch.phantom) {
        gameState.touch.phantom.remove();
        gameState.touch.phantom = null;

        const touch = e.changedTouches[0];
        const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);

        // Desteden veya Yandan (Steal) çekme kontrolü
        if (gameState.touch.sourceType === 'deck' || gameState.touch.sourceType === 'steal') {
            const slot = targetEl?.closest('.tile-slot');
            if (slot) {
                if (gameState.touch.sourceType === 'deck') handleDraw(parseInt(slot.dataset.index));
                else attemptStealDiscard(); // Soldaki kuleden çaldı
            }
            else if (targetEl?.closest('.rack-row')) {
                if (gameState.touch.sourceType === 'deck') handleDraw(-1);
                else attemptStealDiscard();
            }
            gameState.touch.sourceType = null;
            return;
        }

        // Isktan içi veya Atma kontrolü
        if (gameState.touch.draggedTileId) {
            const slot = targetEl?.closest('.tile-slot');

            // Atma alanı kontrolü (Hit area'yı kodla genişletiyoruz)
            const discard = targetEl?.closest('#discard-user');
            const rect = document.getElementById('discard-user')?.getBoundingClientRect();
            let isInDiscard = !!discard;

            // Eğer tam üstünde değilse ama çok yakınsa (50px pay)
            if (!isInDiscard && rect) {
                const margin = 50;
                if (touch.clientX >= rect.left - margin && touch.clientX <= rect.right + margin &&
                    touch.clientY >= rect.top - margin && touch.clientY <= rect.bottom + margin) {
                    isInDiscard = true;
                }
            }

            if (slot) moveTileToSlot(gameState.touch.draggedTileId, parseInt(slot.dataset.index));
            else if (isInDiscard) processUserDiscard(gameState.touch.draggedTileId);

            gameState.touch.draggedTileId = null;
        }
    }
}


// --- UTILS (YARDIMCI ARAÇLAR) ---
function createPhantom(sourceEl) {
    const p = document.createElement('div');
    p.className = 'tile phantom-drag';
    p.style.position = 'fixed';
    p.style.zIndex = '10000';
    p.style.pointerEvents = 'none';
    p.style.opacity = '0.7';
    p.innerHTML = sourceEl.innerHTML;
    document.body.appendChild(p);
    gameState.touch.phantom = p;
}

function showGameMessage(msg) {
    const old = document.querySelector('.game-toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.className = 'game-toast';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 500); }, 2500);
}

function updateDebugConsole() {
    let el = document.getElementById('debug-console');
    if (!el) {
        el = document.createElement('div');
        el.id = 'debug-console';
        document.body.appendChild(el);
    }
    el.innerHTML = `
        TURN: ${gameState.turnOrder[gameState.currentTurnIndex]}<br>
        HAS_DRAWN: ${gameState.hasDrawn}<br>
        DECK: ${gameState.deck.length}
    `;
}

function logDebug(msg) { console.log("[101]", msg); }

// --- DIZME VE GRUPLAMA MANTIGI (GLOBAL) ---
function findGroups(hand) {
    let result = { complete: [], pairs: [], potential: [], leftovers: [...hand] };

    // 1. GERÇEK OKEYLERİ AYIR (WildCards)
    const okeys = [];
    for (let i = 0; i < result.leftovers.length; i++) {
        const t = result.leftovers[i];
        if (isWildCard(t)) { okeys.push(result.leftovers.splice(i, 1)[0]); i--; }
    }

    // 2. DOĞAL TAMAMLANMIŞ SERİLER VE SETLER (3+) - OKEY KULLANMADAN
    const sets = findCompleteSets(result.leftovers);
    sets.forEach(g => { result.complete.push(g); g.forEach(t => removeTileFromList(result.leftovers, t)); });

    const runs = findCompleteRuns(result.leftovers);
    runs.forEach(g => { result.complete.push(g); g.forEach(t => removeTileFromList(result.leftovers, t)); });

    // 3. ÇİFTLERİ AYIR (Aynı Sayı, Aynı Renk)
    const identicals = {};
    result.leftovers.forEach(t => { const k = `${t.number}_${t.color}`; if (!identicals[k]) identicals[k] = []; identicals[k].push(t); });
    Object.keys(identicals).forEach(k => {
        let list = identicals[k];
        while (list.length >= 2) {
            const pair = [list.pop(), list.pop()];
            result.pairs.push(pair);
            pair.forEach(t => removeTileFromList(result.leftovers, t));
        }
    });

    // 4. STRATEJİK OKEY KULLANIMI: TÜM ADAYLARI PUANA GÖRE SIRALA
    if (okeys.length > 0) {
        let allCandidates = [];

        // Seri Adayları (Run candidates)
        const runCands = groupTilesByColor(result.leftovers);
        Object.keys(runCands).forEach(clr => {
            let list = runCands[clr].sort((a, b) => a.number - b.number);
            for (let i = 0; i < list.length - 1; i++) {
                if (list[i + 1].number === list[i].number + 1 || list[i + 1].number === list[i].number + 2) {
                    const group = [list[i], list[i + 1]];
                    let potentialVal = evaluateCluster([...group, okeys[0]]).points;
                    allCandidates.push({ tiles: group, val: potentialVal, type: 'run' });
                }
            }
        });

        // Set Adayları (Set candidates)
        const setCands = groupTilesByNumber(result.leftovers);
        Object.keys(setCands).forEach(num => {
            let list = setCands[num];
            if (list.length >= 2) {
                if (list[0].color !== list[1].color) {
                    const group = [list[0], list[1]];
                    let potentialVal = evaluateCluster([...group, okeys[0]]).points;
                    allCandidates.push({ tiles: group, val: potentialVal, type: 'set' });
                }
            }
        });

        // EN YÜKSEK PUAN GETİREN ADAYLARA OKEYLERİ DAĞIT
        allCandidates.sort((a, b) => b.val - a.val);

        allCandidates.forEach(cand => {
            if (okeys.length > 0) {
                const stillActive = cand.tiles.every(t => result.leftovers.find(it => it.id === t.id));
                if (stillActive) {
                    result.complete.push([...cand.tiles, okeys.pop()]);
                    cand.tiles.forEach(t => removeTileFromList(result.leftovers, t));
                }
            }
        });
    }

    // Kalan Okeyleri Başa Al
    okeys.forEach(o => result.leftovers.unshift(o));
    return result;
}

// YARDIMCI FOKSİYONLAR
function removeTileFromList(list, tile) {
    const idx = list.findIndex(t => t.id === tile.id);
    if (idx !== -1) list.splice(idx, 1);
}
function groupTilesByNumber(list) {
    const res = {};
    list.forEach(t => { if (!res[t.number]) res[t.number] = []; res[t.number].push(t); });
    return res;
}
function groupTilesByColor(list) {
    const res = {};
    list.forEach(t => { if (!res[t.color]) res[t.color] = []; res[t.color].push(t); });
    return res;
}
function findCompleteSets(list) {
    const sets = [];
    const grouped = groupTilesByNumber(list);
    Object.keys(grouped).forEach(num => {
        let u = []; let s = new Set();
        grouped[num].forEach(t => { if (!s.has(t.color)) { u.push(t); s.add(t.color); } });
        if (u.length >= 3) sets.push(u);
    });
    return sets;
}
function findCompleteRuns(list) {
    const runs = [];
    const grouped = groupTilesByColor(list);
    Object.keys(grouped).forEach(clr => {
        let l = grouped[clr].sort((a, b) => a.number - b.number);
        let temp = [];
        for (let i = 0; i < l.length; i++) {
            if (temp.length === 0 || l[i].number === temp[temp.length - 1].number + 1) temp.push(l[i]);
            else { if (temp.length >= 3) runs.push([...temp]); temp = [l[i]]; }
        }
        if (temp.length >= 3) runs.push(temp);
    });
    return runs;
}

function autoSortSeries() {
    const userHand = gameState.players.user.hand.filter(t => t);
    let { complete, pairs, potential, leftovers } = findGroups(userHand);

    gameState.userRackSlots.fill(null);
    let currentIdx = 0;
    complete.forEach(group => { group.forEach(t => { if (currentIdx < 40) gameState.userRackSlots[currentIdx++] = t; }); currentIdx++; });
    pairs.forEach(pair => { pair.forEach(t => { if (currentIdx < 40) gameState.userRackSlots[currentIdx++] = t; }); currentIdx++; });
    potential.forEach(group => { group.forEach(t => { if (currentIdx < 40) gameState.userRackSlots[currentIdx++] = t; }); currentIdx++; });
    leftovers.sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color) || a.number - b.number)
        .forEach(t => { if (currentIdx < 40) gameState.userRackSlots[currentIdx++] = t; });

    renderUserRack();
    showGameMessage("Dizilim tamamlandı.");
}

function autoSortPairs() {
    let hand = [...gameState.players.user.hand.filter(t => t)];
    let pairs = [];
    hand.sort((a, b) => a.number - b.number || a.color.localeCompare(b.color));
    for (let i = 0; i < hand.length - 1; i++) {
        if (!hand[i].isJoker && hand[i].number === hand[i + 1].number && hand[i].color === hand[i + 1].color) {
            pairs.push([hand[i], hand[i + 1]]);
            hand.splice(i, 2); i--;
        }
    }
    let { complete, potential, leftovers } = findGroups(hand);
    gameState.userRackSlots.fill(null);
    let currentIdx = 0;
    pairs.forEach(p => { if (currentIdx < 39) { gameState.userRackSlots[currentIdx++] = p[0]; gameState.userRackSlots[currentIdx++] = p[1]; currentIdx++; } });
    complete.forEach(g => { g.forEach(t => { if (currentIdx < 40) gameState.userRackSlots[currentIdx++] = t; }); currentIdx++; });
    potential.forEach(g => { g.forEach(t => { if (currentIdx < 40) gameState.userRackSlots[currentIdx++] = t; }); currentIdx++; });
    leftovers.sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color) || a.number - b.number).forEach(t => { if (currentIdx < 40) gameState.userRackSlots[currentIdx++] = t; });
    renderUserRack();
    showGameMessage("Hibrit dizilim tamamlandı.");
}

// --- DOM LİSTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    // Otomatik Ekran Döndürme Denemesi (PWA Dostu)
    const tryLockOrientation = () => {
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(err => {
                console.log("Oryantasyon kilidi denendi (PWA/Tam ekran gerekli):", err.message);
            });
        }
    };
    tryLockOrientation();

    // Statik Butonlar
    const btnDraw = document.getElementById('btn-draw-stone');
    if (btnDraw) btnDraw.onclick = () => handleDraw(-1);

    const btnSortSeries = document.getElementById('btn-sort-series');
    if (btnSortSeries) btnSortSeries.onclick = autoSortSeries;

    const btnSortPairs = document.getElementById('btn-sort-pairs');
    if (btnSortPairs) btnSortPairs.onclick = autoSortPairs;

    const btnDiscard = document.getElementById('btn-discard');
    if (btnDiscard) {
        btnDiscard.onclick = () => {
            if (gameState.selectedTileIds.size === 1) {
                const id = [...gameState.selectedTileIds][0];
                processUserDiscard(id);
            } else {
                showGameMessage("Önce bir taş seç!");
            }
        };
    }

    const btnOpenSeries = document.getElementById('btn-open-series');
    if (btnOpenSeries) btnOpenSeries.onclick = openSeries;

    const btnOpenPairs = document.getElementById('btn-open-pairs');
    if (btnOpenPairs) btnOpenPairs.onclick = openPairs;

    // --- NAV BUTONLARI ---
    const newGameBtn = document.getElementById('new-game-top');
    if (newGameBtn) newGameBtn.onclick = () => {
        if (confirm("Yeni oyun başlatılsın mı? Tüm puanlar sıfırlanacak.")) location.reload();
    };

    const yazbozBtn = document.getElementById('show-yazboz');
    if (yazbozBtn) yazbozBtn.onclick = () => showYazboz();

    const nextRoundBtn = document.getElementById('next-round-btn');
    if (nextRoundBtn) nextRoundBtn.onclick = startNewHand;

    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) restartBtn.onclick = () => location.reload();

    // --- AYARLAR ---
    let roundsVal = gameState.maxRounds;
    const roundsDisplay = document.getElementById('rounds-display');

    const openSettings = document.getElementById('open-settings');
    if (openSettings) openSettings.onclick = () => {
        const fields = { 'name-user': 'user', 'name-bot1': 'bot1', 'name-bot2': 'bot2', 'name-bot3': 'bot3' };
        Object.entries(fields).forEach(([id, pId]) => {
            const el = document.getElementById(id);
            if (el) el.value = gameState.players[pId].name;
        });
        roundsVal = gameState.maxRounds;
        if (roundsDisplay) roundsDisplay.textContent = roundsVal;
        document.getElementById('settings-modal').style.display = 'flex';
    };

    document.getElementById('rounds-dec')?.addEventListener('click', () => {
        if (roundsVal > 1) { roundsVal--; if (roundsDisplay) roundsDisplay.textContent = roundsVal; }
    });
    document.getElementById('rounds-inc')?.addEventListener('click', () => {
        if (roundsVal < 11) { roundsVal++; if (roundsDisplay) roundsDisplay.textContent = roundsVal; }
    });

    const saveSettings = document.getElementById('save-settings');
    if (saveSettings) saveSettings.onclick = () => {
        const fields = { 'name-user': 'user', 'name-bot1': 'bot1', 'name-bot2': 'bot2', 'name-bot3': 'bot3' };
        Object.entries(fields).forEach(([id, pId]) => {
            const val = document.getElementById(id)?.value.trim();
            if (val) gameState.players[pId].name = val;
        });
        const nameMap = { bot1: '#bot-1 .name-tag', bot2: '#bot-2 .name-tag', bot3: '#bot-3 .name-tag' };
        Object.entries(nameMap).forEach(([pId, sel]) => {
            const el = document.querySelector(sel);
            if (el) el.textContent = gameState.players[pId].name;
        });
        const userNameTag = document.querySelector('.user-name');
        if (userNameTag) userNameTag.textContent = gameState.players.user.name;
        gameState.maxRounds = roundsVal;
        document.getElementById('settings-modal').style.display = 'none';
        showGameMessage(`Kaydedildi! (${roundsVal} el)`);
    };

    // Modallara arka plan tıklamasıyla kapat
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    });

    // Deste Sürükleme
    const deckPile = document.getElementById('deck-pile');
    if (deckPile) {
        deckPile.draggable = true;
        deckPile.addEventListener('dragstart', (e) => { e.dataTransfer.setData('source', 'deck'); });
        deckPile.addEventListener('touchstart', (e) => {
            if (gameState.turnOrder[gameState.currentTurnIndex] === 'user' && !gameState.hasDrawn) {
                gameState.touch.sourceType = 'deck';
                createPhantom(deckPile);
            }
        }, { passive: false });
        window.addEventListener('touchmove', (e) => {
            if (gameState.touch.phantom) {
                const t = e.touches[0];
                gameState.touch.phantom.style.left = (t.clientX - 16) + 'px';
                gameState.touch.phantom.style.top = (t.clientY - 24) + 'px';
                e.preventDefault();
            }
        }, { passive: false });
        window.addEventListener('touchend', handleTouchEnd);
    }

    // Atma Alanları
    document.querySelectorAll('.discard-zone').forEach(zone => {
        const getPID = (z) => z.id.replace('discard-', '').replace('bot-', 'bot');
        const expand = () => { zone.classList.add('expanded'); renderDiscardZone(getPID(zone)); };
        const collapse = () => { zone.classList.remove('expanded'); renderDiscardZone(getPID(zone)); };
        zone.onmousedown = zone.ontouchstart = (e) => { e.preventDefault(); expand(); };
        zone.onmouseup = zone.onmouseleave = zone.ontouchend = zone.ontouchcancel = () => collapse();
        zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('drag-over'); };
        zone.ondragleave = () => zone.classList.remove('drag-over');
        zone.ondrop = (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const id = e.dataTransfer.getData('tileId');
            if (id && zone.id === 'discard-user') processUserDiscard(id);
        };
    });

    // Başlangıç
    initGame();
});
