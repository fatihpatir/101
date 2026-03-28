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
        user: { name: 'Fatih', hand: [], score: 0, hasOpened: false, openedType: null },
        bot1: { name: 'Samet', hand: [], score: 0, hasOpened: false, openedType: null },
        bot2: { name: 'Deniz', hand: [], score: 0, hasOpened: false, openedType: null },
        bot3: { name: 'Sinem', hand: [], score: 0, hasOpened: false, openedType: null }
    },
    startingPlayerIdx: 0, // NEW: Her el dönecek
    userRackSlots: new Array(40).fill(null),
    selectedTileIds: new Set(),
    table: { user: [], bot1: [], bot2: [], bot3: [] },
    discards: {},
    pairsOpened: false,
    lastDiscard: null,
    currentRound: 1,
    maxRounds: 5,
    roundScores: { user: [], bot1: [], bot2: [], bot3: [] },
    roundPenalties: { user: 0, bot1: 0, bot2: 0, bot3: 0 },
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

        // Mobile için hızlı seçim ve rotasyon (Drag ile çakışmayı önleyerek)
        div.addEventListener('touchstart', (e) => {
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
            this.touchStartTime = Date.now();
        }, { passive: true });

        div.addEventListener('touchend', (e) => {
            if (!this.touchStartTime) return;
            const duration = Date.now() - this.touchStartTime;
            const touch = e.changedTouches[0];
            const moveX = Math.abs(touch.clientX - this.touchStartX);
            const moveY = Math.abs(touch.clientY - this.touchStartY);

            // Eğer çok kısa süreli bir dokunuşsa ve el pek hareket etmediyse "Tık" say
            if (duration < 250 && moveX < 10 && moveY < 10) {
                 // e.preventDefault(); // Click'i tetikleyebiliriz veya burada direkt çağırabiliriz
                 toggleTileSelection(this.id);
            }
            this.touchStartTime = 0;
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

        // Eğer ilk oynayan kişi bot ise döngüyü başlat
        if (gameState.turnOrder[gameState.currentTurnIndex] !== 'user') {
            setTimeout(botPlay, 1000);
        }
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
    const playersIds = gameState.turnOrder; // ['user', 'bot3', 'bot2', 'bot1']
    
    // Dağıtma mantığını startingPlayerIdx'e göre yapıyoruz
    playersIds.forEach((pId, i) => {
        const count = (i === gameState.startingPlayerIdx) ? 22 : 21;
        gameState.players[pId].hand = gameState.deck.splice(0, count);
    });

    // Istakaya diz
    gameState.userRackSlots.fill(null);
    gameState.players.user.hand.forEach((tile, i) => {
        if (i < 40) gameState.userRackSlots[i] = tile;
    });

    gameState.currentTurnIndex = gameState.startingPlayerIdx;
    // KURAL: 22 taşla başlayan kişi çekmeden (zaten 22 var) atarak başlar.
    gameState.hasDrawn = true; 
}

// --- RENDERING (ARAYÜZ ÇİZİMİ) ---
function renderAll() {
    renderUserRack();
    renderIndicator();
    renderTable(); // Masaya açılanları göster
    updateDeckCount();
    updateTurnUI();
    updateHandPoints();
    renderAllDiscardZones(); // Tüm atılan taşları render et
}

function renderTable() {
    const seriesField = document.getElementById('series-field');
    const pairsField = document.getElementById('pairs-field');

    if (seriesField) seriesField.innerHTML = '';
    if (pairsField) pairsField.innerHTML = '';

    if (!gameState.table || !gameState.table.user) return;

    // Her oyuncunun açtığı grupları tara
    const owners = ['user', 'bot1', 'bot2', 'bot3'];
    owners.forEach(owner => {
        const groups = gameState.table[owner] || [];
        groups.forEach((group, groupIdx) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'table-group';
            groupEl.dataset.index = groupIdx;
            groupEl.dataset.owner = owner;

            const isRun = getRunPoints(group) > 0;
            const isSet = getSetPoints(group) > 0;

            // Başlangıç işleme kutusu (Sadece kullanıcı taş işleyebilir, veya botlar otomatik işler)
            // Biz şimdilik görsel olarak hep koyalım
            if (isRun) {
                const preSlot = createProcessSlot(groupIdx, owner, 'start');
                groupEl.appendChild(preSlot);
            }

            group.forEach(tile => {
                const tEl = tile.createHTMLElement(true);
                tEl.classList.add('table-tile');
                groupEl.appendChild(tEl);
            });

            // Bitiş işleme kutusu
            if (isRun || (isSet && group.length < 4)) {
                const postSlot = createProcessSlot(groupIdx, owner, 'end');
                groupEl.appendChild(postSlot);
            }

            if ((group.length === 2 || (isSet && group.length === 2)) && pairsField) {
                pairsField.appendChild(groupEl);
            } else if (seriesField) {
                seriesField.appendChild(groupEl);
            }
        });
    });
}

function createProcessSlot(groupIdx, owner, pos) {
    const slot = document.createElement('div');
    slot.className = 'process-slot';
    slot.innerHTML = '+';

    slot.ondragover = (e) => { e.preventDefault(); slot.classList.add('drag-over'); };
    slot.ondragleave = () => slot.classList.remove('drag-over');
    slot.ondrop = (e) => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        const tileId = e.dataTransfer.getData('tileId');
        if (tileId) handleProcessTile(tileId, groupIdx, owner);
    };

    // Tıklama ile işleme (Eğer bir taş seçiliyse)
    slot.onclick = () => {
        if (gameState.selectedTileIds.size === 1) {
            const tileId = [...gameState.selectedTileIds][0];
            handleProcessTile(tileId, groupIdx, owner);
        } else {
            showGameMessage("İşlemek için önce ıstakadan bir taş seç!");
        }
    };

    return slot;
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
    const player = gameState.players.user;
    if (player.openedType === 'pairs') {
        showGameMessage("Çift açtığın için artık seri inemezsin kral!");
        return;
    }
    if (!gameState.hasDrawn) {
        showGameMessage("Önce taş çekmelisin kral!");
        return;
    }
    const isAlreadyOpen = player.hasOpened;
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
    gameState.table.user.push(...openedGroups);

    // Her bir taşı hand içinden de sil
    openedGroups.forEach(group => {
        group.forEach(tile => {
            player.hand = player.hand.filter(t => t.id !== tile.id);
        });
    });

    slotsToClear.forEach(idx => gameState.userRackSlots[idx] = null);

    player.hasOpened = true;
    player.openedType = 'series';
    renderAll();
    showGameMessage(isAlreadyOpen ? "Yeni perler masaya indi." : "Tebrikler, masaya 101 açıldı!");
}

function openPairs() {
    const player = gameState.players.user;
    if (!gameState.hasDrawn) {
        showGameMessage("Önce taş çekmelisin kral!");
        return;
    }
    
    // Seri açmış biri çift kısmına ancak başkası çift açmışsa inebilir
    if (player.openedType === 'series' && !gameState.pairsOpened) {
        showGameMessage("Henüz kimse çift açmadı, seri açan olarak sen açamazsın.");
        return;
    }

    let openedPairs = [];
    let slotsToClear = [];
    let currentCluster = [];
    let totalPairsFound = 0;

    for (let i = 0; i < gameState.userRackSlots.length; i++) {
        const tile = gameState.userRackSlots[i];
        if (tile) {
            currentCluster.push(tile);
            slotsToClear.push(i);
        } else {
            if (currentCluster.length === 2) {
                const [t1, t2] = currentCluster;
                if ((t1.number === t2.number && t1.color === t2.color) || isWildCard(t1) || isWildCard(t2)) {
                    openedPairs.push([...currentCluster]);
                    totalPairsFound++;
                } else {
                    slotsToClear = slotsToClear.slice(0, slotsToClear.length - 2);
                }
            } else if (currentCluster.length > 0) {
                slotsToClear = slotsToClear.slice(0, slotsToClear.length - currentCluster.length);
            }
            currentCluster = [];
        }
    }
    if (currentCluster.length === 2) {
        const [t1, t2] = currentCluster;
        if ((t1.number === t2.number && t1.color === t2.color) || isWildCard(t1) || isWildCard(t2)) {
            openedPairs.push([...currentCluster]);
            totalPairsFound++;
        } else {
            slotsToClear = slotsToClear.slice(0, slotsToClear.length - 2);
        }
    }

    // KURAL KONTROLÜ:
    if (player.openedType !== 'series' && player.openedType !== 'pairs') {
         // İlk defa açıyor (Çift ile açmaya çalışıyor)
         if (totalPairsFound < 5) {
             showGameMessage(`Çift açmak için 5 çift gerekli (şu an: ${totalPairsFound}).`);
             return;
         }
    }

    if (openedPairs.length === 0) {
        showGameMessage("İnecek geçerli çift bulunamadı.");
        return;
    }

    // MASAYA SER VE RACKTEN SİL
    gameState.table.user.push(...openedPairs);
    openedPairs.forEach(pair => {
        pair.forEach(tile => {
            player.hand = player.hand.filter(t => t.id !== tile.id);
        });
    });
    slotsToClear.forEach(idx => gameState.userRackSlots[idx] = null);

    const isFirstTime = !player.hasOpened;
    player.hasOpened = true;
    if (player.openedType === null) player.openedType = 'pairs';
    gameState.pairsOpened = true;

    renderAll();
    showGameMessage(isFirstTime ? "Tebrikler, masaya 5 çift açıldı!" : "Çiftler masaya indi.");
}

function handleProcessTile(tileId, groupIdx, owner) {
    const rackIdx = gameState.userRackSlots.findIndex(t => t?.id === tileId);
    if (rackIdx === -1) return;

    const tile = gameState.userRackSlots[rackIdx];
    const group = gameState.table[owner][groupIdx];

    // --- OKEY ÇALMA KONTROLÜ ---
    const okeyInGroupIdx = group.findIndex(t => isWildCard(t));
    if (okeyInGroupIdx !== -1) {
        // Bu grupta bir okey var. Çalınabilir mi?
        const subs = getOkeySubstitutes(group);
        const targetOkey = group[okeyInGroupIdx];
        const requiredTile = subs[targetOkey.id];

        if (requiredTile) {
            const matchesNumber = tile.number === requiredTile.number;
            const matchesColor = requiredTile.multipleColors 
                ? !group.some(t => t.color === tile.color && !isWildCard(t)) // Set için renk kontrolü
                : tile.color === requiredTile.color; // Seri için renk kontrolü

            if (matchesNumber && matchesColor) {
                // OKEY ÇALINDI!
                group[okeyInGroupIdx] = tile; // Gerçek taşı koy
                gameState.userRackSlots[rackIdx] = targetOkey; // Okeyi ıstakaya ver
                targetOkey.isFlipped = false; // Okey ıstakada açık dursun
                
                // CEZA: Okeyi masaya açan kişiye 101 puan ekle
                gameState.players[owner].score += 101;
                gameState.roundScores[owner][gameState.roundScores[owner].length - 1] += 101;
                
                renderAll();
                showGameMessage(`OKEY ÇALINDI! ${gameState.players[owner].name}'e +101 Ceza! 🔥`);
                return;
            }
        }
    }

    // --- NORMAL İŞLEME KONTROLÜ ---
    const hypotheticalGroup = [...group, tile];
    const isNowRun = getRunPoints(hypotheticalGroup) > 0;
    const isNowSet = getSetPoints(hypotheticalGroup) > 0;

    if (isNowRun || isNowSet) {
        group.push(tile);
        if (isNowRun) group.sort((a, b) => a.number - b.number);
        
        gameState.userRackSlots[rackIdx] = null;
        renderAll();
        showGameMessage("Taş başarıyla işlendi! 🔥");
    } else {
        showGameMessage("Bu taş bu perle uyumlu değil.");
    }
}

function getOkeySubstitutes(group) {
    const subs = {};
    if (!group || group.length < 3) return subs;

    // Check if it's a RUN (Seri)
    const runPoints = getRunPoints(group);
    if (runPoints > 0) {
        const sorted = [...group].sort((a, b) => a.number - b.number || a.color.localeCompare(b.color));
        const baseColor = sorted.find(t => !isWildCard(t))?.color;
        const firstNonWildIdx = sorted.findIndex(t => !isWildCard(t));
        const startNum = sorted[firstNonWildIdx].number - sorted.findIndex(t => !isWildCard(t));

        sorted.forEach((t, i) => {
            if (isWildCard(t)) {
                subs[t.id] = { number: startNum + i, color: baseColor, multipleColors: false };
            }
        });
        return subs;
    }

    // Check if it's a SET (Set)
    const setPoints = getSetPoints(group);
    if (setPoints > 0) {
        const num = group.find(t => !isWildCard(t))?.number;
        group.forEach(t => {
            if (isWildCard(t)) {
                subs[t.id] = { number: num, multipleColors: true };
            }
        });
        return subs;
    }
    return subs;
}

function isValidAddition(tile, group) {
    if (!group || group.length === 0) return false;
    
    // 1. SET KONTROLÜ (Aynı sayılar, farklı renkler)
    const setPoints = getSetPoints(group);
    if (setPoints > 0) {
        if (tile.number !== group.find(t => !isWildCard(t))?.number && !isWildCard(tile)) return false;
        if (group.length >= 4) return false;
        // Renk zaten var mı?
        const hasColor = group.some(t => t.color === tile.color && !isWildCard(t));
        if (hasColor && !isWildCard(tile)) return false;
        return true;
    }

    // 2. SERİ KONTROLÜ (Aynı renk, sıralı sayılar)
    const runPoints = getRunPoints(group);
    if (runPoints > 0) {
        const baseColor = group.find(t => !isWildCard(t))?.color;
        if (tile.color !== baseColor && !isWildCard(tile)) return false;
        
        const nums = group.map(t => t.number).sort((a, b) => a - b);
        const min = nums[0];
        const max = nums[nums.length - 1];
        
        // Klasik Okey'de 13'ten sonra 1 gelmez.
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
        if ((t1.number === t2.number && t1.color === t2.color) || isWildCard(t1) || isWildCard(t2)) {
            pairs = 1;
        }
    }
    return { points, pairs };
}

function getSetPoints(tiles) {
    if (!tiles || tiles.length < 3) return 0;
    const nonWilds = tiles.filter(t => !isWildCard(t));
    if (nonWilds.length === 0) return 0; 

    const num = nonWilds[0].number;
    const colors = new Set();
    for (let t of tiles) {
        if (!isWildCard(t)) {
            if (t.number !== num) return 0;
            if (colors.has(t.color)) return 0;
            colors.add(t.color);
        }
    }
    if (tiles.length > 4) return 0;
    return num * tiles.length;
}

function getRunPoints(tiles) {
    if (!tiles || tiles.length < 3) return 0;
    const sorted = [...tiles].sort((a, b) => a.number - b.number || a.color.localeCompare(b.color));
    
    // OKEY KURALI: Eğer 1 en sonda ise ve başlarda 12-13 varsa özel durum (12-13-1)
    // Şimdilik standart ardışıklık yapalım.
    
    const baseColor = sorted.find(t => !isWildCard(t))?.color;
    if (!baseColor) return 0;

    // Renk kontrolü ve ardışıklık
    let firstNonWildIdx = sorted.findIndex(t => !isWildCard(t));
    let startNum = sorted[firstNonWildIdx].number - firstNonWildIdx;

    let totalPoints = 0;
    for (let i = 0; i < sorted.length; i++) {
        const expectedNum = startNum + i;
        if (expectedNum < 1 || expectedNum > 13) {
            // Belki 13'ten sonra 1 geliyordur?
            // "12-13-1" için özel kontrol buraya eklenebilir.
            return 0; 
        }

        const t = sorted[i];
        if (!isWildCard(t)) {
            if (t.color !== baseColor || t.number !== expectedNum) return 0;
        }
        totalPoints += expectedNum;
    }

    return totalPoints;
}

function finishRound(winnerId = null, lastDiscardedTile = null) {
    logDebug("EL BİTTİ. PUANLAR HESAPLANIYOR...");

    let okeyDiscarded = (winnerId && lastDiscardedTile && isWildCard(lastDiscardedTile));
    let isPairsFinish = winnerId ? (gameState.players[winnerId].openedType === 'pairs') : false;
    
    // Elden Bitme Kontrolü: Kazananın dışında hiç kimse el açmamışsa
    let othersOpened = false;
    if (winnerId) {
        for (let p in gameState.players) {
            if (p !== winnerId && gameState.players[p].hasOpened) {
                othersOpened = true;
                break;
            }
        }
    }
    let isEldenBitme = winnerId && !othersOpened;

    let winnerDeduction = 0;
    let otherMultiplier = 1;
    let otherFlatPenalty = 0;

    if (winnerId) {
        if (isEldenBitme) {
            if (okeyDiscarded) {
                winnerDeduction = -1600;
                otherFlatPenalty = 1600;
            } else {
                winnerDeduction = -808;
                otherFlatPenalty = 808;
            }
        } else {
            if (isPairsFinish && okeyDiscarded) {
                winnerDeduction = -404;
                otherMultiplier = 4;
            } else if (isPairsFinish && !okeyDiscarded) {
                winnerDeduction = -202;
                otherMultiplier = 2;
            } else if (!isPairsFinish && okeyDiscarded) {
                winnerDeduction = -202;
                otherMultiplier = 2;
            } else {
                winnerDeduction = -101;
                otherMultiplier = 1;
            }
        }
    }

    for (let pId in gameState.players) {
        const player = gameState.players[pId];
        let penalty = 0;

        if (pId === winnerId) {
            penalty = winnerDeduction;
        } else {
            if (isEldenBitme) {
                penalty = otherFlatPenalty;
            } else {
                if (!player.hasOpened) {
                    penalty = 202;
                } else {
                    const rackTiles = (pId === 'user')
                        ? gameState.userRackSlots.filter(t => t)
                        : player.hand;
                    penalty = rackTiles.reduce((sum, t) => sum + (t.number || 0), 0);
                    
                    // KURAL: Çiftten açanın elindeki ceza 2 katına katlanır
                    if (player.openedType === 'pairs') {
                        penalty *= 2;
                    }
                }
                // Kazananın bitiş şekline göre kalanlara çarpan eklenir (okey dışarı / çiftten bitme)
                penalty *= otherMultiplier;
            }
        }

        player.score += penalty + (gameState.roundPenalties[pId] || 0);
        gameState.roundScores[pId].push(penalty + (gameState.roundPenalties[pId] || 0));
    }
    // Cezaları sıfırla
    gameState.roundPenalties = { user: 0, bot1: 0, bot2: 0, bot3: 0 };

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
    const savedStartingIdx = (gameState.startingPlayerIdx + 1) % 4; // NEW: El değiştir
    const savedRoundScores = JSON.parse(JSON.stringify(gameState.roundScores));
    const savedMaxRounds = gameState.maxRounds;
    const savedCurrentRound = gameState.currentRound + 1;

    // State'i sıfırla
    gameState.deck = [];
    gameState.okeyTile = null;
    gameState.indicatorTile = null;
    gameState.table = { user: [], bot1: [], bot2: [], bot3: [] };
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
    gameState.startingPlayerIdx = savedStartingIdx; // NEW
    gameState.roundPenalties = { user: 0, bot1: 0, bot2: 0, bot3: 0 };

    for (let p in gameState.players) {
        gameState.players[p].name = savedNames[p];
        gameState.players[p].score = savedScores[p];
        gameState.players[p].hand = [];
        gameState.players[p].hasOpened = false;
        gameState.players[p].openedType = null;
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
    const turnOrder = gameState.turnOrder;
    const currentId = turnOrder[gameState.currentTurnIndex];

    // Temizlik: Tüm vurguları kaldır
    document.querySelectorAll('.player-slot, .user-bottom, .name-tag').forEach(el => {
        el.classList.remove('active-turn');
    });

    // Aktif olanı vurgula
    const playerElId = currentId === 'user' ? 'player-user' : currentId;
    const playerEl = document.getElementById(playerElId);
    
    if (playerEl) {
        playerEl.classList.add('active-turn');
        const nameTag = playerEl.querySelector('.name-tag');
        if (nameTag) nameTag.classList.add('active-turn');
    }

    // Deste parlaması
    const deckPile = document.getElementById('deck-pile');
    if (deckPile) {
        if (currentId === 'user' && !gameState.hasDrawn) deckPile.classList.add('your-turn-pulse');
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

    // --- İŞLEK TAŞ KONTROLÜ (CEZA) ---
    let isIshlek = false;
    const owners = ['user', 'bot1', 'bot2', 'bot3'];
    owners.forEach(owner => {
        (gameState.table[owner] || []).forEach(group => {
            if (isValidAddition(tile, group)) isIshlek = true;
        });
    });

    if (isIshlek) {
        gameState.roundPenalties.user += 101;
        showGameMessage("EYVAH! İşlek Taş Attın! +101 Ceza! 🔴", "error");
        logDebug("Kullanıcı işlek taş attı, +101 ceza.");
    }

    // Istaknadan ve elden sil
    gameState.players.user.hand = gameState.players.user.hand.filter(t => t.id !== tileId);
    const rackIdx = gameState.userRackSlots.findIndex(t => t?.id === tileId);
    if (rackIdx !== -1) gameState.userRackSlots[rackIdx] = null;

    renderDiscard('user', tile);
    gameState.selectedTileIds.delete(tileId);

    if (gameState.players.user.hand.length === 0) {
        finishRound('user', tile);
        return;
    }

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
    renderAllDiscardZones(); // Çalınabilir taş durumunu güncelle

    const currentPlayerId = gameState.turnOrder[gameState.currentTurnIndex];
    if (currentPlayerId !== 'user') {
        setTimeout(botPlay, 1000);
    }
}

async function botPlay() {
    const botId = gameState.turnOrder[gameState.currentTurnIndex];
    const bot = gameState.players[botId];

    // 1. Çekme Kararı (Şimdilik hep desteden çeksin, çalma mantığı sonra eklenecek)
    if (bot.hand.length < 22 && gameState.deck.length > 0) {
        bot.hand.push(gameState.deck.pop());
        updateDeckCount();
    }

    await new Promise(r => setTimeout(r, 800));

    // 2. Eli Değerlendir
    let { complete, pairs, potential, leftovers } = findGroups(bot.hand);

    // 3. El Açma Mantığı
    if (!bot.hasOpened) {
        let totalPts = complete.reduce((sum, g) => sum + evaluateCluster(g).points, 0);
        let totalPairs = pairs.length;

        if (totalPts >= 101 && bot.openedType !== 'pairs') {
            // Seri Aç
            complete.forEach(group => {
                gameState.table[botId].push(group);
                // Hand'den sil
                group.forEach(t => removeTileFromList(bot.hand, t));
            });
            bot.hasOpened = true;
            bot.openedType = 'series';
            showGameMessage(`${bot.name} seriden açtı! 🚀`);
        } else if (bot.openedType === 'series' && gameState.pairsOpened && pairs.length > 0) {
            // Seri açmış bir bot, eğer çift alanı aktifse kalan çiftlerini insin
            pairs.forEach(pair => {
                gameState.table[botId].push(pair);
                pair.forEach(t => removeTileFromList(bot.hand, t));
            });
            showGameMessage(`${bot.name} elindeki çiftleri döküyor! 🔥`);
        } else if (!bot.hasOpened && totalPairs >= 5 && !gameState.pairsOpened) {
            // Çift Aç
            pairs.forEach(pair => {
                gameState.table[botId].push(pair);
                pair.forEach(t => removeTileFromList(bot.hand, t));
            });
            bot.hasOpened = true;
            bot.openedType = 'pairs';
            gameState.pairsOpened = true;
            showGameMessage(`${bot.name} çiftten açtı! 🔥`);
        }
    }

    // 4. İşleme Mantığı (Eğer açmışsa veya başkası açmışsa - Basitleştirilmiş)
    if (bot.hasOpened) {
        botProcessTiles(botId);
    }

    await new Promise(r => setTimeout(r, 600));

    // 5. Taş Atma (İşlek Olmayan En Gereksiz Taşı Bul)
    if (bot.hand.length > 0) {
        let tileToDiscard;
        let isIshlekDiscard = false;

        // Önce işlek olmayan (masaya girmeyen) taşları bulalım
        const findGoodDiscard = () => {
             const allNonIshlek = bot.hand.filter(t => {
                 let isIshlek = false;
                 const owners = ['user', 'bot1', 'bot2', 'bot3'];
                 owners.forEach(ow => {
                     (gameState.table[ow] || []).forEach(g => { if (isValidAddition(t, g)) isIshlek = true; });
                 });
                 return !isIshlek;
             });

             if (allNonIshlek.length === 0) return null;

             // Bunların içinden "boşta" (leftover) olanları tercih et (per bozmamak için)
             const { leftovers } = findGroups(bot.hand);
             const nonIshlekLeftovers = allNonIshlek.filter(t => leftovers.some(l => l.id === t.id));

             if (nonIshlekLeftovers.length > 0) {
                 const nonOkey = nonIshlekLeftovers.filter(t => !isWildCard(t));
                 return nonOkey.length > 0 ? nonOkey.sort((a,b) => b.number - a.number)[0] : nonIshlekLeftovers[0];
             }

             // Mecbursak per bozacağız ama yine de işlek olanı atmayacağız!
             const nonOkey = allNonIshlek.filter(t => !isWildCard(t));
             return nonOkey.length > 0 ? nonOkey.sort((a,b) => b.number - a.number)[0] : allNonIshlek[0];
        };

        tileToDiscard = findGoodDiscard();

        if (!tileToDiscard) {
            // Hepsi işlek ise, mecburen en büyük olanı at ve ceza ye
            tileToDiscard = bot.hand.sort((a,b) => b.number - a.number)[0];
            isIshlekDiscard = true;
        }

        if (isIshlekDiscard) {
            gameState.roundPenalties[botId] += 101;
            showGameMessage(`${bot.name} işlek taş attı! +101 Ceza! 🔴`);
        }

        // Hand'den çıkar ve at
        const idx = bot.hand.findIndex(t => t.id === tileToDiscard.id);
        if (idx !== -1) bot.hand.splice(idx, 1);
        renderDiscard(botId, tileToDiscard);
        
        if (bot.hand.length === 0) {
            finishRound(botId, tileToDiscard);
            return;
        }
    }

    renderAll();
    nextTurn();
}

function botProcessTiles(botId) {
    const bot = gameState.players[botId];
    let changed = true;
    
    // Döngü: Elimizdeki tüm taşlar bitene veya masaya eklenecek taş kalmayana kadar tara
    while (changed) {
        changed = false;
        const owners = ['user', 'bot1', 'bot2', 'bot3'];

        owners.forEach(owner => {
            const tableGroups = gameState.table[owner] || [];
            tableGroups.forEach((group, gIdx) => {
                // --- BOT OKEY ÇALMA KONTROLÜ ---
                const okeyIdx = group.findIndex(t => isWildCard(t));
                if (okeyIdx !== -1) {
                    const subs = getOkeySubstitutes(group);
                    const targetOkey = group[okeyIdx];
                    const requiredTile = subs[targetOkey.id];

                    if (requiredTile) {
                        for (let i = 0; i < bot.hand.length; i++) {
                            const tile = bot.hand[i];
                            const matchesNumber = tile.number === requiredTile.number;
                            const matchesColor = requiredTile.multipleColors 
                                ? !group.some(t => t.color === tile.color && !isWildCard(t))
                                : tile.color === requiredTile.color;

                            if (matchesNumber && matchesColor) {
                                // BOT OKEYİ ÇALDI!
                                group[okeyIdx] = tile;
                                bot.hand.splice(i, 1);
                                bot.hand.push(targetOkey);
                                
                                gameState.players[owner].score += 101;
                                logDebug(`${bot.name}, ${gameState.players[owner].name}'den Okey çaldı!`);
                                showGameMessage(`${bot.name} Okey Çaldı! 🔥`);
                                changed = true;
                                break;
                            }
                        }
                    }
                }

                // --- NORMAL İŞLEME ---
                if (!changed) {
                    for (let i = 0; i < bot.hand.length; i++) {
                        const tile = bot.hand[i];
                        if (isValidAddition(tile, group)) {
                            group.push(tile);
                            if (getRunPoints(group) > 0) group.sort((a, b) => a.number - b.number);
                            bot.hand.splice(i, 1);
                            logDebug(`${bot.name} masaya taş işledi: ${tile.number} ${tile.color}`);
                            changed = true;
                            i--; 
                        }
                    }
                }
            });
        });
    }
}

function renderDiscard(playerId, tile) {
    if (!gameState.discards[playerId]) gameState.discards[playerId] = [];
    tile.isFlipped = false; // Taşı ön yüze çevir
    gameState.discards[playerId].push(tile);

    // Her atılan taş çalınabilir adaydır (sıradaki oyuncu için)
    gameState.lastDiscard = { tile, playerId };

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
    const hasOpened = gameState.players.user.hasOpened;
    let allowedToSteal = false;

    if (hasOpened) {
        // Eğer zaten açmışsa, işine yarasın yaramasın (ceza yeme pahasina) taşı alabilir. 
        // 101 Okey doğasına uygun olarak "elini açmış oyuncu taş çalabilir" kuralı işletilir.
        allowedToSteal = true;
    } else {
        const hypotheticalHand = [...gameState.players.user.hand, tile];
        const hypotheticalGroups = findGroups(hypotheticalHand);

        // Seri Puanı Hesapla
        let totalPts = 0;
        [...hypotheticalGroups.complete].forEach(g => {
            totalPts += evaluateCluster(g).points;
        });

        // Çift Sayısı Hesapla (Özel Fonksiyonla)
        const totalPairs = countPossiblePairs(hypotheticalHand);
        const canOpenWith101 = totalPts >= 101;
        const canOpenWith5Pairs = totalPairs >= 5;

        if (canOpenWith101 || canOpenWith5Pairs) allowedToSteal = true;
        
        if (!allowedToSteal) {
            let msg = `Bu taş (${tile.number}) ile ne 101 puan (${totalPts}) ne de 5 çift (${totalPairs}) yapabiliyorsun.`;
            showGameMessage(msg);
            return;
        }
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
    const tile = gameState.userRackSlots.find(t => t?.id === tileId);
    if (!tile) return;

    const isAlreadySelected = gameState.selectedTileIds.has(tileId);
    
    // KURAL: Tekli seçim (Daha temiz bir mobil deneyimi için)
    // Eğer farklı bir taşa basıldıysa öncekini indir
    if (!isAlreadySelected) {
        gameState.selectedTileIds.clear();
        gameState.selectedTileIds.add(tileId);
        
        // Okey ise ve zaten düzse (flip=false), seçilince dönsün mü? 
        // Kullanıcı "tıklayıp döndürüyorum" dediği için seçilme ile döndürmeyi ayırabiliriz 
        // veya her tıklamada okeyse döndürebiliriz.
    } else {
        // Zaten seçiliyse seçimden çıkar (aşağı iner)
        gameState.selectedTileIds.delete(tileId);
    }

    // Okey Döndürme (Sadece gerçek okey ise)
    const isRealOkey = (tile.number === gameState.okeyTile?.number && tile.color === gameState.okeyTile?.color && !tile.isJoker);
    if (isRealOkey) {
        tile.isFlipped = !tile.isFlipped;
    }

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
        gameState.touch.draggedTileId = tile.id;
        // Phantom'u hemen değil, hareket başlayınca veya kısa süre sonra oluşturacağız 
        // ki tıklama (selection) ile sürükleme ayrışabilsin.
        // Ama şimdilik sadece sürükleme modunu açalım.
        document.body.classList.add('dragging-mode');
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

// Debug console removed

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

function countPossiblePairs(hand) {
    let tiles = [...hand];
    let pairs = 0;
    let okeys = [];

    // 1. Okeyleri Ayır
    for (let i = 0; i < tiles.length; i++) {
        if (isWildCard(tiles[i])) {
            okeys.push(tiles.splice(i, 1)[0]);
            i--;
        }
    }

    // 2. Doğal Çiftleri Bul
    let counts = {};
    tiles.forEach(t => {
        let key = `${t.number}_${t.color}`;
        if (!counts[key]) counts[key] = [];
        counts[key].push(t);
    });

    let leftovers = [];
    Object.keys(counts).forEach(key => {
        let list = counts[key];
        while (list.length >= 2) {
            pairs++;
            list.pop(); list.pop();
        }
        if (list.length === 1) leftovers.push(list[0]);
    });

    // 3. Okeyleri Kalanlarla veya Birbirleriyle Çiftle
    while (okeys.length > 0) {
        if (leftovers.length > 0) {
            pairs++;
            okeys.pop();
            leftovers.pop();
        } else if (okeys.length >= 2) {
            pairs++;
            okeys.pop(); okeys.pop();
        } else {
            break;
        }
    }

    return pairs;
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
    // Yatay Ekran Kilidi (PWA + Tarayıcı uyumlu)
    const tryLockOrientation = () => {
        try {
            if (screen.orientation && screen.orientation.lock) {
                // Önce landscape-primary dene, olmazsa genel landscape
                screen.orientation.lock('landscape-primary').catch(() => {
                    screen.orientation.lock('landscape').catch(() => {
                        // Kilitleyemedik ama CSS rotation devreye girecek
                    });
                });
            }
        } catch(e) { /* Sessizce geç */ }
    };
    tryLockOrientation();
    // Görünürlük değişince (PWA arka planadan gelince) tekrar kilitle
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) tryLockOrientation();
    });

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
        // Load current helpers state
        const helpersToggle = document.getElementById('toggle-helpers');
        if (helpersToggle) helpersToggle.checked = !document.getElementById('player-user')?.classList.contains('helpers-hidden');
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
        // Apply helpers toggle
        const helpersToggle = document.getElementById('toggle-helpers');
        const userArea = document.getElementById('player-user');
        if (helpersToggle && userArea) {
            if (helpersToggle.checked) userArea.classList.remove('helpers-hidden');
            else userArea.classList.add('helpers-hidden');
        }
        document.getElementById('settings-modal').style.display = 'none';
        showGameMessage(`Kaydedildi! (${roundsVal} el)`);
    };

    // Modallara arka plan tıklamasıyla kapat
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    });

    // Deste Sürükleme ve Tıklama
    const deckPile = document.getElementById('deck-pile');
    if (deckPile) {
        deckPile.draggable = true;

        // PC'de tıklayınca taş çek
        deckPile.addEventListener('click', () => {
            handleDraw(-1);
        });

        deckPile.addEventListener('dragstart', (e) => { e.dataTransfer.setData('source', 'deck'); });

        // Mobil'de dokunup bırakınca taş çek (phantom oluşturmadan basit tap)
        let deckTouchStartTime = 0;
        let deckTouchMoved = false;
        deckPile.addEventListener('touchstart', (e) => {
            deckTouchStartTime = Date.now();
            deckTouchMoved = false;
            if (gameState.turnOrder[gameState.currentTurnIndex] === 'user' && !gameState.hasDrawn) {
                gameState.touch.sourceType = 'deck';
                createPhantom(deckPile);
            }
        }, { passive: true });
        deckPile.addEventListener('touchmove', () => { deckTouchMoved = true; }, { passive: true });
        deckPile.addEventListener('touchend', (e) => {
            const duration = Date.now() - deckTouchStartTime;
            // Kısa dokunuşsa (sürükleme değilse) direkt taş çek
            if (duration < 300 && !deckTouchMoved) {
                if (gameState.touch.phantom) {
                    gameState.touch.phantom.remove();
                    gameState.touch.phantom = null;
                }
                gameState.touch.sourceType = null;
                handleDraw(-1);
                return;
            }
        }, { passive: true });

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

    // Atma Alanları (Mobile Expansion Çözümü)
    document.querySelectorAll('.discard-zone').forEach(zone => {
        const getPID = (z) => z.id.replace('discard-', '').replace('bot-', 'bot');
        const toggleExpand = () => {
            const isExpanded = zone.classList.contains('expanded');
            // Önce hepsini kapat (aynı anda sadece biri açık olsun)
            document.querySelectorAll('.discard-zone').forEach(z => z.classList.remove('expanded'));
            if (!isExpanded) zone.classList.add('expanded');
            
            // Tüm alanları render et ki z-index ve pozisyonlar güncellensin
            renderAllDiscardZones();
        };

        // Click hem PC hem Mobile'de çalışır. Mobile'de "tap" görevi görür.
        zone.addEventListener('click', (e) => {
            // Eğer içinde taş varsa genişlet/daralt
            const pId = getPID(zone);
            if (gameState.discards[pId]?.length > 0) {
                toggleExpand();
            }
        });

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
