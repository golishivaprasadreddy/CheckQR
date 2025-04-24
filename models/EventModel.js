const mongoose = require("mongoose");

const EventSchema = new mongoose.Schema({
    eventName: { type: String, required: true, unique: true },
    attendanceMarked: { type: Boolean, default: false }, // Flag to prevent multiple updates
});

module.exports = mongoose.model("Event", EventSchema);