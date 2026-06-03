<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header('Content-Type: application/json');

// Jangan batasi waktu eksekusi PHP
set_time_limit(150);

$google_script_url = "https://script.google.com/macros/s/AKfycbwJ_uCzzwazBE5PGOrXPy4HddMvjxPNELVBkvLa-5366da9q8Jhlgz19tUQtBYh68-C/exec";

// Update pada bagian IF POST di process.php
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    $data = $_POST['data'] ?? ''; // Ini berisi JSON string dari script.js

    $payload = [
        'action' => $action,
        'data' => $data
    ];

    $ch = curl_init($google_script_url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($payload));
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    
    // Timeout koneksi ditingkatkan menjadi 120 detik
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 60);
    curl_setopt($ch, CURLOPT_TIMEOUT, 120);

    $response = curl_exec($ch);
    
    if (curl_errno($ch)) {
        echo json_encode(['status' => 'error', 'message' => curl_error($ch)]);
    } else {
        echo $response;
    }
    curl_close($ch);
}
?>