const mongoose = require("mongoose");

const QRSchema = new mongoose.Schema({
    userHash: { type: String, unique: true },
    qrCodeUrl: String,
});

module.exports = mongoose.model("QRCode", QRSchema);
