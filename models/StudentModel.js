const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema({
    rollNo: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    department: { type: String, required: true },
    college: { type: String, required: true },
    section: { type: String, required: true },
    batchYear: { type: String, required: true },
    events: { type: Map, of: String }, // Map to store event attendance (eventName: "absent" or "present")
});

module.exports = mongoose.model("Student", StudentSchema);