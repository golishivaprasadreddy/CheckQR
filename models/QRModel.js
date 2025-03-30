const mongoose = require("mongoose");

const QRSchema = new mongoose.Schema({
    rollNo: { type: String, unique: true, required: true },
    userHash: { type: String, unique: true, required: true },
    qrCodeUrl: { type: String, required: true }
});

module.exports = mongoose.model("QR", QRSchema);
