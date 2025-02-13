const mongoose = require("mongoose");

const QRSchema = new mongoose.Schema({
    text: { type: String, required: true, unique: true }
});

module.exports = mongoose.model("QR", QRSchema);
