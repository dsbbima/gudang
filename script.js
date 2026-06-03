/**
 * script.js - Inventory Controller Expert (Barcode Scanner Edition)
 * Versi: 5.7 - Advanced UX & Scrollable History
 */

const APP_VERSION = new Date().getTime(); 

if (typeof SCRIPT_URL === 'undefined') { 
    var SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwJ_uCzzwazBE5PGOrXPy4HddMvjxPNELVBkvLa-5366da9q8Jhlgz19tUQtBYh68-C/exec"; 
}
if (typeof dbInventory === 'undefined') { 
    var dbInventory = []; 
}

// Global variable untuk scanner
let html5QrCode = null;

// --- 1. INISIALISASI (Fast & Non-Blocking) ---
async function initApp() {
    generateFields(1); 
    
    const today = new Date().toDateString();
    const lastSavedDate = localStorage.getItem('history_date_stamp');
    if (lastSavedDate !== today) {
        localStorage.removeItem('history_data');
        localStorage.setItem('history_date_stamp', today);
    }
    
    const cache = localStorage.getItem('cached_db');
    if (cache) dbInventory = JSON.parse(cache);
    
    checkUserPermissions();
    renderHistory();
    setupGlobalShortcuts();
    setupOutsideClickHandlers();
    loadScannerScript(); 

    syncDatabase();
}

function loadScannerScript() {
    const script = document.createElement('script');
    script.src = "https://unpkg.com/html5-qrcode";
    script.onload = () => console.log("Scanner Library Loaded");
    document.head.appendChild(script);
}

async function syncDatabase() {
    try {
        const response = await fetch(`${SCRIPT_URL}?action=getDb&cb=${new Date().getTime()}`);
        const data = await response.json();
        if (Array.isArray(data)) {
            dbInventory = data;
            localStorage.setItem('cached_db', JSON.stringify(data));
        }
    } catch (e) { console.error("Sync Failed", e); }
}

window.manualRefresh = function() {
    window.showToast("🔄 MENGAMBIL DATA TERBARU...");
    syncDatabase().then(() => {
        window.showToast("✅ DATA BERHASIL DIPERBARUI");
    }).catch(() => {
        window.showToast("❌ GAGAL MENGAMBIL DATA");
    });
};

function checkUserPermissions() {
    const savedUser = (localStorage.getItem('activeUser') || "").toUpperCase();
    const adminUsers = ["ARIF", "IRA", "IWAN"];
    const dashboardMenu = document.getElementById('menuDashboard');
    if (dashboardMenu) {
        dashboardMenu.style.display = adminUsers.includes(savedUser) ? "block" : "none";
    }
    const display = document.getElementById('displayUser');
    if (display) display.textContent = savedUser || "GUEST";
}

// --- 2. BARCODE SCANNER LOGIC ---
window.startScan = function(btn) {
    const row = btn.closest('.item-row');
    const readerDiv = row.querySelector('.reader-container');
    const inputNama = row.querySelector('.input-nama');
    
    if (readerDiv.style.display === 'block') {
        stopScan();
        readerDiv.style.display = 'none';
        return;
    }

    readerDiv.style.display = 'block';
    const scannerId = `reader-${Date.now()}`;
    readerDiv.id = scannerId;

    html5QrCode = new Html5Qrcode(scannerId);
    const config = { fps: 20, qrbox: { width: 250, height: 150 }, aspectRatio: 1.0 };

    html5QrCode.start(
        { facingMode: "environment" }, 
        config,
        (decodedText) => {
            const found = dbInventory.find(i => i.barcode == decodedText);
            if (found) {
                selectItemByData(row, found);
                window.showToast("⚡ BARCODE DIKENALI");
            } else {
                inputNama.value = decodedText;
                window.showToast("🔍 BARCODE TIDAK ADA DI DB");
            }
            stopScan();
            readerDiv.style.display = 'none';
        },
        (errorMessage) => { }
    ).catch(err => window.showToast("❌ KAMERA ERROR"));
};

function stopScan() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => html5QrCode.clear()).catch(e => console.log(e));
    }
}

// --- 3. MENU & INTERACTIVE (CLOSE ON SCROLL/CLICK) ---
function setupOutsideClickHandlers() {
    const closeMenu = () => {
        const menu = document.getElementById('dropdownMenu');
        if (menu && menu.classList.contains('show')) {
            menu.classList.remove('show');
        }
    };

    // Tutup jika klik di mana saja
    document.addEventListener('mousedown', (e) => {
        const menu = document.getElementById('dropdownMenu');
        const burger = document.querySelector('.burger-menu');
        if (menu && !menu.contains(e.target) && e.target !== burger) {
            closeMenu();
        }
    });

    // Tutup jika scroll halaman
    window.addEventListener('scroll', closeMenu, { passive: true });
    
    // Tutup jika scroll di dalam area lain
    document.addEventListener('touchmove', (e) => {
        const menu = document.getElementById('dropdownMenu');
        // Hanya tutup jika scroll terjadi di luar area menu itu sendiri
        if (menu && !menu.contains(e.target)) {
            closeMenu();
        }
    }, { passive: true });
}

window.toggleMenu = function() {
    const menu = document.getElementById('dropdownMenu');
    if (menu) {
        menu.classList.toggle('show');
    }
};

window.handleSearch = function(input) {
    const row = input.closest('.item-row');
    const box = row.querySelector('.suggestions-box');
    const query = input.value.toUpperCase().trim();
    if (query.length < 1) { box.style.display = 'none'; return; }
    
    const queryParts = query.split(/\s+/);
    const activeCatBtn = row.querySelector('.cat-btn.active');
    const selectedCat = activeCatBtn ? activeCatBtn.textContent.trim() : null;

    const res = dbInventory.filter(item => {
        const targetString = (item.nama + " " + (item.barcode || "")).toUpperCase();
        const matchesQuery = queryParts.every(part => targetString.includes(part));
        
        if (selectedCat) {
            const itemCat = item.kategori === "LT 2" ? "LT2" : item.kategori;
            return matchesQuery && itemCat === selectedCat;
        }
        return matchesQuery;
    }).slice(0, 15);

    if (res.length > 0) {
        box.innerHTML = res.map(i => `
            <div class="suggestion-item" 
                 onmousedown="selectItemByData(this.closest('.item-row'), ${JSON.stringify(i).replace(/"/g, '&quot;')})" 
                 style="padding:12px; border-bottom:1px solid #eee; cursor:pointer; font-size:12px;">
                <strong>${i.nama}</strong><br>
                <small>${i.barcode} | <span style="color:#00897b">${i.kategori}</span></small>
            </div>`).join('');
        box.style.display = 'block';
        setupKeyboardNav(input, box);
    } else box.style.display = 'none';
};

window.selectItemByData = function(row, item) {
    row.querySelector('.input-nama').value = item.nama;
    row.querySelector('.h-barcode').value = item.barcode || "-";
    row.querySelector('.h-divisi').value = item.divisi || "-";
    row.querySelector('.h-jenis').value = item.jenis || "-";
    row.querySelector('.suggestions-box').style.display = 'none';

    const targetCat = item.kategori === "LT 2" ? "LT2" : item.kategori;
    const catButtons = row.querySelectorAll('.cat-btn');
    catButtons.forEach(btn => {
        if (btn.textContent.trim() === targetCat) {
            applyCategoryStyle(btn, true);
        }
    });
};

function applyCategoryStyle(btn, forceSelect = false) {
    const parent = btn.parentElement;
    const isAlreadyActive = btn.classList.contains('active');

    parent.querySelectorAll('.cat-btn').forEach(b => { 
        b.classList.remove('active'); 
        b.style.background = "#f5f5f5"; 
        b.style.color = "#333"; 
    });

    if (forceSelect || !isAlreadyActive) {
        btn.classList.add('active'); 
        btn.style.background = "#00897b"; 
        btn.style.color = "#fff";
    }
}

function setupKeyboardNav(input, box) {
    input.onkeydown = (e) => {
        const items = box.querySelectorAll('.suggestion-item');
        let current = box.querySelector('.suggestion-item.active_nav');
        let index = Array.from(items).indexOf(current);
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (index < items.length - 1) {
                if (current) { current.classList.remove('active_nav'); current.style.backgroundColor = "white"; }
                items[index + 1].classList.add('active_nav');
                items[index + 1].style.backgroundColor = "#e0f2f1";
                items[index + 1].scrollIntoView({ block: "nearest" });
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (index > 0) {
                items[index].classList.remove('active_nav');
                items[index].style.backgroundColor = "white";
                items[index - 1].classList.add('active_nav');
                items[index - 1].style.backgroundColor = "#e0f2f1";
                items[index - 1].scrollIntoView({ block: "nearest" });
            }
        } else if (e.key === "Enter" && current) { 
            e.preventDefault(); 
            current.onmousedown(); 
        }
    };
}

function setupGlobalShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.key === "Enter" && e.target.id === "itemCount") { e.preventDefault(); generateFields(); return; }
        if (e.key === "Enter" && e.target.classList.contains('cat-btn')) { e.preventDefault(); e.target.click(); return; }
        if (e.key === "Enter" && !e.target.classList.contains('input-nama')) {
            const btn = document.querySelector('button[type="submit"]');
            if (btn && !btn.disabled && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "BUTTON") btn.click();
        }
    });
}

// --- 4. FORM BUILDER ---
window.generateFields = function(countVal) {
    const inputCount = document.getElementById('itemCount');
    const count = countVal || parseInt(inputCount.value) || 1;
    const container = document.getElementById('multiItemContainer');
    if (!container) return;
    const isPindah = document.body.classList.contains('mode-pindah');
    
    container.innerHTML = ''; 
    inputCount.value = count;
    
    for (let i = 1; i <= count; i++) {
        const row = document.createElement('div');
        row.className = 'item-row';
        row.style.cssText = "position: relative; border: 1px solid #eee; padding: 10px; border-radius: 8px; margin-bottom: 12px; background: #fff; z-index: 1;";
        row.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="font-weight: 800; color: #00897b; font-size: 12px;">ITEM KE - <span class="item-index">${i}</span></div>
                <button type="button" onclick="removeFormItem(this)" style="background: #ff5252; color: white; border: none; border-radius: 4px; padding: 4px 10px; font-size: 10px; cursor: pointer; font-weight: bold;">HAPUS</button>
            </div>
            <div class="category-buttons" style="display: flex; gap: 4px; margin-bottom: 10px;">
                ${['BESI', 'GM', 'KERAMIK', 'LT2'].map(cat => `<button type="button" class="cat-btn" tabindex="0" onclick="toggleCategory(this, '${cat}')" style="flex: 1; padding: 6px; font-size: 10px; font-weight: bold; border: 1px solid #ddd; border-radius: 4px;">${cat}</button>`).join('')}
            </div>
            <div class="input-group" style="display: flex; gap: 5px;">
                <div style="flex: 1; position: relative;">
                    <input type="text" class="input-nama" placeholder="INPUT Nama barang / SCAN Barcode" oninput="handleSearch(this)" autocomplete="off" required style="width: 100%;">
                    <div class="suggestions-box suggestions" style="display:none; position:absolute; width:100%; background:white; z-index:9999; border:1px solid #ccc; max-height:250px; overflow-y:auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"></div>
                </div>
                <button type="button" onclick="startScan(this)" style="background: #00897b; color: white; border: none; border-radius: 4px; padding: 0 10px; font-size: 18px; cursor: pointer;">📷</button>
            </div>
            <div class="reader-container" style="display: none; width: 100%; margin-top: 5px; border-radius: 8px; overflow: hidden; background: #000;"></div>
            <div style="display: grid; grid-template-columns: ${isPindah ? '1fr 1fr 1fr' : '1fr 1fr'}; gap: 8px; margin-top: 10px;">
                <div class="input-group"><label style="font-size: 10px; font-weight: bold;">QTY</label><input type="number" class="input-qty" step="any" required></div>
                <div class="input-group"><label style="font-size: 10px; font-weight: bold;">${isPindah ? 'DARI' : 'LOKASI'}</label><input type="text" class="input-lokasi" placeholder="0"></div>
                ${isPindah ? `<div class="input-group"><label style="font-size: 10px; font-weight: bold;">KE</label><input type="text" class="input-tujuan" placeholder="0"></div>` : ''}
            </div>
            <div class="input-group" style="margin-top: 10px;"><label style="font-size: 10px; font-weight: bold;">KETERANGAN</label><input type="text" class="input-ket" placeholder="..."></div>
            <input type="hidden" class="h-barcode"><input type="hidden" class="h-divisi"><input type="hidden" class="h-jenis">
        `;
        container.appendChild(row);
    }
};

window.toggleCategory = function(btn, val) {
    applyCategoryStyle(btn);
    const row = btn.closest('.item-row');
    const inputNama = row.querySelector('.input-nama');
    inputNama.value = "";
    row.querySelector('.suggestions-box').style.display = "none";
    inputNama.focus(); 
};

// --- 5. SUBMIT & RENDER (HISTORY SCROLL OPTIMIZED) ---
async function handleInventorySubmit(e) {
    e.preventDefault();
    const user = localStorage.getItem('activeUser') || 'GUEST';
    const payload = { items: [] };
    const mode = document.body.className;

    document.querySelectorAll('.item-row').forEach(row => {
        const qty = Math.abs(parseFloat(row.querySelector('.input-qty').value));
        const lokRaw = row.querySelector('.input-lokasi').value.trim();
        const lokasi = lokRaw === "" ? "0" : lokRaw.toUpperCase();
        
        const base = {
            namaBarang: row.querySelector('.input-nama').value.toUpperCase(),
            user: user,
            category: row.querySelector('.cat-btn.active')?.textContent || "BESI",
            keterangan: row.querySelector('.input-ket').value.toUpperCase() || "-",
            jenis: row.querySelector('.h-jenis').value || "-"
        };
        
        if (mode.includes('pindah')) {
            const tujRaw = row.querySelector('.input-tujuan').value.trim();
            const tujuan = tujRaw === "" ? "0" : tujRaw.toUpperCase();
            payload.items.push({ ...base, qty: -qty, lokasi: lokasi }, { ...base, qty: qty, lokasi: tujuan });
        } else {
            payload.items.push({ ...base, qty: mode.includes('keluar') ? -qty : qty, lokasi: lokasi });
        }
    });

    saveToLocalHistory(payload.items);
    window.showToast("📤 MENYIMPAN...");
    e.target.reset(); generateFields(1);
    fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) })
    .then(() => window.showToast("✅ TERSIMPAN")).catch(() => window.showToast("❌ GAGAL"));
}

window.renderHistory = function() {
    const historyBox = document.getElementById('historyList');
    if (!historyBox) return;

    historyBox.style.maxHeight = "350px"; 
    historyBox.style.overflowY = "auto";
    historyBox.style.webkitOverflowScrolling = "touch"; 
    historyBox.style.paddingRight = "5px";

    const data = JSON.parse(localStorage.getItem('history_data') || '[]');
    if (data.length === 0) { 
        historyBox.innerHTML = '<div style="text-align:center; padding:20px; color:#999; font-size:12px;">BELUM ADA DATA</div>'; 
        return; 
    }
    
    historyBox.innerHTML = data.map(item => `
        <div class="history-item ${item.qty < 0 ? 'status-keluar' : 'status-masuk'}" style="margin-bottom:8px; background:#fff; padding:10px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; border:1px solid #eee;">
            <div style="flex:1; overflow:hidden;">
                <div style="font-weight:bold; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.nama}</div>
                <div style="font-size:10px; color:#666;">${item.lokasi} | ${item.jam}</div>
            </div>
            <div style="font-weight:bold; font-size:12px; margin-left:10px;">${item.qty > 0 ? '+' : ''}${item.qty}</div>
        </div>`).join('');
};

function saveToLocalHistory(newItems) {
    const existing = JSON.parse(localStorage.getItem('history_data') || '[]');
    const jam = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    newItems.forEach(it => existing.unshift({ nama: it.namaBarang, qty: it.qty, lokasi: it.lokasi, jam: jam }));
    
    localStorage.setItem('history_data', JSON.stringify(existing.slice(0, 15)));
    renderHistory();
}

window.removeFormItem = function(btn) { 
    btn.closest('.item-row').remove();
    document.querySelectorAll('.item-row').forEach((row, idx) => { row.querySelector('.item-index').textContent = idx + 1; });
};

window.showToast = function(m) { const t = document.getElementById('toast'); if(t){ t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); } };
window.logout = function() { localStorage.removeItem('activeUser'); window.location.href = 'index.html'; };

document.addEventListener('DOMContentLoaded', initApp);
const form = document.getElementById('inventoryForm');
if (form) form.addEventListener('submit', handleInventorySubmit);