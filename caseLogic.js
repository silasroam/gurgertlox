/* ============================================
   Case Opening Logic - Integrated with casesData.js
   Uses the 12 generated cases with 16-22 items each
   ============================================ */

(function() {
    'use strict';

    console.log('caseLogic.js loaded');

    // Wait for casesData to be loaded
    function initCaseLogic() {
        console.log('initCaseLogic called');
        const CASES = window.CASES || [];
        console.log('CASES:', CASES.length, 'cases');
        if (!CASES.length) {
            console.error('CASES not loaded from casesData.js');
            return;
        }

        // Get case-detail screen elements
        const caseDetailScreen = document.querySelector('.screen[data-screen="case-detail"]');
        console.log('caseDetailScreen:', caseDetailScreen);
        
        const caseDetailBack = document.getElementById('caseDetailBack');
        const caseDetailClose = document.getElementById('caseDetailClose');
        const caseDetailTitle = document.getElementById('caseDetailTitle');
        const caseDetailVisual = document.getElementById('caseDetailVisual');
        const caseDetailOpenValue = document.getElementById('caseDetailOpenValue');
        const caseDetailOpenSub = document.getElementById('caseDetailOpenSub');
        const btnOpenMain = document.getElementById('btn-open-main');
        const caseDetailRouletteStrip = document.getElementById('caseDetailRouletteStrip');
        const caseDetailItems = document.getElementById('caseDetailItems');
        const caseDetailContentsCount = document.getElementById('caseDetailContentsCount');
        const screens = document.querySelectorAll('.screen');

        const SPIN_DURATION = 5500;
        const TOTAL_CARDS = 80;
        const targetIndex = 59;
        const CARD_W = 80;
        const CARD_GAP = 10;

        let currentCaseId = null;
        let currentCaseData = null;
        let currentRewards = [];
        let spinLock = false;

        // Convert case items to reward format for roulette
        function caseItemsToRewards(items) {
            return items.map(item => ({
                id: item.id,
                name: item.name,
                value: item.value,
                weight: item.weight,
                chance: item.drop_chance_percent,
                icon: getItemIcon(item),
                image: item.image
            }));
        }

        function getItemIcon(item) {
            if (item.type === 'jackpot') return '👑';
            if (item.type === 'stars') return '⭐';
            if (item.type === 'nft') return '🎨';
            return '🎁';
        }

        function itemHtml(reward, isHit = false) {
            const icon = reward.icon;
            const value = Math.round(reward.value);
            const cls = isHit ? 'r-hit' : '';
            return `<div class="roulette-item ${cls}">
                <span class="roulette-icon">${icon}</span>
                <span class="roulette-value">${value} ⭐</span>
            </div>`;
        }

        function buildStripHtml(rewards, winIndex = -1) {
            return rewards.map((r, idx) => itemHtml(r, idx === winIndex)).join('');
        }

        // Weighted random pick based on weights
        function pickReward(rewards) {
            const totalWeight = rewards.reduce((sum, r) => sum + r.weight, 0);
            let roll = Math.random() * totalWeight;
            for (const r of rewards) {
                roll -= r.weight;
                if (roll <= 0) return r;
            }
            return rewards[rewards.length - 1];
        }

        function showScreen(screenName) {
            screens.forEach((s) => {
                s.classList.toggle('hidden', s.dataset.screen !== screenName);
            });
        }

        function spinRoulette() {
            if (spinLock || !currentRewards.length) return;
            spinLock = true;
            btnOpenMain.disabled = true;

            const win = pickReward(currentRewards);

            // Generate strip with win at target position
            const strip = [];
            for (let i = 0; i < TOTAL_CARDS; i++) {
                const r = i === targetIndex ? win : currentRewards[Math.floor(Math.random() * currentRewards.length)];
                strip.push(r);
            }

            caseDetailRouletteStrip.innerHTML = buildStripHtml(strip, targetIndex);
            caseDetailRouletteStrip.style.transition = 'none';
            caseDetailRouletteStrip.style.transform = 'translateX(0)';

            const containerWidth = caseDetailRouletteStrip.parentElement.clientWidth;
            const targetOffset = targetIndex * (CARD_W + CARD_GAP) - containerWidth / 2 + CARD_W / 2;

            setTimeout(() => {
                caseDetailRouletteStrip.style.transition = `transform ${SPIN_DURATION}ms cubic-bezier(0.15, 0.9, 0.2, 1)`;
                caseDetailRouletteStrip.style.transform = `translateX(-${targetOffset}px)`;
            }, 50);

            setTimeout(() => {
                caseDetailRouletteStrip.style.transition = 'none';
                caseDetailRouletteStrip.style.transform = `translateX(-${targetOffset}px)`;

                const val = Math.round(win.value);
                const isBig = val >= 0.2 * currentCaseData.price;

                // Show win result
                const winResult = document.createElement('div');
                winResult.className = 'win-result' + (isBig ? ' big-win' : '');
                winResult.textContent = `${val} ⭐ ВЫИГРЫШ!`;
                caseDetailScreen.querySelector('.case-controls').appendChild(winResult);

                spinLock = false;
                btnOpenMain.disabled = false;
            }, SPIN_DURATION + 150);
        }

        function openCaseDetail(caseId) {
            console.log('openCaseDetail called with:', caseId);
            const caseData = CASES.find(c => c.id === caseId);
            if (!caseData) {
                console.error('Case not found:', caseId);
                return;
            }

            currentCaseId = caseId;
            currentCaseData = caseData;
            currentRewards = caseItemsToRewards(caseData.items);
            spinLock = false;
            btnOpenMain.disabled = false;

            // Remove any existing win result
            const existingWin = caseDetailScreen.querySelector('.win-result');
            if (existingWin) existingWin.remove();

            caseDetailTitle.textContent = caseData.name;
            caseDetailOpenValue.textContent = caseData.price;
            caseDetailOpenSub.textContent = `≈ ${(caseData.price / 160).toFixed(2)} TON`;
            
            // Build visual based on tier
            const tierVisual = buildTierVisual(caseData.tier);
            caseDetailVisual.innerHTML = tierVisual;

            // Items grid
            caseDetailContentsCount.textContent = caseData.items.length;
            caseDetailItems.innerHTML = caseData.items
                .sort((a, b) => b.weight - a.weight)
                .map(item => {
                    const icon = getItemIcon(item);
                    const value = Math.round(item.value);
                    return `
                        <div class="drop-card">
                            <div class="drop-icon">${icon}</div>
                            <div class="drop-name">${item.name}</div>
                            <div class="drop-value">${value} ⭐</div>
                            <div class="drop-chance">${item.drop_chance_percent.toFixed(2)}%</div>
                        </div>
                    `;
                })
                .join('');

            // Build idle roulette strip
            const idleItems = [];
            for (let i = 0; i < 80; i++) {
                idleItems.push(currentRewards[Math.floor(Math.random() * currentRewards.length)]);
            }
            caseDetailRouletteStrip.innerHTML = buildStripHtml(idleItems);
            caseDetailRouletteStrip.style.transition = 'none';
            caseDetailRouletteStrip.style.transform = 'translateX(0px)';

            showScreen('case-detail');
            console.log('Screen switched to case-detail');
        }

        function buildTierVisual(tier) {
            let html = '<div class="mv-glow"></div>';
            if (tier === 'basic') {
                html += '<div class="mv-coin">¢</div>';
            } else if (tier === 'medium') {
                html += '<div class="mv-ring"></div>';
                html += '<div class="mv-coin">₿</div>';
            } else {
                html += '<div class="mv-ring"></div>';
                html += '<div class="mv-ring mv-ring-2"></div>';
                html += '<div class="mv-diamond">◆</div>';
                html += '<div class="mv-coin">₿</div>';
            }
            return html;
        }

        function closeCaseDetail() {
            showScreen('home');
        }

        // Event listeners
        if (btnOpenMain) {
            btnOpenMain.addEventListener('click', () => {
                if (currentCaseData && !spinLock) {
                    spinRoulette();
                }
            });
        }

        if (caseDetailBack) {
            caseDetailBack.addEventListener('click', closeCaseDetail);
        }

        if (caseDetailClose) {
            caseDetailClose.addEventListener('click', closeCaseDetail);
        }

        // Attach click handlers to case cards
        document.addEventListener('click', (e) => {
            const caseCard = e.target.closest('.case-card[data-case]');
            if (caseCard) {
                const caseId = caseCard.dataset.case;
                console.log('Case card clicked:', caseId);
                openCaseDetail(caseId);
            }
        });

        console.log('Case logic initialized with', CASES.length, 'cases');
    }

    // Initialize when DOM is ready and CASES is available
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initCaseLogic, 100);
        });
    } else {
        setTimeout(initCaseLogic, 100);
    }

    // Also try on gifts-ready event
    window.addEventListener('gifts-ready', initCaseLogic);
})();
