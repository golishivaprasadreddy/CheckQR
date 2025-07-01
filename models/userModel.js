const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema({
    fileName: { type: String, required: true },
    eventName: { type: String, required: true },
    timestamp: { type: String, required: true },
    fileData: { type: String, required: true }, // Base64-encoded file data
    fileType: { type: String, required: true }  // MIME type of the file
});

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    files: [FileSchema]
}, { timestamps: true });

const UserModel = mongoose.model("User", UserSchema);
module.exports = UserModel;