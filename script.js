// =================================================================
// Kode JS (FRONTEND) - File: script.js (FINAL DENGAN CACHING INSTAN & FOKUS)
// =================================================================

// SCRIPT_URL HARUS mengarah ke URL deployment Google Apps Script (doPost) Anda.
// Kategori tujuan akan dikirim sebagai bagian dari data POST.
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxw62_gcJRYru1WLasGuePWc4W2qIcgU8krRMUjw9IUVioKGibQIrdi174jiw7JfU2Z/exec';

const categoryButtons = document.querySelectorAll('.category-btn');
const jenisProdukSelect = document.getElementById('jenisProduk');
const namaBarangInput = document.getElementById('namaBarang');
const autocompleteList = document.getElementById('autocomplete-list');
const messageArea = document.getElementById('message');
const kategoriInput = document.getElementById('kategori');
const lokasiInputGroup = document.getElementById('lokasiInputGroup');
const lokasiInput = document.getElementById('lokasi');
const formatSimpanInput = document.getElementById('formatSimpan');
const textInputs = document.querySelectorAll('input[type="text"]');
const masukButton = document.getElementById('masukButton');
const keluarButton = document.getElementById('keluarButton');
const fabToggle = document.getElementById('fabToggle');
const appBody = document.body;
const modeStatusDiv = document.getElementById('modeStatus');
const jumlahInput = document.getElementById('jumlah');
const checkerInput = document.getElementById('checker');
const userLabel = document.getElementById('userLabel');
const logoutButton = document.getElementById('logoutButton');
const activeUserDisplay = document.getElementById('activeUserDisplay');
const inventoryForm = document.getElementById('inventoryForm');

// QR SCANNER ELEMENTS
const qrScannerToggle = document.getElementById('qrScannerToggle');
const qrScannerContainer = document.getElementById('qrScannerContainer');
const qrVideo = document.getElementById('qrVideo');

// 🔥 VARIABEL CACHING LOCAL STORAGE
const INVENTORY_CACHE_KEY = 'inventoryDataCache';
const CACHE_TIMESTAMP_KEY = 'inventoryCacheTimestamp';
const CACHE_DURATION_MS = 86400000; // 24 jam (dalam milidetik)

let activeUser = '';
let inventoryDataCache = {};
let currentCategory = '';
let currentCategoryData = {};
let productNamesCache = []; // { name: 'NAMA PRODUK', type: 'JENIS PRODUK', category: 'KATEGORI' }
let currentFocus = -1;
let currentMode = 'Masuk';

// 🔥 VARIABEL BARU UNTUK ANTRIAN SUBMISI
let submissionQueue = [];
let isProcessingQueue = false;
// 🔥 VARIABEL BARU UNTUK MENCEGAH DOUBLE SUBMISSION PADA SAAT KLIK
let isSubmitting = false; 

document.addEventListener('DOMContentLoaded', () => {
    displayMessage('⏳ Memuat konfigurasi aplikasi...', 'loading');
    
    // 🔥 Panggil fungsi pemuatan data dari GAS
    loadInventoryDataFromGAS();

    setupEventListeners();
    setupUppercaseListeners();
    setupQRScanner();

    document.getElementById('app-footer-copyright').textContent = `© ${new Date().getFullYear()} Depo Sumber Bangunan`;

    const urlParams = new URLSearchParams(window.location.search);
    const urlMode = urlParams.get('mode');
    const storedMode = localStorage.getItem('transactionMode');

    // 1. Prioritas Mode: URL > Local Storage > Default 'Masuk'
    if (urlMode && (urlMode.toUpperCase() === 'MASUK' || urlMode.toUpperCase() === 'KELUAR')) {
        currentMode = urlMode.charAt(0).toUpperCase() + urlMode.slice(1).toLowerCase();
        localStorage.setItem('transactionMode', currentMode);
    } else if (storedMode) {
        currentMode = storedMode;
    } else {
        currentMode = 'Masuk'; // Default
        localStorage.setItem('transactionMode', currentMode);
    }
    
    updateUIMode(currentMode);

    // 🔥 PERUBAHAN: Lokasi selalu terlihat dan wajib
    lokasiInputGroup.classList.remove('hidden'); // Pastikan Lokasi terlihat
    lokasiInput.required = true; // Pastikan Lokasi wajib

    // === KODE UNTUK MENGAMBIL USER AKTIF (TIDAK BERUBAH) ===
    const storedUser = localStorage.getItem('activeUser');
    if (storedUser) {
        activeUser = storedUser;
        activeUserDisplay.innerHTML = `User Aktif: <strong>${activeUser}</strong>`;
        checkerInput.value = '';
    } else {
        alert('Anda belum login. Silakan masukkan Nama User.');
        window.location.href = 'index.html';
    }
});

// =================================================================
// 🔥 FUNGSI BARU: Mengganti loadInventoryDataFromJSON
// Mengambil data dari Google Apps Script (GAS) dengan mekanisme Instant Refresh
// =================================================================

async function loadInventoryDataFromGAS() {
    const cachedData = localStorage.getItem(INVENTORY_CACHE_KEY);
    const cachedTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    const now = new Date().getTime();
    
    let shouldFetchFullData = true;
    let cachedIsFresh = false;

    // 1. Cek Cache Lokal & Timestamp
    if (cachedData && cachedTimestamp) {
        // Data cache ada. Sekarang cek kesegaran.
        const cacheAge = now - parseInt(cachedTimestamp);
        if (cacheAge < CACHE_DURATION_MS) {
            // Cache belum kedaluwarsa berdasarkan usia lokal (contoh 24 jam)
            cachedIsFresh = true;
            shouldFetchFullData = false;
        }
        
        // Coba muat data cache instan (walaupun sudah kedaluwarsa secara usia, kita tetap membandingkan dengan server)
        try {
            inventoryDataCache = transformDataToUppercase(JSON.parse(cachedData));
            initializeInventoryState(true); 
            displayMessage(`✅ Data produk dari **Local Storage** berhasil dimuat. ${cachedIsFresh ? '(Cache Lokal Segar)' : '(Akan cek ke Server...)'}`, 'loading');
        } catch (e) {
            console.error("Gagal memproses data dari Local Storage:", e);
            shouldFetchFullData = true; // Jika gagal parsing, fetch baru
        }
    }

    // 2. Tentukan URL Fetch (Cek Timestamp atau Ambil Data Penuh)
    let fetchUrl;
    
    // Jika cache dianggap masih "segar" berdasarkan usia lokal, atau jika kita hanya butuh validasi timestamp
    if (cachedTimestamp && cachedIsFresh) {
        // Kirim timestamp lokal ke server untuk divalidasi
        fetchUrl = `${SCRIPT_URL}?timestamp=${cachedTimestamp}&action=check`;
        displayMessage('⏳ Membandingkan timestamp data lokal dengan server...', 'loading');
        shouldFetchFullData = false; // Asumsikan data lokal masih valid sampai server membuktikan sebaliknya
    } else {
        // Cache tidak ada atau sudah sangat kadaluwarsa. Ambil data penuh.
        fetchUrl = SCRIPT_URL;
        displayMessage('⏳ Mengambil data produk terbaru dari server Google Sheet...', 'loading');
        shouldFetchFullData = true;
    }
    
    // 3. Lakukan Fetch ke GAS
    try {
        const response = await fetch(fetchUrl);
        const gasResult = await response.json();

        if (gasResult.status !== 'ok') {
            throw new Error(gasResult.error || 'Respons server tidak valid.');
        }

        const serverLatestTimestamp = gasResult.latestTimestamp;
        
        // === LOGIKA INSTANT REFRESH UTAMA ===

        // Bandingkan timestamp: Jika timestamp server > timestamp cache lokal, data baru HARUS diambil
        const cacheIsStale = parseInt(cachedTimestamp) < serverLatestTimestamp;
        
        if (cacheIsStale || shouldFetchFullData || !cachedData) {
            // Data BARU atau Belum ada cache: Ambil data penuh
            if (!shouldFetchFullData) {
                // Fetch penuh jika baru sadar setelah check timestamp bahwa data basi
                displayMessage('⚠️ Data cache basi. Mengambil data produk BARU dari server...', 'loading');
                const fullDataResponse = await fetch(SCRIPT_URL);
                const fullGasResult = await fullDataResponse.json();
                
                if (fullGasResult.status !== 'ok') {
                     throw new Error(fullGasResult.error || 'Respons server data penuh tidak valid.');
                }
                
                // Simpan & Proses data baru
                const newData = fullGasResult.data;
                localStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(newData));
                localStorage.setItem(CACHE_TIMESTAMP_KEY, serverLatestTimestamp.toString());
                
                inventoryDataCache = transformDataToUppercase(newData);
                initializeInventoryState(false); 
                
                displayMessage(`✅ Data produk baru berhasil dimuat dari server (${new Date(serverLatestTimestamp).toLocaleTimeString()}). Halo, **${activeUser}**!`, 'success');

            } else {
                // Kasus Fetch Penuh (sudah dilakukan di awal)
                const newData = gasResult.data;
                localStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(newData));
                localStorage.setItem(CACHE_TIMESTAMP_KEY, serverLatestTimestamp.toString());
                
                inventoryDataCache = transformDataToUppercase(newData);
                initializeInventoryState(false); 

                displayMessage(`✅ Data produk berhasil dimuat dari server (**Fetch Penuh**). Halo, **${activeUser}**!`, 'success');
            }
            
        } else {
            // Kasus Cache Lokal Masih VALID/Segar (baik karena server bilang timestamp sama atau usia lokal masih segar)
            if (shouldFetchFullData) {
                 // Ini terjadi jika shouldFetchFullData=true tapi timestampnya sama. Gunakan data yang sudah diambil.
                 inventoryDataCache = transformDataToUppercase(gasResult.data);
                 initializeInventoryState(false); 
                 displayMessage(`✅ Data produk dimuat (Validasi server OK). Halo, **${activeUser}**!`, 'success');
            } else {
                // Data sudah dimuat dari cache lokal di awal (langsung skip fetching)
                displayMessage(`✅ Data produk dari **Local Storage** berhasil dimuat (**Cache Valid**). Halo, **${activeUser}**!`, 'success');
            }
        }

    } catch (error) {
        console.error('Error memuat data inventory dari GAS:', error);
        // Jika gagal, pastikan data cache lama (jika ada) tetap digunakan untuk menghindari downtime
        if (Object.keys(inventoryDataCache).length === 0) {
            displayMessage(`❌ Gagal memuat data produk dari server: ${error.message}. Aplikasi mungkin berjalan dengan data kosong.`, 'error');
            categoryButtons.forEach(btn => btn.disabled = true);
        } else {
             displayMessage(`⚠️ Gagal memuat data terbaru: ${error.message}. Menggunakan data cache lama.`, 'error');
        }
    }
}


// 🔥 FUNGSI BARU: Memindahkan logika inisialisasi umum
function initializeInventoryState(fromCache) {
    // Reset state kategori ke kondisi awal (tidak aktif)
    currentCategory = '';
    kategoriInput.value = '';
    currentCategoryData = {};
    
    // Inisialisasi productNamesCache DENGAN SEMUA DATA UNTUK PENCARIAN LINTAS KATEGORI
    updateJenisProdukAndProductCache(inventoryDataCache, true); 
    
    jenisProdukSelect.disabled = true; 
    namaBarangInput.disabled = false;
    categoryButtons.forEach(btn => btn.classList.remove('active'));
    categoryButtons.forEach(btn => btn.disabled = false);

    // Jika dimuat dari cache, hilangkan pesan loading dan tampilkan pesan success
    if (fromCache) {
        // Pesan sudah diatur di loadInventoryDataFromGAS()
    }
}


// =================================================================
// FUNGSI UTILITY
// =================================================================

function transformDataToUppercase(data) {
    const transformed = {};
    for (const catKey in data) {
        transformed[catKey.toUpperCase()] = {};
        for (const typeKey in data[catKey]) {
            if (Array.isArray(data[catKey][typeKey])) {
              transformed[catKey.toUpperCase()][typeKey.toUpperCase()] = data[catKey][typeKey].map(name => name.toUpperCase());
            } else {
              transformed[catKey.toUpperCase()][typeKey.toUpperCase()] = [];
            }
        }
    }
    return transformed;
}

function setupUppercaseListeners() {
    const inputToListen = document.querySelectorAll('input[type="text"]');
    inputToListen.forEach(input => {
        input.addEventListener('input', function() {
            this.value = this.value.toUpperCase();
        });
    });
}

function cleanProductList(productList) {
    const excludedKeywords = [
        'TIDAK DIPAKAI', 'TIDAK DIGUNAKAN', 'NON AKTIF'
    ];

    // productList sekarang berisi array of string (nama barang)
    return productList.filter(productName => {
        const isExcluded = excludedKeywords.some(keyword =>
            productName.includes(keyword)
        );
        return !isExcluded;
    });
}

/**
 * Logika pencarian yang mempersempit (AND logic): mengembalikan TRUE jika nama barang
 * mengandung SEMUA token dari input user.
 */
function flexibleSearch(name, input) {
    if (!input || input.length === 0) return false;

    // Pisahkan input user menjadi token, ubah ke UPPERCASE (karena nama juga UPPERCASE), dan filter token kosong
    const searchTokens = input.split(/\s+/).filter(token => token.length > 0);

    if (searchTokens.length === 0) return false;
    
    // Menggunakan .every() untuk logika AND.
    return searchTokens.every(token => {
        return name.includes(token);
    });
}

function handleLogout() {
    if (confirm('Anda yakin ingin keluar dan mengganti user?')) {
        localStorage.removeItem('activeUser');
        localStorage.removeItem('transactionMode');
        // 🔥 Hapus juga cache data inventory saat logout
        localStorage.removeItem(INVENTORY_CACHE_KEY);
        localStorage.removeItem(CACHE_TIMESTAMP_KEY);
        window.location.href = 'index.html';
    }
}


// =================================================================
// FUNGSI QR SCANNER (BARU)
// =================================================================
function setupQRScanner() {
    if (qrScannerToggle) {
        qrScannerToggle.addEventListener('click', toggleQRScanner);
    }
    
    // 🔥 Logika dummy/minimalis untuk menginisialisasi scanner (Perlu library QuaggaJS/sejenisnya di HTML)
    // Di lingkungan nyata, di sini Anda akan memanggil inisialisasi library scanner
    // dan menetapkan event listener untuk hasil scan (onDetected).
    window.Quagga = window.Quagga || {
        init: (config, callback) => { 
            console.log("Quagga.init dipanggil (dummy)"); 
            callback(); 
        },
        start: () => { 
            console.log("Quagga.start dipanggil (dummy)"); 
            qrScannerContainer.innerHTML = '<div class="scanner-placeholder">🎥 QR/Barcode Scanner Aktif (Integrasi QuaggaJS)</div>';
        },
        stop: () => { 
            console.log("Quagga.stop dipanggil (dummy)"); 
            qrScannerContainer.innerHTML = '';
        },
        onDetected: (callback) => { 
            // Ini adalah tempat di mana hasil scan akan diproses
            console.log("Quagga.onDetected terpasang (dummy)");
            // Untuk demo, kita bisa panggil callback setelah beberapa detik
            // setTimeout(() => {
            //     callback({ codeResult: { code: 'LOKASI-A1' } });
            // }, 3000);
        }
    };
    
    // Contoh untuk mensimulasikan hasil scan
    window.Quagga.onDetected(data => {
        // HANYA LOKASI yang diisi dari QR/Barcode
        const scannedCode = data.codeResult.code.toUpperCase();
        lokasiInput.value = scannedCode;
        displayMessage(`✅ Lokasi terdeteksi: **${scannedCode}**. Matikan scanner untuk melanjutkan.`, 'success');
        
        toggleQRScanner(); // Matikan scanner setelah berhasil
    });
}

function toggleQRScanner() {
    const isHidden = qrScannerContainer.classList.contains('hidden');
    
    if (isHidden) {
        // Aktifkan scanner
        qrScannerContainer.classList.remove('hidden');
        qrScannerToggle.textContent = '❌ Tutup Scanner';
        
        // Mulai QuaggaJS
        window.Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: qrScannerContainer,
                constraints: {
                    facingMode: "environment" // Gunakan kamera belakang
                },
            },
            decoder: {
                readers: ["code_128_reader", "ean_reader", "upc_reader", "code_39_reader", "qr_code_reader"] // Semua jenis barcode/QR
            },
            locate: true, // Untuk sensitivitas tinggi
        }, (err) => {
            if (err) {
                console.error("Gagal inisialisasi scanner:", err);
                displayMessage('❌ Gagal mengaktifkan kamera: ' + err.message, 'error');
                qrScannerContainer.classList.add('hidden');
                qrScannerToggle.textContent = '📷 QR Scanner';
                return;
            }
            window.Quagga.start();
        });
        
    } else {
        // Matikan scanner
        window.Quagga.stop();
        qrScannerContainer.classList.add('hidden');
        qrScannerToggle.textContent = '📷 QR Scanner';
    }
}


// =================================================================
// FUNGSI EVENT LISTENERS DAN LOGIC APLIKASI
// =================================================================
function setupEventListeners() {
    categoryButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const selectedCategory = e.currentTarget.getAttribute('data-category');
            
            if (Object.keys(inventoryDataCache).length === 0) {
                return displayMessage('⏳ Data inventory sedang dimuat. Harap tunggu.', 'loading');
            }
            
            // Toggle active state
            if (currentCategory === selectedCategory && e.currentTarget.classList.contains('active')) {
                // Jika kategori yang sama diklik lagi (nonaktifkan)
                currentCategory = '';
                kategoriInput.value = '';
                currentCategoryData = {};
                categoryButtons.forEach(btn => btn.classList.remove('active'));
                
                // 🔥 Kembali ke mode Pencarian Lintas Kategori Global
                updateJenisProdukAndProductCache(inventoryDataCache, true); 
                jenisProdukSelect.disabled = true;
                namaBarangInput.value = '';
                displayMessage('Pencarian Lintas Kategori Aktif. Pilih kategori untuk memfilter.');
                return;
            }

            // Aktifkan kategori baru
            categoryButtons.forEach(btn => btn.classList.remove('active'));
            e.currentTarget.classList.add('active');

            currentCategory = selectedCategory;
            kategoriInput.value = selectedCategory;
            currentCategoryData = inventoryDataCache[selectedCategory] || {};
            
            // Memanggil fungsi untuk mengisi dropdown Jenis dan cache nama produk (Hanya Kategori yang dipilih)
            // Cache hanya berisi produk dari kategori yang dipilih
            updateJenisProdukAndProductCache(currentCategoryData, false); 
            
            // Fokuskan ke input nama barang (AUTO FOKUS DIMATIKAN)
            namaBarangInput.disabled = false;
            // namaBarangInput.focus(); // 🔥 1. AUTO FOKUS DIMATIKAN
        });
    });

    // Event listener change jenisProdukSelect untuk memfilter live search
    jenisProdukSelect.addEventListener('change', (e) => {
        const selectedJenis = e.target.value;
        namaBarangInput.value = ''; // Kosongkan nama barang agar filter baru berlaku
        autocompleteList.innerHTML = '';
        autocompleteList.style.display = 'none';
        appBody.style.overflow = '';
        currentFocus = -1;

        // Lokasi selalu wajib dan terlihat
        lokasiInputGroup.classList.remove('hidden');
        lokasiInput.required = true;

        if (selectedJenis) {
            displayMessage(`Jenis Produk: **${selectedJenis}** dipilih. Ketik Nama Barang untuk mencari dalam jenis ini.`);
        } else if (currentCategory) {
            displayMessage(`Pencarian Lintas Jenis Produk dalam kategori **${currentCategory}** aktif.`);
        } else {
             displayMessage(`Pencarian Lintas Kategori Global aktif.`);
        }
    });

    // Pencarian Lintas Jenis Produk dalam Kategori
    namaBarangInput.addEventListener('input', () => {
        const input = namaBarangInput.value.trim().toUpperCase();
        autocompleteList.innerHTML = '';
        autocompleteList.style.display = 'none';
        currentFocus = -1;
        appBody.style.overflow = '';

        if (input.length === 0) {
            return;
        }

        const selectedJenis = jenisProdukSelect.value.trim(); // 🔥 Ambil jenis yang dipilih
        
        // productNamesCache berisi objek: { name: 'NAMA PRODUK', type: 'JENIS PRODUK', category: 'KATEGORI' }
        const matches = productNamesCache.filter(item => {
            // Logika filter
            const categoryMatch = currentCategory === '' || item.category === currentCategory;
            const typeMatch = selectedJenis === '' || item.type === selectedJenis;
            const searchMatch = flexibleSearch(item.name, input);
            
            return categoryMatch && typeMatch && searchMatch;
        }).slice(0, 10);

        matches.forEach(item => {
            const el = document.createElement('div');
            el.classList.add('autocomplete-item');

            // Tampilkan Nama Barang ASLI + Jenis Produk + Kategori
            const categoryDisplay = currentCategory === '' ? `[${item.category}] ` : ''; // Tampilkan kategori jika mode global
            
            // Hanya Nama Barang dan Kategori (jika global)
            el.innerHTML = `${categoryDisplay}${item.name}`; 

            el.setAttribute('data-name', item.name);
            el.setAttribute('data-type', item.type);
            el.setAttribute('data-category', item.category); // Simpan kategori

            el.addEventListener('click', function() {
                const selectedName = this.getAttribute('data-name');
                const selectedType = this.getAttribute('data-type');
                const selectedCategory = this.getAttribute('data-category');
                
                namaBarangInput.value = selectedName; 
                
                // LOGIC UTAMA: Mengisi dropdown Jenis Produk & Kategori secara otomatis
                jenisProdukSelect.value = selectedType;
                
                // 💡 PERUBAHAN BARU: Selalu set/update kategori yang dipilih dan aktifkan tombolnya
                currentCategory = selectedCategory;
                kategoriInput.value = selectedCategory;
                currentCategoryData = inventoryDataCache[selectedCategory] || {};
                
                // Panggil update cache untuk mengunci kategori dan jenis produknya
                // Ini memastikan dropdown jenis produk terisi (jika sebelumnya kosong)
                updateJenisProdukAndProductCache(currentCategoryData, false); 
                jenisProdukSelect.value = selectedType; // Set ulang nilai jenis produk setelah dropdown diisi

                // Aktifkan tombol kategori di UI
                categoryButtons.forEach(btn => {
                    btn.classList.remove('active');
                    if (btn.getAttribute('data-category') === selectedCategory) {
                        btn.classList.add('active');
                    }
                });
                
                autocompleteList.innerHTML = '';
                autocompleteList.style.display = 'none';
                appBody.style.overflow = '';
                displayMessage(`Barang **${selectedName}** dari Jenis **${selectedType}** Kategori **${selectedCategory}** dipilih. Isi Jumlah & Lokasi.`);

                // 🔥 1. AUTO FOKUS DIMATIKAN
                // if (lokasiInput) {
                //     lokasiInput.focus();
                // }
            });
            autocompleteList.appendChild(el);
        });

        if (matches.length > 0) {
            autocompleteList.style.display = 'block';
            appBody.style.overflow = 'hidden';
        }
    });

    namaBarangInput.addEventListener('keydown', function(e) {
        let x = document.getElementById('autocomplete-list');
        if (x) x = x.getElementsByTagName('div');
        if (e.keyCode === 40) { // Panah Bawah
            currentFocus++;
            addActive(x);
        } else if (e.keyCode === 38) { // Panah Atas
            currentFocus--;
            addActive(x);
        } else if (e.keyCode === 13) { // Enter
            e.preventDefault();
            if (currentFocus > -1) {
                // Klik item autocomplete yang aktif (akan memicu pengisian jenis/kategori)
                if (x && x[currentFocus]) {
                    x[currentFocus].click();
                }
            } else if (namaBarangInput.value.trim() !== '') {
                // Jika tidak ada autocomplete yang aktif, tapi ada isi, pindah fokus ke Lokasi
                // lokasiInput.focus(); // 🔥 1. AUTO FOKUS DIMATIKAN
            }
        }
    });

    // PERBAIKAN: Validasi kolom WAJIB sebelum submit dengan Enter di Keterangan
    checkerInput.addEventListener('keydown', function(e) {
        if (e.keyCode === 13) { // Enter
            e.preventDefault();
            
            // Cek apakah kolom WAJIB sudah terisi
            const isRequiredFieldsFilled = 
                kategoriInput.value.trim() !== '' &&
                jenisProdukSelect.value.trim() !== '' && // Jenis Produk harus terisi (otomatis atau manual)
                namaBarangInput.value.trim() !== '' &&
                jumlahInput.value.trim() !== '' &&
                lokasiInput.value.trim() !== ''; // 🔥 PERUBAHAN: Lokasi selalu wajib

            if (isRequiredFieldsFilled) {
                const submitButton = currentMode === 'Masuk' ? masukButton : keluarButton;
                submitButton.click();
            } else {
                displayMessage('❌ Harap isi semua kolom wajib (Kategori, Jenis, Nama, Jumlah, dan Lokasi).', 'error');
            }
        }
    });
    // --- END PERBAIKAN ENTER

    function addActive(x) {
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add('autocomplete-active');
        x[currentFocus].scrollIntoView({ block: 'nearest' });
    }

    function removeActive(x) {
        for (let i = 0; i < x.length; i++) {
            x[i].classList.remove('autocomplete-active');
        }
    }

    document.addEventListener('click', (e) => {
        if (!e.target.matches('#namaBarang') && !e.target.closest('.autocomplete-container')) {
            autocompleteList.style.display = 'none';
            appBody.style.overflow = '';
        }
    });

    // Ganti event listener submit untuk menggunakan Antrian
    masukButton.addEventListener('click', (e) => handleFormSubmit(e, 'Masuk'));
    keluarButton.addEventListener('click', (e) => handleFormSubmit(e, 'Keluar'));

    fabToggle.addEventListener('click', toggleMode);
    
    // EVENT LISTENER BARU UNTUK TOMBOL LOGOUT
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
}

/**
 * FUNGSI MODIFIKASI: Mengisi dropdown Jenis Produk dan mengumpulkan semua nama barang
 * ke dalam productNamesCache untuk pencarian.
 * @param {object} data - Data inventori, bisa per kategori atau seluruhnya
 * @param {boolean} isGlobal - true jika memuat semua data (lintas kategori), false jika per kategori
 */
function updateJenisProdukAndProductCache(data, isGlobal) {
    jenisProdukSelect.innerHTML = '<option value="">-- Pilih Jenis Produk --</option>';

    // 💡 PERUBAHAN BARU: Simpan nilai namaBarang sebelum direset
    const tempNamaBarang = namaBarangInput.value;
    
    // 🔥 Jika mode global (isGlobal=true), jenis produk tidak akan diaktifkan/diisi
    if (!isGlobal) {
        const jenisProdukList = Object.keys(data).sort();

        // 1. Isi Dropdown Jenis Produk (Hanya jika tidak global)
        if (jenisProdukList.length > 0) {
            jenisProdukList.forEach(jenisProduk => {
                jenisProdukSelect.innerHTML += `<option value="${jenisProduk}">${jenisProduk}</option>`;
            });
            jenisProdukSelect.disabled = false; // Aktifkan jika ada kategori
            displayMessage('Pilih Jenis Produk, atau langsung ketik Nama Barang untuk mencari.');
        } else {
            jenisProdukSelect.innerHTML = '<option value="">-- Tidak ada Jenis Produk ditemukan --</option>';
            jenisProdukSelect.disabled = true;
            displayMessage(`⚠️ Tidak ada Jenis Produk ditemukan untuk kategori **${currentCategory}**.`);
        }
    } else {
        jenisProdukSelect.disabled = true; // Dinonaktifkan di mode global
        displayMessage('Pencarian Lintas Kategori Aktif. Ketik Nama Barang atau Pilih Kategori.');
    }
    
    // Lokasi selalu wajib dan terlihat
    lokasiInputGroup.classList.remove('hidden');
    lokasiInput.required = true;

    // Hanya kembalikan nilai nama barang JIKA itu tidak kosong (mode pencarian berlanjut)
    namaBarangInput.value = tempNamaBarang; 
    autocompleteList.style.display = 'none';
    namaBarangInput.disabled = false;
    appBody.style.overflow = '';


    // 2. Kumpulkan Semua Nama Produk ke dalam Cache (berdasarkan data yang masuk)
    productNamesCache = []; // Reset cache
    
    const dataToCache = isGlobal ? data : { [currentCategory]: data }; // Jika tidak global, bungkus data dalam kategori

    for (const catKey in dataToCache) {
        const categoryData = isGlobal ? dataToCache[catKey] : dataToCache[currentCategory];
        
        for (const type in categoryData) {
            const rawList = categoryData[type] || [];
            const cleanedList = cleanProductList(rawList);
            cleanedList.forEach(name => {
                // Simpan nama barang, jenis, dan kategorinya
                productNamesCache.push({ name: name, type: type, category: catKey });
            });
        }
        if (!isGlobal) break; // Keluar dari loop jika tidak global (hanya perlu 1 kategori)
    }
}


function toggleMode() {
    const newMode = currentMode === 'Masuk' ? 'Keluar' : 'Masuk';
    currentMode = newMode;
    // PENTING: Simpan mode baru ke Local Storage setelah diubah
    localStorage.setItem('transactionMode', newMode);
    updateUIMode(newMode);

    displayMessage(`Mode transaksi diubah ke **${newMode.toUpperCase()}**.`);
}

function updateUIMode(mode) {
    modeStatusDiv.textContent = `INVENTORY - ${mode.toUpperCase()}`;

    if (mode === 'Masuk') {
        appBody.classList.remove('mode-keluar');
        appBody.classList.add('mode-masuk');
        masukButton.classList.remove('hidden');
        keluarButton.classList.add('hidden');
        fabToggle.innerHTML = '<i class="fas fa-exchange-alt"></i> Ganti ke KELUAR';
        fabToggle.style.backgroundColor = 'var(--danger-color)';
        // LOKASI SELALU TERLIHAT DAN WAJIB
        lokasiInputGroup.classList.remove('hidden');
        lokasiInput.required = true;
    } else { // Mode Keluar
        appBody.classList.remove('mode-masuk');
        appBody.classList.add('mode-keluar');
        masukButton.classList.add('hidden');
        keluarButton.classList.remove('hidden');
        fabToggle.innerHTML = '<i class="fas fa-exchange-alt"></i> Ganti ke MASUK';
        fabToggle.style.backgroundColor = 'var(--success-color)';
        // LOKASI SELALU TERLIHAT DAN WAJIB
        lokasiInputGroup.classList.remove('hidden');
        lokasiInput.required = true;
    }
}

// FUNGSI BARU: Mendapatkan nama sheet tujuan berdasarkan kategori
function getTargetSheetName(category) {
    switch (category) {
        case 'BESI':
            return 'Input Besi';
        case 'KERAMIK':
            return 'Input Keramik';
        case 'LT 2':
            return 'LT2';
        case 'GM':
            return 'GM';
        default:
            return ''; // Mengembalikan string kosong jika kategori tidak valid
    }
}

// 🔥 FUNGSI BARU: Memproses Antrian Pengiriman - DIMODIFIKASI
async function processQueue() {
    if (isProcessingQueue || submissionQueue.length === 0) {
        return;
    }

    isProcessingQueue = true;
    
    // Ambil data dari antrian (FIFO)
    const queueItem = submissionQueue.shift();
    const { dataToSend, action } = queueItem;

    // Kirim data dan tunggu hingga selesai
    const success = await sendDataToBackend(dataToSend, action);

    isProcessingQueue = false;
    
    if (!success) {
        // Jika GAGAL, proses antrian dihentikan.
        // Data sudah dikembalikan ke form oleh sendDataToBackend.
        return; 
    }

    // Lanjutkan ke item berikutnya di antrian
    if (submissionQueue.length > 0) {
        processQueue();
    } else {
        // Jika antrian kosong, berikan pesan berhasil total
        displayMessage('✅ Semua data transaksi berhasil diproses! Siap untuk input berikutnya.', 'success');
    }
}

// 🔥 FUNGSI UTAMA UNTUK MENGAMBIL DATA & MEMASUKKAN KE ANTRIAN - DIMODIFIKASI
async function handleFormSubmit(e, action) {
    e.preventDefault();
    
    // 🔥 PENCEGAHAN DOUBLE SUBMISSION
    if (isSubmitting) {
        return displayMessage('⏳ Sedang memproses pengiriman sebelumnya. Harap tunggu sebentar.', 'loading');
    }
    isSubmitting = true; // Set flag submitting

    if (action !== currentMode) {
        isSubmitting = false; // Reset flag jika ada validasi awal gagal
        displayMessage(`❌ Mode saat ini adalah **${currentMode.toUpperCase()}**. Klik tombol FAB untuk mengganti.`, 'error');
        return;
    }

    const kategori = kategoriInput.value.trim();
    const targetSheet = getTargetSheetName(kategori);

    if (targetSheet === '') {
        isSubmitting = false; // Reset flag jika ada validasi awal gagal
        return displayMessage('❌ Kategori tidak valid. Gagal menentukan sheet tujuan. Pastikan Kategori dan Jenis Produk telah dipilih/terisi.', 'error');
    }
    
    // Karena kategori sudah terisi (dari tombol atau autocomplete), maka currentCategoryData harus ada
    if (!Object.keys(currentCategoryData).length) {
        isSubmitting = false; // Reset flag jika ada validasi awal gagal
        // Ini terjadi jika user langsung mengetik nama barang di mode global, tapi belum klik/pilih
        return displayMessage('❌ Data kategori belum dimuat dengan benar. Silakan pilih kembali kategori atau item dari live search.', 'error');
    }

    const keteranganInput = checkerInput.value.trim();

    // =============== Ambil dan Validasi Data Formulir ===============
    const dataToSend = {
        targetSheet: targetSheet,
        kategori: kategori,
        jenisProduk: jenisProdukSelect.value.trim(),
        namaBarang: namaBarangInput.value.trim(),
        checker: activeUser,
        lokasi: lokasiInput.value.trim(),
        formatSimpan: keteranganInput,
        masukIn: (action === 'Masuk' ? jumlahInput.value.trim() : ''),
        keluarOut: (action === 'Keluar' ? jumlahInput.value.trim() : '')
    };

    // Validasi dasar
    if (!dataToSend.kategori || !dataToSend.jenisProduk || !dataToSend.namaBarang || !dataToSend.checker || (!dataToSend.masukIn && !dataToSend.keluarOut) || !dataToSend.lokasi) {
        isSubmitting = false; // Reset flag jika ada validasi awal gagal
        return displayMessage('❌ Semua kolom wajib harus diisi.', 'error');
    }
    
    // Validasi tambahan untuk Jumlah
    if (parseFloat(jumlahInput.value) <= 0 || jumlahInput.value.trim() === '') {
        isSubmitting = false; // Reset flag jika ada validasi awal gagal
        return displayMessage('❌ Jumlah harus berupa angka positif.', 'error');
    }
    // ==========================================================
    
    // 🔥 Masukkan data ke antrian dan segera mulai pemrosesan
    submissionQueue.push({ dataToSend, action });
    displayMessage(`Data ditambahkan ke antrian (${submissionQueue.length} transaksi tertunda)...`, 'info');
    processQueue();
    
    isSubmitting = false; // Reset flag setelah data berhasil masuk ke antrian dan prosesQueue() dipanggil
}

// 🔥 FUNGSI BARU: Logika Pengiriman Data ke Backend (Antri) - DIMODIFIKASI
async function sendDataToBackend(dataToSend, action) {
    const targetSheet = dataToSend.targetSheet;
    
    // Simpan KATEGORI yang sudah dipilih agar tetap aktif dan simpan data sebelum reset
    const tempKategori = kategoriInput.value;
    const selectedCategory = currentCategory;
    const tempJenisProduk = jenisProdukSelect.value;
    const tempNamaBarang = namaBarangInput.value;

    // 1. Reset Form Input (Ini dilakukan terlepas dari sukses/gagal untuk meminimalkan waktu tunggu user)
    jumlahInput.value = '';
    checkerInput.value = '';
    lokasiInput.value = '';
    namaBarangInput.value = ''; // KOSONGKAN Nama Barang
    jenisProdukSelect.value = ''; // KOSONGKAN Jenis Produk (set ke placeholder option)
    autocompleteList.style.display = 'none';
    namaBarangInput.disabled = false;
    
    // KATEGORI HARUS TETAP AKTIF/TERPILIH
    kategoriInput.value = tempKategori; // Pertahankan Kategori di input hidden
    currentCategory = selectedCategory; // Pertahankan state kategori (currentCategory)

    // 2. Isi Ulang Cache Data Barang yang tersedia saat ini.
    const cacheDataForReload = currentCategory ? currentCategoryData : inventoryDataCache;
    const isGlobalReload = !currentCategory;
    
    // Panggil update cache. Karena namaBarangInput.value sudah kosong, update cache akan mengembalikan nilai kosong.
    updateJenisProdukAndProductCache(cacheDataForReload, isGlobalReload); 
    
    // Setelah updateJenisProdukAndProductCache, pastikan Jenis Produk tetap kosong
    jenisProdukSelect.value = tempJenisProduk; // 🔥 Simpan Jenis Produk yang sama sebelum pengiriman

    // 🔥 PERUBAHAN UTAMA: SET FOKUS KE NAMA BARANG
    namaBarangInput.focus();
    // ------------------------------------------

    // 3. Tampilkan pesan sedang antri/mengirim
    displayMessage(`⏳ Data Barang **${action.toUpperCase()}** ke sheet **${targetSheet}** sedang dikirim di latar belakang...`, 'loading');

    const urlEncodedData = Object.keys(dataToSend).map(key =>
        encodeURIComponent(key) + '=' + encodeURIComponent(dataToSend[key])
    ).join('&');
    
    // Lakukan FETCH (proses simpan yang sebenarnya)
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: urlEncodedData,
        });

        const result = await response.json();

        if (result.status === 'success') {
             // Pesan akan muncul setelah queue selesai (di processQueue)
             return true; // Beri sinyal sukses

        } else {
            // 🔥 LOGIKA PENGEMBALIAN DATA JIKA GAGAL (SERVER ERROR)
            console.error('Data Gagal disimpan:', dataToSend, result.error);
            displayMessage('❌ Gagal menyimpan data: ' + (result.error || 'Terjadi kesalahan tidak diketahui. **Data dikembalikan ke form**.'), 'error');
            
            // Kembalikan nilai-nilai ke form agar user bisa coba lagi
            namaBarangInput.value = dataToSend.namaBarang;
            jenisProdukSelect.value = dataToSend.jenisProduk;
            jumlahInput.value = action === 'Masuk' ? dataToSend.masukIn : dataToSend.keluarOut;
            lokasiInput.value = dataToSend.lokasi;
            checkerInput.value = dataToSend.formatSimpan;
            
            namaBarangInput.focus(); // Fokuskan kembali ke nama barang
            
            return false; // Beri sinyal gagal
        }
    } catch (error) {
        // 🔥 LOGIKA PENGEMBALIAN DATA JIKA GAGAL (NETWORK ERROR)
        console.error('Submit error (Jaringan):', error);
        displayMessage('❌ Terjadi kesalahan jaringan/server. Data mungkin gagal disimpan. **Data dikembalikan ke form**.', 'error');
        
        // Kembalikan nilai-nilai ke form agar user bisa coba lagi
        namaBarangInput.value = dataToSend.namaBarang;
        jenisProdukSelect.value = dataToSend.jenisProduk;
        jumlahInput.value = action === 'Masuk' ? dataToSend.masukIn : dataToSend.keluarOut;
        lokasiInput.value = dataToSend.lokasi;
        checkerInput.value = dataToSend.formatSimpan;
        
        namaBarangInput.focus(); // Fokuskan kembali ke nama barang
        
        return false; // Beri sinyal gagal
    }
}


function displayMessage(message, type = 'info') {
    messageArea.classList.remove('show', 'success', 'error', 'loading');

    if (type === 'success' || type === 'error' || type === 'loading') {
        messageArea.className = `message ${type}`;
        messageArea.innerHTML = message;

        if (type === 'success') messageArea.classList.add('success');
        if (type === 'error') messageArea.classList.add('error');
        if (type === 'loading') messageArea.classList.add('loading');

        setTimeout(() => {
            messageArea.classList.add('show');
        }, 10);

        // Jika tipe bukan 'loading', atur waktu untuk menghilangkannya
        if (type !== 'loading') {
            setTimeout(() => {
                messageArea.classList.remove('show');
            }, 5000);
        }
    } else {
        messageArea.innerHTML = message;
        messageArea.classList.add('show');
        setTimeout(() => {
            messageArea.classList.remove('show');
        }, 3000);
    }
}