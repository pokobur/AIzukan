// app.js - Main Application Logic

import { initDB, saveItem, getAllItems, deleteItem, clearDB, exportDB, importDB } from './storage.js';
import { appraiseImage } from './gemini.js';

// --- State ---
let currentView = 'home';
let cameraStream = null;
let currentImageBlob = null;
let currentImageBase64 = null;
let currentAppraisalResult = null;
let currentDetailId = null;

// --- Elements ---
const mainHeader = document.getElementById('main-header');
const headerTitle = document.getElementById('header-title');
const btnBack = document.getElementById('btn-back');
const toastEl = document.getElementById('toast');

// Views
const views = {
    home: document.getElementById('view-home'),
    settings: document.getElementById('view-settings'),
    camera: document.getElementById('view-camera'),
    appraisal: document.getElementById('view-appraisal'),
    result: document.getElementById('view-result'),
    encyclopedia: document.getElementById('view-encyclopedia'),
    detail: document.getElementById('view-detail') // Modal
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        setupEventListeners();
        loadSettings();
    } catch (e) {
        showToast("データベースの初期化に失敗しました。");
        console.error(e);
    }
});

// --- View Router ---
function navigateTo(viewId, title = "") {
    // Hide all normal views
    Object.keys(views).forEach(key => {
        if (key !== 'detail') {
            views[key].classList.remove('active');
            views[key].classList.add('hidden');
        }
    });

    currentView = viewId;
    views[viewId].classList.remove('hidden');
    // small timeout to allow display:block before adding opacity class
    setTimeout(() => views[viewId].classList.add('active'), 10);

    // Manage Header
    if (viewId === 'home' || viewId === 'appraisal' || viewId === 'camera') {
        mainHeader.classList.add('hidden');
    } else {
        mainHeader.classList.remove('hidden');
        headerTitle.textContent = title;
    }

    // Stop camera if not in camera view
    if (viewId !== 'camera') {
        stopCamera();
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    // Nav from Home
    document.getElementById('btn-start-camera').addEventListener('click', () => {
        if (!localStorage.getItem('gemini_api_key')) {
            showToast("⚠️設定からAPIキーを入力してね！");
            navigateTo('settings', '設定');
            return;
        }
        navigateTo('camera');
        startCamera();
    });
    
    document.getElementById('btn-open-encyclopedia').addEventListener('click', () => {
        navigateTo('encyclopedia', 'みんなの図鑑');
        loadEncyclopedia();
    });

    document.getElementById('btn-open-settings').addEventListener('click', () => {
        navigateTo('settings', '設定');
    });

    // Global Back Button
    btnBack.addEventListener('click', () => {
        if (currentView === 'result') {
            navigateTo('camera');
            startCamera();
        } else {
            navigateTo('home');
        }
    });

    // Settings
    document.getElementById('btn-save-key').addEventListener('click', () => {
        const key = document.getElementById('input-api-key').value.trim();
        if (key) {
            localStorage.setItem('gemini_api_key', key);
            showToast('APIキーを保存しました！');
        } else {
            localStorage.removeItem('gemini_api_key');
            showToast('APIキーを削除しました。');
        }
    });

    // Data Export/Import
    document.getElementById('btn-export').addEventListener('click', async () => {
        try {
            const data = await exportDB();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `aizukan_backup_${new Date().getTime()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast("バックアップを保存しました！");
        } catch (e) {
            showToast("書き出しエラー: " + e.message);
        }
    });

    document.getElementById('btn-import-trigger').addEventListener('click', () => {
        document.getElementById('input-import-file').click();
    });

    document.getElementById('input-import-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const count = await importDB(event.target.result);
                showToast(`${count}件のアイテムを読み込みました！`);
            } catch (err) {
                showToast(err.message);
            }
        };
        reader.readAsText(file);
    });

    document.getElementById('btn-clear-db').addEventListener('click', async () => {
        if (confirm("本当に図鑑のデータをすべて消去しますか？（元に戻せません）")) {
            await clearDB();
            showToast("図鑑をリセットしました。");
        }
    });

    // Camera View
    document.getElementById('btn-take-photo').addEventListener('click', takePhoto);
    document.getElementById('btn-switch-camera').addEventListener('click', switchCamera);
    document.getElementById('input-upload-image').addEventListener('change', handleImageUpload);
    document.getElementById('btn-camera-back').addEventListener('click', () => {
        navigateTo('home');
    });

    // Result View
    document.getElementById('btn-retry-camera').addEventListener('click', () => {
        navigateTo('camera');
        startCamera();
    });

    document.getElementById('btn-save-encyclopedia').addEventListener('click', async () => {
        if (!currentAppraisalResult || !currentImageBase64) return;
        
        try {
            await saveItem({
                name: currentAppraisalResult.name,
                rarity: currentAppraisalResult.rarity,
                description: currentAppraisalResult.description,
                imageBase64: currentImageBase64,
                date: Date.now()
            });
            showToast('図鑑に保存したよ！');
            navigateTo('encyclopedia', 'みんなの図鑑');
            loadEncyclopedia();
        } catch (e) {
            showToast('保存に失敗しました。');
            console.error(e);
        }
    });

    // Detail Modal
    document.getElementById('btn-close-detail').addEventListener('click', closeDetailModal);
    document.getElementById('btn-delete-item').addEventListener('click', async () => {
        if (confirm("このアイテムを消す？")) {
            await deleteItem(currentDetailId);
            closeDetailModal();
            loadEncyclopedia();
            showToast("アイテムを削除しました。");
        }
    });

    document.getElementById('btn-download-card').addEventListener('click', downloadCardImage);
}

function loadSettings() {
    const key = localStorage.getItem('gemini_api_key');
    if (key) {
        document.getElementById('input-api-key').value = key;
    }
}

// --- Camera Logic ---
let useFrontCamera = false;

async function startCamera() {
    const video = document.getElementById('camera-feed');
    const constraints = {
        video: {
            facingMode: useFrontCamera ? "user" : "environment",
            width: { ideal: 1080 },
            height: { ideal: 1080 }
        }
    };
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = cameraStream;
    } catch (err) {
        console.error("Camera access error:", err);
        showToast("カメラが見つからないか、許可されていません。");
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

function switchCamera() {
    useFrontCamera = !useFrontCamera;
    stopCamera();
    startCamera();
}

function takePhoto() {
    const video = document.getElementById('camera-feed');
    if (!video.videoWidth) return; // not ready

    // Calculate crop to center square
    const canvas = document.createElement('canvas');
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    
    canvas.toBlob((blob) => {
        processImageBlob(blob);
    }, 'image/jpeg', 0.8);
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        processImageBlob(file);
    }
}

// --- Image Processing & API Call ---
async function processImageBlob(blob) {
    currentImageBlob = blob;
    
    // Stop camera
    stopCamera();
    
    // Read blob to base64
    const reader = new FileReader();
    reader.onload = async () => {
        const base64Url = reader.result;
        currentImageBase64 = base64Url;
        
        // Show Appraisal screen
        document.getElementById('preview-image').src = base64Url;
        navigateTo('appraisal');
        
        // Prepare Base64 payload (strip prefix)
        const mimeType = blob.type || "image/jpeg";
        const base64Data = base64Url.split(',')[1];
        const apiKey = localStorage.getItem('gemini_api_key');
        
        try {
            // Fake animation delay (min 2 seconds) for UX
            const [result] = await Promise.all([
                appraiseImage(base64Data, mimeType, apiKey),
                new Promise(resolve => setTimeout(resolve, 3000))
            ]);
            
            showResult(result, base64Url);
        } catch (error) {
            console.error("Appraisal Failed:", error);
            
            // Wait a tiny bit so the UI isn't locked, then show the message
            setTimeout(() => {
                alert("APIエラー詳細:\n\n" + error.message);
                
                // Allow user to manually retry after reading
                document.getElementById('view-appraisal').classList.add('hidden');
                document.getElementById('view-result').classList.remove('hidden');
                
                // Set the result screen to show the error state
                document.getElementById('result-name').textContent = "エラー！";
                document.getElementById('result-desc').textContent = "鑑定に失敗しました。";
                document.getElementById('result-image').src = base64Url;
            }, 100);
        }
    };
    reader.readAsDataURL(blob);
}

function showResult(result, imageUrl) {
    currentAppraisalResult = result;
    
    const nameEl = document.getElementById('result-name');
    const rarityEl = document.getElementById('result-rarity');
    const descEl = document.getElementById('result-desc');
    const imgEl = document.getElementById('result-image');
    
    nameEl.textContent = result.name;
    descEl.textContent = result.description;
    imgEl.src = imageUrl;
    
    // Generate Stars
    const stars = parseInt(result.rarity) || 1;
    let starStr = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    rarityEl.textContent = starStr;
    
    // Apply special styling for high rarity
    const card = document.getElementById('card-container');
    card.style.borderColor = stars >= 4 ? '#FFD700' : '#4ECDC4';
    card.style.boxShadow = stars >= 4 ? '0 0 30px rgba(255,215,0,0.6)' : 'var(--shadow-lg)';
    rarityEl.style.color = stars >= 4 ? '#FF8C00' : 'var(--accent-dark)';
    
    navigateTo('result', 'かんてい結果！');
}

// --- Encyclopedia View ---
async function loadEncyclopedia() {
    const grid = document.getElementById('encyclopedia-grid');
    const emptyState = document.getElementById('empty-state');
    const totalEl = document.getElementById('stat-total-items');
    
    grid.innerHTML = '';
    
    try {
        const items = await getAllItems();
        totalEl.textContent = items.length;
        
        if (items.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
            
            items.forEach(item => {
                const el = document.createElement('div');
                el.className = 'grid-item';
                
                const stars = parseInt(item.rarity) || 1;
                const starStr = '★'.repeat(stars) + '☆'.repeat(5 - stars);
                const color = stars >= 4 ? 'color: #FF8C00;' : '';
                const borderColor = stars >= 4 ? 'border-color: #FFD700;' : '';
                
                el.innerHTML = `
                    <img src="${item.imageBase64}" class="grid-img" style="${borderColor}" alt="${item.name}">
                    <div class="grid-info">
                        <div class="grid-rarity" style="${color}">${starStr}</div>
                        <div class="grid-name">${item.name}</div>
                    </div>
                `;
                
                el.addEventListener('click', () => openDetailModal(item));
                grid.appendChild(el);
            });
        }
    } catch (e) {
        console.error(e);
        showToast("図鑑の読み込みに失敗しました。");
    }
}

function openDetailModal(item) {
    currentDetailId = item.id;
    
    document.getElementById('detail-name').textContent = item.name;
    document.getElementById('detail-image').src = item.imageBase64;
    document.getElementById('detail-desc').textContent = item.description;
    
    const d = new Date(item.date);
    document.getElementById('detail-date').textContent = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} 発見`;
    
    const stars = parseInt(item.rarity) || 1;
    let starStr = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    document.getElementById('detail-rarity').textContent = starStr;
    
    const card = document.getElementById('detail-card-container');
    card.style.borderColor = stars >= 4 ? '#FFD700' : '#4ECDC4';
    
    views.detail.classList.remove('hidden');
    setTimeout(() => views.detail.classList.add('active'), 10);
}

function closeDetailModal() {
    views.detail.classList.remove('active');
    setTimeout(() => views.detail.classList.add('hidden'), 300);
}

// --- Trading Card Download ---
async function downloadCardImage() {
    const cardNode = document.getElementById('detail-card-container');
    const originalBorder = cardNode.style.borderRadius;
    cardNode.style.borderRadius = "0"; // remove radius for clean screenshot
    
    showToast("カードを作っています...");
    
    try {
        const canvas = await html2canvas(cardNode, {
            scale: 2,
            useCORS: true,
            backgroundColor: "#FFFFFF",
            logging: false
        });
        
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `card_${currentDetailId}.jpg`;
        a.click();
        
        showToast("アルバムに保存しました！");
    } catch (e) {
        console.error("html2canvas error", e);
        showToast("カードの作成に失敗しました。");
    } finally {
        cardNode.style.borderRadius = originalBorder;
    }
}

// --- Utilities ---
function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3000);
}
