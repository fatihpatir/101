const COLORS = ['red', 'blue', 'black', 'yellow'];
let deck = [];
let players = {
    user: { hand: [], isOpened: false, openType: null, score: 0, penalty101: 0 },
    bot1: { hand: [], isOpened: false, openType: null, score: 0, penalty101: 0 },
    bot2: { hand: [], isOpened: false, openType: null, score: 0, penalty101: 0 },
    bot3: { hand: [], isOpened: false, openType: null, score: 0, penalty101: 0 }
};

let turnOrder = ['user', 'bot3', 'bot2', 'bot1']; // SAAT YÖNÜNÜN TERSİ
let currentTurnIndex = 0;
let selectedTileIds = new Set();
let hasDrawn = false; // Bu el taş çekildi mi?
let indicatorTile = null;
let okeyTile = null;
let openedSeries = [];
let openedPairs = [];
let userRackSlots = new Array(40).fill(null); // Sabit 40 yuvalı ıstaka (20+20)

// Oyun Ayarları
let gameConfig = {
    names: { user: 'Fatih', bot1: 'Bot 1', bot2: 'Bot 2', bot3: 'Bot 3' },
    maxRounds: 11,
    currentRound: 1,
    isMuted: false,
    theme: 'classic'
};

class Tile {
    constructor(number, color, isJoker = false) {
        this.number = number;
        this.color = color;
        this.isJoker = isJoker;
        this.id = Math.random().toString(36).substr(2, 9);
    }

    createHTMLElement(isDisplayOnly = false) {
        const div = document.createElement('div');
        div.className = `tile ${selectedTileIds.has(this.id) ? 'selected' : ''}`;
        div.dataset.id = this.id;

        // Sürüklenebilir yapalım (Sıra beklerken de düzenleme için açık)
        if (!isDisplayOnly) {
            div.draggable = true;
            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('tileId', this.id);
                div.classList.add('dragging');
            });
            div.addEventListener('dragend', () => {
                div.classList.remove('dragging');
            });

            // Üzerine taş bırakıldığında yer değiştirme (Intra-rack move)
            div.addEventListener('dragover', (e) => {
                e.preventDefault();
                div.classList.add('drag-hover');
            });
            div.addEventListener('dragleave', () => {
                div.classList.remove('drag-hover');
            });
            div.addEventListener('drop', (e) => {
                e.preventDefault();
                div.classList.remove('drag-hover');
                const draggedId = e.dataTransfer.getData('tileId');
                if (draggedId && draggedId !== this.id) {
                    moveTileInRack(draggedId, this.id);
                }
            });
        }

        let displayColor = getColorCode(this.color);
        let isRealOkey = (this.number === okeyTile.number && this.color === okeyTile.color);

        if (this.isJoker || isRealOkey) {
            div.classList.add('okey-tile');
            div.innerHTML = `<span style="color: #ff5722">${this.isJoker ? 'J' : this.number}</span><div class="tile-dot" style="background: #ff5722"></div>`;
        } else {
            div.innerHTML = `
                <span class="tile-number" style="color: ${displayColor}">${this.number}</span>
                <div class="tile-dot" style="background: ${displayColor}"></div>
            `;
        }

        if (!isDisplayOnly) {
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                // Her zaman seçilebilir olsun (Sıra beklerken düzenleme için)
                toggleTileSelection(this.id);
            });
        }

        return div;
    }
}

function initGame() {
    deck = createFullDeck();
    shuffle(deck);

    indicatorTile = deck.pop();
    determineOkey();
    renderIndicator();

    // Dağıtıcının sağındaki başlar (22 taş)
    players.bot3.hand = deck.splice(0, 22);
    players.user.hand = deck.splice(0, 21);
    players.bot2.hand = deck.splice(0, 21);
    players.bot1.hand = deck.splice(0, 21);

    // Kullanıcı taşlarını ıstaka yuvalarına diz
    userRackSlots.fill(null);
    players.user.hand.forEach((tile, i) => {
        userRackSlots[i] = tile;
    });

    currentTurnIndex = 1; // Bot 3 başlıyor

    renderUserRack();
    updateDeckCount();
    updateTurnUI();
    updatePlayerNamesUI(); // İsimleri ayarlardan çek

    if (turnOrder[currentTurnIndex] !== 'user') {
        setTimeout(botPlay, 1500);
    }
}

// --- Doğrulama ve Açma Kuralları ---

function findValidSets(tiles) {
    let sets = [];
    let remaining = [...tiles];

    // Önce Grupları bul (3 veya 4 tane aynı numara farklı renk)
    let numbers = [...new Set(remaining.map(t => t.number))];
    numbers.forEach(num => {
        let sameNum = remaining.filter(t => t.number === num && !t.isJoker);
        // Renkleri kontrol et (aynı numara olsa bile renkler farklı olmalı)
        let uniqueColors = new Set(sameNum.map(t => t.color));
        if (sameNum.length >= 3 && uniqueColors.size === sameNum.length) {
            sets.push({ tiles: sameNum, sum: sameNum.length * num, type: 'group' });
            sameNum.forEach(sn => remaining = remaining.filter(r => r.id !== sn.id));
        }
    });

    // Sonra Serileri bul (Aynı renk ardışık)
    COLORS.forEach(color => {
        let sameColor = remaining.filter(t => t.color === color).sort((a, b) => a.number - b.number);
        if (sameColor.length < 3) return;

        let tempSeries = [sameColor[0]];
        for (let i = 1; i < sameColor.length; i++) {
            if (sameColor[i].number === tempSeries[tempSeries.length - 1].number + 1) {
                tempSeries.push(sameColor[i]);
            } else {
                if (tempSeries.length >= 3) {
                    sets.push({ tiles: [...tempSeries], sum: tempSeries.reduce((s, t) => s + t.number, 0), type: 'series' });
                }
                tempSeries = [sameColor[i]];
            }
        }
        if (tempSeries.length >= 3) {
            sets.push({ tiles: [...tempSeries], sum: tempSeries.reduce((s, t) => s + t.number, 0), type: 'series' });
        }
    });

    return sets;
}

function handleOpenSeries() {
    if (turnOrder[currentTurnIndex] !== 'user' || !hasDrawn) {
        alert("Sıra sizde değil veya henüz taş çekmediniz!");
        return;
    }

    // Istakadaki görsel grupları otomatik algıla
    let groupsOnRack = [];
    let currentGroup = [];
    for (let i = 0; i <= 40; i++) {
        const tile = (i < 40) ? userRackSlots[i] : null;
        if (tile === null) {
            if (currentGroup.length >= 3) {
                let res = validateVisualSet(currentGroup);
                if (res.valid) groupsOnRack.push({ tiles: [...currentGroup], sum: res.sum });
            }
            currentGroup = [];
        } else {
            currentGroup.push(tile);
        }
    }

    if (groupsOnRack.length === 0) {
        alert("Istakanızda geçerli bir seri bulunamadı. Önce taşları 'SERİ' butonuyla dizin veya aralarında boşluk bırakarak gruplayın.");
        return;
    }

    let totalSum = groupsOnRack.reduce((s, g) => s + g.sum, 0);
    if (totalSum < 101) {
        alert("Perlerin toplamı en az 101 yapmadan açamazsınız");
        return;
    }

    // AÇILIŞ GERÇEKLEŞİYOR
    let openedIds = new Set();
    groupsOnRack.forEach(group => {
        openedSeries.push({ tiles: group.tiles, owner: 'user' });
        renderSeriesOnTable(group.tiles);
        group.tiles.forEach(t => {
            openedIds.add(t.id);
            // Istakadan sil
            let idx = userRackSlots.indexOf(t);
            if (idx !== -1) userRackSlots[idx] = null;
        });
    });

    players.user.hand = players.user.hand.filter(t => !openedIds.has(t.id));
    players.user.isOpened = true;
    players.user.openType = 'series'; // Seri açtığını kaydet
    selectedTileIds.clear();
    renderUserRack();
    alert(`Tebrikler! ${totalSum} puanla elinizi açtınız.`);
}

function handleOpenPairs() {
    if (turnOrder[currentTurnIndex] !== 'user' || !hasDrawn) {
        alert("Sıra sizde değil veya taş çekmediniz!");
        return;
    }

    // Istakadaki çiftleri otomatik algıla (yan yana aynı iki taş + boşluk kuralı)
    let pairsOnRack = [];
    let currentGroup = [];
    for (let i = 0; i <= 40; i++) {
        const tile = (i < 40) ? userRackSlots[i] : null;
        if (tile === null) {
            if (currentGroup.length === 2) {
                let t1 = currentGroup[0], t2 = currentGroup[1];
                if (t1.number === t2.number && t1.color === t2.color && !t1.isJoker) {
                    pairsOnRack.push([t1, t2]);
                }
            }
            currentGroup = [];
        } else {
            currentGroup.push(tile);
        }
    }

    if (pairsOnRack.length < 5) {
        alert("En az 5 çift yapmadan açamazsınız");
        return;
    }

    // AÇILIŞ GERÇEKLEŞİYOR
    let openedIds = new Set();
    pairsOnRack.forEach(pair => {
        openedPairs.push({ tiles: pair, owner: 'user' });
        renderPairsOnTable(pair);
        pair.forEach(t => {
            openedIds.add(t.id);
            let idx = userRackSlots.indexOf(t);
            if (idx !== -1) userRackSlots[idx] = null;
        });
    });

    players.user.hand = players.user.hand.filter(t => !openedIds.has(t.id));
    players.user.isOpened = true;
    players.user.openType = 'pairs'; // Çift açtığını kaydet
    selectedTileIds.clear();
    renderUserRack();
    alert("5 Çift ile elinizi açtınız!");
}

function handleProcess() {
    if (turnOrder[currentTurnIndex] !== 'user' || !hasDrawn) {
        alert("Sıra sizde değil veya taş çekmediniz!");
        return;
    }
    if (!players.user.isOpened) {
        alert("Taş işlemek için önce elinizi açmalısınız!");
        return;
    }
    if (selectedTileIds.size !== 1) {
        alert("İşlemek için sadece 1 taş seçmelisiniz.");
        return;
    }

    const tileId = [...selectedTileIds][0];
    const tile = players.user.hand.find(t => t.id === tileId);
    let success = false;

    // 1. Serilere İşleme ve Okey Çalma Kontrolü
    for (let set of openedSeries) {
        // Okey Çalma Kontrolü: Eğer sette okey varsa ve bendeki taş o okeyin yerine geçerse
        let jokerIdx = set.tiles.findIndex(t => t.isJoker || (t.number === okeyTile.number && t.color === okeyTile.color));
        if (jokerIdx !== -1) {
            let joker = set.tiles[jokerIdx];
            // Sahte taşın (okeyin) o anki değerini hesapla (Basit mantık: i-1 veya i+1)
            let neededNum = (jokerIdx === 0) ? set.tiles[1].number - 1 : set.tiles[0].number + jokerIdx;
            if (tile.number === neededNum && tile.color === set.tiles[0].color) {
                // Okey Çalma!
                alert("Okeyi çaldınız! Karşı tarafa +101 ceza yazıldı.");
                players[set.owner].penalty101 += 1; // Ceza puanı ekle

                // Taşları değiştir
                set.tiles[jokerIdx] = tile;
                replaceTileInHand(tileId, joker); // Okeyi elime al
                renderSeriesOnTable(); // Masayı yenile
                success = true;
                break;
            }
        }

        // Normal seri işleme (Başa veya Sona)
        let first = set.tiles[0], last = set.tiles[set.tiles.length - 1];
        if (tile.color === first.color) {
            if (tile.number === first.number - 1 && tile.number >= 1) {
                set.tiles.unshift(tile);
                success = true;
            } else if (tile.number === last.number + 1 && tile.number <= 13) {
                set.tiles.push(tile);
                success = true;
            }
        } else if (set.type === 'group' && tile.number === first.number) {
            // Farklı renk aynı numara grubu
            if (!set.tiles.some(t => t.color === tile.color)) {
                set.tiles.push(tile);
                success = true;
            }
        }
        if (success) break;
    }

    // 2. Çiftlere İşleme
    if (!success) {
        for (let pairSet of openedPairs) {
            if (tile.number === pairSet.tiles[0].number && tile.color === pairSet.tiles[0].color) {
                pairSet.tiles.push(tile); // Çifte 3. veya 4. taş eklenebilir aslında, bazıları 3. taşa izin verir
                success = true;
                break;
            }
        }
    }

    if (success) {
        // Eğer okey çalmadıysa normal şekilde elden çıkar
        if (players.user.hand.includes(tile)) {
            removeTileFromHand(tileId);
        }
        selectedTileIds.clear();
        renderUserRack();
        renderSeriesOnTable(); // Tüm masayı yeniden çiz
        renderPairsOnTable();
    } else {
        alert("Bu taş hiçbir yere işlenemiyor!");
    }
}

function removeTileFromHand(tileId) {
    players.user.hand = players.user.hand.filter(t => t.id !== tileId);
    for (let i = 0; i < userRackSlots.length; i++) {
        if (userRackSlots[i] && userRackSlots[i].id === tileId) userRackSlots[i] = null;
    }
}

function replaceTileInHand(oldId, newTile) {
    let idx = userRackSlots.findIndex(t => t && t.id === oldId);
    if (idx !== -1) userRackSlots[idx] = newTile;
    players.user.hand = players.user.hand.filter(t => t.id !== oldId);
    players.user.hand.push(newTile);
}

function renderSeriesOnTable() {
    const field = document.getElementById('series-field');
    if (!field) return;
    field.innerHTML = '';

    // Etiketi geri koy
    const label = document.createElement('div');
    label.className = 'section-label';
    label.innerText = 'SERİLER';
    field.appendChild(label);

    openedSeries.forEach(set => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'tile-group';
        set.tiles.forEach(t => groupDiv.appendChild(t.createHTMLElement(true)));
        field.appendChild(groupDiv);
    });
}

function renderPairsOnTable() {
    const field = document.getElementById('pairs-field');
    if (!field) return;
    field.innerHTML = '';

    const label = document.createElement('div');
    label.className = 'section-label';
    label.innerText = 'ÇİFTLER';
    field.appendChild(label);

    openedPairs.forEach(pairSet => {
        const pairDiv = document.createElement('div');
        pairDiv.className = 'pair-group';
        pairSet.tiles.forEach(t => pairDiv.appendChild(t.createHTMLElement(true)));
        field.appendChild(pairDiv);
    });
}

function determineOkey() {
    let okeyNum = indicatorTile.number === 13 ? 1 : indicatorTile.number + 1;
    okeyTile = { number: okeyNum, color: indicatorTile.color };
}

function createFullDeck() {
    let newDeck = [];
    for (let set = 0; set < 2; set++) {
        COLORS.forEach(color => {
            for (let num = 1; num <= 13; num++) {
                newDeck.push(new Tile(num, color));
            }
        });
    }
    newDeck.push(new Tile(0, 'any', true));
    newDeck.push(new Tile(0, 'any', true));
    return newDeck;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function updateTurnUI() {
    // Önceki vurguları temizle
    document.querySelectorAll('.player-slot').forEach(slot => slot.classList.remove('active-turn'));
    document.getElementById('player-user').classList.remove('active-turn');

    const currentPlayerId = turnOrder[currentTurnIndex];
    let slot;
    if (currentPlayerId === 'user') {
        slot = document.getElementById('player-user');
    } else {
        const htmlId = currentPlayerId.replace('bot', 'bot-');
        slot = document.getElementById(htmlId);
    }

    if (slot) slot.classList.add('active-turn');

    // Sadece 'Açma' ve 'İşlem' butonlarını kilitle, 'Dizme' butonları açık kalsın
    const actionButtons = document.querySelectorAll('.btn-open, .btn-util');
    if (currentPlayerId === 'user') {
        actionButtons.forEach(btn => btn.classList.remove('disabled'));
    } else {
        actionButtons.forEach(btn => btn.classList.add('disabled'));
    }
}

function nextTurn() {
    hasDrawn = false; // Yeni turda taş çekme hakkını sıfırla
    currentTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
    updateTurnUI();
    if (turnOrder[currentTurnIndex] !== 'user') {
        setTimeout(botPlay, 2000);
    }
}

async function botPlay() {
    const botId = turnOrder[currentTurnIndex];

    // 1. Taş Çek
    if (deck.length > 0) {
        players[botId].hand.push(deck.pop());
        updateDeckCount();
    }

    await new Promise(r => setTimeout(r, 1000));

    // 2. Taş At
    const discardIndex = Math.floor(Math.random() * players[botId].hand.length);
    const discarded = players[botId].hand.splice(discardIndex, 1)[0];
    renderDiscard(botId, discarded);

    nextTurn();
}

function renderDiscard(playerId, tile) {
    const htmlId = playerId === 'user' ? 'user' : playerId.replace('bot', 'bot-');
    const zoneId = `discard-${htmlId}`;
    const zone = document.getElementById(zoneId);
    if (zone) {
        zone.innerHTML = '';
        zone.appendChild(tile.createHTMLElement(true));
    }
}

function userDiscard() {
    if (turnOrder[currentTurnIndex] !== 'user') return;
    if (!hasDrawn) {
        alert("Önce bir taş çekmelisin!");
        return;
    }
    if (selectedTileIds.size !== 1) {
        alert("Atmak için 1 taş seçmelisin!");
        return;
    }

    const tileId = [...selectedTileIds][0];
    processUserDiscard(tileId);
}

function processUserDiscard(tileId) {
    const slotIdx = userRackSlots.findIndex(t => t && t.id === tileId);
    if (slotIdx === -1) return;

    const discarded = userRackSlots[slotIdx];
    userRackSlots[slotIdx] = null;
    players.user.hand = userRackSlots.filter(t => t !== null);

    selectedTileIds.clear();
    renderUserRack();
    renderDiscard('user', discarded);

    // El bitti mi kontrol et
    if (players.user.hand.length === 0) {
        // Galibiyet Türü Tespiti
        let type = 'normal';
        let isOkeyFinish = (discarded.number === okeyTile.number && discarded.color === okeyTile.color);
        let isPairsFinish = players.user.openType === 'pairs'; // Eğer çift açarak bitirdiyse

        if (isPairsFinish && isOkeyFinish) type = 'okey_çift';
        else if (isOkeyFinish) type = 'okey';
        else if (isPairsFinish) type = 'çift';

        endGame('user', type);
        return;
    }

    nextTurn();
}

function renderUserRack() {
    const r1 = document.getElementById('row-1');
    const r2 = document.getElementById('row-2');
    if (!r1 || !r2) return;
    r1.innerHTML = ''; r2.innerHTML = '';

    for (let i = 0; i < 40; i++) {
        const slot = document.createElement('div');
        slot.className = 'tile-slot';
        slot.dataset.index = i;

        // Slot üzerine bırakma (Drop) olayı
        slot.addEventListener('dragover', (e) => e.preventDefault());
        slot.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('tileId');
            if (draggedId) {
                moveTileToSlot(draggedId, i);
            }
        });

        const tile = userRackSlots[i];
        if (tile) {
            slot.appendChild(tile.createHTMLElement());
        }

        if (i < 20) r1.appendChild(slot);
        else r2.appendChild(slot);
    }

    updateHandStats();
}

function moveTileToSlot(tileId, targetIdx) {
    const sourceIdx = userRackSlots.findIndex(t => t && t.id === tileId);
    if (sourceIdx === -1) return;

    const tile = userRackSlots[sourceIdx];

    // Eğer hedefte taş varsa yer değiştir (Swap)
    const targetTile = userRackSlots[targetIdx];
    userRackSlots[targetIdx] = tile;
    userRackSlots[sourceIdx] = targetTile;

    players.user.hand = userRackSlots.filter(t => t !== null);
    renderUserRack();
}

function updateHandStats() {
    const ptsEl = document.getElementById('hand-points');
    const pairsEl = document.getElementById('hand-pairs');
    if (!ptsEl || !pairsEl) return;

    let totalScore = 0;
    let pCount = 0;

    // Boşluklara göre ayırarak puanla (Istaka üzerindeki fiziksel dizilime göre)
    let currentGroup = [];
    for (let i = 0; i <= 40; i++) {
        const tile = (i < 40) ? userRackSlots[i] : null;
        if (tile === null) {
            if (currentGroup.length >= 3) {
                let set = validateVisualSet(currentGroup);
                if (set.valid) totalScore += set.sum;
            }
            currentGroup = [];
        } else {
            currentGroup.push(tile);
        }
    }

    // Çift Sayısı (Eldeki toplam çiftler)
    let processed = new Set();
    let hand = players.user.hand;
    for (let i = 0; i < hand.length; i++) {
        if (processed.has(hand[i].id)) continue;
        let mIdx = hand.findIndex((t, idx) => idx > i && !processed.has(t.id) && t.number === hand[i].number && t.color === hand[i].color && !t.isJoker);
        if (mIdx !== -1) {
            pCount++;
            processed.add(hand[i].id);
            processed.add(hand[mIdx].id);
        }
    }

    ptsEl.innerText = totalScore;
    pairsEl.innerText = pCount;
}

function validateVisualSet(tiles) {
    // 1. Aynı Renk Seri Kontrolü
    let isSeq = tiles.every(t => t.color === tiles[0].color);
    if (isSeq) {
        let sorted = [...tiles].sort((a, b) => a.number - b.number);
        // 12-13-1 YASAĞI: 13'ten sonra 1 gelmesi geçersizdir (101 kuralı)
        // Eğer grupta hem 13 hem 1 varsa bu bir seri olamaz.
        let has1 = sorted.some(t => t.number === 1);
        let has13 = sorted.some(t => t.number === 13);
        if (has1 && has13) return { valid: false };

        let seqValid = sorted.every((t, i, arr) => i === 0 || t.number === arr[i - 1].number + 1);
        if (seqValid) return { valid: true, sum: tiles.reduce((s, t) => s + t.number, 0) };
    }

    // 2. Farklı Renk Grup Kontrolü
    let isGrp = tiles.every(t => t.number === tiles[0].number);
    if (isGrp) {
        let colors = new Set(tiles.map(t => t.color));
        if (colors.size === tiles.length) return { valid: true, sum: tiles.reduce((s, t) => s + t.number, 0) };
    }

    return { valid: false };
}

function toggleTileSelection(id) {
    if (selectedTileIds.has(id)) selectedTileIds.delete(id);
    else selectedTileIds.add(id);
    renderUserRack();
}

function renderIndicator() {
    const el = document.getElementById('indicator-tile');
    if (!el) return;
    el.innerHTML = `
        <span class="tile-number" style="color: ${getColorCode(indicatorTile.color)}">${indicatorTile.number}</span>
        <div class="tile-dot" style="background: ${getColorCode(indicatorTile.color)}"></div>
    `;
}

function updateDeckCount() {
    const countText = document.querySelector('.deck-count');
    const deckPile = document.getElementById('deck-pile');
    if (countText) {
        countText.innerText = deck.length;
        if (deck.length === 0) {
            countText.classList.add('hidden');
            if (deckPile) deckPile.classList.add('empty');
        } else {
            countText.classList.remove('hidden');
            if (deckPile) deckPile.classList.remove('empty');
        }
    }
}

function endGame(winnerId, type = 'normal') {
    const modal = document.getElementById('scoreboard-modal');
    const scoreBody = document.getElementById('score-body');
    if (!modal || !scoreBody) return;

    scoreBody.innerHTML = '';

    // Katsayıları Belirle (Kralın Kuralları)
    let mult = 1;
    let winnerBonus = 101;
    let noOpenPenalty = 202;

    if (type === 'okey' || type === 'çift') {
        mult = 2;
        winnerBonus = 202;
        noOpenPenalty = 404;
    } else if (type === 'okey_çift') {
        mult = 8;
        winnerBonus = 808;
        noOpenPenalty = 808;
    }

    Object.keys(players).forEach(pid => {
        let penalty = 0;
        let pHand = players[pid].hand;

        if (pid === winnerId) {
            penalty = -winnerBonus;
        } else {
            // Eğer kimse açmadan deste bittiyse (winnerId 'none') herkese 202 yaz
            if (winnerId === 'none' && !players[pid].isOpened) {
                penalty = 202;
            } else if (!players[pid].isOpened) {
                penalty = noOpenPenalty;
            } else {
                // Elde kalan sayıların toplamı * Çarpan
                let handSum = pHand.reduce((s, t) => s + (t.number === okeyTile.number && t.color === okeyTile.color ? 20 : t.number), 0);
                penalty = handSum * mult;
            }
        }

        // Okey Çaldırma Cezası (+101) varsa buraya eklenmeli
        if (players[pid].penalty101) {
            penalty += 101;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${pid === 'user' ? 'Fatih (Sen)' : pid.toUpperCase()} ${pid === winnerId ? '🏆' : ''}</td>
            <td style="color: ${penalty <= 0 ? '#4caf50' : '#ff5252'}">${penalty}</td>
        `;
        scoreBody.appendChild(row);
    });

    modal.style.display = 'flex';
}

function getColorCode(color) {
    const colorMap = { 'red': '#d32f2f', 'blue': '#1976d2', 'black': '#212121', 'yellow': '#fbc02d', 'any': '#ff5722' };
    return colorMap[color] || '#333';
}

// Akıllı Seri Dizme
// Akıllı Seri Dizme (Kayıtlı Yuvalara)
function autoSortSeries() {
    let hand = [...players.user.hand];
    let bestSets = [];
    let usedIds = new Set();

    // 1. Tüm olası perleri (Grup ve Seri) puanlarıyla beraber bul
    let allPossible = [];

    // Grupları bul (Sayıları aynı, renkleri farklı)
    let byNum = {};
    hand.forEach(t => {
        if (!t.isJoker) {
            byNum[t.number] = byNum[t.number] || [];
            byNum[t.number].push(t);
        }
    });
    Object.keys(byNum).forEach(num => {
        let tiles = byNum[num];
        // Renkleri tekilleştir (aynı renkli aynı sayı grupta olamaz)
        let uniqueTiles = [];
        let colorsSeen = new Set();
        tiles.forEach(t => {
            if (!colorsSeen.has(t.color)) {
                uniqueTiles.push(t);
                colorsSeen.add(t.color);
            }
        });
        if (uniqueTiles.length >= 3) {
            allPossible.push({
                tiles: uniqueTiles,
                sum: uniqueTiles.reduce((s, t) => s + t.number, 0),
                type: 'group'
            });
        }
    });

    // Serileri bul (Renkleri aynı, sayıları ardışık)
    COLORS.forEach(color => {
        let sameColor = hand.filter(t => t.color === color && !t.isJoker).sort((a, b) => a.number - b.number);
        // Aynı sayıdan birden fazla varsa teke indir (seri için)
        let uniqueInColor = [];
        sameColor.forEach(t => {
            if (uniqueInColor.length === 0 || t.number !== uniqueInColor[uniqueInColor.length - 1].number) {
                uniqueInColor.push(t);
            }
        });

        let temp = [];
        for (let i = 0; i < uniqueInColor.length; i++) {
            if (temp.length === 0 || uniqueInColor[i].number === temp[temp.length - 1].number + 1) {
                temp.push(uniqueInColor[i]);
            } else {
                if (temp.length >= 3) allPossible.push({ tiles: [...temp], sum: temp.reduce((s, t) => s + t.number, 0), type: 'series' });
                temp = [uniqueInColor[i]];
            }
        }
        if (temp.length >= 3) allPossible.push({ tiles: [...temp], sum: temp.reduce((s, t) => s + t.number, 0), type: 'series' });
    });

    // 2. Greedy (Açgözlü) seçim: En yüksek puanlı perleri seç (overlap/çakışma olmadan)
    allPossible.sort((a, b) => b.sum - a.sum);
    allPossible.forEach(set => {
        if (set.tiles.every(t => !usedIds.has(t.id))) {
            bestSets.push(set);
            set.tiles.forEach(t => usedIds.add(t.id));
        }
    });

    // 3. Istakaya Yerleştirme
    userRackSlots.fill(null);
    let currentIdx = 0;

    // Perleri koy
    bestSets.forEach(set => {
        set.tiles.forEach(t => { if (currentIdx < 40) userRackSlots[currentIdx++] = t; });
        currentIdx++;
    });

    // Kalanları "Potansiyel" yan yana gelecek şekilde diz
    let leftovers = hand.filter(t => !usedIds.has(t.id)).sort((a, b) => (COLORS.indexOf(a.color) - COLORS.indexOf(b.color)) || (a.number - b.number));

    if (leftovers.length > 0) {
        let tempGroup = [leftovers[0]];
        for (let i = 1; i < leftovers.length; i++) {
            let prev = leftovers[i - 1];
            let curr = leftovers[i];
            // Potansiyel Seri veya Potansiyel Grup (Kardeş taşlar)
            if ((curr.color === prev.color && curr.number === prev.number + 1) || (curr.number === prev.number)) {
                tempGroup.push(curr);
            } else {
                tempGroup.forEach(t => { if (currentIdx < 40) userRackSlots[currentIdx++] = t; });
                currentIdx++;
                tempGroup = [curr];
            }
        }
        tempGroup.forEach(t => { if (currentIdx < 40) userRackSlots[currentIdx++] = t; });
    }

    selectedTileIds.clear();
    renderUserRack();
}

// Akıllı Çift Dizme (Kayıtlı Yuvalara)
function autoSortPairs() {
    let hand = [...players.user.hand];
    let processedIds = new Set();
    userRackSlots.fill(null);
    let currentIdx = 0;

    // 1. Çiftleri Diz
    for (let i = 0; i < hand.length; i++) {
        if (processedIds.has(hand[i].id)) continue;
        let mIdx = hand.findIndex((t, idx) => idx > i && !processedIds.has(t.id) && t.number === hand[i].number && t.color === hand[i].color && !t.isJoker);
        if (mIdx !== -1) {
            userRackSlots[currentIdx++] = hand[i];
            userRackSlots[currentIdx++] = hand[mIdx];
            currentIdx++; // Çift sonrası boşluk
            processedIds.add(hand[i].id);
            processedIds.add(hand[mIdx].id);
        }
    }

    // 2. Kalanları Diz
    let others = hand.filter(t => !processedIds.has(t.id)).sort((a, b) => a.number - b.number || COLORS.indexOf(a.color) - COLORS.indexOf(b.color));
    others.forEach(t => { if (currentIdx < 40) userRackSlots[currentIdx++] = t; });

    selectedTileIds.clear();
    renderUserRack();
}

document.addEventListener('DOMContentLoaded', () => {
    initGame();

    const actions = document.querySelectorAll('.action-rect');
    // Index 0: SERİ, 1: ÇİFT, 2: SERİ AÇ, 3: ÇİFT AÇ, 4: İŞLE, 5: AT, 6: GERİ AL
    if (actions[0]) actions[0].onclick = autoSortSeries;
    if (actions[1]) actions[1].onclick = autoSortPairs;
    if (actions[2]) actions[2].onclick = handleOpenSeries;
    if (actions[3]) actions[3].onclick = handleOpenPairs;
    if (actions[4]) actions[4].onclick = handleProcess; // İŞLE butonu
    if (actions[5]) actions[5].onclick = userDiscard; // AT butonu

    // Discard Alanlarını Sürükle-Bırak VE Dokunmatik (Tıkla-At) için ayarla
    document.querySelectorAll('.discard-zone').forEach(zone => {
        // Dokunmatik/Tıklama Desteği (Mobile Friendly)
        zone.addEventListener('click', () => {
            if (turnOrder[currentTurnIndex] === 'user' && zone.id === 'discard-user') {
                if (selectedTileIds.size === 1) {
                    const tileId = [...selectedTileIds][0];
                    processUserDiscard(tileId);
                } else {
                    // Belki bir ipucu gösterilebilir: "Önce atacağınız taşı seçin"
                }
            }
        });

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const tileId = e.dataTransfer.getData('tileId');
            if (tileId && turnOrder[currentTurnIndex] === 'user') {
                processUserDiscard(tileId);
            }
        });
    });

    document.getElementById('deck-pile').addEventListener('click', () => {
        if (turnOrder[currentTurnIndex] === 'user' && deck.length > 0) {
            if (hasDrawn) {
                alert("Zaten bu turda taş çektiniz!");
                return;
            }
            const newTile = deck.pop();
            players.user.hand.push(newTile);

            // İlk boş yuvaya ekle
            let emptyIdx = userRackSlots.indexOf(null);
            if (emptyIdx !== -1) userRackSlots[emptyIdx] = newTile;

            hasDrawn = true;
            renderUserRack();
            updateDeckCount();

            // Deste bittiyse oyun sonu kontrolü
            if (deck.length === 0) {
                setTimeout(() => endGame('none'), 1500);
            }
        }
    });

    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
        restartBtn.onclick = () => location.reload();
    }

    // Üst Menü Butonları
    const newGameTop = document.getElementById('new-game-top');
    if (newGameTop) newGameTop.onclick = () => {
        if (confirm("Yeni oyun başlatmak istediğinize emin misiniz?")) location.reload();
    };

    const showYazBoz = document.getElementById('show-yazboz');
    if (showYazBoz) showYazBoz.onclick = () => {
        const modal = document.getElementById('scoreboard-modal');
        if (modal) modal.style.display = (modal.style.display === 'flex' ? 'none' : 'flex');
    };

    const openSettings = document.getElementById('open-settings');
    if (openSettings) openSettings.onclick = () => {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.style.display = 'flex';
    };

    const saveSettings = document.getElementById('save-settings');
    if (saveSettings) saveSettings.onclick = () => {
        // Ayarları kaydet
        gameConfig.names.user = document.getElementById('name-user').value;
        gameConfig.names.bot1 = document.getElementById('name-bot1').value;
        gameConfig.names.bot2 = document.getElementById('name-bot2').value;
        gameConfig.names.bot3 = document.getElementById('name-bot3').value;
        gameConfig.maxRounds = parseInt(document.getElementById('max-rounds').value);
        gameConfig.isMuted = document.getElementById('mute-sounds').checked;
        gameConfig.theme = document.getElementById('table-theme').value;

        applyTheme(gameConfig.theme);
        updatePlayerNamesUI();

        document.getElementById('settings-modal').style.display = 'none';
        alert("Ayarlar kaydedildi!");
    };
});

function updatePlayerNamesUI() {
    // User Name
    const uName = document.querySelector('.user-name');
    if (uName) uName.innerText = gameConfig.names.user;

    // Bot Names
    const b1Name = document.querySelector('#bot-1 .name-tag');
    if (b1Name) b1Name.innerText = gameConfig.names.bot1;

    const b2Name = document.querySelector('#bot-2 .name-tag');
    if (b2Name) b2Name.innerText = gameConfig.names.bot2;

    const b3Name = document.querySelector('#bot-3 .name-tag');
    if (b3Name) b3Name.innerText = gameConfig.names.bot3;
}

function applyTheme(theme) {
    const table = document.querySelector('.table');
    if (!table) return;

    if (theme === 'classic') table.style.background = '#164227';
    else if (theme === 'dark') table.style.background = '#0d0d0d';
    else if (theme === 'wood') table.style.background = 'linear-gradient(rgba(78, 52, 46, 0.9), rgba(78, 52, 46, 0.9)), url("https://www.transparenttextures.com/patterns/wood-pattern.png")';
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch(err => console.log('SW failed', err));
    });
}
