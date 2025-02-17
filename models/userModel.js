const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, unique: true, required: true }, // ✅ Unique email
    password: { type: String, required: true }
}, { timestamps: true }); // ✅ Adds `createdAt` & `updatedAt`

const User = mongoose.model("User", UserSchema);
module.exports = User;
