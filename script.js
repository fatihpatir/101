/**
 * 101 Okey Premium - JavaScript Motoru v4.0 (Temiz Mimari)
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
        bot1: { name: 'Selin', hand: [], score: 0, hasOpened: false, openedType: null },
        bot2: { name: 'Faruk', hand: [], score: 0, hasOpened: false, openedType: null },
        bot3: { name: 'Ayşe', hand: [], score: 0, hasOpened: false, openedType: null }
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
        draggedTileId: null,
        draggedTile: null,
        originalIdx: -1
    },
    settings: {
        sound: true
    },
    stoleDiscard: false, // NEW: Yandan taş alma takibi
    turnInitialTableUserCount: 0
};

// --- SES MOTORU (AudioContext Synthetic) ---
const AudioEngine = {
    ctx: null,
    init() {
        if (!this.ctx) {
            try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
        }
        if (this.ctx && (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted')) {
            this.ctx.resume();
        }
    },
    play(type) {
        if (!gameState.settings || !gameState.settings.sound) return;
        this.init(); 
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        const now = this.ctx.currentTime;
        if (type === 'discard') {
            // Wood/Bone Click (Tok ve kısa ahşap tıklaması)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.03); 
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'draw') {
            // Soft Snap (Daha tiz, daha kırılgan çekme sesi)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.exponentialRampToValueAtTime(150, now + 0.03);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'open') {
            // Harmony Chime (Huzurlu, tok bir onay/başarı melodisi, Do-Mi akoru)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now); // C5
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);

            const osc2 = this.ctx.createOscillator();
            const gain2 = this.ctx.createGain();
            osc2.connect(gain2);
            gain2.connect(this.ctx.destination);
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(659.25, now + 0.05); // E5
            gain2.gain.setValueAtTime(0.15, now + 0.05);
            gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
            osc2.start(now + 0.05);
            osc2.stop(now + 0.45);
        }
    }
};

window.addEventListener('click', () => AudioEngine.init(), { once: true });

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
        let lastTapTime = 0;
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            const now = Date.now();
            if (now - lastTapTime < 300) {
                if (gameState.turnOrder[gameState.currentTurnIndex] === 'user') {
                     if (!attemptAutoProcessTile(this.id)) attemptOpenCluster(this.id);
                }
                lastTapTime = 0;
            } else {
                toggleTileSelection(this.id);
                lastTapTime = now;
            }
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

        // Drag olayları (PC'de native HTML5 drag, Mobilde ise kendi Phantom drag sistemimiz çalışır)
        div.addEventListener('dragstart', (e) => {
            // Mobilde native ghost hatasını ve devasa şeffaf kutuyu önlemek için native drag'i iptal et:
            if (gameState.touch.draggedTileId === this.id) {
                e.preventDefault();
                return;
            }
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
    // 101 KURALI: Başlayan 22, Diğerleri 21
    playersIds.forEach((pId, i) => {
        const count = (i === gameState.startingPlayerIdx) ? 22 : 21;
        gameState.players[pId].hand = gameState.deck.splice(0, count);
        logDebug(`${gameState.players[pId].name} oyuncusuna ${count} taş dağıtıldı.`);
    });

    // Kullanıcı ıstakasını doldur
    gameState.userRackSlots.fill(null);
    gameState.players.user.hand.forEach((tile, i) => {
        if (i < 40) gameState.userRackSlots[i] = tile;
    });

    // Sırayı başlatan kişiye ver
    gameState.currentTurnIndex = gameState.startingPlayerIdx;
    if (playersIds[gameState.currentTurnIndex] === 'user') {
        gameState.turnInitialTableUserCount = gameState.table.user.length;
    } else {
        gameState.turnInitialTableUserCount = 0;
    }
    
    // KURAL: 22 taşla başlayan kişi çekmeden (zaten 22 var) direkt atarak başlar.
    // Bu yüzden hasDrawn'ı başlangıçta sadece sıra kendisinde olan VE 22 taşı olan için true yapıyoruz.
    gameState.hasDrawn = (gameState.players[playersIds[gameState.currentTurnIndex]].hand.length === 22);
    
    logDebug(`Oyun başlatıldı. Sıra: ${gameState.players[playersIds[gameState.currentTurnIndex]].name}`);
}

// --- RENDERING (ARAYÜZ ÇİZİMİ) ---
function renderAll() {
    syncUserOpenStatus();
    document.querySelectorAll('.phantom-drag').forEach(el => el.remove());

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

            // --- HİBRİT İŞLEME MANTIĞI: Hem Tıkla-İşle Hem Sürükle-Bırak ---
            let groupTapTime = 0;
            groupEl.onclick = (e) => {
                e.stopPropagation();
                const now = Date.now();
                if (now - groupTapTime < 300) {
                    if (owner === 'user' && groupIdx >= gameState.turnInitialTableUserCount) {
                        returnGroupToRack(groupIdx);
                    } else if (owner === 'user') {
                        showGameMessage("Önceki ellerde açtığınız perleri geri alamazsınız!");
                    }
                    groupTapTime = 0;
                } else {
                    if (gameState.selectedTileIds.size === 1) {
                        const tileId = [...gameState.selectedTileIds][0];
                        handleProcessTile(tileId, groupIdx, owner);
                    }
                    groupTapTime = now;
                }
            };

            groupEl.ondragover = (e) => { e.preventDefault(); groupEl.classList.add('drag-over-group'); };
            groupEl.ondragleave = () => groupEl.classList.remove('drag-over-group');
            groupEl.ondrop = (e) => {
                e.preventDefault();
                groupEl.classList.remove('drag-over-group');
                const tileId = e.dataTransfer.getData('tileId');
                if (tileId) handleProcessTile(tileId, groupIdx, owner);
            };



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

function syncUserOpenStatus() {
    const player = gameState.players.user;
    if (player.hasOpened) return; // Zaten açmışsa dokunma

    const groups = gameState.table.user || [];
    if (groups.length === 0) return;

    let totalPts = 0;
    let totalPairs = 0;
    let hasSeries = false;

    groups.forEach(g => {
        const res = evaluateCluster(g);
        totalPts += res.points;
        if (res.pairs === 1) totalPairs++;
        if (res.points > 0) hasSeries = true;
    });

    if (!hasSeries && totalPairs >= 5) {
        player.hasOpened = true;
        player.openedType = 'pairs';
        gameState.pairsOpened = true;
        AudioEngine.play('open');
        showGameMessage("Tebrikler, 5 çift ile açtınız! 🎉");
    } else if (totalPts >= 101) {
        player.hasOpened = true;
        player.openedType = 'series';
        AudioEngine.play('open');
        showGameMessage("Tebrikler, 101 barajını geçerek açtınız! 🎉");
    }
}


function openSeries() {
    const player = gameState.players.user;
    if (player.openedType === 'pairs') {
        showGameMessage("Çift açtığınız için seri açamazsınız!");
        return;
    }
    if (!gameState.hasDrawn) {
        showGameMessage("Önce taş çekmelisiniz!");
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
    openedGroups.forEach(group => {
        if (getRunPoints(group) > 0) sortRunGroupInPlace(group);
    });
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
    AudioEngine.play('open');
    renderAll();
    showGameMessage(isAlreadyOpen ? "Yeni perler masaya indi." : "Tebrikler, masaya 101 açıldı!");
}

function openPairs() {
    const player = gameState.players.user;
    if (!gameState.hasDrawn) {
        showGameMessage("Önce taş çekmelisiniz!");
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

    AudioEngine.play('open');
    renderAll();
    showGameMessage(isFirstTime ? "Tebrikler, masaya 5 çift açıldı!" : "Çiftler masaya indi.");
}

function getOkeySubstitutes(group) {
    const subs = {};
    if (!group || group.length < 2) return subs;

    // Check if it's a PAIR (Çift)
    if (group.length === 2) {
        const okeyInGroup = group.filter(t => isWildCard(t));
        const realTilesInGroup = group.filter(t => !isWildCard(t));
        
        if (okeyInGroup.length === 1 && realTilesInGroup.length === 1) {
            const num = realTilesInGroup[0].number;
            const color = realTilesInGroup[0].color;
            subs[okeyInGroup[0].id] = { number: num, color: color, multipleColors: false };
        }
        return subs;
    }

    if (group.length < 3) return subs;

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
        const okeyInGroup = group.filter(t => isWildCard(t));
        const realTilesInGroup = group.filter(t => !isWildCard(t));
        
        // Kural: Bir setten okey çalmak için grupta 3 gerçek taş olmalı (okey 4. olarak kalmalı)
        // Eğer grupta 3 gerçek taş varsa, okey tam olarak 1 rengi temsil eder ve o renk atılınca çalınabilir.
        if (realTilesInGroup.length === 3) {
            const num = realTilesInGroup[0].number;
            const okeyTile = okeyInGroup[0];
            subs[okeyTile.id] = { number: num, multipleColors: true };
            return subs;
        }
    }
    return subs;
}

function isValidAddition(tile, group) {
    if (!group || group.length < 3) return false;
    
    // 1. SET KONTROLÜ (Aynı sayılar, farklı renkler)
    const setPoints = getSetPoints(group);
    if (setPoints > 0) {
        const realTiles = group.filter(t => !isWildCard(t));
        const hasOkey = group.some(t => isWildCard(t));
        
        if (tile.number !== realTiles[0]?.number && !isWildCard(tile)) return false;
        
        // KURAL: 101 Okey'de setler asla 4 taşı (farklı renkler) geçemez.
        // Okey çalınma durumu zaten stealAction ile ele alınır, isValidAddition sadece ekleme yapar.
        if (group.length >= 4) return false; 
        
        // Renk zaten var mı?
        const hasColor = group.some(t => t.color === tile.color && !isWildCard(t));
        if (hasColor && !isWildCard(tile)) return false;
        return true;
    }

    // 2. SERİ KONTROLÜ (Aynı renk, sıralı sayılar)
    const sorted = [...group, tile].sort((a, b) => a.number - b.number);
    const nonWilds = sorted.filter(t => !isWildCard(t));
    if (nonWilds.length === 0) return true; // Hepsi okeyse her şey uyar (nadir)

    const color = nonWilds[0].color;
    if (tile.color !== color && !isWildCard(tile)) return false;

    // Renkleri kontrol et (seride hepsi aynı renk)
    if (group.some(t => !isWildCard(t) && t.color !== color)) return false;

    // Ardışıklık kontrolü (Boşluklar Okey ile dolabiliyor mu?)
    let okeyCount = sorted.filter(t => isWildCard(t)).length;
    for (let i = 0; i < nonWilds.length - 1; i++) {
        const gap = nonWilds[i+1].number - nonWilds[i].number - 1;
        if (gap < 0) return false; // Aynı sayıdan iki tane var (seri olmaz)
        okeyCount -= gap;
    }
    return okeyCount >= 0; // Kalan okeylerle başa veya sona eklenebilir


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
    const nonWilds = tiles.filter(t => !isWildCard(t)).sort((a, b) => a.number - b.number);
    if (nonWilds.length === 0) return 0;

    const baseColor = nonWilds[0].color;
    let okeyCount = tiles.length - nonWilds.length;

    // 1. Renk ve Ardışıklık Kontrolü (Hipotetik Tam Liste Oluşturarak Test Et)
    // Runs in 101 Okey: Same color, sequential. Gap can be filled with Okey.
    // 13-1-2 is typically NOT allowed in 101 Okey rules (unlike standard Okey).
    
    // Sort logic for verification:
    // If we have an okey, it can be anywhere. Let's find the required length.
    const minNum = nonWilds[0].number;
    const maxNum = nonWilds[nonWilds.length - 1].number;
    const span = maxNum - minNum + 1;
    const missingInSpan = span - nonWilds.length;
    
    if (missingInSpan > okeyCount) return 0; // Okeyler aradaki boşlukları doldurmaya yetmiyor
    
    // Renk kontrolü
    if (nonWilds.some(t => t.color !== baseColor)) return 0;
    
    // Duplicate kontrolü (Aynı sayıdan iki tane seride olamaz)
    const numsSet = new Set(nonWilds.map(t => t.number));
    if (numsSet.size !== nonWilds.length) return 0;

    let remainingOkeys = okeyCount - missingInSpan;
    
    // Puanlama: Aradaki boşlukların değeri + mevcudun değeri
    let sum = nonWilds.reduce((s, t) => s + t.number, 0);
    // Aradaki boşlukları puanla
    for(let n = minNum + 1; n < maxNum; n++) {
        if (!numsSet.has(n)) sum += n;
    }

    // Kalan okeyleri puanı maksimize edecek şekilde uçlara ekle
    let top = maxNum;
    let bottom = minNum;
    for (let k = 0; k < remainingOkeys; k++) {
        if (top < 13) { top++; sum += top; }
        else if (bottom > 1) { bottom--; sum += bottom; }
        else break; // Teorik olarak 1-13 arası dolduysa biter
    }
    
    return sum;
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

        // KURAL: Elini açmış ama elinde Okey kalmış oyuncuya +101 ceza
        if (pId !== winnerId && player.hasOpened) {
            const hasOkeyInHand = (pId === 'user' ? gameState.userRackSlots : player.hand).some(t => isWildCard(t));
            if (hasOkeyInHand) {
                penalty += 101;
                logDebug(`${player.name} elinde Okey ile yakalandı! +101`);
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
    gameState.stoleDiscard = false;
    gameState.turnInitialTableUserCount = 0;

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

            const tileEl = tile.createHTMLElement();
            // Seçili taşı vurgula
            if (gameState.selectedTileIds?.has(tile.id)) {
                tileEl.classList.add('selected');
                slot.classList.add('slot-selected');
            }
            slot.appendChild(tileEl);
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

    // Aktif olanı vurgula (ID Eşleştirme: bot1 -> bot-1)
    let playerElId = currentId;
    if (currentId === 'user') playerElId = 'player-user';
    else if (currentId.startsWith('bot')) playerElId = currentId.replace('bot', 'bot-');
    
    const playerEl = document.getElementById(playerElId);
    
    if (playerEl) {
        playerEl.classList.add('active-turn');
        // İsimlerin zıplamasını engellemek için nameTag.add(active-turn) kaldırıldı.
    }

    // Deste parlaması
    // Deste parlaması (SADECE SARI ÇERÇEVE)
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
        if (gameState.players.user.hand.length === 22) {
            showGameMessage("Bağlangıç fazlası (22 taş) sizde! Oyuna taş atarak başlamalısınız. 🎲");
        } else {
            showGameMessage("Zaten taş çektiniz!");
        }
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
    AudioEngine.play('draw');
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

    // --- EVALUATE TABLE IF NOT OFFICIALLY OPENED YET ---
    // --- EVALUATE TABLE IF NOT OFFICIALLY OPENED YET (Artık syncUserOpenStatus ile yapılıyor) ---
    // Sadece güvenlik için hasOpened bayrağını burada bir kez daha kontrol ediyoruz.
    syncUserOpenStatus();


    // --- İŞLEK TAŞ KONTROLÜ (CEZA) ---
    let isIshlek = false;
    const owners = ['user', 'bot1', 'bot2', 'bot3'];
    owners.forEach(owner => {
        (gameState.table[owner] || []).forEach(group => {
            if (isValidAddition(tile, group)) isIshlek = true;
            
            const okeyIdx = group.findIndex(t => isWildCard(t));
            if (okeyIdx !== -1) {
                const subs = getOkeySubstitutes(group);
                if (subs[group[okeyIdx].id]) {
                    const req = subs[group[okeyIdx].id];
                    const matchesNumber = tile.number === req.number;
                    const matchesColor = req.multipleColors 
                        ? !group.some(t => t.color === tile.color && !isWildCard(t))
                        : tile.color === req.color;
                    if (matchesNumber && matchesColor) isIshlek = true;
                }
            }
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

    AudioEngine.play('discard');
    renderDiscard('user', tile);
    gameState.selectedTileIds.delete(tileId);

    // ISTAKAYI ANINDA GÜNCELLE (En kritik düzeltme)
    renderAll(); 

    // --- ÖZEL KURAL: YANDAN TAŞ ALDIYSA KULLANMAK ZORUNDA ---
    if (gameState.stoleDiscard) {
        const stolenTileStillInHand = gameState.players.user.hand.some(t => t.id === gameState.stolenTileId);
        
        if (stolenTileStillInHand) {
            showGameMessage("Yandan aldığınız taşı masaya açmak zorundasınız!", "error");
            // Atma işlemini durdur, taşı geri koy
            gameState.players.user.hand.push(tile);
            if (rackIdx !== -1) gameState.userRackSlots[rackIdx] = tile;
            renderAll();
            return;
        }
    }

    // Başarıyla atıldıysa durumları sıfırla
    gameState.stoleDiscard = false;
    gameState.stolenTileId = null;

    // --- KURAL: OKEY ATMA CEZASI ---
    if (isWildCard(tile) && gameState.players.user.hand.length > 0) {
        gameState.roundPenalties.user += 101;
        showGameMessage("OKEY ATTIN! +101 Ceza! 🔴", "error");
    }

    if (gameState.players.user.hand.length === 0) {
        if (isWildCard(tile)) {
            showGameMessage("OKEY DIŞARI! Harika Bitiş (Çifte Ödül)! 🚀");
        } else {
            showGameMessage("TEBRİKLER, EL BİTTİ! 🎯");
        }
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
    gameState.stoleDiscard = false; // Her tur başında sıfırla
    updateTurnUI();
    renderAllDiscardZones(); // Çalınabilir taş durumunu güncelle

    const currentPlayerId = gameState.turnOrder[gameState.currentTurnIndex];
    if (currentPlayerId === 'user') {
        gameState.turnInitialTableUserCount = gameState.table.user.length;
    } else {
        setTimeout(botPlay, 1000);
    }
}

async function botPlay() {
    const botId = gameState.turnOrder[gameState.currentTurnIndex];
    const bot = gameState.players[botId];

    // 1. Çekme Kararı (Animasyonlu)
    if (bot.hand.length < 22 && gameState.deck.length > 0) {
        const pulledTile = gameState.deck.pop();
        const deckEl = document.getElementById('deck-pile');
        const botHtmlId = botId.includes('bot') ? botId.replace('bot', 'bot-') : botId;
        const botEl = document.querySelector(`#${botHtmlId} .name-tag`);
        
        if (deckEl && botEl) {
            await animateTileMovement(deckEl, botEl, pulledTile, true); // Bot çekerken taş kapalı (true)
        }

        AudioEngine.play('draw');
        
        bot.hand.push(pulledTile);
        updateDeckCount();
        renderAll();
    }

    await new Promise(r => setTimeout(r, 600));

    // 2. Eli Değerlendir
    let { complete, pairs, potential, leftovers } = findGroups(bot.hand);

    // 3. El Açma Mantığı
    let totalPts = complete.reduce((sum, g) => sum + evaluateCluster(g).points, 0);
    let totalPairs = pairs.length;

    if (!bot.hasOpened) {
        if (totalPts >= 101 && bot.openedType !== 'pairs') {
            // Seri Aç (Animasyonlu)
            for (const group of complete) {
                const botEl = document.querySelector(`#${botId.replace('bot', 'bot-')} .name-tag`);
                const targetArea = document.getElementById('series-field');
                if (botEl && targetArea) {
                    await animateTileMovement(botEl, targetArea, group[0]); // Sembolik olarak ilk taşla animasyon
                }
                if (getRunPoints(group) > 0) sortRunGroupInPlace(group);
                gameState.table[botId].push(group);
                group.forEach(t => removeTileFromList(bot.hand, t));
                renderAll();
                await new Promise(r => setTimeout(r, 200));
            }
            bot.hasOpened = true;
            bot.openedType = 'series';
            AudioEngine.play('open');
            showGameMessage(`${bot.name} seriden açtı! 🚀`);
        } else if (bot.openedType === 'series' && gameState.pairsOpened && pairs.length > 0) {
            // Seri açmış bir bot, eğer çift alanı aktifse kalan çiftlerini insin
            for (const pair of pairs) {
                const botEl = document.querySelector(`#${botId.replace('bot', 'bot-')} .name-tag`);
                const targetArea = document.getElementById('pairs-field');
                if (botEl && targetArea) {
                    await animateTileMovement(botEl, targetArea, pair[0]);
                }
                gameState.table[botId].push(pair);
                pair.forEach(t => removeTileFromList(bot.hand, t));
                renderAll();
                await new Promise(r => setTimeout(r, 200));
            }
            AudioEngine.play('open');
            showGameMessage(`${bot.name} elindeki çiftleri döküyor! 🔥`);
        } else if (!bot.hasOpened && totalPairs >= 5 && !gameState.pairsOpened) {
            // Çift Aç (Animasyonlu)
            for (const pair of pairs) {
                const botEl = document.querySelector(`#${botId.replace('bot', 'bot-')} .name-tag`);
                const targetArea = document.getElementById('pairs-field');
                if (botEl && targetArea) {
                    await animateTileMovement(botEl, targetArea, pair[0]);
                }
                gameState.table[botId].push(pair);
                pair.forEach(t => removeTileFromList(bot.hand, t));
                renderAll();
                await new Promise(r => setTimeout(r, 200));
            }
            bot.hasOpened = true;
            bot.openedType = 'pairs';
            gameState.pairsOpened = true;
            AudioEngine.play('open');
            showGameMessage(`${bot.name} çiftten açtı! 🔥`);
        }

    }

    // 4. İşleme Mantığı (Eğer açmışsa veya başkası açmışsa - Basitleştirilmiş)
    if (bot.hasOpened) {
        await botProcessTiles(botId);
    }


    await new Promise(r => setTimeout(r, 600));

    // 5. Taş Atma (İşlek Olmayan En Gereksiz Taşı Bul)
    if (bot.hand.length > 0) {
        let tileToDiscard;
        let isIshlekDiscard = false;

        // Önce işlek olmayan (masaya girmeyen) taşları bulalım
        const findGoodDiscard = () => {
             const allNonIshlek = bot.hand.filter(t => {
                 // KURAL: Botlar asla Okey'i yere atmaz
                 if (isWildCard(t)) return false;

                 let isIshlek = false;
                 const owners = ['user', 'bot1', 'bot2', 'bot3'];
                 owners.forEach(ow => {
                     (gameState.table[ow] || []).forEach(g => { 
                         if (isValidAddition(t, g)) isIshlek = true;
                         
                         const okeyIdx = g.findIndex(x => isWildCard(x));
                         if (okeyIdx !== -1) {
                             const subs = getOkeySubstitutes(g);
                             if (subs[g[okeyIdx].id]) {
                                 const req = subs[g[okeyIdx].id];
                                 const matchesNumber = t.number === req.number;
                                 const matchesColor = req.multipleColors 
                                     ? !g.some(x => x.color === t.color && !isWildCard(x))
                                     : t.color === req.color;
                                 if (matchesNumber && matchesColor) isIshlek = true;
                             }
                         }
                     });
                 });
                 return !isIshlek;
             });

             if (allNonIshlek.length === 0) return null;

             // --- BOT HAFIZASI VE STRATEJİSİ ---
             // 1. Çıkmış taşları (discards) tara. Eğer bir taşın yancısı/eşi çoktan çıkmışsa potansiyeli düşüktür.
             const getAtilabilirlik = (tile) => {
                 let score = 0;
                 if (!bot.hasOpened) {
                     // HENÜZ AÇMAMIŞSA: Büyük taşları ELİNDE TUT (Rakipler 101 yapmasın + Kendi 101'ine yarasın). 
                     // Küçük taşlar daha atılabilir (skoru yüksek olanı atacaktır).
                     score = (14 - tile.number); // 1 için 13, 13 için 1 puan.
                 } else if (bot.hasOpened && bot.openedType === 'pairs') {
                     // ÇİFFTEN AÇMIŞSA: Büyük taşları ELDEN ÇIKAR (Çiftte sayılar 2 ile çarpılır, riskli!)
                     score = tile.number * 2; 
                 } else {
                     // SERİDEN AÇMIŞSA: Normal okey mantığı (İşine yaramayan en büyük taşı at)
                     score = tile.number;
                 }
                 
                 // Ölü taş (eşi/yancısı çoktan çıkmış) ise atılabilirliği artır
                 const deadCount = Object.values(gameState.discards).flat().filter(d => 
                    (d.number === tile.number && d.color === tile.color) || 
                    (d.color === tile.color && Math.abs(d.number - tile.number) === 1)
                 ).length;
                 
                 return score + (deadCount * 5); 
             };

             // Atılabilirliği (skoru) en yüksek olanı seç (En gereksiz taş)
             const sortedByAtilabilirlik = allNonIshlek.sort((a, b) => getAtilabilirlik(b) - getAtilabilirlik(a));
             return sortedByAtilabilirlik[0];

        };


        tileToDiscard = findGoodDiscard();

        if (!tileToDiscard) {
            // Hepsi işlek ise, Okey olmayan en büyük olanı at ve ceza ye
            const possibleDiscards = bot.hand.filter(t => !isWildCard(t));
            if (possibleDiscards.length > 0) {
                tileToDiscard = possibleDiscards.sort((a,b) => b.number - a.number)[0];
                isIshlekDiscard = true;
            } else {
                // Sadece Okey kalmışsa (asla olmaz ama crash önleyici), mecbur atacak
                tileToDiscard = bot.hand[0];
            }
        }

        if (isIshlekDiscard) {
            gameState.roundPenalties[botId] += 101;
            showGameMessage(`${bot.name} işlek taş attı! +101 Ceza! 🔴`);
        }

        // Hand'den çıkar ve at (Animasyonlu)
        const idx = bot.hand.findIndex(t => t.id === tileToDiscard.id);
        if (idx !== -1) bot.hand.splice(idx, 1);
        
        const botEl = document.querySelector(`#${botId.replace('bot', 'bot-')} .name-tag`);
        const discardEl = document.getElementById(`discard-${botId.replace('bot', 'bot-')}`);
        
        if (botEl && discardEl) {
            await animateTileMovement(botEl, discardEl, tileToDiscard);
        }

        AudioEngine.play('discard');
        renderDiscard(botId, tileToDiscard);

        
        if (bot.hand.length === 0) {
            finishRound(botId, tileToDiscard);
            return;
        }
    }

    renderAll();
    nextTurn();
}

async function botProcessTiles(botId) {
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
                                
                                // CEZA: Sadece başkasından çalınca ceza yüklensin
                                if (owner !== botId) {
                                    gameState.roundPenalties[owner] += 101;
                                    logDebug(`${bot.name}, ${gameState.players[owner].name}'den Okey çaldı!`);
                                    showGameMessage(`${bot.name} Okey Çaldı! 🔥`);
                                } else {
                                    logDebug(`${bot.name} kendi okeyini geri aldı.`);
                                }
                                changed = true;
                                break;
                            }
                        }
                    }
                }
            });
        });

        // --- NORMAL İŞLEME ---
        if (!changed) {
            const leftovers = findGroups(bot.hand).leftovers;
            const owners = ['user', 'bot1', 'bot2', 'bot3'];
            for (const owner of owners) {
                const tableGroups = gameState.table[owner] || [];
                for (let gIdx = 0; gIdx < tableGroups.length; gIdx++) {
                    const group = tableGroups[gIdx];
                    for (let i = 0; i < leftovers.length; i++) {
                        const tile = leftovers[i];
                        if (isWildCard(tile)) continue; // KURAL: Bot Okey taşını masaya rastgele işleyip harcamaz!
                        if (isValidAddition(tile, group)) {
                            // Animasyon: Bot'un isminden Masadaki Per'e
                            const botHtmlId = botId.includes('bot') ? botId.replace('bot', 'bot-') : botId;
                            const botEl = document.querySelector(`#${botHtmlId} .name-tag`);
                            const targetEl = document.querySelector(`.table-group[data-owner="${owner}"][data-index="${gIdx}"]`);
                            
                            if (botEl && targetEl) {
                                await animateTileMovement(botEl, targetEl, tile);
                            }


                            if (getRunPoints(group) > 0) {
                                const nums = group.filter(t => !isWildCard(t)).map(t => t.number);
                                const min = Math.min(...nums);
                                if (!isWildCard(tile) && tile.number < min) group.unshift(tile);
                                else group.push(tile);
                                sortRunGroupInPlace(group);
                            } else {
                                group.push(tile);
                            }
                            bot.hand = bot.hand.filter(t => t.id !== tile.id);
                            changed = true;
                            i--;
                            renderAll();
                        }
                    }
                }
            }
        }

    }
}

function autoProcessUserTiles() {
    const player = gameState.players.user;
    if (!player.hasOpened) {
        showGameMessage("Taş işlemek için önce elinizi açmalısınız!");
        return;
    }
    if (!gameState.hasDrawn) {
        showGameMessage("Önce taş çekmelisiniz!");
        return;
    }

    let changed = true;
    let totalProcessed = 0;

    // Masadaki tüm perleri (kendin ve botlar) tara
    while (changed) {
        changed = false;
        const owners = ['user', 'bot1', 'bot2', 'bot3'];

        for (const owner of owners) {
            const tableGroups = gameState.table[owner] || [];
            for (let gIdx = 0; gIdx < tableGroups.length; gIdx++) {
                const group = tableGroups[gIdx];

                // 1. OKEY ÇALMA KONTROLÜ (OTOMATİK TAKAS)
                const okeyInGroupIdx = group.findIndex(t => isWildCard(t));
                if (okeyInGroupIdx !== -1) {
                    const subs = getOkeySubstitutes(group);
                    const targetOkey = group[okeyInGroupIdx];
                    const requiredTile = subs[targetOkey.id];

                    if (requiredTile) {
                        for (let i = 0; i < gameState.userRackSlots.length; i++) {
                            const tile = gameState.userRackSlots[i];
                            if (!tile) continue;

                            const matchesNumber = tile.number === requiredTile.number;
                            const matchesColor = requiredTile.multipleColors 
                                ? !group.some(t => t.color === tile.color && !isWildCard(t))
                                : tile.color === requiredTile.color;

                            if (matchesNumber && matchesColor) {
                                // OKEY ÇALINIP ISTAKAYA DÖNER
                                group[okeyInGroupIdx] = tile;
                                gameState.userRackSlots[i] = targetOkey;
                                targetOkey.isFlipped = false;
                                player.hand = player.hand.filter(t => t.id !== tile.id);
                                player.hand.push(targetOkey);

                                if (owner !== 'user') {
                                    gameState.roundPenalties[owner] += 101;
                                    showGameMessage(`OKEY ÇALDIN! ${gameState.players[owner].name}'e +101 Ceza! 🔥`);
                                } else {
                                    showGameMessage("Kendi Okey'ini geri aldın! 🔥");
                                }
                                changed = true;
                                totalProcessed++;
                                break;
                            }
                        }
                    }
                }

                if (changed) break; 

                // 2. NORMAL İŞLEME KONTROLÜ
                for (let i = 0; i < gameState.userRackSlots.length; i++) {
                    const tile = gameState.userRackSlots[i];
                    if (!tile) continue;

                    if (isWildCard(tile)) continue; // OKEY OTOMATİK İŞLENMESİN

                    if (isValidAddition(tile, group)) {
                        if (getRunPoints(group) > 0) {
                            const nums = group.filter(t => !isWildCard(t)).map(t => t.number);
                            const min = Math.min(...nums);
                            if (!isWildCard(tile) && tile.number < min) group.unshift(tile);
                            else group.push(tile);
                            sortRunGroupInPlace(group);
                        } else {
                            group.push(tile);
                        }

                        gameState.userRackSlots[i] = null;
                        player.hand = player.hand.filter(t => t.id !== tile.id);
                        
                        changed = true;
                        totalProcessed++;
                    }
                }
                if (changed) break;
            }
            if (changed) break;
        }
    }

    if (totalProcessed > 0) {
        renderAll();
        showGameMessage(`${totalProcessed} taş masaya işlendi! 🔥`);
    } else {
        showGameMessage("Elinizde işlenecek taş bulunamadı.");
    }
}

function attemptAutoProcessTile(tileId) {
    if (!gameState.players.user.hasOpened || !gameState.hasDrawn) return false;

    const rackIdx = gameState.userRackSlots.findIndex(t => t?.id === tileId);
    if (rackIdx === -1) return false;
    const tile = gameState.userRackSlots[rackIdx];

    // Okey yanlışlıkla otomatik işlenmesin (Okey her yere uyuyor çünkü)
    if (isWildCard(tile)) {
        showGameMessage("Okey taşı çift tıklamayla işlenemez. Lütfen işleyeceğiniz pere sürükleyin.");
        return false;
    }

    const owners = ['user', 'bot1', 'bot2', 'bot3'];
    let stealAction = null;
    let processActions = [];

    for (const owner of owners) {
        const groups = gameState.table[owner] || [];
        for (let gIdx = 0; gIdx < groups.length; gIdx++) {
            const group = groups[gIdx];
            
            const okeyInGroupIdx = group.findIndex(t => isWildCard(t));
            if (okeyInGroupIdx !== -1) {
                const subs = getOkeySubstitutes(group);
                const targetOkey = group[okeyInGroupIdx];
                const requiredTile = subs[targetOkey.id];

                if (requiredTile) {
                    const matchesNumber = tile.number === requiredTile.number;
                    const matchesColor = requiredTile.multipleColors 
                        ? !group.some(t => t.color === tile.color && !isWildCard(t))
                        : tile.color === requiredTile.color;

                    if (matchesNumber && matchesColor) {
                        stealAction = { group, okeyInGroupIdx, targetOkey, owner };
                        break;
                    }
                }
            }

            if (isValidAddition(tile, group)) {
                processActions.push({ group, owner, gIdx });
            }
        }
        if (stealAction) break;
    }

    // ÖNCELİK 1: OKEY ÇALMA İMKANI VARSA
    if (stealAction) {
        const { group, okeyInGroupIdx, targetOkey, owner } = stealAction;
        group[okeyInGroupIdx] = tile;
        gameState.userRackSlots[rackIdx] = targetOkey;
        targetOkey.isFlipped = false;
        gameState.players.user.hand = gameState.players.user.hand.filter(t => t.id !== tile.id);
        gameState.players.user.hand.push(targetOkey);
        if (owner !== 'user') {
            gameState.roundPenalties[owner] += 101;
            showGameMessage(`Okey başarıyla çalındı! ${gameState.players[owner].name}'e +101 Ceza! 🔥`);
        } else {
            showGameMessage("Kendi Okey'inizi geri aldınız! 🔥");
        }
        renderAll();
        return true;
    }

    // ÖNCELİK 2: NORMAL İŞLEME
    if (processActions.length > 0) {
        if (processActions.length > 1) {
            showGameMessage("Bu taş birden fazla yere uyuyor! Lütfen doğru pere manuel sürükleyin.");
            return true;
        } else {
            const { group, owner, gIdx } = processActions[0];
            if (getRunPoints(group) > 0) {
                group.push(tile);
                sortRunGroupInPlace(group);
            } else {
                group.push(tile);
            }
            gameState.userRackSlots[rackIdx] = null;
            gameState.players.user.hand = gameState.players.user.hand.filter(t => t.id !== tileId);
            AudioEngine.play('discard');
            renderAll();
            showGameMessage("Taş otomatik işlendi! 🚀");
            return true;
        }
    }

    return false;
}

function attemptOpenCluster(tileId) {
    if (!gameState.hasDrawn) { showGameMessage("Önce taş çekmelisiniz!"); return false; }
    
    let cluster = [];
    let startIdx = gameState.userRackSlots.findIndex(t => t?.id === tileId);
    if (startIdx === -1) return false;

    let left = startIdx;
    while (left > 0 && gameState.userRackSlots[left - 1] !== null) left--;
    let right = startIdx;
    while (right < 39 && gameState.userRackSlots[right + 1] !== null) right++;

    for (let i = left; i <= right; i++) {
        cluster.push(gameState.userRackSlots[i]);
    }

    const { points, pairs } = evaluateCluster(cluster);
    const isRunOrSet = points > 0;

    if (isRunOrSet || (pairs === 1 && cluster.length === 2)) {
        if (gameState.players.user.openedType === 'pairs' && isRunOrSet) { showGameMessage("Çiftten açtınız!"); return false; }
        if (gameState.players.user.openedType === 'series' && pairs === 1 && !gameState.pairsOpened) { showGameMessage("Masada çift açılmadı!"); return false; }

        if (getRunPoints(cluster) > 0) sortRunGroupInPlace(cluster);
        gameState.table.user.push(cluster);
        
        for (let i = left; i <= right; i++) {
            gameState.userRackSlots[i] = null;
            gameState.players.user.hand = gameState.players.user.hand.filter(t => t.id !== cluster[i - left].id);
        }
        AudioEngine.play('open');
        renderAll();
        return true;
    }

    showGameMessage("Bağımsız bir per/çift değil. Etrafını boşluklarla ayırın.");
    return false;
}

function returnGroupToRack(groupIdx) {
    if (gameState.turnOrder[gameState.currentTurnIndex] !== 'user') return;
    
    const group = gameState.table.user[groupIdx];
    if (!group) return;

    let emptySlotsCount = gameState.userRackSlots.filter(t => t === null).length;
    if (emptySlotsCount < group.length) {
        showGameMessage("Istakada yeterli boş yer yok!");
        return;
    }

    group.forEach(t => {
        const emptyIdx = gameState.userRackSlots.indexOf(null);
        gameState.userRackSlots[emptyIdx] = t;
        gameState.players.user.hand.push(t);
    });

    gameState.table.user.splice(groupIdx, 1);

    let totalPts = 0; let totalPairs = 0;
    gameState.table.user.forEach(g => {
        const res = evaluateCluster(g);
        totalPts += res.points;
        if (res.pairs === 1) totalPairs++;
    });

    if (totalPts < 101 && totalPairs < 5) {
        gameState.players.user.hasOpened = false;
        gameState.players.user.openedType = null;
    }

    AudioEngine.play('draw');
    renderAll();
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
                
                // CEZA: Sadece BAŞKASINDAN çalınca ceza ver
                if (owner !== 'user') {
                    gameState.roundPenalties[owner] += 101;
                    showGameMessage(`OKEY ÇALINDI! ${gameState.players[owner].name}'e +101 Ceza! 🔥`);
                } else {
                    showGameMessage("Kendi okeyinizi geri aldınız! 🔥");
                }
                
                renderAll();
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
        if (isNowRun) sortRunGroupInPlace(group);
        
        gameState.userRackSlots[rackIdx] = null;
        gameState.players.user.hand = gameState.players.user.hand.filter(t => t.id !== tileId);
        renderAll();
        showGameMessage("Taş başarıyla işlendi! 🔥");
    } else {
        showGameMessage("Bu taş bu perle uyumlu değil.");
    }
}

function renderDiscard(playerId, tile) {
    if (!gameState.discards[playerId]) gameState.discards[playerId] = [];
    tile.isFlipped = false;
    gameState.discards[playerId].push(tile);
    gameState.lastDiscard = { tile, playerId };
    renderDiscardZone(playerId);
}

function renderAllDiscardZones() {
    ['user', 'bot1', 'bot2', 'bot3'].forEach(pId => renderDiscardZone(pId));
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
        tileEl.style.zIndex = index + 10;
        
        const visualIndex = Math.min(index, 10);
        const isPeeking = zone.classList.contains('peeking');

        if (!isPeeking) {
            tileEl.style.top = `${visualIndex * 1.5}px`; 
            tileEl.style.left = `${visualIndex * 0.8}px`;
            tileEl.style.transform = 'scale(0.9)';
        } else {
            tileEl.style.left = '0px';
            tileEl.style.transform = 'scale(1.2)';
            const isBottomPlayer = (playerId === 'user' || playerId === 'bot1');
            const offset = 55;
            tileEl.style.top = isBottomPlayer ? `${-index * offset}px` : `${index * offset}px`;
        }

        // Çalınabilir taş kontrolü
        const isLastInThisZone = index === all.length - 1;
        const isMostRecentDiscard = gameState.lastDiscard && gameState.lastDiscard.tile.id === tile.id;
        const previousPlayerId = gameState.turnOrder[(gameState.currentTurnIndex + 3) % 4];
        const isStealable = isLastInThisZone && isMostRecentDiscard && (playerId === previousPlayerId) && (gameState.turnOrder[gameState.currentTurnIndex] === 'user') && !gameState.hasDrawn;

        if (isStealable) {
            tileEl.classList.add('stealable-tile');
            tileEl.style.cursor = 'grab';

            const onStealStart = (e) => {
                if (zone.classList.contains('peeking')) return;
                clearTimeout(peekTimer);
                gameState.touch.sourceType = 'steal';
                createPhantom(tileEl);
            };
            tileEl.addEventListener('touchstart', onStealStart, { passive: true });
            
            tileEl.onclick = (e) => {
                e.stopPropagation();
                attemptStealDiscard();
            };
        } else {
            tileEl.onclick = (e) => {
                e.stopPropagation();
                if (!zone.classList.contains('peeking')) startPeek();
                else endPeek();
            };
        }

        zone.appendChild(tileEl);
    });

    let peekTimer;
    const startPeek = () => {
        if (zone.classList.contains('peeking')) return;
        peekTimer = setTimeout(() => {
            zone.classList.add('peeking');
            renderDiscardZone(playerId);
        }, 300);
    };
    const endPeek = () => {
        clearTimeout(peekTimer);
        if (zone.classList.contains('peeking')) {
            zone.classList.remove('peeking');
            renderDiscardZone(playerId);
        }
    };

    zone.onmousedown = startPeek;
    zone.onmouseup = endPeek;
    zone.onmouseleave = endPeek;
    zone.addEventListener('touchstart', (e) => { startPeek(); }, { passive: true });
    zone.addEventListener('touchend', endPeek);
    zone.addEventListener('touchcancel', endPeek);
}




function attemptStealDiscard(targetSlotIdx = -1) {
    if (!gameState.lastDiscard) return;
    if (gameState.hasDrawn) { showGameMessage("Zaten taş çektin!"); return; }
    if (gameState.turnOrder[gameState.currentTurnIndex] !== 'user') return;

    const { tile, playerId } = gameState.lastDiscard;

    const hasOpened = gameState.players.user.hasOpened;
    let allowedToSteal = false;

    // Simülasyon elini hazırla
    const hypotheticalHand = [...gameState.players.user.hand, tile];
    const hypotheticalGroups = findGroups(hypotheticalHand);

    // İŞLEK KONTROLÜ (Masadaki perlere uyuyor mu?)
    let isIshlek = false;
    const owners = ['user', 'bot1', 'bot2', 'bot3'];
    owners.forEach(owner => {
        (gameState.table[owner] || []).forEach(group => {
            if (isValidAddition(tile, group)) isIshlek = true;
        });
    });

    const isTileUsedInComplete = hypotheticalGroups.complete.some(group => 
        group.some(t => t.id === tile.id)
    );
    const currentPairsCount = countPossiblePairs(gameState.players.user.hand);
    const hypotheticalPairsCount = countPossiblePairs(hypotheticalHand);
    const isTileUsedInPair = hypotheticalPairsCount > currentPairsCount;

    // ZİNCİRLEME İŞLEK KONTROLÜ (Kullanıcının örneği: 3-4-5 masada, elimde 6 var, yandan 7 alıp ikisini birden işleyebilir miyim?)
    let canAttachWithHand = false;
    owners.forEach(owner => {
        (gameState.table[owner] || []).forEach(group => {
            if (group.length > 0 && group[0].number === group[1].number) {
                // SET (Aynı Sayı): Zincirleme olmaz, taş direkt girmeli. (Zaten isIshlek bakar)
                return;
            }
            
            // SERİ (Sıralı): 
            if (tile.color !== group[0].color) return;
            
            const tableNums = group.map(t => t.number).sort((a,b)=>a-b);
            const min = tableNums[0];
            const max = tableNums[tableNums.length - 1];
            
            // ÜSTTEN ZİNCİR: (Örn: 5 masada, 6 elimde, 7 çalıyorum)
            if (tile.number > max) {
                let needed = [];
                for (let n = max + 1; n < tile.number; n++) needed.push(n);
                const hasAllNeeded = needed.every(num => 
                    gameState.players.user.hand.some(ht => ht.number === num && ht.color === tile.color)
                );
                if (hasAllNeeded) canAttachWithHand = true;
            }
            
            // ALTTAN ZİNCİR: (Örn: 5 masada, 4 elimde, 3 çalıyorum)
            if (tile.number < min) {
                let needed = [];
                for (let n = tile.number + 1; n < min; n++) needed.push(n);
                const hasAllNeeded = needed.every(num => 
                    gameState.players.user.hand.some(ht => ht.number === num && ht.color === tile.color)
                );
                if (hasAllNeeded) canAttachWithHand = true;
            }
        });
    });

    if (hasOpened) {
        // AÇILMIŞ OYUNCU: Per/Çift/İşlek VEYA Zincirleme İşlek
        if (isTileUsedInComplete || isTileUsedInPair || isIshlek || canAttachWithHand) {
            allowedToSteal = true;
        } else {
            showGameMessage(`Bu taş (${tile.number}) ne elinde bir per/çift yapıyor ne de masadaki perlerden birine uyuyor.`);
            return;
        }
    } else {
        // HENÜZ AÇMAMIŞ OYUNCU: Hem per/çift yapmalı HEM DE 101/5-çift barajını geçmeli.
        let totalPts = 0;
        [...hypotheticalGroups.complete].forEach(g => {
            totalPts += evaluateCluster(g).points;
        });
        const totalPairs = countPossiblePairs(hypotheticalHand);
        const canOpenWith101 = totalPts >= 101;
        const canOpenWith5Pairs = totalPairs >= 5;

        if (canOpenWith101 && isTileUsedInComplete) {
            allowedToSteal = true;
        } else if (canOpenWith5Pairs && isTileUsedInPair) {
            allowedToSteal = true;
        } else {
            if (canOpenWith101 || canOpenWith5Pairs) {
                showGameMessage(`Bu taş (${tile.number}) açmanız için gereken per/çiftin içinde değil.`);
            } else {
                showGameMessage(`Bu taş ile henüz açma sınırına (101 Puan veya 5 Çift) ulaşamıyorsun.`);
            }
            return;
        }
    }

    // Yerleşim Kararı
    let finalIdx = targetSlotIdx;
    if (finalIdx === -1 || finalIdx >= 40 || gameState.userRackSlots[finalIdx] !== null) {
        finalIdx = gameState.userRackSlots.indexOf(null);
    }

    // Çal!
    const discardArr = gameState.discards[playerId];
    const idx = discardArr.findIndex(t => t.id === tile.id);
    if (idx !== -1) discardArr.splice(idx, 1);

    gameState.players.user.hand.push(tile);
    if (finalIdx !== -1) gameState.userRackSlots[finalIdx] = tile;

    gameState.lastDiscard = null;
    gameState.hasDrawn = true;
    gameState.stoleDiscard = true;
    gameState.stolenTileId = tile.id; // Hangi taşı çaldığını kaydet (Zorunlu kullanım takibi)
    renderAll();
    showGameMessage(`${tile.number} numaralı taş çalındı! Açmak zorundasınız. 🔥`);
}

function toggleTileSelection(tileId) {
    const tile = gameState.userRackSlots.find(t => t?.id === tileId);
    if (!tile) return;

    const isAlreadySelected = gameState.selectedTileIds.has(tileId);
    
    if (isAlreadySelected) {
        // İkinci dokunuş: Sıra bizde ve taş çekildiyse → DİREKT AT
        if (gameState.turnOrder[gameState.currentTurnIndex] === 'user' && gameState.hasDrawn) {
            gameState.selectedTileIds.delete(tileId);
            processUserDiscard(tileId);
            return;
        }
        // Değilse sadece seçimden çıkar
        gameState.selectedTileIds.delete(tileId);
    } else {
        // İlk dokunuş → SEÇ
        gameState.selectedTileIds.clear();
        gameState.selectedTileIds.add(tileId);
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
    if (oldIdx === newIdx) { renderUserRack(); return; }

    const tile = gameState.userRackSlots[oldIdx];
    
    // Hedef slot doluyu ise KAYDIRMA (SHIFT) yapalım
    if (gameState.userRackSlots[newIdx] !== null) {
        let emptyIdx = -1;
        
        // 1. Önce SAĞA doğru boşluk ara
        for (let i = newIdx + 1; i < 40; i++) {
            if (gameState.userRackSlots[i] === null) {
                emptyIdx = i;
                break;
            }
        }
        
        if (emptyIdx !== -1) {
            // Sağa kaydır (newIdx'ten emptyIdx'e kadar olanları 1 sağa it)
            for (let i = emptyIdx; i > newIdx; i--) {
                gameState.userRackSlots[i] = gameState.userRackSlots[i - 1];
            }
            gameState.userRackSlots[newIdx] = tile;
            gameState.userRackSlots[oldIdx] = null; // Eski yeri boşalt (eğer kayma sırasında dolmadıysa)
        } else {
            // 2. Sağda yer yoksa SOLA doğru boşluk ara
            for (let i = newIdx - 1; i >= 0; i--) {
                if (gameState.userRackSlots[i] === null) {
                    emptyIdx = i;
                    break;
                }
            }
            
            if (emptyIdx !== -1) {
                // Sola kaydır (emptyIdx'ten newIdx'e kadar olanları 1 sola it)
                for (let i = emptyIdx; i < newIdx; i++) {
                    gameState.userRackSlots[i] = gameState.userRackSlots[i + 1];
                }
                gameState.userRackSlots[newIdx] = tile;
                gameState.userRackSlots[oldIdx] = null;
            } else {
                // 3. Hiç yer yoksa mecbur SWAP (Eski mantık)
                const targetTile = gameState.userRackSlots[newIdx];
                gameState.userRackSlots[newIdx] = tile;
                gameState.userRackSlots[oldIdx] = targetTile;
            }
        }
    } else {
        // Hedef zaten boş, direkt taşı
        gameState.userRackSlots[newIdx] = tile;
        gameState.userRackSlots[oldIdx] = null;
    }

    renderUserRack();
}

// --- EVENT HANDLERS (DROP / TOUCH) ---
function handleDropOnSlot(e) {
    e.preventDefault();
    this.classList.remove('drag-hover');
    const targetIdx = parseInt(this.dataset.index);

    const source = e.dataTransfer.getData('source') || e.dataTransfer.getData('text/plain');
    if (source === 'deck') {
        handleDraw(targetIdx);
    } else if (source === 'discard') {
        attemptStealDiscard(targetIdx);
    } else {
        const tileId = e.dataTransfer.getData('tileId');
        if (tileId) moveTileToSlot(tileId, targetIdx);
    }
}

function handleTouchStartSlot(e) {
    const idx = parseInt(this.dataset.index);
    const tile = gameState.userRackSlots[idx];
    if (!tile) return;

    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;

    const slotEl = this;

    const startDrag = () => {
        // ★ Phantom ÖNCE oluşturulur (slot hâlâ DOM'da, rect doğru)
        createPhantom(slotEl);
        // SONRA slot null'lanır ve rack yeniden çizilir
        gameState.touch.draggedTileId = tile.id;
        gameState.touch.draggedTile = tile;
        gameState.touch.originalIdx = idx;
        gameState.userRackSlots[idx] = null;
        renderUserRack();
        document.body.classList.add('dragging-mode');
    };

    const tapTimeout = setTimeout(() => {
        slotEl._tapTimeout = null;
        startDrag();
    }, 180);

    slotEl._tapTimeout = tapTimeout;

    const onMove = (ev) => {
        const t = ev.touches[0];
        const dx = Math.abs(t.clientX - startX);
        const dy = Math.abs(t.clientY - startY);
        if (dx > 8 || dy > 8) {
            slotEl.removeEventListener('touchmove', onMove);
            slotEl.removeEventListener('touchend', onEnd);
            if (slotEl._tapTimeout) {
                clearTimeout(slotEl._tapTimeout);
                slotEl._tapTimeout = null;
                startDrag();
            }
        }
    };

    const onEnd = (ev) => {
        slotEl.removeEventListener('touchmove', onMove);
        slotEl.removeEventListener('touchend', onEnd);
        if (slotEl._tapTimeout) {
            clearTimeout(slotEl._tapTimeout);
            slotEl._tapTimeout = null;
            // TAP: seç / çift dokununca at
            toggleTileSelection(tile.id);
        }
    };

    slotEl.addEventListener('touchmove', onMove, { passive: true });
    slotEl.addEventListener('touchend', onEnd, { once: true });
}


function handleTouchEnd(e) {
    document.body.classList.remove('dragging-mode');
    
    if (gameState.touch.phantom) {
        const phantom = gameState.touch.phantom;
        const sType = gameState.touch.sourceType;
        const dId = gameState.touch.draggedTileId;

        // --- GÜVENLİ TEMİZLİK (Her durumda phantom silinmeli) ---
        phantom.remove();
        gameState.touch.phantom = null;

        const touch = e.changedTouches[0];
        const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);

        // Desteden veya Yandan (Steal) çekme kontrolü
        if (sType === 'deck' || sType === 'steal') {
            let targetIdx = -1;
            const slot = targetEl?.closest('.tile-slot');
            
            if (slot) {
                targetIdx = parseInt(slot.dataset.index);
            } else {
                // Eğer doğrudan slot üstünde değilse ama rack üzerindeyse, en yakın slotu bul
                const rack = targetEl?.closest('.rack-wrapper') || targetEl?.closest('.user-rack-container');
                if (rack) {
                    // O andaki tüm slotları tara, dokunma noktasına en yakın olanı bul
                    const slots = document.querySelectorAll('.tile-slot');
                    let minD = 9999;
                    slots.forEach(s => {
                        const r = s.getBoundingClientRect();
                        const dx = (r.left + r.width/2) - touch.clientX;
                        const dy = (r.top + r.height/2) - touch.clientY;
                        const d = Math.sqrt(dx*dx + dy*dy);
                        if (d < minD && d < 100) { // 100px yakınlık sınırı
                            minD = d;
                            targetIdx = parseInt(s.dataset.index);
                        }
                    });
                }
            }
            
            if (sType === 'deck') handleDraw(targetIdx);
            else attemptStealDiscard(targetIdx);

            gameState.touch.sourceType = null;
            return;
        }

        // Istaka içi veya Atma kontrolü
        if (dId) {
            const touch = e.changedTouches[0];
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            const originalTile = gameState.touch.draggedTile;
            const originalIdx = gameState.touch.originalIdx;

            // ★ 1. ÖNCELİK: MASA ALANI KONTROLÜ (Masaya sürükleme ÖNCE kontrol edilmeli!)
            const isOnTableArea = !!(targetEl?.closest('.table-group') || targetEl?.closest('.process-slot') || targetEl?.closest('#series-field') || targetEl?.closest('#pairs-field'));

            if (isOnTableArea) {
                gameState.userRackSlots[originalIdx] = originalTile;
                const gEl = targetEl.closest('.table-group');
                if (gEl) {
                    handleProcessTile(dId, parseInt(gEl.dataset.index), gEl.dataset.owner);
                } else if (targetEl?.closest('.process-slot')) {
                    const procEl = targetEl.closest('.process-slot');
                    const parentGroup = procEl?.closest('.table-group');
                    if (parentGroup) handleProcessTile(dId, parseInt(parentGroup.dataset.index), parentGroup.dataset.owner);
                } else {
                    attemptOpenCluster(dId);
                }
                gameState.touch.draggedTileId = null;
                gameState.touch.draggedTile = null;
                gameState.touch.originalIdx = -1;
                return;
            }

            // ★ 2. SLOT KONTROLÜ (Masa değilse ıstakadaki slota bak)
            let targetIdx = -1;
            const slot = targetEl?.closest('.tile-slot');

            if (slot) {
                targetIdx = parseInt(slot.dataset.index);
            } else {
                const isOnRackWrapper = targetEl?.closest('.rack-wrapper');
                if (isOnRackWrapper) {
                    const slots = document.querySelectorAll('.tile-slot');
                    let minD = 9999;
                    slots.forEach(s => {
                        const r = s.getBoundingClientRect();
                        const dx = (r.left + r.width/2) - touch.clientX;
                        const dy = (r.top + r.height/2) - touch.clientY;
                        const d = Math.sqrt(dx*dx + dy*dy);
                        if (d < minD && d < 120) {
                            minD = d;
                            targetIdx = parseInt(s.dataset.index);
                        }
                    });
                }
            }

            if (targetIdx !== -1) {
                // Slot üstüne bırakıldı → taşı o slota taşı
                gameState.userRackSlots[originalIdx] = originalTile;
                moveTileToSlot(dId, targetIdx);
                gameState.touch.draggedTileId = null;
                gameState.touch.draggedTile = null;
                gameState.touch.originalIdx = -1;
                return;
            }

            // ★ 3. DISCARD ZONE KONTROLÜ (Küçük margin ile — 30px)
            const discardRect = document.getElementById('discard-user')?.getBoundingClientRect();
            let isInDiscard = !!targetEl?.closest('#discard-user');
            if (!isInDiscard && discardRect) {
                const m = 30;
                if (touch.clientX >= discardRect.left - m && touch.clientX <= discardRect.right + m &&
                    touch.clientY >= discardRect.top - m && touch.clientY <= discardRect.bottom + m) {
                    isInDiscard = true;
                }
            }

            // ★ 4. ISTAKA DIŞINA FIRLATMA (Yukarı — masa değil, ıstaka dışı)
            const rackWrapper = document.querySelector('.rack-wrapper');
            const rackRect = rackWrapper?.getBoundingClientRect();
            const isOutsideRack = rackRect ? (
                touch.clientY < rackRect.top - 20 ||
                touch.clientX < rackRect.left - 40 ||
                touch.clientX > rackRect.right + 40
            ) : false;

            if (isInDiscard || (isOutsideRack && gameState.hasDrawn)) {
                gameState.userRackSlots[originalIdx] = originalTile;
                processUserDiscard(dId);
            } else {
                // Geçersiz yere bırakıldı → Geri iade et (ASLA otomatik atma)
                gameState.userRackSlots[originalIdx] = originalTile;
                renderUserRack();
            }

            gameState.touch.draggedTileId = null;
            gameState.touch.draggedTile = null;
            gameState.touch.originalIdx = -1;
        }
    }
}


function createPhantom(sourceEl) {
    // sourceEl genellikle tile-slot veya discard-zone olabilir.
    // İçerisindeki gerçek 'tile' elementini bul
    const originalTile = sourceEl.querySelector('.tile') || sourceEl;
    if (!originalTile) return;

    // Gerçek dimensi ölçüleri al (mobilde ve PC'de dinamik kalır)
    const rect = originalTile.getBoundingClientRect();

    // Tile'ın kendisini klonla
    const p = originalTile.cloneNode(true);
    p.classList.add('phantom-drag');
    
    // Sabit pozisyon ve zorunlu ölçüler (saf 100% olmasın diye)
    p.style.position = 'fixed';
    p.style.width = rect.width + 'px';
    p.style.height = rect.height + 'px';
    p.style.top = rect.top + 'px';    // Başlangıç noktasını oturt
    p.style.left = rect.left + 'px';  // (dokunma hareketiyle güncellenecek)
    p.style.zIndex = '99999';
    p.style.pointerEvents = 'none';
    p.style.opacity = '0.8';
    p.style.margin = '0';
    p.style.boxShadow = '0 10px 25px rgba(0,0,0,0.6)';

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

// --- GÖRSEL EFEKTLER VE ANİMASYONLAR ---
async function animateTileMovement() {
    return Promise.resolve();
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

    // 2. TÜM OLASI GRUPLARI ÜRET (Aday Havuzu)
    const candidates = [];
    const others = result.leftovers;

    // A) Set Adayları (Aynı Sayı, Farklı Renk)
    const groupedNums = groupTilesByNumber(others);
    Object.keys(groupedNums).forEach(num => {
        let tiles = groupedNums[num];
        // Benzersiz renkleri al (101'de sette aynı renkten iki taş olamaz)
        let unique = []; let seen = new Set();
        tiles.forEach(t => { if(!seen.has(t.color)) { unique.push(t); seen.add(t.color); } });

        // 3'lü ve 4'lü setler
        if (unique.length >= 3) {
            candidates.push({ tiles: unique.slice(0, 3), points: getSetPoints(unique.slice(0, 3)), type: 'set' });
            if (unique.length === 4) candidates.push({ tiles: unique, points: getSetPoints(unique), type: 'set' });
        }
        // Okeyli Set (2 Taş + 1 Okey)
        if (unique.length === 2 && okeys.length > 0) {
            candidates.push({ tiles: [...unique, okeys[0]], points: getSetPoints([...unique, okeys[0]]), type: 'set' });
        }
    });

    // B) Seri Adayları (Aynı Renk, Ardışık)
    const groupedClrs = groupTilesByColor(others);
    Object.keys(groupedClrs).forEach(clr => {
        let list = groupedClrs[clr].sort((a,b) => a.number - b.number);
        
        // Uzun seri bulucu (3'ten 13'e kadar tüm olası serileri tara)
        for (let len = 3; len <= 13; len++) {
            for (let i = 0; i <= list.length - len; i++) {
                let sub = list.slice(i, i + len);
                let pts = getRunPoints(sub);
                if (pts > 0) {
                    candidates.push({ tiles: sub, points: pts, type: 'run' });
                }
            }
        }

        // Okeyli Seri Adayları (Kısa ve Orta Boy)
        if (okeys.length > 0) {
           for (let len = 2; len <= 5; len++) {
               for (let i = 0; i <= list.length - len; i++) {
                   let sub = list.slice(i, i + len);
                   // Okeyi sona, başa veya araya ekleyip test et
                   let variations = [
                       [...sub, okeys[0]],
                       [okeys[0], ...sub]
                   ];
                   // İçerideki boşlukları okeyle doldurma testi (Örn: 5-?-7)
                   if (len === 2 && list[i+1].number - list[i].number === 2) {
                       variations.push([list[i], okeys[0], list[i+1]]);
                   }
                   
                   variations.forEach(t => {
                       let pts = getRunPoints(t);
                       if (pts > 0) candidates.push({ tiles: t, points: pts, type: 'run' });
                   });
               }
           }
        }
    });

    // 3. EN YÜKSEK PUANI VERENLERİ SEÇ (CONFLICT RESOLUTION)
    // Önce okey kullanmayan gruplar, sonra okey kullananlar (Okeyi en çok gerekeni için sakla)
    candidates.sort((a, b) => {
        const aIsWild = a.tiles.some(t => isWildCard(t)) ? -200 : 0;
        const bIsWild = b.tiles.some(t => isWildCard(t)) ? -200 : 0;
        return (b.points + bIsWild) - (a.points + aIsWild);
    });

    const usedIds = new Set();
    let usedOkeyCount = 0;

    candidates.forEach(cand => {
        // Bu adayın içindeki gerçek taşlar hala elde mi?
        const realTiles = cand.tiles.filter(t => !isWildCard(t));
        const hasOkey = cand.tiles.some(t => isWildCard(t));
        
        const canUseReal = realTiles.every(t => !usedIds.has(t.id));
        const canUseOkey = !hasOkey || (usedOkeyCount < okeys.length);

        if (canUseReal && canUseOkey) {
            // Grubu kabul et
            result.complete.push(cand.tiles);
            realTiles.forEach(t => { 
                usedIds.add(t.id);
                removeTileFromList(result.leftovers, t);
            });
            if (hasOkey) usedOkeyCount++;
        }
    });

    // 4. POTANSİYELLERİ VE ÇİFTLERİ BELİRLE (KALANLAR ARASINDA)
    const remaining = result.leftovers;
    
    // Potansiyel İkililer (9-10 gibi)
    const pRuns = groupTilesByColor(remaining);
    Object.keys(pRuns).forEach(clr => {
        let l = pRuns[clr].sort((a,b) => a.number - b.number);
        for(let i=0; i<l.length-1; i++) {
            if (l[i+1].number - l[i].number <= 2) {
                result.potential.push([l[i], l[i+1]]);
                removeTileFromList(result.leftovers, l[i]);
                removeTileFromList(result.leftovers, l[i+1]);
                i++;
            }
        }
    });

    // Çiftler
    const identicals = {};
    result.leftovers.forEach(t => {
        const k = `${t.number}_${t.color}`;
        if (!identicals[k]) identicals[k] = [];
        identicals[k].push(t);
    });
    Object.keys(identicals).forEach(k => {
        let list = identicals[k];
        while (list.length >= 2) {
            const pair = [list.pop(), list.pop()];
            result.pairs.push(pair);
            pair.forEach(t => removeTileFromList(result.leftovers, t));
        }
    });

    // 5. Kalan kullanılmayan okeyleri artıklara geri ekle
    for (let i = usedOkeyCount; i < okeys.length; i++) {
        result.leftovers.push(okeys[i]);
    }

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
            if (temp.length === 0) {
                temp.push(l[i]);
                continue;
            }
            const diff = l[i].number - temp[temp.length - 1].number;
            if (diff === 1) temp.push(l[i]);
            else if (diff === 0) continue; // Aynı sayıdaki duplicate taşı yoksay, diziyi bozma
            else { 
                if (temp.length >= 3) runs.push([...temp]); 
                temp = [l[i]]; 
            }
        }
        if (temp.length >= 3) runs.push(temp);
    });
    return runs;
}

function sortRunGroupInPlace(group) {
    if (getRunPoints(group) === 0) return;
    const nonWilds = group.filter(t => !isWildCard(t)).sort((a, b) => a.number - b.number);
    let okeys = group.filter(t => isWildCard(t));
    if (nonWilds.length === 0) return;

    group.length = 0;
    for (let i = 0; i < nonWilds.length; i++) {
        group.push(nonWilds[i]);
        if (i < nonWilds.length - 1) {
            let gap = nonWilds[i + 1].number - nonWilds[i].number - 1;
            while (gap > 0 && okeys.length > 0) {
                group.push(okeys.pop());
                gap--;
            }
        }
    }
    while (okeys.length > 0) {
        if (nonWilds[nonWilds.length - 1].number + 1 <= 13 && group.length < 13) {
            group.push(okeys.pop());
            nonWilds.push({ number: nonWilds[nonWilds.length - 1].number + 1 });
        } else {
            group.unshift(okeys.pop());
        }
    }
}

function autoSortSeries() {
    let allTiles = gameState.players.user.hand.filter(t => t);
    let usedIds = new Set();
    gameState.userRackSlots.fill(null);
    let currentIdx = 0;

    const addToRack = (tile) => {
        if (!tile || usedIds.has(tile.id)) return false;
        if (currentIdx < 40) {
            gameState.userRackSlots[currentIdx++] = tile;
            usedIds.add(tile.id);
            return true;
        }
        return false;
    };

    const addGap = () => {
        if (currentIdx % 20 !== 0 && currentIdx < 40) currentIdx++;
    };

    // YENİ: Satıra sığma kontrolü (Kapasite emniyetli)
    const ensureRowFit = (len) => {
        let currentPosInRow = currentIdx % 20;
        let remainingTiles = allTiles.length - usedIds.size;
        
        // Eğer ilk satırdaysak VE grup sığmıyorsa;
        // Sadece kalan tüm taşlar ikinci satıra (20 slot) sığacaksa atla.
        // Böylece 21-22 taşı olan oyuncunun taşları dışarıda kalmaz.
        if (currentIdx < 20 && (currentPosInRow + len > 20)) {
            if (remainingTiles <= 20) {
                currentIdx = 20;
            }
        }
    };

    // 1. TAMAMLANMIŞ GRUPLARI BUL (3+)
    let { complete } = findGroups(allTiles);
    complete.forEach(group => {
        if (getRunPoints(group) > 0) sortRunGroupInPlace(group);
        
        ensureRowFit(group.length);
        
        group.forEach(t => addToRack(t));
        addGap();
    });

    // 2. ZİNCİRLERİ BUL (POTANSİYEL SERİLER - 2+ Taş, Boşluklu Dahil)
    let remainingForRuns = allTiles.filter(t => !usedIds.has(t.id));
    const colorGroups = groupTilesByColor(remainingForRuns);
    
    Object.keys(colorGroups).forEach(clr => {
        let list = colorGroups[clr].sort((a,b) => a.number - b.number);
        for (let i = 0; i < list.length; i++) {
            if (usedIds.has(list[i].id)) continue;
            
            let chain = [list[i]];
            let lastNum = list[i].number;
            
            for (let j = i + 1; j < list.length; j++) {
                if (usedIds.has(list[j].id)) continue;
                let diff = list[j].number - lastNum;
                if (diff >= 1 && diff <= 2) {
                    chain.push(list[j]);
                    lastNum = list[j].number;
                } else if (diff === 0) {
                    continue; 
                } else {
                    break;
                }
            }
            
            if (chain.length >= 2) {
                // Toplam uzunluğu (boşluklar dahil) hesapla
                let totalVisualLen = chain.length;
                for (let k = 1; k < chain.length; k++) {
                    if (chain[k].number - chain[k-1].number === 2) totalVisualLen++;
                }
                
                ensureRowFit(totalVisualLen);

                for (let k = 0; k < chain.length; k++) {
                    if (k > 0 && chain[k].number - chain[k-1].number === 2) {
                        if (currentIdx < 40) currentIdx++; 
                    }
                    addToRack(chain[k]);
                }
                addGap();
            }
        }
    });

    // 3. ZİNCİRLERİ BUL (POTANSİYEL SETLER - Aynı Sayı Farklı Renk)
    let remainingForSets = allTiles.filter(t => !usedIds.has(t.id));
    const numGroups = groupTilesByNumber(remainingForSets);
    
    Object.keys(numGroups).sort((a,b) => parseInt(a)-parseInt(b)).forEach(num => {
        let list = numGroups[num];
        let uniqueForSet = [];
        let colorsUsed = new Set();
        
        list.forEach(t => {
            if (!usedIds.has(t.id) && !colorsUsed.has(t.color)) {
                uniqueForSet.push(t);
                colorsUsed.add(t.color);
            }
        });
        
        if (uniqueForSet.length >= 2) {
            ensureRowFit(uniqueForSet.length);
            uniqueForSet.forEach(t => addToRack(t));
            addGap();
        }
    });

    // 4. EN SON KALANLAR (Rastgele Artıklar)
    let finalLeftovers = allTiles.filter(t => !usedIds.has(t.id));
    // Artıkları renk ve sayıya göre sıralayalım ki düzenli dursunlar
    finalLeftovers.sort((a, b) => (COLORS.indexOf(a.color) - COLORS.indexOf(b.color)) || (a.number - b.number));
    
    finalLeftovers.forEach(t => {
        addToRack(t);
    });

    renderUserRack();
    showGameMessage("Seriler akıllıca dizildi! 🎯");
}

function autoSortPairs() {
    let hand = [...gameState.players.user.hand.filter(t => t)];
    let pairs = [];
    let okeys = [];

    // 1. Okeyleri (Gerçek ve Sahte) ayır
    for (let i = 0; i < hand.length; i++) {
        if (isWildCard(hand[i])) {
            okeys.push(hand.splice(i, 1)[0]);
            i--;
        }
    }

    // 2. Doğal Çiftleri Bul (Aynı renk ve sayı)
    hand.sort((a,b) => a.number - b.number || a.color.localeCompare(b.color));
    for (let i = 0; i < hand.length - 1; i++) {
        if (hand[i].number === hand[i + 1].number && hand[i].color === hand[i + 1].color) {
            pairs.push([hand[i], hand[i + 1]]);
            hand.splice(i, 2);
            i--;
        }
    }

    // 3. Kalan okeyleri (Varsa) KALAN TEKTAŞLARLA ÇİFTLE (Maksimum çift üret)
    while (okeys.length > 0) {
        if (hand.length > 0) {
            // Bir okeyi, eldeki en büyük tektaşla çift yap (Daha fazla çift üretir)
            hand.sort((a, b) => b.number - a.number);
            pairs.push([okeys.pop(), hand.shift()]);
        } else if (okeys.length >= 2) {
            // Sadece okeyler kaldıysa, iki okeyi bir çift yap
            pairs.push([okeys.pop(), okeys.pop()]);
        } else {
            // Sadece tek okey kaldıysa okeylere geri at (leftover gibi)
            break;
        }
    }

    // 4. Perleri de dizmek için findGroups kullan (Eğer çiftlerden kalanlarla seri oluyorsa)
    let { complete, pairs: extraPairs, potential, leftovers: finalLeftovers } = findGroups(hand);
    let totalLeftovers = [...finalLeftovers, ...okeys];
    
    gameState.userRackSlots.fill(null);
    let currentIdx = 0;

    const ensureRowFit = (len) => {
        let currentPosInRow = currentIdx % 20;
        // Çift diziliminde tüm taşların sığacağından emin ol (Sadece ikinci satıra sığıyorsa atla)
        // Mevcut idx'ten itibaren kaç taş dizeceğimiz:
        let totalRemaining = (pairs.filter((p,i)=>i >= currentIdx/3).length * 2) + 
                            complete.reduce((a,b)=>a+b.length, 0) + 
                            extraPairs.length * 2 + 
                            potential.reduce((a,b)=>a+b.length, 0) + 
                            totalLeftovers.length;
        
        if (currentIdx < 20 && (currentPosInRow + len > 20)) {
            if (totalRemaining <= 20) {
                currentIdx = 20;
            }
        }
    };

    // Önce çiftleri diz (Başa)
    pairs.forEach(p => { 
        if (currentIdx < 39) { 
            ensureRowFit(2);
            gameState.userRackSlots[currentIdx++] = p[0]; 
            gameState.userRackSlots[currentIdx++] = p[1]; 
            if (currentIdx % 20 !== 0) currentIdx++; // Gap
        } 
    });

    // Varsa tam perleri diz (Orta)
    complete.forEach(g => { 
        ensureRowFit(g.length);
        g.forEach(t => { if (currentIdx < 40) gameState.userRackSlots[currentIdx++] = t; }); 
        if (currentIdx % 20 !== 0) currentIdx++; // Gap
    });

    // Varsa ekstra çiftleri diz
    extraPairs.forEach(p => {
        if (currentIdx < 39) {
            ensureRowFit(2);
            gameState.userRackSlots[currentIdx++] = p[0];
            gameState.userRackSlots[currentIdx++] = p[1];
            if (currentIdx % 20 !== 0) currentIdx++; // Gap
        }
    });

    // Varsa potansiyelleri diz
    potential.forEach(g => { 
        ensureRowFit(g.length);
        g.forEach(t => { if (currentIdx < 40) gameState.userRackSlots[currentIdx++] = t; }); 
        if (currentIdx % 20 !== 0) currentIdx++; // Gap
    });

    // Kalan tektaşları ve tek kalan okeyleri diz
    totalLeftovers.sort((a, b) => (COLORS.indexOf(a.color) - COLORS.indexOf(b.color)) || (a.number - b.number))
        .forEach(t => { 
            if (currentIdx < 40) gameState.userRackSlots[currentIdx++] = t; 
        });

    renderUserRack();
    showGameMessage("Çiftler dizildi. ⚡");
}

// --- DOM LİSTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    const playerUserWrapper = document.querySelector('.rack-wrapper');
    if (playerUserWrapper) {
        playerUserWrapper.addEventListener('dragover', (e) => e.preventDefault());
        playerUserWrapper.addEventListener('drop', (e) => {
            if (e.target.closest('.tile-slot')) return;
            e.preventDefault();
            const src = e.dataTransfer.getData('source') || e.dataTransfer.getData('text/plain');
            if (src === 'deck') handleDraw(-1);
            else if (src === 'discard') attemptStealDiscard();
        });
    }
    ['series-field', 'pairs-field'].forEach(fId => {
        const field = document.getElementById(fId);
        if (field) {
            field.ondragover = (e) => e.preventDefault();
            field.ondrop = (e) => {
                e.preventDefault();
                const tileId = e.dataTransfer.getData('tileId');
                if (tileId) attemptOpenCluster(tileId);
            };
        }
    });
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

    const btnProcess = document.getElementById('btn-process');
    if (btnProcess) btnProcess.onclick = autoProcessUserTiles;

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
        const userNameTag = document.getElementById("user-name-plaque");
        if (userNameTag) userNameTag.textContent = gameState.players.user.name;
        gameState.maxRounds = roundsVal;
        // Apply helpers toggle
        const helpersToggle = document.getElementById('toggle-helpers');
        const userArea = document.getElementById('player-user');
        if (helpersToggle && userArea) {
            if (helpersToggle.checked) userArea.classList.remove('helpers-hidden');
            else userArea.classList.add('helpers-hidden');
        }
        
        // Apply sound toggle
        const soundToggle = document.getElementById('toggle-sound');
        if (soundToggle) {
            gameState.settings.sound = soundToggle.checked;
        }

        // --- HAFIZAYA KAYDET (localStorage) ---
        const prefs = {
            names: { 
                user: gameState.players.user.name, 
                bot1: gameState.players.bot1.name, 
                bot2: gameState.players.bot2.name, 
                bot3: gameState.players.bot3.name 
            },
            rounds: roundsVal,
            helpers: helpersToggle ? helpersToggle.checked : true,
            sound: soundToggle ? soundToggle.checked : true
        };
        try { localStorage.setItem('okey101_prefs', JSON.stringify(prefs)); } catch(e) {}

        document.getElementById('settings-modal').style.display = 'none';
        showGameMessage(`Ayarlar Kaydedildi! (${roundsVal} el)`);
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

        deckPile.addEventListener('dragstart', (e) => { 
            // Mobilde native drag'i iptal et (dev gölge çıkmasın)
            if (gameState.touch.phantom) {
                e.preventDefault();
                return;
            }
            e.dataTransfer.setData('source', 'deck');
            e.dataTransfer.setData('text/plain', 'deck'); 
        });

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
            const isPeeking = zone.classList.contains('peeking');
            document.querySelectorAll('.discard-zone').forEach(z => z.classList.remove('peeking'));
            if (!isPeeking) {
                zone.classList.add('peeking');
                const pId = getPID(zone);
                const tiles = zone.querySelectorAll('.tile');
                tiles.forEach((t, idx) => {
                    t.style.position = 'absolute';
                    if (zone.classList.contains('top')) t.style.top = (idx * 55) + 'px';
                    else t.style.top = (-idx * 55) + 'px';
                });
            }
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

    // --- BİLGİ BUTONU VE PWA KURULUMU ---
    const infoBtn = document.getElementById('info-btn');
    if (infoBtn) infoBtn.onclick = () => document.getElementById('info-modal').style.display = 'flex';

    let deferredPrompt;
    const installOverlay = document.getElementById('pwa-install-overlay');
    const installBtn = document.getElementById('pwa-install-btn');
    const iosGuide = document.getElementById('ios-guide');
    const closeInstall = document.getElementById('close-install');

    // Uygulama yüklü mü kontrolü
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    if (!isStandalone) {
        // iOS Kontrolü
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            // Android/Chrome için kurulum ekranını göster
            if (!isIOS) installOverlay.style.display = 'flex';
        });

        // iOS için özel yönergeyi 3 saniye sonra göster (PWA değilse)
        if (isIOS) {
            setTimeout(() => {
                installBtn.style.display = 'none';
                iosGuide.classList.remove('ios-guide-hidden');
                document.getElementById('install-text').innerText = "iPhone/iPad için ana ekrana ekle özelliğini kullanın:";
                installOverlay.style.display = 'flex';
            }, 3000);
        }
    }

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') installOverlay.style.display = 'none';
                deferredPrompt = null;
            }
        });
    }

    if (closeInstall) {
        closeInstall.onclick = () => installOverlay.style.display = 'none';
    }

    // --- BAŞLANGIÇ HAFIZASINI YÜKLE (localStorage Restore) ---
    try {
        const data = localStorage.getItem('okey101_prefs');
        if (data) {
            const prefs = JSON.parse(data);
            if (prefs.names) {
                gameState.players.user.name = prefs.names.user || 'Sen';
                gameState.players.bot1.name = prefs.names.bot1 || 'Samet';
                gameState.players.bot2.name = prefs.names.bot2 || 'Deniz';
                gameState.players.bot3.name = prefs.names.bot3 || 'Sinem';
                
                // Ayarlar Modalı Inputlarını Doldur
                ['user','bot1','bot2','bot3'].forEach(pId => {
                    const el = document.getElementById(`name-${pId}`);
                    if (el) el.value = prefs.names[pId];
                });

                // Masa İsimlerini Çivile
                const tgB1 = document.querySelector('#bot-1 .name-tag'); if(tgB1) tgB1.textContent = prefs.names.bot1;
                const tgB2 = document.querySelector('#bot-2 .name-tag'); if(tgB2) tgB2.textContent = prefs.names.bot2;
                const tgB3 = document.querySelector('#bot-3 .name-tag'); if(tgB3) tgB3.textContent = prefs.names.bot3;
                const tgU = document.getElementById('user-name-plaque'); if(tgU) tgU.textContent = prefs.names.user;
            }
            if (prefs.rounds) {
                gameState.maxRounds = prefs.rounds;
                if (typeof roundsVal !== 'undefined') roundsVal = prefs.rounds;
                const rd = document.getElementById('rounds-display'); if(rd) rd.textContent = prefs.rounds;
            }
            if (prefs.helpers !== undefined) {
                const tgH = document.getElementById('toggle-helpers');
                if(tgH) tgH.checked = prefs.helpers;
                const uArea = document.getElementById('player-user');
                if (uArea) {
                    if (prefs.helpers) uArea.classList.remove('helpers-hidden');
                    else uArea.classList.add('helpers-hidden');
                }
            }
            if (prefs.sound !== undefined) {
                gameState.settings.sound = prefs.sound;
                const tgS = document.getElementById('toggle-sound');
                if(tgS) tgS.checked = prefs.sound;
            }
        }
    } catch(e) { console.warn("Hafıza okuma hatası", e); }

    // -- PHANTOM CLEANUP LISTENERS --
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    // Başlangıç
    initGame();
});



