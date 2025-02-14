const mongoose = require("mongoose");

const QRSchema = new mongoose.Schema({
    userHash: { type: String, unique: true, required: true },
    qrCodeUrl: { type: String, required: true }
});

module.exports = mongoose.model("QRModel", QRSchema);