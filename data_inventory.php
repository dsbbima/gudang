<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

/**
 * Server hosting mengalami kendala koneksi keluar (Error 0/CURL blocked).
 * Data sekarang ditarik langsung oleh browser pengguna melalui script.js
 */
echo json_encode([
    "status" => "ready",
    "method" => "client_side_fetch",
    "message" => "Sistem dialihkan ke pengambilan data langsung dari Google API"
]);
?>